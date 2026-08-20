import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../lib/api";

export interface ActiveSession {
  id: number;
  goal: string;
  title: string;
  questionCount: number | null;
  plannedDurationMinutes: number;
  status: string;
  actualStart: string | null;
  actualEnd: string | null;
  focusTimeSeconds: number;
  interruptions: number;
  subjectId: number | null;
}

const KEY = "lockedin_active_session";

/**
 * Session lifecycle: scheduled -> committed -> active -> completed|abandoned.
 * Active state persists (localStorage + server) so refresh/crash recovery works.
 */
export function useActiveSession() {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"none" | "commitment" | "active">("none");

  // restore on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = localStorage.getItem(KEY);
        if (stored) {
          const s = JSON.parse(stored) as ActiveSession;
          // verify against server
          const { session: server } = await apiClient.activeSession();
          if (server && server.id === s.id) {
            setSession(server);
            setMode("active");
            return;
          }
          // server lost it (ended elsewhere) — drop local
          localStorage.removeItem(KEY);
        }
        const { session: server } = await apiClient.activeSession();
        if (server) {
          setSession(server);
          setMode("active");
          localStorage.setItem(KEY, JSON.stringify(server));
        } else {
          setMode("none");
        }
      } catch {
        setMode("none");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback((s: ActiveSession) => {
    setSession(s);
    localStorage.setItem(KEY, JSON.stringify(s));
  }, []);

  const setPending = useCallback((s: ActiveSession) => {
    setSession(s);
    setMode("commitment");
    localStorage.setItem(KEY, JSON.stringify({ ...s, status: "committed" }));
  }, []);

  const start = useCallback(async (sessionId: number) => {
    const res = await apiClient.startSession(sessionId);
    const s = res.session as ActiveSession;
    persist(s);
    setMode("active");
    return s;
  }, [persist]);

  const pause = useCallback(async () => {
    if (!session) return;
    const res = await apiClient.pauseSession(session.id);
    persist(res.session);
  }, [session, persist]);

  const end = useCallback(
    async (payload: { quitReason: string; completedQuestions?: number; focusTimeSeconds?: number }) => {
      if (!session) return;
      const res = await apiClient.endSession(session.id, payload);
      localStorage.removeItem(KEY);
      setSession(null);
      setMode("none");
      return res.session;
    },
    [session]
  );

  const reportFocusBroken = useCallback(() => {
    if (session) apiClient.focusEvent(session.id, "focus-broken").catch(() => undefined);
  }, [session]);

  const reportReturned = useCallback(() => {
    if (session) apiClient.focusEvent(session.id, "returned").catch(() => undefined);
  }, [session]);

  const reportTabSwitch = useCallback(() => {
    if (session) apiClient.focusEvent(session.id, "tab-switch").catch(() => undefined);
  }, [session]);

  return { session, mode, loading, setPending, start, pause, end, reportFocusBroken, reportReturned, reportTabSwitch };
}