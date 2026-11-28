import { useEffect, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CloudOff, Loader2, RefreshCw, Settings, TriangleAlert, Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { refreshData } from "./data";
import { syncNow, type SyncStatus } from "./sync";

/** Bottom-right sync indicator (desktop only — the shared sidebar stays as on the web). */
export default function SyncBadge({ status }: { status: SyncStatus | null }) {
  const [open, setOpen] = useState(false);
  if (!status) return null;

  const pending = status.pending > 0 ? ` · ${status.pending} pending` : "";
  const view = {
    setup: { Icon: Settings, text: "Not connected", tone: "text-mute" },
    syncing: { Icon: Loader2, text: "Syncing…", tone: "text-mute" },
    synced: {
      Icon: status.pending > 0 ? RefreshCw : Check,
      text: status.lastSync ? `Synced ${timeAgo(new Date(status.lastSync))}${pending}` : `Synced${pending}`,
      tone: "text-mute",
    },
    offline: { Icon: CloudOff, text: `Offline${pending}`, tone: "text-medium" },
    error: { Icon: TriangleAlert, text: `Sync error${pending}`, tone: "text-hard" },
  }[status.state];

  return (
    <>
      <div className="fixed right-3 bottom-3 z-40 flex items-center gap-1 rounded-full border border-line bg-panel/95 py-1 pr-1 pl-3 text-xs shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => syncNow()}
          title={status.message ?? "Sync now"}
          className={cn("flex items-center gap-1.5 hover:text-ink", view.tone)}
        >
          <view.Icon className={cn("size-3.5", status.state === "syncing" && "animate-spin")} />
          {view.text}
        </button>
        <button
          type="button"
          aria-label="Sync settings"
          onClick={() => setOpen(true)}
          className="ml-1 flex size-6 items-center justify-center rounded-full text-faint hover:bg-fg/[0.06] hover:text-ink"
        >
          <Settings className="size-3.5" />
        </button>
      </div>
      <SettingsDialog open={open} onOpenChange={setOpen} status={status} />
    </>
  );
}

type Settings = { siteUrl: string; hasSecret: boolean };

function SettingsDialog({ open, onOpenChange, status }: { open: boolean; onOpenChange: (v: boolean) => void; status: SyncStatus }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [siteUrl, setSiteUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaved(false);
    setSecret("");
    invoke<Settings>("get_settings").then((s) => {
      setSettings(s);
      setSiteUrl(s.siteUrl);
    });
  }, [open]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      // Blank secret field = keep the saved one.
      await invoke("set_settings", { siteUrl, secret: secret ? secret : null });
      setSaved(true);
    } catch (err) {
      setError(String(err));
    }
  }

  async function disconnect() {
    setError(null);
    try {
      await invoke("clear_db_url");
      refreshData();
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    }
  }

  const input = "h-9 rounded-lg border border-line bg-sunk px-3 text-sm text-ink outline-none focus:border-brand";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Sync</DialogTitle>
        <DialogDescription>
          {status.state === "error" && status.message ? status.message : "Changes are saved on this computer first and synced to the database in the background."}
        </DialogDescription>

        <form onSubmit={save} className="mt-2 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-mute">
            Website URL (optional — refreshes the web app after a sync)
            <input className={input} value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://your-app.vercel.app" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-mute">
            Revalidate secret {settings?.hasSecret && <span className="text-faint">(saved — leave blank to keep)</span>}
            <input className={input} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Same as REVALIDATE_SECRET on Vercel" />
          </label>
          {error && <p className="text-sm text-hard">{error}</p>}
          <div className="flex items-center gap-2">
            <Button type="submit">Save</Button>
            {saved && <span className="text-xs text-easy">Saved</span>}
            <button type="button" onClick={disconnect} className="ml-auto text-xs text-faint hover:text-hard">
              Disconnect database
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
