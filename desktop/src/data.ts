import { useEffect, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";

/*
 * Screen data comes from the Rust side (local SQLite). Every query hook re-runs whenever
 * the data version bumps — after a local change (router.refresh()) or after a sync pulls
 * new rows from the server.
 */
let version = 0;
const listeners = new Set<() => void>();

export function refreshData() {
  version++;
  for (const l of listeners) l();
}

function useDataVersion() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
}

export type QueryState<T> = { data: T; error: null } | { data: undefined; error: string | null };

/** Runs a Rust command and keeps its result fresh. Returns undefined data until the first load. */
export function useCommand<T>(cmd: string, args?: Record<string, unknown>): QueryState<T> {
  const v = useDataVersion();
  const key = JSON.stringify(args ?? {});
  const [state, setState] = useState<{ key: string; data?: T; error: string | null }>({ key, error: null });

  useEffect(() => {
    let live = true;
    invoke<T>(cmd, JSON.parse(key))
      .then((data) => live && setState({ key, data, error: null }))
      .catch((e) => live && setState((s) => ({ key, data: s.key === key ? s.data : undefined, error: String(e) })));
    return () => {
      live = false;
    };
  }, [cmd, key, v]);

  // Data for a different key (e.g. navigating between problems) is never shown.
  if (state.key !== key || state.data === undefined) return { data: undefined, error: state.key === key ? state.error : null };
  return { data: state.data, error: null };
}
