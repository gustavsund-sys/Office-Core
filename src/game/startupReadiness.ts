interface StartupTexture {
  name: string;
  isRenderTarget: boolean;
  isReady(): boolean;
  getClassName(): string;
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
