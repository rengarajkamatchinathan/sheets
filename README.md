# D-Notes

Track daily DSA practice: topics → problems → markdown notes + solution code, with a progress dashboard (Easy/Medium/Hard gauge, activity heatmap, per-topic progress).

Stack: Next.js 16 (App Router, Server Actions) · Tailwind v4 · shadcn/ui · Tiptap (notes) · CodeMirror (code) · Drizzle ORM · Neon Postgres.

## Setup

1. Create `.env.local` (git-ignored):

   ```
   DATABASE_URL="postgresql://…"
   APP_TIMEZONE="Asia/Kolkata"   # day boundaries for the activity heatmap
   ```

2. Install, create tables, seed the NeetCode 150 sheet and its default patterns (re-running is safe: existing topics, and topics that already have patterns, are skipped):

   ```
   npm install
   npm run db:push
   npm run db:seed            # topics + problems + patterns
   npm run db:seed-patterns   # patterns only, for databases seeded before patterns existed
   ```

3. `npm run dev` → http://localhost:3000

## How progress is counted

A problem counts toward the activity heatmap on the day its status first becomes **Solved** (`solved_at`). Setting it back to Todo/Attempted clears that date.

## Layout

- `src/db/schema.ts` — `topics`, `patterns`, `problems`, `snippets` (code tabs) tables
- `src/db/seed.ts` — NeetCode 150 seed
- `src/lib/queries.ts` — dashboard/topic queries
- `src/app/actions.ts` — server actions (create/update/delete)
- `src/app/page.tsx` — dashboard
- `src/app/topics/` — topic grid and topic detail table
- `src/app/problems/` — problem page, new problem form
- `src/components/problem/` — properties panel, Notion-style notes editor, VS Code-style code tabs (autosaves)
- `src/components/ui/` — shadcn/ui components
