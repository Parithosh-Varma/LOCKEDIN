import { Router } from "express";
import { z } from "zod";
import { and, eq, gte, lt, desc, asc } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { requireAuth, resolveUserId, login, ensureUser } from "../lib/auth.js";
import { generateDailyPlan, planForDate } from "../services/scheduler.js";
import { getDayOverview, computeDailyStats, analyzeProcrastination, generateTestAutopsy, computeWeeklyStats } from "../services/analytics.js";
import { allen } from "../services/allen.js";
import { telegram } from "../bot/telegram.js";
import { addMinutes, startOfDay } from "../lib/dates.js";
import { ai } from "../lib/ai.js";

export const api = Router();

// ---------- auth ----------
api.post("/auth/login", async (req, res) => {
  const { password } = z.object({ password: z.string() }).parse(req.body);
  const result = await login(password);
  if (result.error) return res.status(401).json({ error: result.error });
  res.json({ token: result.token });
});

api.get("/health", async (_req, res) => {
  res.json({ ok: true, ai: ai.enabled, telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN), time: new Date().toISOString() });
});

// ---------- dashboard ----------
api.get("/dashboard", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const overview = await getDayOverview(userId);
  const [settings] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId)).limit(1);
  const [plan] = await db
    .select()
    .from(schema.studyPlans)
    .where(and(eq(schema.studyPlans.userId, userId), gte(schema.studyPlans.date, startOfDay(new Date())), lt(schema.studyPlans.date, addMinutes(startOfDay(new Date()), 1440))))
    .orderBy(desc(schema.studyPlans.createdAt))
    .limit(1);

  const subjects = await db.select().from(schema.subjects).where(eq(schema.subjects.userId, userId)).orderBy(desc(schema.subjects.priority));
  const tests = await db.select().from(schema.tests).where(and(eq(schema.tests.userId, userId), gte(schema.tests.date, new Date()))).orderBy(asc(schema.tests.date)).limit(5);
  const allenCfg = await allen.getConfig(userId);

  const nextSession = plan
    ? ((plan.schedule ?? []) as Array<{ subject: string; goal: string; start: string; end: string; minutes: number; type: string }>)
        .filter((b) => b.subject !== "Break" && b.subject !== "Dinner")
        .find((b) => new Date(b.start).getTime() >= Date.now() - 5 * 60_000)
    : null;

  res.json({ overview, settings, plan, subjects, tests, allen: allenCfg, nextSession, telegramConnected: settings.telegramConnected });
});

// ---------- plan / schedule ----------
api.post("/plan/generate", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const date = req.body?.date ? new Date(z.string().parse(req.body.date)) : new Date();
  const plan = await generateDailyPlan(userId, date);
  res.json(plan);
});

api.get("/plan/today", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const existing = await planForDate(userId, new Date());
  if (existing) return res.json(existing);
  const plan = await generateDailyPlan(userId, new Date());
  res.json(plan);
});

// ---------- sessions ----------
api.get("/sessions", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const from = req.query.from ? new Date(z.string().parse(req.query.from)) : addMinutes(new Date(), -7 * 24 * 60);
  const to = req.query.to ? new Date(z.string().parse(req.query.to)) : addMinutes(new Date(), 24 * 60);
  const sessions = await db
    .select()
    .from(schema.studySessions)
    .where(and(eq(schema.studySessions.userId, userId), gte(schema.studySessions.plannedStart, from), lt(schema.studySessions.plannedStart, to)))
    .orderBy(desc(schema.studySessions.plannedStart));
  res.json(sessions);
});

api.post("/sessions/commit", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const body = z.object({ sessionId: z.number() }).parse(req.body);
  const [session] = await db.select().from(schema.studySessions).where(and(eq(schema.studySessions.id, body.sessionId), eq(schema.studySessions.userId, userId))).limit(1);
  if (!session) return res.status(404).json({ error: "Session not found" });
  await db.update(schema.studySessions).set({ status: "committed", updatedAt: new Date() }).where(eq(schema.studySessions.id, session.id));
  res.json({ ok: true, session: { ...session, status: "committed" } });
});

