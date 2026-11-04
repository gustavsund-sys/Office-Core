const { execFileSync } = require('node:child_process');
const has = (...keys) => keys.every(key => Boolean(process.env[key]));
function checkMacSigning() {
  const identities = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
  if (!identities.includes('"Developer ID Application:') && !process.env.CSC_LINK) {
    throw new Error('Mac-release stoppad: ett giltigt Developer ID Application-certifikat krävs.');
  }
  if (!has('APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER') &&
      !has('APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID') &&
      !has('APPLE_KEYCHAIN_PROFILE')) {
    throw new Error('Mac-release stoppad: konfigurera Apples notariseringsuppgifter först.');
  }
}
if (require.main === module) {
  try { checkMacSigning(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { checkMacSigning };
