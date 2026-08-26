// First-run wizard + Settings page. Includes a Users tab (local accounts,
// admin can create users / change passwords / enable login) and the Box Office
// country picker with flags.
import { toast } from './util.js';

const TABS = [
  { id: 'tmdb', label: 'TMDB' }, { id: 'imdb', label: 'IMDb' },
  { id: 'plex', label: 'Plex' }, { id: 'tautulli', label: 'Tautulli' },
  { id: 'radarr', label: 'Radarr' }, { id: 'sonarr', label: 'Sonarr' },
  { id: 'sabnzbd', label: 'SABnzbd' }, { id: 'gluetun', label: 'Gluetun' },
  { id: 'boxoffice', label: 'Box Office' }, { id: 'users', label: 'Users' },
  { id: 'ai', label: 'AI Brain' }, { id: 'general', label: 'General' }
];

const BOM_AREAS = [
  { code: '',   flag: '🇺🇸', name: 'United States & Canada (Domestic)' },
  { code: 'GR', flag: '🇬🇷', name: 'Greece' }, { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'DE', flag: '🇩🇪', name: 'Germany' }, { code: 'FR', flag: '🇫🇷', name: 'France' },
  { code: 'IT', flag: '🇮🇹', name: 'Italy' }, { code: 'ES', flag: '🇪🇸', name: 'Spain' },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands' }, { code: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil' }, { code: 'MX', flag: '🇲🇽', name: 'Mexico' },
  { code: 'JP', flag: '🇯🇵', name: 'Japan' }, { code: 'KR', flag: '🇰🇷', name: 'South Korea' },
  { code: 'IN', flag: '🇮🇳', name: 'India' }
];

let current = null;
let activeTab = 'tmdb';

function authHeaders() {
  const t = localStorage.getItem('nickseer_token');
  return t ? { Authorization: 'Bearer ' + t } : {};
}

export async function openSettings(firstRun = false) {
  current = await fetch('/api/settings', { headers: authHeaders() }).then((r) => r.json());
  activeTab = 'tmdb';
  document.getElementById('settings').classList.remove('hidden');
  render(firstRun);
}
function closeSettings() { document.getElementById('settings').classList.add('hidden'); }

function render(firstRun) {
  const el = document.getElementById('settings');
  el.innerHTML = `
    <div class="settings-card">
      <div class="settings-header"><span class="brand-mark"><svg viewBox="0 0 64 64" width="30" height="30"><defs><linearGradient id="sm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5ef0"/><stop offset="1" stop-color="#e50914"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#sm)"/><path d="M20 46V18h6l12 16V18h6v28h-6L26 30v16z" fill="#fff"/></svg></span>
        <div><h2>${firstRun ? 'Welcome to NickSeer' : 'Settings'}</h2>
        <p>${firstRun ? 'Connect your own services. Nothing is stored anywhere but on this NAS.' : 'Enter your service URLs & keys. Leave a masked field to keep it unchanged.'}</p></div>
      </div>
      <div class="settings-tabs">${TABS.map((t) => `<button class="settings-tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}</div>
      <div class="settings-body" id="settingsBody">${renderTab(activeTab)}</div>
      <div class="settings-footer"><span class="row-sub">Config lives in <code>/config/settings.json</code></span>
        <div style="display:flex;gap:10px;">
          ${firstRun ? '' : '<button class="btn btn-ghost" id="settingsCancel">Close</button>'}
          <button class="btn btn-accent" id="settingsSave">${firstRun ? 'Save & Start' : 'Save'}</button>
        </div>
      </div>
    </div>`;
  el.querySelectorAll('.settings-tab').forEach((t) => t.addEventListener('click', () => { collect(); activeTab = t.dataset.tab; render(firstRun); }));
  el.querySelector('#settingsSave').addEventListener('click', () => save(firstRun));
  const cancel = el.querySelector('#settingsCancel'); if (cancel) cancel.addEventListener('click', closeSettings);
  el.querySelectorAll('[data-test]').forEach((b) => b.addEventListener('click', () => testService(b.dataset.test)));
  wireSegs();
  if ((activeTab === 'radarr' || activeTab === 'sonarr') && current.services[activeTab].url) loadArrOptions(activeTab);
  if (activeTab === 'users') loadUsers();
}

function field(label, path, value, opts = {}) {
  const hint = opts.hint ? `<div class="hint">${opts.hint}</div>` : '';
  return `<div class="field"><label>${label}</label><input data-path="${path}" type="${opts.type || 'text'}" value="${value ?? ''}" placeholder="${opts.ph || ''}" />${hint}</div>`;
}
function selectField(label, path, id, cur, numeric, hint) {
  const opt = cur != null && cur !== '' ? `<option value="${cur}" selected>${cur}</option>` : '';
  return `<div class="field"><label>${label}</label><select id="${id}" data-path="${path}" ${numeric ? 'data-type="number"' : ''}>${opt}</select>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}
