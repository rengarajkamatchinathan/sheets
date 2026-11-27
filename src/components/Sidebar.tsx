"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/topics", label: "Topics", Icon: BookOpen },
];

const RAIL = 52; // collapsed width (icons only)
const FULL = 232; // expanded width
const spring = { type: "spring", stiffness: 420, damping: 38 } as const;

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

export default function Sidebar() {
  return <SidebarView path={usePathname()} />;
}

/**
 * Desktop: collapsible sidebar — an icon rail or full width, toggled only by the
 * button at the bottom (remembered across visits). Mobile: top bar + slide-in menu.
 */
export function SidebarView({ path }: { path: string }) {
  const open = useSyncExternalStore(subscribe, readPinned, () => false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href) || (href === "/topics" && path.startsWith("/problems"));

  return (
    <>
      {/* ── Desktop ─────────────────────────────────────────────── */}
      <motion.nav
        aria-label="Main"
        initial={false}
        animate={{ width: open ? FULL : RAIL }}
        transition={spring}
        className="sticky top-0 hidden h-screen flex-none flex-col overflow-hidden border-r border-line bg-side py-4 md:flex"
      >
        <Link href="/" className="mb-6 flex h-10 items-center gap-3 px-[10px]" aria-label="DSA Log home">
          <Logo />
          <Label open={open} className="text-[17px] font-bold tracking-tight">
            DSA Log
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
                    active ? "bg-white/[0.06] font-medium text-ink" : "text-mute hover:bg-white/[0.04] hover:text-ink",
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
          <Label open={open} className="px-[11px] pb-2 text-xs text-[#5b6675]">
            Sheet: NeetCode 150
          </Label>
          <Tip show={!open} label="Expand sidebar">
            <button
              type="button"
              onClick={() => writePinned(!open)}
              aria-expanded={open}
              aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
              className="flex h-10 items-center gap-3 rounded-lg px-[11px] text-sm text-mute hover:bg-white/[0.04] hover:text-ink"
            >
              {open ? <PanelLeftClose className="size-[18px] flex-none" /> : <PanelLeftOpen className="size-[18px] flex-none" />}
              <Label open={open}>Collapse</Label>
            </button>
          </Tip>
        </div>
      </motion.nav>

      {/* ── Mobile ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-side/95 px-4 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-base font-bold tracking-tight">DSA Log</span>
        </Link>
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="flex size-10 items-center justify-center rounded-lg text-soft hover:bg-white/5"
        >
          <Menu className="size-5" />
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-50 bg-black/60 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.nav
              key="drawer"
              aria-label="Main"
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-side p-4 md:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={spring}
            >
              <div className="mb-6 flex items-center justify-between">
                <span className="flex items-center gap-2.5">
                  <Logo />
                  <span className="text-base font-bold tracking-tight">DSA Log</span>
                </span>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMobileOpen(false)}
                  className="flex size-10 items-center justify-center rounded-lg text-soft hover:bg-white/5"
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
                      active ? "bg-white/[0.06] font-medium text-ink" : "text-mute hover:bg-white/[0.04] hover:text-ink",
                    )}
                  >
                    <Icon className="size-5" />
                    {label}
                  </Link>
                );
              })}
              <span className="mt-auto px-3 text-xs text-[#5b6675]">Sheet: NeetCode 150</span>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
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
    <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-brand font-mono text-sm font-bold text-bg">
      {"{}"}
    </span>
  );
}

/** Label that fades/slides in as the rail expands (Aceternity-style). */
function Label({ open, className, children }: { open: boolean; className?: string; children: React.ReactNode }) {
  return (
    <motion.span
      initial={false}
      animate={{ opacity: open ? 1 : 0, x: open ? 0 : -6 }}
      transition={{ duration: 0.15 }}
      aria-hidden={open ? undefined : true}
      className={cn("whitespace-nowrap", !open && "pointer-events-none", className)}
    >
      {children}
    </motion.span>
  );
}
