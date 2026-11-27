import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import ProblemView from "@/components/problem/ProblemView";
import { getPatternsForTopic, getProblem, getSnippets } from "@/lib/queries";

export default async function ProblemPage({ params }: PageProps<"/problems/[id]">) {
  await connection();
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n)) notFound();
  const row = await getProblem(n);
  if (!row) notFound();
  const { problem: p, topic, patternName } = row;
  const [patterns, snippets] = await Promise.all([getPatternsForTopic(topic.id), getSnippets(p.id)]);

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="text-[13px] text-mute">
        <Link href="/topics" className="hover:text-ink">
          Topics
        </Link>
        <span className="mx-1.5 text-[#4a5462]">/</span>
        <Link href={`/topics/${topic.slug}`} className="hover:text-ink">
          {topic.name}
        </Link>
        {patternName && (
          <>
            <span className="mx-1.5 text-[#4a5462]">/</span>
            <span>{patternName}</span>
          </>
        )}
      </nav>
      <ProblemView
        id={p.id}
        topicSlug={topic.slug}
        patterns={patterns}
        initialSolvedAt={p.solvedAt?.toISOString() ?? null}
        initialTabs={snippets.map((s) => ({ key: `s${s.id}`, id: s.id, name: s.name, language: s.language, code: s.code }))}
        initial={{
          title: p.title,
          url: p.url,
          lcNumber: p.lcNumber,
          difficulty: p.difficulty,
          status: p.status,
          patternId: p.patternId,
          starred: p.starred,
          tags: p.tags,
          notes: p.notes,
          timeComplexity: p.timeComplexity,
          spaceComplexity: p.spaceComplexity,
          timeTakenMin: p.timeTakenMin,
        }}
      />
    </div>
  );
}
