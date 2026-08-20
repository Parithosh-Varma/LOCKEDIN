import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../lib/api";
import { fmtClock, fmtTime, hourGreeting, fmtDuration } from "../lib/format";
import { Card, CardHeader, Stat, ProgressBar } from "../components/ui";
import { IconZap, IconCalendar, IconTarget, IconPlay, IconSend } from "../lib/icons";

export default function Dashboard() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    apiClient.dashboard().then(setData).catch(() => undefined);
  }, []);

  if (!data) return <div className="text-muted-foreground">Loading…</div>;

  const d = data.data ?? data;
  const stats = d.stats ?? d.today ?? {};
  const next = d.nextSession ?? d.today?.nextSession;

  const total = stats.dailyTargetMinutes ?? 300;
  const done = stats.actualMinutes ?? stats.focusTimeSeconds ? Math.round((stats.focusTimeSeconds ?? 0) / 60) : 0;
  const fraction = total > 0 ? done / total : 0;
  const streak = d.streakDays ?? stats.streakDays ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-widest">{hourGreeting()}</div>
          <h1 className="text-2xl font-bold tracking-tight mt-1">DASHBOARD</h1>
        </div>
        <Link to="/session" className="btn-primary"><IconPlay className="w-4 h-4" /> Start session</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Today" value={fmtClock((done ?? 0) * 60_000)} sub={`of ${total} min target`} />
        <Stat label="Streak" value={`${streak}d`} sub="days locked in" />
        <Stat label="Next session" value={next ? fmtTime(next.start) : "—"} sub={next?.subject ?? "no plan yet"} />
        <Stat label="Tests" value={d.tests?.upcoming ?? d.upcomingTests ?? 0} sub="upcoming" />
      </div>

      <Card>
        <CardHeader title="Daily progress" subtitle={`${Math.round(fraction * 100)}% of today's target`} right={<span className="text-sm font-medium">{done}/{total} min</span>} />
        <ProgressBar fraction={fraction} />
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Next session" right={<IconCalendar className="w-4 h-4 text-muted-foreground" />} />
          {next ? (
            <div className="space-y-3">
              <div>
                <div className="text-lg font-bold tracking-tight">{next.subject}</div>
                <div className="text-sm text-muted-foreground">{next.goal}</div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{fmtTime(next.start)}</span>·<span>{next.minutes} min</span>
                {next.questionCount && <span>· {next.questionCount} Qs</span>}
              </div>
              <Link to="/session" className="btn-primary w-full"><IconPlay className="w-4 h-4" /> Start now</Link>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No session scheduled yet. Generate today's plan.</div>
          )}
        </Card>

        <Card>
          <CardHeader title="Today's plan" right={<IconTarget className="w-4 h-4 text-muted-foreground" />} />
          {(d.plan?.blocks ?? d.today?.blocks ?? []).filter((b: any) => b.subject !== "Break" && b.subject !== "Dinner").slice(0, 5).map((b: any, i: number) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-sm">{b.subject}</span>
              </div>
              <div className="text-xs text-muted-foreground">{fmtTime(b.start)} · {b.minutes}m</div>
            </div>
          ))}
          {!d.plan?.blocks && !d.today?.blocks && <div className="text-sm text-muted-foreground">No plan for today.</div>}
        </Card>
      </div>

      <Card className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><IconSend className="w-5 h-5 text-primary" /></div>
        <div className="flex-1">
          <div className="font-medium">Telegram NUCLEAR ACCOUNTABILITY MODE</div>
          <div className="text-sm text-muted-foreground">Get nagged, bullied and celebrated by @lockedinvarmaBot.</div>
        </div>
        <Link to="/telegram" className="btn-outline">Configure</Link>
      </Card>
    </div>
  );
}