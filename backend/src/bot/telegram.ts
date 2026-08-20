import TelegramBot from "node-telegram-bot-api";
import { and, eq, gte, lt, desc } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { addMinutes, startOfDay, fmtDuration, fmtTime, progressBar } from "../lib/dates.js";
import { coach } from "../services/coach.js";
import { computeDailyStats, getDayOverview, computeWeeklyStats, analyzeProcrastination } from "../services/analytics.js";

const token = process.env.TELEGRAM_BOT_TOKEN || "";

/**
 * TelegramBotService — NUCLEAR ACCOUNTABILITY MODE.
 * Persistent reminders until the session starts / is dismissed / resolved.
 * All flows keyed to the owner chat id (verified by code the first time).
 */
export class TelegramService {
  bot: TelegramBot | null = null;
  private started = false;

  async start() {
    if (!token) {
      logger.warn("TELEGRAM_BOT_TOKEN not set — telegram disabled");
      return;
    }
    if (this.started) return;
    this.started = true;

    this.bot = new TelegramBot(token, { polling: true });
    this.bot.setMyCommands([
      { command: "start", description: "Connect & verify" },
      { command: "status", description: "Today's status" },
      { command: "study", description: "Today's plan" },
      { command: "startstudy", description: "Start next session now" },
      { command: "stop", description: "Stop active session" },
      { command: "pause", description: "Pause active session" },
      { command: "resume", description: "Resume paused session" },
      { command: "today", description: "Today's plan" },
      { command: "streak", description: "Current streak" },
      { command: "progress", description: "Weekly progress" },
      { command: "goal", description: "Daily target" },
      { command: "test", description: "Upcoming tests" },
      { command: "report", description: "Latest report" },
      { command: "settings", description: "Bot settings" },
    ]);

    this.bot.on("message", (msg) => this.handleMessage(msg));
    this.bot.on("callback_query", (q) => this.handleCallback(q));
    this.bot.on("polling_error", (e) => logger.warn("tg polling error:", (e as Error).message));

    logger.info("Telegram bot started (polling)");
  }

  private ownerChatId(): string {
    return process.env.TELEGRAM_OWNER_CHAT_ID || "";
  }

  async userIdForChat(chatId: string | number): Promise<number | null> {
    const chat = String(chatId);
    const t = await db.select().from(schema.telegramUsers).where(eq(schema.telegramUsers.chatId, chat)).limit(1);
    if (!t.length || !t[0].verified) return null;
    return t[0].userId;
  }

  async verifyOrConnect(chatId: string | number, from?: TelegramBot.User) {
    const chat = String(chatId);
    const existing = await db.select().from(schema.telegramUsers).where(eq(schema.telegramUsers.chatId, chat)).limit(1);

    // If this chat is the configured owner, auto-link to the owner user
    if (this.ownerChatId() && chat === this.ownerChatId()) {
      const [user] = await db.select().from(schema.users).limit(1);
      if (user) {
        if (existing.length) {
          await db.update(schema.telegramUsers).set({ verified: true, username: from?.username, firstName: from?.first_name, lastInteraction: new Date() }).where(eq(schema.telegramUsers.id, existing[0].id));
        } else {
          await db.insert(schema.telegramUsers).values({
            userId: user.id,
            chatId: chat,
            username: from?.username,
            firstName: from?.first_name,
            verified: true,
            lastInteraction: new Date(),
          });
        }
        await db.update(schema.settings).set({ telegramConnected: true, telegramChatId: chat }).where(eq(schema.settings.userId, user.id));
        this.send(chat, "🔗 Linked to your LOCKEDIN account.\n\nUse /status to check today. I will be persistent about your sessions.");
        return;
      }
    }

    if (existing.length && existing[0].verified) {
      return this.send(chat, "Already verified. Use /status.");
    }

    // verification flow
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    if (existing.length) {
      await db.update(schema.telegramUsers).set({ verificationCode: code }).where(eq(schema.telegramUsers.id, existing[0].id));
    } else {
      const [user] = await db.select().from(schema.users).limit(1);
      if (!user) return;
      await db.insert(schema.telegramUsers).values({ userId: user.id, chatId: chat, verificationCode: code, username: from?.username });
    }
    this.send(chat, `To connect this Telegram account to LOCKEDIN, open the app → Telegram page and enter code:\n\n<b>${code}</b>\n\nOr reply with /verify <code>`);
  }

