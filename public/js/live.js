import { escHTML, castTileHTML } from './util.js';
import { applyScrollLock, releaseScrollLock, enableSheetDrag, clearSheetDrag } from './overlay.js';
// live.js — "Live Streaming" tab. Now Watching shows the poster + rich stream
// detail (4K/HDR, video+audio codecs, Direct Play vs Transcode). Stats show
// mini posters and correct Top Platforms/Users names.
const app = () => document.getElementById('app');
let sub = 'now';
let statDays = 30;
let nowTimer = null;

function authHeaders() { const t = localStorage.getItem('nickseer_token'); return t ? { Authorization: 'Bearer ' + t } : {}; }
async function api(path) { try { const r = await fetch(path, { headers: authHeaders() }); return await r.json(); } catch (e) { return { error: e.message }; } }

function injectStyles() {
  if (document.getElementById('live-styles')) return;
  const css = `
  .live-head{display:flex;align-items:center;gap:14px;padding:8px 40px 4px;flex-wrap:wrap;}
  .live-title{font-size:24px;font-weight:800;letter-spacing:-.02em;display:flex;align-items:center;gap:10px;}
  .live-dot{width:10px;height:10px;border-radius:50%;background:#e50914;box-shadow:0 0 12px #e50914;animation:livepulse 1.6s infinite;}
  @keyframes livepulse{0%,100%{opacity:1;}50%{opacity:.35;}}
  .live-sub{margin-left:8px;display:inline-flex;background:rgba(255,255,255,.06);border-radius:11px;padding:4px;gap:4px;}
  .live-sub button{background:transparent;border:0;color:#9aa0ad;padding:8px 14px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;}
  .live-sub button.on{background:var(--accent,#e50914);color:#fff;}
  .stat-filters{display:inline-flex;gap:6px;margin-left:auto;}
  .stat-filters button{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#cfcfd6;border-radius:9px;padding:7px 13px;font-weight:700;font-size:13px;cursor:pointer;}
  .stat-filters button.on{background:linear-gradient(135deg,#6d5ef0,#e50914);color:#fff;border-color:transparent;}
  .live-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:16px;padding:14px 40px 40px;}
  .live-card{background:var(--card,#1a1a24);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:14px;display:flex;gap:14px;}
  .live-poster{width:86px;height:129px;border-radius:10px;object-fit:cover;background:#22222e;flex:0 0 auto;}
  .live-poster.ph{display:grid;place-items:center;font-size:30px;}
  .live-main{flex:1;min-width:0;}
  .live-u{font-weight:800;color:#fff;font-size:15px;}
  .live-t{color:#d6d6de;font-size:13.5px;margin:2px 0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .live-pills{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;}
  .live-pill{font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;}
  .pill-play{background:rgba(53,208,127,.18);color:#7ef0b0;} .pill-pause{background:rgba(245,197,24,.18);color:#f5c518;} .pill-buf{background:rgba(109,94,240,.18);color:#c9c2ff;}
  .pill-dp{background:rgba(53,208,127,.14);color:#7ef0b0;} .pill-tc{background:rgba(229,9,20,.14);color:#ff9a9a;}
  .pill-4k{background:linear-gradient(135deg,#f5c518,#e5a00d);color:#1b1b1b;} .pill-hdr{background:rgba(255,255,255,.12);color:#fff;}
  .pill-info{background:rgba(255,255,255,.08);color:#cfcfd6;}
  .live-meta{font-size:12px;color:#9aa0ad;line-height:1.5;}
  .live-bar{height:6px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:8px;}
  .live-bar>i{display:block;height:100%;background:linear-gradient(90deg,#e50914,#ff5f6d);}
  .live-empty{padding:60px 40px;color:#9aa0ad;text-align:center;}
  .stat-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;padding:14px 40px 40px;}
  .stat-col h4{margin:0 0 10px;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9aa0ad;}
  .stat-item{display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05);}
  .stat-rank{width:20px;color:#9aa0ad;font-weight:800;text-align:center;flex:0 0 auto;}
  .stat-mini{width:34px;height:51px;border-radius:5px;object-fit:cover;background:#22222e;flex:0 0 auto;}
  .stat-mini.ph{display:grid;place-items:center;font-size:15px;}
  .stat-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#eaeaf0;font-weight:600;}
  .stat-plays{color:#9aa0ad;font-size:12.5px;font-weight:700;flex:0 0 auto;}
  .live-card[data-key]{cursor:pointer;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;}
  .live-card[data-key]:hover,.live-card[data-key]:focus-visible{transform:translateY(-2px);border-color:color-mix(in srgb,var(--accent,#e50914) 55%,transparent);box-shadow:0 10px 30px rgba(0,0,0,.35);outline:none;}
  .live-more{margin-top:8px;font-size:11.5px;font-weight:700;color:var(--accent,#e50914);opacity:.85;}
  ${SD_CSS}${LS_CSS}`;
  const st = document.createElement('style'); st.id = 'live-styles'; st.textContent = css; document.head.appendChild(st);
}

function header() {
  return `<div class="live-head">
    <div class="live-title"><span class="live-dot"></span>Live Streaming</div>
    <div class="live-sub"><button data-sub="now" class="${sub === 'now' ? 'on' : ''}">Now Watching</button><button data-sub="stats" class="${sub === 'stats' ? 'on' : ''}">Stats</button><button data-sub="history" class="${sub === 'history' ? 'on' : ''}">History</button></div>
    ${sub !== 'now' ? `<div class="stat-filters">${[30, 60, 90, 365].map((d) => `<button data-days="${d}" class="${statDays === d ? 'on' : ''}">${d === 365 ? '1 year' : d + 'd'}</button>`).join('')}</div>` : ''}
  </div>`;
}

function sessionCard(s) {
  const title = s.grandparent ? `${s.grandparent} — ${s.title}` : s.title;
  const state = s.state === 'paused' ? '<span class="live-pill pill-pause">⏸ Paused</span>' : s.state === 'buffering' ? '<span class="live-pill pill-buf">⟳ Buffering</span>' : '<span class="live-pill pill-play">▶ Playing</span>';
  const isTC = /transcode/i.test(s.transcode || '') || /transcode/i.test(s.videoDecision || '') || /transcode/i.test(s.audioDecision || '');
  const dp = isTC ? '<span class="live-pill pill-tc">Transcode</span>' : '<span class="live-pill pill-dp">Direct Play</span>';
  const q4k = s.is4k ? '<span class="live-pill pill-4k">4K</span>' : (s.resolution ? `<span class="live-pill pill-info">${s.resolution}</span>` : '');
  const hdr = s.dynamicRange && !/sdr/i.test(s.dynamicRange) ? `<span class="live-pill pill-hdr">${s.dynamicRange}</span>` : '';
  const poster = s.poster ? `<img class="live-poster" src="${s.poster}" alt="">` : `<div class="live-poster ph">${s.type === 'movie' ? '🎬' : '📺'}</div>`;
  const audio = [s.audioCodec, s.audioChannels].filter(Boolean).join(' ');
  const vid = [s.videoCodec, s.container].filter(Boolean).join(' · ');
  const bw = s.bandwidth ? `${(s.bandwidth / 1000).toFixed(1)} Mbps` : '';
  const metaLines = [];
  if (vid) metaLines.push(`🎞️ ${vid}`);
  if (audio) metaLines.push(`🔊 ${audio}`);
  metaLines.push(`🖥️ ${s.player || s.device || '—'}${bw ? ' · ' + bw : ''}`);
  return `<div class="live-card" data-key="${escHTML(s.sessionKey || '')}" tabindex="0" role="button" aria-label="Stream details for ${escHTML(s.user || 'User')}">
    ${poster}
    <div class="live-main">
      <div class="live-u">${s.user || 'User'}</div>
      <div class="live-t">${title || ''}</div>
      <div class="live-pills">${state}${dp}${q4k}${hdr}</div>
      <div class="live-meta">${metaLines.join('<br>')}</div>
      <div class="live-bar"><i style="width:${s.progress || 0}%"></i></div>
      <div class="live-more">Tap for full stream details →</div>
    </div></div>`;
}

