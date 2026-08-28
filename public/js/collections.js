// collections.js — Franchise & Movie Collections Sub-Tab and Modal for NickSeer.
// Identifies incomplete franchises in user's library and allows one-click batch requesting with profile/folder selection.

function authHeaders() {
  const t = localStorage.getItem('nickseer_token');
  return t ? { Authorization: 'Bearer ' + t } : {};
}

async function api(path, options = {}) {
  try {
    const res = await fetch(path, {
      ...options,
      headers: { ...authHeaders(), ...(options.headers || {}) }
    });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

function toast(msg, type = 'ok') {
  const w = document.getElementById('toasts');
  if (!w) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  w.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// Client-side cache for collections
let collectionsCache = null;
let lastColFetch = 0;

function createCollectionCard(col) {
  const card = document.createElement('div');
  card.className = 'collection-card';
  card.setAttribute('data-nav', '');
  card.tabIndex = 0;

  const pct = col.completionPercent || 0;
  const isComplete = col.missing === 0 && col.owned > 0;
  const isIncomplete = col.owned > 0 && col.missing > 0;

  let badgeHtml = '';
  if (isComplete) {
    badgeHtml = `<span class="col-badge complete">✓ Complete (${col.total}/${col.total})</span>`;
  } else if (isIncomplete) {
    badgeHtml = `<span class="col-badge incomplete">⚡ ${col.owned}/${col.total} in Library · ${col.missing} Missing</span>`;
  } else {
    badgeHtml = `<span class="col-badge unowned">${col.total} Movies</span>`;
  }

  const posterImg = col.poster || col.backdrop || '/favicon.svg';

  card.innerHTML = `
    <div class="col-poster-wrap">
      <img class="col-poster" src="${posterImg}" alt="${col.name}" loading="lazy" decoding="async" />
      <div class="col-gradient-overlay"></div>
      ${badgeHtml}
      <div class="col-progress-wrap">
        <div class="col-progress-bar">
          <i style="width:${pct}%;background:${isComplete ? '#35d07f' : 'linear-gradient(90deg, #2E9BD6, #f5c518)'}"></i>
        </div>
      </div>
    </div>
    <div class="col-info">
      <div class="col-title" title="${col.name}">${col.name}</div>
      <div class="col-meta">${col.total} Parts · ${col.owned > 0 ? col.owned + ' Owned' : 'Not in library'}</div>
    </div>
  `;

  card.onclick = () => openCollectionModal(col.id);
  card.onkeydown = (e) => { if (e.key === 'Enter') openCollectionModal(col.id); };
  return card;
}

function createCollectionRow(title, subtitle, collections) {
  if (!collections || !collections.length) return null;
  const section = document.createElement('section');
  section.className = 'col-section';

  section.innerHTML = `
    <div class="col-section-head">
      <h3 class="col-section-title">${title}</h3>
      ${subtitle ? `<span class="col-section-sub">${subtitle}</span>` : ''}
    </div>
    <div class="col-row-scroller"></div>
  `;

  const scroller = section.querySelector('.col-row-scroller');
  collections.forEach(col => {
    scroller.appendChild(createCollectionCard(col));
  });

  return section;
}

export async function openCollectionRequestModal(col) {
  const missingParts = (col.parts || []).filter(p => !p.inLibrary && !p.isPending);
  if (!missingParts.length) {
    toast('All movies in this franchise are already in your library or requested!', 'ok');
    return;
  }

  let host = document.getElementById('requestModal');
  if (!host) {
    host = document.createElement('div');
    host.id = 'requestModal';
    host.className = 'req-overlay';
    document.body.appendChild(host);
  }

  host.classList.remove('hidden');
  host.innerHTML = `
    <div class="req-backdrop"></div>
    <div class="req-card">
      <div class="req-loading"><span class="sp">⟳</span> Loading Radarr options…</div>
    </div>
  `;

  host.querySelector('.req-backdrop').onclick = () => host.classList.add('hidden');

  const opts = await api('/api/request/options?media=movie');
  const cardEl = host.querySelector('.req-card');
  cardEl.style.setProperty('--req-bg', col.backdrop ? `url(${col.backdrop})` : 'none');

  if (opts.error) {
    cardEl.innerHTML = `
      <div class="req-head">
        <h3>${col.name}</h3>
      </div>
      <div class="req-body">
        <div class="req-note bad">⚠️ ${opts.error}</div>
      </div>
      <div class="req-footer">
        <button class="btn btn-ghost" id="reqCancel">Close</button>
      </div>
    `;
    host.querySelector('#reqCancel').onclick = () => host.classList.add('hidden');
    return;
  }

  const profileOpts = (opts.profiles || []).map(p =>
    `<option value="${p.id}" ${p.id == opts.defaultProfileId ? 'selected' : ''}>${p.name}${p.id == opts.defaultProfileId ? ' (Default)' : ''}</option>`
  ).join('');

  const rootOpts = (opts.rootFolders || []).map(f =>
    `<option value="${f.path}" ${f.path === opts.defaultRootFolder ? 'selected' : ''}>${f.label}${f.path === opts.defaultRootFolder ? ' (Default)' : ''}</option>`
  ).join('');

  const tagChips = (opts.tags || []).map(t =>
    `<span class="tag-chip" data-tag="${t.id}">${t.label}</span>`
  ).join('');

  cardEl.innerHTML = `
    <div class="req-hero" style="background-image:url(${col.backdrop || col.poster || ''});"></div>
    <div class="req-head">
      <div class="req-kicker">Batch Franchise Request</div>
      <div class="req-name">${col.name}</div>
      <button class="modal-close" id="reqCloseBtn" data-nav>✕</button>
    </div>

    <div class="req-body">
      <div class="req-note ${opts.autoApprove ? 'ok' : ''}" style="${opts.autoApprove ? '' : 'background:rgba(245,197,24,.12);color:#f5c518;'}">
        <span>ℹ️ ${opts.autoApprove ? `All ${missingParts.length} movies will be added to Radarr and monitored automatically.` : `All ${missingParts.length} movies will be submitted for admin approval.`}</span>
      </div>

      <div class="req-movies-card">
        <div class="req-movies-card-head">
          <span class="req-movies-icon">🎬</span>
          <span class="req-movies-title">Movies to be requested (${missingParts.length})</span>
        </div>
        <div class="req-movies-list">
          ${missingParts.map(p => `
            <div class="req-movie-row">
              <span class="req-movie-bullet">•</span>
              <span class="req-movie-name">${p.title}</span>
              <span class="req-movie-yr">${p.year ? '(' + p.year + ')' : ''}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="req-adv" style="font-size: 15px; margin: 14px 0 10px; color: #f0f7ff; font-weight: 800;">Radarr Settings</div>

      <div class="req-grid" style="grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 8px;">
        <div class="req-field">
          <label>Quality Profile</label>
          <select id="colQualityProfile" class="custom-select col-select">
            ${profileOpts}
          </select>
        </div>
        <div class="req-field">
          <label>Root Folder</label>
          <select id="colRootFolder" class="custom-select col-select">
            ${rootOpts}
          </select>
        </div>
      </div>

      ${tagChips ? `
        <div class="req-field" style="margin-top: 8px;">
          <label>Tags (Optional)</label>
          <div class="tag-picker">${tagChips}</div>
        </div>
      ` : ''}
    </div>

    <div class="req-footer">
      <button class="btn btn-ghost" id="reqCancelBtn">Cancel</button>
      <button class="btn btn-gold" id="reqSubmitAllBtn" style="background:linear-gradient(135deg,#e5a00d,#f5c518);color:#1a1500;font-weight:900;padding:11px 22px;border-radius:11px;box-shadow:0 4px 14px rgba(245,197,24,0.35);">
        🚀 Request All ${missingParts.length} Movies
      </button>
    </div>
  `;

  host.querySelector('#reqCloseBtn').onclick = () => host.classList.add('hidden');
  host.querySelector('#reqCancelBtn').onclick = () => host.classList.add('hidden');

  cardEl.querySelectorAll('.tag-chip').forEach(c => {
    c.onclick = () => c.classList.toggle('selected');
  });

  const submitBtn = host.querySelector('#reqSubmitAllBtn');
  submitBtn.onclick = async () => {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="sp">⟳</span> Sending to Radarr…`;

    const qualityProfileId = host.querySelector('#colQualityProfile')?.value;
    const rootFolder = host.querySelector('#colRootFolder')?.value;
    const selectedTags = [...host.querySelectorAll('.tag-chip.selected')].map(c => Number(c.dataset.tag));

    const res = await api('/api/request/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collectionId: col.id,
        qualityProfileId,
        rootFolder,
        tags: selectedTags
      })
    });

    if (res.ok) {
      host.classList.add('hidden');
      toast(`🎉 Successfully requested all ${res.requestedCount} movies for ${col.name}!`);
      
      const modal = document.getElementById('modalCard');
      if (modal) {
        modal.querySelectorAll('.btn-part-req').forEach(b => {
          b.parentElement.innerHTML = `<span class="col-part-pill pending">⏳ Requested</span>`;
        });
        const batchBtn = modal.querySelector('#btnRequestCollection');
        if (batchBtn) {
          batchBtn.innerHTML = `✓ Requested All Missing Movies`;
          batchBtn.style.background = '#35d07f';
          batchBtn.style.color = '#fff';
          batchBtn.disabled = true;
        }
      }
    } else {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `🚀 Request All ${missingParts.length} Movies`;
      toast(res.error || 'Failed to request movies', 'bad');
    }
  };
}