  send(chatId: string | number, text: string, opts?: TelegramBot.SendMessageOptions) {
    if (!this.bot) return;
    return this.bot
      .sendMessage(String(chatId), text, { parse_mode: "HTML", ...opts })
      .catch((e) => logger.warn("tg send failed:", (e as Error).message));
  }

  async handleMessage(msg: TelegramBot.Message) {
    if (!msg.text) return;
    const chatId = msg.chat.id;
    const text = msg.text.trim();
    const [cmd, ...rest] = text.split(" ");

    if (!text.startsWith("/")) {
      await this.verifyOrConnect(chatId, msg.from);
      return;
    }

    switch (cmd) {
      case "/start":
        await this.verifyOrConnect(chatId, msg.from);
        break;
      case "/verify": {
        const code = rest[0];
        if (!code) return this.send(chatId, "Usage: /verify <code> (code is in the app → Telegram page)");
        const t = await db.select().from(schema.telegramUsers).where(and(eq(schema.telegramUsers.chatId, String(chatId)), eq(schema.telegramUsers.verificationCode, code))).limit(1);
        if (!t.length) return this.send(chatId, "Code not found. Open the app → Telegram page for your code.");
        await db.update(schema.telegramUsers).set({ verified: true, verificationCode: null, lastInteraction: new Date() }).where(eq(schema.telegramUsers.id, t[0].id));
        await db.update(schema.settings).set({ telegramConnected: true, telegramChatId: String(chatId) }).where(eq(schema.settings.userId, t[0].userId));
        this.send(chatId, "✅ Verified and connected.\n\nI will remind you about sessions. I will follow up. Use /settings to tune me.");
        break;
      }
      case "/status":
        await this.handleStatus(chatId);
        break;
      case "/today":
      case "/study":
        await this.handleToday(chatId);
        break;
      case "/startstudy":
        await this.handleStartStudy(chatId);
        break;
      case "/stop":
        await this.handleStop(chatId);
        break;
      case "/pause":
        await this.handlePause(chatId, true);
        break;
      case "/resume":
        await this.handlePause(chatId, false);
        break;
      case "/streak":
        await this.handleStreak(chatId);
        break;
      case "/progress":
        await this.handleProgress(chatId);
        break;
      case "/goal":
        await this.handleGoal(chatId);
        break;
      case "/test":
        await this.handleTest(chatId);
        break;
      case "/report":
        await this.handleReport(chatId);
        break;
      case "/settings":
        await this.handleSettings(chatId);
        break;
      default:
        await this.verifyOrConnect(chatId, msg.from);
    }
  }

  private async requireUser(chatId: string | number): Promise<number | null> {
    const userId = await this.userIdForChat(chatId);
    if (!userId) {
      this.send(chatId, "Not connected. Send /start to link your Telegram.");
    }
    return userId;
  }

  private async handleStatus(chatId: string | number) {
    const userId = await this.requireUser(chatId);
    if (!userId) return;
    const o = await getDayOverview(userId);
    const stats = await computeDailyStats(userId, new Date());
    const txt = `📊 <b>TODAY</b>\n\nTarget: ${fmtDuration(o.targetMinutes)}\nCompleted: ${fmtDuration(o.completedMinutes)}\nRemaining: ${fmtDuration(o.remainingMinutes)}\n\nSessions: ${o.sessionsCompleted} completed\nInterruptions: ${o.interruptions}\n\n🔥 Streak: ${o.streak} day${o.streak === 1 ? "" : "s"}`;
    this.send(chatId, txt);
  }

