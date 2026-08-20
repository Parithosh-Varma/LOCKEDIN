import { useEffect, useRef, useState } from "react";
import { useActiveSession } from "../hooks/useActiveSession";
import { useAccountability, useStudyMusic } from "../hooks/useAccountability";
import { fmtClock } from "../hooks/useTimer";
import { apiClient } from "../lib/api";
import { fmtTime, progressBar } from "../lib/format";
import { IconCamera, IconLock, IconMusic, IconPlay, IconPause, IconAlert, IconCheck, IconX } from "../lib/icons";
import { Card, EmptyState } from "../components/ui";

export default function Session() {
  const {
    session,
    mode,
    loading,
    setPending,
    start,
    pause,
    end,
    reportFocusBroken,
    reportReturned,
  } = useActiveSession();

  const [settings, setSettings] = useState<any>(null);
  const [planBlocks, setPlanBlocks] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [focusBroken, setFocusBroken] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
  const [completedQ, setCompletedQ] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  // timer state
  const endAt = useRef<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    apiClient.settings().then(setSettings).catch(() => undefined);
    apiClient.planToday().then((p) => setPlanBlocks(p.blocks)).catch(() => undefined);
  }, []);

  // boot timer when session active
  useEffect(() => {
    if (mode === "active" && session?.actualStart) {
      const dur = session.plannedDurationMinutes * 60_000;
      endAt.current = new Date(session.actualStart).getTime() + dur;
      setNow(Date.now());
    }
  }, [mode, session]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const remaining = endAt.current ? Math.max(0, endAt.current - now) : 0;
  const elapsed = session?.actualStart ? Math.max(0, now - new Date(session.actualStart).getTime()) : 0;
  const total = session ? session.plannedDurationMinutes * 60_000 : 1;
  const fraction = remaining / total;

  const accountability = useAccountability({
    enabled: mode === "active" && !paused,
    webcamEnabled: settings?.webcamEnabled ?? true,
    screenEnabled: settings?.screenEnabled ?? true,
    onFocusBroken: () => {
      setFocusBroken(true);
      reportFocusBroken();
    },
    onReturned: () => {
      setFocusBroken(false);
      reportReturned();
    },
  });

  const music = useStudyMusic(settings?.youtubeMusicUrl ?? null, settings?.musicEnabled ?? false, settings?.musicVolume ?? 40);

  useEffect(() => {
    if (mode === "active") {
      accountability.startWebcam();
      accountability.startScreen();
    } else {
      accountability.stopWebcam();
      accountability.stopScreen();
    }
  }, [mode]);

  async function handleCommit() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiClient.commitSession(selected.id);
      setPending(selected);
      setSelected(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleStart() {
    if (!session) return;
    setBusy(true);
    try {
      await start(session.id);
    } finally {
      setBusy(false);
    }
  }

  async function handlePause() {
    setPaused(!paused);
    await pause();
  }

  async function handleEnd(reason: string) {
    setBusy(true);
    try {
      await end({ quitReason: reason, completedQuestions: completedQ, focusTimeSeconds: Math.round(elapsed / 1000) });
      setQuitOpen(false);
      setCompletedQ(0);
    } finally {
      setBusy(false);
    }
  }

  async function handleGetMeStudying(choice: number) {
    // find/plan and commit a session
    const plan = await apiClient.planGenerate();
    const blocks = (plan.blocks as any[]).filter((b) => b.subject !== "Break" && b.subject !== "Dinner");
    const s = blocks[0];
    const sessions = await apiClient.sessions();
    const match = (sessions as any[]).find((x) => x.goal === s.goal);
    if (match) {
      await apiClient.commitSession(match.id);
      setPending(match);
    }
  }

  // ---- render ----
  if (loading) return <div className="text-muted-foreground">Loading…</div>;

  // RECOVERY: an active session was found (from refresh/crash)
  if (mode === "active" && session) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {focusBroken && <FocusBrokenOverlay onReturn={() => setFocusBroken(false)} />}

        <Card className="text-center py-10 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)),transparent_60%)]" />
          <div className="relative space-y-6">
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-widest">{session.title?.split(" — ")[0] || "Session"}</div>
              <h1 className="text-2xl font-bold tracking-tight mt-1">{session.title}</h1>
              {session.questionCount && <div className="text-sm text-muted-foreground mt-1">{session.questionCount} questions</div>}
            </div>

            <div className="text-6xl font-bold tabular-nums tracking-tight font-mono">{fmtClock(remaining)}</div>
            <div className="w-full max-w-xs mx-auto">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${(1 - fraction) * 100}%` }} />
              </div>
              <div className="text-xs text-muted-foreground mt-2 flex justify-between">
                <span>{paused ? "Paused" : "Stay focused."}</span>
                <span>Elapsed {fmtClock(elapsed)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button className="btn-outline" onClick={handlePause}>
                {paused ? <IconPlay className="w-4 h-4" /> : <IconPause className="w-4 h-4" />}
                {paused ? "Resume" : "Pause"}
              </button>
              <button className="btn-primary" onClick={() => setQuitOpen(true)}>
                <IconX className="w-4 h-4" /> End session
              </button>
            </div>

            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <IconCamera className="w-3.5 h-3.5" />
                {accountability.state.webcam === "active" ? "Camera on" : accountability.state.webcam === "denied" ? "Camera off" : "Camera not started"}
              </div>
              <div className="flex items-center gap-1.5">
                <IconLock className="w-3.5 h-3.5" />
                {accountability.state.screen === "active" ? "Screen on" : "Screen off"}
              </div>
            </div>

            {/* blurred webcam preview (local only) */}
            {accountability.state.webcam === "active" && (
              <div className="relative mx-auto w-24 h-18 aspect-video rounded-lg overflow-hidden border border-border">
                <video ref={accountability.videoRef} muted playsInline className="w-full h-full object-cover blur-[6px] scale-110" />
              </div>
            )}
          </div>
        </Card>

        {/* study music */}
        <MusicCard music={music} />

        {quitOpen && <QuitModal completedQ={completedQ} setCompletedQ={setCompletedQ} onKeep={() => setQuitOpen(false)} onQuit={(r) => handleEnd(r)} busy={busy} />}
      </div>
    );
  }

  // COMMITMENT: user picked a session, must confirm before starting
  if (mode === "commitment" && session) {
    return (
      <div className="max-w-xl mx-auto">
        <Card className="text-center py-10 space-y-6">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-amber-500">
            <IconAlert className="w-4 h-4" /> You are about to commit.
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest">Subject</div>
            <h2 className="text-2xl font-bold tracking-tight mt-1">{session.title?.split(" — ")[0] || "Study"}</h2>
          </div>
          <div className="space-y-1 text-sm">
            <div><span className="text-muted-foreground">Goal:</span> <span className="font-medium">{session.title}</span></div>
            <div><span className="text-muted-foreground">Duration:</span> <span className="font-medium">{session.plannedDurationMinutes} minutes</span></div>
          </div>
          <div className="border-t border-border pt-5 space-y-2 text-sm text-muted-foreground">
            <p>You said you would do this.</p>
            <p>No scrolling. No random YouTube. No "I'll just check something."</p>
          </div>
          <div className="flex flex-col gap-2 max-w-xs mx-auto">
            <button className="btn-primary w-full" disabled={busy} onClick={handleStart}>
              <IconLock className="w-4 h-4" /> I'M COMMITTING — START
            </button>
            <button className="btn-outline w-full" onClick={() => { setSessionLocalNull(); }}>Back</button>
          </div>
        </Card>
      </div>
    );
  }

  // PICK A SESSION (from today's plan)
  const upcoming = planBlocks.filter((b) => b.subject !== "Break" && b.subject !== "Dinner");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">ACTIVE SESSION</h1>
        <p className="text-sm text-muted-foreground">Pick a session from today's plan, or let the coach pick one.</p>
      </div>

      <div className="card">
        <div className="text-lg font-bold tracking-tight mb-1">GET ME STUDYING</div>
        <p className="text-sm text-muted-foreground mb-4">What are you doing right now? You already know you need to study. Pick one:</p>
        <div className="grid grid-cols-3 gap-2">
          {[25, 45, 60].map((m) => (
            <button key={m} className="btn-outline" onClick={() => handleGetMeStudying(m)}>{m} MIN</button>
          ))}
        </div>
      </div>

      {upcoming.length === 0 ? (
        <EmptyState title="No sessions today" body="Generate today's plan from the Schedule page, then come back to start." />
      ) : (
        <div className="space-y-2">
          {upcoming.map((b, i) => (
            <button key={i} onClick={() => setSelected(b)} className={`w-full text-left card p-4 hover:border-primary/50 transition-colors ${selected?.goal === b.goal ? "border-primary" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="font-medium">{b.subject}</div>
                <div className="text-xs text-muted-foreground">{fmtTime(b.start)} · {b.minutes} min</div>
              </div>
              <div className="text-sm text-muted-foreground mt-1">{b.goal}</div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <Card className="space-y-4">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest">Selected</div>
            <h2 className="text-lg font-bold tracking-tight mt-1">{selected.subject} — {selected.goal}</h2>
            <div className="text-sm text-muted-foreground">{selected.minutes} minutes · {selected.questionCount ?? ""} questions</div>
          </div>
          <button className="btn-primary w-full" disabled={busy} onClick={handleCommit}>
            <IconLock className="w-4 h-4" /> Commit to this session
          </button>
        </Card>
      )}
    </div>
  );

  // local helper (declared via closure)
  function setSessionLocalNull() {
    // go back to picker
    setSelected(null);
    setPending(null as any);
    (window as any).__resetSession?.();
    window.location.reload();
  }
}

