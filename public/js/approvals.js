import { escHTML } from './util.js';
// approvals.js — "Approvals" tab (Seerr-style).
// Dedicated sub-tabs: [ ⏳ Pending (X) ] and [ ✓ Approved (Y) ] + [ ✕ Declined ] & [ All ].
// Admins see full details (quality profile, root folder, tags), and an inline Edit panel.
// Regular users see the status of their own. Includes 30s auto-polling.
const app = () => document.getElementById('app');
function token() { return localStorage.getItem('nickseer_token') || ''; }
function authHeaders() { const t = token(); return t ? { Authorization: 'Bearer ' + t } : {}; }
async function api(path, opts = {}) { try { const r = await fetch(path, { headers: { 'Content-Type': 'application/json', ...authHeaders() }, ...opts }); return await r.json(); } catch (e) { return { error: e.message }; } }

let optionsCache = {};
let currentFilter = 'pending'; // Default to pending so admin sees what needs action first
let pollTimer = null;

function injectStyles() {
  if (document.getElementById('appr-styles')) return;
  const css = `
  .appr-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 40px 8px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,.05);margin-bottom:12px;}
  .appr-title-group{display:flex;align-items:center;gap:12px;}
  .appr-title{font-size:26px;font-weight:800;letter-spacing:-.02em;}
  .appr-count{font-size:12px;font-weight:800;padding:4px 11px;border-radius:999px;background:rgba(245,197,24,.16);color:#f5c518;}
  .appr-subtabs{display:inline-flex;align-items:center;gap:4px;background:#14141d;border:1px solid rgba(255,255,255,.08);padding:4px;border-radius:11px;}
  .appr-subtab{border:0;background:transparent;color:#9aa0ad;font-size:13px;font-weight:700;padding:7px 16px;border-radius:8px;cursor:pointer;transition:all .18s;display:inline-flex;align-items:center;gap:6px;}
  .appr-subtab:hover{color:#fff;background:rgba(255,255,255,.06);}
  .appr-subtab.active{color:#fff;background:#2e9bd6;box-shadow:0 2px 10px rgba(46,155,214,.35);}
  .appr-subtab-badge{font-size:11px;font-weight:800;padding:2px 7px;border-radius:999px;background:rgba(0,0,0,.3);color:#fff;}
  .appr-list{display:flex;flex-direction:column;gap:12px;padding:8px 40px 40px;}
  .appr-row{display:flex;flex-direction:column;gap:0;background:#1a1a24;border:1px solid rgba(255,255,255,.06);border-radius:14px;overflow:hidden;transition:border-color .2s;}
  .appr-row:hover{border-color:rgba(255,255,255,.14);}
  .appr-top{display:flex;align-items:center;gap:14px;padding:14px 16px;}
  .appr-poster{width:56px;height:84px;border-radius:8px;object-fit:cover;background:#22222e;flex:0 0 auto;display:grid;place-items:center;font-size:22px;}
  .appr-main{flex:1;min-width:0;}
  .appr-t{font-size:16px;font-weight:800;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .appr-sub{font-size:13px;color:#9aa0ad;margin-top:3px;}
  .appr-meta{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:8px;}
  .appr-chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#b0b8c8;background:rgba(255,255,255,.06);padding:3px 10px;border-radius:7px;}
  .appr-chip .chip-label{color:#6e7785;margin-right:2px;}
  .appr-status{font-size:11.5px;font-weight:800;padding:5px 12px;border-radius:999px;letter-spacing:.02em;}
  .st-pending{background:rgba(245,197,24,.16);color:#f5c518;border:1px solid rgba(245,197,24,.3);}
  .st-approved{background:rgba(53,208,127,.16);color:#7ef0b0;border:1px solid rgba(53,208,127,.3);}
  .st-declined{background:rgba(229,9,20,.14);color:#ff9a9a;border:1px solid rgba(229,9,20,.3);}
  .appr-actions{display:flex;gap:8px;align-items:center;flex-shrink:0;}
  .appr-btn{border:0;border-radius:9px;padding:9px 16px;font-weight:800;font-size:13px;cursor:pointer;transition:filter .15s;}
  .appr-btn:hover{filter:brightness(1.15);}
  .appr-ok{background:#35d07f;color:#04150b;} .appr-no{background:rgba(229,9,20,.15);color:#ff9a9a;border:1px solid rgba(229,9,20,.4);}
  .appr-edit{background:rgba(46,155,214,.15);color:#5ec4f0;border:1px solid rgba(46,155,214,.3);}
  .appr-empty{padding:80px 40px;text-align:center;color:#9aa0ad;}
  .appr-empty h3{color:#fff;font-size:22px;margin-bottom:8px;}
  /* Edit panel */
  .appr-edit-panel{display:none;padding:0 16px 16px;border-top:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.2);animation:apprSlide .2s ease-out;}
  .appr-edit-panel.open{display:block;}
  @keyframes apprSlide{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
  .appr-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;}
  @media(max-width:600px){.appr-edit-grid{grid-template-columns:1fr;}.appr-head,.appr-list{padding-left:16px;padding-right:16px;}.appr-subtabs{max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;}.appr-subtabs::-webkit-scrollbar{display:none;}.appr-subtab{white-space:nowrap;}}
  .appr-edit-field label{display:block;font-size:11px;font-weight:700;color:#8a93a0;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;}
  .appr-edit-field select,.appr-edit-field input{width:100%;background:#12121a;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:10px 12px;color:#fff;font-size:13px;outline:none;}
  .appr-edit-field select:focus,.appr-edit-field input:focus{border-color:rgba(46,155,214,.6);}
  .appr-edit-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
  .appr-tag-pill{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#b0b8c8;background:rgba(245,197,24,.12);padding:4px 11px;border-radius:999px;cursor:pointer;transition:background .15s;border:1px solid rgba(245,197,24,.2);}
  .appr-tag-pill.selected{background:rgba(245,197,24,.28);color:#f5c518;border-color:rgba(245,197,24,.5);}
  .appr-edit-actions{display:flex;gap:10px;margin-top:14px;justify-content:flex-end;}
  .appr-save{background:#2e9bd6;color:#fff;border:0;}
  `;
  const st = document.createElement('style'); st.id = 'appr-styles'; st.textContent = css; document.head.appendChild(st);
}

