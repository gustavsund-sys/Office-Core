export interface StartupVersion { version: string; bootstrap: string }
export async function checkStartupVersion(current: string, fetchManifest: () => Promise<StartupVersion>, navigate: (version: string) => void): Promise<boolean> {
  const latest = await fetchManifest();
  if (!/^[a-f0-9]{16}$/.test(latest.version) || !/^\/assets\/[\w.-]+\.js$/.test(latest.bootstrap))
    throw new Error("Versionsinformationen är ogiltig. Försök igen.");
  if (new URL(current).pathname === latest.bootstrap) return true;
  navigate(latest.version);
  return false;
}
