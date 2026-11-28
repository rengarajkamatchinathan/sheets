import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/*
 * In-app updates from GitHub Releases (tauri-plugin-updater; endpoint and signing key in
 * tauri.conf.json). Checks shortly after start and every few hours; when a newer signed
 * build exists, the sidebar shows an "Update" button. Clicking it downloads, installs and
 * restarts. Local data (including unsynced changes) lives in the app data folder, so it
 * survives the update.
 */

const FIRST_CHECK_MS = 5_000;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

export type UpdateState =
  | { kind: "none" }
  | { kind: "available"; version: string }
  | { kind: "installing"; percent: number | null }
  | { kind: "error"; message: string };

export function useAppUpdate() {
  const [state, setState] = useState<UpdateState>({ kind: "none" });
  const update = useRef<Update | null>(null);

  useEffect(() => {
    let live = true;
    const run = async () => {
      try {
        const u = await check();
        if (!live) return;
        update.current = u;
        // Don't clobber an install in progress.
        setState((s) => (s.kind === "installing" ? s : u ? { kind: "available", version: u.version } : { kind: "none" }));
      } catch {
        // Offline or GitHub unreachable: try again on the next interval, quietly.
      }
    };
    const first = window.setTimeout(run, FIRST_CHECK_MS);
    const every = window.setInterval(run, CHECK_EVERY_MS);
    return () => {
      live = false;
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);

  const install = useCallback(async () => {
    const u = update.current;
    if (!u) return;
    let total = 0;
    let done = 0;
    setState({ kind: "installing", percent: null });
    try {
      await u.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        if (e.event === "Progress") {
          done += e.data.chunkLength;
          if (total > 0) setState({ kind: "installing", percent: Math.min(100, Math.round((done / total) * 100)) });
        }
      });
      await relaunch(); // (on Windows the installer usually restarts the app itself)
    } catch (e) {
      setState({ kind: "error", message: String(e) });
    }
  }, []);

  return { state, install };
}
