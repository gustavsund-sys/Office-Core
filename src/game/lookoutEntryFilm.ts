import { preparedMediaUrl } from "../network/preloadedMedia";
/** Optional personal cutscene. The server has already placed the pilot at the
 * turret; finishing or skipping only reveals that view, never grants entry. */
export class LookoutEntryFilm {
  active = false;
  private close?: () => void;
  constructor(
    private url = import.meta.env?.VITE_LOOKOUT_ENTRY_VIDEO_URL ??
      (import.meta.env?.DEV
        ? "/video/boss-lookout-entry.mp4"
        : "https://gustavsund-sys.github.io/Office-Core/media/boss-lookout-entry-v1.mp4"),
  ) {}
  play(sound: boolean, finished: () => void) {
    if (!this.url) return false;
    this.cancel();
    const overlay = document.createElement("section");
    overlay.className = "lookout-entry-film";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Entering Boss Lookout");
    const video = document.createElement("video");
    video.src = preparedMediaUrl(this.url);
    video.playsInline = true;
    video.preload = "auto";
    video.muted = !sound;
    const skip = document.createElement("button");
    skip.textContent = "SKIP · HOPPA ÖVER";
    const key = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === "Escape" || event.code === "Space") finish();
    };
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", key, true);
      video.onended = video.onerror = video.onplaying = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      overlay.remove();
      this.active = false;
      this.close = undefined;
    };
    const finish = () => {
      if (!this.active || this.close !== cleanup) return;
      cleanup();
      finished();
    };
    this.active = true;
    this.close = cleanup;
    if (document.pointerLockElement) document.exitPointerLock();
    document.addEventListener("keydown", key, true);
    skip.onclick = finish;
    video.onended = finish;
    video.onerror = finish;
    video.onplaying = () => {
      if (this.close !== cleanup) return;
      clearTimeout(timer);
      timer = setTimeout(finish, 5500);
    };
    // A failed/blocked movie must never strand the pilot behind the overlay.
    timer = setTimeout(finish, 10000);
    overlay.append(video, skip);
    document.body.append(overlay);
    skip.focus();
    void video.play().catch(finish);
    return true;
  }
  cancel() {
    this.close?.();
  }
}
