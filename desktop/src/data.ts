import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/*
 * Screen data comes from the Rust side (local SQLite). `refreshData()` re-runs every mounted
 * query and resolves once they've all reloaded — so a board action awaiting it settles its
 * optimistic UI on fresh data, like the web app's `refresh()` in a server action.
 */
const refetchers = new Set<() => Promise<void>>();

export function refreshData(): Promise<void> {
  return Promise.all([...refetchers].map((f) => f())).then(() => undefined);
}

export type QueryState<T> = { data: T; error: null } | { data: undefined; error: string | null };

/** Runs a Rust command and keeps its result fresh. Returns undefined data until the first load. */
export function useCommand<T>(cmd: string, args?: Record<string, unknown>): QueryState<T> {
  const key = JSON.stringify(args ?? {});
  const [state, setState] = useState<{ key: string; data?: T; error: string | null }>({ key, error: null });
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    const load = () =>
      invoke<T>(cmd, JSON.parse(key))
        .then((data) => {
          if (live.current) setState({ key, data, error: null });
        })
        .catch((e) => {
          if (live.current) setState((s) => ({ key, data: s.key === key ? s.data : undefined, error: String(e) }));
        });
    refetchers.add(load);
    load();
    return () => {
      live.current = false;
      refetchers.delete(load);
    };
  }, [cmd, key]);

  // Data for a different key (e.g. navigating between problems) is never shown.
  if (state.key !== key || state.data === undefined) return { data: undefined, error: state.key === key ? state.error : null };
  return { data: state.data, error: null };
}
