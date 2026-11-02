const test = require('node:test');
const assert = require('node:assert/strict');
const { isGameURL, isExternalURL, allowPermission } = require('./policy.cjs');
test('desktop navigation restricts the privileged game window to its production origin', () => {
  assert.equal(isGameURL('https://officecore-ad307.web.app/?client=desktop'), true);
  for (const url of ['http://officecore-ad307.web.app', 'https://officecore-ad307.web.app.evil.test', 'file:///etc/passwd', 'javascript:alert(1)']) assert.equal(isGameURL(url), false);
  assert.equal(isExternalURL('https://example.com/help'), true);
  assert.equal(isExternalURL('file:///tmp/test'), false);
  assert.equal(isExternalURL('mailto:user@example.com'), false);
});
test('only game interaction permissions can be granted to the game origin', () => {
  assert.equal(allowPermission('pointerLock', 'https://officecore-ad307.web.app'), true);
  assert.equal(allowPermission('pointerLock', 'https://example.com'), false);
  for (const permission of ['media', 'geolocation', 'notifications', 'clipboard-read']) assert.equal(allowPermission(permission, 'https://officecore-ad307.web.app'), false);
});
