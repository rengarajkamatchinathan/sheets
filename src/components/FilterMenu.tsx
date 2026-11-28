"use client";

import Link from "next/link";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type FilterOption = { label: string; active: boolean; href?: string; value?: string };
export type FilterSection = { key: string; title: string; options: FilterOption[] };

/**
 * A single "Filter" button that opens a popover of option pills.
 * Options navigate (`href`, for URL-driven pages) or call `onSelect` (client state).
 */
export default function FilterMenu({
  sections,
  activeCount,
  onSelect,
  resetHref,
  onReset,
}: {
  sections: FilterSection[];
  activeCount: number;
  onSelect?: (section: string, value: string) => void;
  resetHref?: string;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pill = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center rounded-full px-3 text-[13px] transition-colors",
      active ? "bg-brand/15 text-brand-soft ring-1 ring-brand/30" : "bg-fg/[0.04] text-soft hover:bg-fg/[0.08] hover:text-ink",
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] transition-colors",
          activeCount ? "bg-brand/10 text-brand-soft" : "text-mute hover:bg-fg/5 hover:text-ink",
        )}
      >
        <SlidersHorizontal className="size-4" />
        Filter
        {activeCount > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-brand-ink">
            {activeCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex flex-col gap-4 p-4">
          {sections.map((s) => (
            <div key={s.key}>
              <div className="mb-2 text-[11px] font-semibold tracking-wide text-mute uppercase">{s.title}</div>
              <div role="group" aria-label={s.title} className="flex flex-wrap gap-1.5">
                {s.options.map((o) =>
                  o.href ? (
                    <Link
                      key={o.label}
                      href={o.href}
                      aria-current={o.active ? "true" : undefined}
                      onClick={() => setOpen(false)}
                      className={pill(o.active)}
                    >
                      {o.label}
                    </Link>
                  ) : (
                    <button
                      key={o.label}
                      type="button"
                      aria-pressed={o.active}
                      onClick={() => onSelect?.(s.key, o.value ?? o.label)}
                      className={pill(o.active)}
                    >
                      {o.label}
                    </button>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
        {activeCount > 0 && (
          <div className="flex justify-end border-t border-line px-4 py-2.5">
            {resetHref ? (
              <Link href={resetHref} onClick={() => setOpen(false)} className="text-[13px] text-mute hover:text-ink">
                Reset filters
              </Link>
            ) : (
              <button type="button" onClick={onReset} className="text-[13px] text-mute hover:text-ink">
                Reset filters
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
