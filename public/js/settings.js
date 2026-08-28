const LOGOS = {
  "tmdb": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\" width=\"24\" height=\"24\"><defs><linearGradient id=\"tmdbg\" x1=\"0\" x2=\"1\" y1=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"#01b4e4\"/><stop offset=\"100%\" stop-color=\"#90cea1\"/></linearGradient></defs><rect width=\"512\" height=\"512\" rx=\"110\" fill=\"#0d253f\"/><rect x=\"64\" y=\"176\" width=\"384\" height=\"160\" rx=\"80\" fill=\"url(#tmdbg)\"/><text x=\"256\" y=\"285\" font-family=\"'Inter',system-ui,sans-serif\" font-weight=\"900\" font-size=\"92\" fill=\"#0d253f\" text-anchor=\"middle\" letter-spacing=\"4\">TMDB</text></svg>",
  "imdb": "<svg viewBox=\"0 0 192 110\" width=\"28\" height=\"16\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"192\" height=\"110\" rx=\"22\" fill=\"#F5C518\"/><text x=\"96\" y=\"82\" font-family=\"'Impact','Arial Black',sans-serif\" font-weight=\"900\" font-size=\"76\" fill=\"#000000\" text-anchor=\"middle\" letter-spacing=\"-2\">IMDb</text></svg>",
  "boxoffice": "<svg viewBox=\"0 0 192 192\" width=\"24\" height=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"192\" height=\"192\" rx=\"42\" fill=\"#1B2438\" stroke=\"rgba(245,197,24,0.4)\" stroke-width=\"8\"/><path d=\"M42 142 L76 90 L110 114 L154 54\" fill=\"none\" stroke=\"#F5C518\" stroke-width=\"14\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"154\" cy=\"54\" r=\"12\" fill=\"#F5C518\"/></svg>",
  "plex": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\" width=\"24\" height=\"24\"><rect width=\"512\" height=\"512\" fill=\"#282a2d\" rx=\"15%\"/><path fill=\"#e5a00d\" d=\"m146.4 116 110.1 140-110.1 140h89.8l110.1-140L236.2 116z\"/></svg>",
  "tautulli": "<svg viewBox=\"0 0 300 300\" width=\"24\" height=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><path fill=\"#00BCD4\" d=\"M241.8 215.25c-10.9 0-20.4 6.38-24.8 15.62l-39.4-5.71c-.14-15.07-12.4-27.24-27.5-27.24-5.38 0-10.4 1.55-14.65 4.23l-56-63.41c3.22-4.51 5.13-10.02 5.13-15.98 0-15.19-12.31-27.5-27.5-27.5s-27.5 12.31-27.5 27.5 12.31 27.5 27.5 27.5c4.68 0 9.08-1.17 12.93-3.23l56.56 64.09c-2.54 4.17-4.01 9.06-4.01 14.31 0 15.19 12.31 27.5 27.5 27.5 10.87 0 20.27-6.31 24.73-15.47l39.46 5.73c.23 14.99 12.44 27.07 27.49 27.07 15.19 0 27.5-12.31 27.5-27.5s-12.31-27.5-27.5-27.5z\"/><path fill=\"#E5A00D\" d=\"M241.8 29.75c-15.19 0-27.5 12.31-27.5 27.5 0 7.48 2.99 14.26 7.84 19.22l-60.94 86.11c-3.39-1.49-7.14-2.33-11.08-2.33-15.19 0-27.5 12.31-27.5 27.5 0 2.7.4 5.31 1.13 7.78l-46.31 28.67c-5.03-5.5-12.26-8.95-20.3-8.95-15.19 0-27.5 12.31-27.5 27.5s12.31 27.5 27.5 27.5 27.5-12.31 27.5-27.5c0-2.63-.38-5.17-1.06-7.57l46.4-28.72c5.02 5.41 12.19 8.79 20.15 8.79 15.19 0 27.5-12.31 27.5-27.5 0-6.7-2.4-12.84-6.38-17.61l61.51-86.92c2.84.99 5.88 1.53 9.05 1.53 15.19 0 27.5-12.31 27.5-27.5s-12.31-27.5-27.5-27.5z\"/></svg>",
  "radarr": "<svg viewBox=\"0 0 1024 1024\" width=\"24\" height=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><g transform=\"translate(70, 21)\"><path d=\"M105.302 154.943L112.824 869.492C52.651 877.014 7.52158 846.927 7.52158 786.755L0 192.55C0 4.51106 172.996 -40.6184 278.298 34.5974L812.33 342.982C887.546 395.633 902.589 493.413 864.981 561.107C857.46 508.456 834.895 478.37 789.765 448.284L188.039 109.813C142.91 79.7268 105.302 87.2484 105.302 154.943Z\" fill=\"#ffc230\"/><path d=\"M0 376.079C45.1295 391.122 90.259 383.6 127.867 361.036L744.636 0C782.244 52.651 774.723 105.302 729.593 135.388L210.604 436.251C135.388 473.859 37.6079 436.251 0 376.079Z\" transform=\"translate(60.17 531.02)\" fill=\"#ffc230\"/><path d=\"M0 413.687L368.557 203.083L7.52157 0L0 413.687Z\" transform=\"translate(240.69 282.81)\" fill=\"#ffffff\"/></g></svg>",
  "sonarr": "<svg viewBox=\"0 0 216.7 216.9\" width=\"24\" height=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M216.7 108.45c0 29.833-10.533 55.4-31.6 76.7-.7.833-1.483 1.6-2.35 2.3-3.466 3.4-7.133 6.484-11 9.25-18.267 13.467-39.367 20.2-63.3 20.2-23.967 0-45.033-6.733-63.2-20.2-4.8-3.4-9.3-7.25-13.5-11.55-16.367-16.266-26.417-35.167-30.15-56.7-.733-4.2-1.217-8.467-1.45-12.8-.1-2.4-.15-4.8-.15-7.2 0-2.533.05-4.95.15-7.25 0-.233.066-.467.2-.7 1.567-26.6 12.033-49.583 31.4-68.95C53.05 10.517 78.617 0 108.45 0c29.933 0 55.484 10.517 76.65 31.55 21.067 21.433 31.6 47.067 31.6 76.9z\" fill=\"#00C8F8\"/><path d=\"M194.65 42.5l-22.4 22.4C159.152 77.998 158 89.4 158 109.5c0 17.934 2.852 34.352 16.2 47.7 9.746 9.746 19 18.95 19 18.95-2.5 3.067-5.2 6.067-8.1 9-.7.833-1.483 1.6-2.35 2.3-2.533 2.5-5.167 4.817-7.9 6.95l-17.55-17.55c-15.598-15.6-27.996-17.1-48.6-17.1-19.77 0-33.223 1.822-47.7 16.3-8.647 8.647-18.55 18.6-18.55 18.6-3.767-2.867-7.333-6.034-10.7-9.5-2.8-2.8-5.417-5.667-7.85-8.6 0 0 9.798-9.848 19.15-19.2 13.852-13.853 16.1-29.916 16.1-47.85 0-17.5-2.874-33.823-15.6-46.55-8.835-8.836-21.05-21-21.05-21 2.833-3.6 5.917-7.067 9.25-10.4 2.934-2.867 5.934-5.55 9-8.05L61.1 43.85C74.102 56.852 90.767 60.2 108.7 60.2c18.467 0 35.077-3.577 48.6-17.1 8.32-8.32 19.3-19.25 19.3-19.25 2.9 2.367 5.733 4.933 8.5 7.7 3.467 3.533 6.65 7.183 9.55 10.95z\" fill=\"#182433\"/><circle cx=\"108.4\" cy=\"108.4\" r=\"28\" fill=\"#00C8F8\"/></svg>",
  "sabnzbd": "<svg viewBox=\"0 0 608 608\" width=\"24\" height=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M121.86 23.913h363.604v266.135h97.89l-279.69 293.667L23.97 290.048h97.89V23.913z\" fill=\"#FFB300\"/><path d=\"M303.664 583.797L122.274 23.975h362.78l-181.39 559.822z\" fill=\"#FFCA28\"/><path d=\"M200.157 512.87H50.46v-31.503h88.824v-27.95H50.46v-90.48h149.697V394.2h-88.823v27.95h88.823v90.718zm88.823-31.503h27.95v-27.95h-27.95v27.95zm88.824 31.503H228.107v-90.718h88.823v-27.95h-88.823v-31.266h149.697V512.87zm88.823-31.503h27.95v-87.165h-27.95v87.165zm-60.874 31.503V303.72h60.874v59.216h88.823V512.87H405.753z\" fill=\"#FFFFFF\"/></svg>",
  "gluetun": "<svg viewBox=\"0 0 100 100\" width=\"24\" height=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M50 8 L88 24 L88 56 C88 76 50 94 50 94 C50 94 12 76 12 56 L12 24 Z\" fill=\"#0E1626\" stroke=\"#2563EB\" stroke-width=\"6\" stroke-linejoin=\"round\"/><path d=\"M50 30 C38 30 28 40 28 52 C28 64 38 74 50 74 C58 74 65 68 68 60 L50 60 L50 48 L76 48 C76 49.5 76 51 76 52 C76 68 64 82 50 82 C33 82 20 68 20 52 C20 35 33 22 50 22 C59 22 67 26 73 32 L64 41 C60 37 55 30 50 30 Z\" fill=\"#38BDF8\"/></svg>",
  "ai": "<svg viewBox=\"0 0 192 192\" width=\"24\" height=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><defs><linearGradient id=\"aig\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0%\" stop-color=\"#A855F7\"/><stop offset=\"100%\" stop-color=\"#6366F1\"/></linearGradient></defs><rect width=\"192\" height=\"192\" rx=\"42\" fill=\"#1E1833\"/><path d=\"M96 32 L112 80 L160 96 L112 112 L96 160 L80 112 L32 96 L80 80 Z\" fill=\"url(#aig)\"/><circle cx=\"150\" cy=\"42\" r=\"10\" fill=\"#C084FC\"/></svg>",
  "users": "<svg viewBox=\"0 0 192 192\" width=\"24\" height=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"192\" height=\"192\" rx=\"42\" fill=\"#1E2238\"/><circle cx=\"80\" cy=\"70\" r=\"24\" fill=\"#818CF8\"/><path d=\"M42 140 C42 116 60 102 80 102 C100 102 118 116 118 140 Z\" fill=\"#818CF8\"/><circle cx=\"128\" cy=\"70\" r=\"18\" fill=\"#A5B4FC\" opacity=\"0.8\"/><path d=\"M118 110 C128 112 144 120 144 140\" fill=\"none\" stroke=\"#A5B4FC\" stroke-width=\"10\" stroke-linecap=\"round\" opacity=\"0.8\"/></svg>",
  "general": "<svg viewBox=\"0 0 192 192\" width=\"24\" height=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"192\" height=\"192\" rx=\"42\" fill=\"#1B2333\"/><path d=\"M96 68 A28 28 0 1 0 96 124 A28 28 0 1 0 96 68 Z M96 32 L104 50 L126 42 L132 64 L154 64 L148 86 L164 96 L148 106 L154 128 L132 128 L126 150 L104 142 L96 160 L88 142 L66 150 L60 128 L38 128 L44 106 L28 96 L44 86 L38 64 L60 64 L66 42 L88 50 Z\" fill=\"#94A3B8\"/></svg>"
};

