const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
function verifyMacApp(appPath) {
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'pipe' });
  const details = spawnSync('codesign', ['--display', '--verbose=2', appPath], { encoding: 'utf8' });
  if (details.status !== 0 || !details.stderr.includes('Authority=Developer ID Application:')) {
    throw new Error('Mac-release stoppad: appen saknar en giltig Developer ID-signatur.');
  }
  execFileSync('xcrun', ['stapler', 'validate', appPath], { stdio: 'pipe' });
  execFileSync('spctl', ['--assess', '--type', 'execute', appPath], { stdio: 'pipe' });
}
module.exports = async context => {
  if (!context.artifactPaths.some(file => file.endsWith('.dmg'))) return [];
  const apps = fs.readdirSync(context.outDir)
    .filter(name => /^mac(?:-|$)/.test(name))
    .map(name => path.join(context.outDir, name, 'Office Core.app'))
    .filter(app => fs.existsSync(app));
  if (!apps.length) throw new Error('Mac-release stoppad: ingen app hittades för signaturkontroll.');
  apps.forEach(verifyMacApp);
  return [];
};
module.exports.verifyMacApp = verifyMacApp;
