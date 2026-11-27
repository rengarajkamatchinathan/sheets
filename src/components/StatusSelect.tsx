"use client";

import { useTransition } from "react";
import { setProblemStatus } from "@/app/actions";
import type { Status } from "@/db/schema";

const COLORS: Record<Status, string> = {
  Solved: "text-easy bg-[#12291a] border-[#1f4a2c]",
  Attempted: "text-medium bg-[#2b2310] border-[#4a3b14]",
  Todo: "text-mute bg-chip border-line2",
};

/** Inline status dropdown for table rows; saves on change. */
export default function StatusSelect({ id, status }: { id: number; status: Status }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Status"
      defaultValue={status}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("id", String(id));
        fd.set("status", e.target.value);
        start(() => setProblemStatus(fd));
      }}
      className={`min-h-9 cursor-pointer rounded-full border px-2.5 text-xs font-semibold focus:outline-none ${COLORS[status]} ${pending ? "opacity-60" : ""}`}
    >
      <option>Todo</option>
      <option>Attempted</option>
      <option>Solved</option>
    </select>
  );
}
