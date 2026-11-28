import { useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card } from "@/components/kit";
import { Button } from "@/components/ui/button";

/** First run: paste the Neon connection string. It's verified, then kept in the OS keychain. */
export default function Setup({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await invoke("set_db_url", { url: url.trim() });
      onDone();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg p-6">
        <h1 className="text-xl font-semibold tracking-tight">Connect your database</h1>
        <p className="mt-1.5 text-sm text-mute">
          Paste the same <code className="font-mono text-soft">DATABASE_URL</code> the web app uses. It is stored in your system keychain
          and only used to talk to the database.
        </p>
        <form onSubmit={save} className="mt-5 flex flex-col gap-3">
          <input
            autoFocus
            type="password"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="postgresql://user:password@host/db?sslmode=require"
            className="h-10 rounded-lg border border-line bg-sunk px-3 font-mono text-sm text-ink outline-none focus:border-brand"
          />
          {error && <p className="text-sm text-hard">{error}</p>}
          <Button type="submit" disabled={busy || !url.trim()}>
            {busy ? "Checking connection…" : "Connect"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