// settings.js — State-of-the-Art Split-Pane Settings Hub for NickSeer.
// Features a modern left sidebar navigation and rich right configuration panel with guides.
import { toast } from './util.js';

const TABS = [
  { group: 'Metadata & Discovery', items: [
    { id: 'tmdb', label: 'TMDB', desc: 'The Movie Database metadata & poster provider' },
    { id: 'imdb', label: 'IMDb', desc: 'OMDb ratings, badges and top charts' },
    { id: 'boxoffice', label: 'Box Office', desc: 'Worldwide and local box office charts' }
  ]},
  { group: 'Media & Streaming', items: [
    { id: 'plex', label: 'Plex Server', desc: 'Plex media library ownership & server sync' },
    { id: 'tautulli', label: 'Tautulli', desc: 'Stream monitoring, user taste history & stats' }
  ]},
  { group: 'Arr & Downloads', items: [
    { id: 'radarr', label: 'Radarr', desc: 'Movie automation and library management' },
    { id: 'sonarr', label: 'Sonarr', desc: 'TV series automation and season monitoring' },
    { id: 'sabnzbd', label: 'SABnzbd', desc: 'Usenet download client' },
    { id: 'gluetun', label: 'Gluetun VPN', desc: 'VPN client connectivity and health' }
  ]},
  { group: 'Intelligence & System', items: [
    { id: 'ai', label: 'AI Brain', desc: 'AI-powered reranking and smart suggestions' },
    { id: 'users', label: 'Users & Auth', desc: 'Multi-user access control and accounts' },
    { id: 'general', label: 'General', desc: 'Application preferences and tuning' }
  ]}
];

