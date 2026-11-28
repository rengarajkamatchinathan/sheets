# DSA Log — Desktop

Tauri 2 + Rust desktop version of the web app, on the same Neon database. Independent of the
Vercel deployment: the web build ignores this folder (`tsconfig.json` exclude, ESLint ignore, `.vercelignore`).

## How it fits together

- `src/` — Vite + React shell. The UI components are imported straight from the web app (`../src`).
  `vite.config.ts` swaps the Next-only modules they use for shims in `src/shims/`:
  `@/app/actions` → Tauri commands, `next/link` / `next/navigation` → React Router, `next/dynamic` → `React.lazy`.
- `src-tauri/` — Rust: keychain-stored DB URL, Postgres connection (and, next, the local SQLite store + sync).

## Prerequisites

Node 22+, Rust (stable), and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS
(WebView2 on Windows — preinstalled on Windows 11).

The repo lives in OneDrive, so keep Rust's multi-GB build output out of it:

```powershell
setx CARGO_TARGET_DIR "$env:LOCALAPPDATA\dsa-log-target"   # once; restart the terminal
```

## Run

```
cd desktop
npm install
npm run tauri dev      # dev window with hot reload
npm run tauri build    # installer
npm run typecheck      # needs the root `npm install` too (type-only imports from the web app)
```

On first launch, paste the same `DATABASE_URL` the web app uses; it's verified and stored in the OS keychain.

Live DB test: `DATABASE_URL=... cargo test --manifest-path src-tauri/Cargo.toml -- --ignored`
