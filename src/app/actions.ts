"use server";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { patterns, problems, snippets, topics, type Difficulty, type Status } from "@/db/schema";
import { slugify } from "@/lib/slug";
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

function refresh() {
  revalidatePath("/", "layout");
}

/** solvedAt drives the heatmap: stamp it the first time a problem becomes Solved, clear it otherwise. */
function nextSolvedAt(status: Status, current: Date | null) {
  return status === "Solved" ? (current ?? new Date()) : null;
}

/** Throws unless the pattern exists and belongs to the topic (null = Unsorted is always fine). */
async function assertPatternInTopic(patternId: number | null, topicId: number) {
  if (patternId == null) return;
  const [p] = await db.select({ topicId: patterns.topicId }).from(patterns).where(eq(patterns.id, patternId));
  if (!p || p.topicId !== topicId) throw new Error("Pattern not in this topic");
}

// ── Topics ──────────────────────────────────────────────────────────────

export async function createTopic(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) return;
  const description = str(formData.get("description"));
  let slug = slugify(name) || "topic";
  const clash = await db.select({ id: topics.id }).from(topics).where(eq(topics.slug, slug)).limit(1);
  if (clash.length) slug = `${slug}-${Date.now().toString(36)}`;
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${topics.sortOrder}), -1)::int` }).from(topics);
  await db.insert(topics).values({ name, slug, description, sortOrder: max + 1 });
  refresh();
  redirect(`/topics/${slug}`);
}

export async function updateTopic(formData: FormData) {
  const id = toInt(str(formData.get("id")));
  const name = str(formData.get("name"));
  if (!id || !name) return;
  const description = str(formData.get("description"));
  await db.update(topics).set({ name, description }).where(eq(topics.id, id));
  refresh();
}

export async function deleteTopic(formData: FormData) {
  const id = toInt(str(formData.get("id")));
  if (!id) return;
  await db.delete(topics).where(eq(topics.id, id));
  refresh();
  redirect("/topics");
}

// ── Patterns ────────────────────────────────────────────────────────────

export async function createPattern(topicId: number, name: string) {
  const clean = name.trim();
  if (!Number.isInteger(topicId) || !clean) return;
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${patterns.sortOrder}), -1)::int` })
    .from(patterns)
    .where(eq(patterns.topicId, topicId));
  await db.insert(patterns).values({ topicId, name: clean, sortOrder: max + 1 });
  refresh();
}

export async function renamePattern(id: number, name: string) {
  const clean = name.trim();
  if (!Number.isInteger(id) || !clean) return;
  await db.update(patterns).set({ name: clean }).where(eq(patterns.id, id));
  refresh();
}

/** Deletes the pattern; its problems move to Unsorted (FK is ON DELETE SET NULL). */
export async function deletePattern(id: number) {
  if (!Number.isInteger(id)) return;
  await db.delete(patterns).where(eq(patterns.id, id));
  refresh();
}

/** Swap a pattern with its neighbour above (-1) or below (+1). */
export async function shiftPattern(id: number, dir: -1 | 1) {
  const [p] = await db.select().from(patterns).where(eq(patterns.id, id));
  if (!p) return;
  const list = await db
    .select({ id: patterns.id })
    .from(patterns)
    .where(eq(patterns.topicId, p.topicId))
    .orderBy(asc(patterns.sortOrder), asc(patterns.id));
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const [first, ...rest] = list.map((x, k) => db.update(patterns).set({ sortOrder: k }).where(eq(patterns.id, x.id)));
  await db.batch([first, ...rest]);
  refresh();
}

// ── Problems ────────────────────────────────────────────────────────────

