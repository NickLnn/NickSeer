// info.js — "Info" view with Live Host & Hardware Telemetry Sub-Tab + Services Health Sub-Tab.
// Sub-Tab 1 (Default): 🖥️ Host & Hardware (Device Name, CPU Temp, CPU Usage, RAM, Disks, OS, Live 3s refresh).
// Sub-Tab 2: 🏥 Services & Health (System Health, Plex Library, App Activity, Radarr, Sonarr queues).

const app = () => document.getElementById('app');
function authHeaders() { const t = localStorage.getItem('nickseer_token'); return t ? { Authorization: 'Bearer ' + t } : {}; }
async function api(path) { try { const r = await fetch(path, { headers: authHeaders() }); return await r.json(); } catch (e) { return { error: e.message }; } }

let currentSubTab = 'host';
let hostTimer = null;

function stopHostTimer() {
  if (hostTimer) { clearInterval(hostTimer); hostTimer = null; }
}

function injectHealthStyles() {
  if (document.getElementById('info-health-styles')) return;
  const css = `
  .hc-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);}
  .hc-row:last-child{border-bottom:0;}
  .hc-ico{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;font-size:13px;font-weight:900;flex:0 0 auto;}
  .hc-ok{background:rgba(53,208,127,.16);color:#35d07f;border:1px solid rgba(53,208,127,.3);}
  .hc-bad{background:rgba(229,9,20,.16);color:#ff6b6b;border:1px solid rgba(229,9,20,.35);}
  .hc-off{background:rgba(255,255,255,.06);color:#7a7f8a;border:1px solid rgba(255,255,255,.1);}
  .hc-name{font-weight:700;color:#eaeaf0;font-size:14px;flex:1;min-width:0;}
  .hc-detail{font-size:12px;color:#9aa0ad;max-width:48%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;font-weight:600;}
  .hc-summary{display:flex;gap:8px;margin-left:auto;font-size:12px;font-weight:800;}
  .hc-pill{padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:800;}
  .hc-pill.ok{background:rgba(53,208,127,.16);border:1px solid rgba(53,208,127,.35);color:#7ef0b0;}
  .hc-pill.bad{background:rgba(229,9,20,.14);border:1px solid rgba(229,9,20,.35);color:#ff9a9a;}
  .hc-pill.off{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#9aa0ad;}
  .hc-refresh{margin-top:14px;width:100%;padding:11px;border:1px solid rgba(255,255,255,.14);border-radius:11px;font-weight:800;font-size:13.5px;cursor:pointer;background:rgba(255,255,255,.08);color:#eaeaf0;transition:all .15s ease;}
  .hc-refresh:hover{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.28);}`;
  const st = document.createElement('style'); st.id = 'info-health-styles'; st.textContent = css; document.head.appendChild(st);
}

function healthRows(checks) {
  return checks.map((c) => {
    const cls = c.state === 'ok' ? 'hc-ok' : c.state === 'bad' ? 'hc-bad' : 'hc-off';
    const ico = c.state === 'ok' ? '✓' : c.state === 'bad' ? '✕' : '—';
    return `<div class="hc-row"><span class="hc-ico ${cls}">${ico}</span><span class="hc-name">${c.name}</span><span class="hc-detail">${c.detail || ''}</span></div>`;
  }).join('');
}

async function renderHealthCard(grid) {
  injectHealthStyles();
  const card = document.createElement('div'); card.className = 'status-card'; card.setAttribute('data-nav', ''); card.tabIndex = 0;
  card.innerHTML = `<div class="status-head"><span class="status-dot ok"></span><span class="status-name" style="font-weight:800;font-size:16px">System Health</span><span class="hc-summary" id="hcSum"></span></div><div id="hcBody"><div class="row-sub">Checking services…</div></div>`;
  grid.appendChild(card);
  const load = async () => {
    const d = await api('/api/health-detail');
    const body = card.querySelector('#hcBody'); const sum = card.querySelector('#hcSum');
    if (d.error) { body.innerHTML = `<div class="row-sub">${d.error}</div>`; return; }
    body.innerHTML = healthRows(d.checks || []);
    if (d.summary) sum.innerHTML = `<span class="hc-pill ok">${d.summary.ok} ✓</span>${d.summary.bad ? `<span class="hc-pill bad">${d.summary.bad} ✕</span>` : ''}${d.summary.off ? `<span class="hc-pill off">${d.summary.off} off</span>` : ''}`;
    const btn = document.createElement('button'); btn.className = 'hc-refresh'; btn.setAttribute('data-nav', ''); btn.textContent = '⟳ Re-check services';
    btn.onclick = async () => { btn.textContent = 'Checking…'; btn.disabled = true; await load(); btn.textContent = '⟳ Re-check services'; btn.disabled = false; };
    body.appendChild(btn);
  };
  await load();
}

