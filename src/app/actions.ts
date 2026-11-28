"use server";

import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { refresh, revalidateTag, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { patterns, problems, snippets, topics, type Difficulty, type Status } from "@/db/schema";
import { fetchLeetCodeDescription, fetchLeetCodeMeta, leetcodeSlug, type FetchResult } from "@/lib/leetcode";
import { cleanDescription, cleanRichText } from "@/lib/sanitize";
import { slugify } from "@/lib/slug";
import { TAGS } from "@/lib/tags";
import { NOTES_TEMPLATE } from "@/lib/template";

const DIFFS: Difficulty[] = ["Easy", "Medium", "Hard"];
const STATUSES: Status[] = ["Todo", "Attempted", "Solved"];

function str(v: FormDataEntryValue | null) {
  return typeof v === "string" ? v.trim() : "";
}

function toInt(v: string) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/*
 * Cache invalidation (see lib/tags.ts):
 * - `changed(...)`: the screen already shows the change (autosave, views) — just expire
 *   the cached data so the next visit to any affected page reads fresh data.
 * - `changedAndRefresh(...)`: expire and re-render the current page in the same response
 *   (board actions settle their optimistic UI on the fresh server data).
 */
function changed(...tags: string[]) {
  for (const t of tags) revalidateTag(t, { expire: 0 });
}

function changedAndRefresh(...tags: string[]) {
  for (const t of tags) updateTag(t);
  refresh();
}

/** SQL for solved_at: stamp it the first time a problem becomes Solved, clear it otherwise. */
const solvedAtFor = (status: Status) =>
  sql`case when ${status} = 'Solved' then coalesce(${problems.solvedAt}, now()) else null end`;

/** A pattern id is only accepted if it belongs to the problem's topic; otherwise → Unsorted. */
const patternGuard = (patternId: number | null) =>
  patternId == null
    ? sql`null`
    : sql`(select ${patterns.id} from ${patterns} where ${patterns.id} = ${patternId} and ${patterns.topicId} = ${problems.topicId})`;

type Batch = [BatchItem<"pg">, ...BatchItem<"pg">[]];

// ── Topics ──────────────────────────────────────────────────────────────

export async function createTopic(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) return;
  const description = str(formData.get("description"));
  let slug = slugify(name) || "topic";
  const clash = await db.select({ id: topics.id }).from(topics).where(eq(topics.slug, slug)).limit(1);
  if (clash.length) slug = `${slug}-${Date.now().toString(36)}`;
  const [row] = await db
    .insert(topics)
    .values({ name, slug, description, sortOrder: sql`(select coalesce(max(${topics.sortOrder}), -1) + 1 from ${topics})` })
    .returning({ id: topics.id });
  for (const t of [TAGS.stats, TAGS.topic(row.id)]) updateTag(t);
  redirect(`/topics/${slug}`);
}

export async function updateTopic(formData: FormData) {
  const id = toInt(str(formData.get("id")));
  const name = str(formData.get("name"));
  if (!id || !name) return;
  const description = str(formData.get("description"));
  await db.update(topics).set({ name, description }).where(eq(topics.id, id));
  changedAndRefresh(TAGS.stats, TAGS.views, TAGS.topic(id));
}

export async function deleteTopic(formData: FormData) {
  const id = toInt(str(formData.get("id")));
  if (!id) return;
  await db.delete(topics).where(eq(topics.id, id));
  for (const t of [TAGS.stats, TAGS.views, TAGS.topic(id)]) updateTag(t);
  redirect("/topics");
}

// ── Patterns ────────────────────────────────────────────────────────────

export async function createPattern(topicId: number, name: string) {
  const clean = name.trim();
  if (!Number.isInteger(topicId) || !clean) return;
  await db.insert(patterns).values({
    topicId,
    name: clean,
    sortOrder: sql`(select coalesce(max(${patterns.sortOrder}), -1) + 1 from ${patterns} where ${patterns.topicId} = ${topicId})`,
  });
  changedAndRefresh(TAGS.stats, TAGS.topic(topicId));
}

export async function renamePattern(id: number, name: string) {
  const clean = name.trim();
  if (!Number.isInteger(id) || !clean) return;
  const [p] = await db.update(patterns).set({ name: clean }).where(eq(patterns.id, id)).returning({ topicId: patterns.topicId });
  if (p) changedAndRefresh(TAGS.views, TAGS.stats, TAGS.topic(p.topicId));
}

/** Deletes the pattern; its problems move to Unsorted (FK is ON DELETE SET NULL). */
export async function deletePattern(id: number) {
  if (!Number.isInteger(id)) return;
  const [p] = await db.delete(patterns).where(eq(patterns.id, id)).returning({ topicId: patterns.topicId });
  if (p) changedAndRefresh(TAGS.views, TAGS.stats, TAGS.topic(p.topicId));
}

