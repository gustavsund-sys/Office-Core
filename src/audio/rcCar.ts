export class RCAudio {
  private context?: AudioContext;
  private buffers?: Promise<AudioBuffer[]>;
  private loop?: AudioBufferSourceNode;
  private gain?: GainNode;
  private ramp?: AudioBufferSourceNode;
  private moving = false;
  private direction = 0;
  private generation = 0;
  private deceleration?: AudioBuffer;
  private async start(direction: number) {
    const generation = ++this.generation;
    const context = (this.context ??= new AudioContext());
    await context.resume();
    this.buffers ??= Promise.all(
      ["rc-acc.mp3", "rc-static.mp3", "rc-stop.mp3"].map(async (name) =>
        context.decodeAudioData(
          await (await fetch(`/audio/rc-car/${name}`)).arrayBuffer(),
        ),
      ),
    );
    const [acceleration, rawMotor, stop] = await this.buffers;
    const motor = this.seamlessLoop(context, rawMotor);
    if (
      !this.moving ||
      direction !== this.direction ||
      generation !== this.generation
    )
      return;
    this.deceleration = stop;
    this.stopVoices();
    const gain = context.createGain();
    gain.gain.value = 0.0001;
    gain.connect(context.destination);
    this.gain = gain;
    gain.gain.exponentialRampToValueAtTime(1.088, context.currentTime + 0.06);
    const ramp = context.createBufferSource();
    ramp.buffer = acceleration;
    ramp.connect(gain);
    ramp.start();
    this.ramp = ramp;
    const loop = context.createBufferSource();
    loop.buffer = motor;
    loop.loop = true;
    loop.connect(gain);
    loop.start(
      context.currentTime + Math.max(0.05, acceleration.duration - 0.1),
    );
    this.loop = loop;
  }
  private seamlessLoop(context: AudioContext, source: AudioBuffer) {
    // Overlap the tail and head; avoid MP3 padding and a hard splice each lap.
    const overlap = Math.min(
      Math.floor(source.sampleRate * 0.1),
      Math.floor(source.length / 4),
    );
    const length = source.length - overlap;
    const result = context.createBuffer(
      source.numberOfChannels,
      length,
      source.sampleRate,
    );
    for (let c = 0; c < source.numberOfChannels; c++) {
      const input = source.getChannelData(c),
        output = result.getChannelData(c);
      output.set(input.subarray(overlap));
      for (let i = 0; i < overlap; i++) {
        const t = i / Math.max(1, overlap - 1);
        output[length - overlap + i] =
          input[length + i] * (1 - t) + input[i] * t;
      }
    }
    return result;
  }
  private release() {
    this.generation++;
    const context = this.context;
    if (!context || !this.deceleration) {
      this.stopVoices();
      return;
    }
    const now = context.currentTime;
    const oldGain = this.gain;
    if (oldGain) {
      oldGain.gain.cancelScheduledValues(now);
      oldGain.gain.setValueAtTime(Math.max(0.0001, oldGain.gain.value), now);
      oldGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    }
    for (const source of [this.ramp, this.loop]) {
      try {
        source?.stop(now + 0.15);
      } catch {}
      if (source) source.onended = () => oldGain?.disconnect();
    }
    this.loop = undefined;
    const gain = context.createGain();
    gain.connect(context.destination);
    const duration = this.deceleration.duration;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      0.952,
      now + Math.min(0.05, duration / 4),
    );
    gain.gain.setValueAtTime(0.952, now + Math.max(0.05, duration - 0.1));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    const tail = context.createBufferSource();
    tail.buffer = this.deceleration;
    tail.connect(gain);
    tail.onended = () => gain.disconnect();
    tail.start(now);
    tail.stop(now + duration);
    this.ramp = tail;
    this.gain = gain;
  }
  update(enabled: boolean, throttle: number, speed: number) {
    if (!enabled) {
      this.stop();
      return;
    }
    const direction = Math.sign(throttle);
    const moving = enabled && direction !== 0;
    if (moving && (!this.moving || direction !== this.direction)) {
      this.moving = true;
      this.direction = direction;
      void this.start(direction).catch(() => {
        this.moving = false;
      });
    } else if (!moving && this.moving) {
      this.moving = false;
      this.release();
    }
    if (this.loop && this.context)
      this.loop.playbackRate.setTargetAtTime(
        0.8 + Math.min(1, Math.abs(speed) / 6.6) * 0.3,
        this.context.currentTime,
        0.15,
      );
  }
  private stopVoices() {
    for (const source of [this.ramp, this.loop])
      try {
        source?.stop();
      } catch {}
    this.ramp = undefined;
    this.loop = undefined;
    this.gain?.disconnect();
    this.gain = undefined;
  }
  stop() {
    this.moving = false;
    this.generation++;
    this.stopVoices();
  }
}
