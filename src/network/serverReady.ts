export async function fetchServer(
  url: URL | string,
  options: {
    signal?: AbortSignal;
    onWaiting?: () => void;
    fetcher?: typeof fetch;
    pause?: () => Promise<void>;
  } = {},
): Promise<Response> {
  for (;;) {
    options.signal?.throwIfAborted();
    try {
      const timeout = AbortSignal.timeout(15000);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout;
      const response = await (options.fetcher ?? fetch)(url, {
        signal,
        cache: "no-store",
      });
      if (response.ok) return response;
      if (![408, 429, 500, 502, 503, 504].includes(response.status))
        throw new ServerResponseError(response.status);
    } catch (error) {
      options.signal?.throwIfAborted();
      if (error instanceof ServerResponseError) throw error;
      // A cold instance, temporary network failure or attempt timeout is retryable.
    }
    options.onWaiting?.();
    if (options.pause) await options.pause();
    else
      await new Promise<void>((resolve, reject) => {
        const signal = options.signal;
        const aborted = () => {
          clearTimeout(timer);
          reject(signal?.reason);
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", aborted);
          resolve();
        }, 2000);
        signal?.addEventListener("abort", aborted, { once: true });
      });
  }
}
class ServerResponseError extends Error {
  constructor(status: number) {
    super(`Spelservern svarade med HTTP ${status}.`);
  }
}
