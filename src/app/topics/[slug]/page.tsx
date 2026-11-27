import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowRight, MoreHorizontal, Plus, Sparkles } from "lucide-react";
import { createProblem, deleteTopic, updateTopic } from "@/app/actions";
import TopicBoard from "@/components/TopicBoard";
import { Ring, btnPrimary, inputCls } from "@/components/kit";
import { getTopicBoard, getTopicBySlug } from "@/lib/queries";

const quietBtn =
  "flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-[13px] text-mute hover:bg-white/5 hover:text-ink [&::-webkit-details-marker]:hidden";
const popover = "absolute right-0 z-40 mt-1 flex w-80 flex-col gap-3 rounded-xl border border-line2 bg-[#1c222b] p-4 shadow-2xl";

export default async function TopicPage({ params }: PageProps<"/topics/[slug]">) {
  await connection();
  const { slug } = await params;
  const topic = await getTopicBySlug(slug);
  if (!topic) notFound();

  const board = await getTopicBoard(topic.id);
  const all = board.problems;
  const solved = all.filter((p) => p.status === "Solved").length;
  const left = all.length - solved;
  const pct = all.length ? Math.round((solved / all.length) * 100) : 0;

  // Up next: something you started (Attempted) first, else the next Todo — in pattern order.
  const order = [...board.patterns.map((p) => p.id as number | null), null];
  const ordered = order.flatMap((pid) => all.filter((p) => p.patternId === pid));
  const next = ordered.find((p) => p.status === "Attempted") ?? ordered.find((p) => p.status === "Todo");
  const nextPattern = next ? board.patterns.find((p) => p.id === next.patternId)?.name : undefined;
  const byDiff = (["Easy", "Medium", "Hard"] as const).map((d) => {
    const ps = all.filter((p) => p.difficulty === d);
    return { d, total: ps.length, solved: ps.filter((p) => p.status === "Solved").length };
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-[13px] text-mute">
          <Link href="/topics" className="hover:text-ink">
            Topics
          </Link>
        </nav>
        <header className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{topic.name}</h1>
          <div className="ml-auto flex items-center gap-1">
            <details className="relative">
              <summary className={quietBtn}>
                <Plus className="size-4" /> Problem
              </summary>
              <form action={createProblem} className={popover}>
                <input type="hidden" name="topicId" value={topic.id} />
                <label className="text-xs text-mute">
                  Title
                  <input name="title" required className={`${inputCls} mt-1`} />
                </label>
                <label className="text-xs text-mute">
                  Pattern
                  <select name="patternId" defaultValue="" className={`${inputCls} mt-1`}>
                    <option value="">Unsorted</option>
                    {board.patterns.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-mute">
                  Link
                  <input name="url" type="url" placeholder="https://leetcode.com/problems/…" className={`${inputCls} mt-1`} />
                </label>
                <label className="text-xs text-mute">
                  Difficulty
                  <select name="difficulty" defaultValue="Medium" className={`${inputCls} mt-1`}>
                    <option>Easy</option>
                    <option>Medium</option>
                    <option>Hard</option>
                  </select>
                </label>
                <button className={btnPrimary}>Add and open</button>
              </form>
            </details>
            <details className="relative">
              <summary className={quietBtn} aria-label="Topic options">
                <MoreHorizontal className="size-4" />
              </summary>
              <div className={popover}>
                <form action={updateTopic} className="flex flex-col gap-3">
                  <input type="hidden" name="id" value={topic.id} />
                  <label className="text-xs text-mute">
                    Name
                    <input name="name" required defaultValue={topic.name} className={`${inputCls} mt-1`} />
                  </label>
                  <label className="text-xs text-mute">
                    Description
                    <textarea name="description" rows={3} defaultValue={topic.description} className={`${inputCls} mt-1 py-2`} />
                  </label>
                  <button className={btnPrimary}>Save</button>
                </form>
                <form action={deleteTopic} className="border-t border-line pt-3">
                  <input type="hidden" name="id" value={topic.id} />
                  <button className="h-9 w-full rounded-lg text-sm text-hard hover:bg-[#2c1416]">
                    Delete topic and its {all.length} problems
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>
        {topic.description && <p className="mt-1.5 max-w-2xl text-sm text-mute">{topic.description}</p>}
      </div>

      <section aria-label="Progress" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex items-center gap-4 rounded-xl bg-white/[0.02] p-4">
          <Ring value={solved} max={all.length} size={64} stroke={5} label={`${solved} of ${all.length} solved`}>
            <span className="font-mono text-sm font-semibold text-ink">{pct}%</span>
          </Ring>
          <div className="min-w-0">
            <div className="text-[15px] font-medium text-ink">
              {left === 0 && all.length > 0 ? "Topic complete" : `${left} to go`}
            </div>
            <div className="mt-0.5 text-xs text-mute">
              {solved} of {all.length} solved · {board.patterns.length} patterns
            </div>
            <div className="mt-2 flex gap-3 font-mono text-xs">
              {byDiff.map((x) => (
                <span key={x.d} className={x.d === "Easy" ? "text-easy" : x.d === "Medium" ? "text-medium" : "text-hard"}>
                  {x.d[0]} {x.solved}/{x.total}
                </span>
              ))}
            </div>
          </div>
        </div>

        {next ? (
          <Link
            href={`/problems/${next.id}`}
            className="group flex items-center gap-4 rounded-xl bg-brand/[0.07] p-4 ring-1 ring-brand/15 transition-colors hover:bg-brand/[0.11]"
          >
            <span className="flex size-10 flex-none items-center justify-center rounded-lg bg-brand/15 text-brand-soft">
              <Sparkles className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-brand-soft">{next.status === "Attempted" ? "Continue where you left off" : "Up next"}</span>
              <span className="mt-0.5 block truncate text-[15px] font-medium text-ink">{next.title}</span>
              <span className="block truncate text-xs text-mute">
                {nextPattern ?? "Unsorted"} · {next.difficulty}
              </span>
            </span>
            <ArrowRight className="size-4 flex-none text-brand-soft transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <div className="flex items-center gap-4 rounded-xl bg-white/[0.02] p-4 text-sm text-mute">
            {all.length ? "Everything here is solved. Nice work." : "No problems yet — add one with + Problem."}
          </div>
        )}
      </section>

      <TopicBoard topicId={topic.id} patterns={board.patterns} problems={board.problems} />
    </div>
  );
}
