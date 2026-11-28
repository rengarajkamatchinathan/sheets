import { forwardRef, type AnchorHTMLAttributes } from "react";
import { Link as RouterLink } from "react-router";

type Href = string | { pathname?: string; query?: Record<string, string | number | undefined>; hash?: string };

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: Href;
  replace?: boolean;
  scroll?: boolean;
  /** Next-only; everything is local on desktop, so there's nothing to prefetch. */
  prefetch?: boolean | "auto" | null;
};

export function toPath(href: Href): string {
  if (typeof href === "string") return href;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(href.query ?? {})) if (v !== undefined) qs.set(k, String(v));
  const q = qs.toString();
  return `${href.pathname ?? ""}${q ? `?${q}` : ""}${href.hash ?? ""}`;
}

/** next/link → react-router Link. */
const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, replace, scroll, prefetch, ...rest }, ref) {
  void prefetch;
  return <RouterLink ref={ref} to={toPath(href)} replace={replace} preventScrollReset={scroll === false} {...rest} />;
});

export default Link;
