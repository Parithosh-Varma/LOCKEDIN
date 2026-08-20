import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  serial,
  real,
  uniqueIndex,
  index,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const tz = { withTimezone: true };

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull().default("Student"),
    phone: text("phone"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)]
);

export const settings = pgTable("settings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  dailyTargetMinutes: integer("daily_target_minutes").notNull().default(300),
  schoolStartHour: integer("school_start_hour").notNull().default(15), // 3 PM default window start
  schoolStartMinute: integer("school_start_minute").notNull().default(30),
  schoolDays: jsonb("school_days")
    .notNull()
    .default(sql`'[1,2,3,4,5,6]'::jsonb`), // 0=Sunday .. 6=Saturday
  noSchoolDays: jsonb("no_school_days").notNull().default(sql`'[]'::jsonb`),
  minSessionMinutes: integer("min_session_minutes").notNull().default(25),
  maxSessionMinutes: integer("max_session_minutes").notNull().default(60),
  breakMinutes: integer("break_minutes").notNull().default(10),
  shortBreakMinutes: integer("short_break_minutes").notNull().default(5),
  focusLockEnabled: boolean("focus_lock_enabled").notNull().default(false),
  webcamEnabled: boolean("webcam_enabled").notNull().default(true),
  screenEnabled: boolean("screen_enabled").notNull().default(true),
  youtubeMusicUrl: text("youtube_music_url"),
  musicVolume: integer("music_volume").notNull().default(40),
  musicEnabled: boolean("music_enabled").notNull().default(true),
  telegramConnected: boolean("telegram_connected").notNull().default(false),
  telegramChatId: text("telegram_chat_id"),
  aiProvider: text("ai_provider").notNull().default("deterministic"),
  testCycleDays: integer("test_cycle_days").notNull().default(21),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  midnightWindowHour: integer("midnight_window_hour").notNull().default(4),
  allowMorningOnSchoolDays: boolean("allow_morning_on_school_days")
    .notNull()
    .default(false),
  quitReasonWhitelist: jsonb("quit_reason_whitelist").notNull().default(
    sql`'["Finished goal","Emergency","Too distracted","Tired","Gave up","Other"]'::jsonb`
  ),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

export const subjects = pgTable(
  "subjects",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#6366f1"),
    priority: integer("priority").notNull().default(50), // 0-100
    weeklyAllocation: integer("weekly_allocation").notNull().default(0),
    difficulty: integer("difficulty").notNull().default(50), // 0-100
    isWeak: boolean("is_weak").notNull().default(false),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("subjects_user_name_idx").on(t.userId, t.name)]
);

export const topics = pgTable(
  "topics",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: integer("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mastery: integer("mastery").notNull().default(0), // 0-100
    questionAccuracy: real("question_accuracy").notNull().default(0),
    attempted: integer("attempted").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    isWeak: boolean("is_weak").notNull().default(false),
    lastPracticedAt: timestamp("last_practiced_at", tz),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("topics_subject_name_idx").on(t.subjectId, t.name),
    index("topics_user_idx").on(t.userId),
  ]
);

export const tests = pgTable(
  "tests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    source: text("source").notNull().default("manual"), // manual | allen
    date: timestamp("date", tz).notNull(),
    subjects: jsonb("subjects").notNull().default(sql`'[]'::jsonb`),
    syllabus: jsonb("syllabus").notNull().default(sql`'[]'::jsonb`), // [{subject, topics: []}]
    totalMarks: integer("total_marks"),
    status: text("status").notNull().default("upcoming"), // upcoming | completed | in-progress
    score: integer("score"),
    maxMarks: integer("max_marks"),
    rank: integer("rank"),
    percentile: real("percentile"),
    timeSpent: integer("time_spent"),
    questionWise: jsonb("question_wise").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [index("tests_user_date_idx").on(t.userId, t.date)]
);

