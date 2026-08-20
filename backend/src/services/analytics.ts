import { and, eq, gte, lt, desc, sql, count, avg } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { addDays, addMinutes, isSameDay, fmtDuration } from "../lib/dates.js";
import { tzStartOfDay, tzWeekStart, tzDateKey } from "../lib/tz.js";
import { coach } from "./coach.js";

async function getTz(userId: number): Promise<string> {
  const [settings] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId)).limit(1);
  return settings?.timezone ?? "Asia/Kolkata";
}

export async function computeDailyStats(userId: number, date: Date): Promise<typeof schema.dailyStats.$inferSelect> {
  const tz = await getTz(userId);
  const dayStart = tzStartOfDay(date, tz);
  const dayEnd = addMinutes(dayStart, 24 * 60);

  const [settings] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId)).limit(1);
  const target = settings?.dailyTargetMinutes ?? 300;

  const sessions = await db
    .select()
    .from(schema.studySessions)
    .where(
      and(
        eq(schema.studySessions.userId, userId),
        gte(schema.studySessions.actualStart ?? schema.studySessions.plannedStart, dayStart),
        lt(schema.studySessions.actualStart ?? schema.studySessions.plannedStart, dayEnd)
      )
    );

  const planned = await db
    .select()
    .from(schema.studySessions)
    .where(
      and(
        eq(schema.studySessions.userId, userId),
        gte(schema.studySessions.plannedStart, dayStart),
        lt(schema.studySessions.plannedStart, dayEnd)
      )
    );

  const interruptions = await db
    .select()
    .from(schema.interruptions)
    .where(
      and(
        eq(schema.interruptions.userId, userId),
        gte(schema.interruptions.startAt, dayStart),
        lt(schema.interruptions.startAt, dayEnd)
      )
    );

  const completed = sessions.filter((s) => s.status === "completed");
  const missed = planned.filter((s) => s.status === "scheduled" && s.plannedStart! < new Date());

  const completedMinutes = completed.reduce((acc, s) => acc + Math.round((s.actualEnd!.getTime() - s.actualStart!.getTime()) / 60000), 0);
  const focusMinutes = Math.round(completed.reduce((acc, s) => acc + s.focusTimeSeconds, 0) / 60);
  const avgFocus = completed.length ? completed.reduce((acc, s) => acc + s.focusScore, 0) / completed.length : 0;

  const streak = await computeStreak(userId, date);

  const [stats] = await db
    .insert(schema.dailyStats)
    .values({
      userId,
      date: dayStart,
      targetMinutes: target,
      completedMinutes,
      focusTimeMinutes: focusMinutes,
      sessionsPlanned: planned.length,
      sessionsCompleted: completed.length,
      sessionsMissed: missed.length,
      interruptions: interruptions.length,
      tabSwitches: interruptions.filter((i) => i.type === "tab-switch").length,
      avgFocusScore: Math.round(avgFocus),
      streak,
    })
    .onConflictDoUpdate({
      target: [schema.dailyStats.userId, schema.dailyStats.date],
      set: {
        targetMinutes: target,
        completedMinutes,
        focusTimeMinutes: focusMinutes,
        sessionsPlanned: planned.length,
        sessionsCompleted: completed.length,
        sessionsMissed: missed.length,
        interruptions: interruptions.length,
        tabSwitches: interruptions.filter((i) => i.type === "tab-switch").length,
        avgFocusScore: Math.round(avgFocus),
        streak,
      },
    })
    .returning();

  return stats;
}

