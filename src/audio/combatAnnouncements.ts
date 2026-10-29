import { preparedMediaUrl } from "../network/preloadedMedia";

type Cue = "hurt" | "spree" | "first";
export class CombatAnnouncements {
  private round?: number;
  private first = false;
  private streak = 0;
  private low = false;
  private lowEntries = 0;
  constructor(private sounds: Record<Cue, HTMLAudioElement> = {
    hurt: new Audio(preparedMediaUrl("/audio/effects/shit-im-hurt.mp3")),
    spree: new Audio(preparedMediaUrl("/audio/effects/killing-spree.mp3")),
    first: new Audio(preparedMediaUrl("/audio/effects/first-blood.mp3")),
  }) {}
  private play(cue: Cue, audible: boolean, distance = 0) {
    if (!audible) return;
    const sound = this.sounds[cue]; sound.volume = Math.max(0, 1 - distance / 40); if (!sound.volume) return; sound.currentTime = 0;
    void sound.play().catch(() => {});
  }
  update(started: boolean, round: number, hp: number, audible: boolean, distance = 0) {
    if (!started) { this.round = undefined; this.first = false; this.streak = 0; this.low = false; return; }
    if (this.round !== round) { this.round = round; this.first = false; this.streak = 0; this.low = false; }
    const low = hp > 0 && hp < 20;
    if (low && !this.low && ++this.lowEntries % 3 === 0) this.play("hurt", audible, distance);
    this.low = low;
    if (hp <= 0) this.streak = 0;
  }
  kill(audible: boolean, distance = 0) {
    if (!this.first) { this.first = true; this.play("first", audible, distance); }
    if (++this.streak === 5) this.play("spree", audible, distance);
  }
  death() { this.streak = 0; this.low = false; }
}
