# DSA Log

Track daily DSA practice: topics → problems → markdown notes + solution code, with a progress dashboard (Easy/Medium/Hard gauge, activity heatmap, per-topic progress).

Stack: Next.js 16 (App Router, Server Actions) · Tailwind v4 · Drizzle ORM · Neon Postgres.

## Setup

1. Create `.env.local` (git-ignored):

   ```
   DATABASE_URL="postgresql://…"
   APP_TIMEZONE="Asia/Kolkata"   # day boundaries for the activity heatmap
   ```

2. Install, create tables, seed the NeetCode 150 sheet (seed skips if topics already exist):

   ```
   npm install
   npm run db:push
   npm run db:seed
   ```

3. `npm run dev` → http://localhost:3000

## How progress is counted

A problem counts toward the activity heatmap on the day its status first becomes **Solved** (`solved_at`). Setting it back to Todo/Attempted clears that date.

## Layout

- `src/db/schema.ts` — `topics`, `problems` tables
- `src/db/seed.ts` — NeetCode 150 seed
- `src/lib/queries.ts` — dashboard/topic queries
- `src/app/actions.ts` — server actions (create/update/delete)
- `src/app/page.tsx` — dashboard
- `src/app/topics/` — topic grid and topic detail table
- `src/app/problems/` — problem notes/code editor, new problem form
