"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertCircle, Check, ExternalLink, Loader2, MoreHorizontal, Star, Trash2 } from "lucide-react";
import { deleteProblem, updateProblem, type ProblemUpdate } from "@/app/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { hasRealNotes } from "@/lib/template";
import { cn } from "@/lib/utils";
import CodeTabs, { type Tab } from "./CodeTabs";
import NotesEditor from "./NotesEditor";
import Properties, { type PropValues } from "./Properties";

const AUTOSAVE_MS = 800;

export default function ProblemView({
  id,
  topicSlug,
  patterns,
  initial,
  initialTabs,
}: {
  id: number;
  topicSlug: string;
  patterns: { id: number; name: string }[];
  initial: ProblemUpdate;
  initialTabs: Tab[];
}) {
  const [fields, setFields] = useState<ProblemUpdate>(initial);
  const [tabs, setTabs] = useState<Tab[]>(initialTabs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [, startDelete] = useTransition();

  // Everything that should trigger a save (tab DB ids excluded: they change as a result of saving).
  const snap = useMemo(
    () => JSON.stringify({ fields, tabs: tabs.map((t) => ({ ...t, id: undefined })) }),
    [fields, tabs],
  );
  const [savedSnap, setSavedSnap] = useState(snap);
  const dirty = snap !== savedSnap;

  const latest = useRef({ fields, tabs, snap });
  useEffect(() => {
    latest.current = { fields, tabs, snap };
  });
  const inFlight = useRef(false);
  const knownIds = useRef<Record<string, number>>({});

  const flush = useCallback(async () => {
    if (inFlight.current) return; // re-scheduled when the current save finishes
    const { fields: f, tabs: t, snap: s } = latest.current;
    inFlight.current = true;
    setSaving(true);
    try {
      const res = await updateProblem(
        id,
        f,
        t.map((x) => ({ ...x, id: knownIds.current[x.key] ?? x.id })),
      );
      Object.assign(knownIds.current, res.ids);
      setTabs((prev) => prev.map((x) => (res.ids[x.key] != null && x.id !== res.ids[x.key] ? { ...x, id: res.ids[x.key] } : x)));
      setSavedSnap(s);
      setError(false);
    } catch {
      setError(true);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, [id]);

  // Debounced autosave.
  useEffect(() => {
    if (!dirty || error) return;
    const t = setTimeout(flush, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [snap, savedSnap, dirty, error, flush]);

  // Ctrl/Cmd+S saves immediately; warn before leaving with unsaved work.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setError(false);
        flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush]);

  useEffect(() => {
    if (!dirty && !saving) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty, saving]);

  const set = <K extends keyof ProblemUpdate>(k: K, v: ProblemUpdate[K]) => setFields((s) => ({ ...s, [k]: v }));
  const props: PropValues = fields;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start gap-3">
        <label htmlFor="title" className="sr-only">
          Title
        </label>
        <input
          id="title"
          value={fields.title}
          onChange={(e) => set("title", e.target.value)}
          spellCheck={false}
          className="-mx-2 min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-[28px] font-bold tracking-tight text-ink hover:bg-white/[0.03] focus:bg-white/[0.03] focus:outline-none"
        />
        <div className="flex items-center gap-1.5 pt-1.5">
          <SaveState saving={saving} dirty={dirty} error={error} onRetry={() => (setError(false), flush())} />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={fields.starred}
                aria-label={fields.starred ? "Unstar" : "Star"}
                onClick={() => set("starred", !fields.starred)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg hover:bg-white/5",
                  fields.starred ? "text-medium" : "text-mute hover:text-ink",
                )}
              >
                <Star className="size-[18px]" fill={fields.starred ? "currentColor" : "none"} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{fields.starred ? "Starred" : "Star to revisit"}</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More actions"
              className="flex size-9 items-center justify-center rounded-lg text-mute hover:bg-white/5 hover:text-ink"
            >
              <MoreHorizontal className="size-[18px]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {fields.url && (
                <DropdownMenuItem asChild>
                  <a href={fields.url} target="_blank" rel="noreferrer">
                    <ExternalLink /> Open problem
                  </a>
                </DropdownMenuItem>
              )}
              {fields.url && <DropdownMenuSeparator />}
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  if (!confirm(`Delete "${fields.title}"? Notes and code are deleted too.`)) return;
                  const fd = new FormData();
                  fd.set("id", String(id));
                  fd.set("slug", topicSlug);
                  startDelete(() => deleteProblem(fd));
                }}
              >
                <Trash2 /> Delete problem
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <section aria-label="Properties" className="-mt-5">
        <Properties v={props} set={(k, v) => set(k, v as never)} patterns={patterns} />
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label="Notes" className="min-w-0">
          <SectionTitle hint={hasRealNotes(fields.notes) ? null : "Select text to format · # heading · - list"}>Notes</SectionTitle>
          <div className="rounded-xl px-1 py-2">
            <NotesEditor initial={initial.notes} onChange={(html) => set("notes", html)} />
          </div>
        </section>

        <section aria-label="Code" className="min-w-0 xl:sticky xl:top-6">
          <SectionTitle
            hint={tabs.some((t) => t.code.trim()) ? null : "+ new snippet · double-click a tab to rename · Shift+Alt+F to format"}
          >
            Code
          </SectionTitle>
          <div className="h-[620px]">
            <CodeTabs tabs={tabs} onChange={setTabs} />
          </div>
        </section>
      </div>
    </div>
  );
}

/** Section heading; the usage hint is only shown until the section has content. */
function SectionTitle({ hint, children }: { hint: string | null; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="text-[13px] font-semibold tracking-wide text-mute uppercase">{children}</h2>
      {hint && <span className="hidden text-xs text-[#5b6675] sm:inline">{hint}</span>}
    </div>
  );
}

function SaveState({ saving, dirty, error, onRetry }: { saving: boolean; dirty: boolean; error: boolean; onRetry: () => void }) {
  if (error)
    return (
      <button type="button" onClick={onRetry} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-hard hover:bg-white/5">
        <AlertCircle className="size-3.5" /> Not saved — retry
      </button>
    );
  return (
    <span aria-live="polite" className="flex h-8 items-center gap-1.5 px-2 text-xs text-mute">
      {saving ? (
        <>
          <Loader2 className="size-3.5 animate-spin" /> Saving…
        </>
      ) : dirty ? (
        "Editing…"
      ) : (
        <>
          <Check className="size-3.5 text-easy" /> Saved
        </>
      )}
    </span>
  );
}
