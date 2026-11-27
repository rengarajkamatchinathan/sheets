import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import ProblemEditor from "@/components/ProblemEditor";
import { getProblem } from "@/lib/queries";

export default async function ProblemPage({ params }: PageProps<"/problems/[id]">) {
  await connection();
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n)) notFound();
  const row = await getProblem(n);
  if (!row) notFound();
  const { problem: p, topic } = row;

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
        / {p.title}
      </nav>
      <ProblemEditor
        topicSlug={topic.slug}
        initial={{
          id: p.id,
          title: p.title,
          url: p.url,
          lcNumber: p.lcNumber,
          difficulty: p.difficulty,
          status: p.status,
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
