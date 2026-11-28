import type { Difficulty } from "@/db/schema";
import { DIFF_HEX } from "./kit";

type Stat = { difficulty: Difficulty; total: number; solved: number; attempted: number };

const LABEL: Record<Difficulty, string> = { Easy: "Easy", Medium: "Med.", Hard: "Hard" };

// Gauge geometry: a 270° arc open at the bottom, split into Easy / Medium / Hard
// segments sized by how many problems each has; the solved part of each is lit.
const CX = 110;
const CY = 110;
const R = 92;
const STROKE = 7;
const START = 135; // degrees, 0 = 3 o'clock, clockwise
const SWEEP = 270;
const GAP = 7;

function point(deg: number) {
  const a = (deg * Math.PI) / 180;
  return `${(CX + R * Math.cos(a)).toFixed(2)} ${(CY + R * Math.sin(a)).toFixed(2)}`;
}

function arc(from: number, to: number) {
  return `M ${point(from)} A ${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${point(to)}`;
}

export default function DifficultyGauge({ stats }: { stats: Stat[] }) {
  const total = stats.reduce((a, s) => a + s.total, 0);
  const solved = stats.reduce((a, s) => a + s.solved, 0);
  const attempting = stats.reduce((a, s) => a + s.attempted, 0);

  const present = stats.filter((s) => s.total > 0);
  const usable = SWEEP - GAP * Math.max(present.length - 1, 0);
  const segments: (Stat & { from: number; to: number; lit: number | null })[] = [];
  let cursor = START;
  for (const s of present) {
    const span = (usable * s.total) / total;
    const lit = s.solved > 0 ? cursor + Math.max((span * s.solved) / s.total, 1.5) : null;
    segments.push({ ...s, from: cursor, to: cursor + span, lit });
    cursor += span + GAP;
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-6 sm:justify-between">
      <div className="relative h-[196px] w-[220px] flex-none">
        <svg width="220" height="196" viewBox="0 0 220 196" role="img" aria-label={`${solved} of ${total} problems solved`}>
          {segments.map((s) => (
            <g key={s.difficulty}>
              <path d={arc(s.from, s.to)} fill="none" style={{ stroke: DIFF_HEX[s.difficulty] }} strokeOpacity="0.2" strokeWidth={STROKE} strokeLinecap="round" />
              {s.lit != null && (
                <path d={arc(s.from, s.lit)} fill="none" style={{ stroke: DIFF_HEX[s.difficulty] }} strokeWidth={STROKE} strokeLinecap="round" />
              )}
            </g>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pb-4">
          <div className="flex items-baseline">
            <span className="text-4xl font-bold tracking-tight">{solved}</span>
            <span className="text-lg text-soft">/{total}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[15px] text-ink">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ stroke: "var(--color-easy)" }} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Solved
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-1 text-center text-[13px] text-mute">
          <b className="font-semibold text-soft">{attempting}</b> Attempting
        </div>
      </div>

      <ul className="flex w-full flex-col gap-2.5 sm:w-32">
        {stats.map((s) => (
          <li key={s.difficulty} className="rounded-lg bg-chip px-3 py-2 text-center">
            <div className="text-[13px] font-semibold" style={{ color: DIFF_HEX[s.difficulty] }}>
              {LABEL[s.difficulty]}
            </div>
            <div className="text-sm font-semibold text-ink">
              {s.solved}
              <span className="text-mute">/{s.total}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
