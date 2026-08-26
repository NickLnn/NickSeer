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
  .ais-empty{padding:70px 40px;text-align:center;color:#9aa0ad;}
  .ais-empty h3{color:#fff;font-size:22px;margin-bottom:8px;}
  .ais-cta{margin-top:16px;padding:12px 22px;border:0;border-radius:11px;font-weight:800;background:linear-gradient(135deg,#6d5ef0,#1E88C7);color:#fff;cursor:pointer;}`;
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
  const modal = document.getElementById('modal'); const cardEl = document.getElementById('modalCard');
  if (!modal || !cardEl) return;
  modal.classList.remove('hidden');
  cardEl.innerHTML = '<div style="padding:60px;text-align:center;color:#9aa0ad">Loading…</div>';
  const bk = document.getElementById('modalBackdrop'); if (bk) bk.onclick = () => modal.classList.add('hidden');
  const media = item.media === 'show' ? 'tv' : (item.media || 'movie');
  const d = await api(`/api/discover/${media}/${item.id}`);
  if (d.error) { cardEl.innerHTML = `<div style="padding:40px">${d.error}</div>`; return; }
  const imdbBadge = d.imdbRating ? `<span class="imdb-badge"><span class="imdb-logo">IMDb</span><span class="imdb-score"><b>${d.imdbRating.toFixed(1)}</b>/10</span></span>` : '';
  const ytBtn = d.trailerKey ? `<a class="btn btn-ghost btn-yt" data-nav target="_blank" href="https://www.youtube.com/watch?v=${d.trailerKey}">YouTube</a>` : '';
  const imdbBtn = d.imdbUrl ? `<a class="btn btn-imdb" data-nav target="_blank" rel="noopener" href="${d.imdbUrl}">IMDb ↗</a>` : '';
  const hero = d.trailerKey ? `<div class="modal-video"><iframe src="https://www.youtube.com/embed/${d.trailerKey}?rel=0&modestbranding=1" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>` : `<div class="modal-hero" style="background-image:url(${d.backdrop || ''})"></div>`;
  cardEl.innerHTML = `<button class="modal-close" data-nav onclick="document.getElementById('modal').classList.add('hidden')">✕</button>${hero}<div class="modal-body">
    <h2 class="modal-title">${d.title || ''}</h2>${d.tagline ? `<div class="modal-tagline">${d.tagline}</div>` : ''}
    <div class="modal-meta">${d.year ? `<span>${d.year}</span>` : ''}${d.rating ? `<span style="color:var(--gold)">★ ${d.rating.toFixed(1)}</span>` : ''}<span class="chip">${media === 'tv' ? 'TV' : 'Movie'}</span>${(d.genres || []).slice(0, 3).map((g) => `<span class="chip">${g}</span>`).join('')}${imdbBadge}</div>
    ${item.why ? `<div class="why-chip" style="position:static;display:inline-block;margin-bottom:12px">✨ ${item.why}</div>` : ''}
    <p class="modal-overview">${d.overview || 'No description available.'}</p>
    <div class="modal-actions"><button class="btn btn-accent" id="aisReq">＋  Request</button>${ytBtn}${imdbBtn}</div></div>`;
  const rq = cardEl.querySelector('#aisReq');
  if (rq) rq.onclick = async () => { rq.disabled = true; rq.textContent = 'Requesting…'; const r = await fetch('/api/request', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ media, tmdbId: item.id, title: d.title, poster: item.poster }) }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message })); rq.textContent = r.ok ? '✓ Requested' : (r.code === 'pending' ? '✓ Sent for approval' : '✕ ' + (r.error || 'failed')); };
  if (window.__nsUpgradeButtons) window.__nsUpgradeButtons(cardEl);
}

async function render() {
  injectStyles();
  const root = app(); if (!root) return;
  root.innerHTML = `<div id="aisView"><div class="ais-head"><div class="ais-title">🤖 AI Suggestions <span class="ais-badge" id="aisSrc">…</span></div></div><div class="ais-sub" id="aisSub">Building your picks…</div><div class="ais-grid" id="aisGrid"></div></div>`;
  const d = await api('/api/discover/ai-suggest');
  const src = document.getElementById('aisSrc'); const sub = document.getElementById('aisSub'); const grid = document.getElementById('aisGrid');
  const days = d.days || (d.tuning && d.tuning.historyDays) || 60;

  if (!d.aiConfigured) {
    src.textContent = 'not set up'; sub.textContent = 'No AI provider configured.';
    grid.innerHTML = `<div class="ais-empty" style="grid-column:1/-1"><h3>Set up your AI brain</h3><p>Add your local model (llama.cpp/Ollama) or an OpenAI key for AI-ranked picks with reasons.</p><button class="ais-cta" id="aisCfg">Open Settings → AI Brain</button></div>`;
    const b = document.getElementById('aisCfg'); if (b) b.onclick = () => document.getElementById('settingsBtn')?.click();
    return;
  }
  if (d.note === 'no-history') { src.textContent = d.source === 'ai' ? 'AI' : 'rules'; sub.textContent = `No plays in the last ${days} days yet — watch a few things in Plex.`; grid.innerHTML = `<div class="ais-empty" style="grid-column:1/-1"><h3>Nothing to learn from yet</h3><p>Watch a few movies or episodes and this fills with tailored picks.</p></div>`; return; }
  src.textContent = d.source === 'ai' ? 'AI-ranked' : 'rule-based';
  sub.textContent = (d.basedOn && d.basedOn.length ? `Based on your last ${days} days: ${d.basedOn.join(', ')}` : `Tailored to your last ${days} days`);
  const items = d.items || [];
  if (!items.length) { grid.innerHTML = `<div class="ais-empty" style="grid-column:1/-1"><h3>No suggestions right now</h3><p>Try ⟳ refresh, or loosen the filters in Settings → AI Brain.</p></div>`; return; }
  items.forEach((it) => grid.appendChild(card(it)));
  if (window.__nsScanImdb) window.__nsScanImdb();   // ask imdb-badge to paint these
}
function isActive() { const b = document.querySelector('.nav-link[data-view="ai"]'); return b && b.classList.contains('active'); }
function init() {
  const btn = document.querySelector('.nav-link[data-view="ai"]');
  if (btn) btn.addEventListener('click', () => setTimeout(render, 0));
  const obs = new MutationObserver(() => { if (isActive() && !document.getElementById('aisView')) render(); });
  obs.observe(app() || document.body, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
else setTimeout(init, 300);
