import cron from "node-cron";
import { and, eq, gte, lte, lt, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { addMinutes, startOfDay } from "../lib/dates.js";
import { tzStartOfDay } from "../lib/tz.js";
import { telegram } from "../bot/telegram.js";
import { computeDailyStats, getDayOverview } from "./analytics.js";

/**
 * ReminderScheduler — scans for due reminders and unresolved sessions.
 * Runs every minute. Decoupled from the bot so a bot outage doesn't lose events.
 */
export class ReminderScheduler {
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;

    cron.schedule("* * * * *", () => this.tick().catch((e) => logger.error("reminder tick failed:", (e as Error).message)));
    logger.info("Reminder scheduler started (every minute)");

    // once an hour: daily stats refresh + daily report at end of day
    cron.schedule("*/15 * * * *", () => this.refreshStats().catch(() => undefined));

    // Daily report ~9:30 PM (honest day-end accountability)
    cron.schedule("30 21 * * *", () => this.sendDailyReport().catch((e) => logger.error("daily report failed:", (e as Error).message)));

    // Weekly report Sunday 9:30 PM
    cron.schedule("30 21 * * 0", () => this.sendWeeklyReport().catch((e) => logger.error("weekly report failed:", (e as Error).message)));
  }

  async refreshStats() {
    const users = await db.selectDistinct({ id: schema.users.id }).from(schema.users);
    for (const u of users) {
      await computeDailyStats(u.id, new Date()).catch(() => undefined);
    }
  }

  async sendDailyReport() {
    const users = await db.selectDistinct({ id: schema.users.id }).from(schema.users);
    for (const u of users) {
      await telegram.sendDailyReport(u.id).catch((e) => logger.error("daily report:", (e as Error).message));
    }
  }

  async sendWeeklyReport() {
    const users = await db.selectDistinct({ id: schema.users.id }).from(schema.users);
    for (const u of users) {
      await telegram.sendWeeklyReport(u.id).catch((e) => logger.error("weekly report:", (e as Error).message));
    }
  }

  async tick() {
    const now = new Date();

    // 1. Fire due reminders (snoozes, followups)
    const due = await db
      .select()
      .from(schema.reminders)
      .where(and(eq(schema.reminders.fired, false), lte(schema.reminders.fireAt, now)))
      .limit(20);

    for (const r of due) {
      const [session] = r.sessionId ? await db.select().from(schema.studySessions).where(eq(schema.studySessions.id, r.sessionId)).limit(1) : [null];
      if (r.type === "snooze" && session) {
        await telegram.sendSessionReminder(session);
      }
      await db.update(schema.reminders).set({ fired: true, firedAt: now }).where(eq(schema.reminders.id, r.id));
    }

    // 2. Escalation: scheduled sessions that are late (fire at planned start, +5, +15, then every 10m until resolved)
    const [settings] = await db.select().from(schema.settings).limit(1);
    const tz = settings?.timezone ?? "Asia/Kolkata";
    const todayStart = tzStartOfDay(now, tz);
    const dayEnd = addMinutes(todayStart, 24 * 60);
    const late = await db
      .select()
      .from(schema.studySessions)
      .where(
        and(
          eq(schema.studySessions.status, "scheduled"),
          lt(schema.studySessions.plannedStart, now),
          gte(schema.studySessions.plannedStart, todayStart)
        )
      );

    for (const s of late) {
      const delayMin = Math.round((now.getTime() - s.plannedStart!.getTime()) / 60000);
      // reminder at 0-2m, +5m, +15m, then every 15m up to 3 reminders per window
      const dueAt = [0, 5, 15, 30, 45, 60, 75, 90];
      const point = dueAt.filter((m) => delayMin >= m && delayMin < m + 15);
      if (point.length === 0) continue;

      // only remind if not already reminded in the last 10 minutes for this session
      const recent = await db
        .select()
        .from(schema.coachMessages)
        .where(and(eq(schema.coachMessages.sessionId, s.id), eq(schema.coachMessages.kind, "reminder"), gte(schema.coachMessages.createdAt, addMinutes(now, -10))))
        .limit(1);
      if (recent.length) continue;

      await telegram.sendSessionReminder(s);
      await db.insert(schema.coachMessages).values({
        userId: s.userId,
        sessionId: s.id,
        channel: "telegram",
        kind: "reminder",
        message: `session-reminder delay=${delayMin}m`,
      });
      await db.insert(schema.procrastinationEvents).values({
        userId: s.userId,
        sessionId: s.id,
        type: "ignored-reminder",
        detail: `ignored reminder at +${delayMin}m`,
      });
    }
  }
}

export const reminderScheduler = new ReminderScheduler();