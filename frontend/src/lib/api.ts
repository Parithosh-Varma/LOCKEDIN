const API_BASE = import.meta.env.VITE_API_URL || "";

let token: string | null = localStorage.getItem("lockedin_token");

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem("lockedin_token", t);
  else localStorage.removeItem("lockedin_token");
}

export function getToken() {
  return token;
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers as Record<string, string> | undefined) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api${path}`, { ...opts, headers });
  if (res.status === 401 && token) {
    setToken(null);
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const apiClient = {
  login: (password: string) => api("/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  dashboard: () => api("/dashboard"),
  planToday: () => api("/plan/today"),
  planGenerate: (date?: string) => api("/plan/generate", { method: "POST", body: JSON.stringify(date ? { date } : {}) }),
  sessions: (from?: string, to?: string) => api(`/sessions${from ? `?from=${from}&to=${to ?? ""}` : ""}`),
  commitSession: (sessionId: number) => api("/sessions/commit", { method: "POST", body: JSON.stringify({ sessionId }) }),
  startSession: (id: number) => api(`/sessions/${id}/start`, { method: "POST" }),
  pauseSession: (id: number) => api(`/sessions/${id}/pause`, { method: "POST" }),
  endSession: (id: number, payload: { quitReason: string; completedQuestions?: number; focusTimeSeconds?: number }) =>
    api(`/sessions/${id}/end`, { method: "POST", body: JSON.stringify(payload) }),
  activeSession: () => api<{ session: any | null }>("/sessions/active"),
  focusEvent: (id: number, type: string, detail?: string) =>
    api(`/sessions/${id}/focus`, { method: "POST", body: JSON.stringify({ type, detail }) }),
  statsToday: () => api("/stats/today"),
  statsProcrastination: () => api("/stats/procrastination"),
  statsWeekly: () => api("/stats/weekly"),
  statsHistory: () => api("/stats/history"),
  subjects: () => api("/subjects"),
  addSubject: (name: string, color?: string, priority?: number) =>
    api("/subjects", { method: "POST", body: JSON.stringify({ name, color, priority }) }),
  addTopic: (subjectId: number, name: string, mastery?: number, isWeak?: boolean) =>
    api("/topics", { method: "POST", body: JSON.stringify({ subjectId, name, mastery, isWeak }) }),
  updateTopic: (id: number, body: { mastery?: number; isWeak?: boolean }) =>
    api(`/topics/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  tests: () => api("/tests"),
  addTest: (body: any) => api("/tests", { method: "POST", body: JSON.stringify(body) }),
  updateTest: (id: number, body: any) => api(`/tests/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  autopsy: (id: number) => api(`/tests/${id}/autopsy`),
  settings: () => api("/settings"),
  updateSettings: (body: any) => api("/settings", { method: "PATCH", body: JSON.stringify(body) }),
  allen: () => api("/allen"),
  allenData: () => api("/allen/data"),
  allenConfigure: (body: { token?: string; portalUrl?: string }) => api("/allen/configure", { method: "POST", body: JSON.stringify(body) }),
  allenSync: () => api("/allen/sync", { method: "POST" }),
  telegramStatus: () => api("/telegram/status"),
  telegramConnect: (chatId: string, code: string) => api("/telegram/connect", { method: "POST", body: JSON.stringify({ chatId, code }) }),
  aiStatus: () => api("/ai/status"),
};