function testBlock(s) { return `<div class="test-line"><button class="test-btn" data-test="${s}" type="button">Test connection</button><span class="test-result" id="test-${s}"></span></div>`; }

function renderTab(tab) {
  const s = current.services;
  const bo = current.boxoffice || { source: 'bom', area: '' };
  switch (tab) {
    case 'tmdb':
      return field('TMDB API Key (v3)', 'tmdb.apiKey', current.tmdb.apiKey, { ph: 'your TMDB v3 key' })
        + field('…or TMDB Read Token (v4)', 'tmdb.readToken', current.tmdb.readToken, { ph: 'Bearer token', hint: 'Either works. v4 token takes priority.' })
        + `<div class="row-2">${field('Region', 'tmdb.region', current.tmdb.region, { ph: 'GR' })}${field('Language', 'tmdb.language', current.tmdb.language, { ph: 'en-US' })}</div>` + testBlock('tmdb');
    case 'imdb':
      return `<p class="row-sub" style="margin-bottom:14px">IMDb ratings need a free OMDb key (omdbapi.com).</p>`
        + field('OMDb API Key', 'omdb.apiKey', current.omdb.apiKey, { ph: 'free key from omdbapi.com', hint: 'Enables the IMDb rating + logo.' })
        + testBlock('omdb')
        + `<div class="row-2" style="margin-top:14px">${field('IMDb Top 250 (movies) list ID', 'imdb.movieListId', current.imdb.movieListId, { ph: '8647021' })}${field('IMDb Top 250 (TV) list ID', 'imdb.tvListId', current.imdb.tvListId, { ph: 'optional' })}</div>`;
    case 'plex':
      return field('Plex URL', 'services.plex.url', s.plex.url, { ph: 'http://192.168.x.x:32400' })
        + field('Plex Token', 'services.plex.token', s.plex.token, { hint: 'X-Plex-Token — watch history & library.' }) + testBlock('plex');
    case 'tautulli':
      return `<p class="row-sub" style="margin-bottom:14px">Optional — cleaner watch history + the "Who's watching?" profile list.</p>`
        + field('Tautulli URL', 'services.tautulli.url', s.tautulli.url, { ph: 'http://192.168.x.x:8181' })
        + field('Tautulli API Key', 'services.tautulli.apikey', s.tautulli.apikey) + testBlock('tautulli');
    case 'radarr':
      return field('Radarr URL', 'services.radarr.url', s.radarr.url, { ph: 'http://192.168.x.x:7878' })
        + field('Radarr API Key', 'services.radarr.apikey', s.radarr.apikey)
        + `<p class="row-sub" style="margin:6px 0 10px">Click <b>Test connection</b> to auto-load profiles & root folders.</p>`
        + `<div class="row-2">${selectField('Quality Profile', 'services.radarr.qualityProfileId', 'qp-radarr', s.radarr.qualityProfileId, true, 'Auto-filled after test.')}${selectField('Root Folder', 'services.radarr.rootFolder', 'rf-radarr', s.radarr.rootFolder, false, 'Auto-filled after test.')}</div>` + testBlock('radarr');
    case 'sonarr':
      return field('Sonarr URL', 'services.sonarr.url', s.sonarr.url, { ph: 'http://192.168.x.x:8989' })
        + field('Sonarr API Key', 'services.sonarr.apikey', s.sonarr.apikey)
        + `<p class="row-sub" style="margin:6px 0 10px">Click <b>Test connection</b> to auto-load profiles & root folders.</p>`
        + `<div class="row-2">${selectField('Quality Profile', 'services.sonarr.qualityProfileId', 'qp-sonarr', s.sonarr.qualityProfileId, true, 'Auto-filled after test.')}${selectField('Root Folder', 'services.sonarr.rootFolder', 'rf-sonarr', s.sonarr.rootFolder, false, 'Auto-filled after test.')}</div>` + testBlock('sonarr');
    case 'sabnzbd':
      return field('SABnzbd URL', 'services.sabnzbd.url', s.sabnzbd.url, { ph: 'http://192.168.x.x:8080' })
        + field('SABnzbd API Key', 'services.sabnzbd.apikey', s.sabnzbd.apikey) + testBlock('sabnzbd');
    case 'gluetun':
      return `<p class="row-sub" style="margin-bottom:14px">Gluetun v3.40+ control server is private by default. Set an API key on Gluetun and here.</p>`
        + field('Gluetun Control URL', 'services.gluetun.url', s.gluetun.url, { ph: 'http://192.168.x.x:8000' })
        + field('API Key', 'services.gluetun.apikey', s.gluetun.apikey, { hint: 'docker run --rm qmcgaw/gluetun genkey' })
        + `<div class="row-2">${field('Username', 'services.gluetun.username', s.gluetun.username)}${field('Password', 'services.gluetun.password', s.gluetun.password, { type: 'password' })}</div>` + testBlock('gluetun');
    case 'boxoffice':
      return `<div class="field"><label>Data source</label>
          <div class="seg" data-seg="boxoffice.source">
            <button data-val="bom" class="${bo.source !== 'tmdb' ? 'active' : ''}">Box Office Mojo (real $)</button>
            <button data-val="tmdb" class="${bo.source === 'tmdb' ? 'active' : ''}">TMDB proxy</button>
          </div></div>
        <div class="field"><label>Box office country / region</label>
          <select id="bo-area" data-path="boxoffice.area">
            ${BOM_AREAS.map((a) => `<option value="${a.code}" ${a.code === (bo.area || '') ? 'selected' : ''}>${a.flag}  ${a.name}${a.code ? ` (${a.code})` : ''}</option>`).join('')}
          </select>
          <div class="hint">🇺🇸 US &amp; Canada is the fullest chart; smaller countries (incl. 🇬🇷 Greece) are thinner.</div></div>`;
    case 'users':
      return `<div id="usersPane"><p class="row-sub">Loading users…</p></div>`;
    case 'ai':
      return `<div class="field"><label>AI provider</label>
          <div class="seg" data-seg="ai.provider">
            <button data-val="none" class="${current.ai.provider==='none'?'active':''}">None</button>
            <button data-val="openai" class="${current.ai.provider==='openai'?'active':''}">OpenAI</button>
            <button data-val="ollama" class="${current.ai.provider==='ollama'?'active':''}">Local (Ollama)</button>
          </div></div>
        ${field('OpenAI API Key', 'ai.openaiApiKey', current.ai.openaiApiKey)}
        ${field('OpenAI Model', 'ai.openaiModel', current.ai.openaiModel, { ph: 'gpt-4o-mini' })}
        ${field('Ollama URL', 'ai.ollamaUrl', current.ai.ollamaUrl, { ph: 'http://192.168.x.x:11434' })}
        ${field('Ollama Model', 'ai.ollamaModel', current.ai.ollamaModel, { ph: 'llama3.1' })}`;
    case 'general':
      return `<div class="field"><label>Recommendation level</label>
          <div class="seg" data-seg="recommendation.level">
            <button data-val="1" class="${current.recommendation.level==1?'active':''}">Level 1 · Rule-based</button>
            <button data-val="3" class="${current.recommendation.level==3?'active':''}">Level 3 · AI</button>
          </div></div>
        ${field('App name', 'app.name', current.app.name)}
        ${field('History depth', 'recommendation.historyDepth', current.recommendation.historyDepth, { type: 'number' })}`;
    default: return '';
  }
}

