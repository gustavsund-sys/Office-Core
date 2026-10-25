import { defineConfig } from "vite";
import {
  runtimeAssets,
  hostedAssets,
  RESOURCE_DIRECTORIES,
} from "./scripts/runtime-assets.mjs";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (id.includes("node_modules/@babylonjs/")) return "engine";
          if (
            id.includes("node_modules/@firebase/") ||
            id.includes("node_modules/firebase/")
          )
            return "identity";
        },
      },
    },
  },
  plugins: [
    {
      name: "office-core-resource-manifest",
      resolveId(id) {
        if (id === "virtual:game-assets") return "\0virtual:game-assets";
      },
      load(id) {
        if (id === "\0virtual:game-assets")
          return `export default ${JSON.stringify(runtimeAssets())}`;
      },
    },
    {
      name: "office-core-versioned-cache",
      closeBundle() {
        const files: Record<string, string> = {};
        const walk = (dir: string) => {
          for (const item of readdirSync(resolve("dist", dir), {
            withFileTypes: true,
          })) {
            const path = `${dir}/${item.name}`;
            if (item.isDirectory()) walk(path);
            else
              files[`/${path}`] = createHash("sha256")
                .update(readFileSync(resolve("dist", path)))
                .digest("hex")
                .slice(0, 16);
          }
        };
        for (const directory of [
          "assets",
          "app-icons",
          ...RESOURCE_DIRECTORIES,
        ])
          walk(directory);
        files["/mobile.webmanifest"] = createHash("sha256")
          .update(readFileSync("dist/mobile.webmanifest"))
          .digest("hex")
          .slice(0, 16);
        const shellHash = createHash("sha256")
          .update(readFileSync("dist/index.html"))
          .digest("hex");
        const sources = Object.fromEntries(
          hostedAssets().map((a) => [a.url, a.source]),
        );
        const version = createHash("sha256")
          .update(JSON.stringify({ files, sources, shellHash }))
          .digest("hex")
          .slice(0, 16);
        const bootFiles = [
          ...readFileSync("dist/index.html", "utf8").matchAll(
            /(?:src|href)="(\/assets\/[^" ]+)"/g,
          ),
        ]
          .map((m) => m[1])
          .filter((p) => files[p]);
        bootFiles.push(
          ...Object.keys(files).filter(
            (path) =>
              /^\/assets\/.*\.(?:js|css)$/.test(path) &&
              !bootFiles.includes(path),
          ),
        );
        const template = readFileSync("scripts/service-worker.js", "utf8");
        writeFileSync(
          "dist/sw.js",
          `const VERSION=${JSON.stringify(version)};const FILES=${JSON.stringify(files)};const BOOT_FILES=${JSON.stringify(bootFiles)};const SOURCE_URLS=${JSON.stringify(sources)};\n${template}`,
        );
        writeFileSync(
          "dist/game-version.json",
          JSON.stringify({ version, createdAt: new Date().toISOString() }),
        );
      },
    },
  ],
});
