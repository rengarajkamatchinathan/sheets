"use client";

import { useState } from "react";
import { CircleCheck, CircleDashed, ExternalLink, Link2, Plus } from "lucide-react";
import type { Difficulty, Status } from "@/db/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PropValues = {
  status: Status;
  difficulty: Difficulty;
  patternId: number | null;
  url: string;
};

const STATUS: Record<Status, { cls: string; icon: React.ReactNode }> = {
  Todo: { cls: "text-mute", icon: <CircleDashed className="size-3.5" /> },
  Attempted: { cls: "text-medium", icon: <CircleHalfIcon /> },
  Solved: { cls: "text-easy", icon: <CircleCheck className="size-3.5" /> },
};

const DIFF: Record<Difficulty, string> = {
  Easy: "text-easy",
  Medium: "text-medium",
  Hard: "text-hard",
};

/** Half-filled circle for "Attempted". */
function CircleHalfIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </svg>
  );
}

const chip =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:outline-none";

/** One quiet line of chips under the title: status · difficulty · pattern · link. */
export default function Properties({
  v,
  set,
  patterns,
}: {
  v: PropValues;
  set: <K extends keyof PropValues>(k: K, val: PropValues[K]) => void;
  patterns: { id: number; name: string }[];
}) {
  const patternName = patterns.find((p) => p.id === v.patternId)?.name;

  return (
    <div className="-mx-2 flex flex-wrap items-center gap-x-0.5 gap-y-1 text-mute">
      <Pick
        label="Status"
        value={v.status}
        options={(["Todo", "Attempted", "Solved"] as Status[]).map((s) => ({ value: s, label: s }))}
        onChange={(s) => set("status", s as Status)}
      >
        <span className={cn("inline-flex items-center gap-1.5 font-medium", STATUS[v.status].cls)}>
          {STATUS[v.status].icon}
          {v.status}
        </span>
      </Pick>

      <Dot />
      <Pick
        label="Difficulty"
        value={v.difficulty}
        options={(["Easy", "Medium", "Hard"] as Difficulty[]).map((d) => ({ value: d, label: d }))}
        onChange={(d) => set("difficulty", d as Difficulty)}
      >
        <span className={cn("font-medium", DIFF[v.difficulty])}>{v.difficulty}</span>
      </Pick>

      <Dot />
      <Pick
        label="Pattern"
        value={v.patternId == null ? "" : String(v.patternId)}
        options={[{ value: "", label: "Unsorted" }, ...patterns.map((p) => ({ value: String(p.id), label: p.name }))]}
        onChange={(val) => set("patternId", val ? Number(val) : null)}
      >
        <span className="text-soft">{patternName ?? "Unsorted"}</span>
      </Pick>

      <Dot />
      <LinkChip url={v.url} onChange={(u) => set("url", u)} />
    </div>
  );
}

function Dot() {
  return <span aria-hidden="true" className="px-0.5 text-[#3a4350]">·</span>;
}

function Pick({
  label,
  value,
  options,
  onChange,
  children,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`${label}: change`} title={label} className={chip}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o, i) => (
            <div key={o.value}>
              {i === 1 && options[0].value === "" && <DropdownMenuSeparator />}
              <DropdownMenuRadioItem value={o.value}>{o.label}</DropdownMenuRadioItem>
            </div>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function LinkChip({ url, onChange }: { url: string; onChange: (u: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger aria-label={url ? "Edit link" : "Add link"} title={url || "Add link"} className={chip}>
          {url ? (
            <>
              <Link2 className="size-3.5" />
              <span className="max-w-48 truncate">{host(url)}</span>
            </>
          ) : (
            <>
              <Plus className="size-3.5" /> Link
            </>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 p-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setOpen(false);
            }}
          >
            <input
              autoFocus
              aria-label="Problem URL"
              value={url}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://leetcode.com/problems/…"
              spellCheck={false}
              className="h-9 w-full rounded-md border border-line2 bg-bg px-2.5 text-sm text-ink placeholder:text-mute focus:border-brand focus:outline-none"
            />
          </form>
        </PopoverContent>
      </Popover>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open problem in new tab"
          title="Open problem"
          className="flex size-7 items-center justify-center rounded-md text-mute hover:bg-white/5 hover:text-brand-soft"
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </span>
  );
}