export async function computeStreak(userId: number, asOf: Date = new Date()): Promise<number> {
  const tz = await getTz(userId);
  let streak = 0;
  let cursor = tzStartOfDay(asOf, tz);
  // today counts only if target met (or still in progress)
  const today = await computeDayAchieved(userId, cursor);
  if (today) { streak++; cursor = addDays(cursor, -1); }
  else {
    // if today not met yet, streak may still include yesterday
    const yesterday = await computeDayAchieved(userId, addDays(cursor, -1));
    if (!yesterday) return 0;
  }
  while (await computeDayAchieved(userId, cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

async function computeDayAchieved(userId: number, day: Date): Promise<boolean> {
  const tz = await getTz(userId);
  const dayStart = tzStartOfDay(day, tz);
  const dayEnd = addMinutes(dayStart, 24 * 60);
  const [settings] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId)).limit(1);
  const target = settings?.dailyTargetMinutes ?? 300;

  const sessions = await db
    .select()
    .from(schema.studySessions)
    .where(
      and(
        eq(schema.studySessions.userId, userId),
        gte(schema.studySessions.actualStart ?? schema.studySessions.plannedStart, dayStart),
        lt(schema.studySessions.actualStart ?? schema.studySessions.plannedStart, dayEnd),
        eq(schema.studySessions.status, "completed")
      )
    );
  const minutes = sessions.reduce((acc, s) => acc + Math.round((s.actualEnd!.getTime() - s.actualStart!.getTime()) / 60000), 0);
  return minutes >= target;
}

export interface DayOverview {
  targetMinutes: number;
  completedMinutes: number;
  remainingMinutes: number;
  focusScore: number;
  interruptions: number;
  sessionsCompleted: number;
  sessionsPlanned: number;
  sessionsMissed: number;
  streak: number;
  activeSession?: typeof schema.studySessions.$inferSelect | null;
}

export async function getDayOverview(userId: number, date: Date = new Date()): Promise<DayOverview> {
  const tz = await getTz(userId);
  const dayStart = tzStartOfDay(date, tz);
  const dayEnd = addMinutes(dayStart, 24 * 60);
  const [settings] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId)).limit(1);
  const target = settings?.dailyTargetMinutes ?? 300;

  const sessions = await db
    .select()
    .from(schema.studySessions)
    .where(
      and(
        eq(schema.studySessions.userId, userId),
        gte(schema.studySessions.plannedStart ?? schema.studySessions.actualStart, dayStart),
        lt(schema.studySessions.plannedStart ?? schema.studySessions.actualStart, dayEnd)
      )
    );

  const completed = sessions.filter((s) => s.status === "completed");
  const completedMinutes = completed.reduce((acc, s) => acc + Math.round((s.actualEnd!.getTime() - s.actualStart!.getTime()) / 60000), 0);

  const interruptions = await db
    .select()
    .from(schema.interruptions)
    .where(and(eq(schema.interruptions.userId, userId), gte(schema.interruptions.startAt, dayStart), lt(schema.interruptions.startAt, dayEnd)));

  const active = await db
    .select()
    .from(schema.studySessions)
    .where(and(eq(schema.studySessions.userId, userId), eq(schema.studySessions.status, "active")))
    .limit(1);

  const streak = await computeStreak(userId, date);

  return {
    targetMinutes: target,
    completedMinutes,
    remainingMinutes: Math.max(0, target - completedMinutes),
    focusScore: completed.length ? Math.round(completed.reduce((a, s) => a + s.focusScore, 0) / completed.length) : 0,
    interruptions: interruptions.length,
    sessionsCompleted: completed.length,
    sessionsPlanned: sessions.length,
    sessionsMissed: sessions.filter((s) => s.status === "scheduled" && s.plannedStart! < new Date()).length,
    streak,
    activeSession: active[0] ?? null,
  };
}

export interface ProcrastinationInsight {
  pattern: string;
  riskyWindowMin?: number;
  abandonCount: number;
  lateStartAvgMin?: number;
  subjectAvoidance?: string;
  recommendation: string;
  aiText?: string | null;
}

export async function analyzeProcrastination(userId: number): Promise<ProcrastinationInsight> {
  const sessions = await db
    .select()
    .from(schema.studySessions)
    .where(and(eq(schema.studySessions.userId, userId), gte(schema.studySessions.plannedStart, addDays(new Date(), -21))))
    .orderBy(desc(schema.studySessions.plannedStart));

  const abandoned = sessions.filter((s) => s.status === "abandoned" || s.status === "scheduled");
  const late = sessions.filter((s) => s.actualStart && s.plannedStart && s.actualStart > s.plannedStart);

  // find risky window: which minute of the session do abandonments cluster in?
  const abandonMinutes = abandoned
    .filter((s) => s.actualStart && s.actualEnd)
    .map((s) => Math.round((s.actualEnd!.getTime() - s.actualStart!.getTime()) / 60000))
    .filter((m) => m > 0);

  const avgAbandonMin = abandonMinutes.length ? Math.round(abandonMinutes.reduce((a, b) => a + b, 0) / abandonMinutes.length) : undefined;

  const lateMins = late
    .map((s) => Math.round((s.actualStart!.getTime() - s.plannedStart!.getTime()) / 60000))
    .filter((m) => m > 0);
  const avgLate = lateMins.length ? Math.round(lateMins.reduce((a, b) => a + b, 0) / lateMins.length) : undefined;

  // subject avoidance: subjects with most abandoned sessions
  const bySubject = new Map<number, { total: number; abandoned: number }>();
  for (const s of sessions) {
    if (!s.subjectId) continue;
    const e = bySubject.get(s.subjectId) ?? { total: 0, abandoned: 0 };
    e.total++;
    if (s.status === "abandoned" || s.status === "scheduled") e.abandoned++;
    bySubject.set(s.subjectId, e);
  }
  const avoidance = [...bySubject.entries()]
    .map(([id, e]) => ({ id, ratio: e.abandoned / Math.max(1, e.total), count: e.abandoned }))
    .sort((a, b) => b.ratio - a.ratio)[0];

  const subjects = await db.select().from(schema.subjects).where(eq(schema.subjects.userId, userId));
  const avoidedName = subjects.find((s) => s.id === avoidance?.id)?.name;

  const pattern = avgAbandonMin
    ? `Your biggest problem occurs ${avgAbandonMin}-${Math.min(45, avgAbandonMin + 10)} minutes into sessions. You abandoned ${abandoned.length} sessions.`
    : `You abandoned ${abandoned.length} sessions in the last 3 weeks.`;

  const recommendation = avgAbandonMin && avgAbandonMin <= 40
    ? `Use ${Math.max(25, avgAbandonMin - 5)}-minute focus blocks for difficult subjects and increase accountability during the second half.`
    : "Start the first session immediately after school, before anything else can distract you.";

  const aiText = aiEnabled() ? await coach.procrastinationIntervention({ minutesLate: avgLate ?? 0, abandonCount: abandoned.length }).catch(() => null) : null;

  return {
    pattern,
    riskyWindowMin: avgAbandonMin,
    abandonCount: abandoned.length,
    lateStartAvgMin: avgLate,
    subjectAvoidance: avoidedName,
    recommendation,
    aiText,
  };
}

