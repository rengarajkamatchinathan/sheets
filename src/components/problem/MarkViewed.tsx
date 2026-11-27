"use client";

import { useEffect } from "react";
import { markViewed } from "@/app/actions";

/** Records a view once per visit to a problem page (after it renders, not during). */
export default function MarkViewed({ id }: { id: number }) {
  useEffect(() => {
    markViewed(id).catch(() => {
      // Best-effort: a missed view only affects the "Recent" list.
    });
  }, [id]);
  return null;
}
