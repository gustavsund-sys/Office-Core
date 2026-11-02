const { execFileSync } = require('node:child_process');
const path = require('node:path');
for (const arch of ['arm64', 'x86_64']) {
  execFileSync('xcrun', ['clang', '-O2', '-arch', arch, '-mmacosx-version-min=12.0', '-framework', 'ApplicationServices', path.join(__dirname, 'native/display-mode.c'), '-o', path.join(__dirname, `native/display-mode-${arch === 'x86_64' ? 'x64' : arch}`)], { stdio: 'inherit' });
}
