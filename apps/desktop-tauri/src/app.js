// OpenWA desktop UI — talks directly to the local wa-bridge sidecar.
//
// State machine per session:
//   absent        → not yet started in bridge
//   connecting    → POST /start sent; waiting for QR
//   qr            → QR available; user must scan
//   authenticated → ready to chat
//
// We poll /status every 1.5s while a session is selected. That's good
// enough for QR refresh and disconnect detection without webhooks.

const { invoke } = window.__TAURI__.core;
const opener = window.__TAURI__.opener;

let BRIDGE = null; // { base_url, token }

const SESSIONS_KEY = 'openwa.sessions.v1';
const MESSAGES_KEY = 'openwa.messages.v1';

const els = {
  bridgeDot: document.getElementById('bridge-dot'),
  bridgeState: document.getElementById('bridge-state'),
  newSession: document.getElementById('new-session'),
  sessionList: document.getElementById('session-list'),
  openLogs: document.getElementById('open-logs'),

  viewEmpty: document.getElementById('view-empty'),
  viewQr: document.getElementById('view-qr'),
  viewChat: document.getElementById('view-chat'),

  qrSessionName: document.getElementById('qr-session-name'),
  qrStatePill: document.getElementById('qr-state-pill'),
  qrImg: document.getElementById('qr-img'),
  qrLoading: document.getElementById('qr-loading'),

  chatSessionName: document.getElementById('chat-session-name'),
  chatDisconnect: document.getElementById('chat-disconnect'),
  chatLogout: document.getElementById('chat-logout'),
  convList: document.getElementById('conv-list'),
  toInput: document.getElementById('to-input'),
  msgList: document.getElementById('message-list'),
  msgInput: document.getElementById('msg-input'),
  msgSend: document.getElementById('msg-send'),
};

// --- persistence ---
function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveSessions(s) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(s));
}
function loadMessages(id) {
  try {
    return JSON.parse(localStorage.getItem(`${MESSAGES_KEY}.${id}`) || '{}');
  } catch {
    return {};
  }
}
function saveMessages(id, m) {
  localStorage.setItem(`${MESSAGES_KEY}.${id}`, JSON.stringify(m));
}

let sessions = loadSessions();
let activeId = null;
let pollTimer = null;

// --- bridge connect ---
async function waitForBridge() {
  for (let i = 0; i < 100; i++) {
    try {
      const info = await invoke('bridge_info');
      if (info?.token) {
        BRIDGE = info;
        setBridgeStatus('ok', 'bridge ready');
        return;
      }
    } catch {}
    await sleep(200);
  }
  setBridgeStatus('err', 'bridge failed to start — see logs');
  throw new Error('bridge_info timeout');
}

function setBridgeStatus(level, label) {
  els.bridgeDot.className = `dot ${level}`;
  els.bridgeState.textContent = label;
}

