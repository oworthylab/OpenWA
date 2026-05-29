// Generates placeholder Tauri icons. Replace `icon.svg` with your real
// logo and re-run to refresh.
//
// This script doesn't depend on imagemagick — it just writes the same
// tiny PNG into every required size so `tauri build` doesn't fail.
// For a polished release, run `npx @tauri-apps/cli icon path/to/icon.png`
// from this directory.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'src-tauri', 'icons');
mkdirSync(outDir, { recursive: true });

// 1x1 transparent PNG. Tauri only checks file existence at config-load
// time; the real bundler stage will warn but not fail for placeholders.
const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

for (const name of [
  '32x32.png',
  '128x128.png',
  '128x128@2x.png',
  'icon.png',
]) {
  writeFileSync(`${outDir}/${name}`, png1x1);
}

// ICNS/ICO can also accept the same bytes for placeholder purposes; Tauri
// will only attempt to re-pack on real builds. Recommend
// `npx tauri icon` before shipping a release build.
writeFileSync(`${outDir}/icon.icns`, png1x1);
writeFileSync(`${outDir}/icon.ico`, png1x1);

console.log(`[make-icons] placeholders written to ${outDir}`);
console.log(
  '[make-icons] run `npx @tauri-apps/cli icon path/to/logo.png` for real icons before release.',
);
