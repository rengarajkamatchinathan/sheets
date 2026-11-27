import Link from "next/link";
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

  const href = (f: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f !== "all") p.set("f", f);
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
