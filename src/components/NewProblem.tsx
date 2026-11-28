"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, Check, Crown, Link2, Loader2, Plus, Search, X } from "lucide-react";
import { createProblem, lookupProblemLink, type LinkLookup } from "@/app/actions";
import type { Difficulty } from "@/db/schema";
import type { TopicChoice } from "@/lib/queries";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());
const isLeetCode = (s: string) => /^https?:\/\/(?:www\.)?leetcode\.(?:com|cn)\/problems\/[a-z0-9-]+/i.test(s.trim());

const DIFF_STYLE: Record<Difficulty, string> = {
  Easy: "data-[on=true]:bg-easy/15 data-[on=true]:text-easy data-[on=true]:ring-easy/40",
  Medium: "data-[on=true]:bg-medium/15 data-[on=true]:text-medium data-[on=true]:ring-medium/40",
  Hard: "data-[on=true]:bg-hard/15 data-[on=true]:text-hard data-[on=true]:ring-hard/40",
};

type Lookup = { state: "idle" } | { state: "loading" } | { state: "done"; result: LinkLookup };

/**
 * Link-first problem creator. Paste a LeetCode link and it fills in number, title and
 * difficulty (and warns about duplicates); or just type a title. Pattern and difficulty
 * are one-click chips. "Add & open" or "Add another" (keeps the dialog open).
 */
