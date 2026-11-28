import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const pkg = JSON.parse(readFileSync(here("./package.json"), "utf8")) as { dependencies: Record<string, string> };

/**
 * The UI components live in the web app (../src) and are imported as-is.
 * - `dedupe` makes every bare import — including ones from ../src — resolve from
 *   desktop/node_modules, so there's one React and one copy of each editor package.
 * - The Next-only modules those components use are swapped for desktop shims.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    dedupe: Object.keys(pkg.dependencies),
    alias: [
      { find: /^@\/app\/actions$/, replacement: here("./src/shims/actions.ts") },
      { find: /^next\/link$/, replacement: here("./src/shims/next-link.tsx") },
      { find: /^next\/navigation$/, replacement: here("./src/shims/next-navigation.ts") },
      { find: /^next\/dynamic$/, replacement: here("./src/shims/next-dynamic.tsx") },
      { find: /^@\/(.*)$/, replacement: here("../src/$1") },
    ],
  },
  server: { port: 1420, strictPort: true, fs: { allow: [here("..")] } },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "es2022", outDir: "dist", emptyOutDir: true },
});
