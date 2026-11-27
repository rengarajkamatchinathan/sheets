"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  CodeXml,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  NotebookPen,
  Star,
  Trash2,
} from "lucide-react";
import type { GroupImperativeHandle } from "react-resizable-panels";
import { DEFAULT_SPLIT, saveSplit, type Split } from "@/lib/split";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useMediaQuery, useStoredState } from "@/lib/hooks";
import DescriptionPanel from "./DescriptionPanel";
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
  split,
}: {
  id: number;
  topicSlug: string;
  patterns: { id: number; name: string }[];
  initial: ProblemUpdate;
  initialTabs: Tab[];
  /** Saved Notes/Code split (read from a cookie on the server). */
  split: Split;
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
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* One compact row: title · properties · actions (LeetCode-style, so the panels get the height). */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <label htmlFor="title" className="sr-only">
          Title
        </label>
        <input
          id="title"
          value={fields.title}
          onChange={(e) => set("title", e.target.value)}
          spellCheck={false}
          className="-mx-1.5 max-w-[48ch] min-w-[8ch] rounded-md bg-transparent px-1.5 py-0.5 text-lg font-semibold tracking-tight text-ink [field-sizing:content] hover:bg-white/[0.03] focus:bg-white/[0.03] focus:outline-none"
        />
        <section aria-label="Properties" className="min-w-0">
          <Properties v={props} set={(k, v) => set(k, v as never)} patterns={patterns} />
        </section>
        <div className="ml-auto flex items-center gap-1">
          <SaveState saving={saving} dirty={dirty} error={error} onRetry={() => (setError(false), flush())} />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={fields.starred}
                aria-label={fields.starred ? "Unstar" : "Star"}
                onClick={() => set("starred", !fields.starred)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg hover:bg-white/5",
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
              className="flex size-8 items-center justify-center rounded-lg text-mute hover:bg-white/5 hover:text-ink"
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

      <Workspace
        problemId={id}
        split={split}
        notes={
          <div className="flex flex-col gap-2">
            {!hasRealNotes(fields.notes) && (
              <p className="text-xs text-[#5b6675]">Select text to format · # heading · - list · ``` code</p>
            )}
            {/* `fields.notes` (not the initial prop) so switching tabs never loses edits */}
            <NotesEditor initial={fields.notes} onChange={(html) => set("notes", html)} />
          </div>
        }
        description={
          <DescriptionPanel
            problemId={id}
            url={fields.url}
            html={fields.description}
            onChange={(html) => set("description", html)}
          />
        }
        code={(extra) => <CodeTabs tabs={tabs} onChange={setTabs} extra={extra} />}
      />
    </div>
  );
}

type LeftTab = "notes" | "description";
const LEFT_TABS: { id: LeftTab; label: string; Icon: typeof NotebookPen }[] = [
  { id: "notes", label: "Notes", Icon: NotebookPen },
  { id: "description", label: "Description", Icon: FileText },
];
/**
 * LeetCode-style workspace. Desktop: resizable left (Notes | Description) and right
 * (Code) panels; the split is remembered (cookie, so the server renders it too),
 * double-click the handle to reset, ⤢ to maximise a panel.
 * Small screens: one tab bar, one panel at a time.
 */
function Workspace({
  problemId,
  split,
  notes,
  description,
  code,
}: {
  problemId: number;
  split: Split;
  notes: React.ReactNode;
  description: React.ReactNode;
  code: (extra: React.ReactNode) => React.ReactNode;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [leftTab, setLeftTab] = useStoredState<LeftTab>(`dsa-left-tab-${problemId}`, "notes");
  const [mobileTab, setMobileTab] = useState<LeftTab | "code">("notes");
  const [maxed, setMaxed] = useState<"left" | "right" | null>(null);
  const groupRef = useRef<GroupImperativeHandle | null>(null);

  const panel = "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-[#0f1318]";

  if (!desktop) {
    const tabs = [...LEFT_TABS, { id: "code" as const, label: "Code", Icon: CodeXml }];
    return (
      <div className="flex flex-col gap-3">
        <PanelTabs tabs={tabs} value={mobileTab} onChange={setMobileTab} className="rounded-xl border border-line" />
        {mobileTab === "code" ? (
          <div className="h-[70vh]">{code(null)}</div>
        ) : (
          <div className="rounded-xl border border-line bg-[#0f1318] px-4 py-4">{mobileTab === "notes" ? notes : description}</div>
        )}
      </div>
    );
  }

  const maxBtn = (side: "left" | "right") => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={maxed === side ? "Restore layout" : "Maximise panel"}
          onClick={() => setMaxed(maxed === side ? null : side)}
          className="flex size-7 items-center justify-center rounded-md text-mute hover:bg-white/5 hover:text-ink"
        >
          {maxed === side ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{maxed === side ? "Restore" : "Maximise"}</TooltipContent>
    </Tooltip>
  );

  const left = (
    <section aria-label={leftTab === "notes" ? "Notes" : "Description"} className={panel}>
      <div className="flex items-center border-b border-line bg-panel pr-1.5">
        <PanelTabs tabs={LEFT_TABS} value={leftTab} onChange={setLeftTab} className="flex-1" />
        {maxBtn("left")}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{leftTab === "notes" ? notes : description}</div>
    </section>
  );
  const right = <div className="h-full min-h-0">{code(maxBtn("right"))}</div>;

  return (
    <div className="min-h-[420px] flex-1">
      {maxed ? (
        maxed === "left" ? left : right
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          id="dsa-problem-split"
          groupRef={groupRef}
          defaultLayout={split}
          onLayoutChanged={(layout) => saveSplit({ left: layout.left, right: layout.right })}
        >
          <ResizablePanel id="left" minSize="25" defaultSize={String(split.left)}>
            {left}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            onDoubleClick={() => {
              groupRef.current?.setLayout(DEFAULT_SPLIT);
              saveSplit(DEFAULT_SPLIT);
            }}
            title="Drag to resize · double-click to reset"
            className="mx-1 w-1.5 rounded-full bg-transparent transition-colors hover:bg-brand/30 data-[separator=active]:bg-brand/50 [&>div]:h-8 [&>div]:bg-line2"
          />
          <ResizablePanel id="right" minSize="30" defaultSize={String(split.right)}>
            {right}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}

/** LeetCode-like panel tab bar: icon + label, active tab underlined. */
function PanelTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: string; Icon: typeof NotebookPen }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex h-10 items-stretch bg-panel px-1.5", className)}>
      {tabs.map(({ id, label, Icon }) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(id)}
            className={cn(
              "relative flex items-center gap-1.5 px-3 text-[13px] transition-colors",
              on ? "font-medium text-ink" : "text-mute hover:text-ink",
            )}
          >
            <Icon className={cn("size-3.5", on && "text-brand-soft")} />
            {label}
            {on && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" />}
          </button>
        );
      })}
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