  private async handleToday(chatId: string | number) {
    const userId = await this.requireUser(chatId);
    if (!userId) return;
    const [plan] = await db
      .select()
      .from(schema.studyPlans)
      .where(and(eq(schema.studyPlans.userId, userId), gte(schema.studyPlans.date, startOfDay(new Date())), lt(schema.studyPlans.date, addMinutes(startOfDay(new Date()), 1440))))
      .limit(1);
    if (!plan) return this.send(chatId, "No plan generated yet for today. Open the app once to auto-generate it.");
    const blocks = (plan.schedule ?? []) as Array<{ subject: string; goal: string; start: string; end: string; minutes: number }>;
    const lines = blocks.map((b, i) => `${i + 1}. ${fmtTime(new Date(b.start))}–${fmtTime(new Date(b.end))}\n   ${b.subject} — ${b.goal}`);
    this.send(chatId, `🗓 <b>TODAY'S PLAN</b>\n\n${lines.join("\n")}`);
  }

  private async handleStartStudy(chatId: string | number) {
    const userId = await this.requireUser(chatId);
    if (!userId) return;
    const active = await db.select().from(schema.studySessions).where(and(eq(schema.studySessions.userId, userId), eq(schema.studySessions.status, "active"))).limit(1);
    if (active.length) return this.send(chatId, "A session is already running. /stop to end it.");

    const next = await db
      .select()
      .from(schema.studySessions)
      .where(and(eq(schema.studySessions.userId, userId), eq(schema.studySessions.status, "scheduled")))
      .orderBy(schema.studySessions.plannedStart)
      .limit(1);

    if (!next.length) return this.send(chatId, "No scheduled session left today. Open the app to plan one.");
    const s = next[0];
    await db.update(schema.studySessions).set({ status: "committed", actualStart: new Date(), updatedAt: new Date() }).where(eq(schema.studySessions.id, s.id));
    const msg = await coach.sessionStart(s);
    this.send(chatId, `🔥 <b>SESSION STARTED</b>\n\n${s.goal}\n${s.plannedDurationMinutes} minutes\n\n${msg}\n\nUse /pause to pause, /stop to end.\n<b>Now work.</b>`);
  }

  private async handleStop(chatId: string | number) {
    const userId = await this.requireUser(chatId);
    if (!userId) return;
    const active = await db.select().from(schema.studySessions).where(and(eq(schema.studySessions.userId, userId), eq(schema.studySessions.status, "active"))).limit(1);
    if (!active.length) return this.send(chatId, "No active session.");
    const s = active[0];
    const now = new Date();
    await db.update(schema.studySessions).set({
      status: "abandoned",
      actualEnd: now,
      quitReason: "Telegram stop",
      completedQuestions: s.completedQuestions,
      updatedAt: now,
    }).where(eq(schema.studySessions.id, s.id));
    this.send(chatId, "Session stopped and recorded.");
    await computeDailyStats(userId, now);
  }

  private async handlePause(chatId: string | number, pause: boolean) {
    const userId = await this.requireUser(chatId);
    if (!userId) return;
    const active = await db.select().from(schema.studySessions).where(and(eq(schema.studySessions.userId, userId), eq(schema.studySessions.status, pause ? "active" : "paused"))).limit(1);
    if (!active.length) return this.send(chatId, pause ? "No active session to pause." : "No paused session to resume.");
    const s = active[0];
    await db.update(schema.studySessions).set({ status: pause ? "paused" : "active", updatedAt: new Date() }).where(eq(schema.studySessions.id, s.id));
    this.send(chatId, pause ? "⏸ Paused. Timer is frozen." : "▶ Resumed. Back to work.");
  }

