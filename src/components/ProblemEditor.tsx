"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import hljs from "highlight.js/lib/common";
import { deleteProblem, updateProblem, type ProblemUpdate } from "@/app/actions";
import type { Difficulty, Status } from "@/db/schema";
import { DifficultyPill, Tag, btnGhost, btnPrimary, inputCls } from "./ui";

type Initial = ProblemUpdate & { id: number; solvedAt: string | null };

const LANGS = [
  { id: "python", label: "Python", file: "solution.py" },
  { id: "java", label: "Java", file: "Solution.java" },
  { id: "cpp", label: "C++", file: "solution.cpp" },
  { id: "javascript", label: "JavaScript", file: "solution.js" },
  { id: "typescript", label: "TypeScript", file: "solution.ts" },
  { id: "go", label: "Go", file: "solution.go" },
];

export default function ProblemEditor({ initial, topicSlug }: { initial: Initial; topicSlug: string }) {
  const [saved, setSaved] = useState(initial);
  const [d, setD] = useState(initial);
  const [tagsText, setTagsText] = useState(initial.tags.join(", "));
  const [notesTab, setNotesTab] = useState<"view" | "edit">(initial.notes.trim() ? "view" : "edit");
  const [codeTab, setCodeTab] = useState<"view" | "edit">(initial.code.trim() ? "view" : "edit");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const payload = useMemo<ProblemUpdate>(
    () => ({ ...d, tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean) }),
    [d, tagsText],
  );
  const dirty = JSON.stringify({ ...payload, id: 0, solvedAt: null }) !== JSON.stringify({ ...saved, id: 0, solvedAt: null });

  const set = <K extends keyof Initial>(k: K, v: Initial[K]) => setD((s) => ({ ...s, [k]: v }));

  const save = () => {
    setError(null);
    start(async () => {
      try {
        const res = await updateProblem(initial.id, payload);
        const next = { ...d, tags: payload.tags, solvedAt: res.solvedAt };
        setSaved(next);
        setD(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !pending) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const lang = LANGS.find((l) => l.id === d.language) ?? LANGS[0];
  const highlighted = useMemo(() => {
    if (!d.code) return "";
    try {
      return hljs.getLanguage(d.language) ? hljs.highlight(d.code, { language: d.language }).value : hljs.highlightAuto(d.code).value;
    } catch {
      return null;
    }
  }, [d.code, d.language]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <label className="sr-only" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            value={d.title}
            onChange={(e) => set("title", e.target.value)}
            className="w-full rounded-lg border border-transparent bg-transparent px-1 -mx-1 text-[28px] font-bold tracking-tight hover:border-line2 focus:border-accent focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <DifficultyPill d={d.difficulty} />
            {payload.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
            {d.url && (
              <a href={d.url} target="_blank" rel="noreferrer" className="ml-1.5 text-[13px] font-semibold text-accent-soft hover:underline">
                Open problem ↗
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-mute" aria-live="polite">
            {pending ? "Saving…" : error ? <span className="text-hard">{error}</span> : dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <button type="button" onClick={save} disabled={!dirty || pending} className={btnPrimary}>
            Save
          </button>
        </div>
      </header>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 rounded-2xl border border-line bg-panel p-4">
        <Field label="Status">
          <select value={d.status} onChange={(e) => set("status", e.target.value as Status)} className={inputCls}>
            <option>Todo</option>
            <option>Attempted</option>
            <option>Solved</option>
          </select>
        </Field>
        <Field label="Difficulty">
          <select value={d.difficulty} onChange={(e) => set("difficulty", e.target.value as Difficulty)} className={inputCls}>
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </select>
        </Field>
        <Field label="Time taken (min)">
          <input
            inputMode="numeric"
            value={d.timeTakenMin ?? ""}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              set("timeTakenMin", Number.isFinite(n) ? n : null);
            }}
            className={inputCls}
          />
        </Field>
        <Field label="LC #">
          <input
            inputMode="numeric"
            value={d.lcNumber ?? ""}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              set("lcNumber", Number.isFinite(n) ? n : null);
            }}
            className={inputCls}
          />
        </Field>
        <Field label="Pattern tags" wide>
          <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Sliding Window, Hashing" className={inputCls} />
        </Field>
        <Field label="Link" wide>
          <input value={d.url} onChange={(e) => set("url", e.target.value)} placeholder="https://leetcode.com/problems/…" className={inputCls} />
        </Field>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] items-start gap-5">
        <section className="overflow-hidden rounded-2xl border border-line bg-panel">
          <Tabs value={notesTab} onChange={setNotesTab} items={[["view", "Notes"], ["edit", "Edit (markdown)"]]} />
          {notesTab === "view" ? (
            <div className="md min-h-64 px-6 py-5">
              {d.notes.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {d.notes}
                </ReactMarkdown>
              ) : (
                <p className="text-mute">No notes yet.</p>
              )}
            </div>
          ) : (
            <textarea
              aria-label="Notes (markdown)"
              value={d.notes}
              onChange={(e) => set("notes", e.target.value)}
              spellCheck={false}
              className="block min-h-[480px] w-full resize-y bg-transparent px-6 py-5 font-mono text-[13px] leading-relaxed text-soft focus:outline-none"
            />
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-line bg-sunk">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-side pr-2">
            <Tabs value={codeTab} onChange={setCodeTab} items={[["view", lang.file], ["edit", "Edit"]]} bare />
            <div className="flex items-center gap-1">
              <label className="sr-only" htmlFor="lang">
                Language
              </label>
              <select
                id="lang"
                value={d.language}
                onChange={(e) => set("language", e.target.value)}
                className="min-h-9 rounded-md border border-line2 bg-sunk px-2 text-xs text-soft"
              >
                {LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Copy code"
                onClick={() => {
                  navigator.clipboard.writeText(d.code).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  });
                }}
                className="flex h-11 w-11 items-center justify-center text-mute hover:text-ink"
              >
                {copied ? (
                  <span className="text-xs text-easy">✓</span>
                ) : (
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="12" height="12" rx="2" />
                    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {codeTab === "view" ? (
            d.code ? (
              highlighted != null ? (
                <pre className="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-relaxed">
                  <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />
                </pre>
              ) : (
                <pre className="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-relaxed text-soft">{d.code}</pre>
              )
            ) : (
              <p className="px-5 py-8 text-sm text-mute">No solution yet — switch to Edit to paste one.</p>
            )
          ) : (
            <textarea
              aria-label="Solution code"
              value={d.code}
              onChange={(e) => set("code", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const { selectionStart: s, selectionEnd: en } = el;
                  const next = d.code.slice(0, s) + "    " + d.code.slice(en);
                  set("code", next);
                  requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4));
                }
              }}
              spellCheck={false}
              placeholder="Paste or write your solution…"
              className="block min-h-[420px] w-full resize-y bg-transparent px-5 py-4 font-mono text-[13px] leading-relaxed text-soft focus:outline-none"
            />
          )}
          <div className="flex flex-wrap gap-4 border-t border-line px-5 py-3 font-mono text-[13px] text-mute">
            <label className="flex items-center gap-2">
              Time
              <input
                value={d.timeComplexity}
                onChange={(e) => set("timeComplexity", e.target.value)}
                placeholder="O(n)"
                className="min-h-9 w-32 rounded-md border border-line2 bg-transparent px-2 text-ink focus:border-accent focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2">
              Space
              <input
                value={d.spaceComplexity}
                onChange={(e) => set("spaceComplexity", e.target.value)}
                placeholder="O(1)"
                className="min-h-9 w-32 rounded-md border border-line2 bg-transparent px-2 text-ink focus:border-accent focus:outline-none"
              />
            </label>
          </div>
        </section>
      </div>

      <form
        action={deleteProblem}
        onSubmit={(e) => {
          if (!confirm(`Delete "${saved.title}"?`)) e.preventDefault();
        }}
        className="flex justify-end"
      >
        <input type="hidden" name="id" value={initial.id} />
        <input type="hidden" name="slug" value={topicSlug} />
        <button className={`${btnGhost} border-transparent text-hard hover:bg-[#2c1416]`}>Delete problem</button>
      </form>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-mute ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}

function Tabs<T extends string>({
  value,
  onChange,
  items,
  bare,
}: {
  value: T;
  onChange: (v: T) => void;
  items: [T, string][];
  bare?: boolean;
}) {
  return (
    <div role="tablist" className={`flex ${bare ? "" : "border-b border-line"}`}>
      {items.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`min-h-11 border-b-2 px-4 text-[13px] ${
            value === v ? "border-accent font-semibold text-ink" : "border-transparent text-mute hover:text-ink"
          } ${bare ? "font-mono" : ""}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