export const studySessions = pgTable(
  "study_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: integer("subject_id").references(() => subjects.id, {
      onDelete: "set null",
    }),
    planId: integer("plan_id").references(() => studyPlans.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    goal: text("goal").notNull(),
    questionCount: integer("question_count"),
    plannedDurationMinutes: integer("planned_duration_minutes").notNull(),
    plannedStart: timestamp("planned_start", tz),
    plannedEnd: timestamp("planned_end", tz),
    actualStart: timestamp("actual_start", tz),
    actualEnd: timestamp("actual_end", tz),
    status: text("status").notNull().default("scheduled"), // scheduled | committed | active | paused | completed | abandoned
    focusTimeSeconds: integer("focus_time_seconds").notNull().default(0),
    activeTimeSeconds: integer("active_time_seconds").notNull().default(0),
    interruptions: integer("interruptions").notNull().default(0),
    tabSwitches: integer("tab_switches").notNull().default(0),
    focusScore: real("focus_score").notNull().default(0), // 0-100
    completedQuestions: integer("completed_questions").notNull().default(0),
    quitReason: text("quit_reason"),
    completedAt: timestamp("completed_at", tz),
    sessionType: text("session_type").notNull().default("questions"), // questions | theory | revision | test-prep | timed-practice | dpp
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_date_idx").on(t.userId, t.plannedStart)]
);

export const studyPlans = pgTable(
  "study_plans",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: timestamp("date", tz).notNull(),
    targetMinutes: integer("target_minutes").notNull().default(300),
    isFullDay: boolean("is_full_day").notNull().default(false),
    isGenerated: boolean("is_generated").notNull().default(true),
    status: text("status").notNull().default("active"),
    schedule: jsonb("schedule").notNull().default(sql`'[]'::jsonb`),
    source: text("source").notNull().default("manual"), // manual | ai | deterministic | allen
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plans_user_date_idx").on(t.userId, t.date)]
);

export const focusEvents = pgTable(
  "focus_events",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => studySessions.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // focus-broken | returned | inactivity | tab-switch | presence | session-start | session-end
    at: timestamp("at", tz).notNull().defaultNow(),
    detail: text("detail"),
  },
  (t) => [index("focus_events_session_idx").on(t.sessionId)]
);

export const interruptions = pgTable(
  "interruptions",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => studySessions.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // tab-switch | window-blur | inactivity | screen-hidden | other
    startAt: timestamp("start_at", tz).notNull(),
    endAt: timestamp("end_at", tz),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    reported: boolean("reported").notNull().default(false),
  },
  (t) => [index("interruptions_session_idx").on(t.sessionId)]
);

export const procrastinationEvents = pgTable(
  "procrastination_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: integer("session_id").references(() => studySessions.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(), // late-start | abandoned | ignored-reminder | sniped-break | early-end
    at: timestamp("at", tz).notNull().defaultNow(),
    detail: text("detail"),
    resolved: boolean("resolved").notNull().default(false),
  },
  (t) => [index("procrastination_user_idx").on(t.userId, t.at)]
);

export const telegramUsers = pgTable("telegram_users", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  chatId: text("chat_id").notNull(),
  username: text("username"),
  firstName: text("first_name"),
  verified: boolean("verified").notNull().default(false),
  verificationCode: text("verification_code"),
  lastInteraction: timestamp("last_interaction", tz),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const dailyStats = pgTable(
  "daily_stats",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: timestamp("date", tz).notNull(),
    targetMinutes: integer("target_minutes").notNull().default(0),
    completedMinutes: integer("completed_minutes").notNull().default(0),
    focusTimeMinutes: integer("focus_time_minutes").notNull().default(0),
    sessionsPlanned: integer("sessions_planned").notNull().default(0),
    sessionsCompleted: integer("sessions_completed").notNull().default(0),
    sessionsMissed: integer("sessions_missed").notNull().default(0),
    interruptions: integer("interruptions").notNull().default(0),
    tabSwitches: integer("tab_switches").notNull().default(0),
    avgFocusScore: real("avg_focus_score").notNull().default(0),
    streak: integer("streak").notNull().default(0),
    reportSent: boolean("report_sent").notNull().default(false),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("daily_stats_user_date_idx").on(t.userId, t.date)]
);