function timeAgo(ts) { if (!ts) return ''; const s = Math.floor((Date.now() - ts) / 1000); if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; }

function profileName(id, kind) {
  const profiles = optionsCache[kind]?.profiles || [];
  const p = profiles.find((x) => String(x.id) === String(id));
  return p ? p.name : (id ? '#' + id : 'Default');
}

function tagLabels(tagIds, kind) {
  const allTags = optionsCache[kind]?.tags || [];
  return (tagIds || []).map((id) => { const t = allTags.find((x) => x.id === id); return t ? t.label : '#' + id; });
}

async function fetchOptions(media) {
  const kind = (media === 'tv' || media === 'show') ? 'sonarr' : 'radarr';
  if (optionsCache[kind]) return optionsCache[kind];
  const opts = await api('/api/request/options?media=' + (kind === 'sonarr' ? 'tv' : 'movie'));
  optionsCache[kind] = opts;
  return opts;
}

function renderMeta(r, kind) {
  const pName = profileName(r.qualityProfileId, kind);
  const rootLabel = r.rootFolder || 'Default';
  const tLabels = tagLabels(r.tags, kind);
  const newTLabels = (r.newTags || []).filter(Boolean);
  const allTags = [...tLabels, ...newTLabels];
  let html = `<div class="appr-meta">`;
  html += `<span class="appr-chip"><span class="chip-label">Profile:</span>${pName}</span>`;
  html += `<span class="appr-chip"><span class="chip-label">Root:</span>${rootLabel}</span>`;
  if (allTags.length) html += allTags.map((t) => `<span class="appr-chip" style="background:rgba(245,197,24,.1);color:#f5c518;">${t}</span>`).join('');
  html += `</div>`;
  return html;
}

