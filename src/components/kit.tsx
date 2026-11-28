import type { Difficulty, Status } from "@/db/schema";

export const DIFF_TEXT: Record<Difficulty, string> = {
  Easy: "text-easy",
  Medium: "text-medium",
  Hard: "text-hard",
};

export const DIFF_HEX: Record<Difficulty, string> = {
  Easy: "var(--color-easy)",
  Medium: "var(--color-medium)",
  Hard: "var(--color-hard)",
};

const DIFF_PILL: Record<Difficulty, string> = {
  Easy: "text-easy bg-easy-bg",
  Medium: "text-medium bg-medium-bg",
  Hard: "text-hard bg-hard-bg",
};

const STATUS_PILL: Record<Status, string> = {
  Solved: "text-easy bg-easy-bg",
  Attempted: "text-medium bg-medium-bg",
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
  const fill = color ?? (pct === 100 ? "var(--color-easy)" : "var(--color-brand)");
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: fill }} />
    </div>
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-2xl bg-fg/[0.02] ${className}`}>{children}</section>;
}

export const inputCls =
  "min-h-11 w-full rounded-lg border border-line2 bg-side px-3 text-sm text-ink placeholder:text-mute focus:border-brand focus:outline-none";

export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-brand-ink hover:bg-brand-soft disabled:opacity-60";

export const btnGhost =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line2 px-4 text-sm font-semibold text-ink hover:bg-chip";

/** Small circular progress ring; turns green when complete. */
export function Ring({
  value,
  max,
  size = 28,
  stroke = 3,
  label,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  label?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const frac = max > 0 ? value / max : 0;
  const done = max > 0 && value >= max;
  return (
    <span className="relative inline-flex flex-none items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "var(--color-line)" }} strokeWidth={stroke} />
        {frac > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            style={{ stroke: done ? "var(--color-easy)" : "var(--color-brand)" }}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${C * frac} ${C}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
}

/** One dot per problem, coloured by status — makes a group read as a small, finite set. */
export function StatusDots({ statuses, max = 12 }: { statuses: ("Todo" | "Attempted" | "Solved")[]; max?: number }) {
  const shown = statuses.slice(0, max);
  const color = { Solved: "var(--color-easy)", Attempted: "var(--color-medium)", Todo: "var(--color-line2)" } as const;
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {shown.map((s, i) => (
        <span key={i} className="size-1.5 rounded-full" style={{ background: color[s] }} />
      ))}
      {statuses.length > max && <span className="ml-0.5 text-[10px] text-mute">+{statuses.length - max}</span>}
    </span>
  );
}
