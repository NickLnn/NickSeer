// approvals.js — "Approvals" tab (Seerr-style). Admins see all requests with
// Approve / Decline; regular users see the status of their own. Uses the
// existing /api/requests endpoints. The nav tab auto-hides for non-admins when
// there's nothing to show. Additive; no app.js changes.
const app = () => document.getElementById('app');
function token() { return localStorage.getItem('nickseer_token') || ''; }
function authHeaders() { const t = token(); return t ? { Authorization: 'Bearer ' + t } : {}; }
async function api(path, opts = {}) { try { const r = await fetch(path, { headers: { 'Content-Type': 'application/json', ...authHeaders() }, ...opts }); return await r.json(); } catch (e) { return { error: e.message }; } }

function injectStyles() {
  if (document.getElementById('appr-styles')) return;
  const css = `
  .appr-head{display:flex;align-items:center;gap:12px;padding:10px 40px 4px;}
  .appr-title{font-size:26px;font-weight:800;letter-spacing:-.02em;}
  .appr-count{font-size:12px;font-weight:800;padding:4px 10px;border-radius:999px;background:rgba(245,197,24,.16);color:#f5c518;}
  .appr-list{display:flex;flex-direction:column;gap:12px;padding:14px 40px 40px;}
  .appr-row{display:flex;align-items:center;gap:14px;background:#1a1a24;border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:12px 14px;}
  .appr-poster{width:52px;height:78px;border-radius:8px;object-fit:cover;background:#22222e;flex:0 0 auto;display:grid;place-items:center;font-size:20px;}
  .appr-main{flex:1;min-width:0;}
  .appr-t{font-weight:800;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .appr-sub{font-size:12.5px;color:#9aa0ad;}
  .appr-status{font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;}
  .st-pending{background:rgba(245,197,24,.16);color:#f5c518;} .st-approved{background:rgba(53,208,127,.16);color:#7ef0b0;} .st-declined{background:rgba(229,9,20,.14);color:#ff9a9a;}
  .appr-actions{display:flex;gap:8px;}
  .appr-btn{border:0;border-radius:9px;padding:8px 14px;font-weight:800;font-size:13px;cursor:pointer;}
  .appr-ok{background:#35d07f;color:#04150b;} .appr-no{background:rgba(229,9,20,.15);color:#ff9a9a;border:1px solid rgba(229,9,20,.4);}
  .appr-empty{padding:70px 40px;text-align:center;color:#9aa0ad;}
  .appr-empty h3{color:#fff;font-size:22px;margin-bottom:8px;}`;
  const st = document.createElement('style'); st.id = 'appr-styles'; st.textContent = css; document.head.appendChild(st);
}

function timeAgo(ts) { if (!ts) return ''; const s = Math.floor((Date.now() - ts) / 1000); if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; }

async function render() {
  injectStyles();
  const root = app(); if (!root) return;
  root.innerHTML = `<div id="apprView"><div class="appr-head"><div class="appr-title">✅ Approvals</div><span class="appr-count" id="apprCount"></span></div><div class="appr-list" id="apprList"><div class="row-sub" style="padding:20px">Loading…</div></div></div>`;
  const d = await api('/api/requests');
  const list = root.querySelector('#apprList'); const count = root.querySelector('#apprCount');
  if (d.error) { list.innerHTML = `<div class="appr-empty"><h3>${d.error}</h3></div>`; return; }
  const reqs = d.requests || [];
  const pending = reqs.filter((r) => r.status === 'pending');
  count.textContent = d.admin ? `${pending.length} pending` : `${reqs.length} of yours`;
  if (!reqs.length) { list.innerHTML = `<div class="appr-empty"><h3>${d.admin ? 'No requests to review' : 'You have no requests yet'}</h3><p>${d.admin ? 'When a user requests something, it appears here for approval.' : 'Request a movie or show and track its status here.'}</p></div>`; return; }
  const order = { pending: 0, approved: 1, declined: 2 };
  reqs.sort((a, b) => (order[a.status] - order[b.status]) || (b.at - a.at));
  list.innerHTML = reqs.map((r) => {
    const stCls = r.status === 'pending' ? 'st-pending' : r.status === 'approved' ? 'st-approved' : 'st-declined';
    const stTxt = r.status === 'pending' ? '● Pending' : r.status === 'approved' ? '✓ Approved' : '✕ Declined';
    const actions = (d.admin && r.status === 'pending')
      ? `<div class="appr-actions"><button class="appr-btn appr-ok" data-approve="${r.id}">Approve</button><button class="appr-btn appr-no" data-decline="${r.id}">Decline</button></div>`
      : `<span class="appr-status ${stCls}">${stTxt}</span>`;
    return `<div class="appr-row" data-row="${r.id}">
      ${r.poster ? `<img class="appr-poster" src="${r.poster}" alt="">` : `<div class="appr-poster">${r.media === 'tv' ? '📺' : '🎬'}</div>`}
      <div class="appr-main"><div class="appr-t">${r.title || ('#' + r.tmdbId)}</div><div class="appr-sub">${r.media === 'tv' ? 'Series' : 'Movie'} · requested by <b>${r.by || 'user'}</b> · ${timeAgo(r.at)}</div></div>
      ${actions}</div>`;
  }).join('');
  list.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; b.textContent = 'Approving…'; const r = await api(`/api/requests/${b.dataset.approve}/approve`, { method: 'POST' }); if (r.ok) render(); else { b.disabled = false; b.textContent = 'Approve'; toast(r.error || 'failed'); } }));
  list.querySelectorAll('[data-decline]').forEach((b) => b.addEventListener('click', async () => { const r = await api(`/api/requests/${b.dataset.decline}/decline`, { method: 'POST' }); if (r.ok) render(); }));
}
function toast(m) { const w = document.getElementById('toasts'); if (!w) return; const e = document.createElement('div'); e.className = 'toast bad'; e.textContent = m; w.appendChild(e); setTimeout(() => e.remove(), 3000); }
function isActive() { const b = document.querySelector('.nav-link[data-view="approvals"]'); return b && b.classList.contains('active'); }

// Show/hide the Approvals tab: visible to admins always; to users only when
// approvals mode is on (so they can track their pending requests).
async function toggleTab() {
  const btn = document.querySelector('.nav-link[data-view="approvals"]'); if (!btn) return;
  const [st, me] = await Promise.all([
    fetch('/api/auth/status').then((r) => r.json()).catch(() => ({})),
    (token() ? fetch('/api/auth/me', { headers: authHeaders() }).then((r) => r.json()).catch(() => ({})) : Promise.resolve({}))
  ]);
  const isAdmin = me?.user?.role === 'admin';
  const show = isAdmin || st.approvals;
  btn.style.display = show ? '' : 'none';
}

function init() {
  toggleTab();
  const btn = document.querySelector('.nav-link[data-view="approvals"]');
  if (btn) btn.addEventListener('click', () => setTimeout(render, 0));
  const obs = new MutationObserver(() => { if (isActive() && !document.getElementById('apprView')) render(); });
  obs.observe(app() || document.body, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 400));
else setTimeout(init, 400);
