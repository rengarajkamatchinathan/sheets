/**
 * One-off migration for the problem page redesign:
 *  1. problems.code/language → a first row in `snippets` (only when code is non-empty).
 *  2. problems.notes markdown → HTML for the rich-text editor (skips notes that are already HTML).
 * Safe to re-run: problems that already have snippets are skipped, HTML notes are left alone.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { marked } from "marked";

const FILE: Record<string, string> = {
  python: "solution.py",
  java: "Solution.java",
  cpp: "solution.cpp",
  javascript: "solution.js",
  typescript: "solution.ts",
  go: "solution.go",
};

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  const withCode = await sql`
    select p.id, p.code, p.language from problems p
    where length(trim(p.code)) > 0
      and not exists (select 1 from snippets s where s.problem_id = p.id)`;
  for (const r of withCode) {
    await sql`insert into snippets (problem_id, name, language, code, sort_order)
              values (${r.id}, ${FILE[r.language] ?? "solution.txt"}, ${r.language}, ${r.code}, 0)`;
  }
  console.log(`Copied code into snippets for ${withCode.length} problems.`);

  const notes = await sql`select id, notes from problems where length(trim(notes)) > 0 and left(ltrim(notes), 1) <> '<'`;
  for (const r of notes) {
    const html = (await marked.parse(r.notes, { gfm: true })).trim();
    await sql`update problems set notes = ${html} where id = ${r.id}`;
  }
  console.log(`Converted ${notes.length} markdown notes to HTML.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
