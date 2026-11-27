"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Code2,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Plus,
  Star,
} from "lucide-react";
import {
  createPattern,
  deletePattern,
  deleteProblemById,
  moveProblem,
  renamePattern,
  setStarred,
  setStatus,
  shiftPattern,
} from "@/app/actions";
import type { Status } from "@/db/schema";
import type { BoardProblem } from "@/lib/queries";
import FilterMenu from "./FilterMenu";
import { Ring, StatusDots } from "./kit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type PatternRef = { id: number; name: string };
type Group = { key: string; id: number | null; name: string };

type Op =
  | { type: "status"; id: number; status: Status }
  | { type: "star"; id: number; starred: boolean }
  | { type: "move"; id: number; patternId: number | null; beforeId: number | null }
  | { type: "delete"; id: number };

function apply(items: BoardProblem[], op: Op): BoardProblem[] {
  switch (op.type) {
    case "status":
      return items.map((p) => (p.id === op.id ? { ...p, status: op.status } : p));
    case "star":
      return items.map((p) => (p.id === op.id ? { ...p, starred: op.starred } : p));
    case "delete":
      return items.filter((p) => p.id !== op.id);
    case "move": {
      const moving = items.find((p) => p.id === op.id);
      if (!moving) return items;
      const rest = items.filter((p) => p.id !== op.id);
      const moved = { ...moving, patternId: op.patternId };
      let at = op.beforeId == null ? -1 : rest.findIndex((p) => p.id === op.beforeId);
      if (at === -1) {
        // End of the target group = right after its last member (or at the very end).
        const lastIdx = rest.reduce((acc, p, i) => (p.patternId === op.patternId ? i : acc), -1);
        at = lastIdx === -1 ? rest.length : lastIdx + 1;
      }
      return [...rest.slice(0, at), moved, ...rest.slice(at)];
    }
  }
}

const STATUS_FILTERS = ["All", "Todo", "Attempted", "Solved"] as const;
const DIFF_FILTERS = ["All", "Easy", "Medium", "Hard"] as const;
const DIFF_COLOR = { Easy: "text-easy", Medium: "text-medium", Hard: "text-hard" } as const;

/** Hover-revealed controls stay visible while focused or while their menu is open. */
const reveal = "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100";

