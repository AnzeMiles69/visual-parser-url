const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const vsix = path.join(root, `${pkg.name}-${pkg.version}.vsix`);

if (!fs.existsSync(vsix)) {
  console.error(`VSIX not found: ${vsix}`);
  process.exit(1);
}

function installViaElectron(appDir, label) {
  const exe = path.join(appDir, path.basename(appDir).toLowerCase() === 'cursor' ? 'Cursor.exe' : 'Code.exe');
  const cliJs = path.join(appDir, 'resources', 'app', 'out', 'cli.js');
  if (!fs.existsSync(exe) || !fs.existsSync(cliJs)) {
    return false;
  }
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', VSCODE_DEV: '' };
  console.log(`\n→ [${label}] uninstall qa-team.visual-parser (if any)`);
  try {
    execFileSync(exe, [cliJs, '--uninstall-extension', 'qa-team.visual-parser'], { stdio: 'inherit', env });
  } catch { /* ok */ }
  console.log(`\n→ [${label}] install ${path.basename(vsix)}`);
  execFileSync(exe, [cliJs, '--install-extension', vsix, '--force'], { stdio: 'inherit', env });
  return true;
}

const local = process.env.LOCALAPPDATA || '';
const targets = [
  { dir: path.join(local, 'Programs', 'cursor'), label: 'Cursor' },
  { dir: path.join(local, 'Programs', 'Microsoft VS Code'), label: 'VS Code' },
];

let ok = 0;
for (const t of targets) {
  if (installViaElectron(t.dir, t.label)) {
    ok += 1;
  }
}

if (ok === 0) {
  console.error('Could not find Cursor/VS Code install to update.');
  process.exit(1);
}

console.log('\nDone. Reload Cursor: Ctrl+Shift+P → Developer: Reload Window');
