import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { fmtTime } from "../lib/format";
import { Card, CardHeader, Stat, ProgressBar } from "../components/ui";
import { IconChart } from "../lib/icons";

export default function Performance() {
  const [stats, setStats] = useState<any>(null);
  const [weekly, setWeekly] = useState<any>(null);
  const [subjects, setSubjects] = useState<any[]>([]);

  useEffect(() => {
    apiClient.statsWeekly().then(setWeekly).catch(() => undefined);
    apiClient.subjects().then((s) => setSubjects(s.subjects ?? s ?? [])).catch(() => undefined);
    apiClient.statsToday().then(setStats).catch(() => undefined);
  }, []);

  const w = weekly ?? {};
  const today = stats ?? {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">PERFORMANCE</h1>
        <p className="text-sm text-muted-foreground">Your consistency, streak, and subject mastery.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Weekly study" value={w.weekMinutes ? `${Math.round(w.weekMinutes / 60)}h` : "—"} sub={w.weekMinutes ? `${Math.round((w.weekMinutes / (7 * 300)) * 100)}% of target` : undefined} />
        <Stat label="Streak" value={w.streakDays ?? "—"} sub="days in a row" />
        <Stat label="Best day" value={w.bestDay ? fmtTime(w.bestDay) : "—"} />
        <Stat label="Avg / day" value={w.avgPerDay ? `${Math.round(w.avgPerDay)} min` : "—"} />
      </div>

      <Card>
        <CardHeader title="This week" subtitle="Daily minutes vs 300 min target" right={<IconChart className="w-4 h-4 text-muted-foreground" />} />
        <div className="flex items-end gap-2 h-40">
          {(w.daily ?? []).slice(-7).map((d: any, i: number) => {
            const f = Math.min(1, (d.minutes ?? 0) / 300);
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[10px] text-muted-foreground">{Math.round(d.minutes ?? 0)}</div>
                <div className="w-full rounded-t-md bg-primary/80" style={{ height: `${Math.max(4, f * 100)}%` }} />
                <div className="text-[10px] text-muted-foreground">{d.label ?? i}</div>
              </div>
            );
          })}
          {(w.daily ?? []).length === 0 && <div className="text-sm text-muted-foreground py-16 text-center w-full">No weekly data yet.</div>}
        </div>
      </Card>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Subject mastery</h2>
        <div className="space-y-3">
          {(subjects || []).length === 0 && <EmptyStateCard />}
          {(subjects || []).map((s) => (
            <Card key={s.id}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{s.name}</div>
                <div className="text-sm text-muted-foreground">{s.mastery != null ? `${Math.round(s.mastery * 100)}%` : "—"}</div>
              </div>
              <ProgressBar fraction={s.mastery ?? 0} />
              <div className="text-xs text-muted-foreground mt-1">
                {s.weakTopics ?? 0} weak topics · {s.avgScore != null ? `avg score ${Math.round(s.avgScore)}%` : "no test scores yet"}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader title="Procrastination insight" subtitle="What the coach notices" />
        <div className="text-sm text-muted-foreground">
          {(w.procrastinationInsight ?? today.procrastinationInsight) || "No pattern detected yet. Study a few days and the coach will start spotting your distraction triggers."}
        </div>
      </Card>
    </div>
  );
}

function EmptyStateCard() {
  return <Card className="text-sm text-muted-foreground text-center py-8">No subjects yet. Add subjects in Settings.</Card>;
}