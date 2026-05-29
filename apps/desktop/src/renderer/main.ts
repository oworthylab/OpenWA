/**
 * Renderer entry — Sprint 5 placeholder.
 *
 * Demonstrates that the typed `window.openwa` bridge is reachable from
 * the renderer. Sprint 6 replaces this with the real React UI.
 */

async function showAppInfo(): Promise<void> {
  if (typeof window === 'undefined' || !window.openwa) return;
  const info = await window.openwa.invoke('app:getInfo', undefined);
  const root = document.querySelector('main');
  if (!root) return;
  const line = document.createElement('p');
  line.textContent = `Connected to main process: v${info.version} on ${info.platform} (${info.channel} channel)`;
  root.appendChild(line);
}

void showAppInfo();

export {};
