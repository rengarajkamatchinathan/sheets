"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";

/**
 * Friendly fallback for unexpected errors (e.g. a dropped database request while
 * Neon wakes up). "Try again" re-renders the page; usually that's all it needs.
 */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-white/[0.04] text-medium">
        <TriangleAlert className="size-6" />
      </span>
      <div>
        <h1 className="text-lg font-semibold">Couldn’t load this page</h1>
        <p className="mt-1 text-sm text-mute">
          Usually a brief hiccup reaching the database. Your saved work is safe.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-ink hover:bg-brand-soft"
        >
          <RotateCw className="size-4" /> Try again
        </button>
        <Link href="/" className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-mute hover:bg-white/5 hover:text-ink">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