export const weeklyStats = pgTable(
  "weekly_stats",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: timestamp("week_start", tz).notNull(),
    weekEnd: timestamp("week_end", tz).notNull(),
    plannedMinutes: integer("planned_minutes").notNull().default(0),
    completedMinutes: integer("completed_minutes").notNull().default(0),
    sessionsPlanned: integer("sessions_planned").notNull().default(0),
    sessionsCompleted: integer("sessions_completed").notNull().default(0),
    sessionsMissed: integer("sessions_missed").notNull().default(0),
    avgFocusMinutes: integer("avg_focus_minutes").notNull().default(0),
    mostInterruptedSubject: text("most_interrupted_subject"),
    bestSubject: text("best_subject"),
    weakestSubject: text("weakest_subject"),
    mainIssue: text("main_issue"),
    reportSent: boolean("report_sent").notNull().default(false),
    reportData: jsonb("report_data").default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("weekly_stats_user_week_idx").on(t.userId, t.weekStart)]
);

export const testAutopsies = pgTable(
  "test_autopsies",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    testId: integer("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("autopsy_test_idx").on(t.testId)]
);

export const allenData = pgTable(
  "allen_data",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("manual"),
    raw: jsonb("raw").notNull().default(sql`'{}'::jsonb`),
    lastSyncAt: timestamp("last_sync_at", tz),
    syncStatus: text("sync_status").notNull().default("not-connected"),
    error: text("error"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [index("allen_user_idx").on(t.userId)]
);

export const coachMessages = pgTable(
  "coach_messages",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: integer("session_id").references(() => studySessions.id, {
      onDelete: "set null",
    }),
    channel: text("channel").notNull(), // app | telegram
    kind: text("kind").notNull(), // reminder | interruption | motivation | report | autopsy | scheduling | escalation
    message: text("message").notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [index("coach_user_idx").on(t.userId)]
);

export const reminders = pgTable(
  "reminders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: integer("session_id").references(() => studySessions.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(), // session-start | escalation | snooze | followup | break-end | daily-report | weekly-report
    scheduledFor: timestamp("scheduled_for", tz).notNull(),
    fireAt: timestamp("fire_at", tz).notNull(),
    fired: boolean("fired").notNull().default(false),
    firedAt: timestamp("fired_at", tz),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [index("reminders_user_fire_idx").on(t.userId, t.fireAt)]
);

export const streakHistory = pgTable(
  "streak_history",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: timestamp("date", tz).notNull(),
    achieved: boolean("achieved").notNull().default(false),
    completedMinutes: integer("completed_minutes").notNull().default(0),
  },
  (t) => [uniqueIndex("streak_user_date_idx").on(t.userId, t.date)]
);

export type User = typeof users.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type Test = typeof tests.$inferSelect;
export type StudySession = typeof studySessions.$inferSelect;
export type StudyPlan = typeof studyPlans.$inferSelect;
export type FocusEvent = typeof focusEvents.$inferSelect;
export type Interruption = typeof interruptions.$inferSelect;
export type ProcrastinationEvent = typeof procrastinationEvents.$inferSelect;
export type TelegramUser = typeof telegramUsers.$inferSelect;
export type DailyStats = typeof dailyStats.$inferSelect;
export type WeeklyStats = typeof weeklyStats.$inferSelect;
export type TestAutopsy = typeof testAutopsies.$inferSelect;
export type AllenData = typeof allenData.$inferSelect;
export type CoachMessage = typeof coachMessages.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type StreakHistory = typeof streakHistory.$inferSelect;