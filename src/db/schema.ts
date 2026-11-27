import {
  pgTable,
  pgEnum,
  serial,
  boolean,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const difficultyEnum = pgEnum("difficulty", ["Easy", "Medium", "Hard"]);
export const statusEnum = pgEnum("status", ["Todo", "Attempted", "Solved"]);

export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A pattern (sub-topic) groups problems inside a topic, e.g. Sliding Window → Variable-size window. */
export const patterns = pgTable(
  "patterns",
  {
    id: serial("id").primaryKey(),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("patterns_topic_idx").on(t.topicId)],
);

export const problems = pgTable(
  "problems",
  {
    id: serial("id").primaryKey(),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    // null = "Unsorted" within the topic; deleting a pattern keeps its problems.
    patternId: integer("pattern_id").references(() => patterns.id, { onDelete: "set null" }),
    starred: boolean("starred").notNull().default(false),
    title: text("title").notNull(),
    url: text("url").notNull().default(""),
    lcNumber: integer("lc_number"),
    difficulty: difficultyEnum("difficulty").notNull().default("Medium"),
    status: statusEnum("status").notNull().default("Todo"),
    tags: text("tags").array().notNull().default([]),
    notes: text("notes").notNull().default(""),
    // Problem statement (sanitized HTML) — fetched from LeetCode or pasted.
    description: text("description").notNull().default(""),
    timeTakenMin: integer("time_taken_min"),
    sortOrder: integer("sort_order").notNull().default(0),
    solvedAt: timestamp("solved_at", { withTimezone: true }),
    // Set each time the problem page is opened; drives the dashboard's "Recent" list.
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("problems_topic_idx").on(t.topicId),
    index("problems_pattern_idx").on(t.patternId),
    index("problems_solved_idx").on(t.solvedAt),
  ],
);

/** One code tab on a problem page (a problem can have several solutions/variants). */
export const snippets = pgTable(
  "snippets",
  {
    id: serial("id").primaryKey(),
    problemId: integer("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    language: text("language").notNull().default("python"),
    code: text("code").notNull().default(""),
    timeComplexity: text("time_complexity").notNull().default(""),
    spaceComplexity: text("space_complexity").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("snippets_problem_idx").on(t.problemId)],
);

export type Topic = typeof topics.$inferSelect;
export type Snippet = typeof snippets.$inferSelect;
export type Pattern = typeof patterns.$inferSelect;
export type Problem = typeof problems.$inferSelect;
export type Difficulty = (typeof difficultyEnum.enumValues)[number];
export type Status = (typeof statusEnum.enumValues)[number];
