import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Creates the default patterns for each NeetCode topic and files its problems under them
 * (matched by LeetCode number). Topics that already have patterns are left alone.
 */
export async function seedPatterns() {
  const { db } = await import("./index");
  const { patterns, problems, topics } = await import("./schema");
  const { PATTERNS } = await import("./patterns-data");
  const { and, eq, inArray, sql } = await import("drizzle-orm");

  let created = 0;
  let filed = 0;
  for (const [slug, groups] of Object.entries(PATTERNS)) {
    const [topic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.slug, slug));
    if (!topic) continue;
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(patterns)
      .where(eq(patterns.topicId, topic.id));
    if (n > 0) continue;

    for (const [i, [name, lcs]] of groups.entries()) {
      const [p] = await db.insert(patterns).values({ topicId: topic.id, name, sortOrder: i }).returning({ id: patterns.id });
      created++;
      const rows = await db
        .update(problems)
        .set({ patternId: p.id })
        .where(and(eq(problems.topicId, topic.id), inArray(problems.lcNumber, lcs)))
        .returning({ id: problems.id });
      filed += rows.length;
    }
  }
  console.log(`Created ${created} patterns, filed ${filed} problems.`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("db/seed-patterns.ts")) {
  seedPatterns().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
