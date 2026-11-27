import Link from "next/link";
import { LayoutGrid, List } from "lucide-react";
import { connection } from "next/server";
import { createTopic } from "@/app/actions";
import { Bar, Card, DIFF_TEXT, StatusPill, btnGhost, btnPrimary, inputCls } from "@/components/kit";
import { getTopicStats, searchProblems } from "@/lib/queries";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "progress", label: "In progress" },
  { key: "new", label: "Not started" },
  { key: "done", label: "Completed" },
] as const;

export default async function TopicsPage({ searchParams }: PageProps<"/topics">) {
  await connection();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const filter = typeof sp.f === "string" ? sp.f : "all";
  const view = sp.view === "grid" ? "grid" : "list";

  const [all, matches] = await Promise.all([getTopicStats(), q ? searchProblems(q) : Promise.resolve([])]);
  const totalSolved = all.reduce((a, t) => a + t.solved, 0);
  const total = all.reduce((a, t) => a + t.total, 0);

  const topics = all.filter((t) => {
    if (q && !t.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "progress") return t.solved > 0 && t.solved < t.total;
    if (filter === "new") return t.solved === 0;
    if (filter === "done") return t.total > 0 && t.solved === t.total;
    return true;
  });

  const href = (f: string, v: string = view) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f !== "all") p.set("f", f);
    if (v !== "list") p.set("view", v);
    const s = p.toString();
    return s ? `/topics?${s}` : "/topics";
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Topics</h1>
          <p className="mt-1.5 text-sm text-mute">
            {all.length} topics · {totalSolved} of {total} solved
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <form action="/topics" className="flex items-center">
            {filter !== "all" && <input type="hidden" name="f" value={filter} />}
            {view !== "list" && <input type="hidden" name="view" value={view} />}
            <label className="sr-only" htmlFor="q">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={q} placeholder="Search topics, problems, tags…" className={`${inputCls} w-64`} />
          </form>
          <details className="relative">
            <summary className={`${btnGhost} cursor-pointer list-none`}>+ New topic</summary>
            <form action={createTopic} className="absolute right-0 z-10 mt-2 flex w-80 flex-col gap-3 rounded-xl border border-line2 bg-panel p-4 shadow-2xl">
              <label className="text-xs text-mute">
                Name
                <input name="name" required className={`${inputCls} mt-1`} placeholder="e.g. Segment Trees" />
              </label>
              <label className="text-xs text-mute">
                Description (optional)
                <input name="description" className={`${inputCls} mt-1`} />
              </label>
              <button className={btnPrimary}>Create topic</button>
            </form>
          </details>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Filter topics" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={href(f.key)}
            aria-current={filter === f.key ? "true" : undefined}
            className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] ${
              filter === f.key ? "border-brand bg-[#12302d] font-semibold text-brand-soft" : "border-line2 text-mute hover:text-ink"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>
        <div role="group" aria-label="View" className="flex rounded-lg border border-line2 bg-side p-0.5">
          {([
            ["list", "List", <List key="l" className="size-4" />],
            ["grid", "Grid", <LayoutGrid key="g" className="size-4" />],
          ] as const).map(([v, label, icon]) => (
            <Link
              key={v}
              href={href(filter, v)}
              aria-current={view === v ? "true" : undefined}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] ${
                view === v ? "bg-chip font-semibold text-ink" : "text-mute hover:text-ink"
              }`}
            >
              {icon}
              {label}
            </Link>
          ))}
        </div>
      </div>

      {q && matches.length > 0 && (
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">
            Problems matching “{q}” <span className="font-normal text-mute">· {matches.length}</span>
          </h2>
          <ul>
            {matches.map((m) => (
              <li key={m.id} className="border-t border-line first:border-t-0">
                <Link href={`/problems/${m.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-chip">
                  <StatusPill s={m.status} />
                  <span className="min-w-0 flex-1 text-sm font-medium">{m.title}</span>
                  <span className="text-xs text-mute">{m.topicName}</span>
                  <span className={`text-xs font-semibold ${DIFF_TEXT[m.difficulty]}`}>{m.difficulty}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {topics.length === 0 ? (
        <p className="text-sm text-mute">No topics match.</p>
      ) : view === "list" ? (
        <TopicList topics={topics} all={all} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {topics.map((t) => {
            const pct = t.total ? Math.round((t.solved / t.total) * 100) : 0;
            const idx = all.indexOf(t) + 1;
            return (
              <Link
                key={t.id}
                href={`/topics/${t.slug}`}
                className="flex flex-col gap-3.5 rounded-2xl border border-line bg-panel px-5 py-4 transition-colors hover:border-line2 hover:bg-[#1a2029]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-xs text-mute">{String(idx).padStart(2, "0")}</div>
                    <div className="mt-1 text-base font-semibold">{t.name}</div>
                  </div>
                  {t.total > 0 && t.solved === t.total && (
                    <span className="flex-none rounded-full bg-[#12291a] px-2 py-0.5 text-xs font-semibold text-easy">Done</span>
                  )}
                </div>
                <div>
                  <div className="mb-1.5 flex justify-between text-[13px] text-mute">
                    <span>
                      {t.solved} / {t.total} solved
                    </span>
                    <span className="font-mono">{pct}%</span>
                  </div>
                  <Bar value={t.solved} max={t.total} />
                </div>
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="text-easy">E {t.easy}</span>
                  <span className="text-medium">M {t.medium}</span>
                  <span className="text-hard">H {t.hard}</span>
                  <span className="ml-auto font-sans text-mute">{t.patterns} patterns</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

type TopicRow = Awaited<ReturnType<typeof getTopicStats>>[number];

function TopicList({ topics, all }: { topics: TopicRow[]; all: TopicRow[] }) {
  const cols = "md:grid-cols-[2.5rem_minmax(0,1fr)_6rem_8.5rem_minmax(8rem,14rem)_4.5rem]";
  return (
    <Card className="overflow-hidden">
      <div
        aria-hidden="true"
        className={`hidden gap-4 border-b border-line px-5 py-2.5 text-[11px] font-semibold tracking-wide text-mute uppercase md:grid ${cols}`}
      >
        <span>#</span>
        <span>Topic</span>
        <span>Patterns</span>
        <span>Difficulty</span>
        <span>Progress</span>
        <span className="text-right">Solved</span>
      </div>
      <ul>
        {topics.map((t) => {
          const pct = t.total ? Math.round((t.solved / t.total) * 100) : 0;
          const done = t.total > 0 && t.solved === t.total;
          return (
            <li key={t.id} className="border-t border-line first:border-t-0">
              <Link
                href={`/topics/${t.slug}`}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-[#1a2029] ${cols}`}
              >
                <span className="hidden font-mono text-xs text-mute md:block">{String(all.indexOf(t) + 1).padStart(2, "0")}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[15px] font-medium">{t.name}</span>
                  {done && <span className="flex-none rounded-full bg-[#12291a] px-2 py-0.5 text-[11px] font-semibold text-easy">Done</span>}
                </span>
                <span className="hidden text-[13px] text-mute md:block">{t.patterns}</span>
                <span className="hidden gap-2.5 font-mono text-xs md:flex">
                  <span className="text-easy">E {t.easy}</span>
                  <span className="text-medium">M {t.medium}</span>
                  <span className="text-hard">H {t.hard}</span>
                </span>
                <span className="col-span-2 flex items-center gap-3 md:col-span-1">
                  <span className="flex-1">
                    <Bar value={t.solved} max={t.total} />
                  </span>
                  <span className="w-9 text-right font-mono text-xs text-mute">{pct}%</span>
                </span>
                <span className="row-start-1 text-right font-mono text-[13px] text-soft md:row-start-auto">
                  {t.solved}/{t.total}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
