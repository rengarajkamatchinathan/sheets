import { useEffect } from "react";
import { HashRouter, Route, Routes, useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCommand, refreshData } from "./data";
import { setNavigate } from "./nav";
import { useSyncStatus } from "./sync";
import SyncBadge from "./SyncBadge";
import Setup from "./routes/Setup";
import Placeholder from "./routes/Placeholder";

type Config = { hasDbUrl: boolean };

/** Same shell as the web app's root layout: sidebar + main column. */
export default function App() {
  const config = useCommand<Config>("get_config");
  const sync = useSyncStatus();

  if (!config.data) return null;
  if (!config.data.hasDbUrl) return <Setup onDone={refreshData} />;
  if (sync && !sync.hasSnapshot) return <FirstDownload offline={sync.state === "offline"} error={sync.state === "error" ? sync.message : null} />;

  return (
    <HashRouter>
      <RegisterNavigate />
      <TooltipProvider delayDuration={300}>
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1 px-5 py-6 md:px-10 md:py-8">
            <div className="mx-auto w-full">
              <Routes>
                <Route path="/" element={<Placeholder title="Dashboard" />} />
                <Route path="/topics" element={<Placeholder title="Topics" />} />
                <Route path="/topics/:slug" element={<Placeholder title="Topic" />} />
                <Route path="/problems/new" element={<Placeholder title="New problem" />} />
                <Route path="/problems/:id" element={<Placeholder title="Problem" />} />
                <Route path="*" element={<Placeholder title="Not found" />} />
              </Routes>
            </div>
          </main>
        </div>
        <SyncBadge status={sync} />
      </TooltipProvider>
    </HashRouter>
  );
}

/** Lets non-component code (the actions shim) navigate, like the web app's redirect(). */
function RegisterNavigate() {
  const nav = useNavigate();
  useEffect(() => {
    setNavigate((to, opts) => nav(to, opts));
    return () => setNavigate(null);
  }, [nav]);
  return null;
}

function FirstDownload({ offline, error }: { offline: boolean; error: string | null }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      {!offline && !error && <Loader2 className="size-6 animate-spin text-brand" />}
      <h1 className="text-lg font-semibold">
        {error ? "Couldn't download your data" : offline ? "Waiting for a connection" : "Downloading your data…"}
      </h1>
      <p className="max-w-sm text-sm text-mute">
        {error ?? (offline ? "The first download needs internet. After that, the app works offline." : "One-time setup — after this the app works offline.")}
      </p>
    </div>
  );
}