const BOM_AREAS = [
  { code: '', flag: '🇺🇸', name: 'United States & Canada (Domestic)' },
  { code: 'GR', flag: '🇬🇷', name: 'Greece' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: 'FR', flag: '🇫🇷', name: 'France' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia' }
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
  const overlay = document.getElementById('settings');
  if (overlay) overlay.classList.remove('hidden');
  render(firstRun);
}

function closeSettings() {
  const overlay = document.getElementById('settings');
  if (overlay) overlay.classList.add('hidden');
}

function render(firstRun) {
  const el = document.getElementById('settings');
  if (!el) return;

  const currentTabMeta = TABS.flatMap(g => g.items).find(t => t.id === activeTab) || { label: 'Settings', desc: '' };

  const sidebarHtml = TABS.map(group => `
    <div class="set-nav-group">
      <div class="set-nav-group-title">${group.group}</div>
      ${group.items.map(t => `
        <button type="button" class="set-nav-btn ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">
          <span class="set-nav-icon">${LOGOS[t.id] || LOGOS.general}</span>
          <span class="set-nav-label">${t.label}</span>
        </button>
      `).join('')}
    </div>
  `).join('');

  el.innerHTML = `
    <div class="settings-modal-card">
      <div class="settings-hub-head">
        <div class="settings-hub-brand">
          <span class="brand-mark">
            <svg viewBox="0 0 64 64" width="28" height="28">
              <defs><linearGradient id="sm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2E9BD6"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
              <rect width="64" height="64" rx="14" fill="url(#sm)"/>
              <path d="M20 46V18h6l12 16V18h6v28h-6L26 30v16z" fill="#fff"/>
            </svg>
          </span>
          <div>
            <h2 class="settings-hub-title">${firstRun ? 'Welcome to NickSeer Setup' : 'NickSeer Settings'}</h2>
            <p class="settings-hub-sub">${firstRun ? 'Connect your services. Stored securely on your NAS only.' : 'Configure your integrations, media servers, and downloaders.'}</p>
          </div>
        </div>
        <button type="button" class="modal-close" id="settingsCloseBtn" title="Close Settings">✕</button>
      </div>

      <div class="settings-hub-split">
        <!-- Left Navigation Sidebar -->
        <aside class="settings-sidebar">
          <div class="settings-sidebar-scroll">
            ${sidebarHtml}
          </div>
        </aside>

        <!-- Right Content & Guide Area -->
        <main class="settings-content-panel">
          <div class="set-panel-head">
            <div class="set-panel-title-wrap">
              <span class="set-panel-icon">${LOGOS[activeTab] || LOGOS.general}</span>
              <div>
                <h3 class="set-panel-title">${currentTabMeta.label}</h3>
                <p class="set-panel-desc">${currentTabMeta.desc}</p>
              </div>
            </div>
          </div>

          <div class="set-panel-body" id="settingsBody">
            ${renderTab(activeTab)}
          </div>
        </main>
      </div>

      <div class="settings-hub-foot">
        <div class="set-foot-hint">📁 Config stored in <code>/config/settings.json</code></div>
        <div class="set-foot-actions">
          ${firstRun ? '' : '<button type="button" class="btn btn-ghost" id="settingsCancel">Close</button>'}
          <button type="button" class="btn btn-gold" id="settingsSave" style="background:linear-gradient(135deg,#e5a00d,#f5c518);color:#1a1500;font-weight:900;padding:10px 22px;border-radius:10px;">
            ${firstRun ? '🚀 Save & Start' : '💾 Save Changes'}
          </button>
        </div>
      </div>
    </div>
  `;

  // Wire Tab Switches
  el.querySelectorAll('.set-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      collect();
      activeTab = btn.dataset.tab;
      render(firstRun);
    });
  });

  // Wire Close / Save
  
  el.querySelector('#settingsCloseBtn')?.addEventListener('click', closeSettings);
  el.querySelector('#settingsCancel')?.addEventListener('click', closeSettings);
  el.querySelector('#settingsSave')?.addEventListener('click', () => save(firstRun));

  // Wire Test buttons
  el.querySelectorAll('[data-test]').forEach(btn => {
    btn.addEventListener('click', () => testService(btn.dataset.test));
  });

  wireSegs();

  if ((activeTab === 'radarr' || activeTab === 'sonarr') && current.services[activeTab].url) {
    loadArrOptions(activeTab);
  }
  if (activeTab === 'plex') {
    const btn = el.querySelector('#btnLoadPlexLibs');
    if (btn) btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); loadPlexLibraries(true); };
    const btnRef = el.querySelector('#btnRefreshPlexServers');
    if (btnRef) btnRef.onclick = (e) => { e.preventDefault(); e.stopPropagation(); loadPlexServers(); };
    loadPlexServers();
    if (current.services?.plex?.url) loadPlexLibraries(false);
  }
  if (activeTab === 'users') {
    loadUsers();
  }
}

