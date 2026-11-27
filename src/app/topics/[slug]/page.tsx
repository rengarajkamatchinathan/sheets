import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createProblem, deleteTopic, updateTopic } from "@/app/actions";
import TopicBoard from "@/components/TopicBoard";
import { Bar, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { getTopicBoard, getTopicBySlug } from "@/lib/queries";

export default async function TopicPage({ params }: PageProps<"/topics/[slug]">) {
  await connection();
  const { slug } = await params;
  const topic = await getTopicBySlug(slug);
  if (!topic) notFound();

  const board = await getTopicBoard(topic.id);
  const all = board.problems;
  const solved = all.filter((p) => p.status === "Solved").length;
  const count = (d: string) => all.filter((p) => p.difficulty === d).length;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-[13px] text-mute">
        <Link href="/topics" className="text-accent-soft hover:underline">
          Topics
        </Link>{" "}
        / {topic.name}
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight">{topic.name}</h1>
          {topic.description && <p className="mt-1.5 text-sm leading-relaxed text-mute">{topic.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-mute">
            <span>
              <b className="text-ink">{solved}</b> / {all.length} solved
            </span>
            <span>{board.patterns.length} patterns</span>
            <span className="font-mono">
              <span className="text-easy">E {count("Easy")}</span> · <span className="text-medium">M {count("Medium")}</span> ·{" "}
              <span className="text-hard">H {count("Hard")}</span>
            </span>
          </div>
          <div className="mt-2 w-64 max-w-full">
            <Bar value={solved} max={all.length} />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <details className="relative">
            <summary className={`${btnGhost} cursor-pointer list-none`}>Edit topic</summary>
            <div className="absolute right-0 z-40 mt-2 flex w-80 flex-col gap-3 rounded-xl border border-line2 bg-panel p-4 shadow-2xl">
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
                <button className="min-h-11 w-full rounded-lg text-sm font-semibold text-hard hover:bg-[#2c1416]">
                  Delete topic and its {all.length} problems
                </button>
              </form>
            </div>
          </details>
          <details className="relative">
            <summary className={`${btnPrimary} cursor-pointer list-none`}>+ Add problem</summary>
            <form action={createProblem} className="absolute right-0 z-40 mt-2 flex w-80 flex-col gap-3 rounded-xl border border-line2 bg-panel p-4 shadow-2xl">
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
              <div className="flex gap-3">
                <label className="flex-1 text-xs text-mute">
                  Difficulty
                  <select name="difficulty" defaultValue="Medium" className={`${inputCls} mt-1`}>
                    <option>Easy</option>
                    <option>Medium</option>
                    <option>Hard</option>
                  </select>
                </label>
                <label className="w-24 text-xs text-mute">
                  LC #
                  <input name="lcNumber" inputMode="numeric" className={`${inputCls} mt-1`} />
                </label>
              </div>
              <label className="text-xs text-mute">
                Tags (comma separated)
                <input name="tags" placeholder="Hashing, Prefix sum" className={`${inputCls} mt-1`} />
              </label>
              <button className={btnPrimary}>Add and open</button>
            </form>
          </details>
        </div>
      </header>

      <TopicBoard topicId={topic.id} patterns={board.patterns} problems={board.problems} />
    </div>
  );
}
