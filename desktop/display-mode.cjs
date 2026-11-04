const { spawn } = require('node:child_process');
const path = require('node:path');

function startDisplayMode({ platform = process.platform, arch = process.arch, resourcesPath, displayId, width = 1920, height = 1080, launch = spawn }) {
  const native = path.join(resourcesPath, 'native');
  let child;
  if (platform === 'darwin') child = launch(path.join(native, `display-mode-${arch}`), [String(displayId), String(width), String(height)], { stdio: ['pipe', 'pipe', 'pipe'] });
  else if (platform === 'win32') child = launch('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(native, 'display-mode.ps1'), '-Width', String(width), '-Height', String(height)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  else return Promise.resolve({ ok: false, reason: 'Unsupported platform', restore: () => Promise.resolve() });
  let restored, exited = false;
  child.on('exit', () => { exited = true; });
  child.on('error', () => { exited = true; });
  const restore = () => {
    if (!restored) restored = new Promise(resolve => {
      if (exited || child.exitCode !== null || child.signalCode) return resolve();
      child.once('exit', resolve);
      child.stdin.end();
    });
    return restored;
  };
  child.stdin.on('error', () => {});
  return new Promise(resolve => {
    let output = '', settled = false;
    const finish = (ok, reason) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (!ok) child.stdin.end();
      resolve({ ok, reason, restore });
    };
    const timer = setTimeout(() => finish(false, 'Display mode switch timed out'), 15000);
    child.stdout.on('data', data => {
      output += data.toString();
      if (output.includes('READY\n') || output.includes('READY\r\n')) finish(true);
      else if (output.includes('ERROR:')) finish(false, output.trim());
    });
    child.on('error', error => finish(false, error.message));
    child.on('exit', () => finish(false, output.trim() || 'Display helper exited'));
    child.stderr.on('data', data => { output += data.toString(); });
  });
}
module.exports = { startDisplayMode };
