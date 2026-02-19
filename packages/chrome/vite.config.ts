import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync, readdirSync } from "fs";

/**
 * Vite configuration for the Whiteout Chrome extension (MV3).
 *
 * Builds each entry point (background, content, popup, sidebar, options)
 * as a separate chunk and copies static assets (manifest.json, HTML, CSS,
 * icons) into dist/ so the output directory is directly loadable as an
 * unpacked extension.
 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        "background/service-worker": resolve(__dirname, "src/background/service-worker.ts"),
        "content/content": resolve(__dirname, "src/content/content.ts"),
        "popup/popup": resolve(__dirname, "src/popup/popup.ts"),
        "sidebar/sidebar": resolve(__dirname, "src/sidebar/sidebar.ts"),
        "options/options": resolve(__dirname, "src/options/options.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "shared/[name]-[hash].js",
        assetFileNames: "[name][extname]",
        format: "es",
      },
    },
  },
  resolve: {
    alias: {
      "@whiteout/core": resolve(__dirname, "../core/src"),
    },
  },
  plugins: [
    {
      name: "copy-chrome-extension-assets",
      writeBundle() {
        const distDir = resolve(__dirname, "dist");

        // Copy manifest.json
        copyFileSync(
          resolve(__dirname, "manifest.json"),
          resolve(distDir, "manifest.json"),
        );

        // Copy HTML files into their respective directories
        const htmlSources: Array<[string, string]> = [
          ["src/popup/popup.html", "popup/popup.html"],
          ["src/sidebar/sidebar.html", "sidebar/sidebar.html"],
          ["src/options/options.html", "options/options.html"],
        ];

        for (const [src, dest] of htmlSources) {
          const destPath = resolve(distDir, dest);
          const destDir = resolve(destPath, "..");
          if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
          copyFileSync(resolve(__dirname, src), destPath);
        }

        // Copy CSS files
        const cssSources: Array<[string, string]> = [
          ["src/popup/popup.css", "popup/popup.css"],
          ["src/sidebar/sidebar.css", "sidebar/sidebar.css"],
        ];

        for (const [src, dest] of cssSources) {
          const srcPath = resolve(__dirname, src);
          if (!existsSync(srcPath)) continue;
          const destPath = resolve(distDir, dest);
          const destDir = resolve(destPath, "..");
          if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
          copyFileSync(srcPath, destPath);
        }

        // Copy icons
        const iconsDir = resolve(__dirname, "src/icons");
        const distIconsDir = resolve(distDir, "icons");
        if (existsSync(iconsDir)) {
          if (!existsSync(distIconsDir)) mkdirSync(distIconsDir, { recursive: true });
          for (const file of readdirSync(iconsDir)) {
            copyFileSync(resolve(iconsDir, file), resolve(distIconsDir, file));
          }
        }
      },
    },
  ],
});
