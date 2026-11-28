import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { refreshData } from "./data";

export type SyncStatus = {
  state: "setup" | "syncing" | "synced" | "offline" | "error";
  pending: number;
  conflicts: number;
  lastSync: string | null;
  message: string | null;
  hasSnapshot: boolean;
};

/** Live sync status from the Rust sync loop. Screens re-read local data after every sync. */
export function useSyncStatus(): SyncStatus | null {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    let live = true;
    invoke<SyncStatus>("sync_status").then((s) => live && setStatus(s)).catch(() => {});
    const offStatus = listen<SyncStatus>("sync-status", (e) => setStatus(e.payload));
    const offData = listen("data-synced", () => refreshData());
    return () => {
      live = false;
      offStatus.then((f) => f());
      offData.then((f) => f());
    };
  }, []);

  return status;
}

export const syncNow = () => invoke("sync_now");
