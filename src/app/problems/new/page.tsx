import Link from "next/link";
import { ProblemCreator } from "@/components/NewProblem";
import { loadTopicChoices } from "@/lib/queries";

export default async function NewProblemPage({ searchParams }: PageProps<"/problems/new">) {
  const sp = await searchParams;
  const topics = await loadTopicChoices();
  const preset = typeof sp.topic === "string" ? topics.find((t) => t.slug === sp.topic)?.id : undefined;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <nav aria-label="Breadcrumb" className="text-[13px] text-mute">
        <Link href="/" className="hover:text-ink">
          Dashboard
        </Link>
      </nav>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New problem</h1>
        <p className="mt-1 text-sm text-mute">Paste a LeetCode link to fill in the details automatically.</p>
      </div>
      <div className="rounded-2xl bg-fg/[0.02] p-5">
        <ProblemCreator topics={topics} defaultTopicId={preset} />
      </div>
    </div>
  );
}
