import { defineConfig } from "vite";
import { resolve } from "path";

/**
 * Vite config for producing a single-file IIFE bundle.
 * Used to embed @whiteout/core into native app JS runtimes
 * (Android QuickJS, iOS JavaScriptCore, Tauri, etc.)
 *
 * The bundle exposes `window.Whiteout` (or `globalThis.Whiteout`) with
 * the full pipeline API.
 *
 * Usage:
 *   npx vite build --config vite.bundle.config.ts
 */
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/bundle-entry.ts"),
      name: "Whiteout",
      formats: ["iife", "es"],
      fileName: (format) => `whiteout-core.${format === "es" ? "esm" : "iife"}.js`,
    },
    outDir: "dist/bundle",
    emptyOutDir: true,
    minify: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