export async function openCollectionModal(collectionId) {
  const modal = document.getElementById('modal');
  const cardEl = document.getElementById('modalCard');
  if (!modal || !cardEl) return;

  modal.classList.remove('hidden');
  cardEl.innerHTML = '<div style="padding:60px;text-align:center;color:var(--muted)"><span class="sp">⟳</span> Loading Collection…</div>';
  
  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.onclick = () => modal.classList.add('hidden');

  const col = await api(`/api/discover/collection/${collectionId}`);
  if (col.error || !col.name) {
    cardEl.innerHTML = `<div style="padding:40px">⚠️ Could not load collection: ${col.error || 'not found'}</div>`;
    return;
  }

  const isComplete = col.missing === 0 && col.owned > 0;
  const pct = col.completionPercent || 0;

  const partsHtml = (col.parts || []).map(p => {
    let statusPill = '';
    if (p.inLibrary) {
      statusPill = `<span class="col-part-pill in-lib">✓ In library</span>`;
    } else if (p.isPending) {
      statusPill = `<span class="col-part-pill pending">⏳ Requested</span>`;
    } else {
      statusPill = `<button class="btn btn-accent btn-part-req" data-id="${p.id}" data-title="${p.title}" data-poster="${p.poster || ''}" data-backdrop="${p.backdrop || ''}">＋ Request</button>`;
    }

    return `
      <div class="col-part-card" data-movie-id="${p.id}">
        <div class="col-part-poster-wrap">
          <img src="${p.poster || '/favicon.svg'}" alt="${p.title}" loading="lazy" decoding="async" />
          ${p.rating ? `<span class="col-part-rating">★ ${p.rating}</span>` : ''}
        </div>
        <div class="col-part-info">
          <div class="col-part-title" title="${p.title}">${p.title}</div>
          <div class="col-part-year">${p.year || 'TBA'}</div>
          <div class="col-part-action">${statusPill}</div>
        </div>
      </div>
    `;
  }).join('');

  cardEl.innerHTML = `
    <button class="modal-close" id="modalCloseBtn" data-nav>✕</button>
    
    <div class="col-modal-hero" style="background-image:url(${col.backdrop || col.poster || ''})">
      <div class="col-modal-hero-overlay"></div>
      <div class="col-modal-hero-content">
        <img class="col-modal-poster" src="${col.poster || '/favicon.svg'}" alt="${col.name}" />
        <div class="col-modal-hero-text">
          <span class="col-badge-hero">🎬 Movie Franchise</span>
          <h2 class="col-modal-title">${col.name}</h2>
          <div class="col-modal-progress-row">
            <div class="col-modal-progress-bar">
              <i style="width:${pct}%;background:${isComplete ? '#35d07f' : 'linear-gradient(90deg, #2E9BD6, #f5c518)'}"></i>
            </div>
            <span class="col-modal-progress-txt"><b>${col.owned}/${col.total}</b> in Library (${pct}%)</span>
          </div>
          <div class="col-modal-actions">
            ${!isComplete ? `
              <button class="btn btn-gold btn-batch-request" id="btnRequestCollection" data-nav>
                ➕ Request All (${col.missing} Missing)
              </button>
            ` : `
              <div class="col-complete-msg">✓ Entire Franchise Complete in Library</div>
            `}
          </div>
        </div>
      </div>
    </div>

    <div class="col-modal-body">
      ${col.overview ? `<p class="col-modal-overview">${col.overview}</p>` : ''}
      <div class="col-section-head" style="margin-top:16px;">
        <h3 class="col-section-title">Movies in this Franchise (${col.total})</h3>
        <span class="col-section-sub">Arranged in release order</span>
      </div>
      <div class="col-parts-grid">
        ${partsHtml}
      </div>
    </div>
  `;

  document.getElementById('modalCloseBtn').onclick = () => modal.classList.add('hidden');

  // Single movie request button opens the standard request modal with resolution/quality profile
  cardEl.querySelectorAll('.btn-part-req').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const tmdbId = btn.dataset.id;
      const title = btn.dataset.title;
      const poster = btn.dataset.poster;
      const backdrop = btn.dataset.backdrop;
      if (window.openRequestModal) {
        window.openRequestModal({ id: tmdbId, media: 'movie', title, poster, backdrop });
      }
    };
  });

  // "Request All" opens the Batch Request Modal with resolution/quality profile
  const batchBtn = cardEl.querySelector('#btnRequestCollection');
  if (batchBtn) {
    batchBtn.onclick = () => {
      openCollectionRequestModal(col);
    };
  }

  // Clicking a movie part opens its full detail modal
  cardEl.querySelectorAll('.col-part-card').forEach(p => {
    p.onclick = () => {
      const mid = p.dataset.movieId;
      if (window.openDetail) {
        window.openDetail({ id: mid, media: 'movie' });
      }
    };
  });
}

