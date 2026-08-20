import { ai, coachSystemPrompt } from "../lib/ai.js";
import type { StudySession } from "../db/schema.js";

/**
 * StudyCoach — provider-independent message engine.
 * Every method has a deterministic fallback so the system works with zero AI.
 */
export class StudyCoach {
  private async maybe(
    role: string,
    user: string,
    fallback: string
  ): Promise<string> {
    if (!ai.enabled) return fallback;
    const generated = await ai.chat(coachSystemPrompt(role), user, {
      temperature: 0.8,
    });
    return generated || fallback;
  }

  motivation(ctx: { streak?: number; remaining?: number; hour?: number }): Promise<string> {
    const hour = ctx.hour ?? new Date().getHours();
    const greeting = hour < 12 ? "GOOD MORNING." : hour < 17 ? "GOOD AFTERNOON." : "GOOD EVENING.";
    const fallback = `${greeting}\n\nYou don't need motivation. You need to start.\nOpen a session and do the work.`;
    return this.maybe("motivation", JSON.stringify(ctx), fallback);
  }

  sessionStart(session: Partial<StudySession>): Promise<string> {
    const fallback = `Session started.\n${session.title ?? "Study session"}.\nYou committed to this. Now work.`;
    return this.maybe("session start", JSON.stringify(session), fallback);
  }

  interruption(count: number): Promise<string> {
    const fallback =
      count === 1
        ? "You left the session.\nGet back to work."
        : count === 2
        ? "You're doing exactly what you're trying to stop doing.\nStop switching away."
        : "You've already lost enough time.\nReturn to your goal.";
    return this.maybe("interruption escalation", JSON.stringify({ count }), fallback);
  }

  procrastinationIntervention(data: { minutesLate?: number; abandonCount?: number }): Promise<string> {
    const m = data.minutesLate ?? 0;
    const fallback =
      m >= 15
        ? `You're ${m} minutes late.\nThe test isn't going to wait for you.\nStart now.`
        : m >= 5
        ? "You're still not studying.\nStart the session. Now."
        : "You're procrastinating again.\nStop negotiating with yourself. Start.";
    return this.maybe("procrastination intervention", JSON.stringify(data), fallback);
  }

  sessionComplete(session: Partial<StudySession>): Promise<string> {
    const fallback = `Session complete.\n${session.title ?? "Well done."}\nRecorded and counted.\nNext session is waiting.`;
    return this.maybe("session completion", JSON.stringify(session), fallback);
  }

  lateStart(minutes: number): Promise<string> {
    const fallback = `Your session started ${minutes} minutes ago.\nYou're late. Start now.`;
    return this.maybe("late start", JSON.stringify({ minutes }), fallback);
  }

  breakStart(minutes: number): Promise<string> {
    return Promise.resolve(`Break.\n${minutes} minutes. Don't let it become a procrastination session.`);
  }

  breakEnding(): Promise<string> {
    return Promise.resolve("Break ends in 60 seconds.\nBack to your desk.");
  }

  backToWork(): Promise<string> {
    return Promise.resolve("Back to work.");
  }

  dailyReport(data: Record<string, unknown>): Promise<string> {
    const c = data.completedMinutes as number;
    const t = data.targetMinutes as number;
    const pct = Math.round(((c ?? 0) / Math.max(1, t ?? 1)) * 100);
    const fallback =
      pct >= 80
        ? `Solid day. ${pct}% of target. Keep this going tomorrow.`
        : pct >= 50
        ? `${pct}% of target. Acceptable, but you know the gap. Tomorrow starts on time.`
        : `You planned ${t}m and completed ${c}m. That's a bad day.\nTomorrow, recover by starting the first session on time.`;
    return this.maybe("daily report analysis", JSON.stringify(data), fallback);
  }

  weeklyReport(data: Record<string, unknown>): Promise<string> {
    const fallback = `Week done.\n${data.sessionsCompleted ?? "?"}/${data.sessionsPlanned ?? "?"} sessions.\nMain issue: ${data.mainIssue ?? "inconsistent starts"}.\nNext week's priority: ${data.nextPriority ?? "show up on time."}`;
    return this.maybe("weekly report analysis", JSON.stringify(data), fallback);
  }

  testAutopsy(data: Record<string, unknown>): Promise<string> {
    const fallback = `Your main problem wasn't lack of available study time.\nYou repeatedly lost focus during sessions and left several planned sessions incomplete.\nNext cycle: shorter initial sessions, higher accountability, more practice on weak topics.`;
    return this.maybe("test autopsy analysis", JSON.stringify(data), fallback);
  }

  scheduleRecommendation(data: Record<string, unknown>): Promise<string> {
    const fallback = `Today: prioritise your weakest subject in the first slot.\nKeep sessions short and accountable.`;
    return this.maybe("schedule recommendation", JSON.stringify(data), fallback);
  }
}

export const coach = new StudyCoach();