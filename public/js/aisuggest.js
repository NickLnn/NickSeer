import { escHTML } from './util.js';
// Overlay teardown is centralised in app.js: closing #modal by hand here left
// the modal card populated (a YouTube iframe kept playing) and, now that the
// body scroll lock exists, would have left the page frozen.
import { closeAllOverlays, applyScrollLock } from './overlay.js';
// aisuggest.js — dedicated "AI Suggestions" tab. Subtitle now reflects the REAL
// history window returned by the API (fixes the hardcoded "30 days"). Cards use
// the standard .card markup so imdb-badge.js adds IMDb ratings here too.
const app = () => document.getElementById('app');
function authHeaders() { const t = localStorage.getItem('nickseer_token'); return t ? { Authorization: 'Bearer ' + t } : {}; }
async function api(path) { try { const r = await fetch(path, { headers: authHeaders() }); return await r.json(); } catch (e) { return { error: e.message }; } }

function injectStyles() {
  if (document.getElementById('ais-styles')) return;
  const css = `
  .ais-head{display:flex;align-items:center;gap:12px;padding:10px 40px 2px;}
  .ais-title{font-size:26px;font-weight:800;letter-spacing:-.02em;display:flex;align-items:center;gap:10px;}
  .ais-badge{font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;background:linear-gradient(135deg,#6d5ef0,#1E88C7);color:#fff;}
  .ais-sub{padding:0 40px 10px;color:#9aa0ad;font-size:13.5px;}
  .ais-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:16px;padding:12px 40px 50px;}
  .ais-skel{aspect-ratio:2/3;border-radius:12px;background:linear-gradient(90deg,#16161f 25%,#1e1e2a 50%,#16161f 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;}
  .ais-badge.is-working{animation:aisPulse 1.2s ease-in-out infinite;}
  @keyframes aisPulse{50%{opacity:.55;}}
  @media (prefers-reduced-motion: reduce){.ais-skel,.ais-badge.is-working{animation:none;}}
  .ais-empty{padding:70px 40px;text-align:center;color:#9aa0ad;}
  .ais-empty h3{color:#fff;font-size:22px;margin-bottom:8px;}
  .ais-cta{margin-top:16px;padding:12px 22px;border:0;border-radius:11px;font-weight:800;background:linear-gradient(135deg,#6d5ef0,#1E88C7);color:#fff;cursor:pointer;}
  .ais-badge{white-space:nowrap;}
  /* Phones: the desktop 40px gutters left room for ONE 168px column on a
     375-428px screen, with the other half of the page empty. Two columns, and
     the reason chip drops under the rating badge instead of sitting on it. */
  @media (max-width: 768px){
    .ais-head{padding:8px 16px 2px;}
    .ais-title{font-size:22px;}
    .ais-sub{padding:0 16px 8px;font-size:12.5px;}
    .ais-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:8px 16px 40px;}
    .ais-grid .card{width:100% !important;min-width:0 !important;max-width:none !important;}
    .ais-grid .why-chip{top:36px !important;left:8px;right:auto !important;max-width:calc(100% - 16px) !important;}
    .ais-empty{padding:48px 20px;}
  }`;
  const st = document.createElement('style'); st.id = 'ais-styles'; st.textContent = css; document.head.appendChild(st);
}

