export const TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";

/** YYYY-MM-DD for the given instant in APP_TIMEZONE. */
export function dayKey(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Add days to a YYYY-MM-DD key (calendar arithmetic, timezone-free). */
export function addDays(key: string, n: number) {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday for a YYYY-MM-DD key. */
export function weekday(key: string) {
  return new Date(key + "T00:00:00Z").getUTCDay();
}

export function prettyDay(key: string) {
  return new Date(key + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

/** "just now", "5m ago", "3h ago", "yesterday", "4d ago", then a date. */
export function timeAgo(d: Date | null, now: Date = new Date()) {
  if (!d) return "—";
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (dayKey(d) === dayKey(now)) return `${Math.floor(mins / 60)}h ago`;
  return relativeDay(d);
}

export function relativeDay(d: Date | null) {
  if (!d) return "—";
  const today = dayKey();
  const k = dayKey(d);
  if (k === today) return "today";
  if (k === addDays(today, -1)) return "yesterday";
  const diff = Math.round((Date.parse(today) - Date.parse(k)) / 86400000);
  if (diff < 7) return `${diff}d ago`;
  return prettyDay(k);
}