  private async handleStreak(chatId: string | number) {
    const userId = await this.requireUser(chatId);
    if (!userId) return;
    const o = await getDayOverview(userId);
    const [best] = await db.select().from(schema.dailyStats).where(eq(schema.dailyStats.userId, userId)).orderBy(desc(schema.dailyStats.streak)).limit(1);
    this.send(chatId, `🔥 <b>STREAK</b>\n\nCurrent: ${o.streak} day${o.streak === 1 ? "" : "s"}\nLongest: ${best?.streak ?? 0} day${(best?.streak ?? 0) === 1 ? "" : "s"}\n\nTarget today: ${fmtDuration(o.targetMinutes)}\nCompleted: ${fmtDuration(o.completedMinutes)}\n\nStreaks aren't the goal. The test is. But showing up matters.`);
  }

  private async handleProgress(chatId: string | number) {
    const userId = await this.requireUser(chatId);
    if (!userId) return;
    const ws = await computeWeeklyStats(userId, new Date());
    const pct = ws.plannedMinutes ? Math.round((ws.completedMinutes / ws.plannedMinutes) * 100) : 0;
    const txt = `📈 <b>WEEKLY</b>\n\nPlanned: ${fmtDuration(ws.plannedMinutes)}\nCompleted: ${fmtDuration(ws.completedMinutes)}\nCompletion: ${pct}%\nSessions: ${ws.sessionsCompleted}/${ws.sessionsPlanned}\nMissed: ${ws.sessionsMissed}\nAvg focus: ${ws.avgFocusMinutes}%\n\nMain issue: ${ws.mainIssue ?? "n/a"}`;
    this.send(chatId, txt);
  }

