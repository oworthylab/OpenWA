// Downloads a portable Node.js binary for the current host platform
// and places just the `node` executable under
// `apps/desktop-tauri/src-tauri/resources/node/`.
//
// Why ship Node at all? Because Baileys needs a real `ws.WebSocket`
// implementation (Bun's is incomplete) and a working `node:crypto`.
// Bundling Node guarantees the desktop app runs end-to-end on machines
// that don't have Node installed.
//
// Re-run this once per platform you want to release for. For dev you
// only need the binary for your own OS+arch.

import { copyFileSync, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execCb);

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'src-tauri', 'resources', 'node');

const NODE_VERSION = process.env.OPENWA_NODE_VERSION ?? 'v22.11.0';

function targetSpec() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'darwin' && arch === 'arm64') {
    return { triple: 'darwin-arm64', ext: 'tar.gz', bin: 'node' };
  }
  if (platform === 'darwin' && arch === 'x64') {
    return { triple: 'darwin-x64', ext: 'tar.gz', bin: 'node' };
  }
  if (platform === 'linux' && arch === 'x64') {
    return { triple: 'linux-x64', ext: 'tar.xz', bin: 'node' };
  }
  if (platform === 'linux' && arch === 'arm64') {
    return { triple: 'linux-arm64', ext: 'tar.xz', bin: 'node' };
  }
  if (platform === 'win32' && arch === 'x64') {
    return { triple: 'win-x64', ext: 'zip', bin: 'node.exe' };
  }
  throw new Error(`unsupported host: ${platform}/${arch}`);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const target = join(outDir, process.platform === 'win32' ? 'node.exe' : 'node');
  if (existsSync(target) && !process.env.OPENWA_FORCE_NODE_REFRESH) {
    console.log(`[fetch-node] already present → ${target}`);
    return;
  }

  const spec = targetSpec();
  const url = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${spec.triple}.${spec.ext}`;
  const work = join(tmpdir(), `openwa-node-${Date.now()}`);
  await mkdir(work, { recursive: true });
  const archive = join(work, `node.${spec.ext}`);

  console.log(`[fetch-node] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  const file = createWriteStream(archive);
  for await (const chunk of res.body) file.write(chunk);
  file.end();
  await new Promise((r) => file.on('close', r));

  console.log('[fetch-node] extracting…');
  if (spec.ext === 'tar.gz') {
    await exec(`tar -xzf "${archive}" -C "${work}"`);
  } else if (spec.ext === 'tar.xz') {
    await exec(`tar -xJf "${archive}" -C "${work}"`);
  } else if (spec.ext === 'zip') {
    await exec(`powershell -NoProfile Expand-Archive -Path "${archive}" -DestinationPath "${work}"`);
  }

  const dirName = `node-${NODE_VERSION}-${spec.triple}`;
  const extracted =
    spec.ext === 'zip'
      ? join(work, dirName, spec.bin)
      : join(work, dirName, 'bin', spec.bin);

  // copy + chmod (rename can fail across filesystems, e.g. /tmp → workspace)
  copyFileSync(extracted, target);
  if (process.platform !== 'win32') {
    await import('node:fs/promises').then((m) => m.chmod(target, 0o755));
  }
  rmSync(work, { recursive: true, force: true });
  console.log(`[fetch-node] done → ${target}`);
}

await main();