function field(label, path, value, opts = {}) {
  const hint = opts.hint ? `<div class="field-hint">${opts.hint}</div>` : '';
  return `
    <div class="set-field">
      <label class="set-field-lbl">${label}</label>
      <input class="set-input" data-path="${path}" type="${opts.type || 'text'}" value="${value ?? ''}" placeholder="${opts.ph || ''}" />
      ${hint}
    </div>
  `;
}

function selectField(label, path, id, cur, numeric, hint) {
  const opt = cur != null && cur !== '' ? `<option value="${cur}" selected>${cur}</option>` : '';
  return `
    <div class="set-field">
      <label class="set-field-lbl">${label}</label>
      <select class="custom-select set-select" id="${id}" data-path="${path}" ${numeric ? 'data-type="number"' : ''}>${opt}</select>
      ${hint ? `<div class="field-hint">${hint}</div>` : ''}
    </div>
  `;
}

function guideBox(text, links = []) {
  const linkHtml = links.map(l => `<a href="${l.url}" target="_blank" rel="noopener" class="set-guide-link">${l.label} ↗</a>`).join(' · ');
  return `
    <div class="set-guide-box">
      <span class="set-guide-icon">💡</span>
      <div class="set-guide-content">
        <div class="set-guide-text">${text}</div>
        ${linkHtml ? `<div class="set-guide-links">${linkHtml}</div>` : ''}
      </div>
    </div>
  `;
}

function testBlock(s) {
  return `
    <div class="test-line" style="margin-top:14px;">
      <button type="button" class="test-btn" data-test="${s}" type="button">⚡ Test Connection</button>
      <span class="test-result" id="test-${s}"></span>
    </div>
  `;
}

