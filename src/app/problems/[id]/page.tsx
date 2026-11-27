import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import ProblemEditor from "@/components/ProblemEditor";
import { getPatternsForTopic, getProblem } from "@/lib/queries";

export default async function ProblemPage({ params }: PageProps<"/problems/[id]">) {
  await connection();
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n)) notFound();
  const row = await getProblem(n);
  if (!row) notFound();
  const { problem: p, topic, patternName } = row;
  const patterns = await getPatternsForTopic(topic.id);

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="text-[13px] text-mute">
        <Link href="/topics" className="text-accent-soft hover:underline">
          Topics
        </Link>{" "}
        /{" "}
        <Link href={`/topics/${topic.slug}`} className="text-accent-soft hover:underline">
          {topic.name}
        </Link>{" "}
        / {patternName ? <>{patternName} / </> : null}
        {p.title}
      </nav>
      <ProblemEditor
        topicSlug={topic.slug}
        patterns={patterns}
        initial={{
          id: p.id,
          title: p.title,
          url: p.url,
          lcNumber: p.lcNumber,
          difficulty: p.difficulty,
          status: p.status,
          patternId: p.patternId,
          starred: p.starred,
          tags: p.tags,
          notes: p.notes,
          code: p.code,
          language: p.language,
          timeComplexity: p.timeComplexity,
          spaceComplexity: p.spaceComplexity,
          timeTakenMin: p.timeTakenMin,
          solvedAt: p.solvedAt?.toISOString() ?? null,
        }}
      />
    </div>
  );
}
