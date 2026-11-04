const RESOLUTIONS = { 720: 1280, 1080: 1920, 1440: 2560 };
function validResolution(height) { return Number.isInteger(height) && Object.hasOwn(RESOLUTIONS, height); }
class DisplayController {
  constructor(start) { this.start = start; this.queue = Promise.resolve(); this.stopped = false; }
  change(height) {
    const task = this.queue.then(async () => {
      if (this.stopped) return { ok: false, error: 'Appen håller på att avslutas.' };
      if (!validResolution(height)) return { ok: false, error: 'Upplösningen stöds inte.' };
      if (this.active?.ok && this.height === height) return { ok: true };
      const previous = this.active?.ok ? this.height : undefined;
      await this.active?.restore(); this.active = undefined;
      if (this.stopped) return { ok: false, error: 'Appen håller på att avslutas.' };
      const mode = await this.start({ width: RESOLUTIONS[height], height });
      this.active = mode;
      if (this.stopped) { await mode.restore(); this.active = undefined; return { ok: false }; }
      if (mode.ok) { this.height = height; return { ok: true }; }
      await mode.restore(); this.active = undefined;
      if (previous && !this.stopped) {
        this.active = await this.start({ width: RESOLUTIONS[previous], height: previous });
        if (this.stopped) { await this.active.restore(); this.active = undefined; }
      }
      return { ok: false, error: 'Skärmen kunde inte växla till den valda upplösningen. Välj ett annat skärmläge.' };
    });
    this.queue = task.catch(() => {});
    return task;
  }
  restore(shutdown = false) {
    if (shutdown) this.stopped = true;
    const task = this.queue.then(async () => { await this.active?.restore(); this.active = undefined; });
    this.queue = task.catch(() => {});
    return task;
  }
}
module.exports = { DisplayController, validResolution };
