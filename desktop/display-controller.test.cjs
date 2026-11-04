const test = require('node:test');
const assert = require('node:assert/strict');
const { DisplayController } = require('./display-controller.cjs');

test('resolution changes restore the original mode between helpers and on quit', async () => {
  const calls = [];
  const controller = new DisplayController(async size => {
    calls.push(['start', size.width, size.height]);
    return { ok: true, restore: async () => { calls.push(['restore', size.height]); } };
  });
  await controller.change(1080);
  await controller.change(720);
  await controller.change(1440);
  await controller.restore(true);
  assert.deepEqual(calls, [['start',1920,1080],['restore',1080],['start',1280,720],['restore',720],['start',2560,1440],['restore',1440]]);
});
test('unsupported resolution restores the last working game mode', async () => {
  const started = [];
  const controller = new DisplayController(async size => {
    started.push(size.height);
    return { ok: size.height !== 1440, restore: async () => {} };
  });
  await controller.change(1080);
  assert.equal((await controller.change(1440)).ok, false);
  assert.equal(controller.height, 1080);
  assert.equal(controller.active.ok, true);
  assert.deepEqual(started, [1080,1440,1080]);
  await controller.restore(true);
});
test('only the three supported modes are accepted and duplicate selections do not flicker', async () => {
  let starts = 0;
  const controller = new DisplayController(async () => { starts++; return { ok: true, restore: async () => {} }; });
  await controller.change(1080); await controller.change(1080);
  for (const value of [null, '1080', 1000, 0, Infinity]) assert.equal((await controller.change(value)).ok, false);
  assert.equal(starts, 1);
  await controller.restore(true);
  assert.equal((await controller.change(720)).ok, false);
});
test('quitting during a native mode switch restores the newly opened helper', async () => {
  let finish, notifyStart;
  const started = new Promise(resolve => { notifyStart = resolve; });
  let restored = 0;
  const controller = new DisplayController(() => new Promise(resolve => { finish = resolve; notifyStart(); }));
  const change = controller.change(720);
  await started;
  const quit = controller.restore(true);
  finish({ ok: true, restore: async () => { restored++; } });
  assert.equal((await change).ok, false);
  await quit;
  assert.equal(restored, 1);
  assert.equal(controller.active, undefined);
});