api.post("/sessions/:id/start", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const id = Number(req.params.id);
  const [session] = await db.select().from(schema.studySessions).where(and(eq(schema.studySessions.id, id), eq(schema.studySessions.userId, userId))).limit(1);
  if (!session) return res.status(404).json({ error: "Session not found" });

  // close any other active sessions
  await db.update(schema.studySessions).set({ status: "abandoned", actualEnd: new Date(), quitReason: "Replaced by new session", updatedAt: new Date() }).where(and(eq(schema.studySessions.userId, userId), eq(schema.studySessions.status, "active")));

  const now = new Date();
  await db.update(schema.studySessions).set({ status: "active", actualStart: now, updatedAt: now }).where(eq(schema.studySessions.id, id));
  await db.insert(schema.focusEvents).values({ sessionId: id, userId, type: "session-start", at: now });
  await db.insert(schema.coachMessages).values({ userId, sessionId: id, channel: "app", kind: "reminder", message: "session-started" });

  const [updated] = await db.select().from(schema.studySessions).where(eq(schema.studySessions.id, id));
  res.json({ ok: true, session: updated });
});

api.post("/sessions/:id/pause", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const id = Number(req.params.id);
  const [session] = await db.select().from(schema.studySessions).where(and(eq(schema.studySessions.id, id), eq(schema.studySessions.userId, userId))).limit(1);
  if (!session) return res.status(404).json({ error: "Session not found" });
  await db.update(schema.studySessions).set({ status: session.status === "paused" ? "active" : "paused", updatedAt: new Date() }).where(eq(schema.studySessions.id, id));
  const [updated] = await db.select().from(schema.studySessions).where(eq(schema.studySessions.id, id));
  res.json({ ok: true, session: updated });
});

api.post("/sessions/:id/end", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const id = Number(req.params.id);
  const body = z.object({ quitReason: z.string().optional().default("Finished goal"), completedQuestions: z.number().optional(), focusTimeSeconds: z.number().optional() }).parse(req.body);
  const [session] = await db.select().from(schema.studySessions).where(and(eq(schema.studySessions.id, id), eq(schema.studySessions.userId, userId))).limit(1);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const now = new Date();
  const startedAt = session.actualStart ?? now;
  const activeMs = now.getTime() - startedAt.getTime();
  const focus = body.focusTimeSeconds ?? Math.round(activeMs / 1000 * 0.85);
  const status = body.quitReason === "Finished goal" || body.quitReason === "Emergency" ? "completed" : "abandoned";

  await db.update(schema.studySessions).set({
    status,
    actualEnd: now,
    quitReason: body.quitReason,
    completedQuestions: body.completedQuestions ?? session.completedQuestions,
    focusTimeSeconds: focus,
    activeTimeSeconds: Math.round(activeMs / 1000),
    focusScore: Math.max(0, Math.min(100, Math.round((focus / Math.max(1, activeMs / 1000)) * 100))),
    completedAt: now,
    updatedAt: now,
  }).where(eq(schema.studySessions.id, id));

  await db.insert(schema.focusEvents).values({ sessionId: id, userId, type: "session-end", at: now, detail: body.quitReason });
  if (status === "abandoned") {
    await db.insert(schema.procrastinationEvents).values({ userId, sessionId: id, type: "abandoned", at: now, detail: body.quitReason });
  }

  const [updated] = await db.select().from(schema.studySessions).where(eq(schema.studySessions.id, id));
  await computeDailyStats(userId, now).catch(() => undefined);
  if (status === "completed") telegram.sendSessionComplete(updated).catch(() => undefined);
  res.json({ ok: true, session: updated });
});

api.get("/sessions/active", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const active = await db.select().from(schema.studySessions).where(and(eq(schema.studySessions.userId, userId), eq(schema.studySessions.status, "active"))).limit(1);
  res.json({ session: active[0] ?? null });
});

