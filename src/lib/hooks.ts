"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORE_EVENT = "dsa-stored-change";

/**
 * A string value persisted in localStorage, shared across components and tabs.
 * Server render (and blocked storage) fall back to `fallback`.
 */
export function useStoredState<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const subscribe = useCallback((cb: () => void) => {
    const onStore = (e: Event) => {
      if (!(e instanceof CustomEvent) || e.detail === key) cb();
    };
    window.addEventListener("storage", cb);
    window.addEventListener(STORE_EVENT, onStore);
    return () => {
      window.removeEventListener("storage", cb);
      window.removeEventListener(STORE_EVENT, onStore);
    };
  }, [key]);

  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return (localStorage.getItem(key) as T | null) ?? fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );

  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, v);
      } catch {
        // Storage blocked: nothing to persist.
      }
      window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: key }));
    },
    [key],
  );

  return [value, set];
}

/** True while the media query matches; `serverDefault` is used during SSR. */
export function useMediaQuery(query: string, serverDefault = true) {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => serverDefault,
  );
}