function aiEnabled() {
  return Boolean(process.env.AI_PROVIDER) && process.env.AI_PROVIDER !== "deterministic";
}

export async function computeWeeklyStats(userId: number, weekStart: Date): Promise<typeof schema.weeklyStats.$inferSelect> {
  const tz = await getTz(userId);
  const ws = tzWeekStart(weekStart, tz);
  const we = addDays(ws, 7);
  const daily = await db
    .select()
    .from(schema.dailyStats)
    .where(and(eq(schema.dailyStats.userId, userId), gte(schema.dailyStats.date, ws), lt(schema.dailyStats.date, we)));

  const planned = daily.reduce((a, d) => a + d.sessionsPlanned, 0);
  const completed = daily.reduce((a, d) => a + d.sessionsCompleted, 0);
  const missed = daily.reduce((a, d) => a + d.sessionsMissed, 0);
  const plannedMin = daily.reduce((a, d) => a + d.targetMinutes, 0);
  const completedMin = daily.reduce((a, d) => a + d.completedMinutes, 0);

  // subject stats
  const sessions = await db
    .select()
    .from(schema.studySessions)
    .where(and(eq(schema.studySessions.userId, userId), gte(schema.studySessions.plannedStart, ws), lt(schema.studySessions.plannedStart, we)));

  const subjectAgg = new Map<number, { completed: number; interrupted: number; focus: number[]; abandon: number }>();
  for (const s of sessions) {
    if (!s.subjectId) continue;
    const e = subjectAgg.get(s.subjectId) ?? { completed: 0, interrupted: 0, focus: [], abandon: 0 };
    if (s.status === "completed") e.completed++;
    if (s.interruptions > 0) e.interrupted++;
    e.focus.push(s.focusScore);
    if (s.status === "abandoned") e.abandon++;
    subjectAgg.set(s.subjectId, e);
  }
  const subjects = await db.select().from(schema.subjects).where(eq(schema.subjects.userId, userId));
  const nameOf = (id: number) => subjects.find((s) => s.id === id)?.name ?? "Unknown";
  const worstInterrupted = [...subjectAgg.entries()].sort((a, b) => b[1].interrupted - a[1].interrupted)[0];
  const bestSubject = [...subjectAgg.entries()].sort((a, b) => b[1].completed - a[1].completed)[0];
  const weakest = [...subjectAgg.entries()].sort((a, b) => b[1].abandon - a[1].abandon)[0];

  const avgFocus = daily.length ? Math.round(daily.reduce((a, d) => a + d.avgFocusScore, 0) / daily.length) : 0;

  const [stats] = await db
    .insert(schema.weeklyStats)
    .values({
      userId,
      weekStart: ws,
      weekEnd: we,
      plannedMinutes: plannedMin,
      completedMinutes: completedMin,
      sessionsPlanned: planned,
      sessionsCompleted: completed,
      sessionsMissed: missed,
      avgFocusMinutes: avgFocus,
      mostInterruptedSubject: worstInterrupted ? nameOf(worstInterrupted[0]) : null,
      bestSubject: bestSubject && bestSubject[1].completed > 0 ? nameOf(bestSubject[0]) : null,
      weakestSubject: weakest && weakest[1].abandon > 0 ? nameOf(weakest[0]) : null,
      mainIssue: missed > 0 ? "Missed sessions" : avgFocus < 60 ? "Falling focus mid-session" : "Late session starts",
    })
    .onConflictDoUpdate({
      target: [schema.weeklyStats.userId, schema.weeklyStats.weekStart],
      set: {
        plannedMinutes: plannedMin,
        completedMinutes: completedMin,
        sessionsPlanned: planned,
        sessionsCompleted: completed,
        sessionsMissed: missed,
        avgFocusMinutes: avgFocus,
        mostInterruptedSubject: worstInterrupted ? nameOf(worstInterrupted[0]) : null,
        bestSubject: bestSubject && bestSubject[1].completed > 0 ? nameOf(bestSubject[0]) : null,
        weakestSubject: weakest && weakest[1].abandon > 0 ? nameOf(weakest[0]) : null,
        mainIssue: missed > 0 ? "Missed sessions" : avgFocus < 60 ? "Falling focus mid-session" : "Late session starts",
      },
    })
    .returning();

  return stats;
}

