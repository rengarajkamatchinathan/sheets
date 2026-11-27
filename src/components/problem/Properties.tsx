"use client";

import { useState } from "react";
import {
  CalendarCheck,
  ChevronDown,
  CircleDashed,
  CircleDot,
  CircleCheck,
  ExternalLink,
  Gauge,
  Hash,
  Link2,
  Plus,
  Shapes,
  Sigma,
  Tags,
  Timer,
  X,
} from "lucide-react";
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
  tags: string[];
  url: string;
  lcNumber: number | null;
  timeTakenMin: number | null;
  timeComplexity: string;
  spaceComplexity: string;
};

const STATUS: Record<Status, { cls: string; icon: React.ReactNode }> = {
  Todo: { cls: "bg-[#262d37] text-soft", icon: <CircleDashed className="size-3.5" /> },
  Attempted: { cls: "bg-[#3a2f12] text-medium", icon: <CircleHalfIcon /> },
  Solved: { cls: "bg-[#143321] text-easy", icon: <CircleCheck className="size-3.5" /> },
};

const DIFF: Record<Difficulty, string> = {
  Easy: "bg-[#143321] text-easy",
  Medium: "bg-[#3a2f12] text-medium",
  Hard: "bg-[#3b1a1d] text-hard",
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

/** Notion-style property list: label column + inline-editable values. */
export default function Properties({
  v,
  set,
  patterns,
  solvedAt,
}: {
  v: PropValues;
  set: <K extends keyof PropValues>(k: K, val: PropValues[K]) => void;
  patterns: { id: number; name: string }[];
  solvedAt: string | null;
}) {
  const patternName = patterns.find((p) => p.id === v.patternId)?.name;

  return (
    <dl className="grid grid-cols-1 gap-x-10 gap-y-0.5 lg:grid-cols-2">
      <Row icon={<CircleDot />} label="Status">
        <Pick
          value={v.status}
          options={(["Todo", "Attempted", "Solved"] as Status[]).map((s) => ({ value: s, label: s }))}
          onChange={(s) => set("status", s as Status)}
          trigger={
            <Pill className={STATUS[v.status].cls}>
              {STATUS[v.status].icon}
              {v.status}
            </Pill>
          }
        />
      </Row>

      <Row icon={<Gauge />} label="Difficulty">
        <Pick
          value={v.difficulty}
          options={(["Easy", "Medium", "Hard"] as Difficulty[]).map((d) => ({ value: d, label: d }))}
          onChange={(d) => set("difficulty", d as Difficulty)}
          trigger={<Pill className={DIFF[v.difficulty]}>{v.difficulty}</Pill>}
        />
      </Row>

      <Row icon={<Shapes />} label="Pattern">
        <Pick
          value={v.patternId == null ? "" : String(v.patternId)}
          options={[{ value: "", label: "Unsorted" }, ...patterns.map((p) => ({ value: String(p.id), label: p.name }))]}
          onChange={(val) => set("patternId", val ? Number(val) : null)}
          trigger={<Pill className="bg-[#1d2a3a] text-[#9cc7ff]">{patternName ?? "Unsorted"}</Pill>}
        />
      </Row>

      <Row icon={<Tags />} label="Tags">
        <TagEditor tags={v.tags} onChange={(t) => set("tags", t)} />
      </Row>

      <Row icon={<Link2 />} label="Link">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <InlineInput value={v.url} onChange={(x) => set("url", x)} placeholder="Paste problem URL" className="truncate" />
          {v.url && (
            <a
              href={v.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open link"
              className="flex size-8 flex-none items-center justify-center rounded-md text-mute hover:bg-white/5 hover:text-brand-soft"
            >
              <ExternalLink className="size-4" />
            </a>
          )}
        </div>
      </Row>

      <Row icon={<Hash />} label="LeetCode #">
        <InlineInput
          value={v.lcNumber == null ? "" : String(v.lcNumber)}
          onChange={(x) => set("lcNumber", toInt(x))}
          placeholder="Empty"
          inputMode="numeric"
          className="font-mono"
        />
      </Row>

      <Row icon={<Timer />} label="Time taken">
        <div className="flex items-center">
          <InlineInput
            value={v.timeTakenMin == null ? "" : String(v.timeTakenMin)}
            onChange={(x) => set("timeTakenMin", toInt(x))}
            placeholder="Empty"
            inputMode="numeric"
            className="w-20 font-mono"
          />
          {v.timeTakenMin != null && <span className="text-sm text-mute">min</span>}
        </div>
      </Row>

      <Row icon={<Sigma />} label="Complexity">
        <div className="flex flex-wrap items-center gap-x-3 font-mono text-[13px]">
          <span className="flex items-center text-mute">
            T
            <InlineInput value={v.timeComplexity} onChange={(x) => set("timeComplexity", x)} placeholder="O(?)" className="w-28" />
          </span>
          <span className="flex items-center text-mute">
            S
            <InlineInput value={v.spaceComplexity} onChange={(x) => set("spaceComplexity", x)} placeholder="O(?)" className="w-28" />
          </span>
        </div>
      </Row>

      <Row icon={<CalendarCheck />} label="Solved on">
        <span className={cn("px-2 text-sm", solvedAt ? "text-soft" : "text-[#5b6675]")}>
          {solvedAt
            ? new Date(solvedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
            : "Set automatically when marked Solved"}
        </span>
      </Row>
    </dl>
  );
}

function toInt(x: string) {
  const n = parseInt(x, 10);
  return Number.isFinite(n) ? n : null;
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-2">
      <dt className="flex w-32 flex-none items-center gap-2 text-[13px] text-mute [&_svg]:size-4 [&_svg]:opacity-80">
        {icon}
        {label}
      </dt>
      <dd className="flex min-w-0 flex-1 items-center">{children}</dd>
    </div>
  );
}

function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium", className)}>{children}</span>;
}

function Pick({
  value,
  options,
  onChange,
  trigger,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  trigger: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex h-8 items-center gap-1 rounded-md px-1.5 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:outline-none">
        {trigger}
        <ChevronDown className="size-3.5 text-mute opacity-0 transition-opacity group-hover:opacity-100" />
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

function InlineInput({
  value,
  onChange,
  placeholder,
  className,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      spellCheck={false}
      className={cn(
        "h-8 min-w-0 flex-1 rounded-md bg-transparent px-2 text-sm text-ink placeholder:text-[#5b6675] hover:bg-white/5 focus:bg-[#1c222b] focus:ring-1 focus:ring-brand/40 focus:outline-none",
        className,
      )}
    />
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    const next = [...tags];
    for (const p of parts) if (!next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setDraft("");
  };
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 px-1.5 py-1">
      {tags.map((t) => (
        <span key={t} className="group inline-flex h-6 items-center gap-1 rounded-md bg-[#262d37] pr-1 pl-2 text-[13px] text-soft">
          {t}
          <button
            type="button"
            aria-label={`Remove tag ${t}`}
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="flex size-4 items-center justify-center rounded-sm text-mute opacity-60 hover:bg-white/10 hover:text-ink hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[13px] text-mute hover:bg-white/5 hover:text-ink">
          <Plus className="size-3.5" />
          {tags.length === 0 && "Add tag"}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input
              autoFocus
              aria-label="New tag"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. Hashing, Two Pointers"
              className="h-9 w-full rounded-md border border-line2 bg-bg px-2.5 text-sm text-ink placeholder:text-mute focus:border-brand focus:outline-none"
            />
            <p className="mt-1.5 px-0.5 text-xs text-mute">Enter to add · comma for several</p>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
