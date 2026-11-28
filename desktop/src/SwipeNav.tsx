import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";

/*
 * Two-finger horizontal swipe on a touchpad → back / forward (Notion / browser style).
 *
 * Tauri leaves the webview's own swipe navigation off, so the gesture is read from
 * horizontal pixel-mode `wheel` events:
 *  - while swiping, the page follows the fingers (with resistance) and an arrow slides in
 *    from the edge, filling up; past the threshold it turns brand-coloured ("release to go");
 *  - lifting the fingers (no wheel events for a moment) commits: navigate, and the new page
 *    slides in from the side. Short of the threshold — or swiping back — it springs back.
 * Swipe right = back, left = forward. Sideways scrolling inside something that scrolls
 * horizontally itself (code editor, heatmap, tab strip) is left alone.
 *
 * All drag updates write styles directly (no React re-render per wheel event).
 */

const THRESHOLD = 260; // px of horizontal travel needed to arm
const RELEASE_GAP = 140; // ms without wheel events = fingers lifted
const PAGE_SHIFT = 56; // px the page moves at full travel
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

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

/** Rubber-band: follows the finger at first, then resists. 0…1 in, 0…~1 out. */
const resist = (x: number) => 1 - Math.exp(-2.2 * x);

export default function SwipeNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const navType = useNavigationType();
  const chip = useRef<HTMLDivElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const arrow = useRef<SVGSVGElement>(null);

  // Position in the history stack, and how far forward we've been (for "can go forward").
  const idx = useRef(0);
  const maxIdx = useRef(0);
  const pendingEnter = useRef<0 | 1 | -1>(0); // slide the next page in from this side
  useEffect(() => {
    const i = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    idx.current = i;
    if (navType === "PUSH" || i > maxIdx.current) maxIdx.current = i;

    const dir = pendingEnter.current;
    pendingEnter.current = 0;
    const page = document.getElementById("page");
    if (dir && page) {
      page.style.transition = "none";
      page.style.transform = "";
      page.style.opacity = "";
      page.animate(
        [
          { transform: `translateX(${dir * -PAGE_SHIFT}px)`, opacity: 0.4 },
          { transform: "translateX(0)", opacity: 1 },
        ],
        { duration: 260, easing: EASE },
      );
    }
  }, [location.key, navType]);

  useEffect(() => {
    let acc = 0; // + = back (fingers moved right)
    let active = false;
    let blocked = false;
    let timer: number | undefined;
    let frame = 0;

    const page = () => document.getElementById("page");

    /** Draw the drag state: page offset + edge chip. */
    const paint = (animate: boolean) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const back = acc >= 0;
        const raw = Math.min(Math.abs(acc) / THRESHOLD, 1.4);
        const p = resist(Math.min(raw, 1));
        const armed = raw >= 1;
        const el = page();
        const t = animate ? `transform 280ms ${EASE}, opacity 280ms ${EASE}` : "none";
        if (el) {
          el.style.transition = t;
          el.style.transform = acc === 0 ? "" : `translateX(${(back ? 1 : -1) * p * PAGE_SHIFT}px)`;
          el.style.opacity = acc === 0 ? "" : String(1 - p * 0.12);
        }
        const c = chip.current;
        if (c) {
          c.style.transition = animate ? `transform 280ms ${EASE}, opacity 200ms` : "none";
          c.style.left = back ? "12px" : "";
          c.style.right = back ? "" : "12px";
          c.style.opacity = acc === 0 ? "0" : String(Math.min(1, p * 1.6));
          c.style.transform = `translateY(-50%) translateX(${(back ? -1 : 1) * (1 - p) * 48}px) scale(${armed ? 1.08 : 0.85 + p * 0.15})`;
          c.dataset.armed = armed ? "1" : "";
        }
        if (ring.current) ring.current.style.strokeDasharray = `${Math.min(raw, 1) * 125.7} 125.7`;
        if (arrow.current) arrow.current.style.transform = back ? "" : "rotate(180deg)";
      });
    };

    const release = () => {
      const armed = Math.abs(acc) >= THRESHOLD;
      const back = acc > 0;
      acc = 0;
      active = false;
      blocked = false;
      if (armed) {
        pendingEnter.current = back ? 1 : -1;
        paint(false);
        navigate(back ? -1 : 1);
      } else {
        paint(true); // spring back
      }
    };

    const onWheel = (e: WheelEvent) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(release, RELEASE_GAP);
      if (blocked) return;

      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2;
      if (!active) {
        // Start only on a clearly horizontal touchpad scroll (pixel mode; not Shift/Ctrl+wheel).
        if (e.deltaMode !== 0 || e.shiftKey || e.ctrlKey || !horizontal) return;
        if (scrollsHorizontally(e.target as Element, e.deltaX)) {
          blocked = true;
          return;
        }
        const back = e.deltaX < 0;
        if (back ? idx.current <= 0 : idx.current >= maxIdx.current) return;
        active = true;
      }

      // Fingers right → deltaX < 0 → acc grows (back). Swiping back the other way cancels.
      const next = acc - e.deltaX;
      // Don't cross over into the other direction within one gesture.
      acc = acc === 0 || Math.sign(next) === Math.sign(acc) ? next : 0;
      paint(false);
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [navigate]);

  return (
    <div
      ref={chip}
      aria-hidden="true"
      className="group pointer-events-none fixed top-1/2 z-50 flex size-11 items-center justify-center rounded-full border border-line2 bg-pop opacity-0 shadow-lg"
      style={{ left: 12, transform: "translateY(-50%)" }}
    >
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44">
        <circle ref={ring} cx="22" cy="22" r="20" fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinecap="round" strokeDasharray="0 125.7" />
      </svg>
      <svg
        ref={arrow}
        viewBox="0 0 24 24"
        className="size-5 text-soft transition-colors group-data-[armed=1]:text-brand"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </svg>
    </div>
  );
}
