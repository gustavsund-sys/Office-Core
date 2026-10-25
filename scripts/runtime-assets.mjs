import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
export const RESOURCE_DIRECTORIES = [
  "audio",
  "branding",
  "loadout",
  "models",
  "textures",
  "vfx",
  "ui",
  "updates",
];
// Source artwork and superseded recordings: retained in the repository, never used by gameplay.
export const SOURCE_ONLY_ASSETS = new Set([
  "branding/office-core-primary.png",
  "branding/office-core-lobby-wide.png",
  "branding/office-core-characters.png",
  "audio/music/office-groove.mp3",
  "audio/beacon-movement.mp3",
  "audio/effects/huntingReload.wav",
]);
export function runtimeAssets(root = "public") {
  const files = [];
  function walk(dir) {
    for (const item of readdirSync(resolve(root, dir), {
      withFileTypes: true,
    })) {
      const path = `${dir}/${item.name}`;
      if (item.isDirectory()) walk(path);
      else if (
        !SOURCE_ONLY_ASSETS.has(path) &&
        /\.(?:webp|png|jpe?g|svg|glb|gltf|bin|mp3|m4a|wav|ogg)$/i.test(path)
      ) {
        const bytes = readFileSync(resolve(root, path));
        files.push({
          url: `/${path}`,
          bytes: bytes.length,
          hash: createHash("sha256").update(bytes).digest("hex").slice(0, 16),
        });
      }
    }
  }
  RESOURCE_DIRECTORIES.forEach(walk);
  return files.sort((a, b) => a.url.localeCompare(b.url));
}

export const MEDIA_BASE = "https://gustavsund-sys.github.io/Office-Core/static/";
export function hostedAssets(root = "public") {
  return runtimeAssets(root).filter(({url}) =>
    url.startsWith("/loadout/") || url === "/updates/boss-lookout.jpg" ||
    url === "/audio/music/core-under-attack-v3.mp3" ||
    url === "/audio/music/tactical-pulse.mp3"
  ).map(asset => ({...asset, source: `${MEDIA_BASE}${asset.hash}${asset.url}`}));
}