async function bridge(path, opts = {}) {
  if (!BRIDGE) throw new Error('bridge not ready');
  const res = await fetch(`${BRIDGE.base_url}${path}`, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${BRIDGE.token}`,
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok)
    throw new Error(
      `HTTP ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`,
    );
  return body;
}

// --- session lifecycle ---
function newSessionId() {
  return `wa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function createSession() {
  const id = newSessionId();
  const name = `Account ${sessions.length + 1}`;
  sessions.push({ id, name, state: 'connecting' });
  saveSessions(sessions);
  renderSessions();
  await bridge(`/sessions/${id}/start`, { method: 'POST', body: '{}' });
  selectSession(id);
}

async function disconnectSession(id) {
  try {
    await bridge(`/sessions/${id}/stop`, { method: 'POST' });
  } catch {}
  const s = sessions.find((x) => x.id === id);
  if (s) s.state = 'disconnected';
  saveSessions(sessions);
  renderSessions();
  if (id === activeId) selectSession(id);
}

async function logoutSession(id) {
  if (!confirm('Unlink this WhatsApp account from OpenWA?')) return;
  try {
    await bridge(`/sessions/${id}/logout`, { method: 'POST' });
  } catch {}
  try {
    await bridge(`/sessions/${id}/delete`, { method: 'POST' });
  } catch {}
  sessions = sessions.filter((x) => x.id !== id);
  saveSessions(sessions);
  if (id === activeId) activeId = null;
  renderSessions();
  render();
}

// --- polling ---
function startPolling() {
  stopPolling();
  pollTimer = setInterval(refreshActive, 1500);
}
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function refreshActive() {
  if (!activeId) return;
  try {
    const status = await bridge(`/sessions/${activeId}/status`);
    const s = sessions.find((x) => x.id === activeId);
    if (!s) return;
    s.state = mapState(status.state, status.auth?.isAuthenticated);
    if (s.state === 'authenticated' && status.auth?.pushName) s.name = status.auth.pushName;
    saveSessions(sessions);
    renderSessions();
    if (s.state === 'qr' || (s.state === 'connecting' && status.hasQr)) {
      const qr = await bridge(`/sessions/${activeId}/qr`);
      if (qr?.qr) {
        els.qrImg.src = qr.qr;
      }
    }
    render();
  } catch (e) {
    console.warn('poll failed', e);
  }
}

function mapState(raw, isAuthed) {
  if (isAuthed) return 'authenticated';
  if (raw === 'authenticating' || raw === 'connecting') return 'qr';
  if (raw === 'open' || raw === 'authenticated') return 'authenticated';
  if (raw === 'disconnected' || raw === 'closed') return 'disconnected';
  return raw || 'connecting';
}

// --- rendering ---
function selectSession(id) {
  activeId = id;
  // Reset QR display so we don't show a stale image while reconnecting.
  els.qrImg.removeAttribute('src');
  render();
  refreshActive();
}

function renderSessions() {
  els.sessionList.innerHTML = '';
  for (const s of sessions) {
    const li = document.createElement('li');
    if (s.id === activeId) li.classList.add('active');
    li.innerHTML = `
      <div style="flex:1; min-width:0">
        <div class="name" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${escapeHtml(s.name)}</div>
        <div class="state">${escapeHtml(s.state)}</div>
      </div>
    `;
    li.onclick = () => selectSession(s.id);
    els.sessionList.appendChild(li);
  }
}

function render() {
  const s = sessions.find((x) => x.id === activeId);
  hide(els.viewEmpty);
  hide(els.viewQr);
  hide(els.viewChat);
  if (!s) {
    show(els.viewEmpty);
    return;
  }
  if (s.state === 'authenticated') {
    show(els.viewChat);
    els.chatSessionName.textContent = s.name;
    renderMessages();
  } else {
    show(els.viewQr);
    els.qrSessionName.textContent = s.name;
    els.qrStatePill.textContent = s.state;
    els.qrStatePill.className = `pill ${s.state === 'authenticated' ? 'ok' : s.state === 'disconnected' ? 'err' : ''}`;
  }
}

function renderMessages() {
  if (!activeId) return;
  const store = loadMessages(activeId);
  const to = els.toInput.value.trim();
  els.msgList.innerHTML = '';
  const thread = store[to] || [];
  for (const m of thread) {
    const b = document.createElement('div');
    b.className = `bubble ${m.fromMe ? 'me' : ''}`;
    b.innerHTML = `${escapeHtml(m.text || '(media)')}
      <div class="meta">${new Date(m.ts).toLocaleTimeString()}</div>`;
    els.msgList.appendChild(b);
  }
  els.msgList.scrollTop = els.msgList.scrollHeight;
}

function appendLocalMessage(sessionId, to, msg) {
  const store = loadMessages(sessionId);
  if (!store[to]) store[to] = [];
  store[to].push(msg);
  saveMessages(sessionId, store);
}

async function sendMessage() {
  if (!activeId) return;
  const to = els.toInput.value.trim();
  const text = els.msgInput.value.trim();
  if (!to || !text) return;
  els.msgSend.disabled = true;
  try {
    const jid = normalizeJid(to);
    await bridge(`/sessions/${activeId}/messages/text`, {
      method: 'POST',
      body: JSON.stringify({ to: jid, text }),
    });
    appendLocalMessage(activeId, to, { text, fromMe: true, ts: Date.now() });
    els.msgInput.value = '';
    renderMessages();
  } catch (e) {
    alert(`Send failed: ${e.message}`);
  } finally {
    els.msgSend.disabled = false;
  }
}

function normalizeJid(input) {
  const digits = input.replace(/\D/g, '');
  if (!digits) throw new Error('empty number');
  if (input.includes('@')) return input;
  return `${digits}@s.whatsapp.net`;
}

// --- utils ---
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function show(el) {
  el.hidden = false;
}
function hide(el) {
  el.hidden = true;
}
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

// --- wire up ---
els.newSession.onclick = () => createSession().catch((e) => alert(e.message));
els.chatDisconnect.onclick = () => activeId && disconnectSession(activeId);
els.chatLogout.onclick = () => activeId && logoutSession(activeId);
els.msgSend.onclick = sendMessage;
els.msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
els.toInput.addEventListener('input', renderMessages);
els.openLogs.onclick = async () => {
  try {
    const dir = await invoke('open_log_dir');
    if (opener?.openPath) await opener.openPath(dir);
  } catch (e) {
    alert(e.message);
  }
};

(async function main() {
  renderSessions();
  render();
  await waitForBridge();
  // Hydrate any sessions we already know about; bridge restarts fresh
  // each run so we re-issue /start to pick up persisted auth.
  for (const s of sessions) {
    try {
      await bridge(`/sessions/${s.id}/start`, { method: 'POST', body: '{}' });
    } catch {}
  }
  startPolling();
})();