// ---- Users tab ----
async function loadUsers() {
  const pane = document.getElementById('usersPane');
  if (!pane) return;
  const data = await fetch('/api/auth/users', { headers: authHeaders() }).then((r) => r.json()).catch(() => ({ ok: false }));
  if (!data.ok) { pane.innerHTML = `<div class="req-note bad">${data.error || 'Only an admin can manage users.'}</div>`; return; }
  const users = data.users || [];
  pane.innerHTML = `
    <div class="field" style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
      <label style="margin:0">Require login for this instance</label>
      <div class="seg" id="authToggle" style="margin-left:auto">
        <button data-val="off" class="${data.enabled ? '' : 'active'}">Off</button>
        <button data-val="on" class="${data.enabled ? 'active' : ''}">On</button>
      </div>
    </div>
    <div class="hint" style="margin-bottom:14px">When on, everyone must log in. Turn it on only after creating an admin below.</div>
    <div id="userList">${users.map(userRow).join('') || '<p class="row-sub">No users yet — create the first admin below.</p>'}</div>
    <div class="section-label" style="margin-top:18px">Add user</div>
    <div class="row-2">
      <div class="field"><label>Username</label><input id="nu-name" placeholder="e.g. maria" autocomplete="off" /></div>
      <div class="field"><label>Password</label><input id="nu-pass" type="password" placeholder="choose a password" autocomplete="new-password" /></div>
    </div>
    <div class="field"><label>Role</label>
      <div class="seg" id="nu-role"><button data-val="user" class="active">User</button><button data-val="admin">Admin</button></div>
    </div>
    <button class="btn btn-accent" id="nu-add">Create user</button>
    <span id="nu-msg" class="test-result" style="margin-left:10px"></span>`;

  pane.querySelectorAll('#authToggle button').forEach((b) => b.addEventListener('click', async () => {
    const on = b.dataset.val === 'on';
    const r = await fetch('/api/auth/enable', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ enabled: on }) }).then((x) => x.json());
    if (r.ok) { toast(on ? 'Login required is ON' : 'Login turned OFF', 'ok'); loadUsers(); }
    else toast(r.error || 'Failed', 'bad');
  }));
  pane.querySelectorAll('#nu-role button').forEach((b) => b.addEventListener('click', () => { b.parentElement.querySelectorAll('button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); }));
  pane.querySelector('#nu-add').addEventListener('click', async () => {
    const username = pane.querySelector('#nu-name').value.trim();
    const password = pane.querySelector('#nu-pass').value;
    const role = pane.querySelector('#nu-role .active').dataset.val;
    const msg = pane.querySelector('#nu-msg');
    const r = await fetch('/api/auth/users', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ username, password, role }) }).then((x) => x.json());
    if (r.ok) { msg.textContent = '✓ created'; msg.className = 'test-result ok'; loadUsers(); }
    else { msg.textContent = '✕ ' + (r.error || 'failed'); msg.className = 'test-result bad'; }
  });
  pane.querySelectorAll('[data-pw]').forEach((b) => b.addEventListener('click', async () => {
    const username = b.dataset.pw;
    const np = prompt(`New password for ${username}:`);
    if (!np) return;
    const r = await fetch('/api/auth/users/password', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ username, password: np }) }).then((x) => x.json());
    toast(r.ok ? `Password updated for ${username}` : (r.error || 'failed'), r.ok ? 'ok' : 'bad');
  }));
  pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const username = b.dataset.del;
    if (!confirm(`Delete user ${username}?`)) return;
    const r = await fetch('/api/auth/users/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ username }) }).then((x) => x.json());
    if (r.ok) { toast(`Deleted ${username}`, 'ok'); loadUsers(); }
  }));
}
function userRow(u) {
  const initials = (u.username || '?').slice(0, 2).toUpperCase();
  return `<div class="user-row">
    <div class="user-av">${initials}</div>
    <div><div class="user-name">${u.username}</div><div class="user-role">${u.role === 'admin' ? '🛡️ Admin' : 'User'}</div></div>
    <div class="user-actions">
      <button class="mini-btn" data-pw="${u.username}">Change password</button>
      <button class="mini-btn danger" data-del="${u.username}">Delete</button>
    </div></div>`;
}