// ---------- focus events ----------
api.post("/sessions/:id/focus", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const id = Number(req.params.id);
  const body = z.object({ type: z.enum(["focus-broken", "returned", "inactivity", "tab-switch", "presence"]), detail: z.string().optional() }).parse(req.body);

  await db.insert(schema.focusEvents).values({ sessionId: id, userId, type: body.type, detail: body.detail });

  const [session] = await db.select().from(schema.studySessions).where(eq(schema.studySessions.id, id)).limit(1);
  if (!session) return res.status(404).json({ error: "Session not found" });

  if (body.type === "focus-broken" || body.type === "tab-switch") {
    await db.update(schema.studySessions).set({ interruptions: session.interruptions + 1, tabSwitches: session.tabSwitches + (body.type === "tab-switch" ? 1 : 0), updatedAt: new Date() }).where(eq(schema.studySessions.id, id));
    await db.insert(schema.interruptions).values({ sessionId: id, userId, type: body.type === "tab-switch" ? "tab-switch" : "window-blur", startAt: new Date() });
    if (body.type === "focus-broken") {
      telegram.sendFocusBroken(session).catch(() => undefined);
      // followup in 5 minutes
      await db.insert(schema.reminders).values({
        userId,
        sessionId: id,
        type: "followup",
        scheduledFor: new Date(),
        fireAt: addMinutes(new Date(), 5),
        payload: { kind: "focus-broken-followup" },
      });
    }
  } else if (body.type === "returned") {
    await db.insert(schema.interruptions).values({ sessionId: id, userId, type: "returned", startAt: new Date(), endAt: new Date(), durationSeconds: 0 });
  }

  res.json({ ok: true });
});

// ---------- stats / analytics ----------
api.get("/stats/today", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const overview = await getDayOverview(userId);
  res.json(overview);
});

api.get("/stats/procrastination", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const insight = await analyzeProcrastination(userId);
  res.json(insight);
});

api.get("/stats/weekly", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const ws = await computeWeeklyStats(userId, new Date());
  res.json(ws);
});

api.get("/stats/history", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const from = addMinutes(startOfDay(new Date()), -30 * 24 * 60);
  const stats = await db.select().from(schema.dailyStats).where(and(eq(schema.dailyStats.userId, userId), gte(schema.dailyStats.date, from))).orderBy(asc(schema.dailyStats.date));
  res.json(stats);
});

// ---------- subjects / topics ----------
api.get("/subjects", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const subjects = await db.select().from(schema.subjects).where(eq(schema.subjects.userId, userId)).orderBy(desc(schema.subjects.priority));
  const topics = await db.select().from(schema.topics).where(eq(schema.topics.userId, userId));
  res.json({ subjects, topics });
});

api.post("/subjects", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const body = z.object({ name: z.string(), color: z.string().optional(), priority: z.number().optional() }).parse(req.body);
  const [subject] = await db.insert(schema.subjects).values({ userId, name: body.name, color: body.color ?? "#6366f1", priority: body.priority ?? 50 }).onConflictDoNothing().returning();
  res.json({ subject: subject ?? null });
});

api.post("/topics", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const body = z.object({ subjectId: z.number(), name: z.string(), mastery: z.number().optional(), isWeak: z.boolean().optional() }).parse(req.body);
  const [topic] = await db.insert(schema.topics).values({ userId, subjectId: body.subjectId, name: body.name, mastery: body.mastery ?? 0, isWeak: body.isWeak ?? false }).onConflictDoNothing().returning();
  res.json({ topic: topic ?? null });
});

api.patch("/topics/:id", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const id = Number(req.params.id);
  const body = z.object({ mastery: z.number().optional(), isWeak: z.boolean().optional() }).parse(req.body);
  const [topic] = await db.update(schema.topics).set({ ...body, updatedAt: new Date() }).where(and(eq(schema.topics.id, id), eq(schema.topics.userId, userId))).returning();
  res.json({ topic });
});

// ---------- tests ----------
api.get("/tests", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const tests = await db.select().from(schema.tests).where(eq(schema.tests.userId, userId)).orderBy(desc(schema.tests.date)).limit(30);
  res.json(tests);
});

api.post("/tests", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const body = z.object({
    name: z.string(),
    date: z.string(),
    subjects: z.array(z.any()).optional(),
    syllabus: z.array(z.any()).optional(),
    totalMarks: z.number().optional(),
    status: z.string().optional().default("upcoming"),
    score: z.number().optional(),
    maxMarks: z.number().optional(),
    rank: z.number().optional(),
    percentile: z.number().optional(),
    questionWise: z.array(z.any()).optional(),
  }).parse(req.body);
  const [test] = await db.insert(schema.tests).values({ userId, ...body, date: new Date(body.date) }).returning();
  res.json({ test });
});

