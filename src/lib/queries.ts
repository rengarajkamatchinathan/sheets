import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { patterns, problems, snippets, topics } from "@/db/schema";
import { TZ } from "./dates";
import { cleanDescription, cleanRichText } from "./sanitize";
import { CACHE_FOREVER, TAGS } from "./tags";

/*
 * Performance notes
 * - Every page loader sends its queries to Neon as ONE batched HTTP request
 *   (`db.batch`), instead of several round trips (~150ms each from India → Singapore).
 * - Loaders are cached with "use cache" and tagged (see ./tags); server actions expire
 *   the tags they affect, so pages are served from memory until something changes.
 */

// ── Query builders (not executed until batched) ────────────────────────────

const topicStatsQ = () =>
  db
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
      patterns: sql<number>`(select count(*) from ${patterns} where ${patterns.topicId} = ${topics.id})::int`,
    })
    .from(topics)
    .leftJoin(problems, eq(problems.topicId, topics.id))
    .groupBy(topics.id)
    .orderBy(asc(topics.sortOrder), asc(topics.id));

const difficultyQ = () =>
  db
    .select({
      difficulty: problems.difficulty,
      total: sql<number>`count(*)::int`,
      solved: sql<number>`count(*) filter (where ${problems.status} = 'Solved')::int`,
      attempted: sql<number>`count(*) filter (where ${problems.status} = 'Attempted')::int`,
    })
    .from(problems)
    .groupBy(problems.difficulty);