async function loadArrOptions(kind) {
  const qpSel = document.getElementById('qp-' + kind), rfSel = document.getElementById('rf-' + kind);
  try {
    const [profiles, roots] = await Promise.all([
      fetch(`/api/settings/arr/${kind}/profiles`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`/api/settings/arr/${kind}/rootfolders`, { headers: authHeaders() }).then((r) => r.json())
    ]);
    if (qpSel && Array.isArray(profiles) && profiles.length) {
      const cur = current.services[kind].qualityProfileId;
      qpSel.innerHTML = profiles.map((p) => `<option value="${p.id}" ${p.id == cur ? 'selected' : ''}>${p.name} (id ${p.id})</option>`).join('');
    }
    if (rfSel && Array.isArray(roots) && roots.length) {
      const cur = current.services[kind].rootFolder;
      rfSel.innerHTML = roots.map((f) => `<option value="${f.path}" ${f.path === cur ? 'selected' : ''}>${f.path}${f.freeSpace ? ` — ${fmtGB(f.freeSpace)} free` : ''}</option>`).join('');
    }
  } catch { /* keep current */ }
}
function fmtGB(b) { const gb = b / 1073741824; return gb > 1024 ? (gb / 1024).toFixed(1) + ' TB' : gb.toFixed(0) + ' GB'; }

