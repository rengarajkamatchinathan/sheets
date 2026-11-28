"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { BookOpen, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useThemePref } from "@/components/ThemeToggle";

const NAV = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/topics", label: "Topics", Icon: BookOpen },
];

const RAIL = 52; // collapsed width (icons only)
const FULL = 232; // expanded width

// ── Pinned state, persisted in localStorage and shared across tabs ──────────
const PIN_KEY = "dsa-sidebar-pinned";
const PIN_EVENT = "dsa-sidebar-pin";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(PIN_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(PIN_EVENT, cb);
  };
}
function readPinned() {
  try {
    return localStorage.getItem(PIN_KEY) === "1";
  } catch {
    return false;
  }
}
function writePinned(v: boolean) {
  try {
    localStorage.setItem(PIN_KEY, v ? "1" : "0");
  } catch {
    // Storage blocked: the toggle still works for this page view via the event below.
  }
  window.dispatchEvent(new Event(PIN_EVENT));
}

/** Extra button shown above the theme toggle (the desktop app uses it for "Update"). */
export type SidebarAction = {
  key: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  /** Draw attention (brand colour + dot). */
  highlight?: boolean;
  disabled?: boolean;
};

export default function Sidebar({ actions }: { actions?: SidebarAction[] }) {
  return <SidebarView path={usePathname()} actions={actions} />;
}

/**
 * Desktop: collapsible sidebar — an icon rail or full width, toggled only by the
 * button at the bottom (remembered across visits). Mobile: top bar + slide-in menu.
 */
