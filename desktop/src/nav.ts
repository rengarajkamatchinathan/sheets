/**
 * Navigation from outside React components — stands in for the server-side `redirect()`
 * the web app's actions use. App.tsx registers the router's navigate function.
 */
let navigateFn: ((to: string, opts?: { replace?: boolean }) => void) | null = null;

export function setNavigate(fn: typeof navigateFn) {
  navigateFn = fn;
}

export function navigate(to: string, opts?: { replace?: boolean }) {
  navigateFn?.(to, opts);
}
