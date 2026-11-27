import Link from "next/link";
import { connection } from "next/server";
import DifficultyGauge from "@/components/DifficultyGauge";
import { Bar, Card, DIFF_HEX, btnPrimary } from "@/components/kit";
import { addDays, dayKey, prettyDay, relativeDay, weekday } from "@/lib/dates";
import { getDifficultyStats, getRecentSolved, getSolvedPerDay, getTopicStats } from "@/lib/queries";

const WEEKS = 26;
const SHADES = ["#1f2630", "#134e4a", "#0f766e", "#14b8a6", "#5eead4"];

function shade(n: number) {
  if (n <= 0) return SHADES[0];
  if (n === 1) return SHADES[1];
  if (n === 2) return SHADES[2];
  if (n <= 4) return SHADES[3];
  return SHADES[4];
}

export default async function Dashboard() {
  await connection();
  const [topics, diffs, perDay, recent] = await Promise.all([
    getTopicStats(),
    getDifficultyStats(),
    getSolvedPerDay(),
    getRecentSolved(6),
  ]);

  // Heatmap: columns are weeks (Sun→Sat), ending with the current week.
  const today = dayKey();
  const start = addDays(today, -(WEEKS - 1) * 7 - weekday(today));
  const weeks: { key: string; n: number; future: boolean }[][] = [];
  let heatTotal = 0;
  let activeDays = 0;
  for (let w = 0; w < WEEKS; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const key = addDays(start, w * 7 + d);
      const n = perDay.get(key) ?? 0;
      heatTotal += n;
      if (n > 0) activeDays++;
      col.push({ key, n, future: key > today });
    }
    weeks.push(col);
  }
  // Month labels above the first week column that starts in a new month.
  const months = weeks.map((col, i) => {
    const m = new Date(col[0].key + "T00:00:00Z").getUTCMonth();
    const prev = i > 0 ? new Date(weeks[i - 1][0].key + "T00:00:00Z").getUTCMonth() : -1;
    return m !== prev ? new Date(col[0].key + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }) : "";
  });

  const dateLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata",
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[13px] text-mute">{dateLabel}</div>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight">Dashboard</h1>
        </div>
        <Link href="/problems/new" className={btnPrimary}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Log a problem
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="flex items-center px-6 py-5">
          <div className="w-full">
            <DifficultyGauge stats={diffs} />
          </div>
        </Card>

        <Card className="flex flex-col px-6 py-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">Activity · last {WEEKS} weeks</h2>
            <div className="text-[13px] text-mute">
              <b className="font-semibold text-soft">{heatTotal}</b> solved · <b className="font-semibold text-soft">{activeDays}</b> active days
            </div>
          </div>
          <div className="flex flex-1 items-center overflow-x-auto">
            <div className="w-max">
              <div className="mb-1 flex gap-[3px] text-[11px] text-mute" aria-hidden="true">
                {months.map((m, i) => (
                  <span key={i} className="w-[13px] overflow-visible whitespace-nowrap">
                    {m}
                  </span>
                ))}
              </div>
              <div className="flex gap-[3px]">
                {weeks.map((col, i) => (
                  <div key={i} className="flex flex-col gap-[3px]">
                    {col.map((c) => (
                      <div
                        key={c.key}
                        title={`${prettyDay(c.key)}: ${c.n} solved`}
                        className="h-[13px] w-[13px] rounded-[3px]"
                        style={{ background: c.future ? "transparent" : shade(c.n) }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-1.5 text-xs text-mute">
            Less
            {SHADES.map((s) => (
              <span key={s} className="h-3 w-3 rounded-[3px]" style={{ background: s }} />
            ))}
            More
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="px-6 py-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Recently solved</h2>
          </div>
          {recent.length === 0 ? (
            <p className="py-6 text-sm text-mute">Nothing solved yet. Open a topic, pick a problem and mark it Solved.</p>
          ) : (
            <ul>
              {recent.map((p) => (
                <li key={p.id} className="border-t border-line">
                  <Link href={`/problems/${p.id}`} className="flex items-center gap-3 py-2.5 hover:text-brand-soft">
                    <span className="h-2 w-2 flex-none rounded-full" style={{ background: DIFF_HEX[p.difficulty] }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.title}</span>
                      <span className="mt-0.5 block text-xs text-mute">
                        {p.topicName} · {p.difficulty}
                      </span>
                    </span>
                    <span className="flex-none font-mono text-xs text-mute">{relativeDay(p.solvedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="px-6 py-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Progress by topic</h2>
            <Link href="/topics" className="text-[13px] font-semibold text-brand-soft hover:underline">
              All topics →
            </Link>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-x-8 gap-y-3.5">
            {topics.map((t) => (
              <Link key={t.id} href={`/topics/${t.slug}`} className="block hover:text-brand-soft">
                <div className="mb-1.5 flex justify-between text-[13px]">
                  <span className="font-medium">{t.name}</span>
                  <span className="font-mono text-mute">
                    {t.solved}/{t.total}
                  </span>
                </div>
                <Bar value={t.solved} max={t.total} />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
