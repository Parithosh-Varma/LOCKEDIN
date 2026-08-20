import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { Card, CardHeader, Stat } from "../components/ui";
import { IconActivity } from "../lib/icons";

export default function Analytics() {
  const [proc, setProc] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);

  useEffect(() => {
    apiClient.statsProcrastination().then(setProc).catch(() => undefined);
    apiClient.statsHistory().then(setHistory).catch(() => undefined);
  }, []);

  const p = proc?.stats ?? proc ?? {};
  const h = history?.days ?? history ?? [];

  const totalInterruptions = (p.totalInterruptions ?? 0);
  const worstHour = p.worstHour ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">ANALYTICS</h1>
        <p className="text-sm text-muted-foreground">Deep patterns: when you slip, why you slip, and what to do about it.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Interruptions" value={totalInterruptions} sub="all time" />
        <Stat label="Avg breaks/session" value={p.avgInterruptionsPerSession != null ? p.avgInterruptionsPerSession.toFixed(1) : "—"} />
        <Stat label="Worst hour" value={worstHour != null ? `${worstHour}:00` : "—"} sub="most distraction" />
        <Stat label="Lost minutes est." value={p.estimatedLostMinutes ?? "—"} sub="to distractions" />
      </div>

      <Card>
        <CardHeader title="Distraction by hour" subtitle="Focus events broken down by time of day" right={<IconActivity className="w-4 h-4 text-muted-foreground" />} />
        <div className="flex items-end gap-1 h-36">
          {(p.byHour ?? []).map((b: any, i: number) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="text-[9px] text-muted-foreground">{b.count || ""}</div>
              <div className="w-full rounded-t bg-destructive/70" style={{ height: `${Math.min(100, (b.count ?? 0) * 10)}%` }} />
              <div className="text-[9px] text-muted-foreground">{i}</div>
            </div>
          ))}
          {(p.byHour ?? []).length === 0 && <div className="text-sm text-muted-foreground py-14 text-center w-full">No data yet.</div>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Insight" />
        <p className="text-sm text-muted-foreground leading-relaxed">
          {p.insight || "The coach is still learning your patterns. Keep studying — data makes the magic."}
        </p>
      </Card>

      {h.length > 0 && (
        <Card>
          <CardHeader title="Daily history" subtitle="Last 14 days" />
          <div className="grid grid-cols-7 gap-1.5">
            {h.slice(-14).map((d: any, i: number) => {
              const f = Math.min(1, (d.minutes ?? 0) / 300);
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className={`w-full rounded-md ${f > 0 ? "bg-primary" : "bg-muted"} transition-all`} style={{ height: `${Math.max(4, f * 48)}px` }} />
                  <div className="text-[9px] text-muted-foreground">{d.label ?? i + 1}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}