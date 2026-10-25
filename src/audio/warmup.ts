/** Offline rehearsal: no speaker, no real-time context resume, no gameplay voices. */
export async function warmAudioSilently(buffers: readonly AudioBuffer[]) {
  if (typeof OfflineAudioContext === "undefined" || !buffers.length) return;
  const context = new OfflineAudioContext(2, 4096, 44100);
  const mute = context.createGain();
  mute.gain.value = 0;
  mute.connect(context.destination);
  for (const buffer of buffers) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const pan = context.createStereoPanner();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = 7500;
    source.connect(filter).connect(pan).connect(mute);
    source.start(0, 0, Math.min(0.03, buffer.duration));
  }
  const output = await context.startRendering();
  // Inspect the actual offline output, so a future graph edit cannot silently unmute the rehearsal.
  for (let c = 0; c < output.numberOfChannels; c++)
    if (output.getChannelData(c).some((value) => value !== 0))
      throw new Error("Ljudförberedelsen kunde inte göras ljudlöst.");
}
