import type { PulseTrapState } from "../game/pulseTrap";
import { PULSE_TRAP_BEEP_DURATION } from "./pulseTrapRhythm";
export class PulseTrapAudio {
  private voices = new Map<
    number,
    { phase: number; audio?: HTMLAudioElement; pending: boolean; retry: number }
  >();
  /** Visuals use the actual playback position, including the recording's initial silence. */
  update(
    dt: number,
    enabled: boolean,
    listener: { x: number; z: number },
    traps: PulseTrapState[],
  ) {
    const phases = new Map<number, number>();
    for (const [id, v] of this.voices)
      if (!traps.some((t) => t.id === id && t.arm <= 0)) {
        v.audio?.pause();
        if (v.audio) {
          v.audio.removeAttribute("src");
          v.audio.load();
        }
        this.voices.delete(id);
      }
    for (const t of traps) {
      if (t.arm > 0) continue;
      let v = this.voices.get(t.id);
      if (!v) {
        v = { phase: 0, pending: false, retry: 0 };
        this.voices.set(t.id, v);
      }
      const alert = Math.max(0, Math.min(1, t.alert ?? 0));
      const rate = 1 + alert * 2;
      v.phase = (v.phase + dt * rate) % PULSE_TRAP_BEEP_DURATION;
      v.retry = Math.max(0, v.retry - dt);
      const distance = Math.hypot(t.x - listener.x, t.z - listener.z);
      if (enabled && distance < 25) {
        v.audio ??= new Audio("/audio/pulse-trap-beep.mp3");
        const audio = v.audio;
        audio.loop = true;
        audio.preload = "auto";
        audio.playbackRate = rate;
        audio.preservesPitch = true;
        audio.volume = Math.min(
          1,
          0.4 * (1 + alert * 0.5) * (1 - distance / 25) ** 2,
        );
        if (audio.paused && !v.pending && v.retry <= 0) {
          try {
            audio.currentTime = v.phase;
          } catch {
            /* Metadata may still be loading. */
          }
          v.pending = true;
          const entry = v;
          void audio
            .play()
            .then(() => {
              entry.pending = false;
            })
            .catch(() => {
              entry.pending = false;
              entry.retry = 1;
            });
        }
        if (!audio.paused && audio.readyState >= 2)
          v.phase = audio.currentTime % PULSE_TRAP_BEEP_DURATION;
      } else v.audio?.pause();
      phases.set(t.id, v.phase);
    }
    return phases;
  }
}