function arrCard(name, q) {
  const err = q && q.error;
  return `<div class="status-card" data-nav tabindex="0"><div class="status-head"><span class="status-dot ${err ? 'bad' : 'ok'}"></span><span class="status-name" style="font-weight:800;font-size:16px">${name}</span><span class="status-sub">${err ? '' : (q ? (q.count || 0) + ' items' : '')}</span></div>${err ? `<div class="row-sub">${err}</div>` : ((q && q.items && q.items.length) ? q.items.map((it) => `<div class="dl-item"><div class="dl-row"><span class="dl-name">${it.title || 'item'}</span><span class="dl-meta">${it.progress != null ? it.progress + '%' : ''}${it.timeLeft ? ' · ' + it.timeLeft : ''}</span></div><div class="bar"><i style="width:${it.progress || 0}%"></i></div></div>`).join('') : '<div class="row-sub">Idle — nothing importing.</div>')}</div>`;
}

// -------------------------------------------------------------
// Sub-Tab 1: Live Host & Hardware Dashboard
// -------------------------------------------------------------
async function renderHostDashboard(container) {
  container.id = 'hostGrid';
  container.className = 'host-grid';
  container.innerHTML = `<div class="host-loading"><span class="host-spinner"></span> Connecting to host telemetry…</div>`;
  
  const updateMetrics = async () => {
    const d = await api('/api/health-detail/system?_t=' + Date.now(), { force: true });
    if (d.error || !d.device) {
      container.innerHTML = `<div class="status-card" style="grid-column:1/-1"><div class="row-sub">⚠️ Could not read host telemetry: ${d.error || 'unknown error'}</div></div>`;
      return;
    }

    const tempVal = d.cpu.temperature || 40;
    const tempClass = tempVal >= 75 ? 'temp-hot' : (tempVal >= 55 ? 'temp-warm' : 'temp-cool');
    const cpuPct = d.cpu.usagePercent || 0;
    const ramPct = d.ram.usedPercent || 0;

    const disksHtml = (d.disks || []).map(dk => `
      <div class="host-disk-item">
        <div class="host-disk-head">
          <span class="host-disk-name">💽 ${dk.mount}</span>
          <span class="host-disk-meta">${dk.availableText} free of ${dk.totalText}</span>
        </div>
        <div class="host-disk-bar">
          <i style="width:${dk.usedPercent}%;background:${dk.usedPercent > 85 ? '#ff4d4f' : (dk.usedPercent > 70 ? '#f5c518' : '#2E9BD6')}"></i>
        </div>
        <div class="host-disk-foot">
          <span>${dk.usedText} used (${dk.usedPercent}%)</span>
          <span style="color:#8a8f9d">${dk.filesystem}</span>
        </div>
      </div>
    `).join('');

    const html = `
      <!-- Device & OS Hero Banner -->
      <div class="host-hero-card">
        <div class="host-hero-left">
          <div class="host-dev-icon">🖥️</div>
          <div>
            <div class="host-dev-name">${d.device.model || d.device.hostname}</div>
            <div class="host-dev-sub">
              <span class="host-os-tag">${d.device.osName}</span>
              <span class="host-kernel-tag">Kernel ${d.device.kernel} (${d.device.arch})</span>
            </div>
          </div>
        </div>
        <div class="host-hero-right">
          <div class="host-live-badge"><span class="live-pulse-dot"></span> LIVE TELEMETRY</div>
          <div class="host-uptime-lbl">System Uptime: <b>${d.device.uptimeText}</b></div>
        </div>
      </div>

      <!-- CPU & Thermal Card -->
      <div class="status-card host-stat-card" data-nav tabindex="0">
        <div class="status-head" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="status-dot ok"></span>
            <span class="status-name" style="font-weight:800;font-size:16px">CPU & Thermals</span>
          </div>
          <div class="host-temp-badges">
            <span class="host-temp-badge live ${tempClass}">🔥 ${tempVal}°C</span>
            <span class="host-temp-badge max">⚡ Max: ${d.cpu.maxTemperature || tempVal}°C</span>
          </div>
        </div>
        <div class="host-metric-body">
          <div class="host-big-metric">
            <span class="host-metric-num">${cpuPct}%</span>
            <span class="host-metric-sub">${tempVal}°C · Peak: ${d.cpu.maxTemperature || tempVal}°C</span>
          </div>
          <div class="host-progress-wrap">
            <div class="host-progress-bar"><i style="width:${cpuPct}%;background:${cpuPct > 80 ? '#ff4d4f' : (cpuPct > 50 ? '#f5c518' : '#35d07f')}"></i></div>
          </div>
          <div class="host-info-row">
            <span class="host-info-lbl">Processor</span>
            <span class="host-info-val" title="${d.cpu.model}">${d.cpu.model}</span>
          </div>
          <div class="host-info-row">
            <span class="host-info-lbl">Cores & Load</span>
            <span class="host-info-val">${d.cpu.cores} Cores · Load ${d.cpu.loadAvg.join(', ')}</span>
          </div>
        </div>
      </div>

      <!-- RAM & Memory Card -->
      <div class="status-card host-stat-card" data-nav tabindex="0">
        <div class="status-head">
          <span class="status-dot ok"></span>
          <span class="status-name" style="font-weight:800;font-size:16px">RAM & Memory</span>
          <span class="host-pill-accent">${d.ram.availableText} Free</span>
        </div>
        <div class="host-metric-body">
          <div class="host-big-metric">
            <span class="host-metric-num">${ramPct}%</span>
            <span class="host-metric-sub">${d.ram.usedText} / ${d.ram.totalText}</span>
          </div>
          <div class="host-progress-wrap">
            <div class="host-progress-bar"><i style="width:${ramPct}%;background:linear-gradient(90deg,#2E9BD6,#8b5cf6)"></i></div>
          </div>
          <div class="host-info-row">
            <span class="host-info-lbl">Total Installed</span>
            <span class="host-info-val">${d.ram.totalText}</span>
          </div>
          <div class="host-info-row">
            <span class="host-info-lbl">Available Memory</span>
            <span class="host-info-val" style="color:#7ef0b0">${d.ram.availableText}</span>
          </div>
        </div>
      </div>

      <!-- Storage & Disks Card -->
      <div class="status-card host-stat-card" style="grid-column: span 2;" data-nav tabindex="0">
        <div class="status-head">
          <span class="status-dot ok"></span>
          <span class="status-name" style="font-weight:800;font-size:16px">Storage Pools & Disks</span>
          <span class="status-sub">${d.disks ? d.disks.length + ' volumes' : ''}</span>
        </div>
        <div class="host-metric-body">
          ${disksHtml || '<div class="row-sub">No disk mounts detected.</div>'}
        </div>
      </div>

      <!-- NickSeer Process & Engine Card -->
      <div class="status-card host-stat-card" data-nav tabindex="0">
        <div class="status-head">
          <span class="status-dot ok"></span>
          <span class="status-name" style="font-weight:800;font-size:16px">Container & Engine</span>
          <span class="status-sub">${d.process.version}</span>
        </div>
        <div class="host-metric-body">
          <div class="host-info-row">
            <span class="host-info-lbl">Container Uptime</span>
            <span class="host-info-val" style="color:#2E9BD6">${d.process.uptimeText}</span>
          </div>
          <div class="host-info-row">
            <span class="host-info-lbl">Memory (RSS)</span>
            <span class="host-info-val">${d.process.memory.rss}</span>
          </div>
          <div class="host-info-row">
            <span class="host-info-lbl">Heap Memory</span>
            <span class="host-info-val">${d.process.memory.heapUsed} / ${d.process.memory.heapTotal}</span>
          </div>
          <div class="host-info-row">
            <span class="host-info-lbl">Process ID</span>
            <span class="host-info-val">PID ${d.process.pid}</span>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  };

  await updateMetrics();
  stopHostTimer();
  hostTimer = setInterval(updateMetrics, 3000);
}

// -------------------------------------------------------------
// Sub-Tab 2: Services & Health Dashboard
// -------------------------------------------------------------
async function renderServicesDashboard(container) {
  stopHostTimer();
  container.id = 'infoGrid';
  container.className = 'status-grid';
  container.innerHTML = '';
  
  // 1. System Health Card
  await renderHealthCard(container);

  // 2. Trigger Plex & Stats card injection
  document.dispatchEvent(new CustomEvent('info:rendered'));
  
  // 3. Radarr & Sonarr queues
  const status = await api('/api/status');
  if (status.radarr) container.insertAdjacentHTML('beforeend', arrCard('Radarr', status.radarr));
  if (status.sonarr) container.insertAdjacentHTML('beforeend', arrCard('Sonarr', status.sonarr));
}

async function switchSubTab(sub) {
  currentSubTab = sub;
  const root = app(); if (!root) return;
  const content = root.querySelector('#infoSubContent, #hostGrid, #infoGrid');
  if (!content) return;

  root.querySelectorAll('.info-seg .seg-btn').forEach(b => {
    b.classList.toggle('on', b.dataset.subtab === sub);
  });

  if (sub === 'host') {
    await renderHostDashboard(content);
  } else {
    await renderServicesDashboard(content);
  }
}

async function render() {
  const root = app(); if (!root) return;
  stopHostTimer();
  injectHealthStyles();

  root.innerHTML = `
    <div id="infoView">
      <div class="info-head">
        <div class="info-title-wrap">
          <h2 class="info-title" style="margin:0">Info</h2>
          <div class="seg info-seg" role="tablist">
            <button class="seg-btn ${currentSubTab === 'host' ? 'on' : ''}" data-subtab="host" data-nav>🖥️ Host & Hardware</button>
            <button class="seg-btn ${currentSubTab === 'services' ? 'on' : ''}" data-subtab="services" data-nav>🏥 Services & Health</button>
          </div>
        </div>
      </div>
      <div id="${currentSubTab === 'host' ? 'hostGrid' : 'infoGrid'}" class="${currentSubTab === 'host' ? 'host-grid' : 'status-grid'}"></div>
    </div>
  `;

  root.querySelectorAll('.info-seg .seg-btn').forEach(b => {
    b.onclick = () => switchSubTab(b.dataset.subtab);
  });

  const content = root.querySelector('#hostGrid, #infoGrid');
  if (currentSubTab === 'host') {
    await renderHostDashboard(content);
  } else {
    await renderServicesDashboard(content);
  }
}

function isInfoActive() { const b = document.querySelector('.nav-link[data-view="info"]'); return b && b.classList.contains('active'); }
function stripDownloads() {
  const heads = [...document.querySelectorAll('.row-title')];
  if (!heads.some((h) => /Downloads\s*&\s*Health/i.test(h.textContent || ''))) return;
  const grid = document.querySelector('.status-grid'); if (!grid || grid.id === 'infoGrid' || grid.id === 'hostGrid') return;
  [...grid.children].forEach((card) => { const nm = card.querySelector('.status-name'); if (nm && /^(Radarr|Sonarr)$/i.test(nm.textContent.trim())) card.remove(); });
}

async function toggleTab() {
  const [st, me] = await Promise.all([
    fetch('/api/auth/status').then((r) => r.json()).catch(() => ({})),
    (localStorage.getItem('nickseer_token') ? fetch('/api/auth/me', { headers: authHeaders() }).then((r) => r.json()).catch(() => ({})) : Promise.resolve({}))
  ]);
  const isAdmin = me?.user?.role === 'admin';
  document.querySelectorAll('.nav-link[data-view="info"], .drawer-item[data-view="info"]').forEach((b) => {
    b.style.display = isAdmin ? '' : 'none';
  });
}

function init() {
  toggleTab();
  const btn = document.querySelector('.nav-link[data-view="info"]');
  if (btn) btn.addEventListener('click', () => { currentSubTab = 'host'; setTimeout(render, 0); });
  const obs = new MutationObserver(() => {
    if (isInfoActive() && !document.getElementById('infoView')) {
      render();
    } else if (!isInfoActive()) {
      stopHostTimer();
    }
    stripDownloads();
  });
  obs.observe(app() || document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
else setTimeout(init, 300);