// ---------------------------------------------------------------------------
// Stream detail sheet. Opens over the Live tab when a Now Watching card is
// clicked. The top half (hero, about, cast) is drawn once; the live half
// (progress, pipeline, source-vs-stream panels, diagnostics) is re-drawn from
// every 10s poll and ticks the playhead locally in between, so it never looks
// frozen while a title is playing.
// ---------------------------------------------------------------------------
const SD_CSS = `
  .sd-overlay{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:28px;}
  .sd-overlay.hidden{display:none;}
  .sd-card{position:relative;width:min(1060px,100%);max-height:calc(100vh - 56px);overflow-y:auto;overscroll-behavior:contain;background:var(--bg-2,#12121a);border:1px solid rgba(255,255,255,.08);border-radius:22px;box-shadow:0 30px 80px rgba(0,0,0,.6);animation:sdIn .22s cubic-bezier(.2,.7,.3,1);}
  @keyframes sdIn{from{opacity:0;transform:translateY(14px) scale(.985);}to{opacity:1;transform:none;}}
  .sd-close{position:absolute;top:14px;right:14px;z-index:5;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(10,10,15,.6);backdrop-filter:blur(8px);color:#fff;font-size:17px;cursor:pointer;}
  .sd-close:hover{background:rgba(255,255,255,.16);}
  .sd-hero{position:relative;padding:34px 30px 24px;overflow:hidden;border-radius:22px 22px 0 0;}
  .sd-hero-bg{position:absolute;inset:-20px;background-size:cover;background-position:center 25%;filter:saturate(1.1);opacity:.55;}
  .sd-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,18,26,.2),rgba(18,18,26,.75) 55%,var(--bg-2,#12121a));}
  .sd-hero-in{position:relative;z-index:1;display:flex;gap:24px;align-items:flex-end;}
  .sd-poster{width:150px;aspect-ratio:2/3;border-radius:14px;object-fit:cover;flex:0 0 auto;background:#22222e;box-shadow:0 14px 40px rgba(0,0,0,.55);}
  .sd-poster.ph{display:grid;place-items:center;font-size:46px;}
  .sd-head{min-width:0;flex:1;}
  .sd-kicker{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#fff;background:rgba(229,9,20,.85);padding:4px 10px;border-radius:999px;}
  .sd-kicker i{width:7px;height:7px;border-radius:50%;background:#fff;animation:livepulse 1.6s infinite;}
  .sd-h{margin:10px 0 2px;font-size:clamp(22px,3.2vw,34px);line-height:1.1;font-weight:800;letter-spacing:-.02em;color:#fff;}
  .sd-ep{font-size:15px;color:#d6d6de;font-weight:600;}
  .sd-facts{display:flex;flex-wrap:wrap;gap:6px 14px;margin:10px 0;font-size:13px;color:#b8bcc8;}
  .sd-facts b{color:var(--gold,#f5c518);}
  .sd-chips{display:flex;flex-wrap:wrap;gap:6px;}
  .sd-chip{font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.09);color:#e3e3ea;}
  .sd-who{display:flex;align-items:center;gap:10px;margin-top:14px;font-size:13.5px;color:#cfd2da;}
  .sd-av{width:34px;height:34px;border-radius:50%;object-fit:cover;background:var(--accent,#e50914);display:grid;place-items:center;font-weight:800;color:#fff;flex:0 0 auto;}
  .sd-who b{color:#fff;}
  .sd-body{padding:6px 30px 30px;display:flex;flex-direction:column;gap:18px;}
  .sd-box{background:var(--card,#1a1a24);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:16px 18px;}
  .sd-ended{background:rgba(245,197,24,.12);border:1px solid rgba(245,197,24,.3);color:#f5d36a;border-radius:12px;padding:10px 14px;font-weight:700;font-size:13px;}
  .sd-prog-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
  .sd-time{margin-left:auto;font-variant-numeric:tabular-nums;color:#b8bcc8;font-size:14px;}
  .sd-time b{color:#fff;font-size:20px;font-weight:800;}
  .sd-track{position:relative;height:10px;margin:14px 0 10px;border-radius:999px;background:rgba(255,255,255,.08);}
  .sd-track>i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;}
  .sd-track .buf{background:rgba(255,255,255,.16);}
  .sd-track .pos{background:linear-gradient(90deg,color-mix(in srgb,var(--accent,#e50914) 70%,#000),var(--accent,#e50914));transition:width .9s linear;}
  .sd-knob{position:absolute;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px color-mix(in srgb,var(--accent,#e50914) 40%,transparent);transition:left .9s linear;}
  .sd-prog-meta{display:flex;flex-wrap:wrap;gap:6px 20px;font-size:12.5px;color:#9aa0ad;font-variant-numeric:tabular-nums;}
  .sd-prog-meta b{color:#e8e8ee;font-weight:700;}
  .sd-pipe{display:grid;grid-template-columns:1fr minmax(70px,.7fr) 1fr minmax(70px,.7fr) 1fr;align-items:center;gap:0;}
  .sd-node{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px 14px;text-align:center;min-width:0;}
  .sd-node .ic{font-size:24px;line-height:1;}
  .sd-node .lb{font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#9aa0ad;margin:6px 0 3px;}
  .sd-node .v{font-weight:800;color:#fff;font-size:14px;overflow-wrap:anywhere;}
  .sd-node .s{font-size:12px;color:#b8bcc8;margin-top:2px;overflow-wrap:anywhere;}
  .sd-node.mid{border-color:var(--sd-c);background:color-mix(in srgb,var(--sd-c) 10%,transparent);}
  .sd-link{position:relative;height:30px;display:flex;align-items:center;justify-content:center;}
  .sd-link::before{content:"";position:absolute;left:4px;right:4px;top:50%;height:3px;margin-top:-1.5px;border-radius:3px;background:repeating-linear-gradient(90deg,var(--sd-c) 0 10px,transparent 10px 18px);background-size:18px 3px;animation:sdFlow .8s linear infinite;opacity:.9;}
  .sd-link em{position:relative;font-style:normal;font-size:10.5px;font-weight:800;color:#fff;background:var(--bg-2,#12121a);padding:2px 7px;border-radius:999px;border:1px solid var(--sd-c);white-space:nowrap;}
  .sd-pipe.paused .sd-link::before{animation-play-state:paused;opacity:.45;}
  @keyframes sdFlow{to{background-position:18px 0;}}
  .sd-insights{display:flex;flex-direction:column;gap:8px;}
  .sd-ins{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.45;color:#dcdce4;padding:9px 12px;border-radius:11px;background:rgba(255,255,255,.04);border-left:3px solid var(--sd-c,#9aa0ad);}
  .sd-ins .i{flex:0 0 auto;}
  .sd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;}
  .sd-ph{display:flex;align-items:center;gap:8px;margin:0 0 12px;}
  .sd-ph h4{margin:0;font-size:13px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#cfd2da;}
  .sd-dec{margin-left:auto;font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:999px;color:var(--sd-c);background:color-mix(in srgb,var(--sd-c) 16%,transparent);text-transform:uppercase;letter-spacing:.06em;}
  .sd-cmp{width:100%;border-collapse:collapse;font-size:13px;}
  .sd-cmp th{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7d8290;text-align:left;padding:0 6px 6px 0;}
  .sd-cmp td{padding:6px 6px 6px 0;border-top:1px solid rgba(255,255,255,.05);color:#e6e6ec;vertical-align:top;overflow-wrap:anywhere;}
  .sd-cmp td:first-child{color:#9aa0ad;width:32%;}
  .sd-cmp td.ar{width:18px;color:#5d6270;text-align:center;}
  .sd-cmp tr.chg td.out{color:#ffb36b;font-weight:700;}
  .sd-cmp tr.chg td.ar{color:#ffb36b;}
  .sd-kv{display:grid;grid-template-columns:auto 1fr;gap:7px 14px;font-size:13px;}
  .sd-kv dt{color:#9aa0ad;}
  .sd-kv dd{margin:0;color:#e6e6ec;text-align:right;overflow-wrap:anywhere;}
  .sd-meter{margin-top:12px;}
  .sd-meter .row{display:flex;justify-content:space-between;font-size:11.5px;color:#9aa0ad;margin-bottom:4px;}
  .sd-meter .bar{height:7px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden;margin-bottom:8px;}
  .sd-meter .bar>i{display:block;height:100%;border-radius:999px;}
  .sd-file{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;color:#cfd2da;background:rgba(0,0,0,.25);border-radius:9px;padding:9px 11px;margin-bottom:12px;overflow-wrap:anywhere;}
  .sd-about p{margin:0 0 10px;color:#d6d6de;line-height:1.6;font-size:14px;}
  .sd-tag{font-style:italic;color:#b8bcc8;}
  .sd-about .rail{margin:0 -18px;}
  .sd-about .cast-row{padding:4px 18px 10px !important;}
  .sd-about .cast{width:118px;}
  .sd-rates{display:inline-flex;flex-wrap:wrap;align-items:center;gap:8px;}
  .sd-rates:empty{display:none;}
  .sd-rate{display:inline-flex;align-items:center;gap:6px;padding:3px 9px 3px 3px;border-radius:8px;background:rgba(0,0,0,.38);border:1px solid rgba(255,255,255,.12);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#fff;font-size:13px;line-height:1;text-decoration:none;}
  .sd-rate i{font-style:normal;font-weight:900;font-size:10.5px;padding:3px 5px;border-radius:5px;}
  .sd-rate.imdb i{background:#f5c518;color:#000;font-family:'Arial Black',Impact,sans-serif;letter-spacing:-.02em;}
  .sd-rate.tmdb i{background:linear-gradient(90deg,#90cea1,#01b4e4);color:#032541;}
  .sd-rate b{color:#fff;font-weight:800;font-variant-numeric:tabular-nums;}
  .sd-rate small{color:#8a8f99;font-size:11px;font-weight:600;}
  a.sd-rate:hover{border-color:rgba(245,197,24,.65);}
  .sd-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;}
  .sd-btn{border:0;border-radius:11px;padding:10px 16px;font-weight:800;font-size:13px;cursor:pointer;background:var(--accent,#e50914);color:#fff;}
  .sd-btn.ghost{background:rgba(255,255,255,.08);color:#e6e6ec;}
  @media (max-width:768px){
    .sd-overlay{padding:0;align-items:flex-end;}
    .sd-card{width:100%;max-height:94vh;max-height:94dvh;border-radius:22px 22px 0 0;animation-name:sdUp;}
    @keyframes sdUp{from{transform:translateY(40px);opacity:0;}to{transform:none;opacity:1;}}
    .sd-card::before{content:"";position:sticky;display:block;top:6px;z-index:6;width:42px;height:5px;margin:6px auto -11px;border-radius:999px;background:rgba(255,255,255,.35);}
    .sd-hero{padding:26px 16px 16px;}
    .sd-hero-in{gap:14px;}
    .sd-poster{width:96px;border-radius:10px;}
    .sd-body{padding:4px 16px 26px;gap:14px;}
    .sd-box{padding:14px;}
    .sd-pipe{grid-template-columns:1fr;}
    .sd-link{height:34px;}
    .sd-link::before{left:50%;right:auto;top:2px;bottom:2px;width:3px;height:auto;margin:0 0 0 -1.5px;background:repeating-linear-gradient(180deg,var(--sd-c) 0 10px,transparent 10px 18px);background-size:3px 18px;animation-name:sdFlowV;}
    @keyframes sdFlowV{to{background-position:0 18px;}}
    .sd-grid{grid-template-columns:1fr;}
    .sd-about .rail{margin:0 -14px;}
    .sd-about .cast-row{padding:4px 14px 10px !important;}
    .sd-about .cast{width:104px;}
  }
  @media (prefers-reduced-motion:reduce){.sd-link::before,.sd-kicker i{animation:none;}.sd-card{animation:none;}.sd-track .pos,.sd-knob{transition:none;}}`;

const C_DP = '#35d07f', C_DS = '#8b7dff', C_TC = '#ff6b6b', C_WARN = '#f5c518', C_INFO = '#6aa8ff';
const latest = new Map();          // sessionKey -> newest session from the poll
let sdKey = null, sdBase = null, sdTick = null, sdCast = [];

