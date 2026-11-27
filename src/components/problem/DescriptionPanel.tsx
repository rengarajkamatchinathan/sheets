"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, RefreshCw } from "lucide-react";
import { fetchDescription } from "@/app/actions";
import type { FetchResult } from "@/lib/leetcode";
import { cn } from "@/lib/utils";
import NotesEditor from "./NotesEditor";

const isLeetCode = (url: string) => /^https?:\/\/(?:www\.)?leetcode\.(?:com|cn)\/problems\/[a-z0-9-]+/i.test(url);

const REASON: Record<Exclude<FetchResult, { ok: true }>["reason"], string> = {
  "not-leetcode": "Add a LeetCode link to fetch the statement automatically, or paste it.",
  premium: "This is a LeetCode Premium problem, so its statement can’t be fetched. Paste it instead.",
  "not-found": "LeetCode didn’t return a statement for this link. Check the link, or paste it.",
  network: "Couldn’t reach LeetCode right now. Try again, or paste the statement.",
};

/**
 * Problem statement: a clean read view with Edit. If empty and the link is a
 * LeetCode URL, it's fetched once automatically (server-side, slug only).
 */
export default function DescriptionPanel({
  problemId,
  url,
  html,
  onChange,
}: {
  problemId: number;
  url: string;
  html: string;
  onChange: (html: string) => void;
}) {
  const leet = isLeetCode(url);
  const [editing, setEditing] = useState(false);
  const [fetching, setFetching] = useState(() => !html.trim() && leet); // auto-fetch on first open
  const [error, setError] = useState<string | null>(() => (!html.trim() && !leet ? REASON["not-leetcode"] : null));
  const [editorKey, setEditorKey] = useState(0); // remount the editor when content is replaced
  const autoTried = useRef(false);

  const run = (force: boolean) =>
    fetchDescription(problemId, force).then(
      (res) => {
        if (res.ok) {
          onChange(res.html);
          setEditorKey((k) => k + 1);
          setError(null);
        } else {
          setError(REASON[res.reason]);
        }
        setFetching(false);
      },
      () => {
        setError(REASON.network);
        setFetching(false);
      },
    );

  useEffect(() => {
    if (!fetching || autoTried.current) return;
    autoTried.current = true;
    run(false);
    // Runs once for the initial auto-fetch only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refetch = () => {
    if (html.trim() && !confirm("Replace this description with a fresh copy from LeetCode?")) return;
    setFetching(true);
    setEditing(false);
    run(true);
  };

  const empty = !html.trim();

  return (
    <div className="flex flex-col gap-3">
      {/* Actions */}
      {!fetching && (
        <div className="flex items-center justify-end gap-1">
          {leet && (
            <button
              type="button"
              onClick={refetch}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-mute hover:bg-white/5 hover:text-ink"
            >
              <RefreshCw className="size-3.5" /> {empty ? "Fetch from LeetCode" : "Refetch"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs",
              editing ? "bg-brand/15 text-brand-soft" : "text-mute hover:bg-white/5 hover:text-ink",
            )}
          >
            {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
            {editing ? "Done" : empty ? "Paste / write" : "Edit"}
          </button>
        </div>
      )}

      {fetching ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <div className="flex items-center gap-2 text-xs text-mute">
            <Loader2 className="size-3.5 animate-spin" /> Fetching the statement from LeetCode…
          </div>
          {[92, 100, 76, 88, 60].map((w, i) => (
            <div key={i} className="h-3.5 animate-pulse rounded bg-white/[0.05]" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : (
        <>
          {error && empty && !editing && (
            <p className="rounded-lg bg-white/[0.03] px-3 py-2.5 text-[13px] text-mute">{error}</p>
          )}
          {error && !empty && <p className="text-xs text-hard">{error}</p>}
          {(!empty || editing) && (
            <NotesEditor
              key={editorKey}
              initial={html}
              onChange={onChange}
              editable={editing}
              label="Description"
              placeholder="Paste the problem statement here…"
              className="desc-view"
            />
          )}
        </>
      )}
    </div>
  );
}
