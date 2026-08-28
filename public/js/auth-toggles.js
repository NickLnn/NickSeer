// auth-toggles.js — adds two working SWITCHES to Settings (like Seerr does):
//   1) "Require admin approval for requests" → POST /api/auth/approvals
//   2) "Allow Sign in with Plex"             → POST /api/auth/plex/enable
// These endpoints already exist on the server; this just gives you a real,
// visible way to flip them (which is why they appeared to do nothing before).
//
// SAFE by design (learned from the earlier crash): the MutationObserver here
// watches childList ONLY (never attributes), every injected element is
// guarded so it's only ever built once, and all work is debounced.
function token() { return localStorage.getItem('nickseer_token') || ''; }
function authHeaders() { const t = token(); return t ? { Authorization: 'Bearer ' + t } : {}; }
async function getJSON(url, opts) { try { return await fetch(url, { headers: { 'Content-Type': 'application/json', ...authHeaders() }, ...opts }).then((r) => r.json()); } catch (e) { return { ok: false, error: e.message }; } }

function injectStyles() {
  if (document.getElementById('auth-toggles-css')) return;
  const css = `
  .at-row{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);}
  .at-row:last-child{border-bottom:0;}
  .at-text{flex:1;min-width:0;}
  .at-title{font-weight:800;color:#eaeaf0;font-size:14px;margin-bottom:2px;}
  .at-sub{font-size:12px;color:#9aa0ad;line-height:1.4;}
  .at-switch{width:46px;height:26px;border-radius:999px;background:rgba(255,255,255,.14);position:relative;cursor:pointer;flex:0 0 auto;transition:.18s;border:0;}
  .at-switch.on{background:#1E88C7;}
  .at-switch i{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.18s;box-shadow:0 1px 3px rgba(0,0,0,.4);}
  .at-switch.on i{left:23px;}
  .at-switch:disabled{opacity:.5;cursor:default;}
  .at-block{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:6px 16px;margin:16px 0;}
  .at-heading{font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#9aa0ad;margin:18px 0 4px;}
  .at-msg{font-size:12px;font-weight:700;margin-top:6px;}`;
  const st = document.createElement('style'); st.id = 'auth-toggles-css'; st.textContent = css; document.head.appendChild(st);
}

function makeSwitch(on) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'at-switch' + (on ? ' on' : '');
  b.innerHTML = '<i></i>';
  return b;
}
function makeRow(title, sub, on) {
  const row = document.createElement('div'); row.className = 'at-row';
  const text = document.createElement('div'); text.className = 'at-text';
  text.innerHTML = `<div class="at-title">${title}</div><div class="at-sub">${sub}</div>`;
  const sw = makeSwitch(on);
  row.appendChild(text); row.appendChild(sw);
  return { row, sw };
}

async function buildBlock(container) {
  if (container.dataset.authToggles) return;   // one-shot guard
  container.dataset.authToggles = '1';
  injectStyles();

  const status = await getJSON('/api/auth/status');
  const block = document.createElement('div'); block.className = 'at-block';
  block.appendChild(Object.assign(document.createElement('div'), { className: 'at-heading', textContent: 'Access & requests' }));

  const { row: approvalRow, sw: approvalSw } = makeRow(
    'Require admin approval for requests',
    'When ON, requests from non-admin users go to the Approvals tab instead of being sent straight to Radarr/Sonarr.',
    !!status.approvals
  );
  const approvalMsg = document.createElement('div'); approvalMsg.className = 'at-msg';
  approvalSw.addEventListener('click', async () => {
    const next = !approvalSw.classList.contains('on');
    approvalSw.disabled = true; approvalMsg.textContent = 'Saving…'; approvalMsg.style.color = '#9aa0ad';
    const r = await getJSON('/api/auth/approvals', { method: 'POST', body: JSON.stringify({ approvals: next }) });
    approvalSw.disabled = false;
    if (r.ok) { approvalSw.classList.toggle('on', r.approvals); approvalMsg.textContent = r.approvals ? '✓ Non-admin requests now need approval' : '✓ Requests are auto-approved for everyone'; approvalMsg.style.color = '#7ef0b0'; }
    else { approvalMsg.textContent = '✕ ' + (r.error || 'failed — are you signed in as admin?'); approvalMsg.style.color = '#ff9a9a'; }
  });
  approvalRow.appendChild(approvalMsg);
  block.appendChild(approvalRow);

  const { row: plexRow, sw: plexSw } = makeRow(
    'Allow "Sign in with Plex"',
    'Shows a Plex sign-in option on the login screen, so family members can log in with their own Plex account.',
    !!status.plexLogin
  );
  const plexMsg = document.createElement('div'); plexMsg.className = 'at-msg';
  plexSw.addEventListener('click', async () => {
    const next = !plexSw.classList.contains('on');
    plexSw.disabled = true; plexMsg.textContent = 'Saving…'; plexMsg.style.color = '#9aa0ad';
    const r = await getJSON('/api/auth/plex/enable', { method: 'POST', body: JSON.stringify({ enabled: next }) });
    plexSw.disabled = false;
    if (r.ok) { plexSw.classList.toggle('on', r.enabled); plexMsg.textContent = r.enabled ? '✓ Plex sign-in is now available on the login screen' : '✓ Plex sign-in hidden'; plexMsg.style.color = '#7ef0b0'; }
    else { plexMsg.textContent = '✕ ' + (r.error || 'failed — are you signed in as admin?'); plexMsg.style.color = '#ff9a9a'; }
  });
  plexRow.appendChild(plexMsg);
  block.appendChild(plexRow);

  container.appendChild(block);
}

// Find the Settings "Users" panel (works with the common id/attr patterns used
// across this project's Settings implementations) and inject once.
function findUsersPanel() {
  const byId = document.getElementById('usersPane');
  if (byId) return byId;
  const activeTab = document.querySelector('.settings-tab[data-tab="users"].active, [data-tab="users"].active');
  if (activeTab) {
    const body = document.getElementById('settingsBody');
    if (body) return body;
  }
  // Fallback: any panel whose heading text mentions Users/Requesters/Approvals.
  const panels = document.querySelectorAll('#settingsBody, .settings-body, [id*="settings" i]');
  for (const p of panels) { if (/requester|approv/i.test(p.textContent || '')) return p; }
  return null;
}

function tick() { const panel = findUsersPanel(); if (panel) buildBlock(panel); }
let t = null;
const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(tick, 200); });
obs.observe(document.body, { childList: true, subtree: true });
setTimeout(tick, 500);