const fmtClock = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
const fmtDur = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const fmtRate = (kbps) => (!kbps ? '' : kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${Math.round(kbps)} kbps`);
const fmtSize = (b) => (!b ? '' : b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : `${(b / 1048576).toFixed(0)} MB`);
const fmtRes = (r) => { const v = String(r || ''); if (!v) return ''; if (/4k|2160/i.test(v)) return '4K'; if (/^\d+$/.test(v)) return v + 'p'; return v.toUpperCase() === 'SD' ? 'SD' : v; };
const fmtCh = (n, layout) => { const l = String(layout || '').replace(/\(.*\)/, ''); if (l) return l === 'stereo' ? 'Stereo' : l === 'mono' ? 'Mono' : l; return n ? (n === 2 ? 'Stereo' : n === 1 ? 'Mono' : n === 6 ? '5.1' : n === 8 ? '7.1' : n + 'ch') : ''; };
const cap1 = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
function decisionOf(d) {
  const v = String(d || '').toLowerCase();
  if (!v) return null;
  if (v.includes('transcode')) return { label: 'Transcode', c: C_TC };
  if (v === 'copy' || v.includes('stream')) return { label: 'Direct Stream', c: C_DS };
  if (v === 'burn') return { label: 'Burn-in', c: C_WARN };
  if (v.includes('direct')) return { label: 'Direct Play', c: C_DP };
  return { label: cap1(v), c: C_INFO };
}
const decBadge = (d) => { const x = decisionOf(d); return x ? `<span class="sd-dec" style="--sd-c:${x.c}">${x.label}</span>` : ''; };
const statePill = (st) => (st === 'paused' ? '<span class="live-pill pill-pause">⏸ Paused</span>' : st === 'buffering' ? '<span class="live-pill pill-buf">⟳ Buffering</span>' : '<span class="live-pill pill-play">▶ Playing</span>');
const isTranscode = (s) => /transcode/i.test(`${s.transcode} ${s.videoDecision} ${s.audioDecision}`);

function cmpTable(rows) {
  // A row given only a source value (b === null) is a property of the file
  // that Tautulli does not report for the stream; it spans both columns
  // rather than implying it was carried over unchanged.
  const body = rows.filter(([, a, b]) => a || b).map(([k, a, b]) => {
    if (b === null) return `<tr><td>${escHTML(k)}</td><td colspan="3">${escHTML(a)}</td></tr>`;
    const chg = a && b && String(a) !== String(b);
    return `<tr class="${chg ? 'chg' : ''}"><td>${escHTML(k)}</td><td>${escHTML(a || '—')}</td><td class="ar">→</td><td class="out">${escHTML(b || a || '—')}</td></tr>`;
  }).join('');
  return `<table class="sd-cmp"><tr><th></th><th>Source</th><th></th><th>Stream</th></tr>${body}</table>`;
}
const kv = (pairs) => `<dl class="sd-kv">${pairs.filter(([, v]) => v !== '' && v != null && v !== false).map(([k, v]) => `<dt>${escHTML(k)}</dt><dd>${v === true ? 'Yes' : escHTML(v)}</dd>`).join('')}</dl>`;
const panel = (icon, title, badge, inner) => `<section class="sd-box"><div class="sd-ph"><span>${icon}</span><h4>${title}</h4>${badge || ''}</div>${inner}</section>`;

// Plain-language reasons for what Plex is doing with this stream. Plex does
// not keep a "reason" string once a session ends, so every cause is worked out
// by comparing the source file with what was sent to the player. Entries with
// `cause` set explain WHY Plex had to convert something; the first one is the
// headline verdict on the History sheet. `tip` is what to change to avoid it.
function insightList(s, { live = true } = {}) {
  const d = s.detail || {}, v = d.video || {}, a = d.audio || {}, sub = d.subtitle || {}, t = d.transcode || {}, p = d.player || {}, f = d.file || {};
  const out = [];
  const add = (c, i, msg, extra = {}) => out.push({ c, i, msg, ...extra });
  const vTC = /transcode/i.test(v.decision), aTC = /transcode/i.test(a.decision);
  const vCopy = /copy|stream/i.test(v.decision), aCopy = /copy|stream/i.test(a.decision);
  const tc = isTranscode(s), burn = /burn/i.test(sub.decision);
  const profile = String(f.qualityProfile || '');
  const limited = profile && !/original/i.test(profile);
  const srcRes = fmtRes(v.src?.resolution), outRes = fmtRes(v.out?.resolution);
  const codecChanged = v.src?.codec && v.out?.codec && v.src.codec !== v.out.codec;
  if (!tc && !burn && !vCopy && !aCopy) add(C_DP, '✅', '<b>Direct Play</b> — the file is sent to the player untouched. Best quality, near-zero server load.');
  if (burn) add(C_WARN, '💬', `<b>${escHTML(sub.codec || 'Image')} subtitles ${live ? 'are being' : 'were'} burned in</b>${vTC ? ' — this alone forces the video transcode.' : '.'}`, { cause: vTC, short: `${sub.codec || 'Image'} subtitles burned in`, tip: `Use text subtitles (SRT), or a player that can show ${sub.codec || 'image'} subtitles itself.` });
  if (vTC && limited) add(C_TC, '📉', `Player quality ${live ? 'is' : 'was'} set to <b>${escHTML(profile)}</b>, below the source (${escHTML(fmtRate(f.bitrate) || srcRes)}).`, { cause: true, short: `Quality limited to ${profile}`, tip: 'Set the player\'s quality to Original (or raise the Remote Streaming limit in Plex) to allow Direct Play.' });
  if (vTC && codecChanged && !limited && !burn) add(C_TC, '🎞️', `The player can't decode <b>${escHTML(v.src.codec)}${v.src.profile ? ' ' + escHTML(cap1(v.src.profile)) : ''}</b> video — converted to <b>${escHTML(v.out.codec)}</b>.`, { cause: true, short: `Player can't decode ${v.src.codec}`, tip: `Use a player with ${v.src.codec} support, or keep an H.264 version of this title.` });
  if (aTC && a.src?.codec) add(C_DS, '🔊', `The player can't use <b>${escHTML(a.src.codec)}${a.src.profile ? ' ' + escHTML(cap1(a.src.profile)) : ''}</b> audio — converted to <b>${escHTML(a.out?.codec || '?')} ${escHTML(fmtCh(a.out?.channels, a.out?.layout))}</b>.`, { cause: true, short: `Audio ${a.src.codec} not supported`, tip: 'Audio conversion is cheap. For full quality, use a player or receiver that supports this format, or enable passthrough.' });
  if (/hdr|dolby/i.test(v.src?.dynamicRange || '') && /sdr/i.test(v.out?.dynamicRange || '')) add(C_WARN, '🌈', `<b>HDR → SDR tone mapping</b>: the ${escHTML(v.src.dynamicRange)} source ${live ? 'is being' : 'was'} converted for an SDR screen. Colours look flatter than the original.`, { cause: vTC && !limited && !burn && !codecChanged, short: 'HDR not supported by the player', tip: 'Play on an HDR-capable TV/app to keep HDR and avoid tone mapping.' });
  if (vTC && srcRes !== outRes && outRes) add(C_TC, '📐', `Resolution reduced <b>${escHTML(srcRes)} → ${escHTML(outRes)}</b>.`);
  if (vTC && !out.some((x) => x.cause && x.c !== C_DS)) {
    if (p.location === 'wan' || p.relayed) add(C_TC, '📶', 'No codec or subtitle mismatch — the bitrate was reduced to fit the <b>remote connection</b>.', { cause: true, short: 'Bitrate cut for the remote connection', tip: 'Raise the Remote Streaming limit in Plex (Settings → Remote Access) or the user\'s upload limit.' });
    else add(C_INFO, '❔', 'Plex transcoded the video but no codec, subtitle or quality mismatch was recorded.', { cause: true, short: 'No recorded cause', tip: 'Check the player\'s quality setting — some apps default to a lower quality.' });
  }
  if (!tc && (vCopy || aCopy)) {
    const cont = f.container && f.streamContainer && f.container !== f.streamContainer ? ` (${escHTML(f.container)} → ${escHTML(f.streamContainer)})` : '';
    add(C_DS, '📦', `<b>Direct Stream</b> — the container was repackaged${cont}, but video and audio were not re-encoded. No quality loss, very little server load.`, { cause: true, short: `Container repackaged${cont ? ' ' + cont.replace(/<[^>]+>/g, '') : ''}`, tip: 'Nothing to fix — this is nearly as good as Direct Play.' });
  }
  if (tc) {
    if (t.hwDecode || t.hwEncode) add(C_DP, '⚡', `Hardware transcoding: decode <b>${t.hwDecode ? escHTML(t.hwDecodeTitle || 'GPU') : 'CPU'}</b>, encode <b>${t.hwEncode ? escHTML(t.hwEncodeTitle || 'GPU') : 'CPU'}</b>.`);
    else if (vTC) add(C_WARN, '🔥', `<b>Software transcoding</b> — the CPU ${live ? 'is doing' : 'did'} all the work. Hardware acceleration would cut server load sharply.`);
    const sp = Number(t.speed);
    if (sp && sp < 1) add(C_TC, '🐢', `Transcoder is running <b>slower than real time (${sp.toFixed(1)}×)</b> — expect buffering.`);
    else if (sp) add(C_DP, '🚀', `Transcoder speed <b>${sp.toFixed(1)}×</b> real time${t.throttled ? ' and throttled (it is comfortably ahead of playback)' : ''}.`);
  }
  if (p.relayed) add(C_TC, '🛰️', `<b>Plex Relay</b> ${live ? 'in use' : 'was used'} — the connection was routed through Plex's servers and bandwidth is capped. Check Remote Access / port forwarding.`);
  if (p.location === 'wan' && p.secure === false) add(C_WARN, '🔓', 'Remote stream over an <b>insecure</b> connection.');
  if (live && s.state === 'buffering') add(C_DS, '⟳', 'The player is <b>buffering</b> right now.');
  return out;
}
const insightHTML = (x) => `<div class="sd-ins" style="--sd-c:${x.c}"><span class="i">${x.i}</span><span>${x.msg}${x.tip ? `<br><small class="sd-tip">💡 ${escHTML(x.tip)}</small>` : ''}</span></div>`;
const insights = (s, opts) => insightList(s, opts).map(insightHTML).join('');