// Standard card (so imdb-badge.js and nav pick it up).
function card(it) {
  const c = document.createElement('div');
  c.className = 'card'; c.setAttribute('data-nav', ''); c.tabIndex = 0;
  c.style.position = 'relative'; c.style.borderRadius = '12px'; c.style.overflow = 'hidden'; c.style.background = '#1a1a24'; c.style.cursor = 'pointer';
  c.innerHTML = `
    ${it.poster ? `<img class="card-poster" loading="lazy" src="${it.poster}" alt="" style="width:100%;aspect-ratio:2/3;object-fit:cover;display:block">` : `<div class="card-fallback" style="width:100%;aspect-ratio:2/3;display:grid;place-items:center;color:#9aa0ad">${it.title || 'No image'}</div>`}
    ${it.rating ? `<div class="card-badge" style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,.7);color:#f5c518;font-size:11px;font-weight:800;padding:3px 7px;border-radius:6px">★ ${Number(it.rating).toFixed(1)}</div>` : ''}
    ${it.why ? `<div class="why-chip" title="${it.why}" style="position:absolute;top:8px;right:8px;background:rgba(30,136,199,.92);color:#fff;font-size:10px;font-weight:700;padding:3px 7px;border-radius:6px;max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.why}</div>` : ''}
    <div class="card-info" style="position:absolute;inset:auto 0 0 0;padding:26px 10px 10px;background:linear-gradient(0deg,rgba(0,0,0,.9),transparent)">
      <div class="card-name" style="font-size:13px;font-weight:700;color:#fff">${it.title || ''}</div>
      <div class="card-year" style="font-size:11px;color:#9aa0ad">${it.year || ''}</div>
    </div>`;
  c.addEventListener('click', () => openDetail(it));
  return c;
}

async function openDetail(item) {
  if (window.openDetail && window.openDetail !== openDetail) {
    return window.openDetail(item);
  }
  const modal = document.getElementById('modal'); const cardEl = document.getElementById('modalCard');
  if (!modal || !cardEl) return;
  modal.classList.remove('hidden');
  applyScrollLock();
  cardEl.innerHTML = '<div style="padding:60px;text-align:center;color:#9aa0ad">Loading…</div>';
  const bk = document.getElementById('modalBackdrop'); if (bk) bk.onclick = closeAllOverlays;
  const media = item.media === 'show' ? 'tv' : (item.media || 'movie');
  const d = await api(`/api/discover/${media}/${item.id}`);
  if (d.error) { cardEl.innerHTML = `<div style="padding:40px">${escHTML(d.error)}</div>`; return; }
  const imdbBadge = d.imdbRating ? `<span class="imdb-badge"><span class="imdb-logo">IMDb</span><span class="imdb-score"><b>${d.imdbRating.toFixed(1)}</b>/10</span></span>` : '';
  const ytBtn = d.trailerKey ? `<a class="btn btn-ghost btn-yt" data-nav target="_blank" href="https://www.youtube.com/watch?v=${d.trailerKey}">YouTube</a>` : '';
  const imdbBtn = d.imdbUrl ? `<a class="btn btn-imdb" data-nav target="_blank" rel="noopener" href="${d.imdbUrl}">IMDb ↗</a>` : '';
  const hero = d.trailerKey ? `<div class="modal-video"><iframe src="https://www.youtube.com/embed/${d.trailerKey}?rel=0&modestbranding=1" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>` : `<div class="modal-hero" style="background-image:url(${d.backdrop || ''})"></div>`;
  
  let ownBadgesHtml = '';
    if (d.inLibrary) {
    if (d.plexUrl) {
      ownBadgesHtml += `<a class="own-pill in-lib interactive-lib-pill" href="${d.plexUrl}" target="_blank" rel="noopener noreferrer" title="Open in Plex"><span class="own-tick">✓</span>In library <span style="font-size:11px;opacity:0.85;margin-left:3px;">↗</span></a>`;
    } else {
      ownBadgesHtml += '<span class="own-pill in-lib" title="In your Plex library"><span class="own-tick">✓</span>In library</span>';
    }
  }
  if (media === 'tv' && d.seriesStatus) ownBadgesHtml += '<span class="own-pill ' + (d.seriesStatus === 'ended' ? 'ended' : 'cont') + '">' + (d.seriesStatus === 'ended' ? '■ Ended' : '● Continuing') + '</span>';
  
  cardEl.innerHTML = `<button class="modal-close" data-nav id="aisModalClose">✕</button>${hero}<div class="modal-body">
    <div class="title-row"><h2 class="modal-title">${d.title || ''}</h2><div class="own-badges">${ownBadgesHtml}</div></div>${d.tagline ? `<div class="modal-tagline">${d.tagline}</div>` : ''}
    <div class="modal-meta">${d.year ? `<span>${d.year}</span>` : ''}${d.rating ? `<span style="color:var(--gold)">★ ${d.rating.toFixed(1)}</span>` : ''}<span class="chip">${media === 'tv' ? 'TV' : 'Movie'}</span>${(d.genres || []).slice(0, 3).map((g) => `<span class="chip">${g}</span>`).join('')}${imdbBadge}</div>
    ${item.why ? `<div class="why-chip" style="position:static;display:inline-block;margin-bottom:12px">✨ ${item.why}</div>` : ''}
    <p class="modal-overview">${d.overview || 'No description available.'}</p>
    <div class="modal-actions"><button class="btn btn-accent" id="aisReq">＋  Request</button>${ytBtn}${imdbBtn}</div></div>`;
  
  cardEl.querySelector('#aisModalClose')?.addEventListener('click', closeAllOverlays);

  if (d.streamingService && window.renderStreamPill) {
    const ob = cardEl.querySelector('.own-badges');
    const sp = window.renderStreamPill(d.streamingService);
    if (ob && sp) ob.appendChild(sp);
  }
  
  const rq = cardEl.querySelector('#aisReq');
  if (rq) rq.onclick = async () => { rq.disabled = true; rq.textContent = 'Requesting…'; const r = await fetch('/api/request', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ media, tmdbId: item.id, title: d.title, poster: item.poster }) }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message })); rq.textContent = r.ok ? '✓ Requested' : (r.code === 'pending' ? '✓ Sent for approval' : '✕ ' + (r.error || 'failed')); };
  if (window.__nsUpgradeButtons) window.__nsUpgradeButtons(cardEl);
}

// The server now answers in two phases (server/lib/twophase.js): rule-based
// picks straight away with `pending: true`, then the AI-ranked list once the
// model has replied. This tab used to await ONE request that blocked on the
// model — up to 45s of "Building your picks…" over an empty grid, long enough
// that nobody waits it out.
const POLL_MS = 3000;
const POLL_MAX = 40;            // ~2 min, comfortably past the 45s model timeout
let renderSeq = 0;              // invalidates polls/paints from a superseded render
let pollTimer = null;
let last = null;                // { token, data } — instant repaint on return visits

function stopPolling() { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } }
function tokenKey() { return localStorage.getItem('nickseer_token') || ''; }
// Same list, same order, same reasons => nothing to repaint.
function signature(d) { return (d.source || '') + '|' + (d.pending ? 1 : 0) + '|' + (d.items || []).map((i) => `${i.media}:${i.id}:${i.why || ''}`).join(','); }

function skeletonCards(n = 12) {
  return Array.from({ length: n }).map(() => '<div class="ais-skel" aria-hidden="true"></div>').join('');
}

async function render() {
  injectStyles();
  const root = app(); if (!root) return;
  const seq = ++renderSeq;
  stopPolling();
  root.innerHTML = `<div id="aisView"><div class="ais-head"><div class="ais-title">🤖 AI Suggestions <span class="ais-badge" id="aisSrc">…</span></div></div><div class="ais-sub" id="aisSub">Building your picks…</div><div class="ais-grid" id="aisGrid">${skeletonCards()}</div></div>`;

  // Paint what we showed last time while the request is in flight.
  let shown = '';
  if (last && last.token === tokenKey()) { paint(last.data); shown = signature(last.data); }

  const alive = () => seq === renderSeq && !!document.getElementById('aisView');
  let tries = 0;
  const load = async () => {
    const d = await api('/api/discover/ai-suggest');
    if (!alive()) return;
    if (d.error && !(d.items && d.items.length)) {
      // Keep whatever is already on screen; only say so if there is nothing.
      if (!shown) paintError(d.error);
      return;
    }
    const sig = signature(d);
    if (sig !== shown) { paint(d); shown = sig; }
    last = { token: tokenKey(), data: d };
    if (d.pending && ++tries < POLL_MAX) pollTimer = setTimeout(load, POLL_MS);
    else if (d.pending) paint({ ...d, pending: false });   // model never answered: drop the "refining" note
  };
  load();
}

function paintError(msg) {
  const src = document.getElementById('aisSrc'); const sub = document.getElementById('aisSub'); const grid = document.getElementById('aisGrid');
  if (!grid) return;
  src.textContent = 'offline'; sub.textContent = 'Could not load suggestions.';
  grid.innerHTML = `<div class="ais-empty" style="grid-column:1/-1"><h3>Something went wrong</h3><p>${escHTML(msg)}</p><button class="ais-cta" id="aisRetry">Try again</button></div>`;
  const b = document.getElementById('aisRetry'); if (b) b.onclick = render;
}

function paint(d) {
  const src = document.getElementById('aisSrc'); const sub = document.getElementById('aisSub'); const grid = document.getElementById('aisGrid');
  if (!src || !sub || !grid) return;
  const days = d.days || (d.tuning && d.tuning.historyDays) || 60;
  grid.innerHTML = '';

  if (!d.aiConfigured) {
    src.textContent = 'not set up'; sub.textContent = 'No AI provider configured.';
    grid.innerHTML = `<div class="ais-empty" style="grid-column:1/-1"><h3>Set up your AI brain</h3><p>Add your local model (llama.cpp/Ollama) or an OpenAI key for AI-ranked picks with reasons.</p><button class="ais-cta" id="aisCfg">Open Settings → AI Brain</button></div>`;
    const b = document.getElementById('aisCfg'); if (b) b.onclick = () => document.getElementById('settingsBtn')?.click();
    return;
  }
  if (d.note === 'no-history') { src.textContent = d.source === 'ai' ? 'AI' : 'rules'; sub.textContent = `No plays in the last ${days} days yet — watch a few things in Plex.`; grid.innerHTML = `<div class="ais-empty" style="grid-column:1/-1"><h3>Nothing to learn from yet</h3><p>Watch a few movies or episodes and this fills with tailored picks.</p></div>`; return; }
  src.textContent = d.pending ? 'AI ranking…' : (d.source === 'ai' ? 'AI-ranked' : 'rule-based');
  src.classList.toggle('is-working', !!d.pending);
  sub.textContent = (d.basedOn && d.basedOn.length ? `Based on your last ${days} days: ${d.basedOn.join(', ')}` : `Tailored to your last ${days} days`)
    + (d.pending ? ' · quick picks shown — the AI is refining the order' : '');
  const items = d.items || [];
  if (!items.length) { grid.innerHTML = `<div class="ais-empty" style="grid-column:1/-1"><h3>No suggestions right now</h3><p>Try ⟳ refresh, or loosen the filters in Settings → AI Brain.</p></div>`; return; }
  items.forEach((it) => grid.appendChild(card(it)));
  if (window.__nsScanImdb) window.__nsScanImdb();   // ask imdb-badge to paint these
}
function isActive() { const b = document.querySelector('.nav-link[data-view="ai"]'); return b && b.classList.contains('active'); }
function init() {
  const btn = document.querySelector('.nav-link[data-view="ai"]');
  if (btn) btn.addEventListener('click', () => setTimeout(render, 0));
  const obs = new MutationObserver(() => {
    const here = !!document.getElementById('aisView');
    if (isActive() && !here) render();
    else if (!here) stopPolling();   // navigated away mid-rerank
  });
  obs.observe(app() || document.body, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
else setTimeout(init, 300);


