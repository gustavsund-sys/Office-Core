// Measured from the supplied pulse trap beep.mp3 (mono RMS analysis, 10 ms windows).
export const PULSE_TRAP_BEEP_DURATION = 3.048027210884354;
export const PULSE_TRAP_BEEPS = [
  [0.5387755102, 0.6385487528],
  [0.8480725624, 0.9578231293],
  [2.0553287982, 2.1451247166],
  [2.3546485261, 2.464399093],
] as const;
export function pulseTrapPulse(time: number) {
  const phase =
    ((time % PULSE_TRAP_BEEP_DURATION) + PULSE_TRAP_BEEP_DURATION) %
    PULSE_TRAP_BEEP_DURATION;
  let pulse = 0;
  for (const [start, end] of PULSE_TRAP_BEEPS) {
    if (phase >= start && phase <= end)
      pulse = Math.max(pulse, Math.min(1, (phase - start) / 0.025));
    else if (phase > end && phase < end + 0.16) {
      const t = 1 - (phase - end) / 0.16;
      pulse = Math.max(pulse, t * t * (3 - 2 * t));
    }
  }
  return pulse;
}
