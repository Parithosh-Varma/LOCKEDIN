const MAX_LOGGED_LEN = 400;

export const logger = {
  info(...args: unknown[]) {
    console.log(new Date().toISOString(), "[info]", ...args);
  },
  warn(...args: unknown[]) {
    console.warn(new Date().toISOString(), "[warn]", ...args);
  },
  error(...args: unknown[]) {
    console.error(new Date().toISOString(), "[error]", ...args);
  },
  safe(name: string, value: unknown) {
    const s = JSON.stringify(value) ?? String(value);
    this.info(name, s.length > MAX_LOGGED_LEN ? s.slice(0, MAX_LOGGED_LEN) + "…" : s);
  },
};

export function sanitizeSecrets(input: string): string {
  const patterns = [
    /sk-[A-Za-z0-9-_]{8,}/g,
    /npg_[A-Za-z0-9-_]{8,}/g,
    /Bearer [A-Za-z0-9._-]+/g,
    /bot[0-9]+:[A-Za-z0-9_-]{10,}/g,
  ];
  let out = input;
  for (const p of patterns) out = out.replace(p, "[REDACTED]");
  return out;
}