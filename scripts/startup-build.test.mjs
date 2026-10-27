import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('production HTML loads only the lightweight version gate, without preloading the game', () => {
  const html = readFileSync('dist/index.html', 'utf8');
  const manifest = JSON.parse(readFileSync('dist/game-version.json', 'utf8'));
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(scripts, [manifest.bootstrap]);
  assert.equal(html.includes('modulepreload'), false, 'the engine must not start downloading before the version check');
  assert.equal(html.includes('stylesheet'), false, 'client styles load after version validation');
  const boot = readFileSync('dist' + manifest.bootstrap, 'utf8');
  assert.ok(Buffer.byteLength(boot) < 20000, 'the version gate must stay small');
  assert.equal(/\bfrom\s*["'][^"']*(?:engine|main)-/.test(boot), false, 'game imports must stay dynamic');
  assert.ok(boot.includes('game-version.json'));
});
