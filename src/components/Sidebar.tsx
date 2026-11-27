"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </>
    ),
  },
  {
    href: "/topics",
    label: "Topics",
    icon: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </>
    ),
  },
];

export default function Sidebar() {
  return <SidebarView path={usePathname()} />;
}

export function SidebarView({ path }: { path: string }) {
  const isActive = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href) || (href === "/topics" && path.startsWith("/problems"));

  return (
    <nav
      aria-label="Main"
      className="flex shrink-0 items-center gap-1 border-b border-line bg-side px-4 py-3 md:sticky md:top-0 md:h-screen md:w-60 md:flex-col md:items-stretch md:border-r md:border-b-0 md:py-6"
    >
      <Link href="/" className="mr-4 flex items-center gap-2.5 px-2 md:mr-0 md:mb-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-mono text-sm font-bold text-bg">{"{}"}</span>
        <span className="text-[17px] font-bold tracking-tight">DSA Log</span>
      </Link>
      {NAV.map((n) => {
        const active = isActive(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm ${
              active ? "bg-[#1c2530] font-semibold text-ink" : "font-medium text-mute hover:bg-[#161c24] hover:text-ink"
            }`}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {n.icon}
            </svg>
            {n.label}
          </Link>
        );
      })}
      <div className="mt-auto hidden border-t border-line px-3 pt-4 text-xs leading-relaxed text-mute md:block">
        Sheet: NeetCode 150
      </div>
    </nav>
  );
}
