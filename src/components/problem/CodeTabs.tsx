"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { java } from "@codemirror/lang-java";
import { AlertCircle, Check, Copy, Plus, WandSparkles, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { dsaTheme } from "./codeTheme";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => <div className="h-full bg-[#0f1318]" />,
});

export type Tab = {
  key: string;
  id: number | null;
  name: string;
  language: string; // always "java"
  code: string;
  timeComplexity: string;
  spaceComplexity: string;
};

export function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

function nextName(tabs: Tab[]) {
  const taken = new Set(tabs.map((t) => t.name.toLowerCase()));
  for (let i = tabs.length + 1; ; i++) if (!taken.has(`approach ${i}`)) return `Approach ${i}`;
}

/**
 * Formats Java with Prettier (loaded on demand). Snippets that aren't a full
 * compilation unit (e.g. a few statements) are wrapped in a class + method first.
 */
async function formatJava(code: string) {
  const [prettier, plugin] = await Promise.all([import("prettier/standalone"), import("prettier-plugin-java")]);
  const opts = { parser: "java", plugins: [plugin.default ?? plugin], tabWidth: 4, printWidth: 100 };
  try {
    return await prettier.format(code, opts);
  } catch (first) {
    try {
      const wrapped = await prettier.format(`class __W__ {\nvoid __m__() {\n${code}\n}\n}`, opts);
      const lines = wrapped.trimEnd().split("\n");
      const start = lines.findIndex((l) => l.includes("__m__")) + 1;
      return (
        lines
          .slice(start, lines.length - 2)
          .map((l) => l.replace(/^ {8}/, ""))
          .join("\n")
          .trim() + "\n"
      );
    } catch {
      throw first;
    }
  }
}

