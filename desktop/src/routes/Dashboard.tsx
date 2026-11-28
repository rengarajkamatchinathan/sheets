// Desktop port of src/app/page.tsx — same markup; data from the local store.
import Link from "next/link";
import IntentLink from "@/components/IntentLink";
import { ArrowRight, Check, Sparkles, Star } from "lucide-react";
import DifficultyGauge from "@/components/DifficultyGauge";
import { Card } from "@/components/kit";
import { addDays, dayKey, prettyDay, timeAgo, weekday } from "@/lib/dates";
import type { TopicChoice, TopicStat } from "@/lib/queries";
import { NewProblemDialog } from "@/components/NewProblem";
import { cn } from "@/lib/utils";
import { useCommand } from "../data";
import { Loading } from "./common";

const WEEKS = 26;
const SHADES = ["var(--heat-0)", "var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"];
const DIFF_COLOR = { Easy: "text-easy", Medium: "text-medium", Hard: "text-hard" } as const;
const DIFF_SHORT = { Easy: "Easy", Medium: "Med", Hard: "Hard" } as const;

type Difficulty = "Easy" | "Medium" | "Hard";
type Status = "Todo" | "Attempted" | "Solved";
type CardRow = {
  id: number;
  title: string;
  difficulty: Difficulty;
  status: Status;
  topicName: string;
  topicSlug: string;
  patternName: string | null;
  lastViewedAt: string | null;
};
type DashboardData = {
  topics: TopicStat[];
  difficulty: { difficulty: Difficulty; total: number; solved: number; attempted: number }[];
  solvedAt: string[];
  inProgress: CardRow[];
  nextTodo: CardRow | null;
  starred: CardRow[];
  recent: CardRow[];
};

function shade(n: number) {
  if (n <= 0) return SHADES[0];
  if (n === 1) return SHADES[1];
  if (n === 2) return SHADES[2];
  if (n <= 4) return SHADES[3];
  return SHADES[4];
}

