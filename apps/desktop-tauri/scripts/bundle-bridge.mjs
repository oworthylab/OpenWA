// Bundles apps/wa-bridge into a single CommonJS file that Tauri ships
// as a resource, plus installs the runtime dependencies into a clean
// node_modules tree next to it.
//
// Output (under apps/desktop-tauri/src-tauri/resources/):
//   bridge.cjs        — bundled source (all our workspace code)
//   package.json      — declares the runtime externals
//   node_modules/     — flat install of those externals (with their deps)
//
// We intentionally do NOT bundle native modules. Baileys' transitive
// curve25519 / libsignal bindings load .node files, which can't be
// bundled by esbuild without breaking.

import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..', '..');
const desktopRoot = resolve(__dirname, '..');
const bridgeEntry = join(root, 'apps', 'wa-bridge', 'src', 'index.ts');
const outDir = join(desktopRoot, 'src-tauri', 'resources');
const outFile = join(outDir, 'bridge.cjs');

if (!existsSync(bridgeEntry)) {
  console.error(`[bundle-bridge] not found: ${bridgeEntry}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

// Pin runtime deps to whatever the wa-bridge / engine workspaces declare,
// so we ship the exact same versions we test with.
const wbPkg = JSON.parse(
  readFileSync(join(root, 'apps', 'wa-bridge', 'package.json'), 'utf8'),
);
const enginePkg = JSON.parse(
  readFileSync(join(root, 'packages', 'engine', 'package.json'), 'utf8'),
);

const runtimeDeps = {
  '@whiskeysockets/baileys':
    enginePkg.dependencies?.['@whiskeysockets/baileys'] ?? '^6.17.0',
  pino: wbPkg.dependencies?.pino ?? enginePkg.dependencies?.pino ?? '^9.0.0',
  qrcode: enginePkg.dependencies?.qrcode ?? '^1.5.0',
};

const externals = Object.keys(runtimeDeps);

console.log('[bundle-bridge] bundling source…');
await build({
  entryPoints: [bridgeEntry],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: outFile,
  external: externals,
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'info',
});

// Stage a real node_modules tree. We write our own package.json (the
// workspace one has `workspace:*` refs that npm can't resolve outside
// the monorepo) and `npm install --omit=dev` it.
writeFileSync(
  join(outDir, 'package.json'),
  JSON.stringify(
    {
      name: 'openwa-bridge-runtime',
      version: '0.0.0',
      private: true,
      dependencies: runtimeDeps,
    },
    null,
    2,
  ),
);

// Wipe any previous install so we don't carry stale modules.
rmSync(join(outDir, 'node_modules'), { recursive: true, force: true });
rmSync(join(outDir, 'package-lock.json'), { force: true });

console.log('[bundle-bridge] installing runtime deps…');
execSync('npm install --omit=dev --no-audit --no-fund --loglevel=error', {
  cwd: outDir,
  stdio: 'inherit',
  env: { ...process.env, npm_config_workspaces: 'false' },
});

console.log(`[bundle-bridge] done → ${outFile}`);