function renderTab(tab) {
  const s = current.services;
  const bo = current.boxoffice || { source: 'bom', area: '' };

  switch (tab) {
    case 'tmdb':
      return guideBox('The Movie Database provides rich metadata, posters, backdrops, cast, streaming providers, and franchise sagas.', [
        { label: 'Get free API Key at themoviedb.org', url: 'https://www.themoviedb.org/settings/api' }
      ])
      + field('TMDB API Key (v3)', 'tmdb.apiKey', current.tmdb.apiKey, { ph: 'your TMDB v3 key' })
      + field('…or TMDB Read Token (v4)', 'tmdb.readToken', current.tmdb.readToken, { ph: 'Bearer token', hint: 'Either works. v4 token takes priority.' })
      + `<div class="row-2" style="margin-top:12px;">${field('Default Region', 'tmdb.region', current.tmdb.region, { ph: 'GR or US' })}${field('Default Language', 'tmdb.language', current.tmdb.language, { ph: 'en-US' })}</div>`
      + testBlock('tmdb');

    case 'imdb':
      return guideBox('OMDb fetches official IMDb user ratings and vote counts for movie and show cards.', [
        { label: 'Get free OMDb API Key at omdbapi.com', url: 'https://www.omdbapi.com/apikey.aspx' }
      ])
      + field('OMDb API Key', 'omdb.apiKey', current.omdb.apiKey, { ph: 'free key from omdbapi.com', hint: 'Enables official IMDb rating stars and badges.' })
      + testBlock('omdb')
      + `<div class="row-2" style="margin-top:16px;">${field('IMDb Top 250 (Movies) List ID', 'imdb.movieListId', current.imdb.movieListId, { ph: '8647021' })}${field('IMDb Top 250 (TV) List ID', 'imdb.tvListId', current.imdb.tvListId, { ph: 'optional' })}</div>`;

        case 'plex':
      return guideBox('Plex integration allows NickSeer to verify media in your library, detect multi-server access, and personalize recommendations from your watch history.')
      + `<div style="background:rgba(18,24,38,0.7);border:1px solid rgba(46,155,214,0.3);border-radius:14px;padding:16px 18px;margin-bottom:18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <label class="set-field-lbl" style="margin:0;font-size:14.5px;font-weight:800;color:#ffffff;">👑 Choose Plex Server</label>
            <button type="button" class="btn btn-ghost" id="btnRefreshPlexServers" style="padding:4px 12px;font-size:12px;border-radius:8px;">🔄 Refresh Servers</button>
          </div>
          <div class="field-hint" style="margin-bottom:10px;">Select between your own server and invited/shared servers (e.g. Loumpakos, etc.).</div>
          <select class="custom-select set-select" id="plexServerDropdown" style="font-weight:800;color:#70c4f4;font-size:14px;background:#101826;padding:9px 14px;">
            <option value="">Detecting accessible servers…</option>
          </select>
        </div>`
      + field('Plex Server URL', 'services.plex.url', s.plex.url, { ph: 'http://192.168.31.173:32400', hint: 'The network address of the active Plex server.' })
      + field('Plex Token', 'services.plex.token', s.plex.token, { hint: 'Your X-Plex-Token.' })
      + testBlock('plex')
      + `<div id="plexLibSectionWrap" style="margin-top:20px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <label style="font-size:13.5px;font-weight:800;color:#f0f7ff;">Libraries to Sync & Scan</label>
            <button type="button" class="btn btn-ghost" id="btnLoadPlexLibs" style="padding:5px 14px;font-size:12.5px;font-weight:700;border-radius:8px;background:rgba(46,155,214,0.15);border-color:rgba(46,155,214,0.35);color:#70c4f4;">🔍 Discover Libraries</button>
          </div>
          <div class="hint" style="margin-bottom:10px;">Select which libraries to scan for ownership. Unchecked libraries will be ignored.</div>
          <div id="plexLibPickerList" style="background:rgba(18,24,38,0.7);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px;">
            <span class="row-sub">Click "Discover Libraries" to choose which libraries to sync.</span>
          </div>
        </div>`;

case 'tautulli':
      return guideBox('Tautulli provides user-isolated watch logs, playback stats, and rich active stream monitoring.', [
        { label: 'Tautulli API Settings', url: 'http://192.168.31.173:8181/settings#tab_tabs-web_interface' }
      ])
      + field('Tautulli URL', 'services.tautulli.url', s.tautulli.url, { ph: 'http://192.168.31.173:8181' })
      + field('Tautulli API Key', 'services.tautulli.apikey', s.tautulli.apikey)
      + testBlock('tautulli');

    case 'radarr':
      return guideBox('Radarr manages movie requests, downloading, quality profiles, and root storage folders.')
      + field('Radarr URL', 'services.radarr.url', s.radarr.url, { ph: 'http://192.168.31.173:7878' })
      + field('Radarr API Key', 'services.radarr.apikey', s.radarr.apikey)
      + testBlock('radarr')
      + `<div class="row-2" style="margin-top:14px;">${selectField('Default Quality Profile', 'services.radarr.qualityProfileId', 'qp-radarr', s.radarr.qualityProfileId, true, 'Auto-filled after testing.')}${selectField('Default Root Folder', 'services.radarr.rootFolder', 'rf-radarr', s.radarr.rootFolder, false, 'Auto-filled after testing.')}</div>`;

    case 'sonarr':
      return guideBox('Sonarr handles TV series requests, season monitoring, language profiles, and folder destinations.')
      + field('Sonarr URL', 'services.sonarr.url', s.sonarr.url, { ph: 'http://192.168.31.173:8989' })
      + field('Sonarr API Key', 'services.sonarr.apikey', s.sonarr.apikey)
      + testBlock('sonarr')
      + `<div class="row-2" style="margin-top:14px;">${selectField('Default Quality Profile', 'services.sonarr.qualityProfileId', 'qp-sonarr', s.sonarr.qualityProfileId, true, 'Auto-filled after testing.')}${selectField('Default Root Folder', 'services.sonarr.rootFolder', 'rf-sonarr', s.sonarr.rootFolder, false, 'Auto-filled after testing.')}</div>`;

    case 'sabnzbd':
      return guideBox('SABnzbd powers Usenet downloads, queue monitoring, and bandwidth speed reporting.')
      + field('SABnzbd URL', 'services.sabnzbd.url', s.sabnzbd.url, { ph: 'http://192.168.31.173:8080' })
      + field('SABnzbd API Key', 'services.sabnzbd.apikey', s.sabnzbd.apikey)
      + testBlock('sabnzbd');

    case 'gluetun':
      return guideBox('Gluetun VPN control server status, IP location, and network health.')
      + field('Gluetun Control URL', 'services.gluetun.url', s.gluetun.url, { ph: 'http://192.168.31.173:8000' })
      + testBlock('gluetun');

    case 'boxoffice':
      return guideBox('Choose which domestic or international territory to pull Box Office rankings from.')
      + `<div class="set-field"><label class="set-field-lbl">Box Office Region</label>
          <select class="custom-select set-select" data-path="boxoffice.area">
            ${BOM_AREAS.map((a) => `<option value="${a.code}" ${(bo.area || '') === a.code ? 'selected' : ''}>${a.flag} ${a.name}</option>`).join('')}
          </select>
        </div>`;

    case 'ai':
      return guideBox('Configure local (Ollama) or cloud (OpenAI) AI for smart re-ranking and personalized recommendations.')
      + `<div class="set-field"><label class="set-field-lbl">AI Provider</label>
          <div class="seg" data-seg="ai.provider" style="margin-top:4px;">
            <button data-val="none" class="${current.ai.provider === 'none' ? 'active' : ''}">None</button>
            <button data-val="openai" class="${current.ai.provider === 'openai' ? 'active' : ''}">OpenAI</button>
            <button data-val="ollama" class="${current.ai.provider === 'ollama' ? 'active' : ''}">Local (Ollama)</button>
          </div>
        </div>
        ${field('OpenAI API Key', 'ai.openaiApiKey', current.ai.openaiApiKey)}
        ${field('OpenAI Model', 'ai.openaiModel', current.ai.openaiModel, { ph: 'gpt-4o-mini' })}
        ${field('Ollama URL', 'ai.ollamaUrl', current.ai.ollamaUrl, { ph: 'http://192.168.31.173:11434' })}
        ${field('Ollama Model', 'ai.ollamaModel', current.ai.ollamaModel, { ph: 'llama3.1' })}`;

    case 'users':
      return `<div id="usersPane"><p class="row-sub"><span class="sp">⟳</span> Loading user accounts…</p></div>`;

    case 'general':
      return guideBox('Tune global recommendation behaviors, history scan depth, and application naming.')
      + `<div class="set-field"><label class="set-field-lbl">Recommendation Level</label>
          <div class="seg" data-seg="recommendation.level" style="margin-top:4px;">
            <button data-val="1" class="${current.recommendation.level == 1 ? 'active' : ''}">Level 1 · Fast Rule-based</button>
            <button data-val="3" class="${current.recommendation.level == 3 ? 'active' : ''}">Level 3 · AI Augmented</button>
          </div>
        </div>
        ${field('Application Name', 'app.name', current.app.name, { ph: 'NickSeer' })}
        ${field('History Scan Depth', 'recommendation.historyDepth', current.recommendation.historyDepth, { type: 'number', hint: 'Number of recent watch events to analyze for user taste.' })}`;

    default: return '';
  }
}


