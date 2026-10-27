interface StartupTexture {
  name: string;
  isRenderTarget: boolean;
  isReady(): boolean;
  getClassName(): string;
}

/** Stop producing GPU work, wait for submitted work, then release warmup resources. */
export async function finishStartupRendering(
  stop: () => void,
  drain: () => Promise<void>,
  cleanup: () => void,
  budgetMs = 10000,
) {
  stop();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      drain(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("GPU:n slutförde inte laddningens bildrutor i tid.")), budgetMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    cleanup();
  }
}
/** Poll the live list: textures can finish before a load listener is added or be replaced. */
export async function waitForTextureAssets(
  textures: () => readonly StartupTexture[],
  frame: () => Promise<void>,
  now: () => number = () => performance.now(),
) {
  const started = now();
  let diagnosed = false;
  while (true) {
    const pending = textures().filter(
      (texture) => !texture.isRenderTarget && !texture.isReady(),
    );
    if (!pending.length) return;
    if (!diagnosed && now() - started > 3000) {
      console.info(
        "Office Core pending startup textures",
        JSON.stringify(
          pending.map((t) => ({ name: t.name, type: t.getClassName() })),
        ),
      );
      diagnosed = true;
    }
    if (now() - started > 45000)
      throw new Error(
        "Grafikresurser kunde inte förberedas. Försök ladda om spelet.",
      );
    await frame();
  }
}

/** Shader warmup is optional once required files are ready; it must not lock startup. */
export async function waitForGraphicsWarmup(
  ready: () => boolean,
  frame: () => Promise<void>,
  budgetMs = 5000,
  now: () => number = () => performance.now(),
) {
  const start = now();
  while (!ready()) {
    if (now() - start >= budgetMs) return false;
    await frame();
  }
  return true;
}
