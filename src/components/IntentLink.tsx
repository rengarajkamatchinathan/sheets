"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";
import { preloadProblemEditors } from "./problem/preload";

type Props = ComponentProps<typeof Link> & {
  /** Prefetch the full page as soon as the link is visible (use for short lists). */
  eager?: boolean;
};

/**
 * A Link that fully prefetches its page on intent (hover / focus / touch), so the click
 * renders instantly from cached data. Problem links also warm the editor code.
 * Long lists use intent-only, so we don't fire a server request per visible row.
 */
export default function IntentLink({ eager, onMouseEnter, onFocus, onTouchStart, ...props }: Props) {
  const [intent, setIntent] = useState(false);
  const isProblem = typeof props.href === "string" && props.href.startsWith("/problems/");

  const warm = () => {
    if (!intent) setIntent(true);
    if (isProblem) preloadProblemEditors();
  };

  return (
    <Link
      {...props}
      prefetch={eager || intent ? true : "auto"}
      onMouseEnter={(e) => {
        warm();
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
    />
  );
}
