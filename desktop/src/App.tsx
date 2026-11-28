import { useEffect, useRef, type RefObject } from "react";
import { HashRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { Download, Loader2, RotateCw } from "lucide-react";
import Sidebar, { type SidebarAction } from "@/components/Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCommand, refreshData } from "./data";
import { setNavigate } from "./nav";
import { useSyncStatus } from "./sync";
import SyncBadge from "./SyncBadge";
import SwipeNav from "./SwipeNav";
import { useAppUpdate, type UpdateState } from "./update";
import Setup from "./routes/Setup";
import Dashboard from "./routes/Dashboard";
import TopicsPage from "./routes/Topics";
import TopicPage from "./routes/Topic";
import ProblemPage from "./routes/Problem";
import NewProblemPage from "./routes/NewProblem";
import { NotFound } from "./routes/common";

type Config = { hasDbUrl: boolean };

/** Same shell as the web app's root layout: sidebar + main column. */
export default function App() {
  const config = useCommand<Config>("get_config");
  const sync = useSyncStatus();
  const mainRef = useRef<HTMLElement>(null);
  const update = useAppUpdate();

  if (!config.data) return null;
  if (!config.data.hasDbUrl) return <Setup onDone={refreshData} />;
  if (sync && !sync.hasSnapshot) return <FirstDownload offline={sync.state === "offline"} error={sync.state === "error" ? sync.message : null} />;

  return (
    <HashRouter>
      <RegisterNavigate />
      <SwipeNav />
      <TooltipProvider delayDuration={300}>
        {/* One screen tall; only <main> scrolls, so the sidebar never moves. */}
        <div className="flex h-full flex-col overflow-hidden md:flex-row">
          <Sidebar actions={updateActions(update.state, update.install)} />
          <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto px-5 py-6 md:px-10 md:py-8">
            <ScrollToTop target={mainRef} />
            {/* #page: moved by the swipe-navigation gesture (SwipeNav). */}
            <div id="page" className="mx-auto w-full">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/topics" element={<TopicsPage />} />
                <Route path="/topics/:slug" element={<TopicPage />} />
                <Route path="/problems/new" element={<NewProblemPage />} />
                <Route path="/problems/:id" element={<ProblemPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
          </main>
        </div>
        <SyncBadge status={sync} />
      </TooltipProvider>
    </HashRouter>
  );
}

/** "Update" button above the sidebar's theme toggle, only when a newer version exists. */
function updateActions(state: UpdateState, install: () => void): SidebarAction[] {
  switch (state.kind) {
    case "available":
      return [{ key: "update", label: `Update to v${state.version}`, Icon: Download, onClick: install, highlight: true }];
    case "installing":
      return [
        {
          key: "update",
          label: state.percent == null ? "Updating…" : `Updating… ${state.percent}%`,
          Icon: (p) => <Loader2 {...p} className={`${p.className ?? ""} animate-spin`} />,
          onClick: () => {},
          highlight: true,
          disabled: true,
        },
      ];
    case "error":
      return [{ key: "update", label: "Update failed: retry", Icon: RotateCw, onClick: install, highlight: true }];
    default:
      return [];
  }
}

/** New page → start at the top (the window used to do this; now <main> is the scroller). */
function ScrollToTop({ target }: { target: RefObject<HTMLElement | null> }) {
  const { pathname } = useLocation();
  useEffect(() => {
    target.current?.scrollTo(0, 0);
  }, [pathname, target]);
  return null;
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
