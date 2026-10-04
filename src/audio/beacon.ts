import type { BeaconState } from "../game/beacon";
import { BEACON_MOVEMENT_CLIPS } from "./beaconClips";
export class BeaconAudio {
  private playing = new Set<HTMLAudioElement>();
  private movements = new Map<
    number,
    { audio: HTMLAudioElement; motion: number }
  >();
  play(kind: "place" | "shot", distance: number, enabled: boolean) {
    if (!enabled || distance > 60) return;
    if (this.playing.size >= 12) {
      const a = this.playing.values().next().value;
      a?.pause();
      if (a) this.playing.delete(a);
    }
    const audio = new Audio(`/audio/beacon-${kind}.mp3`);
    audio.volume = Math.min(0.7, 0.7 / (1 + (distance / 15) ** 2));
    this.playing.add(audio);
    audio.onended = () => this.playing.delete(audio);
    void audio.play().catch(() => this.playing.delete(audio));
  }
  update(
    dt: number,
    enabled: boolean,
    listener: { x: number; z: number },
    robots: BeaconState[],
  ) {
    if (!enabled) {
      for (const a of this.playing) a.pause();
      this.playing.clear();
    }
    for (const [id, entry] of this.movements) {
      const r = robots.find((r) => r.id === id);
      if (
        !enabled ||
        !r?.moving ||
        r.motionId !== entry.motion ||
        Math.hypot(r.x - listener.x, r.z - listener.z) > 25
      ) {
        entry.audio.pause();
        this.movements.delete(id);
      }
    }
    if (!enabled) return;
    for (const r of robots) {
      const distance = Math.hypot(r.x - listener.x, r.z - listener.z);
      if (!r.moving || r.movementClip === undefined || distance > 25) continue;
      const existing = this.movements.get(r.id);
      if (existing) {
        existing.audio.volume = 0.35 / (1 + (distance / 10) ** 2);
        continue;
      }
      const clip = BEACON_MOVEMENT_CLIPS[r.movementClip];
      if (!clip) continue;
      const audio = new Audio(clip.src);
      audio.currentTime = Math.min(
        r.motionElapsed ?? 0,
        Math.max(0, clip.duration - 0.02),
      );
      audio.volume = 0.35 / (1 + (distance / 10) ** 2);
      this.movements.set(r.id, { audio, motion: r.motionId ?? 0 });
      void audio.play().catch(() => {
        audio.pause();
      });
    }
  }
}
