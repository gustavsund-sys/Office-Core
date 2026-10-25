const media = new Map<string, string>();
const audioFiles = new Map<string, Blob>();
export function registerPreparedAudio(
  url: string,
  body: ArrayBuffer,
  type: string,
) {
  if (audioFiles.has(url)) return;
  const blob = new Blob([body], { type });
  audioFiles.set(url, blob);
  media.set(url, URL.createObjectURL(blob));
}
export async function preparedAudioData(url: string) {
  const blob = audioFiles.get(url);
  if (blob) return blob.arrayBuffer();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Audio: HTTP ${response.status}`);
  return response.arrayBuffer();
}
export const preparedMediaUrl = (url: string) => media.get(url) ?? url;
/** Keep complete cinematic bytes available; playing the clip then uses a local blob. */
export async function preloadMedia(
  urls: readonly string[],
  onProgress?: (complete: number, total: number) => void,
) {
  const unique = [...new Set(urls)];
  let complete = 0;
  const failures: string[] = [];
  for (const url of unique) {
    if (media.has(url)) {
      onProgress?.(++complete, unique.length);
      continue;
    }
    try {
      let cache: Cache | undefined;
      try {
        if (!import.meta.env?.DEV)
          cache = await caches.open("office-cinematics-v1");
      } catch {
        /* Private mode */
      }
      const response =
        (await cache?.match(url)) ??
        (await fetch(url, {
          cache: "force-cache",
          signal: AbortSignal.timeout(60000),
        }));
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("video/")
      )
        throw new Error("Missing video");
      const copy = response.clone();
      const blob = await response.blob();
      media.set(url, URL.createObjectURL(blob));
      try {
        await cache?.put(url, copy);
      } catch {
        /* Current tab still has the complete movie. */
      }
    } catch {
      failures.push(url);
    }
    onProgress?.(++complete, unique.length);
  }
  // Films are optional: existing skip/error handling remains available.
  if (failures.length)
    console.warn("Optional cinematics unavailable", failures);
}
