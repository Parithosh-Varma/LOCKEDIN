import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../lib/api";
import { fmtDate, fmtTime } from "../lib/format";
import { Card, CardHeader, EmptyState } from "../components/ui";
import { IconBook, IconActivity } from "../lib/icons";

export default function Tests() {
  const [tests, setTests] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ subjectId: "", name: "", date: "", syllabus: "" });

  async function load() {
    try {
      const t = await apiClient.tests();
      setTests(t.tests ?? t ?? []);
    } catch {}
  }

  useEffect(() => {
    load();
    apiClient.subjects().then((s) => setSubjects(s.subjects ?? s ?? [])).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addTest(e: React.FormEvent) {
    e.preventDefault();
    await apiClient.addTest({ subjectId: Number(form.subjectId), name: form.name, date: form.date, syllabus: form.syllabus });
    setShowAdd(false);
    setForm({ subjectId: "", name: "", date: "", syllabus: "" });
    load();
  }

  const upcoming = (tests || []).filter((t) => new Date(t.date) >= new Date()).sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const past = (tests || []).filter((t) => new Date(t.date) < new Date()).sort((a, b) => +new Date(b.date) - +new Date(a.date));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">TESTS & EXAMS</h1>
          <p className="text-sm text-muted-foreground">Plan backward from your tests. The coach builds the study schedule around them.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>+ Add test</button>
      </div>

      {showAdd && (
        <form onSubmit={addTest} className="card space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="label">Subject</label>
              <select className="input" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} required>
                <option value="">Select…</option>
                {(subjects || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="label">Test name</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Physics Unit Test 3" required />
            </div>
            <div className="space-y-1">
              <label className="label">Date</label>
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <label className="label">Syllabus (optional)</label>
              <input className="input" value={form.syllabus} onChange={(e) => setForm({ ...form, syllabus: e.target.value })} placeholder="Chapters covered…" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">Save test</button>
            <button type="button" className="btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-6">
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Upcoming ({upcoming.length})</h2>
          {upcoming.length === 0 ? (
            <EmptyState title="No upcoming tests" body="Add a test so the coach can plan backward from it." />
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {upcoming.map((t) => {
                const days = Math.ceil((+new Date(t.date) - Date.now()) / 86400000);
                return (
                  <Card key={t.id}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold">{t.name}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">{fmtDate(t.date)} · {fmtTime(t.date)}</div>
                        {t.syllabus && <div className="text-xs text-muted-foreground mt-1 truncate max-w-[30ch]">{t.syllabus}</div>}
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${days <= 2 ? "bg-destructive/10 text-destructive" : days <= 7 ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary"}`}>
                        {days === 0 ? "Today" : `${days}d left`}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Completed ({past.length})</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {past.map((t) => (
                <Card key={t.id}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-sm text-muted-foreground mt-0.5">{fmtDate(t.date)}</div>
                      {t.score != null && (
                        <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium">
                          <IconBook className="w-3.5 h-3.5" /> {t.score}% {t.percentile != null && <span className="text-muted-foreground">· P{t.percentile}</span>}
                        </div>
                      )}
                    </div>
                    <Link to={`/autopsy?test=${t.id}`} className="btn-ghost text-xs"><IconActivity className="w-3.5 h-3.5" /> Autopsy</Link>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}