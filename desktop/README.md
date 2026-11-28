# DSA Log — Desktop

Tauri 2 + Rust desktop version of the web app, on the same Neon database, working offline.
Independent of the Vercel deployment: the web build ignores this folder (`tsconfig.json`
exclude, ESLint ignore, `.vercelignore`).

## How it fits together

```
React UI (shared components from ../src)  ──invoke──▶  Rust
                                                       ├─ local SQLite copy (reads/writes, instant, offline)
                                                       ├─ outbox of field-level changes
                                                       └─ sync loop ⇄ Neon Postgres ──▶ /api/revalidate (web cache)
```

- `src/` — Vite + React shell. Components are imported straight from the web app (`../src`);
  `vite.config.ts` swaps the Next-only modules for shims in `src/shims/`:
  `@/app/actions` → Tauri commands, `next/link` / `next/navigation` → React Router,
  `next/dynamic` → `React.lazy`, `server-only` → empty. `src/routes/` are ports of the web pages.
- `src-tauri/src/`
  - `schema.rs` — the four tables, described once (must match `src/db/schema.ts`)
  - `local.rs` — SQLite store + outbox; `actions.rs` / `queries.rs` — the web app's actions and loaders, locally
  - `sync.rs` — push (per-field compare-and-set, later edit wins, losing notes kept) then pull (full snapshot)
  - `service.rs` — sync loop (after each change, every 60 s online / 15 s offline) and status events
  - `config.rs` — DB URL, site URL and revalidate secret, all in the OS keychain

**If the web schema changes** (new column/table in `src/db/schema.ts`), update `schema.rs`
(both the column list and `LOCAL_DDL`) and the relevant action/query.

## Conflicts

Edits are per field: a status change on desktop and a notes edit on the web both survive.
If the same field changed on both sides, the later edit wins; for notes, the replaced
version is kept and the problem page shows a banner to view / restore / dismiss it.
A change to a row that was deleted on the web is dropped (deleted wins).

## Prerequisites

Node 22+, Rust (stable), and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
for your OS (WebView2 on Windows — preinstalled on Windows 11).

The repo lives in OneDrive, so keep Rust's multi-GB build output out of it:

```powershell
setx CARGO_TARGET_DIR "$env:LOCALAPPDATA\dsa-log-target"   # once; restart the terminal
```

## Run

```
cd desktop
npm install
npm run tauri dev      # dev window with hot reload
npm run tauri build    # installers (in $CARGO_TARGET_DIR/release/bundle)
npm run typecheck      # needs the root `npm install` too (type-only imports from the web app)
```

First launch: paste the same `DATABASE_URL` the web app uses (verified, stored in the OS
keychain); the app downloads everything once, then works offline.

Optional — refresh the website after desktop syncs: set `REVALIDATE_SECRET` in Vercel's
environment variables, then enter the site URL and the same secret in the desktop sync
settings (⚙ on the sync badge, bottom-right).

## Tests

```powershell
cargo test --manifest-path src-tauri/Cargo.toml                 # unit tests (in-memory SQLite)

# Sync against a real Postgres (uses and drops its own desktop_test_* schema):
docker run --rm -d --name dsa-pg -e POSTGRES_PASSWORD=pg -p 5432:5432 postgres:17
$env:SYNC_TEST_DATABASE_URL="postgresql://postgres:pg@localhost:5432/postgres?sslmode=disable"
cargo test --manifest-path src-tauri/Cargo.toml sync -- --ignored --nocapture
docker stop dsa-pg
```

## Releases

`.github/workflows/desktop.yml` builds Windows, macOS (Apple Silicon + Intel) and Linux
installers into a draft GitHub Release when a `desktop-v*` tag is pushed:

```
git tag desktop-v0.1.0 && git push origin desktop-v0.1.0
```

Bump `version` in `src-tauri/tauri.conf.json` to match. Builds are unsigned (personal use):
Windows SmartScreen → "More info → Run anyway"; macOS → right-click the app → Open, once.
