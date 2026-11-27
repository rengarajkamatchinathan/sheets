"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useState, useTransition } from "react";
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
import type { Difficulty, Status } from "@/db/schema";
import type { BoardProblem } from "@/lib/queries";
import { Bar, DIFF_TEXT, inputCls } from "./kit";

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

/** Shared column layout for the header and pattern rows (matches the Topics list view). */
const COLS = "md:grid-cols-[2.75rem_minmax(0,1fr)_5rem_8.5rem_minmax(8rem,13rem)_3.5rem_2.5rem]";

const STATUS_FILTERS = ["All", "Todo", "Attempted", "Solved"] as const;
const DIFF_FILTERS = ["All", "Easy", "Medium", "Hard"] as const;

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
  const [menu, setMenu] = useState<string | null>(null); // "p:<id>" problem menu, "g:<key>" pattern menu
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

  // Close menus on outside click / Escape.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-menu]")) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

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

  const totalSolved = items.filter((p) => p.status === "Solved").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          <Chips label="Status" items={STATUS_FILTERS} value={statusF} onChange={setStatusF} />
          <Chips label="Difficulty" items={DIFF_FILTERS} value={diffF} onChange={setDiffF} />
          <button
            type="button"
            aria-pressed={starredOnly}
            onClick={() => setStarredOnly((v) => !v)}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 ${
              starredOnly ? "border-medium bg-[#2b2310] font-semibold text-medium" : "border-line2 text-mute hover:text-ink"
            }`}
          >
            <StarIcon filled={starredOnly} /> Starred
          </button>
        </div>
        <div className="flex items-center gap-2 text-[13px]">
          {pending && <span className="text-mute">Saving…</span>}
          <button
            type="button"
            onClick={() => setOpen(new Set(groups.map((g) => g.key)))}
            className="min-h-9 rounded-md px-2.5 text-mute hover:bg-chip hover:text-ink"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setOpen(new Set())}
            className="min-h-9 rounded-md px-2.5 text-mute hover:bg-chip hover:text-ink"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-panel">
        <div
          aria-hidden="true"
          className={`hidden gap-4 border-b border-line px-5 py-2.5 text-[11px] font-semibold tracking-wide text-mute uppercase md:grid ${COLS}`}
        >
          <span>#</span>
          <span>Pattern</span>
          <span>Problems</span>
          <span>Difficulty</span>
          <span>Progress</span>
          <span className="text-right">Solved</span>
          <span />
        </div>
        {groups.map((g, gi) => {
          const all = items.filter((p) => p.patternId === g.id);
          if (g.id == null && all.length === 0 && dragId == null) return null;
          const rows = all.filter(visible);
          const solved = all.filter((p) => p.status === "Solved").length;
          // While filtering, patterns with matches open automatically.
          const isOpen = open.has(g.key) || (filtering && rows.length > 0);
          const done = all.length > 0 && solved === all.length;
          const dropHere = drop?.key === g.key;
          const pct = all.length ? Math.round((solved / all.length) * 100) : 0;
          const count = (d: string) => all.filter((p) => p.difficulty === d).length;

          return (
            <section
              key={g.key}
              aria-label={g.name}
              className={`border-t border-line first-of-type:border-t-0 transition-colors last:rounded-b-2xl ${dropHere && dragId != null ? "bg-brand/[0.04]" : ""}`}
              onDragOver={(e) => {
                if (dragId == null) return;
                e.preventDefault();
                // Over the header or empty space (not a row): drop at the end of this pattern.
                const overRow = (e.target as HTMLElement).closest("[data-row]") != null;
                if (!overRow && (drop?.key !== g.key || drop.beforeId !== null)) setDrop({ key: g.key, beforeId: null });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId != null && drop) doMove(dragId, g.id, drop.key === g.key ? drop.beforeId : null);
                endDrag();
              }}
            >
              <header
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button, a, input, form, [data-menu]")) return;
                  toggleGroup(g.key);
                }}
                className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-1.5 py-2 pr-3 pl-5 hover:bg-[#1a2029] ${COLS} ${
                  isOpen ? "bg-[#181d24]" : ""
                }`}
              >
                <span className="hidden items-center gap-1.5 font-mono text-xs text-mute md:flex">
                  <Chevron open={isOpen} />
                  {g.id == null ? "—" : String(gi + 1).padStart(2, "0")}
                </span>
                {renaming?.id === g.id && g.id != null ? (
                  <form
                    className="flex min-w-0 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const { id, name } = renaming;
                      setRenaming(null);
                      run(null, () => renamePattern(id, name));
                    }}
                  >
                    <input
                      autoFocus
                      aria-label="Pattern name"
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: renaming.id, name: e.target.value })}
                      onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                      className={`${inputCls} min-h-9 max-w-sm`}
                    />
                    <button className="min-h-9 rounded-md bg-brand px-3 text-xs font-bold text-brand-ink">Save</button>
                    <button type="button" onClick={() => setRenaming(null)} className="min-h-9 px-2 text-xs text-mute hover:text-ink">
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggleGroup(g.key)}
                    className="flex min-h-10 min-w-0 items-center gap-2 text-left"
                  >
                    <span className="md:hidden">
                      <Chevron open={isOpen} />
                    </span>
                    <span className={`truncate text-[15px] font-medium ${g.id == null ? "text-mute italic" : ""}`}>{g.name}</span>
                    {done && <span className="flex-none rounded-full bg-[#12291a] px-2 py-0.5 text-[11px] font-semibold text-easy">Done</span>}
                  </button>
                )}
                <span className="hidden text-[13px] text-mute md:block">{all.length}</span>
                <span className="hidden gap-2.5 font-mono text-xs md:flex">
                  <span className="text-easy">E {count("Easy")}</span>
                  <span className="text-medium">M {count("Medium")}</span>
                  <span className="text-hard">H {count("Hard")}</span>
                </span>
                <span className="col-span-3 row-start-2 flex items-center gap-3 md:col-span-1 md:row-start-auto">
                  <span className="flex-1">
                    <Bar value={solved} max={all.length} />
                  </span>
                  <span className="w-9 text-right font-mono text-xs text-mute">{pct}%</span>
                </span>
                <span className="text-right font-mono text-[13px] text-soft">
                  {solved}/{all.length}
                </span>
                {g.id != null ? (
                  <div className="relative" data-menu>
                    <KebabButton label={`${g.name} options`} onClick={() => setMenu(menu === `g:${g.key}` ? null : `g:${g.key}`)} />
                    {menu === `g:${g.key}` && (
                      <Menu>
                        <MenuItem onClick={() => (setMenu(null), setRenaming({ id: g.id!, name: g.name }))}>Rename</MenuItem>
                        <MenuItem disabled={gi === 0} onClick={() => (setMenu(null), run(null, () => shiftPattern(g.id!, -1)))}>
                          Move up
                        </MenuItem>
                        <MenuItem
                          disabled={gi === patterns.length - 1}
                          onClick={() => (setMenu(null), run(null, () => shiftPattern(g.id!, 1)))}
                        >
                          Move down
                        </MenuItem>
                        <MenuItem
                          danger
                          onClick={() => {
                            setMenu(null);
                            if (confirm(`Delete pattern "${g.name}"? Its ${all.length} problems move to Unsorted.`))
                              run(null, () => deletePattern(g.id!));
                          }}
                        >
                          Delete pattern
                        </MenuItem>
                      </Menu>
                    )}
                  </div>
                ) : (
                  <span className="w-10" />
                )}
              </header>

              {isOpen && (
                <div className="border-t border-line/60 bg-[#12161c] pb-1 md:pl-12">
                  <ul>
                    {rows.length === 0 && (
                      <li className="px-5 py-3.5 text-[13px] text-mute">
                        {dragId != null ? "Drop here" : filtering && all.length ? "No problems match the filters." : "No problems yet — drag one here or use ⋮ → Move to."}
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
                          className={`group relative border-t border-line/50 first:border-t-0 ${dragId === p.id ? "opacity-40" : ""}`}
                        >
                          {showLine && <span className="absolute inset-x-2 -top-px z-10 h-0.5 rounded bg-brand" />}
                          <ProblemRow
                            p={p}
                            menuOpen={menu === `p:${p.id}`}
                            onMenu={() => setMenu(menu === `p:${p.id}` ? null : `p:${p.id}`)}
                            closeMenu={() => setMenu(null)}
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
                        <span className="absolute inset-x-2 -top-px h-0.5 rounded bg-brand" />
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {adding != null ? (
        <form
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-line2 p-3"
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
            placeholder="Pattern name, e.g. Monotonic stack"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(null)}
            className={`${inputCls} max-w-sm flex-1`}
          />
          <button className="min-h-11 rounded-lg bg-brand px-4 text-sm font-bold text-brand-ink">Add pattern</button>
          <button type="button" onClick={() => setAdding(null)} className="min-h-11 px-3 text-sm text-mute hover:text-ink">
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding("")}
          className="min-h-12 rounded-2xl border border-dashed border-line2 text-sm font-semibold text-mute hover:border-brand hover:text-brand-soft"
        >
          + Add pattern
        </button>
      )}

      <p className="text-xs text-mute">
        {totalSolved} of {items.length} solved · drag rows to reorder or move them between patterns
      </p>
    </div>
  );
}

