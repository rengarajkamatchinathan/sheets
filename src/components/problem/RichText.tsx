"use client";

import { lazy, Suspense, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

// Tiptap (~200KB gz) is loaded only when an editable editor is actually needed.
const Editor = lazy(() => import("./NotesEditor"));

const noop = () => () => {};

/**
 * The stored HTML rendered as-is, with the editor's own styles, so it looks identical
 * to the editor. `html` must already be safe: it's sanitized on the server when loaded
 * and saved, and editor output is schema-generated.
 */
export function StaticRichText({ html, readonly, className }: { html: string; readonly?: boolean; className?: string }) {
  return (
    <div className={cn("notes-editor", readonly && "is-readonly", className)}>
      <div className="tiptap" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

type Props = {
  initial: string;
  onChange: (html: string) => void;
  editable?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
};

/**
 * Shows content instantly (server-rendered HTML), then swaps in the editor once its
 * code has loaded. Read-only views never load the editor at all.
 */
export default function RichText(props: Props) {
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  const editable = props.editable ?? true;
  const fallback = <StaticRichText html={props.initial} readonly={!editable} className={props.className} />;

  if (!editable || !isClient) return fallback;
  return (
    <Suspense fallback={fallback}>
      <Editor {...props} />
    </Suspense>
  );
}

