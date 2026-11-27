import Link from "next/link";
import { connection } from "next/server";
import { Check, LayoutGrid, List, Plus, Search } from "lucide-react";
import { createTopic } from "@/app/actions";
import FilterMenu from "@/components/FilterMenu";
import { Ring, btnPrimary, inputCls } from "@/components/kit";
import { getTopicStats, searchProblems } from "@/lib/queries";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "progress", label: "In progress" },
  { key: "new", label: "Not started" },
  { key: "done", label: "Completed" },
] as const;

const DIFF_COLOR = { Easy: "text-easy", Medium: "text-medium", Hard: "text-hard" } as const;

type TopicRow = Awaited<ReturnType<typeof getTopicStats>>[number];

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
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Topics</h1>
        <span className="font-mono text-[13px] text-mute">
          {totalSolved}/{total}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <form action="/topics" className="relative">
            {filter !== "all" && <input type="hidden" name="f" value={filter} />}
            {view !== "list" && <input type="hidden" name="view" value={view} />}
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-mute" />
            <label className="sr-only" htmlFor="q">
              Search
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search"
              className="h-8 w-44 rounded-md bg-transparent pr-2 pl-8 text-[13px] text-ink placeholder:text-mute hover:bg-white/5 focus:w-60 focus:bg-white/5 focus:outline-none transition-[width]"
            />
          </form>
          <details className="relative">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-[13px] text-mute hover:bg-white/5 hover:text-ink [&::-webkit-details-marker]:hidden">
              <Plus className="size-4" /> Topic
            </summary>
            <form
              action={createTopic}
              className="absolute right-0 z-10 mt-1 flex w-80 flex-col gap-3 rounded-xl border border-line2 bg-[#1c222b] p-4 shadow-2xl"
            >
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

      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <FilterMenu
          activeCount={filter !== "all" ? 1 : 0}
          resetHref={href("all")}
          sections={[
            {
              key: "progress",
              title: "Progress",
              options: FILTERS.map((f) => ({ label: f.label, href: href(f.key), active: filter === f.key })),
            },
          ]}
        />
        {filter !== "all" && (
          <span className="text-mute">
            {FILTERS.find((f) => f.key === filter)?.label} · {topics.length}
          </span>
        )}
        <nav aria-label="View" className="ml-auto flex items-center gap-0.5">
          {(
            [
              ["list", "List view", List],
              ["grid", "Grid view", LayoutGrid],
            ] as const
          ).map(([v, label, Icon]) => (
            <Link
              key={v}
              href={href(filter, v)}
              aria-label={label}
              title={label}
              aria-current={view === v ? "true" : undefined}
              className={cn(
                "flex size-7 items-center justify-center rounded-md",
                view === v ? "bg-white/[0.06] text-ink" : "text-mute hover:text-ink",
              )}
            >
              <Icon className="size-4" />
            </Link>
          ))}
        </nav>
      </div>

      {q && matches.length > 0 && (
        <section aria-label="Matching problems">
          <h2 className="mb-1 text-xs text-mute">
            Problems matching “{q}” · {matches.length}
          </h2>
          <ul>
            {matches.map((m) => (
              <li key={m.id}>
                <Link href={`/problems/${m.id}`} className="flex h-10 items-center gap-3 rounded-lg px-2 text-sm hover:bg-white/[0.025]">
                  {m.status === "Solved" ? (
                    <Check className="size-3.5 flex-none text-easy" />
                  ) : (
                    <span className="size-3.5 flex-none" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-soft">{m.title}</span>
                  <span className="hidden text-xs text-mute sm:inline">{m.topicName}</span>
                  <span className={cn("w-12 text-right text-xs", DIFF_COLOR[m.difficulty])}>
                    {m.difficulty === "Medium" ? "Med" : m.difficulty}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {topics.length === 0 ? (
        <p className="text-sm text-mute">No topics match.</p>
      ) : view === "list" ? (
        <TopicList topics={topics} />
      ) : (
        <TopicGrid topics={topics} />
      )}
    </div>
  );
}

function Thin({ solved, total }: { solved: number; total: number }) {
  const done = total > 0 && solved === total;
  return (
    <span className="block h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
      <span
        className="block h-full rounded-full"
        style={{ width: `${total ? (solved / total) * 100 : 0}%`, background: done ? "#4ade80" : "#2dd4bf" }}
      />
    </span>
  );
}

function toGo(t: TopicRow) {
  if (t.total === 0) return "Empty";
  if (t.solved === t.total) return "Complete";
  return `${t.total - t.solved} to go`;
}

function TopicList({ topics }: { topics: TopicRow[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {topics.map((t) => {
        const done = t.total > 0 && t.solved === t.total;
        return (
          <li key={t.id}>
            <Link
              href={`/topics/${t.slug}`}
              className="group flex min-h-14 items-center gap-3.5 rounded-xl bg-white/[0.02] px-3.5 transition-colors hover:bg-white/[0.045]"
            >
              <Ring value={t.solved} max={t.total} size={30} stroke={3}>
                {done && <Check className="size-3.5 text-easy" strokeWidth={3} />}
              </Ring>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-medium text-ink">{t.name}</span>
                <span className="text-xs text-mute">
                  {toGo(t)} · {t.patterns} patterns
                </span>
              </span>
              <span className="hidden w-28 sm:block">
                <Thin solved={t.solved} total={t.total} />
              </span>
              <span className="w-12 text-right font-mono text-xs text-mute">
                {t.solved}/{t.total}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function TopicGrid({ topics }: { topics: TopicRow[] }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
      {topics.map((t) => {
        const done = t.total > 0 && t.solved === t.total;
        return (
          <li key={t.id}>
            <Link
              href={`/topics/${t.slug}`}
              className="flex h-full flex-col gap-4 rounded-xl bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.045]"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[15px] font-medium text-ink">{t.name}</span>
                  <span className="mt-0.5 text-xs text-mute">{toGo(t)}</span>
                </span>
                <Ring value={t.solved} max={t.total} size={30} stroke={3}>
                  {done && <Check className="size-3.5 text-easy" strokeWidth={3} />}
                </Ring>
              </span>
              <span className="mt-auto flex items-center gap-3">
                <span className="flex-1">
                  <Thin solved={t.solved} total={t.total} />
                </span>
                <span className="font-mono text-xs text-mute">
                  {t.solved}/{t.total}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
