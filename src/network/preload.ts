import { registerPreparedAudio } from "./preloadedMedia";
export interface StartupAsset {
  url: string;
  bytes: number;
  hash?: string;
}
export interface LoadProgress {
  complete: number;
  total: number;
  bytes: number;
  totalBytes: number;
  url: string;
}
/** Download complete bodies with bounded concurrency; never mistake SPA HTML for an asset. */
export async function preloadResources(
  assets: readonly StartupAsset[],
  options: {
    fetcher?: typeof fetch;
    onProgress?: (p: LoadProgress) => void;
    concurrency?: number;
  } = {},
) {
  const unique = [...new Map(assets.map((a) => [a.url, a])).values()];
  const fetcher = options.fetcher ?? fetch;
  let next = 0,
    complete = 0,
    bytes = 0;
  const totalBytes = unique.reduce((n, a) => n + a.bytes, 0);
  const failed: string[] = [];
  await Promise.all(
    Array.from(
      { length: Math.min(options.concurrency ?? 6, unique.length) },
      async () => {
        while (next < unique.length) {
          const asset = unique[next++];
          let loaded = false;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const response = await fetcher(asset.url, {
                cache: "force-cache",
                signal: AbortSignal.timeout(45000),
              });
              if (
                !response.ok ||
                response.headers.get("content-type")?.includes("text/html")
              )
                throw new Error(`HTTP ${response.status}`);
              const body = await response.arrayBuffer();
              if (!body.byteLength) throw new Error("Empty asset");
              if (asset.url.startsWith("/audio/"))
                registerPreparedAudio(
                  asset.url,
                  body,
                  response.headers.get("content-type") ?? "audio/mpeg",
                );
              loaded = true;
              break;
            } catch {
              /* One retry, followed by a user-visible retry screen. */
            }
          }
          if (!loaded) failed.push(asset.url);
          complete++;
          bytes += asset.bytes;
          options.onProgress?.({
            complete,
            total: unique.length,
            bytes,
            totalBytes,
            url: asset.url,
          });
        }
      },
    ),
  );
  if (failed.length)
    throw new Error(
      `Kunde inte förbereda ${failed.length} filer. Kontrollera anslutningen och försök igen. ${failed.slice(0, 3).join(", ")}`,
    );
  return { count: complete, bytes };
}
