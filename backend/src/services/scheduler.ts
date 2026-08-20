import { and, eq, desc, gte, lt, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { addMinutes, fmtTime } from "../lib/dates.js";
import { tzWallClock, tzStartOfDay, tzParts, tzDateKey } from "../lib/tz.js";
import { coach } from "./coach.js";

export type SessionType = "questions" | "theory" | "revision" | "test-prep" | "timed-practice" | "dpp";

export interface PlanBlock {
  subjectId?: number | null;
  subject: string;
  type: SessionType;
  minutes: number;
  goal: string;
  questionCount?: number;
  start: string; // ISO
  end: string; // ISO
}

export interface PlanInput {
  userId: number;
  date: Date;
  subjects: (typeof schema.subjects.$inferSelect)[];
  topics: Record<number, (typeof schema.topics.$inferSelect)[]>;
  tests: (typeof schema.tests.$inferSelect)[];
  settings: typeof schema.settings.$inferSelect;
  history?: (typeof schema.studySessions.$inferSelect)[];
  allenData?: (typeof schema.allenData.$inferSelect)[];
}

const SUBJECT_ORDER = ["Physics", "Chemistry", "Mathematics", "Math", "Biology", "English"];

function isSchoolDay(settings: typeof schema.settings.$inferSelect, date: Date): boolean {
  const tz = settings.timezone ?? "Asia/Kolkata";
  const parts = tzParts(date, tz);
  const day = parts.weekday; // 0=Sun .. 6=Sat
  const days: number[] = settings.schoolDays as number[];
  if (settings.noSchoolDays && Array.isArray(settings.noSchoolDays)) {
    const keys = (settings.noSchoolDays as string[]).map((k) => k.slice(0, 10));
    const dk = tzDateKey(date, tz);
    if (keys.includes(dk)) return false;
  }
  return days.includes(day);
}

function isWeekend(date: Date, tz: string): boolean {
  const d = tzParts(date, tz).weekday;
  return d === 0 || d === 6;
}

function testCyclePhase(tests: (typeof schema.tests.$inferSelect)[], date: Date): { phase: string; nextTest?: typeof schema.tests.$inferSelect; daysLeft?: number } {
  const upcoming = tests
    .filter((t) => t.status === "upcoming" || (t.status === "in-progress" && t.date > date))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const next = upcoming[0];
  if (!next) return { phase: "build" };
  const daysLeft = Math.max(0, Math.round((next.date.getTime() - date.getTime()) / 86_400_000));
  const phase = daysLeft <= 5 ? "test-prep" : daysLeft <= 12 ? "practice" : "build";
  return { phase, nextTest: next, daysLeft };
}

function subjectPriority(subjects: PlanInput["subjects"], topicsMap: PlanInput["topics"], subjectId: number | null): number {
  if (!subjectId) return 50;
  const subj = subjects.find((s) => s.id === subjectId);
  const base = subj?.priority ?? 50;
  const weak = subj?.isWeak ? 20 : 0;
  const topicWeak = (topicsMap[subjectId] ?? []).filter((t) => t.isWeak).length * 5;
  return Math.min(100, base + weak + topicWeak);
}

function subjectQuestionsPerHour(phase: string, priority: number): number {
  // questions per 50-min block: test-prep is denser
  return phase === "test-prep" ? 30 : phase === "practice" ? 25 : 20;
}

function pickOrder(subjects: PlanInput["subjects"], topicsMap: PlanInput["topics"], count: number, startIdx: number): number[] {
  const ranked = [...subjects]
    .map((s) => ({ id: s.id, prio: subjectPriority(subjects, topicsMap, s.id) }))
    .sort((a, b) => b.prio - a.prio);
  const ids = ranked.map((r) => r.id);
  // rotate start subject each day to avoid monotony but keep weak subjects first
  const rotated = [...ids.slice(startIdx % Math.max(1, ids.length)), ...ids.slice(0, startIdx % Math.max(1, ids.length))];
  const top = ranked[0];
  return [top.id, ...rotated.filter((x) => x !== top.id)].slice(0, count);
}

function weakTopics(topics: (typeof schema.topics.$inferSelect)[]): string[] {
  return topics.filter((t) => t.isWeak || t.mastery < 40).map((t) => t.name).slice(0, 3);
}

function goalFor(subject: typeof schema.subjects.$inferSelect, type: SessionType, phase: string, questionCount: number, topics: (typeof schema.topics.$inferSelect)[]): string {
  if (type === "questions" || type === "dpp" || type === "timed-practice") {
    const wt = weakTopics(topics);
    if (type === "dpp") return `${subject.name} — DPP`;
    if (type === "timed-practice") return `${subject.name} — ${questionCount} questions timed`;
    return wt.length ? `${subject.name} — ${questionCount} questions (weak: ${wt.join(", ")})` : `${subject.name} — ${questionCount} questions`;
  }
  if (type === "revision") return `${subject.name} — revise ${topics.slice(0, 3).map((t) => t.name).join(", ") || "core topics"}`;
  if (type === "test-prep") return `${subject.name} — ${questionCount} high-value questions + error correction`;
  return `${subject.name} — theory: ${topics[0]?.name ?? "next chapter"}`;
}

function blockLength(settings: typeof schema.settings.$inferSelect, subjectId: number | null, subjects: PlanInput["subjects"]): number {
  const max = settings.maxSessionMinutes ?? 60;
  const min = settings.minSessionMinutes ?? 25;
  const prio = subjects.find((s) => s.id === subjectId)?.difficulty ?? 50;
  // difficult subjects get shorter initial blocks; default 50
  let len = Math.max(min, Math.min(max, 50));
  if (prio >= 75) len = Math.max(min, Math.round(len * 0.8));
  return len;
}

function breakAfter(settings: typeof schema.settings.$inferSelect, index: number): number {
  if (index % 3 === 2) return settings.breakMinutes ?? 10;
  return settings.shortBreakMinutes ?? 5;
}

function buildPlan(input: PlanInput): PlanBlock[] {
  const { subjects, settings, date } = input;
  const tz = settings.timezone ?? "Asia/Kolkata";
  const parts = tzParts(date, tz);
  const isSchool = isSchoolDay(settings, date);
  const weekend = isWeekend(date, tz);
  const sunday = parts.weekday === 0;
  const noSchool = !isSchool;

  const target = settings.dailyTargetMinutes ?? 300;
  const phaseInfo = testCyclePhase(input.tests, date);
  const phase = phaseInfo.phase;

  const typeFor: (d: Date) => SessionType = (d) => {
    const day = tzParts(d, tz).weekday;
    if (day >= 1 && day <= 5) return "questions"; // MON–FRI = questions
    if (day === 6) return "theory"; // SAT = theory
    return sunday ? "revision" : "theory"; // SUN = theory + strategic revision
  };

  // start time: school days start 3:30 PM unless noSchool; sunday starts 9 AM
  let cursor: Date;
  if (sunday) {
    cursor = tzWallClock(date, tz, 9, 0);
  } else if (noSchool) {
    cursor = tzWallClock(date, tz, 9, 0);
  } else {
    cursor = tzWallClock(date, tz, settings.schoolStartHour ?? 15, settings.schoolStartMinute ?? 30);
  }

  const blocks: PlanBlock[] = [];
  let allocated = 0;
  let studyBlocks = 0;
  let idx = 0;
  const dayNum = parts.day;
  const order = pickOrder(subjects, input.topics, Math.max(3, Math.min(subjects.length, 4)), dayNum);

  // dinner block on school days around 7:30-8:00
  const dinnerAt = tzWallClock(date, tz, 19, 30);
  let dinnerInserted = false;

  while (allocated < target && studyBlocks < 8 && blocks.length < 18) {
    const subjectId = order[idx % order.length];
    const subject = subjects.find((s) => s.id === subjectId)!;
    if (!subject) { idx++; continue; }

    // no studying after 10:30 PM on school nights
    const cParts = tzParts(cursor, tz);
    if ((cParts.hour >= 22 && cParts.minute > 30) && !sunday) break;

    const type = typeFor(cursor);
    const len = blockLength(settings, subjectId, subjects);
    const qCount = subjectQuestionsPerHour(phase, subjectPriority(subjects, input.topics, subjectId)) * (len / 50);

    const end = addMinutes(cursor, len);
    blocks.push({
      subjectId: subject.id,
      subject: subject.name,
      type,
      minutes: len,
      questionCount: Math.round(qCount),
      goal: goalFor(subject, type, phase, Math.round(qCount), input.topics[subjectId] ?? []),
      start: cursor.toISOString(),
      end: end.toISOString(),
    });
    allocated += len;
    studyBlocks++;
    cursor = end;
    idx++;

    // breaks (not counted in target)
    const brk = breakAfter(settings, idx);
    const breakEnd = addMinutes(cursor, brk);
    if (!dinnerInserted && tzParts(cursor, tz).hour >= 19 && tzParts(cursor, tz).hour < 20 && !sunday) {
      // dinner break at ~7:30
      blocks.push({
        subjectId: null,
        subject: "Dinner",
        type: "revision",
        minutes: 30,
        goal: "Dinner. No screens. Come back ready.",
        start: cursor.toISOString(),
        end: addMinutes(cursor, 30).toISOString(),
      });
      cursor = addMinutes(cursor, 30);
      dinnerInserted = true;
      allocated += 0; // dinner isn't study time
      continue;
    }
    cursor = breakEnd;
    if (idx < 8) {
      blocks.push({
        subjectId: null,
        subject: "Break",
        type: "revision",
        minutes: brk,
        goal: `Break. ${brk} minutes. Then back to work.`,
        start: addMinutes(end, 0).toISOString(),
        end: breakEnd.toISOString(),
      });
    }
  }
  return blocks;
}

export interface GeneratedPlan {
  planId: number;
  blocks: PlanBlock[];
  targetMinutes: number;
  phase: string;
  nextTestName?: string;
  daysToNextTest?: number;
  isSchoolDay: boolean;
  aiNote?: string | null;
}

/** Deterministic generation; AI refines the note only. */
export async function generateDailyPlan(userId: number, date: Date): Promise<GeneratedPlan> {
  const [settings] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId)).limit(1);
  const subjects = await db.select().from(schema.subjects).where(eq(schema.subjects.userId, userId)).orderBy(schema.subjects.priority);
  const allTopics = await db.select().from(schema.topics).where(eq(schema.topics.userId, userId));
  const topicsMap: Record<number, (typeof schema.topics.$inferSelect)[]> = {};
  for (const t of allTopics) {
    (topicsMap[t.subjectId] ??= []).push(t);
  }
  const tests = await db.select().from(schema.tests).where(eq(schema.tests.userId, userId));
  const allen = await db.select().from(schema.allenData).where(eq(schema.allenData.userId, userId)).limit(1);

  const input: PlanInput = { userId, date, subjects, topics: topicsMap, tests, settings, allenData: allen };
  const blocks = buildPlan(input);
  const target = settings.dailyTargetMinutes ?? 300;
  const phaseInfo = testCyclePhase(tests, date);
  const tz = settings.timezone ?? "Asia/Kolkata";
  const dayStart = tzStartOfDay(date, tz);

  // persist plan
  const [plan] = await db
    .insert(schema.studyPlans)
    .values({
      userId,
      date: dayStart,
      targetMinutes: target,
      isFullDay: !isSchoolDay(settings, date),
      schedule: blocks,
      source: "deterministic",
      status: "active",
    })
    .onConflictDoUpdate({
      target: [schema.studyPlans.userId, schema.studyPlans.date],
      set: { schedule: blocks, targetMinutes: target, updatedAt: new Date() },
    })
    .returning();

  // create scheduled session rows for non-break blocks (upsert by plannedStart)
  for (const b of blocks) {
    if (b.subjectId === null && (b.subject === "Break" || b.subject === "Dinner")) continue;
    const existing = await db
      .select({ id: schema.studySessions.id })
      .from(schema.studySessions)
      .where(
        and(
          eq(schema.studySessions.userId, userId),
          eq(schema.studySessions.plannedStart, new Date(b.start))
        )
      )
      .limit(1);
    if (existing.length) continue;
    await db.insert(schema.studySessions).values({
      userId,
      subjectId: b.subjectId ?? null,
      planId: plan.id,
      title: b.goal,
      goal: b.goal,
      questionCount: b.questionCount ?? null,
      plannedDurationMinutes: b.minutes,
      plannedStart: new Date(b.start),
      plannedEnd: new Date(b.end),
      status: "scheduled",
      sessionType: b.type,
    });
  }

  const aiNote = aiNoteEnabled()
    ? await coach.scheduleRecommendation({
        phase: phaseInfo.phase,
        subjects: subjects.map((s) => s.name),
        targetMinutes: target,
        isSchoolDay: isSchoolDay(settings, date),
      }).catch(() => null)
    : null;

  return {
    planId: plan.id,
    blocks,
    targetMinutes: target,
    phase: phaseInfo.phase,
    nextTestName: phaseInfo.nextTest?.name,
    daysToNextTest: phaseInfo.daysLeft,
    isSchoolDay: isSchoolDay(settings, date),
    aiNote,
  };
}

function aiNoteEnabled(): boolean {
  return Boolean(process.env.AI_PROVIDER) && process.env.AI_PROVIDER !== "deterministic";
}

export async function planForDate(userId: number, date: Date): Promise<GeneratedPlan | null> {
  const [settings] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId)).limit(1);
  const tz = settings?.timezone ?? "Asia/Kolkata";
  const dayStart = tzStartOfDay(date, tz);
  const plan = await db
    .select()
    .from(schema.studyPlans)
    .where(
      and(
        eq(schema.studyPlans.userId, userId),
        gte(schema.studyPlans.date, dayStart),
        lt(schema.studyPlans.date, addMinutes(dayStart, 24 * 60))
      )
    )
    .limit(1);
  if (!plan.length) return null;
  const p = plan[0];
  const blocks = (p.schedule ?? []) as PlanBlock[];
  return {
    planId: p.id,
    blocks,
    targetMinutes: p.targetMinutes ?? 300,
    phase: "build",
    isSchoolDay: p.isFullDay ? false : true,
  };
}