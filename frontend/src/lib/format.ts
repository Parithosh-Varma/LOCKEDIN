export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function fmtDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function fmtTime(d: string | Date): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function fmtDate(d: string | Date): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function progressBar(fraction: number, width = 12): string {
  const f = Math.max(0, Math.min(1, fraction));
  const blocks = Math.round(f * width);
  return "█".repeat(blocks) + "░".repeat(width - blocks);
}

export function hourGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "GOOD MORNING";
  if (h < 17) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}