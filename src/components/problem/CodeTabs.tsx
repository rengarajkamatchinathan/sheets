"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import type { Extension } from "@codemirror/state";
import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { Check, ChevronDown, Copy, FileCode2, Plus, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => <div className="h-full bg-[#1e1e1e]" />,
});

export type Tab = { key: string; id: number | null; name: string; language: string; code: string };

export const LANGS: { id: string; label: string; ext: string; color: string; ext_: () => Extension[] }[] = [
  { id: "python", label: "Python", ext: "py", color: "#4b8bbe", ext_: () => [python()] },
  { id: "java", label: "Java", ext: "java", color: "#f89820", ext_: () => [java()] },
  { id: "cpp", label: "C++", ext: "cpp", color: "#659ad2", ext_: () => [cpp()] },
  { id: "javascript", label: "JavaScript", ext: "js", color: "#f7df1e", ext_: () => [javascript()] },
  { id: "typescript", label: "TypeScript", ext: "ts", color: "#3178c6", ext_: () => [javascript({ typescript: true })] },
  { id: "go", label: "Go", ext: "go", color: "#00add8", ext_: () => [go()] },
  { id: "plaintext", label: "Plain text", ext: "txt", color: "#9ba7b4", ext_: () => [] },
];

const langOf = (id: string) => LANGS.find((l) => l.id === id) ?? LANGS[LANGS.length - 1];
const langByExt = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase();
  return LANGS.find((l) => l.ext === ext || (ext === "cc" && l.id === "cpp") || (ext === "jsx" && l.id === "javascript"));
};

export function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

function nextName(tabs: Tab[], language: string) {
  const ext = langOf(language).ext;
  const base = language === "java" ? "Solution" : "solution";
  const taken = new Set(tabs.map((t) => t.name.toLowerCase()));
  if (!taken.has(`${base}.${ext}`.toLowerCase())) return `${base}.${ext}`;
  for (let i = 2; ; i++) if (!taken.has(`${base}${i}.${ext}`.toLowerCase())) return `${base}${i}.${ext}`;
}

/** VS Code-style tabs of code snippets: + adds a file, double-click renames, × closes. */
export default function CodeTabs({ tabs, onChange }: { tabs: Tab[]; onChange: (tabs: Tab[]) => void }) {
  const [activeKey, setActiveKey] = useState<string | null>(tabs[0]?.key ?? null);
  const [renaming, setRenaming] = useState<{ key: string; name: string } | null>(null);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [copied, setCopied] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0] ?? null;
  const lang = active ? langOf(active.language) : null;
  const extensions = useMemo(() => (lang ? lang.ext_() : []), [lang]);

  const update = (key: string, patch: Partial<Tab>) => onChange(tabs.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const add = () => {
    const language = active?.language ?? "python";
    const t: Tab = { key: newKey(), id: null, name: nextName(tabs, language), language, code: "" };
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
    if (name) {
      const byExt = langByExt(name);
      update(renaming.key, { name, ...(byExt ? { language: byExt.id } : {}) });
    }
    setRenaming(null);
  };

  const setLanguage = (id: string) => {
    if (!active) return;
    const old = langOf(active.language).ext;
    const next = langOf(id).ext;
    // Keep the file name in step with the language when it still has the old extension.
    const name = active.name.endsWith(`.${old}`) ? active.name.slice(0, -old.length) + next : active.name;
    update(active.key, { language: id, name });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[#2b2b2b] bg-[#1e1e1e]">
      {/* Tab strip */}
      <div className="flex items-stretch bg-[#252526]">
        <div ref={stripRef} role="tablist" aria-label="Code files" className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:thin]">
          {tabs.map((t) => {
            const on = t.key === active?.key;
            const l = langOf(t.language);
            return (
              <div
                key={t.key}
                role="tab"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setActiveKey(t.key)}
                onDoubleClick={() => setRenaming({ key: t.key, name: t.name })}
                onKeyDown={(e) => {
                  if (e.key === "F2") setRenaming({ key: t.key, name: t.name });
                }}
                onAuxClick={(e) => e.button === 1 && close(t)}
                title="Double-click to rename"
                className={cn(
                  "group relative flex h-10 flex-none cursor-pointer items-center gap-2 border-r border-[#1e1e1e] pr-1.5 pl-3 text-[13px] select-none",
                  on ? "bg-[#1e1e1e] text-white" : "bg-[#2d2d2d] text-[#969696] hover:text-[#cccccc]",
                )}
              >
                {on && <span className="absolute inset-x-0 top-0 h-px bg-brand" />}
                <FileCode2 aria-hidden="true" className="size-3.5 flex-none" style={{ color: l.color }} />
                {renaming?.key === t.key ? (
                  <input
                    autoFocus
                    aria-label="File name"
                    value={renaming.name}
                    onChange={(e) => setRenaming({ key: t.key, name: e.target.value })}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenaming(null);
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-32 rounded-sm bg-[#3c3c3c] px-1 font-mono text-[12px] text-white outline outline-1 outline-brand"
                  />
                ) : (
                  <span className="font-mono text-[12.5px] whitespace-nowrap">{t.name}</span>
                )}
                <button
                  type="button"
                  aria-label={`Close ${t.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    close(t);
                  }}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-sm hover:bg-white/10",
                    on ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
                  )}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex flex-none items-center gap-0.5 px-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="New file" onClick={add} className="flex size-8 items-center justify-center rounded-md text-[#c5c5c5] hover:bg-white/10">
                <Plus className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>New file</TooltipContent>
          </Tooltip>
          {active && (
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
                  className="flex size-8 items-center justify-center rounded-md text-[#c5c5c5] hover:bg-white/10"
                >
                  {copied ? <Check className="size-4 text-easy" /> : <Copy className="size-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{copied ? "Copied" : "Copy code"}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="code-editor relative min-h-[420px] flex-1">
        {active ? (
          <CodeMirror
            key={active.key}
            value={active.code}
            height="100%"
            minHeight="420px"
            theme={vscodeDark}
            extensions={extensions}
            placeholder="// Write or paste your solution"
            basicSetup={{ highlightActiveLine: true, foldGutter: true, autocompletion: true, tabSize: 4 }}
            indentWithTab
            onChange={(code) => update(active.key, { code })}
            onUpdate={(v) => {
              if (!v.selectionSet && !v.docChanged) return;
              const head = v.state.selection.main.head;
              const line = v.state.doc.lineAt(head);
              setCursor({ line: line.number, col: head - line.from + 1 });
            }}
            className="absolute inset-0 overflow-auto"
          />
        ) : (
          <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 text-sm text-[#969696]">
            <FileCode2 className="size-8 opacity-50" />
            No code yet
            <button
              type="button"
              onClick={add}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0e639c] px-3 text-[13px] font-medium text-white hover:bg-[#1177bb]"
            >
              <Plus className="size-4" /> New file
            </button>
          </div>
        )}
      </div>

      {/* Status bar */}
      {active && lang && (
        <div className="flex h-7 items-center justify-end gap-1 bg-[#007acc]/90 px-2 text-[12px] text-white">
          <span className="mr-auto pl-1 font-mono opacity-90">{active.name}</span>
          <span className="px-2 opacity-90">
            Ln {cursor.line}, Col {cursor.col}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-6 items-center gap-1 rounded-sm px-2 hover:bg-white/15">
              {lang.label}
              <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuRadioGroup value={active.language} onValueChange={setLanguage}>
                {LANGS.map((l) => (
                  <DropdownMenuRadioItem key={l.id} value={l.id}>
                    {l.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
