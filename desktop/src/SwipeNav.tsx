import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Two-finger horizontal swipe on a touchpad → back / forward, like a browser.
 *
 * The webview's own swipe navigation is off in Tauri, so this reads the gesture from
 * `wheel` events (a touchpad swipe arrives as horizontal pixel-mode wheel deltas): swipe
 * right = back, left = forward. An arrow at the window edge fills up as you swipe and
 * the page changes once it's full. Sideways scrolling inside something that scrolls
 * horizontally itself (code editor, heatmap, tab strip) is left alone.
 */

const THRESHOLD = 140; // px of horizontal travel to trigger
const GESTURE_GAP = 180; // ms without wheel events = the gesture (and its momentum) ended

/** Can `el` or an ancestor scroll further horizontally in this direction? */
function scrollsHorizontally(el: Element | null, dx: number): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth <= n.clientWidth + 1) continue;
    const ox = getComputedStyle(n).overflowX;
    if (ox !== "auto" && ox !== "scroll") continue;
    if (dx < 0 && n.scrollLeft > 0) return true;
    if (dx > 0 && n.scrollLeft + n.clientWidth < n.scrollWidth - 1) return true;
  }
  return false;
}

export default function SwipeNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const navType = useNavigationType();

  // Where we are in the history stack, and how far forward we've been (for "can go forward").
  const idx = useRef(0);
  const maxIdx = useRef(0);
  useEffect(() => {
    const i = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    idx.current = i;
    if (navType === "PUSH" || i > maxIdx.current) maxIdx.current = i;
  }, [location.key, navType]);

  const [progress, setProgress] = useState(0); // -1 … 1 (negative = back)

  useEffect(() => {
    let acc = 0;
    let fired = false; // one navigation per gesture
    let blocked = false; // this gesture started inside a horizontal scroller
    let timer: number | undefined;

    const end = () => {
      acc = 0;
      fired = false;
      blocked = false;
      setProgress(0);
    };

    const onWheel = (e: WheelEvent) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(end, GESTURE_GAP);
      if (fired || blocked) return;

      // Touchpad swipes are pixel-mode and mostly horizontal; Shift+wheel is a mouse.
      if (e.deltaMode !== 0 || e.shiftKey || e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) {
        if (acc !== 0 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) end();
        return;
      }
      if (acc === 0 && scrollsHorizontally(e.target as Element, e.deltaX)) {
        blocked = true;
        return;
      }

      acc -= e.deltaX; // fingers right → deltaX < 0 → acc > 0 → back
      const back = acc > 0;
      const possible = back ? idx.current > 0 : idx.current < maxIdx.current;
      if (!possible) {
        acc = 0;
        return;
      }
      const p = Math.min(1, Math.abs(acc) / THRESHOLD);
      setProgress(back ? -p : p);
      if (p >= 1) {
        fired = true;
        setProgress(0);
        navigate(back ? -1 : 1);
      }
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.clearTimeout(timer);
    };
  }, [navigate]);

  if (progress === 0) return null;
  const back = progress < 0;
  const p = Math.abs(progress);
  const Icon = back ? ArrowLeft : ArrowRight;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed top-1/2 z-50 flex size-11 items-center justify-center rounded-full border border-line2 bg-pop shadow-lg",
        back ? "left-2" : "right-2",
      )}
      style={{ opacity: 0.35 + p * 0.65, transform: `translateY(-50%) translateX(${(back ? -1 : 1) * (1 - p) * 24}px) scale(${0.8 + p * 0.2})` }}
    >
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="20" fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeDasharray={`${p * 125.7} 125.7`} />
      </svg>
      <Icon className={cn("size-5", p >= 1 ? "text-brand" : "text-soft")} />
    </div>
  );
}
