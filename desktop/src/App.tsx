import { HashRouter, Route, Routes } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "@/components/Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCommand, refreshData } from "./data";
import Setup from "./routes/Setup";
import Placeholder from "./routes/Placeholder";

type Config = { hasDbUrl: boolean };

/** Same shell as the web app's root layout: sidebar + main column. */
export default function App() {
  const config = useCommand<Config>("get_config");
  if (!config.data) return null;
  if (!config.data.hasDbUrl) return <Setup onDone={refreshData} />;

  return (
    <HashRouter>
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
              <button
                type="button"
                className="mt-8 text-xs text-faint hover:text-mute"
                onClick={() => invoke("clear_db_url").then(refreshData)}
              >
                Disconnect database
              </button>
            </div>
          </main>
        </div>
      </TooltipProvider>
    </HashRouter>
  );
}