api.patch("/tests/:id", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const id = Number(req.params.id);
  const body = z.object({
    status: z.string().optional(),
    score: z.number().optional(),
    maxMarks: z.number().optional(),
    rank: z.number().optional(),
    percentile: z.number().optional(),
    questionWise: z.array(z.any()).optional(),
  }).parse(req.body);
  const [test] = await db.update(schema.tests).set({ ...body, updatedAt: new Date() }).where(and(eq(schema.tests.id, id), eq(schema.tests.userId, userId))).returning();
  if (body.status === "completed") {
    generateTestAutopsy(userId, id).catch(() => undefined);
  }
  res.json({ test });
});

api.get("/tests/:id/autopsy", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const id = Number(req.params.id);
  const autopsy = await generateTestAutopsy(userId, id);
  res.json(autopsy);
});

// ---------- settings ----------
api.get("/settings", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const [settings] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId)).limit(1);
  const telegramCode = await getVerificationCode(userId);
  res.json({ ...settings, verificationCode: telegramCode });
});

async function getVerificationCode(userId: number): Promise<string | null> {
  const [t] = await db.select().from(schema.telegramUsers).where(and(eq(schema.telegramUsers.userId, userId), eq(schema.telegramUsers.verified, false))).orderBy(desc(schema.telegramUsers.createdAt)).limit(1);
  return t?.verificationCode ?? null;
}

api.patch("/settings", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const body = z.object({
    dailyTargetMinutes: z.number().min(30).max(720).optional(),
    schoolStartHour: z.number().min(0).max(23).optional(),
    schoolStartMinute: z.number().min(0).max(59).optional(),
    schoolDays: z.array(z.number()).optional(),
    noSchoolDays: z.array(z.string()).optional(),
    focusLockEnabled: z.boolean().optional(),
    webcamEnabled: z.boolean().optional(),
    screenEnabled: z.boolean().optional(),
    youtubeMusicUrl: z.string().nullable().optional(),
    musicVolume: z.number().min(0).max(100).optional(),
    musicEnabled: z.boolean().optional(),
    minSessionMinutes: z.number().optional(),
    maxSessionMinutes: z.number().optional(),
  }).parse(req.body);
  const [settings] = await db.update(schema.settings).set({ ...body, updatedAt: new Date() }).where(eq(schema.settings.userId, userId)).returning();
  res.json({ settings });
});

// ---------- allen ----------
api.get("/allen", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  res.json(await allen.getConfig(userId));
});

api.post("/allen/configure", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const body = z.object({ token: z.string().optional(), portalUrl: z.string().optional() }).parse(req.body);
  await allen.configure(userId, body);
  res.json({ ok: true });
});

api.post("/allen/sync", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const result = await allen.sync(userId);
  res.json(result);
});

// ---------- telegram ----------
api.post("/telegram/connect", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const body = z.object({ chatId: z.string(), code: z.string() }).parse(req.body);
  const [t] = await db.select().from(schema.telegramUsers).where(and(eq(schema.telegramUsers.chatId, body.chatId), eq(schema.telegramUsers.verificationCode, body.code))).limit(1);
  if (!t) return res.status(400).json({ error: "Invalid code" });
  await db.update(schema.telegramUsers).set({ verified: true, verificationCode: null, userId }).where(eq(schema.telegramUsers.id, t.id));
  await db.update(schema.settings).set({ telegramConnected: true, telegramChatId: body.chatId }).where(eq(schema.settings.userId, userId));
  res.json({ ok: true });
});

api.get("/telegram/status", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const [settings] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId)).limit(1);
  res.json({ connected: settings.telegramConnected, chatId: settings.telegramChatId, botTokenSet: Boolean(process.env.TELEGRAM_BOT_TOKEN) });
});

// ---------- AI status ----------
api.get("/ai/status", requireAuth, async (_req, res) => {
  res.json({ provider: ai.enabled ? (process.env.AI_PROVIDER || "openai") : "deterministic", enabled: ai.enabled, model: ai.enabled ? process.env.AI_MODEL : null });
});

// ---------- allen raw data (for Allen page display, sanitized) ----------
api.get("/allen/data", requireAuth, async (req, res) => {
  const userId = await resolveUserId(req);
  const rows = await db.select().from(schema.allenData).where(eq(schema.allenData.userId, userId)).limit(1);
  if (!rows.length) return res.json({ data: null });
  const raw = { ...((rows[0].raw ?? {}) as Record<string, unknown>) };
  delete raw.token;
  res.json({ data: raw, syncStatus: rows[0].syncStatus, lastSyncAt: rows[0].lastSyncAt, error: rows[0].error });
});