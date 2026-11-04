const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');
function verifyTestApp(appPath) {
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'pipe' });
  const signature = spawnSync('codesign', ['--display', '--verbose=4', appPath], { encoding: 'utf8' });
  if (signature.status !== 0 || !signature.stderr.includes('Signature=adhoc') ||
      !signature.stderr.includes('Identifier=com.officecore.desktop') ||
      signature.stderr.includes('Sealed Resources=none')) {
    throw new Error('Testbygget saknar en komplett, giltig ad hoc-signatur.');
  }
}
module.exports = async context => {
  for (const artifact of context.artifactPaths.filter(file => file.endsWith('.dmg'))) {
    const directory = artifact.includes('-arm64.dmg') ? 'mac-arm64' : 'mac';
    verifyTestApp(path.join(context.outDir, directory, 'Office Core.app'));
    execFileSync('hdiutil', ['verify', artifact], { stdio: 'pipe' });
  }
  return [];
};
module.exports.verifyTestApp = verifyTestApp;