/** Code snippets as tabs: + adds one, double-click renames, × closes. Java only. */
export default function CodeTabs({ tabs, onChange }: { tabs: Tab[]; onChange: (tabs: Tab[]) => void }) {
  const [activeKey, setActiveKey] = useState<string | null>(tabs[0]?.key ?? null);
  const [renaming, setRenaming] = useState<{ key: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [fmt, setFmt] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const stripRef = useRef<HTMLDivElement>(null);

  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0] ?? null;
  const update = (key: string, patch: Partial<Tab>) => onChange(tabs.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const format = async () => {
    if (!active || !active.code.trim() || fmt.busy) return;
    setFmt({ busy: true, error: null });
    try {
      const out = await formatJava(active.code);
      update(active.key, { code: out });
      setFmt({ busy: false, error: null });
    } catch (e) {
      // Parser errors are long tree dumps; show something readable instead.
      const raw = e instanceof Error ? e.message : "";
      const msg = /parse|syntax|expect/i.test(raw) ? "the code has a syntax error" : raw.split("\n")[0].slice(0, 120) || "unknown error";
      setFmt({ busy: false, error: msg });
      setTimeout(() => setFmt((s) => (s.error === msg ? { ...s, error: null } : s)), 4000);
    }
  };


  const extensions = useMemo(() => [java()], []);

  const add = () => {
    const t: Tab = { key: newKey(), id: null, name: nextName(tabs), language: "java", code: "", timeComplexity: "", spaceComplexity: "" };
    onChange([...tabs, t]);
    setActiveKey(t.key);
    requestAnimationFrame(() => stripRef.current?.scrollTo({ left: stripRef.current.scrollWidth, behavior: "smooth" }));
  };

  const close = (t: Tab) => {
    if (t.code.trim() && !confirm(`Close "${t.name}"? Its code will be deleted.`)) return;
    const i = tabs.findIndex((x) => x.key === t.key);
    const rest = tabs.filter((x) => x.key !== t.key);
    onChange(rest);
    if (active?.key === t.key) setActiveKey(rest[Math.min(i, rest.length - 1)]?.key ?? null);
  };

  const commitRename = () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (name) update(renaming.key, { name });
    setRenaming(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-[#0f1318]">
      {/* Tabs */}
      <div className="flex items-stretch border-b border-line bg-panel">
        <div ref={stripRef} role="tablist" aria-label="Code snippets" className="flex min-w-0 flex-1 overflow-x-auto [&::-webkit-scrollbar]:h-1.5">
          {tabs.map((t) => {
            const on = t.key === active?.key;
            return (
              <div
                key={t.key}
                role="tab"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setActiveKey(t.key)}
                onDoubleClick={() => setRenaming({ key: t.key, name: t.name })}
                onKeyDown={(e) => e.key === "F2" && setRenaming({ key: t.key, name: t.name })}
                onAuxClick={(e) => e.button === 1 && close(t)}
                title="Double-click to rename"
                className={cn(
                  "group relative flex h-10 flex-none cursor-pointer items-center gap-1.5 pr-1.5 pl-3.5 text-[13px] select-none",
                  on ? "bg-[#0f1318] text-ink" : "text-mute hover:bg-white/[0.03] hover:text-soft",
                )}
              >
                {on && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" />}
                {renaming?.key === t.key ? (
                  <input
                    autoFocus
                    aria-label="Snippet title"
                    maxLength={60}
                    value={renaming.name}
                    onChange={(e) => setRenaming({ key: t.key, name: e.target.value })}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenaming(null);
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-36 rounded-sm bg-chip px-1.5 py-0.5 text-[13px] text-ink outline outline-1 outline-brand/60"
                  />
                ) : (
                  <span className="whitespace-nowrap">{t.name}</span>
                )}
                <button
                  type="button"
                  aria-label={`Close ${t.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    close(t);
                  }}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md text-mute hover:bg-white/10 hover:text-ink",
                    on ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
                  )}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="New snippet"
                onClick={add}
                className="flex h-10 w-10 flex-none items-center justify-center text-mute hover:bg-white/[0.03] hover:text-ink"
              >
                <Plus className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>New snippet</TooltipContent>
          </Tooltip>
        </div>
        {active && (
          <div className="flex flex-none items-center gap-0.5 border-l border-line px-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Format code"
                  disabled={fmt.busy || !active.code.trim()}
                  onClick={format}
                  className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-mute hover:bg-white/5 hover:text-ink disabled:opacity-40"
                >
                  <WandSparkles className={cn("size-3.5", fmt.busy && "animate-pulse")} />
                  Format
                </button>
              </TooltipTrigger>
              <TooltipContent>Format code (Shift+Alt+F)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Copy code"
                  onClick={() =>
                    navigator.clipboard.writeText(active.code).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1200);
                    })
                  }
                  className="flex size-8 items-center justify-center rounded-md text-mute hover:bg-white/5 hover:text-ink"
                >
                  {copied ? <Check className="size-4 text-easy" /> : <Copy className="size-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{copied ? "Copied" : "Copy code"}</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {fmt.error && (
        <div role="alert" className="flex items-center gap-2 border-b border-line bg-[#2c1416] px-3 py-1.5 text-xs text-hard">
          <AlertCircle className="size-3.5 flex-none" />
          <span className="truncate">Couldn’t format — {fmt.error}</span>
        </div>
      )}

      {/* Editor */}
      <div
        className="code-editor relative min-h-[400px] flex-1"
        onKeyDownCapture={(e) => {
          if (e.shiftKey && e.altKey && e.code === "KeyF") {
            e.preventDefault();
            e.stopPropagation();
            format();
          }
        }}
      >
        {active ? (
          <CodeMirror
            key={active.key}
            value={active.code}
            height="100%"
            minHeight="400px"
            theme={dsaTheme}
            extensions={extensions}
            placeholder="// Write your Java solution"
            basicSetup={{ highlightActiveLine: true, foldGutter: true, autocompletion: true, tabSize: 4 }}
            indentWithTab
            onChange={(code) => update(active.key, { code })}
            className="absolute inset-0 overflow-auto"
          />
        ) : (
          <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 text-sm text-mute">
            No code yet
            <button
              type="button"
              onClick={add}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-semibold text-brand-ink hover:bg-brand-soft"
            >
              <Plus className="size-4" /> New snippet
            </button>
          </div>
        )}
      </div>

      {/* Complexity for this snippet */}
      {active && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line bg-panel px-3.5 py-2 font-mono text-[12.5px]">
          <ComplexityInput label="Time" value={active.timeComplexity} onChange={(v) => update(active.key, { timeComplexity: v })} />
          <ComplexityInput label="Space" value={active.spaceComplexity} onChange={(v) => update(active.key, { spaceComplexity: v })} />
        </div>
      )}
    </div>
  );
}

function ComplexityInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-mute">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="O(?)"
        spellCheck={false}
        className="h-7 w-32 rounded-md bg-transparent px-1.5 text-ink placeholder:text-[#4a5462] hover:bg-white/5 focus:bg-chip focus:ring-1 focus:ring-brand/40 focus:outline-none"
      />
    </label>
  );
}