function streamParts(s, opts) {
  const d = s.detail || {}, v = d.video || {}, a = d.audio || {}, sub = d.subtitle || {}, t = d.transcode || {}, p = d.player || {}, f = d.file || {};
  const tc = isTranscode(s);
  const c = tc ? C_TC : /copy|stream/i.test(`${v.decision} ${a.decision}`) ? C_DS : C_DP;
  const hdrSrc = v.src?.dynamicRange && !/sdr/i.test(v.src.dynamicRange) ? ' ' + v.src.dynamicRange : '';
  const hdrOut = v.out?.dynamicRange && !/sdr/i.test(v.out.dynamicRange) ? ' ' + v.out.dynamicRange : '';
  const srcV = `${v.src?.codec || s.videoCodec || ''} ${fmtRes(v.src?.resolution || s.resolution)}${hdrSrc}`.trim();
  const outV = `${v.out?.codec || v.src?.codec || ''} ${fmtRes(v.out?.resolution || v.src?.resolution || s.resolution)}${hdrOut || (tc ? '' : hdrSrc)}`.trim();
  const midTitle = tc ? 'Transcoding' : /copy|stream/i.test(`${v.decision} ${a.decision}`) ? 'Direct Stream' : 'Direct Play';
  const midSub = tc ? [t.hwDecode || t.hwEncode ? `${t.hwDecode ? t.hwDecodeTitle || 'HW' : 'CPU'} → ${t.hwEncode ? t.hwEncodeTitle || 'HW' : 'CPU'}` : 'Software', t.speed ? `${Number(t.speed).toFixed(1)}×` : ''].filter(Boolean).join(' · ') : 'No processing';
  const bw = p.bandwidth || s.bandwidth;
  const pipe = `<div class="sd-pipe ${s.state === 'playing' ? '' : 'paused'}" style="--sd-c:${c}">
      <div class="sd-node"><div class="ic">💾</div><div class="lb">Source file</div><div class="v">${escHTML(srcV || '—')}</div><div class="s">${escHTML([fmtRate(f.bitrate), f.container].filter(Boolean).join(' · '))}</div></div>
      <div class="sd-link"><em>${escHTML(tc ? 'Transcode' : 'Original')}</em></div>
      <div class="sd-node mid"><div class="ic">${tc ? '⚙️' : '🟢'}</div><div class="lb">Plex server</div><div class="v">${midTitle}</div><div class="s">${escHTML(midSub)}</div></div>
      <div class="sd-link"><em>${escHTML([fmtRate(bw), (p.location || '').toUpperCase()].filter(Boolean).join(' · ') || 'Stream')}</em></div>
      <div class="sd-node"><div class="ic">📺</div><div class="lb">${escHTML(p.platform || s.device || 'Player')}</div><div class="v">${escHTML(p.device || p.name || s.player || '—')}</div><div class="s">${escHTML(outV)}</div></div>
    </div>`;
  const srcRate = f.bitrate || 0, outRate = f.streamBitrate || (tc ? 0 : srcRate);
  const meter = srcRate ? `<div class="sd-meter">
      <div class="row"><span>Source bitrate</span><span>${fmtRate(srcRate)}</span></div><div class="bar"><i style="width:100%;background:#5d6270"></i></div>
      <div class="row"><span>Streamed bitrate</span><span>${fmtRate(outRate) || '—'}${outRate && srcRate ? ` · ${Math.round((outRate / srcRate) * 100)}%` : ''}</span></div><div class="bar"><i style="width:${Math.min(100, srcRate ? (outRate / srcRate) * 100 : 0)}%;background:${c}"></i></div>
    </div>` : '';
  const videoPanel = panel('🎞️', 'Video', decBadge(v.decision || s.videoDecision), cmpTable([
    ['Codec', v.src?.codec, v.out?.codec],
    ['Resolution', fmtRes(v.src?.resolution), fmtRes(v.out?.resolution)],
    ['Frame size', v.src?.width ? `${v.src.width}×${v.src.height}` : '', v.out?.width ? `${v.out.width}×${v.out.height}` : ''],
    ['Bitrate', fmtRate(v.src?.bitrate), fmtRate(v.out?.bitrate)],
    ['Dynamic range', v.src?.dynamicRange, v.out?.dynamicRange],
    ['Bit depth', v.src?.bitDepth ? `${v.src.bitDepth}-bit` : '', v.out?.bitDepth ? `${v.out.bitDepth}-bit` : ''],
    ['Frame rate', v.src?.fps ? `${v.src.fps} fps` : '', v.out?.fps ? `${v.out.fps} fps` : ''],
    ['Profile', [cap1(v.src?.profile), v.src?.level ? `L${v.src.level}` : ''].filter(Boolean).join(' · '), null],
    ['Colour', [v.src?.primaries, v.src?.trc].filter(Boolean).join(' / '), null],
    ['Chroma', v.src?.chroma, null],
    ['Aspect / scan', [v.src?.aspect ? v.src.aspect + ':1' : '', cap1(v.src?.scan)].filter(Boolean).join(' · '), null]
  ]) + meter);
  const audioPanel = panel('🔊', 'Audio', decBadge(a.decision || s.audioDecision), cmpTable([
    ['Codec', a.src?.codec, a.out?.codec],
    ['Profile', cap1(a.src?.profile), null],
    ['Channels', fmtCh(a.src?.channels, a.src?.layout), fmtCh(a.out?.channels, a.out?.layout)],
    ['Bitrate', fmtRate(a.src?.bitrate), fmtRate(a.out?.bitrate)],
    ['Language', a.src?.language, a.out?.language],
    ['Sample rate', a.src?.sampleRate ? `${(a.src.sampleRate / 1000).toFixed(1)} kHz` : '', null]
  ]));
  const subPanel = panel('💬', 'Subtitles', sub.on ? decBadge(sub.decision) : '', sub.on
    ? kv([['Language', sub.language], ['Format', sub.codec], ['Delivered as', sub.outCodec], ['Forced', sub.forced ? 'Yes' : 'No']])
    : '<div class="sd-kv" style="color:#9aa0ad">Subtitles off</div>');
  const tcPanel = tc ? panel('⚙️', 'Transcoder', decBadge(t.decision), kv([
    ['Speed', t.speed ? `${Number(t.speed).toFixed(1)}× real time` : ''],
    ['Throttled', t.throttled ? 'Yes' : 'No'],
    ['HW requested', t.hwRequested ? 'Yes' : 'No'],
    ['Decoding', t.hwDecode ? `Hardware (${t.hwDecodeTitle || 'GPU'})` : 'Software (CPU)'],
    ['Encoding', t.hwEncode ? `Hardware (${t.hwEncodeTitle || 'GPU'})` : 'Software (CPU)'],
    ['Buffered ahead', d.transcodeProgress ? `${d.transcodeProgress}% of file` : '']
  ])) : '';
  const playerPanel = panel('📺', 'Player', '', kv([
    ['Device', p.device || s.player], ['Name', p.name !== (p.device || s.player) ? p.name : ''], ['App', [p.product, p.productVersion].filter(Boolean).join(' ')],
    ['Platform', [p.platform || s.device, p.platformVersion].filter(Boolean).join(' ')],
    ['Quality setting', f.qualityProfile]
  ]));
  const netPanel = panel('🌐', 'Network', p.location ? `<span class="sd-dec" style="--sd-c:${p.location === 'lan' ? C_DP : C_INFO}">${p.location === 'lan' ? 'Local' : 'Remote'}</span>` : '', kv([
    ['Bandwidth', fmtRate(bw)], ['IP address', p.ip], ['Location', p.location ? (p.location === 'lan' ? 'LAN (home network)' : 'WAN (internet)') : ''],
    ['Secure', p.secure == null ? '' : p.secure ? 'Yes' : 'No'], ['Relayed', p.relayed ? 'Yes — Plex Relay' : 'No']
  ]));
  const filePanel = panel('📁', 'File', '', `${f.name ? `<div class="sd-file">${escHTML(f.name)}</div>` : ''}${kv([
    ['Size', fmtSize(f.size)], ['Container', f.container && f.streamContainer && f.container !== f.streamContainer ? `${f.container} → ${f.streamContainer}` : f.container],
    ['Overall bitrate', fmtRate(f.bitrate)], ['Optimized version', f.optimized ? 'Yes' : ''], ['Synced', f.synced ? 'Yes' : '']
  ])}`);
  const ins = insights(s, opts);
  return { pipe, ins, grid: `<div class="sd-grid">${videoPanel}${audioPanel}${tcPanel}${subPanel}${playerPanel}${netPanel}${filePanel}</div>` };
}

