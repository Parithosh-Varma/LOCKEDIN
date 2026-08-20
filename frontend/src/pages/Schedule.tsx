import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../lib/api";
import { fmtTime } from "../lib/format";
import { Card, EmptyState, ProgressBar } from "../components/ui";
import { IconRefresh, IconPlay } from "../lib/icons";

export default function Schedule() {
  const [blocks, setBlocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  async function load(d: string) {
    setLoading(true);
    try {
      const p = await apiClient.planToday();
      setBlocks(p.blocks ?? []);
    } catch {
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(date);
    apiClient.settings().then(setSettings).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    setGenerating(true);
    try {
      const p = await apiClient.planGenerate();
      setBlocks(p.blocks ?? []);
    } finally {
      setGenerating(false);
    }
  }

  const sessions = blocks.filter((b) => b.subject !== "Break" && b.subject !== "Dinner");
  const totalMin = sessions.reduce((s, b) => s + (b.minutes ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">SCHEDULE</h1>
          <p className="text-sm text-muted-foreground">{date} · {sessions.length} sessions · {totalMin} min</p>
        </div>
        <button className="btn-primary" onClick={generate} disabled={generating}>
          <IconRefresh className="w-4 h-4" /> {generating ? "Generating…" : "Regenerate plan"}
        </button>
      </div>

      <input type="date" className="input max-w-xs" value={date} onChange={(e) => setDate(e.target.value)} />

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : blocks.length === 0 ? (
        <EmptyState
          title="No plan for today"
          body="Today might be a no-school day, or the plan hasn't been generated yet. Generate one now."
          action={<button className="btn-primary" onClick={generate}><IconRefresh className="w-4 h-4" /> Generate plan</button>}
        />
      ) : (
        <div className="space-y-2">
          {blocks.map((b, i) => {
            const isBreak = b.subject === "Break" || b.subject === "Dinner";
            return (
              <div key={i} className={`card p-4 ${isBreak ? "opacity-70" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-16 shrink-0 text-sm font-medium">{fmtTime(b.start)}</div>
                    <div>
                      <div className="font-medium">{b.subject}</div>
                      <div className="text-sm text-muted-foreground">{b.goal}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{b.minutes} min</span>
                    {!isBreak && (
                      <Link to="/session" className="btn-ghost text-sm"><IconPlay className="w-3.5 h-3.5" /> Start</Link>
                    )}
                  </div>
                </div>
                {b.minutes > 0 && <div className="mt-3"><ProgressBar fraction={b.donePercent ?? 0} /></div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}