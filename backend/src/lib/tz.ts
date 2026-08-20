/**
 * Timezone-aware date math.
 * All "day boundaries" and wall-clock times are computed in the user's
 * configured timezone (default Asia/Kolkata), independent of server TZ.
 */

export interface TzParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=Sun
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function tzParts(date: Date, tz: string): TzParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  let hour = get("hour");
  if (hour === 24) hour = 0;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    weekday: WEEKDAY[parts.find((p) => p.type === "weekday")?.value ?? "Mon"] ?? 1,
  };
}

/** Offset in ms (tzWall - utc) at a given instant. Positive when tz is ahead of UTC. */
function tzOffsetMs(ts: number, tz: string): number {
  const p = tzParts(new Date(ts), tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - ts;
}

/** Absolute Date for the tz wall-clock date (from `date`) at hour:minute. Converges on DST edges. */
export function tzWallClock(date: Date, tz: string, hour: number, minute: number): Date {
  const p = tzParts(date, tz);
  let ts = Date.UTC(p.year, p.month - 1, p.day, hour, minute);
  for (let i = 0; i < 3; i++) {
    const off = tzOffsetMs(ts, tz);
    ts = Date.UTC(p.year, p.month - 1, p.day, hour, minute) - off;
  }
  return new Date(ts);
}

/** [startUTC, endUTC) of the tz day containing `date`. */
export function tzDayRange(date: Date, tz: string): [Date, Date] {
  const start = tzStartOfDay(date, tz);
  return [start, new Date(start.getTime() + 24 * 3600_000)];
}

/** Start of the tz day containing `date`, as an absolute Date. */
export function tzStartOfDay(date: Date, tz: string): Date {
  const p = tzParts(date, tz);
  const backMs = p.hour * 3600_000 + p.minute * 60_000;
  return tzWallClock(new Date(date.getTime() - backMs - 12 * 3600_000), tz, 0, 0);
}

/** Today's date label in tz as YYYY-MM-DD. */
export function tzDateKey(date: Date, tz: string): string {
  const p = tzParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Start of the tz week (Sunday) containing date. */
export function tzWeekStart(date: Date, tz: string): Date {
  const dayStart = tzStartOfDay(date, tz);
  const parts = tzParts(dayStart, tz);
  return tzWallClock(new Date(dayStart.getTime() - parts.weekday * 24 * 3600_000), tz, 0, 0);
}