/** Swap a pattern with its neighbour above (-1) or below (+1). */
export async function shiftPattern(id: number, dir: -1 | 1) {
  const list = await db
    .select({ id: patterns.id, topicId: patterns.topicId })
    .from(patterns)
    .where(sql`${patterns.topicId} = (select ${patterns.topicId} from ${patterns} where ${patterns.id} = ${id})`)
    .orderBy(asc(patterns.sortOrder), asc(patterns.id));
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const [first, ...rest] = list.map((x, k) => db.update(patterns).set({ sortOrder: k }).where(eq(patterns.id, x.id)));
  await db.batch([first, ...rest]);
  changedAndRefresh(TAGS.stats, TAGS.topic(list[0].topicId));
}

// ── Problems ────────────────────────────────────────────────────────────

export type LinkLookup =
  | {
      ok: true;
      title: string;
      difficulty: Difficulty;
      number: number | null;
      premium: boolean;
      /** Already in the sheet (same LeetCode problem). */
      existing: { id: number; title: string; topicName: string } | null;
    }
  | { ok: false; reason: "not-leetcode" | "not-found" | "network" };

/**
 * For the "new problem" dialog: looks up a LeetCode link (number, title, difficulty)
 * and checks whether that problem is already in the sheet — in parallel.
 */
export async function lookupProblemLink(url: string): Promise<LinkLookup> {
  const slug = leetcodeSlug(url.trim());
  if (!slug) return { ok: false, reason: "not-leetcode" };
  const [meta, dupes] = await Promise.all([
    fetchLeetCodeMeta(url.trim()),
    db
      .select({ id: problems.id, title: problems.title, topicName: topics.name })
      .from(problems)
      .innerJoin(topics, eq(problems.topicId, topics.id))
      .where(sql`${problems.url} ~* ${`leetcode\\.(com|cn)/problems/${slug}(/|$|\\?)`}`)
      .limit(1),
  ]);
  if (!meta.ok) return meta;
  return {
    ok: true,
    title: meta.title,
    difficulty: meta.difficulty,
    number: meta.number,
    premium: meta.premium,
    existing: dupes[0] ?? null,
  };
}

export type NewProblemInput = {
  topicId: number;
  title: string;
  url: string;
  difficulty: Difficulty;
  lcNumber: number | null;
  /** An existing pattern of this topic, or null for Unsorted. Ignored if `newPatternName` is set. */
  patternId: number | null;
  /** Create this pattern (in the topic) and file the problem under it. */
  newPatternName?: string;
};

/**
 * Creates a problem (optionally with a brand-new pattern) and returns its id.
 * The caller decides whether to open it or keep adding; the current page refreshes.
 */
export async function createProblem(input: NewProblemInput): Promise<{ id: number }> {
  const topicId = Number(input.topicId);
  const title = input.title.trim();
  if (!Number.isInteger(topicId) || !title) throw new Error("Topic and title are required");
  const difficulty = DIFFS.includes(input.difficulty) ? input.difficulty : "Medium";

  let patternId: number | null = input.patternId;
  const newName = input.newPatternName?.trim();
  if (newName) {
    const [p] = await db
      .insert(patterns)
      .values({
        topicId,
        name: newName,
        sortOrder: sql`(select coalesce(max(${patterns.sortOrder}), -1) + 1 from ${patterns} where ${patterns.topicId} = ${topicId})`,
      })
      .returning({ id: patterns.id });
    patternId = p.id;
  }

  const [row] = await db
    .insert(problems)
    .values({
      topicId,
      // Only accept a pattern from this topic.
      patternId:
        patternId == null
          ? null
          : sql`(select ${patterns.id} from ${patterns} where ${patterns.id} = ${patternId} and ${patterns.topicId} = ${topicId})`,
      title: title.slice(0, 200),
      url: input.url.trim(),
      difficulty,
      lcNumber: Number.isInteger(input.lcNumber) ? input.lcNumber : null,
      notes: NOTES_TEMPLATE,
      sortOrder: sql`(select coalesce(max(${problems.sortOrder}), -1) + 1 from ${problems} where ${problems.topicId} = ${topicId})`,
    })
    .returning({ id: problems.id });

  changedAndRefresh(TAGS.stats, TAGS.topic(topicId));
  return { id: row.id };
}

