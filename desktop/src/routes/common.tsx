import { Loader2 } from "lucide-react";
import Link from "next/link";

/** While a screen's local query runs (usually a few ms, so the spinner fades in late). */
export function Loading({ error }: { error?: string | null }) {
  if (error) return <p className="text-sm text-hard">Couldn't load this page: {error}</p>;
  return (
    <div className="flex justify-center py-16 opacity-0 animate-in fade-in fill-mode-forwards delay-300">
      <Loader2 className="size-5 animate-spin text-mute" />
    </div>
  );
}

export function NotFound({ what = "page" }: { what?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-xl font-semibold">This {what} doesn't exist</h1>
      <p className="text-sm text-mute">It may have been deleted, here or on the web.</p>
      <Link href="/topics" className="text-sm text-brand-soft hover:underline">
        Back to topics
      </Link>
    </div>
  );
}
