export function shotAudibility(distance: number, blocked: boolean) {
  const attenuation = 1 / (1 + Math.pow(Math.max(0, distance) / 16, 2));
  return { gain: Math.max(0.025, attenuation) * (blocked ? 0.45 : 1), frequency: Math.max(700, 16000 / (1 + distance / 15)) * (blocked ? 0.5 : 1) };
}