  private async handleGoal(chatId: string | number) {
    const userId = await this.requireUser(chatId);
    if (!userId) return;
    const [settings] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId)).limit(1);
    this.send(chatId, `🎯 <b>GOAL</b>\n\nDaily target: ${fmtDuration(settings.dailyTargetMinutes)}\n\nMinimum 4–5 hours of real, focused study. Breaks and idle time don't count.`);
  }

  private async handleTest(chatId: string | number) {
    const userId = await this.requireUser(chatId);
    if (!userId) return;
    const tests = await db.select().from(schema.tests).where(and(eq(schema.tests.userId, userId), gte(schema.tests.date, new Date()))).orderBy(schema.tests.date).limit(5);
    if (!tests.length) return this.send(chatId, "No upcoming tests. Add them in the app (or connect Allen).");
    const lines = tests.map((t) => `${t.name} — ${fmtTime(t.date)} (${t.date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })})`);
    this.send(chatId, `📝 <b>UPCOMING TESTS</b>\n\n${lines.join("\n")}`);
  }

  private async handleReport(chatId: string | number) {
    const userId = await this.requireUser(chatId);
    if (!userId) return;
    const [daily] = await db.select().from(schema.dailyStats).where(eq(schema.dailyStats.userId, userId)).orderBy(desc(schema.dailyStats.date)).limit(1);
    const [weekly] = await db.select().from(schema.weeklyStats).where(eq(schema.weeklyStats.userId, userId)).orderBy(desc(schema.weeklyStats.weekStart)).limit(1);
    let txt = "";
    if (daily) txt += `📊 <b>LATEST DAILY</b>\nTarget: ${fmtDuration(daily.targetMinutes)}\nCompleted: ${fmtDuration(daily.completedMinutes)}\nSessions: ${daily.sessionsCompleted}/${daily.sessionsPlanned}\n\n`;
    if (weekly) {
      const pct = weekly.plannedMinutes ? Math.round((weekly.completedMinutes / weekly.plannedMinutes) * 100) : 0;
      txt += `📈 <b>LATEST WEEK</b>\nCompletion: ${pct}%\nSessions: ${weekly.sessionsCompleted}/${weekly.sessionsPlanned}\nIssue: ${weekly.mainIssue ?? "n/a"}`;
    }
    this.send(chatId, txt || "No reports yet.");
  }

  private async handleSettings(chatId: string | number) {
    const userId = await this.requireUser(chatId);
    if (!userId) return;
    const [settings] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId)).limit(1);
    this.send(chatId, `⚙️ <b>SETTINGS</b>\n\nDaily target: ${fmtDuration(settings.dailyTargetMinutes)}\nWebcam: ${settings.webcamEnabled ? "on" : "off"}\nScreen: ${settings.screenEnabled ? "on" : "off"}\nFocus lock: ${settings.focusLockEnabled ? "on" : "off"}\nMusic: ${settings.musicEnabled ? "on" : "off"}\n\nChange these in the app → Settings.`);
  }

  /** NUCLEAR escalation for a scheduled session that hasn't started. */
  async sendSessionReminder(session: typeof schema.studySessions.$inferSelect) {
    const chatId = this.ownerChatId();
    if (!chatId || !this.bot) return;
    const delayMin = Math.round((Date.now() - (session.plannedStart?.getTime() ?? Date.now())) / 60000);

    if (delayMin <= 2) {
      this.send(chatId, `🔔 <b>STUDY TIME</b>\n\n${session.goal}\n${session.plannedDurationMinutes} minutes\n\nYou're supposed to be studying.`, {
        reply_markup: { inline_keyboard: [[{ text: "🔥 START NOW", callback_data: `start_${session.id}` }, { text: "SNOOZE 5m", callback_data: `snooze_${session.id}` }]] },
      });
    } else if (delayMin < 15) {
      this.send(chatId, `⚠️ <b>You're still not studying.</b>\n\n${session.goal} — ${session.plannedDurationMinutes} min\n\nStart.`, {
        reply_markup: { inline_keyboard: [[{ text: "🔥 START NOW", callback_data: `start_${session.id}` }, { text: "SNOOZE 5m", callback_data: `snooze_${session.id}` }]] },
      });
    } else {
      const msg = await coach.procrastinationIntervention({ minutesLate: delayMin });
      this.send(chatId, `🚨 <b>You're ${delayMin} minutes late.</b>\n\nThe test isn't going to wait for you.\n\n${msg}`, {
        reply_markup: { inline_keyboard: [[{ text: "🔥 START NOW", callback_data: `start_${session.id}` }, { text: "SNOOZE 10m", callback_data: `snooze_${session.id}` }]] },
      });
    }
  }

  async sendFocusBroken(session: typeof schema.studySessions.$inferSelect) {
    const chatId = this.ownerChatId();
    if (!chatId || !this.bot) return;
    this.send(chatId, `🚨 <b>FOCUS BROKEN</b>\n\nYou left your study session.\n\n${session.goal}\n\nGet back to work.`, {
      reply_markup: { inline_keyboard: [[{ text: "▶ I'M BACK", callback_data: `back_${session.id}` }]] },
    });
  }

  async sendFocusStillBroken(session: typeof schema.studySessions.$inferSelect) {
    const chatId = this.ownerChatId();
    if (!chatId || !this.bot) return;
    this.send(chatId, `⚠️ <b>You still haven't returned.</b>\n\nYour session is running.\n\nGet back to your desk.`, {
      reply_markup: { inline_keyboard: [[{ text: "▶ I'M BACK", callback_data: `back_${session.id}` }]] },
    });
  }

  async sendSessionComplete(session: typeof schema.studySessions.$inferSelect) {
    const chatId = this.ownerChatId();
    if (!chatId || !this.bot) return;
    const msg = await coach.sessionComplete(session);
    this.send(chatId, `✅ <b>SESSION COMPLETE</b>\n\n${session.goal}\n\n${msg}`);
  }

  async sendDailyReport(userId: number) {
    const chatId = this.ownerChatId();
    if (!chatId || !this.bot) return;
    const stats = await computeDailyStats(userId, new Date());
    const pct = stats.targetMinutes ? Math.round((stats.completedMinutes / stats.targetMinutes) * 100) : 0;
    const ai = await coach.dailyReport({ completedMinutes: stats.completedMinutes, targetMinutes: stats.targetMinutes });
    const txt = `📊 <b>DAILY ACCOUNTABILITY</b>\n\nTarget: ${fmtDuration(stats.targetMinutes)}\nCompleted: ${fmtDuration(stats.completedMinutes)}\nCompletion: ${pct}%\n\n${progressBar(pct / 100)}\n\nSessions: ${stats.sessionsCompleted}/${stats.sessionsPlanned}\nFocus interruptions: ${stats.interruptions}\nMissed sessions: ${stats.sessionsMissed}\n\n🔥 Streak: ${stats.streak} day${stats.streak === 1 ? "" : "s"}\n\n${ai}`;
    this.send(chatId, txt);
    await db.update(schema.dailyStats).set({ reportSent: true }).where(eq(schema.dailyStats.id, stats.id));
  }

  async sendWeeklyReport(userId: number) {
    const chatId = this.ownerChatId();
    if (!chatId || !this.bot) return;
    const stats = await computeWeeklyStats(userId, new Date());
    const pct = stats.plannedMinutes ? Math.round((stats.completedMinutes / stats.plannedMinutes) * 100) : 0;
    const ai = await coach.weeklyReport({ sessionsCompleted: stats.sessionsCompleted, sessionsPlanned: stats.sessionsPlanned, mainIssue: stats.mainIssue, nextPriority: "start the first session immediately after school." });
    const txt = `📈 <b>WEEKLY ACCOUNTABILITY</b>\n\nPlanned: ${fmtDuration(stats.plannedMinutes)}\nCompleted: ${fmtDuration(stats.completedMinutes)}\nCompletion: ${pct}%\n\nSessions: ${stats.sessionsCompleted}/${stats.sessionsPlanned}\nMissed: ${stats.sessionsMissed}\nAvg focus: ${stats.avgFocusMinutes}\nMost interrupted subject: ${stats.mostInterruptedSubject ?? "—"}\nBest subject: ${stats.bestSubject ?? "—"}\nMain issue: ${stats.mainIssue ?? "—"}\n\n${ai}`;
    this.send(chatId, txt);
    await db.update(schema.weeklyStats).set({ reportSent: true }).where(eq(schema.weeklyStats.id, stats.id));
  }

  async handleCallback(q: TelegramBot.CallbackQuery) {
    const chatId = q.message?.chat.id;
    if (!chatId || !q.data) return;
    this.bot?.answerCallbackQuery(q.id).catch(() => undefined);

    const [action, idStr] = q.data.split("_");
    const sessionId = Number(idStr);

    switch (action) {
      case "start": {
        const [session] = await db.select().from(schema.studySessions).where(eq(schema.studySessions.id, sessionId)).limit(1);
        if (!session) return this.send(chatId, "Session not found.");
        if (session.status === "active") return this.send(chatId, "Already running.");
        await db.update(schema.studySessions).set({ status: "active", actualStart: new Date(), updatedAt: new Date() }).where(eq(schema.studySessions.id, sessionId));
        const msg = await coach.sessionStart(session);
        this.send(chatId, `🔥 <b>STARTED</b>\n\n${session.goal}\n${session.plannedDurationMinutes} min\n\n${msg}\n\n<b>Work. Now.</b>\n\nIf the app isn't open, the session is still running — it will be tracked.`);
        break;
      }
      case "snooze": {
        const snoozeMin = q.data.startsWith("snooze_10") ? 10 : 5;
        const fireAt = addMinutes(new Date(), snoozeMin);
        const [session] = await db.select().from(schema.studySessions).where(eq(schema.studySessions.id, sessionId)).limit(1);
        if (!session) return this.send(chatId, "Session not found.");
        await db.insert(schema.reminders).values({
          userId: session.userId,
          sessionId,
          type: "snooze",
          scheduledFor: session.plannedStart ?? new Date(),
          fireAt,
          payload: { snooze: snoozeMin },
        });
        this.send(chatId, `Snoozed ${snoozeMin} minutes.\nI'll be back. It won't stop.`);
        break;
      }
      case "back": {
        this.send(chatId, "Good. Get back to the desk and finish the session.");
        break;
      }
    }
  }
}

export const telegram = new TelegramService();