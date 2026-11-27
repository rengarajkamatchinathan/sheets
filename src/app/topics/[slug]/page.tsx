import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createProblem, deleteTopic, updateTopic } from "@/app/actions";
import StatusSelect from "@/components/StatusSelect";
import { Card, DIFF_TEXT, Tag, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { prettyDay, dayKey } from "@/lib/dates";
import { getProblemsForTopic, getTopicBySlug } from "@/lib/queries";

const STATUS_FILTERS = ["All", "Todo", "Attempted", "Solved"] as const;
const DIFF_FILTERS = ["All", "Easy", "Medium", "Hard"] as const;

export default async function TopicPage({ params, searchParams }: PageProps<"/topics/[slug]">) {
  await connection();
  const { slug } = await params;
  const sp = await searchParams;
  const topic = await getTopicBySlug(slug);
  if (!topic) notFound();

  const all = await getProblemsForTopic(topic.id);
  const sf = typeof sp.s === "string" ? sp.s : "All";
  const df = typeof sp.d === "string" ? sp.d : "All";
  const rows = all.filter((p) => (sf === "All" || p.status === sf) && (df === "All" || p.difficulty === df));

  const solved = all.filter((p) => p.status === "Solved").length;
  const count = (d: string) => all.filter((p) => p.difficulty === d).length;

  const href = (s: string, d: string) => {
    const p = new URLSearchParams();
    if (s !== "All") p.set("s", s);
    if (d !== "All") p.set("d", d);
    const q = p.toString();
    return q ? `/topics/${slug}?${q}` : `/topics/${slug}`;
  };

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
        </div>
        <div className="flex flex-wrap gap-3">
          <details className="relative">
            <summary className={`${btnGhost} cursor-pointer list-none`}>Edit topic</summary>
            <div className="absolute right-0 z-10 mt-2 flex w-80 flex-col gap-3 rounded-xl border border-line2 bg-panel p-4 shadow-2xl">
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
            <form action={createProblem} className="absolute right-0 z-10 mt-2 flex w-80 flex-col gap-3 rounded-xl border border-line2 bg-panel p-4 shadow-2xl">
              <input type="hidden" name="topicId" value={topic.id} />
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
                <label className="w-24 text-xs text-mute">
                  LC #
                  <input name="lcNumber" inputMode="numeric" className={`${inputCls} mt-1`} />
                </label>
              </div>
              <label className="text-xs text-mute">
                Pattern tags (comma separated)
                <input name="tags" placeholder="Two Pointers, Hashing" className={`${inputCls} mt-1`} />
              </label>
              <button className={btnPrimary}>Add and open</button>
            </form>
          </details>
        </div>
      </header>

      <div className="flex flex-wrap gap-4">
        <Card className="px-4 py-3 text-[13px] text-mute">
          Solved{" "}
          <b className="ml-1.5 text-lg text-ink">
            {solved} / {all.length}
          </b>
        </Card>
        <Card className="px-4 py-3 text-[13px] text-mute">
          E / M / H{" "}
          <b className="ml-1.5 text-lg text-ink">
            {count("Easy")} / {count("Medium")} / {count("Hard")}
          </b>
        </Card>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
        <FilterRow label="Status" items={STATUS_FILTERS} active={sf} link={(v) => href(v, df)} />
        <FilterRow label="Difficulty" items={DIFF_FILTERS} active={df} link={(v) => href(sf, v)} />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs tracking-wide text-mute uppercase">
              <th className="px-5 py-3.5 font-semibold">Status</th>
              <th className="px-3 py-3.5 font-semibold">Problem</th>
              <th className="px-3 py-3.5 font-semibold">Difficulty</th>
              <th className="px-3 py-3.5 font-semibold">Patterns</th>
              <th className="px-5 py-3.5 font-semibold">Solved</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="border-t border-line px-5 py-8 text-center text-mute">
                  No problems here yet.
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-line hover:bg-[#1a2029]">
                <td className="px-5 py-3">
                  <StatusSelect id={p.id} status={p.status} />
                </td>
                <td className="px-3 py-3">
                  <Link href={`/problems/${p.id}`} className="font-medium hover:text-accent-soft">
                    {p.title}
                  </Link>
                  {p.lcNumber != null && <div className="mt-0.5 font-mono text-xs text-mute">LC {p.lcNumber}</div>}
                </td>
                <td className={`px-3 py-3 text-[13px] font-semibold ${DIFF_TEXT[p.difficulty]}`}>{p.difficulty}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {p.tags.length ? p.tags.map((t) => <Tag key={t}>{t}</Tag>) : <span className="text-mute">—</span>}
                  </div>
                </td>
                <td className="px-5 py-3 font-mono text-[13px] text-mute">{p.solvedAt ? prettyDay(dayKey(p.solvedAt)) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function FilterRow({
  label,
  items,
  active,
  link,
}: {
  label: string;
  items: readonly string[];
  active: string;
  link: (v: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="mr-1 text-mute">{label}</span>
      {items.map((v) => (
        <Link
          key={v}
          href={link(v)}
          aria-current={active === v ? "true" : undefined}
          className={`inline-flex min-h-8 items-center rounded-full border px-3 ${
            active === v ? "border-accent bg-[#12302d] font-semibold text-accent-soft" : "border-line2 text-mute hover:text-ink"
          }`}
        >
          {v}
        </Link>
      ))}
    </div>
  );
}
