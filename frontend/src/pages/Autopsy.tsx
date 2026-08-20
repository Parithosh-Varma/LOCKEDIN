import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { fmtDate } from "../lib/format";
import { Card, CardHeader, EmptyState } from "../components/ui";

export default function Autopsy() {
  const [tests, setTests] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [autopsy, setAutopsy] = useState<any>(null);

  useEffect(() => {
    apiClient.tests().then((t) => {
      const past = (t.tests ?? t ?? []).filter((x: any) => x.score != null);
      setTests(past);
      const url = new URLSearchParams(window.location.search).get("test");
      if (url && past.some((p: any) => String(p.id) === url)) setSelectedId(Number(url));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (selectedId == null) return;
    apiClient.autopsy(selectedId).then(setAutopsy).catch(() => setAutopsy(null));
  }, [selectedId]);

  const t = tests.find((x) => x.id === selectedId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">TEST AUTOPSY</h1>
        <p className="text-sm text-muted-foreground">Break down every wrong answer. Turn mistakes into a study plan.</p>
      </div>

      {tests.length === 0 ? (
        <EmptyState title="No completed tests" body="Score a test from the Tests page to run an autopsy." />
      ) : (
        <div className="flex flex-wrap gap-2">
          {tests.map((x) => (
            <button key={x.id} onClick={() => setSelectedId(x.id)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${selectedId === x.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}>
              {x.name} · {x.score}%
            </button>
          ))}
        </div>
      )}

      {selectedId && !autopsy && <div className="text-muted-foreground">Running autopsy…</div>}

      {autopsy && (
        <div className="space-y-6">
          <Card>
            <CardHeader title={t?.name ?? "Autopsy"} subtitle={fmtDate(t?.date)} right={<span className="text-2xl font-bold">{t?.score}%</span>} />
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center"><div className="text-2xl font-bold">{autopsy.totalQuestions ?? t?.totalQuestions ?? "—"}</div><div className="text-xs text-muted-foreground">questions</div></div>
              <div className="text-center"><div className="text-2xl font-bold text-destructive">{autopsy.wrongCount ?? "—"}</div><div className="text-xs text-muted-foreground">wrong</div></div>
              <div className="text-center"><div className="text-2xl font-bold">{autopsy.accuracy != null ? `${Math.round(autopsy.accuracy * 100)}%` : "—"}</div><div className="text-xs text-muted-foreground">accuracy</div></div>
            </div>
          </Card>

          {autopsy.summary && (
            <Card>
              <CardHeader title="Coach summary" />
              <p className="text-sm text-muted-foreground leading-relaxed">{autopsy.summary}</p>
            </Card>
          )}

          {autopsy.insights && autopsy.insights.length > 0 && (
            <Card>
              <CardHeader title="Root causes" />
              <ul className="space-y-2">
                {autopsy.insights.map((i: any, idx: number) => (
                  <li key={idx} className="text-sm flex gap-2">
                    <span className="text-primary">•</span>
                    <span>{typeof i === "string" ? i : `${i.topic}: ${i.note}`}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {autopsy.plan && (
            <Card>
              <CardHeader title="Recovery plan" subtitle="Auto-scheduled into your next study days" />
              <ul className="space-y-2">
                {(autopsy.plan.topics ?? autopsy.plan).map((p: any, idx: number) => (
                  <li key={idx} className="text-sm flex gap-2">
                    <span className="text-primary">•</span>
                    <span>{typeof p === "string" ? p : `${p.topic}: ${p.action}${p.minutes ? ` (${p.minutes} min)` : ""}`}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}