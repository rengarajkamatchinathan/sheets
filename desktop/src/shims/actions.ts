/*
 * Desktop stand-in for the web app's server actions (src/app/actions.ts).
 * Same names and signatures, so the shared components work unchanged. Each call goes to the
 * Rust side, which writes the local SQLite store and queues the change for sync.
 *
 * Mirrors the web app's cache behaviour:
 * - actions that use `changedAndRefresh` / `redirect` on the web → refresh the screen / navigate;
 * - autosave-style actions (`changed`) → no refresh, the screen already shows the change.
 */
import { invoke } from "@tauri-apps/api/core";
import type { LinkLookup, NewProblemInput, ProblemUpdate, TabSync } from "../../../src/app/actions";
import type { Status } from "../../../src/db/schema";
import type { FetchResult } from "../../../src/lib/leetcode";
import { cleanDescription, cleanRichText } from "../../../src/lib/sanitize";
import { refreshData } from "../data";
import { navigate } from "../nav";

export type { LinkLookup, NewProblemInput, ProblemUpdate, SnippetInput, TabSync } from "../../../src/app/actions";

function str(v: FormDataEntryValue | null) {
  return typeof v === "string" ? v.trim() : "";
}

function toInt(v: string) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/** Runs a write, then re-renders the current screen from the local store. */
async function write<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const out = await invoke<T>(cmd, args);
  refreshData();
  return out;
}

// ── Topics ──────────────────────────────────────────────────────────────

export async function createTopic(formData: FormData) {
  const slug = await write<string | null>("a_create_topic", { name: str(formData.get("name")), description: str(formData.get("description")) });
  if (slug) navigate(`/topics/${slug}`);
}

export async function updateTopic(formData: FormData) {
  const id = toInt(str(formData.get("id")));
  if (id == null) return;
  await write("a_update_topic", { id, name: str(formData.get("name")), description: str(formData.get("description")) });
}

export async function deleteTopic(formData: FormData) {
  const id = toInt(str(formData.get("id")));
  if (id == null) return;
  await write("a_delete_topic", { id });
  navigate("/topics");
}

// ── Patterns ────────────────────────────────────────────────────────────

export async function createPattern(topicId: number, name: string) {
  await write("a_create_pattern", { topicId, name });
}

export async function renamePattern(id: number, name: string) {
  await write("a_rename_pattern", { id, name });
}

export async function deletePattern(id: number) {
  await write("a_delete_pattern", { id });
}

export async function shiftPattern(id: number, dir: -1 | 1) {
  await write("a_shift_pattern", { id, dir });
}

// ── Problems ────────────────────────────────────────────────────────────

export async function lookupProblemLink(url: string): Promise<LinkLookup> {
  return invoke<LinkLookup>("a_lookup_problem_link", { url });
}

export async function createProblem(input: NewProblemInput): Promise<{ id: number }> {
  return write<{ id: number }>("a_create_problem", { input });
}

/** Autosave. Rich text is sanitized here with the web app's own rules before it's stored. */
export async function updateProblem(id: number, patch: Partial<ProblemUpdate>, tabs: TabSync) {
  const clean: Partial<ProblemUpdate> = { ...patch };
  if (clean.notes !== undefined) clean.notes = cleanRichText(clean.notes);
  if (clean.description !== undefined) clean.description = cleanDescription(clean.description);
  return invoke<{ ids: Record<string, number> }>("a_update_problem", { id, patch: clean, tabs });
}

export async function setStatus(id: number, status: Status) {
  await write("a_set_status", { id, status });
}

export async function setStarred(id: number, starred: boolean) {
  await write("a_set_starred", { id, starred });
}

/**
 * Fetches the statement from LeetCode (needs a connection) and saves it.
 * Without `force`, an existing description is kept.
 */
export async function fetchDescription(id: number, force = false): Promise<FetchResult> {
  const src = await invoke<{ url: string; description: string } | null>("a_description_source", { id });
  if (!src) return { ok: false, reason: "not-found" };
  if (!force && src.description.trim()) return { ok: true, html: src.description };

  const res = await invoke<FetchResult>("a_leetcode_content", { url: src.url });
  if (!res.ok) return res;
  const html = cleanDescription(res.html);
  await invoke("a_set_description", { id, html });
  return { ok: true, html };
}

export async function markViewed(id: number) {
  await invoke("a_mark_viewed", { id });
}

export async function moveProblem(id: number, patternId: number | null, beforeId: number | null) {
  await write("a_move_problem", { id, patternId, beforeId });
}

export async function deleteProblem(formData: FormData) {
  const id = toInt(str(formData.get("id")));
  const slug = str(formData.get("slug"));
  if (id == null) return;
  await write("a_delete_problem", { id });
  navigate(slug ? `/topics/${slug}` : "/topics");
}

export async function deleteProblemById(id: number) {
  await write("a_delete_problem", { id });
}
