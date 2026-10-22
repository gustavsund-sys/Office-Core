import type { Team } from "../config/game";

export function coreEndingVideo(
  team: Team,
  local = import.meta.env?.DEV ?? false,
) {
  const color = team === "BLUE" ? "blue" : "red";
  return local
    ? `/video/${color}-core-explosion.mp4`
    : `https://gustavsund-sys.github.io/Office-Core/media/${color}-core-explosion-v1.mp4`;
}

export class RoundMedia {
  private music = new Audio("/audio/music/core-under-attack-v3.mp3");
  private round?: number;
  private played = false;
  private musicWanted = false;
  private playPending = false;
  private musicBlocked = false;
  private overlay?: HTMLElement;
  private video?: HTMLVideoElement;
  private sound = true;
  constructor() {
    this.music.preload = "none";
    this.music.loop = true;
    this.music.volume = 0.5;
    document.addEventListener("pointerdown", () => {
      this.musicBlocked = false;
      this.playMusic();
    });
    document.addEventListener("keydown", () => {
      this.musicBlocked = false;
      this.playMusic();
    });
  }
  sync(
    round: number,
    started: boolean,
    ended: boolean,
    breached: boolean,
    sound: boolean,
  ) {
    if (this.round !== round || !started) {
      this.closeVideo();
      this.played = false;
      this.musicBlocked = false;
    }
    this.round = round;
    this.sound = sound;
    if (this.video) this.video.muted = !sound;
    this.musicWanted = started && !ended && breached && sound;
    if (this.musicWanted) this.playMusic();
    else this.stopMusic();
  }
  private playMusic() {
    if (
      !this.musicWanted ||
      this.playPending ||
      this.musicBlocked ||
      !this.music.paused
    )
      return;
    this.playPending = true;
    void this.music
      .play()
      .catch(() => {
        this.musicBlocked = true;
      })
      .finally(() => {
        this.playPending = false;
        if (!this.musicWanted) this.stopMusic();
      });
  }
  private stopMusic() {
    this.music.pause();
    if (this.music.currentTime) this.music.currentTime = 0;
  }
  playCore(team: Team) {
    if (this.played) return;
    this.played = true;
    this.musicWanted = false;
    this.stopMusic();
    this.closeVideo();
    const overlay = document.createElement("section");
    overlay.className = "core-ending-film";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", `${team} Core destroyed`);
    const video = document.createElement("video");
    video.src = coreEndingVideo(team);
    video.preload = "auto";
    video.playsInline = true;
    video.muted = !this.sound;
    const label = document.createElement("strong");
    label.className = "core-ending-label";
    label.textContent = `${team} CORE DESTROYED`;
    label.style.color = team === "BLUE" ? "#58d8ff" : "#ff566b";
    const skip = document.createElement("button");
    skip.textContent = "Hoppa över";
    skip.onclick = () => this.closeVideo();
    overlay.append(video, label, skip);
    document.body.append(overlay);
    this.overlay = overlay;
    this.video = video;
    video.onended = () => this.closeVideo();
    video.onerror = () => this.closeVideo();
    void video.play().catch(() => {
      if (this.video !== video) return;
      const play = document.createElement("button");
      play.className = "core-ending-play";
      play.textContent = "Spela rondavslut";
      play.onclick = () => {
        void video
          .play()
          .then(() => play.remove())
          .catch(() => this.closeVideo());
      };
      overlay.append(play);
    });
    skip.focus();
  }
  closeVideo() {
    if (this.video) {
      this.video.onended = null;
      this.video.onerror = null;
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
    }
    this.overlay?.remove();
    this.overlay = undefined;
    this.video = undefined;
  }
}
