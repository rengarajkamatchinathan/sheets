import type { Difficulty, Status } from "@/db/schema";

export const DIFF_TEXT: Record<Difficulty, string> = {
  Easy: "text-easy",
  Medium: "text-medium",
  Hard: "text-hard",
};

export const DIFF_HEX: Record<Difficulty, string> = {
  Easy: "#4ade80",
  Medium: "#fbbf24",
  Hard: "#f87171",
};

const DIFF_PILL: Record<Difficulty, string> = {
  Easy: "text-easy bg-[#12291a]",
  Medium: "text-medium bg-[#2b2310]",
  Hard: "text-hard bg-[#2c1416]",
};

const STATUS_PILL: Record<Status, string> = {
  Solved: "text-easy bg-[#12291a]",
  Attempted: "text-medium bg-[#2b2310]",
  Todo: "text-mute bg-chip",
};

export function DifficultyPill({ d }: { d: Difficulty }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${DIFF_PILL[d]}`}>{d}</span>;
}

export function StatusPill({ s }: { s: Status }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILL[s]}`}>{s}</span>;
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md border border-line2 bg-chip px-2 py-0.5 text-xs text-soft">{children}</span>;
}

export function Bar({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const fill = color ?? (pct === 100 ? "#4ade80" : "#2dd4bf");
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: fill }} />
    </div>
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-2xl border border-line bg-panel ${className}`}>{children}</section>;
}

export const inputCls =
  "min-h-11 w-full rounded-lg border border-line2 bg-side px-3 text-sm text-ink placeholder:text-mute focus:border-brand focus:outline-none";

export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-brand-ink hover:bg-brand-soft disabled:opacity-60";

export const btnGhost =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line2 px-4 text-sm font-semibold text-ink hover:bg-chip";
