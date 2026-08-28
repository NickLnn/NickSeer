// roles.js — Enhances User Role management in Settings
function authHeaders() { const t = localStorage.getItem('nickseer_token'); return t ? { Authorization: 'Bearer ' + t } : {}; }
async function api(path, opts = {}) { try { const r = await fetch(path, { headers: { 'Content-Type': 'application/json', ...authHeaders() }, ...opts }); return await r.json(); } catch (e) { return { error: e.message }; } }

function enhanceUserRows() {
  const pane = document.getElementById('usersPane');
  if (!pane) return;
  pane.querySelectorAll('.user-row').forEach((row) => {
    if (row.dataset.roleDone) return;
    const nameEl = row.querySelector('.user-name');
    if (!nameEl) return;
    const username = nameEl.textContent.trim();
    const roleEl = row.querySelector('.user-role');
    if (!roleEl) return;
    const isAdmin = /admin/i.test(roleEl.textContent);
    row.dataset.roleDone = '1';
    const sel = document.createElement('select');
    sel.className = 'custom-select role-select';
    sel.innerHTML = `<option value="admin" ${isAdmin ? 'selected' : ''}>🛡️ Admin</option><option value="user" ${!isAdmin ? 'selected' : ''}>👤 User</option>`;
    sel.addEventListener('change', async () => {
      const r = await api('/api/auth/users/role', { method: 'POST', body: JSON.stringify({ username, role: sel.value }) });
      if (window.toast) window.toast(r.ok ? `${username} set to ${sel.value === 'admin' ? 'Admin' : 'User'}` : (r.error || 'failed'), r.ok ? 'ok' : 'bad');
    });
    roleEl.replaceWith(sel);
  });
}

const obs = new MutationObserver(() => enhanceUserRows());
obs.observe(document.body, { childList: true, subtree: true });
setTimeout(enhanceUserRows, 500);
