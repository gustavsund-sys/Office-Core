import { office01 } from "../maps/office01";
export class EngagementAudio {
  private mix: GainNode;
  private room: GainNode;
  private server: GainNode;
  private noise: AudioBuffer;
  active = false;
  elapsed = 0;
  lastThreat = 0;
  constructor(private context: AudioContext) {
    this.mix = context.createGain();
    this.mix.gain.value = 0;
    this.mix.connect(context.destination);
    this.noise = context.createBuffer(
      1,
      context.sampleRate * 2,
      context.sampleRate,
    );
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const ventilation = context.createBufferSource();
    ventilation.buffer = this.noise;
    ventilation.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;
    this.room = context.createGain();
    this.room.gain.value = 0.022;
    ventilation.connect(filter).connect(this.room).connect(this.mix);
    ventilation.start();
    const hum = context.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 95;
    this.server = context.createGain();
    this.server.gain.value = 0;
    hum.connect(this.server).connect(this.mix);
    hum.start();
  }
  update(
    dt: number,
    active: boolean,
    position: { x: number; z: number },
    hpRatio: number,
    bombTimer?: number,
  ) {
    this.active = active;
    this.elapsed += dt;
    this.mix.gain.setTargetAtTime(
      active ? 0.75 : 0,
      this.context.currentTime,
      0.08,
    );
    const distance = Math.min(
      100,
      ...office01.props
        .filter((p) => p.kind === "server")
        .map((p) => Math.hypot(position.x - p.x, position.z - p.z)),
    );
    this.server.gain.setTargetAtTime(
      Math.max(0, 1 - distance / 12) * 0.026,
      this.context.currentTime,
      0.15,
    );
    if (active && (bombTimer !== undefined || hpRatio < 0.35)) {
      const interval =
        bombTimer !== undefined
          ? bombTimer <= 5
            ? 0.22
            : bombTimer <= 10
              ? 0.45
              : 1
          : 0.4 + hpRatio * 2;
      if (this.elapsed - this.lastThreat >= interval) {
        this.lastThreat = this.elapsed;
        this.tone(
          bombTimer !== undefined ? 700 : 270,
          0.07,
          bombTimer !== undefined ? 0.06 : 0.025,
        );
      }
    }
  }
  tone(frequency: number, duration = 0.09, volume = 0.08, delay = 0) {
    if (!this.active) return;
    const t = this.context.currentTime + delay,
      oscillator = this.context.createOscillator(),
      gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, t);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency * 0.8,
      t + duration,
    );
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    oscillator.connect(gain).connect(this.mix);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(t);
    oscillator.stop(t + duration + 0.01);
  }
  hit(kill = false) {
    this.tone(kill ? 900 : 1400, kill ? 0.18 : 0.045, kill ? 0.12 : 0.055);
    if (kill) this.tone(1200, 0.14, 0.1, 0.1);
  }
  impact(material: string, distance = 0, destroyed = false) {
    if (!this.active || distance > 30) return;
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value =
      material === "glass"
        ? 4200
        : material === "metal"
          ? 2400
          : material === "player"
            ? 700
            : 340;
    const gain = this.context.createGain(),
      t = this.context.currentTime,
      duration = destroyed ? 0.24 : 0.06;
    gain.gain.setValueAtTime(
      (destroyed ? 0.13 : 0.045) * Math.max(0, 1 - distance / 30),
      t,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter).connect(gain).connect(this.mix);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start(t);
    source.stop(t + duration);
    if (material === "metal")
      this.tone(1800, 0.07, 0.025 * Math.max(0, 1 - distance / 30));
  }
}