let plexServersCache = [];
let isPlexLoading = false;

async function loadPlexServers() {
  const dropdown = document.getElementById('plexServerDropdown');
  const refreshBtn = document.getElementById('btnRefreshPlexServers');
  if (refreshBtn) refreshBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); loadPlexServers(); };

  if (!dropdown) return;
  try {
    collect();
    const tokVal = current.services?.plex?.token || '';
    const qs = new URLSearchParams();
    if (tokVal && !tokVal.startsWith('••••')) qs.set('token', tokVal);

    const res = await fetch('/api/settings/plex/servers?' + qs.toString(), { headers: authHeaders() }).then(r => r.json());
    if (res.ok && Array.isArray(res.servers) && res.servers.length) {
      plexServersCache = res.servers;
      const currentUrl = (current.services?.plex?.url || '').trim();
      const currentSrvName = current.services?.plex?.server || '';

      dropdown.innerHTML = res.servers.map((s, idx) => {
        const isOwned = s.owned;
        const badge = isOwned ? '👑 (Owned Server)' : '🤝 (Invited / Shared)';
        const uri = s.bestUri || s.localUri || s.remoteUri || '';
        const isSelected = (currentSrvName && currentSrvName === s.name) || (currentUrl && (currentUrl === uri || currentUrl === s.localUri || currentUrl === s.remoteUri)) || (idx === 0 && !currentUrl);
        return `<option value="${encodeURIComponent(JSON.stringify(s))}" ${isSelected ? 'selected' : ''}>${s.name} ${badge}</option>`;
      }).join('') + '<option value="custom">✏️ Custom Server URL…</option>';

      dropdown.onchange = (e) => {
        e.preventDefault();
        if (dropdown.value === 'custom') return;
        try {
          const sObj = JSON.parse(decodeURIComponent(dropdown.value));
          const urlInput = document.querySelector('#settingsBody input[data-path="services.plex.url"]');
          const tokenInput = document.querySelector('#settingsBody input[data-path="services.plex.token"]');
          const bestUrl = sObj.bestUri || sObj.localUri || sObj.remoteUri || '';
          if (bestUrl && urlInput) urlInput.value = bestUrl;
          if (sObj.accessToken && tokenInput) tokenInput.value = sObj.accessToken;
          if (sObj.name) current.services.plex.server = sObj.name;
          current.services.plex.url = bestUrl;
          current.services.plex.token = sObj.accessToken;
          collect();
          loadPlexLibraries(true);
        } catch { /* parse error */ }
      };
    } else {
      dropdown.innerHTML = `<option value="">${current.services?.plex?.server || 'Primary Plex Server'} (Active)</option>`;
    }
  } catch {
    dropdown.innerHTML = `<option value="">${current.services?.plex?.server || 'Primary Plex Server'} (Active)</option>`;
  }
}

