// Preload for each WhatsApp Web account view.
//
// Purpose: surface signals from WhatsApp Web back to the main process
// without modifying WA's own code. We poll the document title (WA
// updates it to "(N) WhatsApp" when there are unread messages) and
// forward the count.
//
// Runs with `contextIsolation: true` and `sandbox: true`; the only
// privileged API exposed is `ipcRenderer.send`.

const { ipcRenderer } = require('electron');

function parseUnread() {
  // Title patterns: "WhatsApp", "(3) WhatsApp", "(99+) WhatsApp"
  const t = document.title || '';
  const m = t.match(/^\((\d+\+?)\)/);
  if (!m) return 0;
  return Number.parseInt(m[1], 10) || 0;
}

let last = -1;
function tick() {
  const n = parseUnread();
  if (n !== last) {
    last = n;
    ipcRenderer.send('wa:unread', n);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setInterval(tick, 1500);
  tick();
});