export type ProblemUpdate = {
  title: string;
  url: string;
  lcNumber: number | null;
  difficulty: Difficulty;
  status: Status;
  patternId: number | null;
  starred: boolean;
  tags: string[];
  notes: string; // HTML from the rich-text editor
  description: string; // HTML problem statement
  timeTakenMin: number | null;
};

export type SnippetInput = {
  key: string; // client-side identity, so new tabs can be matched to their new DB ids
  id: number | null; // null = not saved yet
  name: string;
  language: string;
  code: string;
  timeComplexity: string;
  spaceComplexity: string;
};

export type TabSync = {
  /** Every tab, in order (identity only) — tabs not listed are deleted. */
  order: { key: string; id: number | null }[];
  /** Full content of tabs that are new or changed (content or position). */
  changed: SnippetInput[];
};

// Fields shown on dashboard/topic lists — changing them must refresh those caches.
const LIST_FIELDS: (keyof ProblemUpdate)[] = ["title", "status", "difficulty", "patternId", "starred"];

/**
 * Autosave: writes only what changed — the changed problem fields and the changed code
 * tabs — in ONE database round trip. Returns the DB id of every tab key.
 */
export async function updateProblem(id: number, patch: Partial<ProblemUpdate>, tabs: TabSync) {
  if (!Number.isInteger(id)) throw new Error("Bad id");
  if (patch.difficulty !== undefined && !DIFFS.includes(patch.difficulty)) throw new Error("Bad difficulty");
  if (patch.status !== undefined && !STATUSES.includes(patch.status)) throw new Error("Bad status");

  const now = new Date();
  const set: Record<string, unknown> = { updatedAt: now };
  if (patch.title !== undefined) set.title = patch.title.trim() || "Untitled";
  if (patch.url !== undefined) set.url = patch.url.trim();
  if (patch.lcNumber !== undefined) set.lcNumber = patch.lcNumber;
  if (patch.difficulty !== undefined) set.difficulty = patch.difficulty;
  if (patch.starred !== undefined) set.starred = patch.starred;
  if (patch.tags !== undefined) set.tags = [...new Set(patch.tags.map((t) => t.trim()).filter(Boolean))];
  if (patch.notes !== undefined) set.notes = cleanRichText(patch.notes);
  // Re-sanitize: the editor output is trusted-ish, but this is also reachable by direct POST.
  if (patch.description !== undefined) set.description = cleanDescription(patch.description);
  if (patch.timeTakenMin !== undefined) set.timeTakenMin = patch.timeTakenMin;
  if (patch.patternId !== undefined) set.patternId = patternGuard(patch.patternId);
  if (patch.status !== undefined) {
    set.status = patch.status;
    set.solvedAt = solvedAtFor(patch.status);
  }

  const kept = tabs.order.map((t) => t.id).filter((x): x is number => x != null);
  const position = new Map(tabs.order.map((t, i) => [t.key, i]));
  const values = (t: SnippetInput) => ({
    name: t.name.trim().slice(0, 60) || "Untitled",
    language: "java", // all snippets are Java
    code: t.code,
    timeComplexity: t.timeComplexity.trim(),
    spaceComplexity: t.spaceComplexity.trim(),
    sortOrder: position.get(t.key) ?? 0,
    updatedAt: now,
  });
  const inserts = tabs.changed.filter((t) => t.id == null && position.has(t.key));
  const updates = tabs.changed.filter((t) => t.id != null && kept.includes(t.id));

  const queries = [
    db.update(problems).set(set).where(eq(problems.id, id)).returning({ topicId: problems.topicId }),
    db
      .delete(snippets)
      .where(kept.length ? and(eq(snippets.problemId, id), notInArray(snippets.id, kept)) : eq(snippets.problemId, id)),
    ...updates.map((t) =>
      db
        .update(snippets)
        .set(values(t))
        .where(and(eq(snippets.id, t.id!), eq(snippets.problemId, id))),
    ),
    ...inserts.map((t) => db.insert(snippets).values({ ...values(t), problemId: id }).returning({ id: snippets.id })),
  ];
  const results = (await db.batch(queries as unknown as Batch)) as unknown[];

  const updated = results[0] as { topicId: number }[];
  if (!updated.length) throw new Error("Not found");

  const ids: Record<string, number> = {};
  for (const t of tabs.order) if (t.id != null) ids[t.key] = t.id;
  inserts.forEach((t, i) => {
    const rows = results[2 + updates.length + i] as { id: number }[];
    ids[t.key] = rows[0].id;
  });

  const listsChanged = LIST_FIELDS.some((f) => patch[f] !== undefined);
  changed(TAGS.problem(id), TAGS.topic(updated[0].topicId), ...(listsChanged ? [TAGS.stats, TAGS.views] : []));
  return { ids };
}

