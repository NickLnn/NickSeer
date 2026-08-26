// roles.js — enhances Settings → Users: adds an Admin/Requester role dropdown to
// each existing user row (so you can flip NickLn to admin), plus an "Import Plex
// users" button that auto-provisions your Plex/Tautulli users into the list even
// before they log in. Additive; watches the Users pane.
function authHeaders() { const t = localStorage.getItem('nickseer_token'); return t ? { Authorization: 'Bearer ' + t } : {}; }
async function api(path, opts = {}) { try { const r = await fetch(path, { headers: { 'Content-Type': 'application/json', ...authHeaders() }, ...opts }); return await r.json(); } catch (e) { return { error: e.message }; } }
function randPass() { return 'Px' + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6); }

function injectStyles() {
  if (document.getElementById('roles-styles')) return;
  const css = `
  .role-select{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#eaeaf0;border-radius:8px;padding:6px 10px;font-weight:700;font-size:12.5px;cursor:pointer;}
  .role-select:focus{border-color:#1E88C7;}
  .import-plex{margin:6px 0 14px;padding:9px 14px;border:0;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;background:linear-gradient(135deg,#e5a00d,#f5c518);color:#1b1b1b;display:inline-flex;align-items:center;gap:8px;}
  .import-plex:hover{filter:brightness(1.05);} .import-msg{margin-left:10px;font-size:12.5px;font-weight:700;}`;
  const st = document.createElement('style'); st.id = 'roles-styles'; st.textContent = css; document.head.appendChild(st);
}

// Turn each ".user-row" action area into a role dropdown + keep the existing
// Change password / Delete buttons.
function enhanceUserRows() {
  const pane = document.getElementById('usersPane'); if (!pane) return;
  // Add an Import button once, above the list.
  if (!pane.querySelector('.import-plex')) {
    const list = pane.querySelector('#userList');
    if (list) {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<button class="import-plex" type="button">⬇ Import Plex/Tautulli users</button><span class="import-msg" id="importMsg"></span>`;
      list.parentNode.insertBefore(wrap, list);
      wrap.querySelector('.import-plex').addEventListener('click', () => importPlex(wrap.querySelector('#importMsg')));
    }
  }
  pane.querySelectorAll('.user-row').forEach((row) => {
    if (row.dataset.roleDone) return;
    const nameEl = row.querySelector('.user-name'); if (!nameEl) return;
    const username = nameEl.textContent.trim();
    const roleEl = row.querySelector('.user-role');
    const isAdmin = /admin/i.test(roleEl ? roleEl.textContent : '');
    row.dataset.roleDone = '1';
    // Replace the plain role label with a dropdown.
    if (roleEl) {
      const sel = document.createElement('select');
      sel.className = 'role-select';
      sel.innerHTML = `<option value="admin" ${isAdmin ? 'selected' : ''}>🛡️ Admin</option><option value="user" ${!isAdmin ? 'selected' : ''}>Requester</option>`;
      sel.addEventListener('change', async () => {
        const r = await api('/api/auth/users/role', { method: 'POST', body: JSON.stringify({ username, role: sel.value }) });
        toast(r.ok ? `${username} → ${sel.value === 'admin' ? 'Admin' : 'Requester'}` : (r.error || 'failed'), r.ok);
      });
      roleEl.replaceWith(sel);
    }
  });
}

async function importPlex(msgEl) {
  msgEl.textContent = 'Importing…'; msgEl.style.color = '#9aa0ad';
  const users = await api('/api/settings/users');
  if (!Array.isArray(users) || !users.length) { msgEl.textContent = users.error || 'No Plex/Tautulli users found'; msgEl.style.color = '#ff9a9a'; return; }
  let created = 0, skipped = 0;
  for (const u of users) {
    const uname = (u.name || '').trim(); if (!uname) continue;
    const r = await api('/api/auth/users', { method: 'POST', body: JSON.stringify({ username: uname, password: randPass(), role: 'user' }) });
    if (r.ok) created++; else skipped++;   // skipped = already exists
  }
  msgEl.textContent = `✓ ${created} added, ${skipped} already existed. Set passwords via “Change password”.`;
  msgEl.style.color = '#7ef0b0';
  document.dispatchEvent(new CustomEvent('roles:reload'));
  // Trigger the Users tab to reload if it exposes loadUsers via re-click.
  const tab = document.querySelector('.settings-tab[data-tab="users"]'); if (tab) tab.click();
}

function toast(m, ok) { const w = document.getElementById('toasts'); if (!w) return; const e = document.createElement('div'); e.className = 'toast ' + (ok ? 'ok' : 'bad'); e.textContent = m; w.appendChild(e); setTimeout(() => e.remove(), 3000); }

injectStyles();
const obs = new MutationObserver(() => enhanceUserRows());
obs.observe(document.body, { childList: true, subtree: true });
setTimeout(enhanceUserRows, 600);