function FocusBrokenOverlay({ onReturn }: { onReturn: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-5">
        <div className="text-4xl font-bold tracking-tight text-destructive">🚨 FOCUS BROKEN</div>
        <p className="text-muted-foreground">You left your study session.</p>
        <p className="text-muted-foreground">Whatever you switched to can wait.</p>
        <p className="text-sm text-muted-foreground">Get back to work.</p>
        <button className="btn-primary w-full" onClick={onReturn}>RETURN TO STUDY</button>
      </div>
    </div>
  );
}

function QuitModal({ completedQ, setCompletedQ, onKeep, onQuit, busy }: { completedQ: number; setCompletedQ: (n: number) => void; onKeep: () => void; onQuit: (reason: string) => void; busy: boolean }) {
  const [phase, setPhase] = useState<"confirm" | "reason">("confirm");
  const reasons = ["Finished goal", "Emergency", "Too distracted", "Tired", "Gave up", "Other"];

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex items-center justify-center p-6">
      <div className="max-w-md w-full card space-y-5">
        {phase === "confirm" ? (
          <>
            <h2 className="text-lg font-bold tracking-tight">END SESSION?</h2>
            <p className="text-sm text-muted-foreground">You committed to this session. Time remaining is still on the clock.</p>
            <button className="btn-primary w-full" onClick={onKeep}><IconCheck className="w-4 h-4" /> KEEP STUDYING</button>
            <button className="btn-outline w-full" onClick={() => setPhase("reason")}>I REALLY WANT TO QUIT</button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold tracking-tight">Why are you ending?</h2>
            <label className="label">Questions completed</label>
            <input type="number" className="input" value={completedQ} onChange={(e) => setCompletedQ(Number(e.target.value))} min={0} />
            <div className="grid grid-cols-2 gap-2">
              {reasons.map((r) => (
                <button key={r} className="btn-outline" disabled={busy} onClick={() => onQuit(r)}>{r}</button>
              ))}
            </div>
            <button className="btn-ghost w-full" onClick={() => setPhase("confirm")}>Back</button>
          </>
        )}
      </div>
    </div>
  );
}

function MusicCard({ music }: { music: ReturnType<typeof useStudyMusic> }) {
  const embed = music.embedUrl(music.urlRef?.current ?? "") ?? null;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          <IconMusic className="w-4 h-4" /> Study music
        </div>
        <div className="flex items-center gap-2">
          {!music.playing && <button className="btn-ghost text-xs" onClick={music.play}><IconPlay className="w-3.5 h-3.5" /> Play</button>}
          {music.playing && <button className="btn-ghost text-xs" onClick={music.pause}><IconPause className="w-3.5 h-3.5" /> Pause</button>}
          <button className="btn-ghost text-xs" onClick={() => music.setMuted(!music.muted)}>{music.muted ? "Unmute" : "Mute"}</button>
        </div>
      </div>
      {music.autoplayFailed && <p className="text-xs text-muted-foreground">Click once to start your study music (browser policy).</p>}
      {embed && (
        <div className="relative">
          <iframe ref={music.iframeRef} title="study-music" src={embed} className="w-full aspect-video rounded-lg border border-border" allow="encrypted-media" />
        </div>
      )}
      {!embed && <p className="text-xs text-muted-foreground">No music URL set. Add one in Settings.</p>}
    </Card>
  );
}