export async function createProblem(formData: FormData) {
  const topicId = toInt(str(formData.get("topicId")));
  const title = str(formData.get("title"));
  if (!topicId || !title) return;
  const diff = str(formData.get("difficulty")) as Difficulty;
  const patternId = toInt(str(formData.get("patternId")));
  await assertPatternInTopic(patternId, topicId);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${problems.sortOrder}), -1)::int` })
    .from(problems)
    .where(eq(problems.topicId, topicId));
  const [row] = await db
    .insert(problems)
    .values({
      topicId,
      patternId,
      title,
      url: str(formData.get("url")),
      difficulty: DIFFS.includes(diff) ? diff : "Medium",
      lcNumber: toInt(str(formData.get("lcNumber"))),
      tags: str(formData.get("tags")).split(",").map((t) => t.trim()).filter(Boolean),
      notes: NOTES_TEMPLATE,
      sortOrder: max + 1,
    })
    .returning({ id: problems.id });
  refresh();
  redirect(`/problems/${row.id}`);
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
  timeComplexity: string;
  spaceComplexity: string;
  timeTakenMin: number | null;
};

export type SnippetInput = {
  key: string; // client-side identity, so new tabs can be matched to their new DB ids
  id: number | null; // null = not saved yet
  name: string;
  language: string;
  code: string;
};

const LANGUAGES = ["python", "java", "cpp", "javascript", "typescript", "go", "plaintext"];

/**
 * Saves the problem's fields, notes and its full list of code tabs (in tab order).
 * Tabs missing from `tabs` are deleted. Returns the DB id for every tab key.
 */
export async function updateProblem(id: number, data: ProblemUpdate, tabs: SnippetInput[]) {
  if (!Number.isInteger(id)) throw new Error("Bad id");
  if (!DIFFS.includes(data.difficulty) || !STATUSES.includes(data.status)) throw new Error("Bad value");
  const [current] = await db
    .select({ topicId: problems.topicId, solvedAt: problems.solvedAt })
    .from(problems)
    .where(eq(problems.id, id));
  if (!current) throw new Error("Not found");
  await assertPatternInTopic(data.patternId, current.topicId);

  const solvedAt = nextSolvedAt(data.status, current.solvedAt);
  const now = new Date();
  await db
    .update(problems)
    .set({
      title: data.title.trim() || "Untitled",
      url: data.url.trim(),
      lcNumber: data.lcNumber,
      difficulty: data.difficulty,
      status: data.status,
      patternId: data.patternId,
      starred: data.starred,
      tags: [...new Set(data.tags.map((t) => t.trim()).filter(Boolean))],
      notes: data.notes,
      timeComplexity: data.timeComplexity.trim(),
      spaceComplexity: data.spaceComplexity.trim(),
      timeTakenMin: data.timeTakenMin,
      solvedAt,
      updatedAt: now,
    })
    .where(eq(problems.id, id));

  // Sync code tabs: delete removed ones, update existing, insert new.
  const existing = new Set(
    (await db.select({ id: snippets.id }).from(snippets).where(eq(snippets.problemId, id))).map((s) => s.id),
  );
  const keep = new Set(tabs.map((t) => t.id).filter((x): x is number => x != null && existing.has(x)));
  const removed = [...existing].filter((x) => !keep.has(x));
  if (removed.length) await db.delete(snippets).where(and(eq(snippets.problemId, id), inArray(snippets.id, removed)));

  const ids: Record<string, number> = {};
  for (const [i, t] of tabs.entries()) {
    const values = {
      name: t.name.trim() || "untitled",
      language: LANGUAGES.includes(t.language) ? t.language : "plaintext",
      code: t.code,
      sortOrder: i,
      updatedAt: now,
    };
    if (t.id != null && keep.has(t.id)) {
      await db.update(snippets).set(values).where(eq(snippets.id, t.id));
      ids[t.key] = t.id;
    } else {
      const [row] = await db.insert(snippets).values({ ...values, problemId: id }).returning({ id: snippets.id });
      ids[t.key] = row.id;
    }
  }

  refresh();
  return { solvedAt: solvedAt?.toISOString() ?? null, ids };
}

export async function setStatus(id: number, status: Status) {
  if (!Number.isInteger(id) || !STATUSES.includes(status)) return;
  const [current] = await db.select({ solvedAt: problems.solvedAt }).from(problems).where(eq(problems.id, id));
  if (!current) return;
  await db
    .update(problems)
    .set({ status, solvedAt: nextSolvedAt(status, current.solvedAt), updatedAt: new Date() })
    .where(eq(problems.id, id));
  refresh();
}

export async function setStarred(id: number, starred: boolean) {
  if (!Number.isInteger(id)) return;
  await db.update(problems).set({ starred, updatedAt: new Date() }).where(eq(problems.id, id));
  refresh();
}

/**
 * Moves a problem into `patternId` (null = Unsorted) of its own topic, placed before
 * `beforeId` or at the end. Renumbers the target group so the order is stable.
 */
export async function moveProblem(id: number, patternId: number | null, beforeId: number | null) {
  const [p] = await db.select({ topicId: problems.topicId }).from(problems).where(eq(problems.id, id));
  if (!p) return;
  await assertPatternInTopic(patternId, p.topicId);

  const group = await db
    .select({ id: problems.id })
    .from(problems)
    .where(
      and(
        eq(problems.topicId, p.topicId),
        patternId == null ? sql`${problems.patternId} is null` : eq(problems.patternId, patternId),
      ),
    )
    .orderBy(asc(problems.sortOrder), asc(problems.id));

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
  refresh();
}

export async function deleteProblem(formData: FormData) {
  const id = toInt(str(formData.get("id")));
  const slug = str(formData.get("slug"));
  if (!id) return;
  await db.delete(problems).where(eq(problems.id, id));
  refresh();
  redirect(slug ? `/topics/${slug}` : "/topics");
}

export async function deleteProblemById(id: number) {
  if (!Number.isInteger(id)) return;
  await db.delete(problems).where(eq(problems.id, id));
  refresh();
}