export default function TopicBoard({
  topicId,
  patterns,
  problems,
}: {
  topicId: number;
  patterns: PatternRef[];
  problems: BoardProblem[];
}) {
  const [items, addOp] = useOptimistic(problems, apply);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<Set<string>>(new Set()); // expanded patterns; all start collapsed
  const [statusF, setStatusF] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [diffF, setDiffF] = useState<(typeof DIFF_FILTERS)[number]>("All");
  const [starredOnly, setStarredOnly] = useState(false);
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ key: string; beforeId: number | null } | null>(null);

  const run = (op: Op | null, action: () => Promise<unknown>) =>
    start(async () => {
      if (op) addOp(op);
      await action();
    });

  const groups: Group[] = [
    ...patterns.map((p) => ({ key: String(p.id), id: p.id, name: p.name })),
    { key: "u", id: null, name: "Unsorted" },
  ];

  const filtering = statusF !== "All" || diffF !== "All" || starredOnly;
  const visible = (p: BoardProblem) =>
    (statusF === "All" || p.status === statusF) && (diffF === "All" || p.difficulty === diffF) && (!starredOnly || p.starred);

  const toggleGroup = (key: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const doMove = (id: number, patternId: number | null, beforeId: number | null) => {
    if (beforeId === id) return;
    const cur = items.find((p) => p.id === id);
    if (!cur) return;
    // Dropping right before the item that already follows it is a no-op.
    const sameGroup = items.filter((p) => p.patternId === patternId);
    const idx = sameGroup.findIndex((p) => p.id === id);
    if (cur.patternId === patternId && idx !== -1 && (sameGroup[idx + 1]?.id ?? null) === beforeId) return;
    run({ type: "move", id, patternId, beforeId }, () => moveProblem(id, patternId, beforeId));
  };

  const endDrag = () => {
    setDragId(null);
    setDrop(null);
  };

  const allOpen = groups.every((g) => open.has(g.key));

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 text-[13px]">
        <FilterMenu
          activeCount={(statusF !== "All" ? 1 : 0) + (diffF !== "All" ? 1 : 0) + (starredOnly ? 1 : 0)}
          sections={[
            { key: "status", title: "Status", options: STATUS_FILTERS.map((v) => ({ label: v, active: statusF === v })) },
            {
              key: "difficulty",
              title: "Difficulty",
              options: DIFF_FILTERS.map((v) => ({ label: v, active: diffF === v })),
            },
            {
              key: "starred",
              title: "Show",
              options: [
                { label: "Everything", value: "all", active: !starredOnly },
                { label: "★ Starred only", value: "starred", active: starredOnly },
              ],
            },
          ]}
          onSelect={(section, value) => {
            if (section === "status") setStatusF(value as (typeof STATUS_FILTERS)[number]);
            if (section === "difficulty") setDiffF(value as (typeof DIFF_FILTERS)[number]);
            if (section === "starred") setStarredOnly(value === "starred");
          }}
          onReset={() => {
            setStatusF("All");
            setDiffF("All");
            setStarredOnly(false);
          }}
        />
        <div className="ml-auto flex items-center gap-1 text-mute">
          {pending && <span className="mr-1 text-xs">Saving…</span>}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={allOpen ? "Collapse all" : "Expand all"}
                onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.key)))}
                className="flex size-7 items-center justify-center rounded-md hover:bg-white/5 hover:text-ink"
              >
                {allOpen ? <ChevronsDownUp className="size-4" /> : <ChevronsUpDown className="size-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{allOpen ? "Collapse all" : "Expand all"}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Patterns */}
      <div className="flex flex-col gap-2">
        {groups.map((g, gi) => {
          const all = items.filter((p) => p.patternId === g.id);
          if (g.id == null && all.length === 0 && dragId == null) return null;
          const rows = all.filter(visible);
          const solved = all.filter((p) => p.status === "Solved").length;
          // While filtering, patterns with matches open automatically.
          const isOpen = open.has(g.key) || (filtering && rows.length > 0);
          const done = all.length > 0 && solved === all.length;
          const dropHere = drop?.key === g.key;

          return (
            <section
              key={g.key}
              aria-label={g.name}
              className={cn(
                "rounded-xl bg-white/[0.02] ring-1 ring-transparent transition-colors",
                isOpen && "bg-white/[0.03]",
                dropHere && dragId != null && "ring-brand/40",
              )}
              onDragOver={(e) => {
                if (dragId == null) return;
                e.preventDefault();
                // Over the pattern row or empty space (not a problem row): drop at the end of this pattern.
                const overRow = (e.target as HTMLElement).closest("[data-row]") != null;
                if (!overRow && (drop?.key !== g.key || drop.beforeId !== null)) setDrop({ key: g.key, beforeId: null });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId != null && drop) doMove(dragId, g.id, drop.key === g.key ? drop.beforeId : null);
                endDrag();
              }}
            >
              <div className="group/row flex min-h-14 items-center gap-3 rounded-xl pr-2 pl-3.5 hover:bg-white/[0.025]">
                <Ring value={solved} max={all.length} size={30} stroke={3}>
                  {done && <Check className="size-3.5 text-easy" strokeWidth={3} />}
                </Ring>
                {renaming?.id === g.id && g.id != null ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const { id, name } = renaming;
                      setRenaming(null);
                      if (name.trim()) run(null, () => renamePattern(id, name));
                    }}
                  >
                    <input
                      autoFocus
                      aria-label="Pattern name"
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: renaming.id, name: e.target.value })}
                      onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                      onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                      className="h-8 w-full max-w-sm rounded-md bg-chip px-2 text-[15px] text-ink outline-none ring-1 ring-brand/40"
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggleGroup(g.key)}
                    className="flex min-h-14 min-w-0 flex-1 flex-col justify-center text-left"
                  >
                    <span className={cn("truncate text-[15px] font-medium", g.id == null ? "text-mute italic" : "text-ink")}>{g.name}</span>
                    <span className="text-xs text-mute">
                      {all.length === 0
                        ? "Empty"
                        : done
                          ? `All ${all.length} done`
                          : `${all.length - solved} to go${solved ? ` · ${solved} done` : ""}`}
                    </span>
                  </button>
                )}
                <span className="hidden sm:block">
                  <StatusDots statuses={all.map((p) => p.status)} />
                </span>
                {g.id != null ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`${g.name} options`}
                      className={cn("flex size-7 items-center justify-center rounded-md text-mute hover:bg-white/5 hover:text-ink", reveal)}
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => setRenaming({ id: g.id!, name: g.name })}>Rename</DropdownMenuItem>
                      <DropdownMenuItem disabled={gi === 0} onSelect={() => run(null, () => shiftPattern(g.id!, -1))}>
                        Move up
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={gi === patterns.length - 1} onSelect={() => run(null, () => shiftPattern(g.id!, 1))}>
                        Move down
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => {
                          if (confirm(`Delete pattern "${g.name}"? Its ${all.length} problems move to Unsorted.`))
                            run(null, () => deletePattern(g.id!));
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="w-7" />
                )}
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={() => toggleGroup(g.key)}
                  className="flex size-7 items-center justify-center text-[#5b6675] hover:text-ink"
                >
                  <ChevronRight className={cn("size-4 transition-transform", isOpen && "rotate-90")} />
                </button>
              </div>

              {isOpen && (
                <ul className="border-t border-line/50 py-1">
                  {rows.length === 0 && (
                    <li className="py-2.5 pl-14 text-[13px] text-[#5b6675]">
                      {dragId != null ? "Drop here" : filtering && all.length ? "No matches" : "Empty — drag a problem here"}
                    </li>
                  )}
                  {rows.map((p, i) => {
                    const nextId = rows[i + 1]?.id ?? null;
                    const showLine = dragId != null && dropHere && drop?.beforeId === p.id && dragId !== p.id;
                    return (
                      <li
                        key={p.id}
                        data-row
                        draggable
                        onDragStart={(e) => {
                          setDragId(p.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(p.id));
                        }}
                        onDragEnd={endDrag}
                        onDragOver={(e) => {
                          if (dragId == null) return;
                          e.preventDefault();
                          const r = e.currentTarget.getBoundingClientRect();
                          const before = e.clientY < r.top + r.height / 2 ? p.id : nextId;
                          if (drop?.key !== g.key || drop.beforeId !== before) setDrop({ key: g.key, beforeId: before });
                        }}
                        className={cn("relative", dragId === p.id && "opacity-40")}
                      >
                        {showLine && <span className="absolute inset-x-12 -top-px z-10 h-0.5 rounded bg-brand" />}
                        <ProblemRow
                          p={p}
                          groups={groups}
                          onToggleSolved={() => {
                            const status: Status = p.status === "Solved" ? "Todo" : "Solved";
                            run({ type: "status", id: p.id, status }, () => setStatus(p.id, status));
                          }}
                          onStatus={(status) => run({ type: "status", id: p.id, status }, () => setStatus(p.id, status))}
                          onStar={() => run({ type: "star", id: p.id, starred: !p.starred }, () => setStarred(p.id, !p.starred))}
                          onMoveTo={(pid) => doMove(p.id, pid, null)}
                          onDelete={() => {
                            if (confirm(`Delete "${p.title}"? Its notes and code are deleted too.`))
                              run({ type: "delete", id: p.id }, () => deleteProblemById(p.id));
                          }}
                        />
                      </li>
                    );
                  })}
                  {dragId != null && dropHere && drop?.beforeId == null && rows.length > 0 && (
                    <li aria-hidden="true" className="relative h-0">
                      <span className="absolute inset-x-12 -top-px h-0.5 rounded bg-brand" />
                    </li>
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {/* Add pattern */}
      {adding != null ? (
        <form
          className="flex items-center gap-2 pl-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            const name = adding.trim();
            setAdding(null);
            if (name) run(null, () => createPattern(topicId, name));
          }}
        >
          <input
            autoFocus
            aria-label="New pattern name"
            placeholder="Pattern name"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onBlur={(e) => (e.currentTarget.value.trim() ? e.currentTarget.form?.requestSubmit() : setAdding(null))}
            onKeyDown={(e) => e.key === "Escape" && setAdding(null)}
            className="h-8 w-full max-w-sm rounded-md bg-chip px-2 text-sm text-ink outline-none ring-1 ring-brand/40 placeholder:text-mute"
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding("")}
          className="flex h-9 w-fit items-center gap-2 rounded-md pr-2 pl-1.5 text-[13px] text-mute hover:bg-white/[0.025] hover:text-ink"
        >
          <Plus className="size-4" /> Add pattern
        </button>
      )}
    </div>
  );
}