/** Board checkbox / menu: one round trip. */
export async function setStatus(id: number, status: Status) {
  if (!Number.isInteger(id) || !STATUSES.includes(status)) return;
  const [p] = await db
    .update(problems)
    .set({ status, solvedAt: solvedAtFor(status), updatedAt: new Date() })
    .where(eq(problems.id, id))
    .returning({ topicId: problems.topicId });
  if (p) changedAndRefresh(TAGS.problem(id), TAGS.topic(p.topicId), TAGS.stats, TAGS.views);
}

export async function setStarred(id: number, starred: boolean) {
  if (!Number.isInteger(id)) return;
  const [p] = await db
    .update(problems)
    .set({ starred, updatedAt: new Date() })
    .where(eq(problems.id, id))
    .returning({ topicId: problems.topicId });
  if (p) changedAndRefresh(TAGS.problem(id), TAGS.topic(p.topicId), TAGS.stats);
}

/**
 * Fetches the statement from LeetCode for a problem with a LeetCode link and saves it.
 * Without `force`, an existing description is kept (returns it unchanged).
 */
export async function fetchDescription(id: number, force = false): Promise<FetchResult> {
  if (!Number.isInteger(id)) return { ok: false, reason: "not-found" };
  const [p] = await db
    .select({ url: problems.url, description: problems.description, topicId: problems.topicId })
    .from(problems)
    .where(eq(problems.id, id));
  if (!p) return { ok: false, reason: "not-found" };
  if (!force && p.description.trim()) return { ok: true, html: p.description };

  const res = await fetchLeetCodeDescription(p.url);
  if (res.ok) {
    await db.update(problems).set({ description: res.html, updatedAt: new Date() }).where(eq(problems.id, id));
    changed(TAGS.problem(id), TAGS.topic(p.topicId));
  }
  return res;
}

/** Records that the problem page was opened (for the dashboard's "Recent" list). */
export async function markViewed(id: number) {
  if (!Number.isInteger(id)) return;
  await db.update(problems).set({ lastViewedAt: new Date() }).where(eq(problems.id, id));
  changed(TAGS.views);
}

/**
 * Moves a problem into `patternId` (null = Unsorted) of its own topic, placed before
 * `beforeId` or at the end. Renumbers the target group so the order is stable.
 */
export async function moveProblem(id: number, patternId: number | null, beforeId: number | null) {
  const topicOf = sql`(select ${problems.topicId} from ${problems} where ${problems.id} = ${id})`;
  const [[p], target, group] = await db.batch([
    db.select({ topicId: problems.topicId }).from(problems).where(eq(problems.id, id)),
    db
      .select({ id: patterns.id })
      .from(patterns)
      .where(sql`${patterns.id} = ${patternId ?? -1} and ${patterns.topicId} = ${topicOf}`),
    db
      .select({ id: problems.id })
      .from(problems)
      .where(
        and(
          sql`${problems.topicId} = ${topicOf}`,
          patternId == null ? sql`${problems.patternId} is null` : eq(problems.patternId, patternId),
        ),
      )
      .orderBy(asc(problems.sortOrder), asc(problems.id)),
  ]);
  if (!p) return;
  if (patternId != null && !target.length) throw new Error("Pattern not in this topic");

  const ids = group.map((g) => g.id).filter((x) => x !== id);
  const at = beforeId == null ? -1 : ids.indexOf(beforeId);
  ids.splice(at === -1 ? ids.length : at, 0, id);

  const [first, ...rest] = ids.map((pid, k) =>
    db
      .update(problems)
      .set(pid === id ? { patternId, sortOrder: k } : { sortOrder: k })
      .where(eq(problems.id, pid)),
  );
  await db.batch([first, ...rest]);
  changedAndRefresh(TAGS.problem(id), TAGS.topic(p.topicId), TAGS.views);
}

export async function deleteProblem(formData: FormData) {
  const id = toInt(str(formData.get("id")));
  const slug = str(formData.get("slug"));
  if (!id) return;
  const [p] = await db.delete(problems).where(eq(problems.id, id)).returning({ topicId: problems.topicId });
  if (p) for (const t of [TAGS.problem(id), TAGS.topic(p.topicId), TAGS.stats, TAGS.views]) updateTag(t);
  redirect(slug ? `/topics/${slug}` : "/topics");
}

export async function deleteProblemById(id: number) {
  if (!Number.isInteger(id)) return;
  const [p] = await db.delete(problems).where(eq(problems.id, id)).returning({ topicId: problems.topicId });
  if (p) changedAndRefresh(TAGS.problem(id), TAGS.topic(p.topicId), TAGS.stats, TAGS.views);
}

