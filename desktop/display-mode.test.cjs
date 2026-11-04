const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { startDisplayMode } = require('./display-mode.cjs');

function helper() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin.on('finish', () => { child.exitCode = 0; child.emit('exit', 0); });
  return child;
}
test('mac helper receives display ID and restores once through EOF', async () => {
  const child = helper();
  const result = startDisplayMode({ platform: 'darwin', arch: 'arm64', resourcesPath: '/app', displayId: 42, launch: (command, args) => {
    assert.equal(command, '/app/native/display-mode-arm64'); assert.deepEqual(args, ['42', '1920', '1080']);
    return child;
  } });
  child.stdout.write('REA'); child.stdout.write('DY\n');
  const mode = await result;
  assert.equal(mode.ok, true);
  await mode.restore(); await mode.restore();
  assert.equal(child.stdin.writableEnded, true);
});
test('unsupported mode reports failure rather than claiming 1080p', async () => {
  const child = helper();
  const result = startDisplayMode({ platform: 'darwin', resourcesPath: '/app', launch: () => child });
  child.stdout.write('ERROR: Display does not support 1920x1080\n');
  const mode = await result;
  assert.equal(mode.ok, false); await mode.restore();
});
test('missing helper fails and restoration completes', async () => {
  const child = helper();
  const result = startDisplayMode({ platform: 'darwin', resourcesPath: '/app', launch: () => child });
  child.emit('error', new Error('missing binary'));
  const mode = await result;
  assert.equal(mode.ok, false); await mode.restore();
});
