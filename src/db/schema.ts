import {
  pgTable,
  pgEnum,
  serial,
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

export const problems = pgTable(
  "problems",
  {
    id: serial("id").primaryKey(),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull().default(""),
    lcNumber: integer("lc_number"),
    difficulty: difficultyEnum("difficulty").notNull().default("Medium"),
    status: statusEnum("status").notNull().default("Todo"),
    tags: text("tags").array().notNull().default([]),
    notes: text("notes").notNull().default(""),
    code: text("code").notNull().default(""),
    language: text("language").notNull().default("python"),
    timeComplexity: text("time_complexity").notNull().default(""),
    spaceComplexity: text("space_complexity").notNull().default(""),
    timeTakenMin: integer("time_taken_min"),
    sortOrder: integer("sort_order").notNull().default(0),
    solvedAt: timestamp("solved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("problems_topic_idx").on(t.topicId), index("problems_solved_idx").on(t.solvedAt)],
);

export type Topic = typeof topics.$inferSelect;
export type Problem = typeof problems.$inferSelect;
export type Difficulty = (typeof difficultyEnum.enumValues)[number];
export type Status = (typeof statusEnum.enumValues)[number];
