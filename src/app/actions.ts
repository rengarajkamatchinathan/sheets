"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { problems, topics, type Difficulty, type Status } from "@/db/schema";
import { slugify } from "@/lib/slug";

const DIFFS: Difficulty[] = ["Easy", "Medium", "Hard"];
const STATUSES: Status[] = ["Todo", "Attempted", "Solved"];

const NOTES_TEMPLATE = `## Intuition


## Approach
1.

## Edge cases
-

## Mistakes
-
`;

function str(v: FormDataEntryValue | null) {
  return typeof v === "string" ? v.trim() : "";
}

function toInt(v: string) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export async function createTopic(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) return;
  const description = str(formData.get("description"));
  let slug = slugify(name) || "topic";
  const clash = await db.select({ id: topics.id }).from(topics).where(eq(topics.slug, slug)).limit(1);
  if (clash.length) slug = `${slug}-${Date.now().toString(36)}`;
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${topics.sortOrder}), -1)::int` }).from(topics);
  await db.insert(topics).values({ name, slug, description, sortOrder: max + 1 });
  revalidatePath("/", "layout");
  redirect(`/topics/${slug}`);
}

export async function updateTopic(formData: FormData) {
  const id = toInt(str(formData.get("id")));
  const name = str(formData.get("name"));
  if (!id || !name) return;
  const description = str(formData.get("description"));
  await db.update(topics).set({ name, description }).where(eq(topics.id, id));
  revalidatePath("/", "layout");
}

export async function deleteTopic(formData: FormData) {
  const id = toInt(str(formData.get("id")));
  if (!id) return;
  await db.delete(topics).where(eq(topics.id, id));
  revalidatePath("/", "layout");
  redirect("/topics");
}

export async function createProblem(formData: FormData) {
  const topicId = toInt(str(formData.get("topicId")));
  const title = str(formData.get("title"));
  if (!topicId || !title) return;
  const difficulty = DIFFS.includes(str(formData.get("difficulty")) as Difficulty)
    ? (str(formData.get("difficulty")) as Difficulty)
    : "Medium";
  const url = str(formData.get("url"));
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${problems.sortOrder}), -1)::int` })
    .from(problems)
    .where(eq(problems.topicId, topicId));
  const [row] = await db
    .insert(problems)
    .values({
      topicId,
      title,
      url,
      difficulty,
      lcNumber: toInt(str(formData.get("lcNumber"))),
      tags: str(formData.get("tags")).split(",").map((t) => t.trim()).filter(Boolean),
      notes: NOTES_TEMPLATE,
      sortOrder: max + 1,
    })
    .returning({ id: problems.id });
  revalidatePath("/", "layout");
  redirect(`/problems/${row.id}`);
}

export type ProblemUpdate = {
  title: string;
  url: string;
  lcNumber: number | null;
  difficulty: Difficulty;
  status: Status;
  tags: string[];
  notes: string;
  code: string;
  language: string;
  timeComplexity: string;
  spaceComplexity: string;
  timeTakenMin: number | null;
};

export async function updateProblem(id: number, data: ProblemUpdate) {
  if (!Number.isInteger(id)) throw new Error("Bad id");
  if (!DIFFS.includes(data.difficulty) || !STATUSES.includes(data.status)) throw new Error("Bad value");
  const [current] = await db.select({ status: problems.status, solvedAt: problems.solvedAt }).from(problems).where(eq(problems.id, id));
  if (!current) throw new Error("Not found");

  // solvedAt drives the heatmap and streak: stamp it the first time a problem becomes Solved.
  let solvedAt = current.solvedAt;
  if (data.status === "Solved" && !solvedAt) solvedAt = new Date();
  if (data.status !== "Solved") solvedAt = null;

  await db
    .update(problems)
    .set({
      title: data.title.trim() || "Untitled",
      url: data.url.trim(),
      lcNumber: data.lcNumber,
      difficulty: data.difficulty,
      status: data.status,
      tags: data.tags.map((t) => t.trim()).filter(Boolean),
      notes: data.notes,
      code: data.code,
      language: data.language,
      timeComplexity: data.timeComplexity.trim(),
      spaceComplexity: data.spaceComplexity.trim(),
      timeTakenMin: data.timeTakenMin,
      solvedAt,
      updatedAt: new Date(),
    })
    .where(eq(problems.id, id));
  revalidatePath("/", "layout");
  return { solvedAt: solvedAt?.toISOString() ?? null };
}

export async function setProblemStatus(formData: FormData) {
  const id = toInt(str(formData.get("id")));
  const status = str(formData.get("status")) as Status;
  if (!id || !STATUSES.includes(status)) return;
  const [current] = await db.select({ solvedAt: problems.solvedAt }).from(problems).where(eq(problems.id, id));
  if (!current) return;
  const solvedAt = status === "Solved" ? (current.solvedAt ?? new Date()) : null;
  await db.update(problems).set({ status, solvedAt, updatedAt: new Date() }).where(eq(problems.id, id));
  revalidatePath("/", "layout");
}

export async function deleteProblem(formData: FormData) {
  const id = toInt(str(formData.get("id")));
  const slug = str(formData.get("slug"));
  if (!id) return;
  await db.delete(problems).where(eq(problems.id, id));
  revalidatePath("/", "layout");
  redirect(slug ? `/topics/${slug}` : "/topics");
}