window.openCollectionModal = openCollectionModal;
window.openCollectionRequestModal = openCollectionRequestModal;

export async function renderCollectionsView(force = false) {
  const root = document.getElementById('app');
  if (!root) return;

  const now = Date.now();
  if (!force && collectionsCache && (now - lastColFetch < 1800000)) {
    renderCollectionsData(root, collectionsCache);
    return;
  }

  root.innerHTML = `
    <div class="collections-view">
      <div class="collections-header">
        <div class="col-head-left">
          <h2 class="col-main-title">📦 Movie Collections & Franchises</h2>
          <p class="col-main-sub">Complete your movie sagas — suggestions based on movies in your Plex library with missing sequels & prequels.</p>
        </div>
      </div>
      <div id="colContent" class="collections-content">
        <div class="col-loading"><span class="sp">⟳</span> Discovering movie collections from your library…</div>
      </div>
    </div>
  `;

  const data = await api(`/api/discover/collections${force ? '?refresh=1' : ''}`);
  if (!data.error && data.all && data.all.length) {
    collectionsCache = data;
    lastColFetch = now;
  }
  renderCollectionsData(root, data);
}

function renderCollectionsData(container, data) {
  let colBox = container.querySelector('#colContent');
  if (!colBox) {
    container.innerHTML = `
      <div class="collections-view">
        <div class="collections-header">
          <div class="col-head-left">
            <h2 class="col-main-title">📦 Movie Collections & Franchises</h2>
            <p class="col-main-sub">Complete your movie sagas — suggestions based on movies in your Plex library with missing sequels & prequels.</p>
          </div>
        </div>
        <div id="colContent" class="collections-content"></div>
      </div>
    `;
    colBox = container.querySelector('#colContent');
  }

  if (data.error || !data.all || !data.all.length) {
    colBox.innerHTML = `<div class="empty-state"><h3>No collections found</h3><p>${data.error || 'Ensure TMDB API key is configured.'}</p></div>`;
    return;
  }

  colBox.innerHTML = '';

  if (data.incomplete && data.incomplete.length) {
    const row = createCollectionRow(
      '⚡ Incomplete in Your Library',
      'You own parts of these franchises — one click to complete the entire saga!',
      data.incomplete
    );
    if (row) colBox.appendChild(row);
  }

  if (data.popular && data.popular.length) {
    const row = createCollectionRow(
      '🔥 Popular Franchises & Sagas',
      'Acclaimed movie collections and complete universes to binge.',
      data.popular
    );
    if (row) colBox.appendChild(row);
  }

  if (data.completed && data.completed.length) {
    const row = createCollectionRow(
      '✓ Completed in Your Library',
      'Franchises where you already own every single movie!',
      data.completed
    );
    if (row) colBox.appendChild(row);
  }
}

window.renderCollectionsView = renderCollectionsView;
export default { renderCollectionsView, openCollectionModal, openCollectionRequestModal };
