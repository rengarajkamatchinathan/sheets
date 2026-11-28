// Desktop port of src/app/problems/[id]/page.tsx, plus the conflicted-notes banner.
import { useState } from "react";
import Link from "next/link";
import { useParams } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { TriangleAlert } from "lucide-react";
import { updateProblem } from "@/app/actions";
import MarkViewed from "@/components/problem/MarkViewed";
import ProblemView from "@/components/problem/ProblemView";
import { StaticRichText } from "@/components/problem/RichText";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ProblemUpdate } from "@/app/actions";
import { relativeDay } from "@/lib/dates";
import { cleanDescription, cleanRichText } from "@/lib/sanitize";
import { parseSplit, SPLIT_COOKIE } from "@/lib/split";
import { refreshData, useCommand } from "../data";
import { Loading, NotFound } from "./common";

type Snippet = { id: number; name: string; language: string; code: string; timeComplexity: string; spaceComplexity: string };
type ProblemRow = ProblemUpdate & { id: number };
type ProblemPageData = {
  problem: ProblemRow;
  topic: { id: number; name: string; slug: string };
  patternName: string | null;
  patterns: { id: number; name: string }[];
  snippets: Snippet[];
} | null;

type Conflict = { id: number; field: string; value: string; side: "desktop" | "web"; createdAt: string };

function readSplit() {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${SPLIT_COOKIE}=`))
    ?.slice(SPLIT_COOKIE.length + 1);
  return parseSplit(raw);
}

export default function ProblemPage() {
  const { id: param = "" } = useParams();
  const n = Number(param);
  const row = useCommand<ProblemPageData>("q_problem_page", { id: Number.isInteger(n) ? n : 0 });
  // Bumped to remount the editor with fresh data (after restoring a conflicted version).
  const [version, setVersion] = useState(0);
  const [hidden, setHidden] = useState(false);

  if (!Number.isInteger(n)) return <NotFound what="problem" />;
  if (row.data === undefined) return <Loading error={row.error} />;
  if (row.data === null) return <NotFound what="problem" />;
  const { problem: p, topic, patternName, patterns, snippets } = row.data;

  async function restore(c: Conflict) {
    setHidden(true); // unmount the editor so its state can't overwrite the restored notes
    try {
      await updateProblem(n, { notes: c.value }, { order: snippets.map((s) => ({ key: `s${s.id}`, id: s.id })), changed: [] });
      await invoke("a_dismiss_conflict", { id: c.id });
      await refreshData();
    } finally {
      setVersion((v) => v + 1);
      setHidden(false);
    }
  }

  return (
    // Desktop: cancel the layout's page padding and fill the viewport edge-to-edge, like LeetCode.
    <div className="flex flex-col gap-2 lg:-mx-10 lg:-my-8 lg:h-dvh lg:px-3 lg:pt-2.5 lg:pb-3">
      <MarkViewed id={n} />
      <nav aria-label="Breadcrumb" className="text-xs text-mute">
        <Link href="/topics" className="hover:text-ink">
          Topics
        </Link>
        <span className="mx-1.5 text-dim">/</span>
        <Link href={`/topics/${topic.slug}`} className="hover:text-ink">
          {topic.name}
        </Link>
        {patternName && (
          <>
            <span className="mx-1.5 text-dim">/</span>
            <span>{patternName}</span>
          </>
        )}
      </nav>
      <ConflictBanner problemId={n} onRestore={restore} />
      {!hidden && (
        <ProblemView
          // Keyed by the URL id (stable even after a sync maps an offline id to the server's).
          key={`${param}:${version}`}
          id={n}
          topicSlug={topic.slug}
          patterns={patterns}
          split={readSplit()}
          initialTabs={snippets.map((s) => ({ ...s, key: `s${s.id}` }))}
          initial={{
            title: p.title,
            url: p.url,
            lcNumber: p.lcNumber,
            difficulty: p.difficulty,
            status: p.status,
            patternId: p.patternId,
            starred: p.starred,
            tags: p.tags,
            // Sanitized on load, as the web loader does.
            notes: cleanRichText(p.notes),
            description: cleanDescription(p.description),
            timeTakenMin: p.timeTakenMin,
          }}
        />
      )}
    </div>
  );
}

/**
 * Shown when these notes were edited both here and on the web before a sync: the version
 * that lost (by "latest edit wins") is kept and can be viewed, restored, or dismissed.
 */
function ConflictBanner({ problemId, onRestore }: { problemId: number; onRestore: (c: Conflict) => Promise<void> }) {
  const conflicts = useCommand<Conflict[]>("q_conflicts", { problemId });
  const [viewing, setViewing] = useState<Conflict | null>(null);
  const [busy, setBusy] = useState(false);
  const c = conflicts.data?.[0];
  if (!c) return null;

  const other = c.side === "desktop" ? "this computer" : "the web";
  const dismiss = async () => {
    await invoke("a_dismiss_conflict", { id: c.id });
    await refreshData();
  };

  return (
    <>
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-medium-bg px-3 py-2 text-[13px] text-soft">
        <TriangleAlert className="size-4 flex-none text-medium" />
        <span className="min-w-0 flex-1">
          These notes were edited on both sides before syncing. The version from <b className="font-medium">{other}</b> (
          {relativeDay(new Date(c.createdAt))}) was replaced and is kept here.
        </span>
        <span className="flex items-center gap-1">
          <button type="button" onClick={() => setViewing(c)} className="rounded-md px-2 py-1 hover:bg-fg/[0.06]">
            View
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onRestore(c).finally(() => setBusy(false));
            }}
            className="rounded-md px-2 py-1 hover:bg-fg/[0.06]"
          >
            Restore it
          </button>
          <button type="button" onClick={dismiss} className="rounded-md px-2 py-1 text-mute hover:bg-fg/[0.06]">
            Dismiss
          </button>
        </span>
      </div>
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogTitle>Replaced notes from {other}</DialogTitle>
          <DialogDescription>Restoring replaces the current notes with this version.</DialogDescription>
          {viewing && <StaticRichText readonly html={cleanRichText(viewing.value)} className="mt-2" />}
          <div className="mt-3 flex justify-end">
            <Button
              onClick={async () => {
                const v = viewing;
                setViewing(null);
                if (v) await onRestore(v);
              }}
            >
              Restore this version
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
