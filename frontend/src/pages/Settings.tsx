import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { Card, CardHeader } from "../components/ui";

export default function Settings() {
  const [s, setS] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [newSubject, setNewSubject] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [newTopicSubject, setNewTopicSubject] = useState<number | "">("");
  const [ai, setAi] = useState<any>(null);

  async function load() {
    const settings = await apiClient.settings();
    setS(settings.settings ?? settings);
    const subj = await apiClient.subjects();
    setSubjects(subj.subjects ?? subj ?? []);
    apiClient.aiStatus().then(setAi).catch(() => undefined);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await apiClient.updateSettings(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (!s) return <div className="text-muted-foreground">Loading…</div>;

  async function addSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubject.trim()) return;
    await apiClient.addSubject(newSubject.trim());
    setNewSubject("");
    const subj = await apiClient.subjects();
    setSubjects(subj.subjects ?? subj ?? []);
  }

  async function addTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!newTopic.trim() || newTopicSubject === "") return;
    await apiClient.addTopic(Number(newTopicSubject), newTopic.trim());
    setNewTopic("");
    setNewTopicSubject("");
  }

  async function toggleTopic(t: any) {
    await apiClient.updateTopic(t.id, { isWeak: !t.isWeak });
    const subj = await apiClient.subjects();
    setSubjects(subj.subjects ?? subj ?? []);
  }

  const toggle = (key: string) => {
    setS({ ...s, [key]: !s[key] });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">SETTINGS</h1>
          <p className="text-sm text-muted-foreground">Your study rules, subjects, and accountability weapons.</p>
        </div>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}</button>
      </div>

      <Card>
        <CardHeader title="Daily target" subtitle="How much real study per school day" />
        <div className="flex items-center gap-3">
          <input type="range" min={120} max={480} step={15} value={s.dailyTargetMinutes ?? 300} onChange={(e) => setS({ ...s, dailyTargetMinutes: Number(e.target.value) })} className="flex-1 accent-[hsl(var(--primary))]" />
          <span className="font-bold tabular-nums w-16 text-right">{s.dailyTargetMinutes ?? 300} min</span>
        </div>
      </Card>

      <Card>
        <CardHeader title="School schedule" />
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="label">School start time (IST)</label>
            <input type="time" className="input" value={s.schoolStart ?? "07:00"} onChange={(e) => setS({ ...s, schoolStart: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="label">Study start time (IST)</label>
            <input type="time" className="input" value={s.studyStart ?? "15:30"} onChange={(e) => setS({ ...s, studyStart: e.target.value })} />
          </div>
        </div>
        <div className="mt-4">
          <label className="label mb-2">No-school days</label>
          <div className="flex flex-wrap gap-2">
            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => {
              const key = d.toLowerCase();
              const off = (s.noSchoolDays ?? ["sunday"]).includes(key);
              return (
                <button key={d} onClick={() => {
                  const cur = new Set(s.noSchoolDays ?? ["sunday"]);
                  if (off) cur.delete(key); else cur.add(key);
                  setS({ ...s, noSchoolDays: [...cur] });
                }} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${off ? "border-destructive bg-destructive/10 text-destructive" : "border-border hover:border-primary/40"}`}>
                  {d} {off && "· off"}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Accountability weapons" subtitle="These make the difference between talking and doing" />
        <div className="space-y-3">
          {[
            ["webcamEnabled", "Webcam presence check", "Show a blurred live view of yourself during sessions. Psychological accountability."],
            ["screenEnabled", "Screen monitoring", "Detect tab switches and time away from the session."],
            ["focusLock", "Focus Lock", "Block leaving the page while a session is active."],
            ["musicEnabled", "Study music", "Embed a YouTube study music player in the session page."],
          ].map(([key, title, desc]) => (
            <div key={key} className="flex items-center justify-between gap-4 py-2">
              <div>
                <div className="font-medium text-sm">{title}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </div>
              <button onClick={() => toggle(key)} className={`relative w-11 h-6 rounded-full transition-colors ${s[key] ? "bg-primary" : "bg-muted"}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${s[key] ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Study music" subtitle="Paste any YouTube link (song, lofi, focus mix)" />
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="label">YouTube URL</label>
            <input className="input" value={s.youtubeMusicUrl ?? ""} onChange={(e) => setS({ ...s, youtubeMusicUrl: e.target.value })} placeholder="https://youtu.be/…" />
          </div>
          <div className="flex items-center gap-3">
            <label className="label mb-0">Volume</label>
            <input type="range" min={0} max={100} value={s.musicVolume ?? 40} onChange={(e) => setS({ ...s, musicVolume: Number(e.target.value) })} className="flex-1 accent-[hsl(var(--primary))]" />
            <span className="font-bold tabular-nums w-10 text-right">{s.musicVolume ?? 40}%</span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Subjects" subtitle="What you're studying. The coach plans around these." />
        <form onSubmit={addSubject} className="flex gap-2 mb-4">
          <input className="input flex-1" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="e.g. Chemistry" required />
          <button type="submit" className="btn-primary">Add</button>
        </form>
        <div className="space-y-2">
          {(subjects || []).map((sub) => (
            <div key={sub.id} className="border border-border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">{sub.name}</div>
                <div className="text-xs text-muted-foreground">{(sub.topics ?? []).length} topics</div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(sub.topics ?? []).map((t: any) => (
                  <button key={t.id} onClick={() => toggleTopic(t)} className={`px-2 py-1 rounded-md text-xs font-medium border ${t.isWeak ? "border-destructive bg-destructive/10 text-destructive" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                    {t.name} {t.isWeak && "⚠"}
                  </button>
                ))}
                {(sub.topics ?? []).length === 0 && <span className="text-xs text-muted-foreground">No topics yet.</span>}
              </div>
            </div>
          ))}
          {(subjects || []).length === 0 && <p className="text-sm text-muted-foreground">Add your first subject to start planning.</p>}
        </div>
        <form onSubmit={addTopic} className="flex gap-2 mt-4 pt-4 border-t border-border">
          <select className="input" value={newTopicSubject} onChange={(e) => setNewTopicSubject(Number(e.target.value))} required>
            <option value="">Subject…</option>
            {(subjects || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input className="input flex-1" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="New topic name" required />
          <button type="submit" className="btn-outline">Add topic</button>
        </form>
      </Card>

      <Card>
        <CardHeader title="AI Coach" subtitle="Optional AI-generated insights (falls back to deterministic logic when offline)" />
        <div className="flex items-center gap-2 text-sm">
          <span className={`w-2 h-2 rounded-full ${ai?.available ? "bg-emerald-500" : "bg-amber-500"}`} />
          <span className="text-muted-foreground">{ai?.available ? `Connected (${ai.model})` : "Fallback mode — deterministic coach active"}</span>
        </div>
      </Card>
    </div>
  );
}