const solvedPerDayQ = () =>
  db
    .select({
      day: sql<string>`to_char(${problems.solvedAt} at time zone ${TZ}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(problems)
    .where(isNotNull(problems.solvedAt))
    .groupBy(sql`1`); // by position: the tz is a bind param, so a repeated expression wouldn't match

const problemCard = {
  id: problems.id,
  title: problems.title,
  difficulty: problems.difficulty,
  status: problems.status,
  topicName: topics.name,
  topicSlug: topics.slug,
  patternName: patterns.name,
};

const cardsQ = () =>
  db.select(problemCard).from(problems).innerJoin(topics, eq(problems.topicId, topics.id)).leftJoin(patterns, eq(problems.patternId, patterns.id));

// "Has notes" computed in SQL so the board never downloads full notes.
// An untouched legacy template (headings only) counts as empty.
const hasNotesSql = sql<boolean>`regexp_replace(regexp_replace(${problems.notes}, '<[^>]*>', '', 'g'), '(\\s|&nbsp;)+', '', 'g') not in ('', 'IntuitionApproachEdgecasesMistakes')`;

// ── Types ───────────────────────────────────────────────────────────────────

export type TopicStat = Awaited<ReturnType<typeof topicStatsQ>>[number];

export type BoardProblem = {
  id: number;
  title: string;
  url: string;
  lcNumber: number | null;
  difficulty: "Easy" | "Medium" | "Hard";
  status: "Todo" | "Attempted" | "Solved";
  starred: boolean;
  patternId: number | null;
  tags: string[];
  hasNotes: boolean;
  hasCode: boolean;
  hasDescription: boolean;
};

// ── Cached page loaders ─────────────────────────────────────────────────────

/** Dashboard: everything in one round trip. */
export async function loadDashboard() {
  "use cache";
  cacheLife(CACHE_FOREVER);
  cacheTag(TAGS.stats, TAGS.views);

  const [topicStats, diffRows, perDay, inProgress, nextTodo, starred, recent] = await db.batch([
    topicStatsQ(),
    difficultyQ(),
    solvedPerDayQ(),
    cardsQ().where(eq(problems.status, "Attempted")).orderBy(desc(problems.updatedAt)).limit(4),
    cardsQ()
      .where(eq(problems.status, "Todo"))
      .orderBy(asc(topics.sortOrder), asc(topics.id), sql`${patterns.sortOrder} asc nulls last`, asc(problems.sortOrder), asc(problems.id))
      .limit(1),
    cardsQ().where(eq(problems.starred, true)).orderBy(desc(problems.updatedAt)).limit(5),
    db
      .select({ ...problemCard, lastViewedAt: problems.lastViewedAt })
      .from(problems)
      .innerJoin(topics, eq(problems.topicId, topics.id))
      .leftJoin(patterns, eq(problems.patternId, patterns.id))
      .where(isNotNull(problems.lastViewedAt))
      .orderBy(desc(problems.lastViewedAt))
      .limit(6),
  ]);

  const by = Object.fromEntries(diffRows.map((r) => [r.difficulty, r]));
  const difficulty = (["Easy", "Medium", "Hard"] as const).map((d) => ({
    difficulty: d,
    total: by[d]?.total ?? 0,
    solved: by[d]?.solved ?? 0,
    attempted: by[d]?.attempted ?? 0,
  }));

  return {
    topics: topicStats,
    difficulty,
    perDay: perDay.map((r) => [r.day, r.count] as [string, number]),
    inProgress,
    nextTodo: nextTodo[0] ?? null,
    starred,
    recent,
  };
}

/** Topics list (also used by the new-problem form). */
export async function loadTopics() {
  "use cache";
  cacheLife(CACHE_FOREVER);
  cacheTag(TAGS.stats);
  return topicStatsQ();
}

export type TopicChoice = { id: number; name: string; slug: string; patterns: { id: number; name: string }[] };

/** Every topic with its patterns (for the "new problem" dialog's pickers). */
export async function loadTopicChoices(): Promise<TopicChoice[]> {
  "use cache";
  cacheLife(CACHE_FOREVER);
  cacheTag(TAGS.stats);
  const [ts, ps] = await db.batch([
    db.select({ id: topics.id, name: topics.name, slug: topics.slug }).from(topics).orderBy(asc(topics.sortOrder), asc(topics.id)),
    db
      .select({ id: patterns.id, name: patterns.name, topicId: patterns.topicId })
      .from(patterns)
      .orderBy(asc(patterns.sortOrder), asc(patterns.id)),
  ]);
  return ts.map((t) => ({ ...t, patterns: ps.filter((p) => p.topicId === t.id).map(({ id, name }) => ({ id, name })) }));
}

/** Topic page: topic + patterns + board in one round trip (all keyed by slug). */
export async function loadTopicPage(slug: string) {
  "use cache";
  cacheLife(CACHE_FOREVER);

  const topicId = sql`(select ${topics.id} from ${topics} where ${topics.slug} = ${slug})`;
  const [topicRows, pats, rows] = await db.batch([
    db.select().from(topics).where(eq(topics.slug, slug)).limit(1),
    db
      .select({ id: patterns.id, name: patterns.name })
      .from(patterns)
      .where(sql`${patterns.topicId} = ${topicId}`)
      .orderBy(asc(patterns.sortOrder), asc(patterns.id)),
    db
      .select({
        id: problems.id,
        title: problems.title,
        url: problems.url,
        lcNumber: problems.lcNumber,
        difficulty: problems.difficulty,
        status: problems.status,
        starred: problems.starred,
        patternId: problems.patternId,
        tags: problems.tags,
        hasNotes: hasNotesSql,
        hasCode: sql<boolean>`exists (select 1 from ${snippets} where ${snippets.problemId} = ${problems.id} and length(trim(${snippets.code})) > 0)`,
        hasDescription: sql<boolean>`length(trim(${problems.description})) > 0`,
      })
      .from(problems)
      .where(sql`${problems.topicId} = ${topicId}`)
      .orderBy(asc(problems.sortOrder), asc(problems.id)),
  ]);

  const topic = topicRows[0] ?? null;
  if (topic) cacheTag(TAGS.topic(topic.id));
  return { topic, patterns: pats, problems: rows as BoardProblem[] };
}

/** Problem page: problem + topic + pattern name + topic's patterns + snippets in one round trip. */
export async function loadProblemPage(id: number) {
  "use cache";
  cacheLife(CACHE_FOREVER);
  cacheTag(TAGS.problem(id));

  const topicOfProblem = sql`(select ${problems.topicId} from ${problems} where ${problems.id} = ${id})`;
  const [rows, pats, snips] = await db.batch([
    db
      .select({
        problem: problems,
        topic: { id: topics.id, name: topics.name, slug: topics.slug },
        patternName: patterns.name,
      })
      .from(problems)
      .innerJoin(topics, eq(problems.topicId, topics.id))
      .leftJoin(patterns, eq(problems.patternId, patterns.id))
      .where(eq(problems.id, id))
      .limit(1),
    db
      .select({ id: patterns.id, name: patterns.name })
      .from(patterns)
      .where(sql`${patterns.topicId} = ${topicOfProblem}`)
      .orderBy(asc(patterns.sortOrder), asc(patterns.id)),
    db
      .select({
        id: snippets.id,
        name: snippets.name,
        language: snippets.language,
        code: snippets.code,
        timeComplexity: snippets.timeComplexity,
        spaceComplexity: snippets.spaceComplexity,
      })
      .from(snippets)
      .where(eq(snippets.problemId, id))
      .orderBy(asc(snippets.sortOrder), asc(snippets.id)),
  ]);

  const row = rows[0] ?? null;
  if (row) cacheTag(TAGS.topic(row.topic.id)); // pattern renames/moves affect this page too
  if (!row) return null;
  // Sanitized here so the page can show notes/description as static HTML before the editor loads.
  const problem = { ...row.problem, notes: cleanRichText(row.problem.notes), description: cleanDescription(row.problem.description) };
  return { ...row, problem, patterns: pats, snippets: snips };
}

// ── Uncached (rare, input-dependent) ────────────────────────────────────────

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