export interface TestAutopsyResult {
  testId: number;
  testName: string;
  score: number;
  maxMarks: number;
  subjectBreakdown: Array<{ subject: string; score: number; max: number; prevScore?: number; change?: number }>;
  weakTopics: string[];
  strongTopics: string[];
  studyBefore: { plannedH: number; completedH: number; completionPct: number; interruptions: number; missedSessions: number };
  aiAnalysis?: string | null;
}

export async function generateTestAutopsy(userId: number, testId: number): Promise<TestAutopsyResult> {
  const [test] = await db.select().from(schema.tests).where(and(eq(schema.tests.id, testId), eq(schema.tests.userId, userId)));
  if (!test) throw new Error("Test not found");

  const cycleStart = addDays(test.date, -21);
  const sessions = await db
    .select()
    .from(schema.studySessions)
    .where(
      and(
        eq(schema.studySessions.userId, userId),
        gte(schema.studySessions.plannedStart, cycleStart),
        lt(schema.studySessions.plannedStart, test.date)
      )
    );

  const plannedH = sessions.reduce((a, s) => a + s.plannedDurationMinutes, 0) / 60;
  const completedH = sessions.filter((s) => s.status === "completed").reduce((a, s) => a + Math.round((s.actualEnd!.getTime() - s.actualStart!.getTime()) / 60000), 0) / 60;
  const missedSessions = sessions.filter((s) => s.status === "scheduled").length;
  const interruptions = sessions.reduce((a, s) => a + s.interruptions, 0);

  // weak/strong topics from question-wise data
  const qw: Array<{ subject: string; topic: string; correct: boolean; attempted: boolean }> = Array.isArray(test.questionWise) ? (test.questionWise as any) : [];
  const topicStats = new Map<string, { correct: number; total: number }>();
  for (const q of qw) {
    if (!q.topic) continue;
    const e = topicStats.get(q.topic) ?? { correct: 0, total: 0 };
    if (q.attempted) { e.total++; if (q.correct) e.correct++; }
    topicStats.set(q.topic, e);
  }
  const sorted = [...topicStats.entries()].sort((a, b) => (a[1].correct / Math.max(1, a[1].total)) - (b[1].correct / Math.max(1, b[1].total)));
  const weakTopics = sorted.slice(0, 3).map(([name]) => name);
  const strongTopics = [...sorted].reverse().slice(0, 3).map(([name]) => name);

  // previous test same name
  const [prev] = await db
    .select()
    .from(schema.tests)
    .where(and(eq(schema.tests.userId, userId), eq(schema.tests.name, test.name), lt(schema.tests.date, test.date)))
    .orderBy(desc(schema.tests.date))
    .limit(1);

  const subjectBreakdown = Array.isArray(test.subjects) && (test.subjects as any[]).length
    ? (test.subjects as Array<{ name: string; score: number; max: number }>).map((s) => ({
        subject: s.name,
        score: s.score,
        max: s.max,
      }))
    : [];

  const result: TestAutopsyResult = {
    testId: test.id,
    testName: test.name,
    score: test.score ?? 0,
    maxMarks: test.maxMarks ?? 0,
    subjectBreakdown,
    weakTopics,
    strongTopics,
    studyBefore: {
      plannedH: Math.round(plannedH * 10) / 10,
      completedH: Math.round(completedH * 10) / 10,
      completionPct: plannedH ? Math.round((completedH / plannedH) * 100) : 0,
      interruptions,
      missedSessions,
    },
  };

  if (aiEnabled()) {
    result.aiAnalysis = await coach.testAutopsy(result as any).catch(() => null);
  }

  await db
    .insert(schema.testAutopsies)
    .values({ userId, testId, data: result as any })
    .onConflictDoUpdate({ target: [schema.testAutopsies.testId], set: { data: result as any } });

  return result;
}