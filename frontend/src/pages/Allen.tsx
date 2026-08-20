import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { Card, CardHeader, EmptyState, StatusBadge } from "../components/ui";
import { IconCloud } from "../lib/icons";

export default function Allen() {
  const [data, setData] = useState<any>(null);
  const [config, setConfig] = useState({ token: "", portalUrl: "" });
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const d = await apiClient.allenData().catch(() => null);
    setData(d);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await apiClient.allenConfigure(config);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      await apiClient.allenSync();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  const status = data?.status ?? "unconfigured";
  const tests = data?.tests ?? [];
  const perfs = data?.performance ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">ALLEN INTEGRATION</h1>
        <p className="text-sm text-muted-foreground">Pull your real Allen tests & scores so the coach plans around actual data.</p>
      </div>

      <Card>
        <CardHeader title="Connection" right={<StatusBadge label={status} ok={status === "connected"} />} />
        <form onSubmit={saveConfig} className="space-y-3">
          <div className="space-y-1">
            <label className="label">Allen portal URL</label>
            <input className="input" value={config.portalUrl} onChange={(e) => setConfig({ ...config, portalUrl: e.target.value })} placeholder="https://portal.allencareer.in (optional)" />
          </div>
          <div className="space-y-1">
            <label className="label">Session token</label>
            <input className="input" value={config.token} onChange={(e) => setConfig({ ...config, token: e.target.value })} placeholder="From your Allen portal login (optional)" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary"><IconCloud className="w-4 h-4" /> Save config</button>
            <button type="button" className="btn-outline" onClick={sync} disabled={syncing}>{syncing ? "Syncing…" : "Sync now"}</button>
          </div>
        </form>
      </Card>

      {status === "unconfigured" && (
        <EmptyState
          title="No Allen data connected yet"
          body="You can also just enter your test scores manually in the Tests page — the coach uses both sources."
        />
      )}

      {tests.length > 0 && (
        <Card>
          <CardHeader title="Synced tests" />
          <ul className="space-y-1 text-sm">
            {tests.map((t: any, i: number) => (
              <li key={i} className="flex justify-between py-1 border-b border-border/40 last:border-0">
                <span>{t.name ?? t.testName}</span>
                <span className="text-muted-foreground">{t.score != null ? `${t.score}%` : t.date}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {perfs.length > 0 && (
        <Card>
          <CardHeader title="Performance snapshot" />
          <div className="grid grid-cols-3 gap-3 text-center">
            {perfs.map((p: any, i: number) => (
              <div key={i}>
                <div className="text-2xl font-bold">{p.value}</div>
                <div className="text-xs text-muted-foreground">{p.label}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}