import "server-only";
import { asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { problems, topics } from "@/db/schema";
import { TZ } from "./dates";

export type TopicStat = {
  id: number;
  name: string;
  slug: string;
  description: string;
  total: number;
  solved: number;
  easy: number;
  medium: number;
  hard: number;
};

export async function getTopicStats(): Promise<TopicStat[]> {
  const rows = await db
    .select({
      id: topics.id,
      name: topics.name,
      slug: topics.slug,
      description: topics.description,
      total: sql<number>`count(${problems.id})::int`,
      solved: sql<number>`count(*) filter (where ${problems.status} = 'Solved')::int`,
      easy: sql<number>`count(*) filter (where ${problems.difficulty} = 'Easy')::int`,
      medium: sql<number>`count(*) filter (where ${problems.difficulty} = 'Medium')::int`,
      hard: sql<number>`count(*) filter (where ${problems.difficulty} = 'Hard')::int`,
    })
    .from(topics)
    .leftJoin(problems, eq(problems.topicId, topics.id))
    .groupBy(topics.id)
    .orderBy(asc(topics.sortOrder), asc(topics.id));
  return rows;
}

export async function getDifficultyStats() {
  const rows = await db
    .select({
      difficulty: problems.difficulty,
      total: sql<number>`count(*)::int`,
      solved: sql<number>`count(*) filter (where ${problems.status} = 'Solved')::int`,
      attempted: sql<number>`count(*) filter (where ${problems.status} = 'Attempted')::int`,
    })
    .from(problems)
    .groupBy(problems.difficulty);
  const by = Object.fromEntries(rows.map((r) => [r.difficulty, r]));
  return (["Easy", "Medium", "Hard"] as const).map((d) => ({
    difficulty: d,
    total: by[d]?.total ?? 0,
    solved: by[d]?.solved ?? 0,
    attempted: by[d]?.attempted ?? 0,
  }));
}

/** Map of YYYY-MM-DD (in APP_TIMEZONE) → number of problems solved that day. */
export async function getSolvedPerDay(): Promise<Map<string, number>> {
  const day = sql<string>`to_char(${problems.solvedAt} at time zone ${TZ}, 'YYYY-MM-DD')`;
  const rows = await db
    .select({ day, count: sql<number>`count(*)::int` })
    .from(problems)
    .where(isNotNull(problems.solvedAt))
    .groupBy(sql`1`); // by position: the tz is a bind param, so a repeated expression wouldn't match
  return new Map(rows.map((r) => [r.day, r.count]));
}

export async function getRecentSolved(limit = 6) {
  return db
    .select({
      id: problems.id,
      title: problems.title,
      difficulty: problems.difficulty,
      solvedAt: problems.solvedAt,
      topicName: topics.name,
    })
    .from(problems)
    .innerJoin(topics, eq(problems.topicId, topics.id))
    .where(isNotNull(problems.solvedAt))
    .orderBy(desc(problems.solvedAt))
    .limit(limit);
}

export async function getTopicBySlug(slug: string) {
  const [t] = await db.select().from(topics).where(eq(topics.slug, slug)).limit(1);
  return t ?? null;
}

export async function getProblemsForTopic(topicId: number) {
  return db
    .select()
    .from(problems)
    .where(eq(problems.topicId, topicId))
    .orderBy(asc(problems.sortOrder), asc(problems.id));
}

export async function getProblem(id: number) {
  const [row] = await db
    .select({ problem: problems, topic: { id: topics.id, name: topics.name, slug: topics.slug } })
    .from(problems)
    .innerJoin(topics, eq(problems.topicId, topics.id))
    .where(eq(problems.id, id))
    .limit(1);
  return row ?? null;
}

export async function searchProblems(q: string, limit = 30) {
  return db
    .select({
      id: problems.id,
      title: problems.title,
      difficulty: problems.difficulty,
      status: problems.status,
      tags: problems.tags,
      topicName: topics.name,
    })
    .from(problems)
    .innerJoin(topics, eq(problems.topicId, topics.id))
    .where(
      sql`(${problems.title} ilike ${"%" + q + "%"} or exists (select 1 from unnest(${problems.tags}) t where t ilike ${"%" + q + "%"}))`,
    )
    .orderBy(asc(problems.title))
    .limit(limit);
}

export async function getAllTopics() {
  return db.select({ id: topics.id, name: topics.name, slug: topics.slug }).from(topics).orderBy(asc(topics.sortOrder), asc(topics.id));
}
