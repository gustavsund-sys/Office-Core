export const IDLE_WARNING_MS = 5 * 60_000;
export const IDLE_TIMEOUT_MS = 7 * 60_000;
export const IDLE_CLOSE_CODE = 4010;
export function inactivityState(lastActivity: number, now: number) {
  const elapsed = Math.max(0, now - lastActivity);
  return { expired: elapsed >= IDLE_TIMEOUT_MS, warn: elapsed >= IDLE_WARNING_MS, remaining: Math.max(0, Math.ceil((IDLE_TIMEOUT_MS - elapsed) / 1000)) };
}
