export type AudioChannel = "music" | "effects";
const KEY = "officeCore.audio.v1";
export function readVolumes(): Record<AudioChannel, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const valid = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v)
        ? Math.max(0, Math.min(1, v))
        : 1;
    return {
      music:
        saved.music === undefined &&
        localStorage.getItem("officeCore.lobbyMuted") === "true"
          ? 0
          : valid(saved.music),
      effects: valid(saved.effects),
    };
  } catch {
    return { music: 1, effects: 1 };
  }
}
let volumes = readVolumes();
const buses = new Map<
  BaseAudioContext,
  Partial<Record<AudioChannel, GainNode>>
>();
let mediaContext: AudioContext | undefined;
const mixedMedia = new WeakSet<HTMLMediaElement>();
export function audioOutput(
  context: BaseAudioContext,
  channel: AudioChannel = "effects",
) {
  let channels = buses.get(context);
  if (!channels) {
    channels = {};
    buses.set(context, channels);
  }
  let gain = channels[channel];
  if (!gain) {
    gain = context.createGain();
    gain.gain.value = volumes[channel];
    gain.connect(context.destination);
    channels[channel] = gain;
  }
  return gain;
}
export function setVolume(channel: AudioChannel, value: number) {
  if (!Number.isFinite(value)) return;
  volumes[channel] = Math.max(0, Math.min(1, value));
  try {
    localStorage.setItem(KEY, JSON.stringify(volumes));
  } catch {
    /* Session preferences still work. */
  }
  for (const [context, channels] of buses) {
    const gain = channels[channel];
    if (gain)
      gain.gain.setTargetAtTime(volumes[channel], context.currentTime, 0.02);
  }
}
export function mixMedia<T extends HTMLMediaElement>(
  media: T,
  channel: AudioChannel = "effects",
): T {
  if (typeof AudioContext === "undefined" || mixedMedia.has(media))
    return media;
  mediaContext ??= new AudioContext();
  const source = mediaContext.createMediaElementSource(media);
  const output = audioOutput(mediaContext, channel);
  let connected = false;
  const connect = () => {
    if (!connected) {
      source.connect(output);
      connected = true;
    }
  };
  const disconnect = () => {
    if (connected) {
      source.disconnect();
      connected = false;
    }
  };
  connect();
  media.addEventListener("play", connect);
  media.addEventListener("pause", disconnect);
  media.addEventListener("ended", disconnect);
  mixedMedia.add(media);
  return media;
}
export function gameAudio(src?: string, channel: AudioChannel = "effects") {
  return mixMedia(new Audio(src), channel);
}
if (typeof window !== "undefined") {
  const unlock = () => {
    if (mediaContext?.state === "suspended")
      void mediaContext.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
}