async function render() {
  injectStyles();
  const root = app(); if (!root) return;

  const d = await api('/api/requests');
  const reqs = d.requests || [];

  const pendingList = reqs.filter((r) => r.status === 'pending');
  const approvedList = reqs.filter((r) => r.status === 'approved');
  const declinedList = reqs.filter((r) => r.status === 'declined');

  // If currently on pending but there are no pending items and we have approved items on first load, switch to approved or keep
  if (currentFilter === 'pending' && pendingList.length === 0 && approvedList.length > 0 && !root.querySelector('#apprSubtabs')) {
    currentFilter = 'approved';
  }

  root.innerHTML = `
    <div id="apprView">
      <div class="appr-head">
        <div class="appr-title-group">
          <div class="appr-title">📋 Requests</div>
          <span class="appr-count" id="apprCount">${pendingList.length} pending</span>
        </div>
        <div class="appr-subtabs" id="apprSubtabs">
          <button class="appr-subtab ${currentFilter === 'pending' ? 'active' : ''}" data-filter="pending">
            ⏳ Pending <span class="appr-subtab-badge">${pendingList.length}</span>
          </button>
          <button class="appr-subtab ${currentFilter === 'approved' ? 'active' : ''}" data-filter="approved">
            ✓ Approved <span class="appr-subtab-badge">${approvedList.length}</span>
          </button>
          <button class="appr-subtab ${currentFilter === 'declined' ? 'active' : ''}" data-filter="declined">
            ✕ Declined <span class="appr-subtab-badge">${declinedList.length}</span>
          </button>
          <button class="appr-subtab ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">
            All <span class="appr-subtab-badge">${reqs.length}</span>
          </button>
        </div>
      </div>
      <div class="appr-list" id="apprList"></div>
    </div>`;

  // Wire sub-tabs
  root.querySelectorAll('.appr-subtab').forEach((tab) => {
    tab.addEventListener('click', () => {
      currentFilter = tab.dataset.filter;
      render();
    });
  });

  const list = root.querySelector('#apprList');
  if (d.error) { list.innerHTML = `<div class="appr-empty"><h3>${escHTML(d.error)}</h3></div>`; return; }

  // Pre-fetch options for radarr/sonarr to resolve profile names
  const hasMovies = reqs.some((r) => r.media !== 'tv' && r.media !== 'show');
  const hasShows = reqs.some((r) => r.media === 'tv' || r.media === 'show');
  if (hasMovies) await fetchOptions('movie');
  if (hasShows) await fetchOptions('tv');

  const filtered = currentFilter === 'all' ? reqs : reqs.filter((r) => r.status === currentFilter);

  if (!filtered.length) {
    const titles = {
      pending: 'No pending requests',
      approved: 'No approved requests',
      declined: 'No declined requests',
      all: 'No requests yet'
    };
    const subtitles = {
      pending: 'All caught up! When a user submits a request, it will appear here.',
      approved: 'Approved movies and TV shows will appear here after review.',
      declined: 'Declined requests are tracked here.',
      all: 'When users submit requests, you can track them here.'
    };
    list.innerHTML = `<div class="appr-empty"><h3>${titles[currentFilter] || 'No requests'}</h3><p>${subtitles[currentFilter] || ''}</p></div>`;
    return;
  }

  const order = { pending: 0, approved: 1, declined: 2 };
  filtered.sort((a, b) => (order[a.status] - order[b.status]) || (b.at - a.at));

  list.innerHTML = filtered.map((r) => {
    const kind = (r.media === 'tv' || r.media === 'show') ? 'sonarr' : 'radarr';
    const stCls = r.status === 'pending' ? 'st-pending' : r.status === 'approved' ? 'st-approved' : 'st-declined';
    const stTxt = r.status === 'pending' ? '⏳ Pending Review' : r.status === 'approved' ? '✓ Approved' : '✕ Declined';
    const meta = renderMeta(r, kind);
    const actions = (d.admin && r.status === 'pending')
      ? `<div class="appr-actions"><button class="appr-btn appr-edit" data-editbtn="${r.id}" title="Edit settings before approving">✏️ Edit</button><button class="appr-btn appr-ok" data-approve="${r.id}">Approve</button><button class="appr-btn appr-no" data-decline="${r.id}">Decline</button></div>`
      : `<span class="appr-status ${stCls}">${stTxt}</span>`;
    return `<div class="appr-row" data-row="${r.id}">
      <div class="appr-top">
        ${r.poster ? `<img class="appr-poster" src="${r.poster}" alt="">` : `<div class="appr-poster">${r.media === 'tv' ? '📺' : '🎬'}</div>`}
        <div class="appr-main"><div class="appr-t">${r.title || ('#' + r.tmdbId)}</div><div class="appr-sub">${r.media === 'tv' ? 'Series' : 'Movie'} · requested by <b>${r.by || 'user'}</b> · ${timeAgo(r.at)}</div>${meta}</div>
        ${actions}
      </div>
      <div class="appr-edit-panel" id="edit-${r.id}"></div>
    </div>`;
  }).join('');

  // Wire approve/decline
  list.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true; b.textContent = 'Approving…';
    const r = await api(`/api/requests/${b.dataset.approve}/approve`, { method: 'POST' });
    if (r.ok) { toast('Request approved & added to download queue', 'ok'); render(); }
    else { b.disabled = false; b.textContent = 'Approve'; toast(r.error || 'failed'); }
  }));
  list.querySelectorAll('[data-decline]').forEach((b) => b.addEventListener('click', async () => {
    const r = await api(`/api/requests/${b.dataset.decline}/decline`, { method: 'POST' });
    if (r.ok) { toast('Request declined', 'ok'); render(); }
  }));

  // Wire edit buttons
  list.querySelectorAll('[data-editbtn]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.editbtn;
    const panel = document.getElementById('edit-' + id);
    if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
    const rq = reqs.find((r) => r.id === id);
    if (!rq) return;
    const kind = (rq.media === 'tv' || rq.media === 'show') ? 'sonarr' : 'radarr';
    const opts = optionsCache[kind] || await fetchOptions(rq.media === 'tv' ? 'tv' : 'movie');
    const profileOpts = (opts.profiles || []).map((p) => `<option value="${p.id}" ${String(p.id) === String(rq.qualityProfileId) ? 'selected' : ''}>${p.name}</option>`).join('');
    const rootOpts = (opts.rootFolders || []).map((f) => `<option value="${f.path}" ${f.path === rq.rootFolder ? 'selected' : ''}>${f.label}</option>`).join('');
    const allTags = opts.tags || [];
    const selectedTags = new Set((rq.tags || []).map(String));
    const tagPills = allTags.map((t) => `<span class="appr-tag-pill ${selectedTags.has(String(t.id)) ? 'selected' : ''}" data-tid="${t.id}">${t.label}</span>`).join('');
    panel.innerHTML = `
      <div class="appr-edit-grid">
        <div class="appr-edit-field"><label>Quality Profile</label><select id="editProfile-${id}">${profileOpts}</select></div>
        <div class="appr-edit-field"><label>Root Folder</label><select id="editRoot-${id}">${rootOpts}</select></div>
      </div>
      ${allTags.length ? `<div class="appr-edit-field" style="margin-top:10px;"><label>Tags</label><div class="appr-edit-tags" id="editTags-${id}">${tagPills}</div></div>` : ''}
      <div class="appr-edit-actions">
        <button class="appr-btn appr-edit" id="editCancel-${id}">Cancel</button>
        <button class="appr-btn appr-save" id="editSave-${id}">✔ Save Changes</button>
      </div>`;
    panel.classList.add('open');
    panel.querySelectorAll('.appr-tag-pill').forEach((pill) => pill.addEventListener('click', () => pill.classList.toggle('selected')));
    panel.querySelector('#editCancel-' + id).addEventListener('click', () => panel.classList.remove('open'));
    panel.querySelector('#editSave-' + id).addEventListener('click', async () => {
      const newProfile = panel.querySelector('#editProfile-' + id).value;
      const newRoot = panel.querySelector('#editRoot-' + id).value;
      const newTagIds = [...panel.querySelectorAll('.appr-tag-pill.selected')].map((p) => Number(p.dataset.tid));
      const saveBtn = panel.querySelector('#editSave-' + id);
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      const r = await api(`/api/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ qualityProfileId: newProfile, rootFolder: newRoot, tags: newTagIds }) });
      if (r.ok) { toast('Settings updated', 'ok'); render(); }
      else { saveBtn.disabled = false; saveBtn.textContent = '✔ Save Changes'; toast(r.error || 'Save failed'); }
    });
  }));
}

function toast(m, type) { const w = document.getElementById('toasts'); if (!w) return; const e = document.createElement('div'); e.className = 'toast ' + (type || 'bad'); e.textContent = m; w.appendChild(e); setTimeout(() => e.remove(), 3000); }
function isActive() { const b = document.querySelector('.nav-link[data-view="requests"]'); return b && b.classList.contains('active'); }

async function toggleTab() {
  const btn = document.querySelector('.nav-link[data-view="requests"]'); if (!btn) return;
  const [st, me] = await Promise.all([
    fetch('/api/auth/status').then((r) => r.json()).catch(() => ({})),
    (token() ? fetch('/api/auth/me', { headers: authHeaders() }).then((r) => r.json()).catch(() => ({})) : Promise.resolve({}))
  ]);
  const isAdmin = me?.user?.role === 'admin';
  btn.style.display = isAdmin ? '' : 'none';
}

function init() {
  toggleTab();
  const btn = document.querySelector('.nav-link[data-view="requests"]');
  if (btn) btn.addEventListener('click', () => setTimeout(render, 0));
  
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (isActive() && !document.querySelector('.appr-edit-panel.open')) {
      render();
    }
  }, 30000);

  const obs = new MutationObserver(() => { if (isActive() && !document.getElementById('apprView')) render(); });
  obs.observe(app() || document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 400));
else setTimeout(init, 400);