function ProblemRow({
  p,
  groups,
  onToggleSolved,
  onStatus,
  onStar,
  onMoveTo,
  onDelete,
}: {
  p: BoardProblem;
  groups: Group[];
  onToggleSolved: () => void;
  onStatus: (s: Status) => void;
  onStar: () => void;
  onMoveTo: (patternId: number | null) => void;
  onDelete: () => void;
}) {
  const solved = p.status === "Solved";
  const attempted = p.status === "Attempted";
  return (
    <div className="group/row flex h-10 items-center gap-2.5 rounded-lg pr-2 pl-[2.6rem] hover:bg-white/[0.03]">
      <button
        type="button"
        role="checkbox"
        aria-checked={solved ? true : attempted ? "mixed" : false}
        aria-label={`Mark "${p.title}" ${solved ? "not solved" : "solved"}`}
        onClick={onToggleSolved}
        className="flex size-7 flex-none items-center justify-center"
      >
        <span
          className={cn(
            "flex size-4 items-center justify-center rounded-[4px] border transition-colors",
            solved ? "border-easy bg-easy" : attempted ? "border-medium" : "border-[#4a5462] hover:border-mute",
          )}
        >
          {solved && <Check className="size-3 text-bg" strokeWidth={3.5} />}
          {attempted && <span className="size-1.5 rounded-[1px] bg-medium" />}
        </span>
      </button>

      <Link
        href={`/problems/${p.id}`}
        draggable={false}
        className={cn("min-w-0 flex-1 truncate text-sm hover:text-ink", solved ? "text-mute" : "text-soft")}
      >
        {p.title}
      </Link>

      {/* Quiet indicators: only shown when there is something */}
      <span className="flex flex-none items-center gap-1.5 text-[#5b6675]">
        {p.hasNotes && <FileText aria-label="Has notes" className="size-3.5" />}
        {p.hasCode && <Code2 aria-label="Has code" className="size-3.5" />}
        {p.hasDescription && <BookOpen aria-label="Has description" className="size-3.5" />}
      </span>

      <span className={cn("w-12 flex-none text-right text-xs", DIFF_COLOR[p.difficulty])}>
        {p.difficulty === "Medium" ? "Med" : p.difficulty}
      </span>

      <div className="flex flex-none items-center">
        {p.url ? (
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer"
            draggable={false}
            aria-label="Open problem link"
            className={cn("flex size-7 items-center justify-center rounded-md text-mute hover:bg-white/5 hover:text-ink", reveal)}
          >
            <ExternalLink className="size-3.5" />
          </a>
        ) : (
          <span className="w-7" />
        )}
        <button
          type="button"
          aria-pressed={p.starred}
          aria-label={p.starred ? "Unstar" : "Star"}
          onClick={onStar}
          className={cn(
            "flex size-7 items-center justify-center rounded-md hover:bg-white/5",
            p.starred ? "text-medium" : cn("text-mute hover:text-ink", reveal),
          )}
        >
          <Star className="size-3.5" fill={p.starred ? "currentColor" : "none"} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`${p.title} options`}
            className={cn("flex size-7 items-center justify-center rounded-md text-mute hover:bg-white/5 hover:text-ink", reveal)}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {p.status !== "Solved" && <DropdownMenuItem onSelect={() => onStatus("Solved")}>Mark solved</DropdownMenuItem>}
            {p.status !== "Attempted" && <DropdownMenuItem onSelect={() => onStatus("Attempted")}>Mark attempted</DropdownMenuItem>}
            {p.status !== "Todo" && <DropdownMenuItem onSelect={() => onStatus("Todo")}>Mark as todo</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 w-52 overflow-y-auto">
                {groups
                  .filter((g) => g.id !== p.patternId)
                  .map((g) => (
                    <DropdownMenuItem key={g.key} onSelect={() => onMoveTo(g.id)} className={g.id == null ? "italic" : ""}>
                      {g.name}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