export function ProblemCreator({
  topics,
  fixedTopicId,
  defaultTopicId,
  onOpened,
}: {
  topics: TopicChoice[];
  /** Inside a topic page: the topic is fixed and its picker hidden. */
  fixedTopicId?: number;
  defaultTopicId?: number;
  /** Called right before navigating to the new problem (e.g. to close the dialog). */
  onOpened?: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [extraLink, setExtraLink] = useState<string | null>(null); // optional link when typing a title
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [topicId, setTopicId] = useState<number | null>(fixedTopicId ?? defaultTopicId ?? null);
  const [patternId, setPatternId] = useState<number | null>(null);
  const [newPattern, setNewPattern] = useState<string | null>(null);
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  const linkMode = isUrl(query);
  const topic = topics.find((t) => t.id === topicId) ?? null;
  const meta = lookup.state === "done" && lookup.result.ok ? lookup.result : null;
  const url = linkMode ? query.trim() : (extraLink ?? "").trim();
  const finalTitle = (linkMode ? title : query).trim();
  const canSubmit = !!topicId && !!finalTitle && !pending && lookup.state !== "loading";

  // Look up LeetCode links as they're pasted/typed (debounced, latest request wins).
  useEffect(() => {
    if (!isLeetCode(query)) return;
    const id = ++seq.current;
    const t = setTimeout(() => {
      setLookup({ state: "loading" });
      lookupProblemLink(query.trim()).then(
        (result) => {
          if (id !== seq.current) return;
          setLookup({ state: "done", result });
          if (result.ok) {
            setTitle(result.title);
            setDifficulty(result.difficulty);
          }
        },
        () => id === seq.current && setLookup({ state: "done", result: { ok: false, reason: "network" } }),
      );
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const reset = () => {
    setQuery("");
    setTitle("");
    setExtraLink(null);
    setLookup({ state: "idle" });
    setNewPattern(null);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const submit = (mode: "open" | "another") => {
    if (!canSubmit || !topicId) return;
    setError(null);
    start(async () => {
      try {
        const { id } = await createProblem({
          topicId,
          title: finalTitle,
          url,
          difficulty,
          lcNumber: meta?.number ?? null,
          patternId: newPattern ? null : patternId,
          newPatternName: newPattern?.trim() || undefined,
        });
        if (mode === "open") {
          onOpened?.();
          router.push(`/problems/${id}`);
        } else {
          setAdded(finalTitle);
          if (newPattern?.trim()) setPatternId(null); // the new pattern now exists; start fresh
          reset();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn’t add the problem");
      }
    });
  };

  return (
    <form
      className="flex flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        submit("open");
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        if (e.shiftKey) {
          e.preventDefault();
          submit("another");
        } else if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          submit("open");
        }
      }}
    >
      {/* Smart input: link or title */}
      <div className="relative">
        {linkMode ? (
          <Link2 aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-brand-soft" />
        ) : (
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-mute" />
        )}
        <input
          ref={inputRef}
          autoFocus
          aria-label="LeetCode link or problem title"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAdded(null);
            if (!isLeetCode(e.target.value)) setLookup({ state: "idle" });
          }}
          placeholder="Paste a LeetCode link, or type a title"
          spellCheck={false}
          className="h-12 w-full rounded-xl bg-white/[0.04] pr-10 pl-11 text-[15px] text-ink placeholder:text-mute focus:bg-white/[0.06] focus:ring-2 focus:ring-brand/40 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear"
            onClick={reset}
            className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-mute hover:bg-white/5 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Link preview / lookup state */}
      {linkMode && (
        <div className="mt-3">
          {!isLeetCode(query) ? (
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Problem title"
                className="h-10 w-full rounded-lg bg-white/[0.04] px-3 text-sm text-ink placeholder:text-mute focus:ring-2 focus:ring-brand/40 focus:outline-none"
              />
            </Field>
          ) : lookup.state === "loading" || lookup.state === "idle" ? (
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3.5 text-sm text-mute">
              <Loader2 className="size-4 animate-spin" /> Looking up the problem on LeetCode…
            </div>
          ) : meta ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 rounded-xl bg-brand/[0.06] p-3.5 ring-1 ring-brand/15">
                <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-brand/15 font-mono text-xs font-semibold text-brand-soft">
                  {meta.number ?? "LC"}
                </span>
                <div className="min-w-0 flex-1">
                  <input
                    aria-label="Title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="-mx-1 w-full rounded-md bg-transparent px-1 text-[15px] font-medium text-ink hover:bg-white/[0.04] focus:bg-white/[0.06] focus:outline-none"
                  />
                  <div className="flex items-center gap-2 text-xs text-mute">
                    Found on LeetCode
                    {meta.premium && (
                      <span className="inline-flex items-center gap-1 text-medium">
                        <Crown className="size-3" /> Premium
                      </span>
                    )}
                  </div>
                </div>
                <Check className="size-4 flex-none text-easy" />
              </div>
              {meta.existing && (
                <div className="flex items-center gap-2.5 rounded-xl bg-medium/[0.08] px-3.5 py-2.5 text-[13px] text-medium">
                  <AlertTriangle className="size-4 flex-none" />
                  <span className="min-w-0 flex-1">
                    Already in your sheet as <b className="font-medium">{meta.existing.title}</b> ({meta.existing.topicName})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onOpened?.();
                      router.push(`/problems/${meta.existing!.id}`);
                    }}
                    className="flex flex-none items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-medium/10"
                  >
                    Open <ArrowRight className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="rounded-xl bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-mute">
                {lookup.state === "done" && !lookup.result.ok && lookup.result.reason === "not-found"
                  ? "LeetCode doesn’t know this link — check it, or enter the title yourself."
                  : "Couldn’t reach LeetCode right now — enter the title yourself."}
              </p>
              <Field label="Title">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Problem title"
                  className="h-10 w-full rounded-lg bg-white/[0.04] px-3 text-sm text-ink placeholder:text-mute focus:ring-2 focus:ring-brand/40 focus:outline-none"
                />
              </Field>
            </div>
          )}
        </div>
      )}

      {/* Optional link when creating from a title */}
      {!linkMode && query.trim() && (
        <div className="mt-2">
          {extraLink == null ? (
            <button
              type="button"
              onClick={() => setExtraLink("")}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs text-mute hover:bg-white/5 hover:text-ink"
            >
              <Plus className="size-3.5" /> Add link
            </button>
          ) : (
            <input
              autoFocus
              aria-label="Problem link"
              value={extraLink}
              onChange={(e) => setExtraLink(e.target.value)}
              placeholder="https://…"
              className="h-9 w-full rounded-lg bg-white/[0.04] px-3 text-sm text-ink placeholder:text-mute focus:ring-2 focus:ring-brand/40 focus:outline-none"
            />
          )}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-4">
        {/* Topic */}
        {fixedTopicId == null && (
          <Field label="Topic">
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <Chip
                  key={t.id}
                  on={t.id === topicId}
                  onClick={() => {
                    setTopicId(t.id);
                    setPatternId(null);
                    setNewPattern(null);
                  }}
                >
                  {t.name}
                </Chip>
              ))}
            </div>
          </Field>
        )}

        {/* Pattern */}
        {topic && (
          <Field label="Pattern">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip on={patternId == null && newPattern == null} onClick={() => (setPatternId(null), setNewPattern(null))} muted>
                Unsorted
              </Chip>
              {topic.patterns.map((p) => (
                <Chip key={p.id} on={patternId === p.id && newPattern == null} onClick={() => (setPatternId(p.id), setNewPattern(null))}>
                  {p.name}
                </Chip>
              ))}
              {newPattern == null ? (
                <button
                  type="button"
                  onClick={() => setNewPattern("")}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-line2 px-2.5 text-[13px] text-mute hover:border-mute hover:text-ink"
                >
                  <Plus className="size-3.5" /> New pattern
                </button>
              ) : (
                <input
                  autoFocus
                  aria-label="New pattern name"
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setNewPattern(null))}
                  placeholder="New pattern name"
                  className="h-8 w-48 rounded-full bg-brand/10 px-3 text-[13px] text-brand-soft ring-1 ring-brand/40 placeholder:text-brand-soft/50 focus:outline-none"
                />
              )}
            </div>
          </Field>
        )}

        {/* Difficulty */}
        <Field label="Difficulty">
          <div role="radiogroup" aria-label="Difficulty" className="inline-flex gap-1.5">
            {(["Easy", "Medium", "Hard"] as Difficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={difficulty === d}
                data-on={difficulty === d}
                onClick={() => setDifficulty(d)}
                className={cn(
                  "h-8 rounded-full px-3.5 text-[13px] text-mute ring-1 ring-line2 transition-colors hover:text-ink",
                  DIFF_STYLE[d],
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {error && <p className="mt-4 text-[13px] text-hard">{error}</p>}

      {/* Footer */}
      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <span className="mr-auto text-xs text-[#5b6675]">
          {added ? (
            <span className="inline-flex items-center gap-1.5 text-easy">
              <Check className="size-3.5" /> Added “{added}”
            </span>
          ) : (
            <>
              <kbd className="font-sans">Ctrl+Enter</kbd> add &amp; open · <kbd className="font-sans">Shift+Enter</kbd> add another
            </>
          )}
        </span>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => submit("another")}
          className="h-9 rounded-lg px-3 text-sm text-soft hover:bg-white/5 hover:text-ink disabled:opacity-40"
        >
          Add another
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-ink hover:bg-brand-soft disabled:opacity-40"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Add &amp; open
        </button>
      </div>
    </form>
  );
}

/** Trigger button + dialog wrapping the creator. */
export function NewProblemDialog({
  topics,
  fixedTopicId,
  defaultTopicId,
  label = "Problem",
  className,
}: {
  topics: TopicChoice[];
  fixedTopicId?: number;
  defaultTopicId?: number;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const topicName = fixedTopicId != null ? topics.find((t) => t.id === fixedTopicId)?.name : undefined;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-mute hover:bg-white/5 hover:text-ink",
          className,
        )}
      >
        <Plus className="size-4" /> {label}
      </DialogTrigger>
      <DialogContent className="gap-0 border-line2 bg-[#161b22] p-5 sm:max-w-lg">
        <DialogTitle className="text-base font-semibold">New problem{topicName ? ` in ${topicName}` : ""}</DialogTitle>
        <DialogDescription className="mt-1 mb-4 text-[13px] text-mute">
          Paste a LeetCode link to fill in the details automatically.
        </DialogDescription>
        {open && (
          <ProblemCreator
            topics={topics}
            fixedTopicId={fixedTopicId}
            defaultTopicId={defaultTopicId}
            onOpened={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold tracking-wide text-mute uppercase">{label}</div>
      {children}
    </div>
  );
}

function Chip({ on, muted, onClick, children }: { on: boolean; muted?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-8 rounded-full px-3 text-[13px] transition-colors",
        on
          ? "bg-brand/15 text-brand-soft ring-1 ring-brand/40"
          : cn("bg-white/[0.04] hover:bg-white/[0.08] hover:text-ink", muted ? "text-mute italic" : "text-soft"),
      )}
    >
      {children}
    </button>
  );
}
