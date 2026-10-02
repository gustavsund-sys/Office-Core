import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
export default defineConfig({
  plugins: [
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
        walk("assets");
        walk("audio");
        const version = createHash("sha256")
          .update(JSON.stringify(files))
          .digest("hex")
          .slice(0, 16);
        const template = readFileSync("scripts/service-worker.js", "utf8");
        writeFileSync(
          "dist/sw.js",
          `const VERSION=${JSON.stringify(version)};const FILES=${JSON.stringify(files)};\n${template}`,
        );
        writeFileSync(
          "dist/game-version.json",
          JSON.stringify({ version, createdAt: new Date().toISOString() }),
        );
      },
    },
  ],
});
