/** Find the final strong report so a tap can retain the recording's natural tail. */
export function machineGunRegions(
  channels: Float32Array[],
  sampleRate: number,
) {
  const length = channels[0].length,
    window = Math.max(1, Math.floor(sampleRate * 0.008));
  const energy: number[] = [];
  for (let start = 0; start < length; start += window) {
    let sum = 0;
    for (let i = start; i < Math.min(length, start + window); i++) {
      let value = 0;
      for (const channel of channels)
        value = Math.max(value, Math.abs(channel[i]));
      sum += value * value;
    }
    energy.push(Math.sqrt(sum / window));
  }
  const peak = Math.max(...energy),
    attacks: number[] = [];
  for (let i = 1; i < energy.length - 1; i++) {
    if (
      energy[i] >= peak * 0.42 &&
      energy[i] >= energy[i - 1] &&
      energy[i] > energy[i + 1] &&
      (!attacks.length ||
        ((i - attacks[attacks.length - 1]) * window) / sampleRate > 0.09)
    )
      attacks.push(i);
  }
  const first = Math.max(
    0,
    (attacks[0] ?? 0) * window - Math.floor(sampleRate * 0.012),
  );
  const last = Math.max(
    first,
    (attacks.at(-1) ?? 0) * window - Math.floor(sampleRate * 0.012),
  );
  return { first, last, end: length };
}
