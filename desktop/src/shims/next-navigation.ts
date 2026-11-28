import { useMemo } from "react";
import { useLocation, useNavigate, useParams as useRouterParams, useSearchParams as useRouterSearchParams } from "react-router";
import { refreshData } from "../data";

/** next/navigation → react-router. `refresh()` re-runs the current screen's local queries. */
export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (href: string) => navigate(href),
      replace: (href: string) => navigate(href, { replace: true }),
      back: () => navigate(-1),
      forward: () => navigate(1),
      refresh: () => refreshData(),
      prefetch: () => {},
    }),
    [navigate],
  );
}

export function usePathname() {
  return useLocation().pathname;
}

export function useSearchParams() {
  return useRouterSearchParams()[0];
}

export function useParams<T extends Record<string, string>>() {
  return useRouterParams() as T;
}

/** Server-render only in Next; the desktop index.html applies the theme itself. */
export function useServerInsertedHTML(_cb: () => unknown) {
  void _cb;
}

export function notFound(): never {
  throw new Error("Not found");
}

/** Only used by server code; never called on desktop. */
export function redirect(path: string): never {
  throw new Error(`redirect(${path}) is server-only`);
}
