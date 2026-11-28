"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { Monitor, Moon, Sun } from "lucide-react";

export type ThemePref = "dark" | "light" | "system";

const KEY = "dsa-theme";
const EVENT = "dsa-theme-change";
const ORDER: ThemePref[] = ["dark", "light", "system"];
const META = {
  dark: { label: "Dark", Icon: Moon },
  light: { label: "Light", Icon: Sun },
  system: { label: "System", Icon: Monitor },
} as const;

/**
 * Runs inline in <head> before first paint so the page never flashes the wrong theme.
 * Keep in sync with applyTheme() below.
 */
const themeInitScript = `(function(){try{var p=localStorage.getItem("${KEY}")||"dark";var d=p==="system"?matchMedia("(prefers-color-scheme: dark)").matches:p!=="light";var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.classList.toggle("dark",d);}catch(e){}})();`;

/**
 * Emits the theme script into the server HTML via useServerInsertedHTML, so it never
 * sits in React's tree — browser extensions that inject <script> tags into <head>
 * can't cause a hydration mismatch with it. Render once, in the root layout.
 */
export function ThemeScript() {
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />;
  });
  return null;
}

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

function applyTheme(pref: ThemePref) {
  const dark = pref === "system" ? matchMedia("(prefers-color-scheme: dark)").matches : pref === "dark";
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.classList.toggle("dark", dark);
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function useThemePref() {
  const pref = useSyncExternalStore(subscribe, readPref, () => "dark" as ThemePref);

  // Apply before paint on change (incl. other tabs, and the dev Strict Mode remount that
  // resets <html> attributes), and follow the OS while on "system".
  useLayoutEffect(() => {
    applyTheme(pref);
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [pref]);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: still switch for this page view.
      applyTheme(next);
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return { pref, cycle, ...META[pref] };
}
