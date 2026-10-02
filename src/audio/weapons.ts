import { shotAudibility } from "./spatial";
import { machineGunRegions } from "./machineGun";
import type { WeaponId } from "../config/weapons";
export class WeaponAudio {
  levels: Record<string, number> = { pistol: 1, machineGun: 1, bazooka: 1, burstGun: 1, pulseGun: 1, explosion: 1, bazookaExplosion: 1, ricochet: 1, coreAlarm: 1, footsteps: 1, jump: 1, land: 1, busterScream: 1, busterClock: 1, death: 1, spawn: 1 };
  setLevel(name: string, value: number) {
    this.levels[name] = value;

  }
  buffers = new Map<string, AudioBuffer>();
  private footstepVoices = new Map<string, { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode }>();
  updateFootsteps(emitters: { id: string; x: number; z: number; moving: boolean }[], listener: { x: number; z: number }, enabled: boolean) {
    const audible = new Set<string>();
    const buffer = this.buffers.get("footsteps");
    if (enabled && buffer) for (const emitter of emitters) {
      const distance = Math.hypot(emitter.x - listener.x, emitter.z - listener.z);
      if (!emitter.moving || distance >= 18 || this.levels.footsteps <= 0) continue;
      audible.add(emitter.id);
      let voice = this.footstepVoices.get(emitter.id);
      if (!voice) {
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        const pan = this.context.createStereoPanner();
        source.buffer = buffer;
        source.loop = true;
        gain.gain.value = 0;
        source.connect(gain).connect(pan).connect(this.master);
        source.onended = () => { source.disconnect(); gain.disconnect(); pan.disconnect(); };
        source.start();
        voice = { source, gain, pan };
        this.footstepVoices.set(emitter.id, voice);
      }
      const attenuation = Math.pow(1 - distance / 18, 2);
      voice.gain.gain.setTargetAtTime(0.65 * this.levels.footsteps * attenuation, this.context.currentTime, 0.035);
      voice.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (emitter.x - listener.x) / 12)), this.context.currentTime, 0.035);
    }
    for (const [id, voice] of this.footstepVoices) if (!audible.has(id)) {
      this.fadeVoice(voice);
      this.footstepVoices.delete(id);
    }
  }
  private spatialLoops = new Map<string, { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; pan: StereoPannerNode }>();
  private updateSpatialLoops(prefix: string, name: string, emitters: { id: string; distance: number; pan: number; blocked: boolean }[], volume: number) {
    const active = new Set<string>();
    const buffer = this.buffers.get(name);
    if (buffer) for (const emitter of emitters) {
      const key = `${prefix}:${emitter.id}`;
      active.add(key);
      let voice = this.spatialLoops.get(key);
      if (!voice) {
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        const filter = this.context.createBiquadFilter();
        const pan = this.context.createStereoPanner();
        source.buffer = buffer;
        source.loop = true;
        gain.gain.value = 0;
        filter.type = "lowpass";
        source.connect(filter).connect(gain).connect(pan).connect(this.master);
        source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect(); };
        source.start();
        voice = { source, gain, filter, pan };
        this.spatialLoops.set(key, voice);
      }
      const spatial = shotAudibility(emitter.distance, emitter.blocked);
      voice.gain.gain.setTargetAtTime(volume * this.levels[name] * spatial.gain, this.context.currentTime, 0.05);
      voice.filter.frequency.setTargetAtTime(spatial.frequency, this.context.currentTime, 0.05);
      voice.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, emitter.pan)), this.context.currentTime, 0.05);
    }
    for (const [key, voice] of this.spatialLoops) if (key.startsWith(prefix + ":") && !active.has(key)) {
      this.fadeVoice(voice);
      this.spatialLoops.delete(key);
    }
  }
  setBusterClock(active: boolean, emitters: { id: string; distance: number; pan: number; blocked: boolean }[] = []) {
    this.updateSpatialLoops("clock", "busterClock", active ? emitters : [], 1);
  }
  private tapVoice?: { source: AudioBufferSourceNode; gain: GainNode };
  private noise: AudioBuffer;
  private master: GainNode;
  private pending?: Promise<void>;
  private voices = new Set<AudioBufferSourceNode>();
  constructor(public context: AudioContext) {
    this.master = context.createGain();
    this.master.gain.value = 0.55;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 5;
    this.master.connect(compressor).connect(context.destination);
    this.noise = context.createBuffer(
      1,
      context.sampleRate * 0.3,
      context.sampleRate,
    );
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  load() {
    return (this.pending ??= Promise.all(
      ["pistol", "machineGun", "bazooka", "pulseGun", "burstGun", "explosion", "bazookaExplosion", "coreAlarm", "ricochet", "footsteps", "jump", "land", "busterScream", "busterClock", "death1", "death2", "death3", "spawn"].map(
        async (name) => {
          try {
            const folder = ["explosion", "bazookaExplosion", "coreAlarm", "ricochet", "footsteps", "jump", "land", "busterScream", "busterClock", "death1", "death2", "death3", "spawn"].includes(name)
              ? "effects"
              : "weapons";
            const response = await fetch(`/audio/${folder}/${name}.${name === "bazooka" || name === "burstGun" || name.startsWith("death") ? "wav" : "mp3"}`);
            if (!response.ok) throw new Error(String(response.status));
            const decoded = await this.context.decodeAudioData(
              await response.arrayBuffer(),
            );
            if (name === "machineGun") this.prepareMachineGun(decoded);
            else if (name === "ricochet")
              this.buffers.set(name, this.trimLeadingSilence(decoded));
            else this.buffers.set(name, decoded);
          } catch {
            /* Synth fallback keeps gameplay audible if a codec or request fails. */
          }
        },
      ),
    ).then(() => {}));
  }
  private prepareMachineGun(recording: AudioBuffer) {
    const channels = Array.from(
      { length: recording.numberOfChannels },
      (_, i) => recording.getChannelData(i),
    );
    const { last, end } = machineGunRegions(channels, recording.sampleRate);
    const slice = (start: number, stop: number) => {
      const length = Math.max(1, stop - start),
        buffer = this.context.createBuffer(
          recording.numberOfChannels,
          length,
          recording.sampleRate,
        );
      const fade = Math.min(length / 4, recording.sampleRate * 0.008);
      for (let c = 0; c < channels.length; c++) {
        const output = buffer.getChannelData(c);
        for (let i = 0; i < length; i++)
          output[i] =
            channels[c][start + i] *
            Math.min(
              1,
              i / Math.max(1, fade),
              (length - 1 - i) / Math.max(1, fade),
            );
      }
      return buffer;
    };
    this.buffers.set("machineGun", slice(last, end));
  }
  private trimLeadingSilence(recording: AudioBuffer) {
    const channels = Array.from(
      { length: recording.numberOfChannels },
      (_, i) => recording.getChannelData(i),
    );
    let peak = 0;
    for (const channel of channels)
      for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
    const threshold = Math.max(0.002, peak * 0.06);
    let first = 0;
    while (
      first < recording.length &&
      !channels.some((channel) => Math.abs(channel[first]) >= threshold)
    )
      first++;
    const fade = Math.min(
      Math.floor(recording.sampleRate * 0.004),
      recording.length - first,
    );
    const result = this.context.createBuffer(
      recording.numberOfChannels,
      Math.max(1, recording.length - first),
      recording.sampleRate,
    );
    for (let c = 0; c < channels.length; c++) {
      const output = result.getChannelData(c);
      for (let i = 0; i < output.length; i++) {
        const fadeIn = fade > 0 ? Math.min(1, (i + 1) / fade) : 1;
        output[i] = channels[c][i + first] * fadeIn;
      }
    }
    return result;
  }

  private startVoice(name: string) {
    const source = this.context.createBufferSource(),
      gain = this.context.createGain();
    source.buffer = this.buffers.get(name)!;
    source.loop = false;
    gain.gain.setValueAtTime(0, this.context.currentTime);
    gain.gain.linearRampToValueAtTime(1.4 * this.levels.machineGun, this.context.currentTime + 0.008);
    source.connect(gain).connect(this.master);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    return { source, gain };
  }
  private fadeVoice(
    voice: { source: AudioBufferSourceNode; gain: GainNode } | undefined,
  ) {
    if (!voice) return;
    const t = this.context.currentTime;
    voice.gain.gain.cancelAndHoldAtTime(t);
    voice.gain.gain.linearRampToValueAtTime(0, t + 0.025);
    voice.source.stop(t + 0.03);
  }
  releaseMachineGun(withTail = true) {
    // Releasing the trigger leaves the last real shot's natural decay intact.
    // Mute/pause can still stop the active report immediately with a short fade.
    if (!withTail) this.fadeVoice(this.tapVoice);
    this.tapVoice = undefined;
  }

  setVolume(value: number) {
    this.master.gain.setTargetAtTime(
      Math.max(0, Math.min(1, value)),
      this.context.currentTime,
      0.02,
    );
  }
  playSpawn() { return this.sample("spawn", this.levels.spawn); }
  playDeath() { return this.sample(`death${1 + Math.floor(Math.random() * 3)}`, this.levels.death); }
  playBusterScream() { return this.sample("busterScream", 1); }
  playMovement(name: "jump" | "land") { return this.sample(name, 1); }
  playBazookaExplosion(strength: number) {
    return this.sample("bazookaExplosion", Math.max(0, strength) * 1.6);
  }
  playExplosion(strength: number) {
    return this.sample("explosion", Math.max(0, strength) * 1.6);
  }
  playImpact(distance = 0) {
    // Keep impacts occasional: a rare metallic ring sells the hit better than
    // a sound on every bullet, especially during automatic fire.
    if (Math.random() >= 0.2) return false;
    return this.sample("ricochet", 0.85 * shotAudibility(distance, false).gain, 0.9 + Math.random() * 0.2);
  }
  setAlarm(active: boolean, spatial = { distance: 0, pan: 0, blocked: false }) {
    this.updateSpatialLoops("alarm", "coreAlarm", active ? [{ id: "core", ...spatial }] : [], 0.85);
  }
  private sample(name: string, volume: number, rate = 1) {
    const buffer = this.buffers.get(name);
    if (!buffer) return false;
    if (this.voices.size >= 24) {
      const oldest = this.voices.values().next().value;
      oldest?.stop();
      if (oldest) this.voices.delete(oldest);
    }
    const source = this.context.createBufferSource(),
      gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = volume * (this.levels[name] ?? 1);
    source.connect(gain).connect(this.master);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    return true;
  }
  private tone(
    start: number,
    end: number,
    duration: number,
    volume: number,
    type: OscillatorType = "triangle",
  ) {
    const c = this.context,
      t = c.currentTime,
      osc = c.createOscillator(),
      gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(start, t);
    osc.frequency.exponentialRampToValueAtTime(end, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(t);
    osc.stop(t + duration);
  }
  private crack(duration: number, volume: number, frequency: number) {
    const c = this.context,
      t = c.currentTime,
      source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain();
    source.buffer = this.noise;
    filter.type = "highpass";
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start(t);
    source.stop(t + duration);
  }
  playRemoteShot(id: WeaponId, distance: number, pan: number, blocked: boolean) {
    const buffer = this.buffers.get(id);
    if (!buffer) return false;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const stereo = this.context.createStereoPanner();
    const spatial = shotAudibility(distance, blocked);
    source.buffer = buffer;
    gain.gain.value = spatial.gain * (this.levels[id] ?? 1) * (id === "machineGun" ? 1.4 : 1);
    filter.type = "lowpass";
    filter.frequency.value = spatial.frequency;
    stereo.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(filter).connect(gain).connect(stereo).connect(this.master);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); stereo.disconnect(); };
    source.start();
    return true;
  }
  play(id: WeaponId) {
    if ((id === "bazooka" || id === "pulseGun" || id === "burstGun") && this.sample(id, 1)) return;
    if (id === "bazooka") {
      this.tone(110, 35, 0.35, 0.7 * this.levels.bazooka);
      this.crack(0.2, 0.6 * this.levels.bazooka, 450);
      return;
    }
    if (id === "pulseGun") {
      this.tone(1300, 160, 0.16, 0.35 * this.levels.pulseGun, "sawtooth");
      return;
    }
    if (id === "burstGun") {
      this.sample("machineGun", 1.2 * this.levels.burstGun);
      return;
    }
    const variation = 0.97 + Math.random() * 0.06;
    if (id === "machineGun" && this.buffers.has("machineGun")) {
      // Renew audio on EVERY actual shot. A long recording loop can contain
      // silent gaps; crossfading reports follows gameplay at any frame rate.
      this.fadeVoice(this.tapVoice);
      this.tapVoice = this.startVoice("machineGun");
      return;
    }
    if (id === "pistol" && this.sample(id, 1)) return;
    if (id === "pistol") {
      this.crack(0.115, 0.65, 900);
      this.tone(185 * variation, 48, 0.14, 0.5);
      this.tone(1900 * variation, 650, 0.025, 0.08, "square");
    } else {
      this.crack(0.055, 0.4, 1500);
      this.tone(145 * variation, 65, 0.065, 0.3);
      this.tone(2500 * variation, 1100, 0.016, 0.05, "square");
    }
  }
}