function wireSegs() {
  document.querySelectorAll('#settingsBody [data-seg]:not(#authToggle):not(#nu-role) button').forEach((b) => b.addEventListener('click', () => {
    b.parentElement.querySelectorAll('button').forEach((x) => x.classList.remove('active')); b.classList.add('active');
  }));
}
function collect() {
  document.querySelectorAll('#settingsBody [data-path]').forEach((inp) => {
    const isNum = inp.dataset.type === 'number' || inp.type === 'number';
    setPath(current, inp.dataset.path, isNum ? (inp.value === '' ? null : Number(inp.value)) : inp.value);
  });
  document.querySelectorAll('#settingsBody [data-seg]').forEach((seg) => {
    if (seg.id === 'authToggle' || seg.id === 'nu-role') return;
    const active = seg.querySelector('.active'); if (active) { const raw = active.dataset.val; setPath(current, seg.dataset.seg, isNaN(raw) ? raw : Number(raw)); }
  });
}
function setPath(obj, path, val) { const parts = path.split('.'); let o = obj; for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; } o[parts[parts.length - 1]] = val; }

async function testService(service) {
  collect();
  const out = document.getElementById('test-' + service);
  out.textContent = 'Testing…'; out.className = 'test-result';
  try {
    const r = await fetch('/api/settings/test/' + service, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(buildPayloadFor(service)) }).then((x) => x.json());
    if (r.ok) { out.textContent = '✓ ' + (r.version ? 'v' + r.version : r.server || r.status || r.sample || 'Connected'); out.className = 'test-result ok'; if (service === 'radarr' || service === 'sonarr') loadArrOptions(service); }
    else { out.textContent = '✕ ' + (r.error || 'Failed'); out.className = 'test-result bad'; }
  } catch (e) { out.textContent = '✕ ' + e.message; out.className = 'test-result bad'; }
}
function buildPayloadFor(service) {
  if (service === 'tmdb') return { tmdb: current.tmdb };
  if (service === 'omdb') return { omdb: current.omdb };
  return { services: { [service]: current.services[service] } };
}

async function save(firstRun) {
  collect();
  const payload = JSON.parse(JSON.stringify(current));
  stripMasked(payload);
  delete payload.auth; // auth managed via its own endpoints
  const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(payload) }).then((x) => x.json());
  if (r.ok) { toast('Settings saved', 'ok'); closeSettings(); document.dispatchEvent(new CustomEvent('settings:saved')); }
  else toast(r.error || 'Save failed', 'bad');
}
function stripMasked(obj) { for (const k of Object.keys(obj)) { const v = obj[k]; if (typeof v === 'string' && v.startsWith('••••')) delete obj[k]; else if (v && typeof v === 'object') stripMasked(v); } }

document.getElementById('settingsBtn')?.addEventListener('click', () => openSettings(false));
document.addEventListener('nav:back', () => { const el = document.getElementById('settings'); if (el && !el.classList.contains('hidden')) closeSettings(); });

export { closeSettings };
