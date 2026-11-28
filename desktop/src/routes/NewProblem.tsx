// Desktop port of src/app/problems/new/page.tsx.
import Link from "next/link";
import { useSearchParams } from "react-router";
import { ProblemCreator } from "@/components/NewProblem";
import type { TopicChoice } from "@/lib/queries";
import { useCommand } from "../data";
import { Loading } from "./common";

export default function NewProblemPage() {
  const [sp] = useSearchParams();
  const topicsQ = useCommand<TopicChoice[]>("q_topic_choices");
  if (!topicsQ.data) return <Loading error={topicsQ.error} />;
  const topics = topicsQ.data;
  const slug = sp.get("topic");
  const preset = slug ? topics.find((t) => t.slug === slug)?.id : undefined;

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
