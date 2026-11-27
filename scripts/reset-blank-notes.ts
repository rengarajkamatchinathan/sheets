// Replaces untouched (blank-template) notes with the current HTML template. Notes with real content are left alone.
import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { NOTES_TEMPLATE, hasRealNotes } from "../src/lib/template";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`select id, notes from problems`;
  const blank = rows.filter((r) => !hasRealNotes(r.notes as string)).map((r) => r.id as number);
  await sql`update problems set notes = ${NOTES_TEMPLATE} where id = any(${blank})`;
  console.log(`Reset ${blank.length} of ${rows.length} blank notes to the template.`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