function liveHTML(s, ended) {
  const d = s.detail || {};
  const tc = isTranscode(s);
  const { pipe, ins, grid } = streamParts(s);
  return `${ended ? '<div class="sd-ended">⏹ This stream has ended — showing the last known details.</div>' : ''}
    <section class="sd-box sd-prog">
      <div class="sd-prog-top">${statePill(s.state)}${tc ? '<span class="live-pill pill-tc">Transcode</span>' : '<span class="live-pill pill-dp">Direct Play</span>'}${s.is4k ? '<span class="live-pill pill-4k">4K</span>' : ''}${s.dynamicRange && !/sdr/i.test(s.dynamicRange) ? `<span class="live-pill pill-hdr">${escHTML(s.dynamicRange)}</span>` : ''}
        <span class="sd-time"><b data-sd="pos">0:00</b> / <span data-sd="dur">0:00</span></span></div>
      <div class="sd-track"><i class="buf" style="width:${Math.min(100, d.transcodeProgress || 0)}%"></i><i class="pos" data-sd="bar"></i><span class="sd-knob" data-sd="knob"></span></div>
      <div class="sd-prog-meta"><span><b data-sd="pct">0%</b> watched</span><span><b data-sd="left">—</b> left</span><span>Ends ≈ <b data-sd="eta">—</b></span>${d.transcodeProgress ? `<span>Transcoded <b>${d.transcodeProgress}%</b></span>` : ''}</div>
    </section>
    <section class="sd-box">${pipe}</section>
    ${ins ? `<section class="sd-box"><div class="sd-ph"><span>🧠</span><h4>What's happening</h4></div><div class="sd-insights">${ins}</div></section>` : ''}
    ${grid}`;
}

function heroHTML(s) {
  const d = s.detail || {};
  const show = s.type === 'episode';
  const title = show ? (s.grandparent || s.title) : s.title;
  const se = show && (d.season || d.episode) ? `S${String(d.season).padStart(2, '0')}E${String(d.episode).padStart(2, '0')}` : '';
  const facts = [s.year, d.contentRating, d.duration ? fmtDur(d.duration) : '', d.studio].filter(Boolean).map((x) => `<span>${escHTML(x)}</span>`).join('');
  const av = d.userThumb ? `<img class="sd-av" src="${escHTML(d.userThumb)}" alt="" referrerpolicy="no-referrer">` : `<span class="sd-av">${escHTML((s.user || '?').slice(0, 1).toUpperCase())}</span>`;
  const bg = s.backdrop || s.poster;
  return `<div class="sd-hero">
      ${bg ? `<div class="sd-hero-bg" style="background-image:url('${escHTML(bg)}')"></div>` : ''}
      <div class="sd-hero-in">
        ${s.poster ? `<img class="sd-poster" src="${escHTML(s.poster)}" alt="">` : `<div class="sd-poster ph">${show ? '📺' : '🎬'}</div>`}
        <div class="sd-head">
          <span class="sd-kicker"><i></i>Live${se ? ' · ' + se : ''}</span>
          <h2 class="sd-h">${escHTML(title || '')}</h2>
          ${show && (d.episodeTitle || s.title) ? `<div class="sd-ep">${escHTML(d.episodeTitle || s.title)}</div>` : ''}
          <div class="sd-facts" data-sd="facts">${facts}<span class="sd-rates" data-sd="rates"></span></div>
          <div class="sd-chips" data-sd="genres">${(d.genres || []).map((g) => `<span class="sd-chip">${escHTML(g)}</span>`).join('')}</div>
          <div class="sd-who">${av}<span><b>${escHTML(s.user || 'User')}</b> is watching on ${escHTML(d.player?.device || s.player || 'a player')}</span></div>
        </div>
      </div></div>`;
}

function aboutHTML(s, info) {
  const d = s.detail || {};
  const overview = info?.overview || d.summary;
  const tagline = info?.tagline || d.tagline;
  const cast = (info?.cast || []).slice(0, 14);
  const people = kv([['Director', (d.directors || []).join(', ')], ['Released', d.released || info?.releaseDate || ''], ['Studio', d.studio]]);
  if (!overview && !cast.length && !s.tmdbId) return '';
  return `<section class="sd-box sd-about"><div class="sd-ph"><span>🎬</span><h4>About</h4></div>
    ${tagline ? `<p class="sd-tag">${escHTML(tagline)}</p>` : ''}
    ${overview ? `<p>${escHTML(overview)}</p>` : info === undefined ? '<p style="color:#7d8290">Loading details…</p>' : ''}
    ${people}
    ${cast.length ? `<div class="sd-ph" style="margin-top:16px"><span>⭐</span><h4>Cast</h4></div><div class="cast-row sd-cast">${cast.map((c, i) => `<div class="cast" role="button" tabindex="0" data-sd-person="${i}" aria-label="${escHTML(c.character ? `${c.name} as ${c.character}` : c.name || '')}">${castTileHTML(c)}</div>`).join('')}</div>` : ''}
    ${s.tmdbId ? '<div class="sd-actions"><button class="sd-btn" data-sd-act="open">Open title page</button></div>' : ''}
  </section>`;
}

function updateClock() {
  const host = document.getElementById('streamModal');
  if (!host || host.classList.contains('hidden') || !sdBase) { clearInterval(sdTick); sdTick = null; return; }
  const { s, at } = sdBase;
  const dur = s.detail?.duration || 0;
  let pos = s.detail?.viewOffset || (dur * (s.progress || 0)) / 100;
  if (s.state === 'playing' && !sdBase.ended) pos += Date.now() - at;
  pos = dur ? Math.min(pos, dur) : pos;
  const pct = dur ? (pos / dur) * 100 : (s.progress || 0);
  const q = (k) => host.querySelector(`[data-sd="${k}"]`);
  const set = (k, v) => { const n = q(k); if (n) n.textContent = v; };
  set('pos', fmtClock(pos)); set('dur', dur ? fmtClock(dur) : '—'); set('pct', Math.floor(pct) + '%');
  set('left', dur ? fmtClock(dur - pos) : '—');
  set('eta', dur ? new Date(Date.now() + (dur - pos)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
  const bar = q('bar'), knob = q('knob');
  if (bar) bar.style.width = pct + '%';
  if (knob) knob.style.left = pct + '%';
}

function drawLive(s, ended = false) {
  const host = document.getElementById('streamModal');
  const live = host?.querySelector('.sd-live');
  if (!live) return;
  live.innerHTML = liveHTML(s, ended);
  sdBase = { s, at: Date.now(), ended };
  updateClock();
  if (!sdTick) sdTick = setInterval(updateClock, 1000);
}

function closeStream() {
  const host = document.getElementById('streamModal');
  if (!host || host.classList.contains('hidden')) return;
  host.classList.add('hidden');
  clearSheetDrag(host.querySelector('.sd-card'));
  host.querySelector('.sd-card').innerHTML = '';
  clearInterval(sdTick); sdTick = null; sdKey = null; sdBase = null;
  releaseScrollLock('stream');
}

async function openStream(key) {
  const s = latest.get(key);
  if (!s) return;
  let host = document.getElementById('streamModal');
  if (!host) {
    host = document.createElement('div');
    host.id = 'streamModal'; host.className = 'sd-overlay hidden';
    host.innerHTML = '<div class="modal-backdrop sd-backdrop"></div><div class="sd-card" role="dialog" aria-modal="true" aria-label="Stream details"></div>';
    document.body.appendChild(host);
    host.querySelector('.sd-backdrop').addEventListener('click', closeStream);
    host.addEventListener('click', (e) => {
      const person = e.target.closest('[data-sd-person]');
      if (e.target.closest('.sd-close')) closeStream();
      else if (person && window.openPerson) {
        const p = sdCast[Number(person.dataset.sdPerson)];
        if (p?.id) { closeStream(); window.openPerson(p); }
      }
      else if (e.target.closest('[data-sd-act="open"]') && sdBase?.s?.tmdbId && window.openDetail) {
        const it = sdBase.s;
        closeStream();
        window.openDetail({ id: it.tmdbId, media: it.media || (it.type === 'episode' ? 'tv' : 'movie'), title: it.type === 'episode' ? it.grandparent : it.title, poster: it.poster, backdrop: it.backdrop });
      }
    });
    host.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-sd-person]')) { e.preventDefault(); e.target.click(); } });
    enableSheetDrag(host.querySelector('.sd-card'), closeStream);
  }
  sdKey = key;
  const card = host.querySelector('.sd-card');
  card.innerHTML = `<button class="sd-close" aria-label="Close">✕</button>${heroHTML(s)}<div class="sd-body"><div class="sd-live" style="display:contents"></div><div class="sd-about-slot">${aboutHTML(s, undefined)}</div></div>`;
  card.scrollTop = 0;
  host.classList.remove('hidden');
  applyScrollLock('stream');
  drawLive(s);
  sdCast = [];
  if (!s.tmdbId) return;
  const media = s.media || (s.type === 'episode' ? 'tv' : 'movie');
  // The detail route's imdbRating is only filled from cache, so ask the same
  // OMDb-backed batch endpoint the poster badges use — in parallel, so a slow
  // OMDb lookup never holds up the overview and cast.
  const rates = { imdb: null, imdbUrl: null, imdbVotes: null, tmdb: null };
  const paintRates = () => {
    const el = card.querySelector('[data-sd="rates"]');
    if (!el || sdKey !== key) return;
    el.innerHTML = (rates.imdb != null ? `<${rates.imdbUrl ? `a href="${escHTML(rates.imdbUrl)}" target="_blank" rel="noopener"` : 'span'} class="sd-rate imdb" title="IMDb rating"><i>IMDb</i><b>${Number(rates.imdb).toFixed(1)}</b><small>/10${rates.imdbVotes ? ` · ${escHTML(rates.imdbVotes)}` : ''}</small></${rates.imdbUrl ? 'a' : 'span'}>` : '')
      + (rates.tmdb ? `<span class="sd-rate tmdb" title="TMDB rating"><i>TMDB</i><b>${Number(rates.tmdb).toFixed(1)}</b><small>/10</small></span>` : '');
  };
  fetch('/api/discover/imdb-ratings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ items: [{ media, id: s.tmdbId }] }) })
    .then((r) => r.json()).then((r) => {
      const v = r?.ratings?.[String(s.tmdbId)];
      if (v != null && rates.imdb == null) rates.imdb = Number(v);
      if (r?.urls?.[String(s.tmdbId)]) rates.imdbUrl = rates.imdbUrl || r.urls[String(s.tmdbId)];
      paintRates();
    }).catch(() => {});
  const info = await api(`/api/discover/${media}/${s.tmdbId}`);
  if (sdKey !== key) return;                     // closed or switched while loading
  const ok = info && !info.error ? info : null;
  sdCast = (ok?.cast || []).slice(0, 14);
  const slot = card.querySelector('.sd-about-slot');
  if (slot) slot.innerHTML = aboutHTML(s, ok);
  const row = slot?.querySelector('.sd-cast');
  if (row && window.railWithArrows) { const mark = document.createComment(''); row.replaceWith(mark); mark.replaceWith(window.railWithArrows(row)); }
  if (!ok) return;
  if (ok.imdbRating != null) rates.imdb = Number(ok.imdbRating);
  rates.imdbUrl = ok.imdbUrl || rates.imdbUrl;
  rates.imdbVotes = ok.imdbVotes || null;
  rates.tmdb = ok.rating || null;
  paintRates();
  const genres = card.querySelector('[data-sd="genres"]');
  if (genres && !genres.children.length && ok.genres?.length) genres.innerHTML = ok.genres.map((g) => `<span class="sd-chip">${escHTML(g)}</span>`).join('');
  const bgEl = card.querySelector('.sd-hero-bg');
  if (!s.backdrop && ok.backdrop && bgEl) bgEl.style.backgroundImage = `url('${ok.backdrop}')`;
}

// Called after every poll: keeps an open sheet in step with the server.
function syncOpenSheet() {
  if (!sdKey) return;
  const host = document.getElementById('streamModal');
  if (!host || host.classList.contains('hidden')) { sdKey = null; return; }
  const s = latest.get(sdKey);
  if (s) drawLive(s);
  else if (sdBase && !sdBase.ended) drawLive(sdBase.s, true);
}

// ---------------------------------------------------------------------------
// History tab + drill-down sheets (play analysis, title, user). All three share
// one overlay (#liveSheet) with a back stack, so History → play → back, or
// Stats → user → title → play → back, behave like pages.
// ---------------------------------------------------------------------------
const LS_CSS = `
  .lh-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 40px 0;}
  .lh-sel{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#e6e6ec;border-radius:9px;padding:7px 10px;font-weight:700;font-size:13px;}
  .lh-sel option{background:#1a1a24;}
  .lh-chips{display:inline-flex;background:rgba(255,255,255,.06);border-radius:10px;padding:3px;gap:3px;}
  .lh-chips button{background:transparent;border:0;color:#9aa0ad;padding:6px 11px;border-radius:7px;font-weight:700;font-size:12.5px;cursor:pointer;}
  .lh-chips button.on{background:rgba(255,255,255,.14);color:#fff;}
  .lh-sum{display:flex;flex-wrap:wrap;align-items:center;gap:8px 22px;padding:14px 40px 4px;color:#9aa0ad;font-size:13px;}
  .lh-sum b{color:#fff;font-size:17px;font-weight:800;margin-right:4px;}
  .lh-split{flex:1 1 220px;max-width:420px;}
  .ls-split{display:flex;height:9px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.07);}
  .ls-split i{display:block;height:100%;}
  .ls-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11.5px;color:#9aa0ad;margin-top:6px;}
  .ls-legend span::before{content:"";display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;background:var(--c);}
  .lh-list{padding:6px 40px 40px;}
  .lh-day{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7d8290;margin:18px 0 6px;}
  .lh-row{display:flex;align-items:center;gap:12px;padding:8px 10px;margin:0 -10px;border-radius:12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);}
  .lh-row:hover,.lh-row:focus-visible{background:rgba(255,255,255,.05);outline:none;}
  .lh-row .stat-mini{width:40px;height:60px;}
  .lh-main{flex:1;min-width:0;}
  .lh-t{color:#fff;font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .lh-e{color:#c9ccd5;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .lh-m{color:#8a8f9c;font-size:12px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .lh-m b{color:#cfd2da;font-weight:700;}
  .lh-r{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:0 0 auto;}
  .lh-pct{font-size:11.5px;color:#9aa0ad;font-variant-numeric:tabular-nums;}
  .lh-badge{font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:999px;color:var(--sd-c);background:color-mix(in srgb,var(--sd-c) 16%,transparent);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;}
  .lh-more{display:block;margin:18px auto 0;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#e6e6ec;border-radius:11px;padding:10px 18px;font-weight:800;cursor:pointer;}
  .stat-item[data-ls]{cursor:pointer;border-radius:10px;margin:0 -8px;padding:7px 8px;transition:background .15s ease;}
  .stat-item[data-ls]:hover,.stat-item[data-ls]:focus-visible{background:rgba(255,255,255,.06);outline:none;}
  .stat-item[data-ls] .stat-plays::after{content:" ›";color:var(--accent,#e50914);font-weight:900;}
  .ls-back{position:absolute;top:14px;left:14px;z-index:5;height:38px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(10,10,15,.6);backdrop-filter:blur(8px);color:#fff;font-weight:800;font-size:13px;cursor:pointer;}
  .ls-back:hover{background:rgba(255,255,255,.16);}
  .sd-hero.ls-hasback{padding-top:62px;}
  .sd-kicker.k-hist{background:rgba(109,94,240,.9);}
  .sd-kicker.k-hist i{display:none;}
  .sd-poster.round{border-radius:50%;aspect-ratio:1;}
  .sd-tip{display:inline-block;margin-top:4px;color:#b8bcc8;font-size:12px;}
  .ls-verdict{display:flex;gap:16px;align-items:center;border-left:4px solid var(--sd-c);}
  .ls-verdict .big{font-size:20px;font-weight:800;color:var(--sd-c);white-space:nowrap;}
  .ls-verdict .why{color:#e6e6ec;font-size:14px;line-height:1.45;}
  .ls-verdict .why small{display:block;color:#9aa0ad;font-size:12.5px;margin-top:3px;}
  .ls-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;}
  .ls-tile{background:var(--card,#1a1a24);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:14px 16px;}
  .ls-tile .n{font-size:24px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;}
  .ls-tile .l{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7d8290;margin-top:2px;}
  .ls-bars{display:flex;flex-direction:column;gap:9px;}
  .ls-brow{display:grid;grid-template-columns:minmax(90px,34%) 1fr auto;align-items:center;gap:10px;font-size:13px;color:#e6e6ec;}
  .ls-brow[data-ls]{cursor:pointer;border-radius:8px;}
  .ls-brow[data-ls]:hover .nm{color:var(--accent,#e50914);}
  .ls-brow .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .ls-brow .tr{height:8px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden;}
  .ls-brow .tr i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#6d5ef0,var(--accent,#e50914));}
  .ls-brow .ct{color:#9aa0ad;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;}
  .ls-posters{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:12px;}
  .ls-pt{cursor:pointer;min-width:0;}
  .ls-pt img,.ls-pt .ph{width:100%;aspect-ratio:2/3;border-radius:10px;object-fit:cover;background:#22222e;display:grid;place-items:center;font-size:28px;transition:transform .15s ease;}
  .ls-pt:hover img{transform:translateY(-2px);}
  .ls-pt .nm{font-size:12px;font-weight:700;color:#e6e6ec;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .ls-pt .ct{font-size:11.5px;color:#9aa0ad;}
  .ls-plays .lh-row{margin:0 -8px;padding:8px;}
  .ls-loading{color:#9aa0ad;padding:8px 2px;}
  .ls-note{color:#7d8290;font-size:12px;}
  @media (max-width:768px){
    .live-head{padding:8px 16px 4px;}
    .live-sub{margin-left:0;}
    .stat-filters{margin-left:0;}
    .live-grid{grid-template-columns:1fr;padding:14px 16px 30px;}
    .stat-cols{padding:14px 16px 30px;}
    .lh-bar{padding:10px 16px 0;}
    .lh-sum{padding:12px 16px 2px;}
    .lh-list{padding:4px 16px 30px;}
    .lh-row .stat-mini{width:36px;height:54px;}
    .ls-verdict{flex-direction:column;align-items:flex-start;gap:6px;}
    .ls-brow{grid-template-columns:minmax(80px,38%) 1fr auto;}
    .ls-posters{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}
  }`;

const DEC = {
  'direct play': { label: 'Direct Play', c: C_DP },
  copy: { label: 'Direct Stream', c: C_DS },
  transcode: { label: 'Transcode', c: C_TC }
};
const decOf = (d) => DEC[String(d || '').toLowerCase()] || { label: d ? cap1(d) : 'Unknown', c: C_INFO };
const fmtSecs = (s) => { const m = Math.round((s || 0) / 60); if (m < 60) return `${m}m`; const h = Math.floor(m / 60); return h >= 48 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m % 60}m`; };
const fmtWhen = (ts) => (ts ? new Date(ts * 1000).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const fmtTime = (ts) => (ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
function dayLabel(ts) {
  const d = new Date(ts * 1000), t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
}
const epTag = (r) => (r.ep ? `S${String(r.season).padStart(2, '0')}E${String(r.episode).padStart(2, '0')}` : '');
const daysLabel = (n) => (n === 365 ? 'last year' : `last ${n} days`);

// Anything a click can open is parked here and referenced by a short key, so
// element attributes never carry user-controlled JSON.
const REG = new Map(); let regSeq = 0;
const reg = (kind, obj) => { const k = `${kind}:${++regSeq}`; REG.set(k, { kind, obj }); return k; };

function splitBar(dec) {
  const total = Object.values(dec || {}).reduce((a, b) => a + b, 0);
  if (!total) return '';
  const parts = Object.entries(DEC).map(([k, x]) => ({ ...x, n: dec[k] || 0 })).filter((x) => x.n);
  return `<div class="ls-split">${parts.map((x) => `<i style="width:${(x.n / total) * 100}%;background:${x.c}" title="${x.label}: ${x.n}"></i>`).join('')}</div>
    <div class="ls-legend">${parts.map((x) => `<span style="--c:${x.c}">${x.label} ${Math.round((x.n / total) * 100)}%</span>`).join('')}</div>`;
}

function playRowHTML(r, { showUser = true, showTitle = true } = {}) {
  const dec = decOf(r.decision);
  const poster = r.poster ? `<img class="stat-mini" src="${escHTML(r.poster)}" alt="" loading="lazy">` : `<div class="stat-mini ph">${r.ep ? '📺' : '🎬'}</div>`;
  const epLine = `${epTag(r)}${r.episodeTitle ? ' · ' + r.episodeTitle : ''}`;
  const line1 = showTitle ? escHTML(r.title || '—') : escHTML(r.ep ? epLine : fmtWhen(r.date));
  const line2 = showTitle && r.ep ? `<div class="lh-e">${escHTML(epLine)}</div>` : '';
  const when = showTitle || r.ep ? fmtWhen(r.date) : '';
  const meta = [showUser ? `<b>${escHTML(r.user)}</b>` : '', escHTML(r.player || r.platform), escHTML(when), r.duration ? escHTML(fmtSecs(r.duration)) : ''].filter(Boolean).join(' · ');
  return `<div class="lh-row" role="button" tabindex="0" data-ls="${reg('play', r)}">
    ${poster}
    <div class="lh-main"><div class="lh-t">${line1}</div>${line2}<div class="lh-m">${meta}</div></div>
    <div class="lh-r"><span class="lh-badge" style="--sd-c:${dec.c}">${dec.label}</span><span class="lh-pct">${r.percent}%${r.watched ? ' ✓' : ''}</span></div>
  </div>`;
}

// ---------------- History tab ----------------
const hist = { user: '', media: '', decision: '', start: 0, total: 0, users: null };

function userSelect() {
  return `<select class="lh-sel" data-hk="user" aria-label="Filter by user"><option value="">All users</option>${(hist.users || []).map((u) => `<option value="${escHTML(u.id)}" ${String(hist.user) === String(u.id) ? 'selected' : ''}>${escHTML(u.name)}</option>`).join('')}</select>`;
}
function histBar() {
  const chips = (key, opts) => `<div class="lh-chips" data-hk="${key}">${opts.map(([v, l]) => `<button data-hv="${v}" class="${hist[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  return `<div class="lh-bar">
    ${userSelect()}
    ${chips('media', [['', 'All'], ['movie', 'Movies'], ['episode', 'TV']])}
    ${chips('decision', [['', 'Any'], ['direct play', 'Direct Play'], ['copy', 'Direct Stream'], ['transcode', 'Transcode']])}
  </div>`;
}

function histQS(extra = {}) {
  const q = new URLSearchParams({ days: statDays, length: 50, ...extra });
  if (hist.user) q.set('user', hist.user);
  if (hist.media) q.set('media', hist.media);
  if (hist.decision) q.set('decision', hist.decision);
  return q.toString();
}

function appendRows(list, rows) {
  let lastDay = list.dataset.lastDay || '';
  let html = '';
  for (const r of rows) {
    const day = dayLabel(r.date);
    if (day !== lastDay) { html += `<div class="lh-day">${escHTML(day)}</div>`; lastDay = day; }
    html += playRowHTML(r);
  }
  list.dataset.lastDay = lastDay;
  list.querySelector('.lh-more')?.remove();
  list.insertAdjacentHTML('beforeend', html);
}
function addMore(list) {
  if (hist.start < hist.total) list.insertAdjacentHTML('beforeend', `<button class="lh-more">Load more (${hist.total - hist.start} left)</button>`);
}

async function renderHistory(root) {
  if (!hist.users) api('/api/discover/live/users').then((u) => {
    hist.users = u?.users || [];
    const sel = document.querySelector('#liveView .lh-sel');
    if (sel && hist.users.length) sel.outerHTML = userSelect();
  });
  root.insertAdjacentHTML('beforeend', `${histBar()}<div class="lh-sum"><span class="ls-loading">Loading history…</span></div><div class="lh-list"></div>`);
  hist.start = 0;
  const d = await api(`/api/discover/live/history?${histQS({ summary: 1 })}`);
  const sum = root.querySelector('.lh-sum'), list = root.querySelector('.lh-list');
  if (!sum || !list) return;
  if (d.error) { sum.innerHTML = ''; list.innerHTML = `<div class="live-empty">${escHTML(d.error)}</div>`; return; }
  const s = d.summary || {};
  hist.total = d.total || 0;
  sum.innerHTML = `<span><b>${s.plays || 0}${s.capped ? '+' : ''}</b>play${s.plays === 1 ? '' : 's'}</span><span><b>${fmtSecs(s.seconds)}</b>watched</span><span><b>${(s.users || []).length}</b>viewer${(s.users || []).length === 1 ? '' : 's'}</span><div class="lh-split">${splitBar(s.decisions)}</div>`;
  if (!d.rows?.length) { list.innerHTML = `<div class="live-empty">No plays match these filters in the ${daysLabel(statDays)}.</div>`; return; }
  appendRows(list, d.rows);
  hist.start = d.rows.length;
  addMore(list);
}
async function loadMoreHistory(btn) {
  const list = btn.closest('.lh-list');
  btn.disabled = true; btn.textContent = 'Loading…';
  const d = await api(`/api/discover/live/history?${histQS({ start: hist.start })}`);
  if (d.error || !d.rows) { btn.disabled = false; btn.textContent = 'Retry'; return; }
  appendRows(list, d.rows);
  hist.start += d.rows.length;
  addMore(list);
}

// ---------------- Sheet host ----------------
let sheetStack = [], sheetSeq = 0;
function sheetHost() {
  let host = document.getElementById('liveSheet');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'liveSheet'; host.className = 'sd-overlay hidden';
  host.innerHTML = '<div class="modal-backdrop sd-backdrop"></div><div class="sd-card" role="dialog" aria-modal="true" aria-label="Details"></div>';
  document.body.appendChild(host);
  host.querySelector('.sd-backdrop').addEventListener('click', closeSheet);
  host.addEventListener('click', (e) => {
    if (e.target.closest('.sd-close')) return closeSheet();
    if (e.target.closest('.ls-back')) { sheetStack.pop(); return drawSheet(); }
    const open = e.target.closest('[data-ls-open]');
    if (open) { const it = REG.get(open.dataset.lsOpen)?.obj; if (it && window.openDetail) { closeSheet(); window.openDetail(it); } return; }
    const t = e.target.closest('[data-ls]');
    if (t) openReg(t.dataset.ls);
  });
  host.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-ls]')) { e.preventDefault(); e.target.click(); } });
  enableSheetDrag(host.querySelector('.sd-card'), closeSheet);
  return host;
}
function openReg(key) {
  const r = REG.get(key);
  if (!r) return;
  const fn = r.kind === 'play' ? playSheet(r.obj) : r.kind === 'title' ? titleSheet(r.obj) : r.kind === 'user' ? userSheet(r.obj) : null;
  if (!fn) return;
  const host = sheetHost();
  if (host.classList.contains('hidden')) { sheetStack = []; host.classList.remove('hidden'); applyScrollLock('livesheet'); }
  sheetStack.push(fn);
  drawSheet();
}
function drawSheet() {
  const host = document.getElementById('liveSheet');
  const fn = sheetStack[sheetStack.length - 1];
  if (!host || !fn) return closeSheet();
  const card = host.querySelector('.sd-card');
  const token = ++sheetSeq;
  const back = sheetStack.length > 1;
  card.innerHTML = `<button class="sd-close" aria-label="Close">✕</button>${back ? '<button class="ls-back" aria-label="Back">‹ Back</button>' : ''}<div class="ls-slot"></div>`;
  card.scrollTop = 0;
  fn(card.querySelector('.ls-slot'), () => token === sheetSeq && !host.classList.contains('hidden'), back);
}
function closeSheet() {
  const host = document.getElementById('liveSheet');
  if (!host || host.classList.contains('hidden')) return;
  host.classList.add('hidden');
  clearSheetDrag(host.querySelector('.sd-card'));
  host.querySelector('.sd-card').innerHTML = '';
  sheetStack = []; sheetSeq++;
  releaseScrollLock('livesheet');
}

function sheetHero({ bg, poster, posterHTML, posterPh, kicker, title, sub, facts, who, back }) {
  const art = posterHTML || (poster ? `<img class="sd-poster" src="${escHTML(poster)}" alt="">` : `<div class="sd-poster ph">${posterPh || '🎬'}</div>`);
  return `<div class="sd-hero${back ? ' ls-hasback' : ''}">
    ${bg ? `<div class="sd-hero-bg" style="background-image:url('${escHTML(bg)}')"></div>` : ''}
    <div class="sd-hero-in">
      ${art}
      <div class="sd-head">
        <span class="sd-kicker k-hist"><i></i>${escHTML(kicker)}</span>
        <h2 class="sd-h">${escHTML(title || '')}</h2>
        ${sub ? `<div class="sd-ep">${escHTML(sub)}</div>` : ''}
        ${facts ? `<div class="sd-facts">${facts}</div>` : ''}
        ${who ? `<div class="sd-who">${who}</div>` : ''}
      </div>
    </div></div>`;
}
const tiles = (arr) => `<div class="ls-tiles">${arr.filter(Boolean).map(([n, l]) => `<div class="ls-tile"><div class="n">${escHTML(n)}</div><div class="l">${escHTML(l)}</div></div>`).join('')}</div>`;
function bars(rows, { link } = {}) {
  if (!rows?.length) return '<div class="ls-note">No data.</div>';
  const max = Math.max(...rows.map((r) => r.plays));
  return `<div class="ls-bars">${rows.map((r) => { const k = link ? link(r) : ''; return `<div class="ls-brow" ${k ? `role="button" tabindex="0" data-ls="${k}"` : ''}><span class="nm">${escHTML(r.name)}</span><span class="tr"><i style="width:${(r.plays / max) * 100}%"></i></span><span class="ct">${plural(r.plays, 'play')} · ${fmtSecs(r.seconds)}</span></div>`; }).join('')}</div>`;
}
const box = (icon, title, inner) => `<section class="sd-box"><div class="sd-ph"><span>${icon}</span><h4>${title}</h4></div>${inner}</section>`;
const tcPct = (dec) => { const t = Object.values(dec || {}).reduce((a, b) => a + b, 0); return t ? Math.round(((dec.transcode || 0) / t) * 100) + '%' : '—'; };
const userLink = (u) => (u.userId != null ? reg('user', { userId: u.userId, name: u.name }) : '');
const titleLink = (t) => reg('title', t);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------------- Play analysis ----------------
function playSheet(row) {
  return async (slot, alive, back) => {
    const dec = decOf(row.decision);
    slot.innerHTML = `${sheetHero({
      bg: row.backdrop || row.poster, poster: row.poster, posterPh: row.ep ? '📺' : '🎬',
      kicker: `Played · ${fmtWhen(row.date)}`, title: row.title,
      sub: row.ep ? `${epTag(row)}${row.episodeTitle ? ' · ' + row.episodeTitle : ''}` : '',
      facts: [row.year, row.duration ? `${fmtSecs(row.duration)} watched` : '', `${row.percent}% of runtime`].filter(Boolean).map((x) => `<span>${escHTML(x)}</span>`).join(''),
      who: `<span class="sd-av">${escHTML((row.user || '?').slice(0, 1).toUpperCase())}</span><span><b>${escHTML(row.user)}</b> on ${escHTML(row.player || row.platform || 'a player')}</span>`,
      back
    })}<div class="sd-body"><div class="ls-loading">Loading playback analysis…</div></div>`;
    const body = slot.querySelector('.sd-body');
    const d = await api(`/api/discover/live/play/${encodeURIComponent(row.rowId)}`);
    if (!alive()) return;
    const det = d?.detail || {};
    // History rows carry the player / network side; the saved media record
    // carries the source-vs-stream side. Merge so the shared panels see both.
    const dp = det.player || {};
    det.player = { ...dp, name: row.player || dp.name, device: dp.device || row.player, platform: row.platform || dp.platform, product: row.product || dp.product, ip: row.ip || dp.ip, location: row.location || dp.location, secure: row.secure ?? dp.secure, relayed: row.relayed || dp.relayed };
    const s = { transcode: row.decision, videoDecision: det.video?.decision, audioDecision: det.audio?.decision, state: 'stopped', player: row.player, device: row.platform, detail: det };
    const main = d.detail ? insightList(s, { live: false }).find((x) => x.cause) : null;
    const why = main ? `<b>${escHTML(main.short)}</b>${main.tip ? `<small>💡 ${escHTML(main.tip)}</small>` : ''}`
      : row.decision === 'direct play' ? 'The file was played untouched — best possible quality, no server load.' : 'No details were recorded for this play.';
    const verdict = `<section class="sd-box ls-verdict" style="--sd-c:${dec.c}"><div class="big">${dec.label}</div><div class="why">${why}</div></section>`;
    const session = box('🕒', 'Session', kv([
      ['Started', fmtWhen(row.started || row.date)], ['Stopped', fmtWhen(row.stopped)],
      ['Watched', row.duration ? fmtSecs(row.duration) : ''], ['Paused', row.paused ? fmtSecs(row.paused) : 'Never'],
      ['Progress', `${row.percent}%${row.watched ? ' · marked watched' : ''}`], ['User', row.user]
    ]));
    const open = row.tmdbId ? `<div class="sd-actions"><button class="sd-btn" data-ls-open="${reg('open', { id: row.tmdbId, media: row.tmdbMedia || (row.ep ? 'tv' : 'movie'), title: row.title, poster: row.poster, backdrop: row.backdrop })}">Open title page</button></div>` : '';
    if (d.error || !d.detail) {
      body.innerHTML = `${verdict}${session}<div class="sd-ended">Tautulli has no saved stream data for this play${d.error ? ` (${escHTML(d.error)})` : ''}.</div>${open}`;
      return;
    }
    const { pipe, ins, grid } = streamParts(s, { live: false });
    body.innerHTML = `${verdict}
      <section class="sd-box">${pipe}</section>
      ${ins ? box('🧠', 'Why it played this way', `<div class="sd-insights">${ins}</div>`) : ''}
      ${session}
      ${grid}${open}`;
  };
}

// ---------------- Title drill-down ----------------
function titleSheet(t) {
  return async (slot, alive, back) => {
    const tv = t.media === 'tv';
    slot.innerHTML = `${sheetHero({ bg: t.backdrop || t.poster, poster: t.poster, posterPh: tv ? '📺' : '🎬', kicker: `${tv ? 'Series' : 'Movie'} · ${daysLabel(statDays)}`, title: t.name, facts: t.year ? `<span>${escHTML(t.year)}</span>` : '', back })}<div class="sd-body"><div class="ls-loading">Loading plays…</div></div>`;
    const body = slot.querySelector('.sd-body');
    const q = new URLSearchParams({ days: statDays, length: 30, summary: 1 });
    if (tv && t.showKey) q.set('showKey', t.showKey);
    else if (!tv && t.ratingKey) q.set('ratingKey', t.ratingKey);
    else { body.innerHTML = '<div class="sd-ended">Tautulli did not return an ID for this title.</div>'; return; }
    const d = await api(`/api/discover/live/history?${q}`);
    if (!alive()) return;
    if (d.error) { body.innerHTML = `<div class="sd-ended">${escHTML(d.error)}</div>`; return; }
    const s = d.summary || {};
    const id = t.tmdbId || t.id;
    const open = id ? `<div class="sd-actions"><button class="sd-btn" data-ls-open="${reg('open', { id, media: t.tmdbMedia || (tv ? 'tv' : 'movie'), title: t.name, poster: t.poster, backdrop: t.backdrop })}">Open title page</button></div>` : '';
    const rows = d.rows || [];
    body.innerHTML = `${tiles([[`${s.plays || 0}${s.capped ? '+' : ''}`, 'Plays'], [(s.users || []).length, 'Viewers'], [fmtSecs(s.seconds), 'Watch time'], [`${s.avgPercent || 0}%`, 'Avg. completion'], [tcPct(s.decisions), 'Transcoded']])}
      ${box('⚙️', 'How it played', splitBar(s.decisions) || '<div class="ls-note">No data.</div>')}
      <div class="sd-grid">
        ${box('👤', 'Who watched', bars(s.users, { link: userLink }))}
        ${box('🖥️', 'Platforms', bars(s.platforms))}
        ${tv ? box('📺', 'Most played episodes', bars((s.episodes || []).slice(0, 10))) : ''}
      </div>
      ${box('🕒', 'Plays', `<div class="ls-plays">${rows.map((r) => playRowHTML(r, { showTitle: false })).join('') || '<div class="ls-note">No plays.</div>'}</div>${d.total > rows.length ? `<div class="ls-note" style="margin-top:8px">Showing the latest ${rows.length} of ${d.total}.</div>` : ''}`)}
      ${open}`;
  };
}

// ---------------- User drill-down ----------------
function userSheet(u) {
  return async (slot, alive, back) => {
    const art = u.thumb ? `<img class="sd-poster round" src="${escHTML(u.thumb)}" alt="" referrerpolicy="no-referrer">` : '<div class="sd-poster ph round">👤</div>';
    slot.innerHTML = `${sheetHero({ posterHTML: art, kicker: `User · ${daysLabel(statDays)}`, title: u.name, back })}<div class="sd-body"><div class="ls-loading">Loading activity…</div></div>`;
    const body = slot.querySelector('.sd-body');
    const d = await api(`/api/discover/live/history?${new URLSearchParams({ days: statDays, length: 30, summary: 1, user: u.userId })}`);
    if (!alive()) return;
    if (d.error) { body.innerHTML = `<div class="sd-ended">${escHTML(d.error)}</div>`; return; }
    const s = d.summary || {};
    const titles = s.titles || [];
    const posters = titles.length ? `<div class="ls-posters">${titles.map((t) => `<div class="ls-pt" role="button" tabindex="0" data-ls="${titleLink(t)}">${t.poster ? `<img src="${escHTML(t.poster)}" alt="" loading="lazy">` : `<div class="ph">${t.media === 'tv' ? '📺' : '🎬'}</div>`}<div class="nm">${escHTML(t.name)}</div><div class="ct">${plural(t.plays, 'play')} · ${fmtSecs(t.seconds)}</div></div>`).join('')}</div>` : '<div class="ls-note">No plays.</div>';
    const rows = d.rows || [];
    body.innerHTML = `${tiles([[`${s.plays || 0}${s.capped ? '+' : ''}`, 'Plays'], [fmtSecs(s.seconds), 'Watch time'], [s.titleCount ?? titles.length, 'Titles'], [`${s.avgPercent || 0}%`, 'Avg. completion'], [tcPct(s.decisions), 'Transcoded']])}
      ${box('⚙️', 'How their plays were delivered', splitBar(s.decisions) || '<div class="ls-note">No data.</div>')}
      ${box('🔥', 'Most watched', posters)}
      <div class="sd-grid">
        ${box('🖥️', 'Platforms', bars(s.platforms))}
        ${box('📺', 'Players', bars(s.players))}
      </div>
      ${box('🕒', 'Recent plays', `<div class="ls-plays">${rows.map((r) => playRowHTML(r, { showUser: false })).join('') || '<div class="ls-note">No plays.</div>'}</div>`)}`;
  };
}

async function renderNow(root) {
  const d = await api('/api/discover/live/now');
  if (d.error) { root.insertAdjacentHTML('beforeend', `<div class="live-empty">${escHTML(d.error)}</div>`); return; }
  const sessions = d.sessions || [];
  latest.clear();
  sessions.forEach((s) => { if (s.sessionKey) latest.set(s.sessionKey, s); });
  syncOpenSheet();
  if (!sessions.length) { root.insertAdjacentHTML('beforeend', `<div class="live-empty">😴 Nobody is watching right now.</div>`); return; }
  const grid = document.createElement('div'); grid.className = 'live-grid';
  grid.innerHTML = sessions.map(sessionCard).join('');
  root.appendChild(grid);
}

async function renderStats(root) {
  const d = await api(`/api/discover/live/stats?days=${statDays}`);
  if (d.error) { root.insertAdjacentHTML('beforeend', `<div class="live-empty">${escHTML(d.error)}</div>`); return; }
  const item = (i, art, r, key) => `<div class="stat-item"${key ? ` role="button" tabindex="0" data-ls="${key}" aria-label="More about ${escHTML(r.name || '')}"` : ''}><span class="stat-rank">${i + 1}</span>${art}<span class="stat-name">${escHTML(r.name || '—')}</span><span class="stat-plays">${r.total} plays</span></div>`;
  const col = (title, rows, fn) => `<div class="stat-col"><h4>${title}</h4>${(rows || []).length ? rows.map(fn).join('') : '<div class="row-sub">No data.</div>'}</div>`;
  const titleRow = (media) => (r, i) => {
    const art = r.poster ? `<img class="stat-mini" src="${escHTML(r.poster)}" alt="">` : `<div class="stat-mini ph">${media === 'tv' ? '📺' : '🎬'}</div>`;
    const t = { name: r.name, year: r.year, media, poster: r.poster, tmdbId: r.id, tmdbMedia: r.media, ratingKey: media === 'movie' ? r.ratingKey : null, showKey: media === 'tv' ? r.ratingKey : null };
    return item(i, art, r, r.ratingKey ? reg('title', t) : '');
  };
  const userRow = (r, i) => item(i, '<div class="stat-mini ph">👤</div>', r, r.userId != null ? reg('user', { userId: r.userId, name: r.name, thumb: r.thumb }) : '');
  const platRow = (r, i) => item(i, '<div class="stat-mini ph">🖥️</div>', r, '');
  const wrap = document.createElement('div'); wrap.className = 'stat-cols';
  wrap.innerHTML = col('🎬 Top Movies', d.topMovies, titleRow('movie')) + col('📺 Top TV', d.topTv, titleRow('tv')) + col('👤 Top Users', d.topUsers, userRow) + col('🖥️ Top Platforms', d.topPlatforms, platRow);
  root.appendChild(wrap);
}

async function render() {
  injectStyles();
  const root = app(); if (!root) return;
  clearInterval(nowTimer); nowTimer = null;
  root.innerHTML = `<div id="liveView">${header()}</div>`;
  const view = root.querySelector('#liveView');
  view.querySelectorAll('.live-sub button').forEach((b) => b.addEventListener('click', () => { sub = b.dataset.sub; render(); }));
  view.querySelectorAll('.stat-filters button').forEach((b) => b.addEventListener('click', () => { statDays = Number(b.dataset.days); render(); }));
  // Delegated on #liveView because refreshNow() swaps the grid every poll.
  const pick = (e) => {
    const c = e.target.closest('.live-card[data-key]');
    if (c && c.dataset.key) { e.preventDefault(); openStream(c.dataset.key); return; }
    const l = e.target.closest('[data-ls]');
    if (l) { e.preventDefault(); openReg(l.dataset.ls); return; }
    if (e.type !== 'click') return;
    const more = e.target.closest('.lh-more');
    if (more) { loadMoreHistory(more); return; }
    const chip = e.target.closest('.lh-chips button');
    if (chip) { hist[chip.parentElement.dataset.hk] = chip.dataset.hv; render(); }
  };
  view.addEventListener('change', (e) => { if (e.target.matches('.lh-sel')) { hist.user = e.target.value; render(); } });
  view.addEventListener('click', pick);
  view.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') pick(e); });
  if (sub === 'now') { await renderNow(view); nowTimer = setInterval(() => { if (isLiveActive()) refreshNow(); }, 10000); }
  else if (sub === 'history') await renderHistory(view);
  else await renderStats(view);
}
async function refreshNow() { const view = document.getElementById('liveView'); if (!view) return; const old = view.querySelector('.live-grid, .live-empty'); const tmp = document.createElement('div'); await renderNow(tmp); const fresh = tmp.querySelector('.live-grid, .live-empty'); if (old && fresh) old.replaceWith(fresh); else if (fresh) view.appendChild(fresh); }
function isLiveActive() { const b = document.querySelector('.nav-link[data-view="live"]'); return b && b.classList.contains('active'); }

async function toggleTab() {
  const [st, me] = await Promise.all([
    fetch('/api/auth/status').then((r) => r.json()).catch(() => ({})),
    (localStorage.getItem('nickseer_token') ? fetch('/api/auth/me', { headers: authHeaders() }).then((r) => r.json()).catch(() => ({})) : Promise.resolve({}))
  ]);
  const isAdmin = me?.user?.role === 'admin';
  document.querySelectorAll('.nav-link[data-view="live"], .drawer-item[data-view="live"]').forEach((b) => {
    b.style.display = isAdmin ? '' : 'none';
  });
}
function init() {
  toggleTab();
  const btn = document.querySelector('.nav-link[data-view="live"]');
  // See info.js: wait for showView() to settle so the admin gate is honoured.
  document.addEventListener('view:changed', (e) => {
    if (e.detail && e.detail.view === 'live' && isLiveActive()) { sub = 'now'; render(); }
  });
  document.addEventListener('nav:back', () => { closeStream(); closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeStream(); closeSheet(); } });
  const obs = new MutationObserver(() => { if (isLiveActive() && !document.getElementById('liveView')) render(); });
  obs.observe(app() || document.body, { childList: true, subtree: true });
}
    if (isLiveActive() && !document.getElementById('liveView')) render();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
else setTimeout(init, 300);