export default function Dashboard() {
  const dash = useCommand<DashboardData>("q_dashboard");
  const choices = useCommand<TopicChoice[]>("q_topic_choices");
  if (!dash.data || !choices.data) return <Loading error={dash.error ?? choices.error} />;
  const data = dash.data;
  const { inProgress, nextTodo, starred, recent } = data;
  const diffs = data.difficulty;

  // Solved per day, in the app timezone (same day boundaries as the web heatmap).
  const perDay = new Map<string, number>();
  for (const ts of data.solvedAt) {
    const k = dayKey(new Date(ts));
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }

  // ── Activity heatmap: columns are weeks (Sun→Sat), ending with the current week.
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
  const months = weeks.map((col, i) => {
    const m = new Date(col[0].key + "T00:00:00Z").getUTCMonth();
    const prev = i > 0 ? new Date(weeks[i - 1][0].key + "T00:00:00Z").getUTCMonth() : -1;
    return m !== prev ? new Date(col[0].key + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }) : "";
  });

  // ── Continue: something you started first, otherwise the next Todo in sheet order.
  const next = inProgress[0] ?? nextTodo;
  const moreInProgress = inProgress.slice(1);

  const dateLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div>
          <div className="text-[13px] text-mute">{dateLabel}</div>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        <NewProblemDialog topics={choices.data} label="Log a problem" className="ml-auto" />
      </header>

      {/* Hero: difficulty gauge + activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="flex items-center p-5">
          <div className="w-full">
            <DifficultyGauge stats={diffs} />
          </div>
        </Card>

        <Card className="flex flex-col p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[13px] font-medium text-mute">Activity · last {WEEKS} weeks</h2>
            <div className="text-xs text-mute">
              <b className="font-semibold text-soft">{heatTotal}</b> solved · <b className="font-semibold text-soft">{activeDays}</b> active days
            </div>
          </div>
          <div className="flex flex-1 items-center overflow-x-auto">
            <div className="w-max">
              <div className="mb-1 flex gap-[3px] text-[10px] text-mute" aria-hidden="true">
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
          <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-mute">
            Less
            {SHADES.map((s) => (
              <span key={s} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s }} />
            ))}
            More
          </div>
        </Card>
      </div>

      {/* Continue */}
      {next ? (
        <section aria-label="Continue" className="rounded-2xl bg-brand/[0.06] ring-1 ring-brand/15">
          <IntentLink eager href={`/problems/${next.id}`} className="group flex items-center gap-4 rounded-2xl p-4 transition-colors hover:bg-brand/[0.05]">
            <span className="flex size-11 flex-none items-center justify-center rounded-xl bg-brand/15 text-brand-soft">
              <Sparkles className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-brand-soft">{next.status === "Attempted" ? "Continue where you left off" : "Up next"}</span>
              <span className="mt-0.5 block truncate text-base font-medium text-ink">{next.title}</span>
              <span className="block truncate text-xs text-mute">
                {next.topicName}
                {next.patternName ? ` · ${next.patternName}` : ""} · <span className={DIFF_COLOR[next.difficulty]}>{next.difficulty}</span>
              </span>
            </span>
            <span className="hidden items-center gap-1.5 text-[13px] text-brand-soft sm:flex">
              Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </IntentLink>
          {moreInProgress.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-brand/10 px-4 py-3 text-xs">
              <span className="text-mute">Also in progress</span>
              {moreInProgress.map((p) => (
                <IntentLink
                  eager
                  key={p.id}
                  href={`/problems/${p.id}`}
                  className="inline-flex h-7 max-w-64 items-center gap-1.5 rounded-full bg-fg/[0.04] px-2.5 text-soft hover:bg-fg/[0.08] hover:text-ink"
                >
                  <span className="size-1.5 flex-none rounded-full bg-medium" />
                  <span className="truncate">{p.title}</span>
                </IntentLink>
              ))}
            </div>
          )}
        </section>
      ) : (
        <Card className="flex items-center gap-3 p-4 text-sm text-mute">
          <Check className="size-4 text-easy" /> Every problem in the sheet is solved. Add new ones from any topic.
        </Card>
      )}

      {/* Lists */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHead title="Recent" />
          {recent.length === 0 ? (
            <Empty>Problems you open will show up here.</Empty>
          ) : (
            <ul>
              {recent.map((p) => (
                <ProblemLine
                  key={p.id}
                  id={p.id}
                  title={p.title}
                  sub={p.patternName ? `${p.topicName} · ${p.patternName}` : p.topicName}
                  right={timeAgo(p.lastViewedAt ? new Date(p.lastViewedAt) : null)}
                  difficulty={p.difficulty}
                  icon={<StatusIcon status={p.status} />}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionHead title="Starred" />
          {starred.length === 0 ? (
            <Empty>Star problems you want to revisit — they’ll show up here.</Empty>
          ) : (
            <ul>
              {starred.map((p) => (
                <ProblemLine
                  key={p.id}
                  id={p.id}
                  title={p.title}
                  sub={p.topicName}
                  difficulty={p.difficulty}
                  icon={<Star className="size-3.5 text-medium" fill="currentColor" />}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function SectionHead({ title, meta, href, link }: { title: string; meta?: string; href?: string; link?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="text-[13px] font-medium text-mute">{title}</h2>
      {meta && <span className="text-xs text-faint">{meta}</span>}
      {href && (
        <Link href={href} className="ml-auto text-xs text-mute hover:text-ink">
          {link} →
        </Link>
      )}
    </div>
  );
}

function ProblemLine({
  id,
  title,
  sub,
  right,
  difficulty,
  icon,
}: {
  id: number;
  title: string;
  sub: string;
  right?: string;
  difficulty: Difficulty;
  icon: React.ReactNode;
}) {
  return (
    <li>
      <IntentLink eager href={`/problems/${id}`} className="-mx-2 flex h-11 items-center gap-3 rounded-lg px-2 hover:bg-fg/[0.03]">
        <span className="flex size-4 flex-none items-center justify-center">{icon}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm text-soft">{title}</span>
          <span className="truncate text-[11px] text-mute">{sub}</span>
        </span>
        <span className={cn("text-xs", DIFF_COLOR[difficulty])}>{DIFF_SHORT[difficulty]}</span>
        {right && <span className="w-16 text-right font-mono text-[11px] text-mute">{right}</span>}
      </IntentLink>
    </li>
  );
}

/** Solved ✓, attempted (amber dot), todo (hollow ring). */
function StatusIcon({ status }: { status: Status }) {
  if (status === "Solved") return <Check aria-label="Solved" className="size-3.5 text-easy" strokeWidth={3} />;
  if (status === "Attempted") return <span aria-label="Attempted" className="size-2 rounded-full bg-medium" />;
  return <span aria-label="Todo" className="size-2.5 rounded-full border border-dim" />;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-[13px] text-faint">{children}</p>;
}
