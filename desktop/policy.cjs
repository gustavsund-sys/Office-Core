const GAME_ORIGIN = 'https://officecore-ad307.web.app';
const GAME_URL = `${GAME_ORIGIN}/?client=desktop`;
function isGameURL(value) {
  try { return new URL(value).origin === GAME_ORIGIN; } catch { return false; }
}
function isExternalURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !isGameURL(value); } catch { return false; }
}
function allowPermission(permission, origin) {
  return isGameURL(origin) && ['pointerLock', 'fullscreen', 'keyboardLock'].includes(permission);
}
module.exports = { GAME_URL, isGameURL, isExternalURL, allowPermission };
