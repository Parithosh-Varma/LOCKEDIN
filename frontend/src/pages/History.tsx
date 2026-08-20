import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { fmtDate, fmtTime } from "../lib/format";
import { Card, EmptyState } from "../components/ui";

export default function History() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    apiClient.sessions().then((s) => setSessions(s.sessions ?? s ?? [])).catch(() => undefined);
  }, []);

  const list = (sessions || []).filter((s) => {
    if (filter === "all") return true;
    return s.status === filter;
  });

  const counts = (sessions || []).reduce((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">HISTORY</h1>
        <p className="text-sm text-muted-foreground">Every session, ever. Your receipts.</p>
      </div>

      <div className="flex gap-2">
        {["all", "completed", "abandoned", "committed", "scheduled"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${filter === f ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}>
            {f} {f !== "all" && counts[f] ? `(${counts[f]})` : ""}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState title="Nothing here" body="Complete a session and it will show up here." />
      ) : (
        <div className="space-y-2">
          {list.map((s) => (
            <Card key={s.id} className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-medium truncate">{s.title ?? s.goal}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {fmtDate(s.actualStart ?? s.plannedAt)} · {s.actualStart ? fmtTime(s.actualStart) : "planned"} · {s.plannedDurationMinutes} min
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.status === "completed" ? "bg-emerald-500/10 text-emerald-600" : s.status === "abandoned" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                  {s.status}
                </div>
                {s.focusTimeSeconds != null && <div className="text-[11px] text-muted-foreground mt-1">{(s.focusTimeSeconds / 60).toFixed(0)}m focus</div>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}