export function SidebarView({ path, actions = [] }: { path: string; actions?: SidebarAction[] }) {
  const open = useSyncExternalStore(subscribe, readPinned, () => false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useThemePref();

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href) || (href === "/topics" && path.startsWith("/problems"));

  return (
    <>
      {/* ── Desktop ─────────────────────────────────────────────── */}
      <nav
        aria-label="Main"
        style={{ width: open ? FULL : RAIL }}
        className="sticky top-0 hidden h-screen flex-none flex-col overflow-hidden border-r border-line bg-side py-4 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:flex"
      >
        <Link href="/" className="mb-6 flex h-10 items-center gap-3 px-[10px]" aria-label="D-Notes home">
          <Logo />
          <Label open={open} className="text-[17px] font-bold tracking-tight">
            D-Notes
          </Label>
        </Link>

        <div className="flex flex-col gap-1 px-1.5">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <Tip key={href} show={!open} label={label}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={open ? undefined : label}
                  className={cn(
                    "relative flex h-10 items-center gap-3 rounded-lg px-[11px] text-sm transition-colors",
                    active ? "bg-fg/[0.06] font-medium text-ink" : "text-mute hover:bg-fg/[0.04] hover:text-ink",
                  )}
                >
                  {active && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-brand" />}
                  <Icon className="size-[18px] flex-none" />
                  <Label open={open}>{label}</Label>
                </Link>
              </Tip>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col gap-1 px-1.5">
          <Label open={open} className="px-[11px] pb-2 text-xs text-faint">
            Sheet: NeetCode 150
          </Label>
          {actions.map((a) => (
            <Tip key={a.key} show={!open} label={a.label}>
              <button
                type="button"
                onClick={a.onClick}
                disabled={a.disabled}
                aria-label={a.label}
                className={cn(
                  "relative flex h-10 items-center gap-3 rounded-lg px-[11px] text-sm disabled:opacity-60",
                  a.highlight ? "text-brand-soft hover:bg-brand/[0.08]" : "text-mute hover:bg-fg/[0.04] hover:text-ink",
                )}
              >
                <a.Icon className="size-[18px] flex-none" />
                {a.highlight && <span className="absolute top-2 left-[26px] size-1.5 rounded-full bg-brand" />}
                <Label open={open}>{a.label}</Label>
              </button>
            </Tip>
          ))}
          <Tip show={!open} label={`Theme: ${theme.label}`}>
            <button
              type="button"
              onClick={theme.cycle}
              aria-label={`Theme: ${theme.label}. Click to change`}
              className="flex h-10 items-center gap-3 rounded-lg px-[11px] text-sm text-mute hover:bg-fg/[0.04] hover:text-ink"
            >
              <theme.Icon className="size-[18px] flex-none" />
              <Label open={open}>Theme: {theme.label}</Label>
            </button>
          </Tip>
          <Tip show={!open} label="Expand sidebar">
            <button
              type="button"
              onClick={() => writePinned(!open)}
              aria-expanded={open}
              aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
              className="flex h-10 items-center gap-3 rounded-lg px-[11px] text-sm text-mute hover:bg-fg/[0.04] hover:text-ink"
            >
              {open ? <PanelLeftClose className="size-[18px] flex-none" /> : <PanelLeftOpen className="size-[18px] flex-none" />}
              <Label open={open}>Collapse</Label>
            </button>
          </Tip>
        </div>
      </nav>

      {/* ── Mobile ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-side/95 px-4 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-base font-bold tracking-tight">D-Notes</span>
        </Link>
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="flex size-10 items-center justify-center rounded-lg text-soft hover:bg-fg/5"
        >
          <Menu className="size-5" />
        </button>
      </div>

      <div
        aria-hidden="true"
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 z-50 bg-black/60 transition-opacity duration-200 md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <nav
        aria-label="Main"
        inert={!mobileOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-side p-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
              <div className="mb-6 flex items-center justify-between">
                <span className="flex items-center gap-2.5">
                  <Logo />
                  <span className="text-base font-bold tracking-tight">D-Notes</span>
                </span>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMobileOpen(false)}
                  className="flex size-10 items-center justify-center rounded-lg text-soft hover:bg-fg/5"
                >
                  <X className="size-5" />
                </button>
              </div>
              {NAV.map(({ href, label, Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-12 items-center gap-3 rounded-lg px-3 text-[15px]",
                      active ? "bg-fg/[0.06] font-medium text-ink" : "text-mute hover:bg-fg/[0.04] hover:text-ink",
                    )}
                  >
                    <Icon className="size-5" />
                    {label}
                  </Link>
                );
              })}
              <div className="mt-auto" />
              {actions.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={a.onClick}
                  disabled={a.disabled}
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-lg px-3 text-[15px] disabled:opacity-60",
                    a.highlight ? "text-brand-soft hover:bg-brand/[0.08]" : "text-mute hover:bg-fg/[0.04] hover:text-ink",
                  )}
                >
                  <a.Icon className="size-5" />
                  {a.label}
                </button>
              ))}
              <button
                type="button"
                onClick={theme.cycle}
                aria-label={`Theme: ${theme.label}. Click to change`}
                className="flex h-12 items-center gap-3 rounded-lg px-3 text-[15px] text-mute hover:bg-fg/[0.04] hover:text-ink"
              >
                <theme.Icon className="size-5" />
                Theme: {theme.label}
              </button>
              <span className="mt-2 px-3 text-xs text-faint">Sheet: NeetCode 150</span>
      </nav>
    </>
  );
}

/** Tooltip to the right of an icon, only while the sidebar is collapsed. */
function Tip({ show, label, children }: { show: boolean; label: string; children: React.ReactElement }) {
  if (!show) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function Logo() {
  return (
    <svg viewBox="64 64 896 896" aria-hidden="true" className="size-8 flex-none">
      <path
        d="M264 64H740L960 284V760A200 200 0 0 1 760 960H264A200 200 0 0 1 64 760V264A200 200 0 0 1 264 64Z"
        className="fill-brand"
      />
      <path d="M740 64V224A60 60 0 0 0 800 284H960Z" className="fill-black/25" />
      <circle cx="470" cy="620" r="150" fill="none" strokeWidth="100" className="stroke-bg" />
      <rect x="570" y="250" width="100" height="570" rx="50" className="fill-bg" />
    </svg>
  );
}

/** Label that fades/slides in as the rail expands (CSS transition, no animation library). */
function Label({ open, className, children }: { open: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span
      aria-hidden={open ? undefined : true}
      className={cn(
        "whitespace-nowrap transition-[opacity,translate] duration-150",
        open ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-1.5 opacity-0",
        className,
      )}
    >
      {children}
    </span>
  );
}
