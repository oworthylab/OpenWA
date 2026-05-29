// Sidebar renderer logic for the OpenWA shell window.
// Loaded via <script src="shell.js"> so it complies with the
// `script-src 'self'` CSP declared in shell.html — keeps the
// shell renderer hardened against any injected inline scripts.

const sidebar = document.getElementById('sidebar');
const tip = document.getElementById('tip');
let activeId = null;

function initials(name) {
  return (
    name
      .split(/\s+/)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('')
      .slice(0, 2) || 'A'
  );
}

function showTip(text, y) {
  tip.textContent = text;
  tip.style.top = `${y - 12}px`;
  tip.classList.add('show');
}
function hideTip() {
  tip.classList.remove('show');
}

async function render() {
  const accounts = await window.openwa.accounts.list();
  activeId = await window.openwa.accounts.active();
  sidebar.innerHTML = '';
  for (const a of accounts) {
    const el = document.createElement('div');
    el.className = `acct${a.id === activeId ? ' active' : ''}`;
    el.dataset.id = a.id;
    el.textContent = initials(a.name);
    el.addEventListener('click', () => window.openwa.accounts.activate(a.id));
    el.addEventListener('mouseenter', (e) =>
      showTip(a.name, e.target.getBoundingClientRect().top + 24),
    );
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('dblclick', async () => {
      const next = prompt('Rename account:', a.name);
      if (next?.trim()) {
        await window.openwa.accounts.rename(a.id, next.trim());
        render();
      }
    });
    el.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      if (accounts.length === 1) {
        alert('At least one account is required.');
        return;
      }
      if (confirm(`Remove "${a.name}"? This will log it out and erase its local data.`)) {
        await window.openwa.accounts.remove(a.id);
        render();
      }
    });
    sidebar.appendChild(el);
  }
  const add = document.createElement('div');
  add.className = 'add';
  add.title = 'Add account';
  add.textContent = '+';
  add.addEventListener('click', async () => {
    await window.openwa.accounts.add();
    render();
  });
  add.addEventListener('mouseenter', (e) =>
    showTip('Add account', e.target.getBoundingClientRect().top + 24),
  );
  add.addEventListener('mouseleave', hideTip);
  sidebar.appendChild(add);
}

window.openwa.on('accounts:active', (id) => {
  activeId = id;
  render();
});

render();