async function loadPlexLibraries(showToast = false) {
  if (isPlexLoading) return;
  isPlexLoading = true;

  const listWrap = document.getElementById('plexLibPickerList');
  const discoverBtn = document.getElementById('btnLoadPlexLibs');
  const rescanBtn = document.getElementById('btnRescanPlex');

  if (discoverBtn) { discoverBtn.disabled = true; discoverBtn.textContent = '⟳ Scanning…'; }
  if (rescanBtn) { rescanBtn.disabled = true; rescanBtn.textContent = '⟳ Scanning…'; }

  if (listWrap) {
    listWrap.style.opacity = '0.5';
    listWrap.style.pointerEvents = 'none';
  }

  try {
    collect();
    const urlInp = document.querySelector('#settingsBody input[data-path="services.plex.url"]');
    const tokInp = document.querySelector('#settingsBody input[data-path="services.plex.token"]');
    const urlVal = urlInp ? urlInp.value.trim() : (current.services?.plex?.url || '');
    const tokVal = tokInp ? tokInp.value.trim() : (current.services?.plex?.token || '');

    const qs = new URLSearchParams();
    if (urlVal) qs.set('url', urlVal);
    if (tokVal && !tokVal.startsWith('••••')) qs.set('token', tokVal);

    const res = await fetch('/api/settings/plex/sections?' + qs.toString(), { headers: authHeaders() }).then((r) => r.json());
    
    if (listWrap) {
      listWrap.style.opacity = '1';
      listWrap.style.pointerEvents = 'auto';

      if (!res.ok || !res.sections || !res.sections.length) {
        listWrap.innerHTML = `<div style="padding:10px 0;"><span class="row-sub" style="color:#ff6b6b">⚠️ ${res.error || 'No movie or TV libraries found for this server.'}</span></div>`;
        if (showToast) toast('✕ ' + (res.error || 'No libraries found'), 'bad');
        return;
      }

      const saved = current.services?.plex?.selectedLibraries || [];
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      listWrap.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:13.5px;font-weight:800;color:#2E9BD6;display:flex;align-items:center;gap:8px;">
            <span>Connected Server: <b>${res.server || 'Plex Server'}</b></span>
            <span style="background:rgba(46,155,214,0.2);color:#70c4f4;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;">v${res.version || ''}</span>
            <span style="color:#8b949e;font-size:11px;font-weight:500;">(Synced ${nowTime})</span>
          </div>
          <button type="button" class="btn btn-ghost" id="btnRescanPlex" style="font-size:12px;padding:4px 10px;border-radius:8px;background:rgba(255,255,255,0.06);cursor:pointer;">⟳ Re-scan</button>
        </div>
        ${res.sections.map((sec) => {
          const isChecked = !saved.length || saved.includes(String(sec.key)) || saved.includes(sec.title);
          return `
            <label style="display:flex;align-items:center;gap:10px;font-size:13.5px;color:#f0f6fc;cursor:pointer;padding:5px 0;">
              <input type="checkbox" class="plex-lib-cb" value="${sec.key}" data-title="${sec.title}" ${isChecked ? 'checked' : ''} />
              <span><b>${sec.title}</b> <span style="color:#8a8f9d;font-size:12px;">(${sec.type === 'movie' ? 'Movies' : 'TV Shows'})</span></span>
            </label>
          `;
        }).join('')}
      `;

      const newRescan = listWrap.querySelector('#btnRescanPlex');
      if (newRescan) newRescan.onclick = (e) => { e.preventDefault(); e.stopPropagation(); loadPlexLibraries(true); };

      if (showToast) {
        toast(`✓ Connected to ${res.server || 'Plex'} — ${res.sections.length} libraries synced`, 'ok');
      }
    }
  } catch (e) {
    if (listWrap) {
      listWrap.style.opacity = '1';
      listWrap.style.pointerEvents = 'auto';
      listWrap.innerHTML = `<div style="padding:10px 0;"><span class="row-sub" style="color:#ff6b6b">⚠️ ${e.message}</span></div>`;
    }
    if (showToast) toast('✕ ' + e.message, 'bad');
  } finally {
    isPlexLoading = false;
    if (discoverBtn) { discoverBtn.disabled = false; discoverBtn.textContent = '🔍 Discover Libraries'; }
    const curRescan = document.getElementById('btnRescanPlex');
    if (curRescan) { curRescan.disabled = false; curRescan.textContent = '⟳ Re-scan'; }
  }
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

function fmtGB(b) {
  const gb = b / 1073741824;
  return gb > 1024 ? (gb / 1024).toFixed(1) + ' TB' : gb.toFixed(0) + ' GB';
}

async function loadUsers() {
  const pane = document.getElementById('usersPane');
  if (!pane) return;
  const data = await fetch('/api/auth/users', { headers: authHeaders() }).then((r) => r.json()).catch(() => ({ ok: false }));
  if (!data.ok) {
    pane.innerHTML = `<div class="req-note bad">${data.error || 'Only an admin can manage users.'}</div>`;
    return;
  }
  const users = data.users || [];
  pane.innerHTML = `
    <div class="set-field" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div>
        <label class="set-field-lbl" style="margin:0;">Require login for NickSeer</label>
        <div class="field-hint">When active, users must authenticate to view library and request media.</div>
      </div>
      <div class="seg" id="authToggle">
        <button data-val="off" class="${data.enabled ? '' : 'active'}">Off</button>
        <button data-val="on" class="${data.enabled ? 'active' : ''}">On</button>
      </div>
    </div>
    <div id="userList">${users.map(userRow).join('') || '<p class="row-sub">No user accounts created yet.</p>'}</div>
    <div class="section-label" style="margin-top:20px;">Add New User</div>
    <div class="row-2">
      <div class="set-field"><label class="set-field-lbl">Username</label><input class="set-input" id="nu-name" placeholder="e.g. maria" autocomplete="off" /></div>
      <div class="set-field"><label class="set-field-lbl">Password</label><input class="set-input" id="nu-pass" type="password" placeholder="choose a password" autocomplete="new-password" /></div>
    </div>
    <div class="set-field"><label class="set-field-lbl">Role</label>
      <div class="seg" id="nu-role"><button data-val="user" class="active">User</button><button data-val="admin">Admin</button></div>
    </div>
    <button type="button" class="btn btn-accent" id="nu-add">Create User</button>
    <span id="nu-msg" class="test-result" style="margin-left:10px"></span>
  `;

  pane.querySelectorAll('#authToggle button').forEach((b) => b.addEventListener('click', async () => {
    const on = b.dataset.val === 'on';
    const r = await fetch('/api/auth/enable', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ enabled: on }) }).then((x) => x.json());
    if (r.ok) { toast(on ? 'Login requirement is ON' : 'Login turned OFF', 'ok'); loadUsers(); }
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
  const isAdmin = u.role === 'admin';
  return `
    <div class="user-row" data-user="${u.username}">
      <div class="user-av">${initials}</div>
      <div class="user-info">
        <div class="user-name">${u.username}</div>
        <div class="user-role-wrap">
          <select class="custom-select role-select" data-user="${u.username}">
            <option value="admin" ${isAdmin ? 'selected' : ''}>🛡️ Admin</option>
            <option value="user" ${!isAdmin ? 'selected' : ''}>👤 User</option>
          </select>
        </div>
      </div>
      <div class="user-actions">
        <button type="button" class="mini-btn btn-change-pw" data-pw="${u.username}">🔑 Change password</button>
        <button type="button" class="mini-btn danger btn-del-user" data-del="${u.username}">🗑️ Delete</button>
      </div>
    </div>
  `;
}

function wireSegs() {
  document.querySelectorAll('#settingsBody [data-seg]:not(#authToggle):not(#nu-role) button').forEach((b) => b.addEventListener('click', () => {
    b.parentElement.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
  }));
}

function collect() {
  const plexCbs = document.querySelectorAll('#settingsBody .plex-lib-cb');
  if (plexCbs.length > 0) {
    const chosen = [...plexCbs].filter((c) => c.checked).map((c) => c.value);
    setPath(current, 'services.plex.selectedLibraries', chosen);
  }
  document.querySelectorAll('#settingsBody [data-path]').forEach((inp) => {
    const isNum = inp.dataset.type === 'number' || inp.type === 'number';
    setPath(current, inp.dataset.path, isNum ? (inp.value === '' ? null : Number(inp.value)) : inp.value);
  });
  document.querySelectorAll('#settingsBody [data-seg]').forEach((seg) => {
    if (seg.id === 'authToggle' || seg.id === 'nu-role') return;
    const active = seg.querySelector('.active');
    if (active) {
      const raw = active.dataset.val;
      setPath(current, seg.dataset.seg, isNaN(raw) ? raw : Number(raw));
    }
  });
}

function setPath(obj, path, val) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    o[parts[i]] = o[parts[i]] || {};
    o = o[parts[i]];
  }
  o[parts[parts.length - 1]] = val;
}

async function testService(service) {
  collect();
  const out = document.getElementById('test-' + service);
  if (out) {
    out.innerHTML = '<span class="sp">⟳</span> Testing…';
    out.className = 'test-result';
  }
  try {
    const r = await fetch('/api/settings/test/' + service, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(buildPayloadFor(service))
    }).then((x) => x.json());

    if (r.ok) {
      if (out) {
        out.textContent = '✓ ' + (r.version ? 'v' + r.version : r.server || r.status || r.sample || 'Connected');
        out.className = 'test-result ok';
      }
      if (service === 'radarr' || service === 'sonarr') loadArrOptions(service);
      if (service === 'plex') loadPlexLibraries();
    } else {
      if (out) {
        out.textContent = '✕ ' + (r.error || 'Failed');
        out.className = 'test-result bad';
      }
    }
  } catch (e) {
    if (out) {
      out.textContent = '✕ ' + e.message;
      out.className = 'test-result bad';
    }
  }
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
  delete payload.auth;
  const r = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload)
  }).then((x) => x.json());

  if (r.ok) {
    toast('Settings saved successfully', 'ok');
    closeSettings();
    document.dispatchEvent(new CustomEvent('settings:saved'));
  } else {
    toast(r.error || 'Save failed', 'bad');
  }
}

function stripMasked(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'string' && v.startsWith('••••')) delete obj[k];
    else if (v && typeof v === 'object') stripMasked(v);
  }
}

document.getElementById('settingsBtn')?.addEventListener('click', () => openSettings(false));
document.addEventListener('nav:back', () => {
  const el = document.getElementById('settings');
  if (el && !el.classList.contains('hidden')) closeSettings();
});

export { closeSettings };
