import Link from "next/link";
import { createProblem } from "@/app/actions";
import { Card, btnPrimary, inputCls } from "@/components/kit";
import { loadTopics } from "@/lib/queries";

export default async function NewProblemPage({ searchParams }: PageProps<"/problems/new">) {
  const sp = await searchParams;
  const topics = await loadTopics();
  const preset = typeof sp.topic === "string" ? topics.find((t) => t.slug === sp.topic)?.id : undefined;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-[13px] text-mute">
        <Link href="/" className="text-brand-soft hover:underline">
          Dashboard
        </Link>{" "}
        / Log a problem
      </nav>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Log a problem</h1>
        <p className="mt-1.5 text-sm text-mute">
          Add a problem that isn’t in the sheet. To log one that already is, open it from its topic and set its status to Solved.
        </p>
      </div>
      <Card className="p-5">
        <form action={createProblem} className="flex flex-col gap-4">
          <label className="text-xs text-mute">
            Topic
            <select name="topicId" required defaultValue={preset ?? ""} className={`${inputCls} mt-1`}>
              <option value="" disabled>
                Choose a topic…
              </option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-mute">
            Title
            <input name="title" required className={`${inputCls} mt-1`} />
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
            <label className="w-28 text-xs text-mute">
              LC #
              <input name="lcNumber" inputMode="numeric" className={`${inputCls} mt-1`} />
            </label>
          </div>
          <label className="text-xs text-mute">
            Pattern tags (comma separated)
            <input name="tags" placeholder="Two Pointers, Hashing" className={`${inputCls} mt-1`} />
          </label>
          <button className={`${btnPrimary} self-start`}>Add and open notes</button>
        </form>
      </Card>
    </div>
  );
}