function ProblemRow({
  p,
  menuOpen,
  onMenu,
  closeMenu,
  groups,
  onToggleSolved,
  onStatus,
  onStar,
  onMoveTo,
  onDelete,
}: {
  p: BoardProblem;
  menuOpen: boolean;
  onMenu: () => void;
  closeMenu: () => void;
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pr-2 pl-1 hover:bg-[#1f252e] sm:flex-nowrap">
      <span aria-hidden="true" className="hidden cursor-grab px-0.5 text-line2 group-hover:text-mute sm:block" title="Drag to move">
        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
          <circle cx="3" cy="3" r="1.4" /><circle cx="9" cy="3" r="1.4" /><circle cx="3" cy="8" r="1.4" />
          <circle cx="9" cy="8" r="1.4" /><circle cx="3" cy="13" r="1.4" /><circle cx="9" cy="13" r="1.4" />
        </svg>
      </span>
      <button
        type="button"
        role="checkbox"
        aria-checked={solved ? true : attempted ? "mixed" : false}
        aria-label={`Mark "${p.title}" ${solved ? "not solved" : "solved"}`}
        onClick={onToggleSolved}
        className="flex h-11 w-9 flex-none items-center justify-center"
      >
        <span
          className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border ${
            solved ? "border-easy bg-easy" : attempted ? "border-medium" : "border-[#4a5462] hover:border-mute"
          }`}
        >
          {solved && (
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0e1116" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
          {attempted && <span className="h-2 w-2 rounded-[2px] bg-medium" />}
        </span>
      </button>

      <Link
        href={`/problems/${p.id}`}
        draggable={false}
        className={`min-w-0 flex-1 truncate text-[15px] hover:text-brand-soft ${solved ? "text-mute" : "text-ink"}`}
      >
        {p.title}
      </Link>

      <div className="ml-auto flex flex-none items-center gap-0.5">
        <span className={`mr-2 w-14 text-right text-xs font-semibold ${DIFF_TEXT[p.difficulty as Difficulty]}`}>
          {p.difficulty === "Medium" ? "Med." : p.difficulty}
        </span>
        {p.url ? (
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer"
            draggable={false}
            aria-label="Open problem link"
            title="Open problem"
            className="flex h-10 w-10 items-center justify-center rounded-md text-soft hover:bg-chip hover:text-ink"
          >
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
          </a>
        ) : (
          <span className="w-10" />
        )}
        <IconLink href={`/problems/${p.id}`} lit={p.hasNotes} label={p.hasNotes ? "Notes written" : "No notes yet"}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" />
        </IconLink>
        <IconLink href={`/problems/${p.id}`} lit={p.hasCode} label={p.hasCode ? "Solution saved" : "No solution yet"}>
          <path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" />
        </IconLink>
        <button
          type="button"
          aria-pressed={p.starred}
          aria-label={p.starred ? "Unstar" : "Star"}
          title={p.starred ? "Starred" : "Star to revisit"}
          onClick={onStar}
          className={`flex h-10 w-10 items-center justify-center rounded-md hover:bg-chip ${p.starred ? "text-medium" : "text-[#4a5462] hover:text-mute"}`}
        >
          <StarIcon filled={p.starred} size={17} />
        </button>
        <div className="relative" data-menu>
          <KebabButton label={`${p.title} options`} onClick={onMenu} />
          {menuOpen && (
            <Menu>
              {p.status !== "Attempted" && <MenuItem onClick={() => (closeMenu(), onStatus("Attempted"))}>Mark attempted</MenuItem>}
              {p.status !== "Todo" && <MenuItem onClick={() => (closeMenu(), onStatus("Todo"))}>Mark as todo</MenuItem>}
              {p.status !== "Solved" && <MenuItem onClick={() => (closeMenu(), onStatus("Solved"))}>Mark solved</MenuItem>}
              <div className="my-1 border-t border-line" />
              <div className="px-3 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-mute uppercase">Move to</div>
              {groups
                .filter((g) => g.id !== p.patternId)
                .map((g) => (
                  <MenuItem key={g.key} onClick={() => (closeMenu(), onMoveTo(g.id))}>
                    <span className={g.id == null ? "italic" : ""}>{g.name}</span>
                  </MenuItem>
                ))}
              <div className="my-1 border-t border-line" />
              <MenuItem danger onClick={() => (closeMenu(), onDelete())}>
                Delete problem
              </MenuItem>
            </Menu>
          )}
        </div>
      </div>
    </div>
  );
}

function IconLink({ href, lit, label, children }: { href: string; lit: boolean; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      draggable={false}
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-md hover:bg-chip ${lit ? "text-brand-soft" : "text-[#4a5462] hover:text-mute"}`}
    >
      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </Link>
  );
}

function KebabButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-md text-mute hover:bg-chip hover:text-ink"
    >
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
      </svg>
    </button>
  );
}

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <div role="menu" className="absolute top-full right-0 z-30 mt-1 max-h-80 w-56 overflow-y-auto rounded-xl border border-line2 bg-[#1c222b] py-1 shadow-2xl">
      {children}
    </div>
  );
}

function MenuItem({
  onClick,
  danger,
  disabled,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`block min-h-10 w-full px-3 text-left text-sm disabled:opacity-40 ${
        danger ? "text-hard hover:bg-[#2c1416]" : "text-soft hover:bg-chip hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Chips<T extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="mr-1 text-mute">{label}</span>
      {items.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`inline-flex min-h-8 items-center rounded-full border px-3 ${
            value === v ? "border-brand bg-[#12302d] font-semibold text-brand-soft" : "border-line2 text-mute hover:text-ink"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-none text-mute transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function StarIcon({ filled, size = 14 }: { filled: boolean; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
    </svg>
  );
}
