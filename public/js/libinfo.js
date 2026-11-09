import { escHTML } from './util.js';
import { applyScrollLock, releaseScrollLock, enableSheetDrag, clearSheetDrag } from './overlay.js';
// libinfo.js — "In Library" details. Pressing the In Library button in the
// title modal opens this sheet ON TOP of the modal: every version Plex holds,
// the file, video / audio tracks and every subtitle (language, format,
// embedded vs external file, forced, SDH). For a series it shows per-season
// totals and every episode; tapping an episode opens that episode's tracks.
// Closing it (✕, backdrop, Esc / remote Back) returns to the title modal.

function authHeaders() { const t = localStorage.getItem('nickseer_token'); return t ? { Authorization: 'Bearer ' + t } : {}; }
async function api(path) { try { const r = await fetch(path, { headers: authHeaders() }); return await r.json(); } catch (e) { return { error: e.message }; } }

const CSS = `
  .li-overlay{position:fixed;inset:0;z-index:1300;display:flex;align-items:center;justify-content:center;padding:28px;}
  .li-overlay.hidden{display:none;}
  .li-backdrop{position:absolute;inset:0;background:rgba(5,5,10,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}
  .li-card{position:relative;width:min(980px,100%);max-height:calc(100vh - 56px);overflow-y:auto;overscroll-behavior:contain;background:var(--bg-2,#12121a);border:1px solid rgba(255,255,255,.08);border-radius:22px;box-shadow:0 30px 80px rgba(0,0,0,.6);animation:liIn .2s cubic-bezier(.2,.7,.3,1);}
  @keyframes liIn{from{opacity:0;transform:translateY(12px) scale(.985);}to{opacity:1;transform:none;}}
  .li-x,.li-back{position:absolute;top:14px;z-index:5;height:38px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(10,10,15,.6);backdrop-filter:blur(8px);color:#fff;cursor:pointer;font-weight:800;}
  .li-x{right:14px;width:38px;font-size:16px;}
  .li-back{left:14px;padding:0 14px;font-size:13px;}
  .li-x:hover,.li-back:hover{background:rgba(255,255,255,.16);}
  .li-hero{position:relative;padding:30px 28px 18px;overflow:hidden;border-radius:22px 22px 0 0;}
  .li-hero.hasback{padding-top:62px;}
  .li-hero-bg{position:absolute;inset:-20px;background-size:cover;background-position:center 25%;opacity:.4;}
  .li-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,18,26,.25),var(--bg-2,#12121a) 92%);}
  .li-hero-in{position:relative;z-index:1;display:flex;gap:20px;align-items:flex-end;}
  .li-poster{width:110px;aspect-ratio:2/3;border-radius:12px;object-fit:cover;flex:0 0 auto;background:#22222e;box-shadow:0 12px 34px rgba(0,0,0,.5);}
  .li-kick{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7ef0b0;background:rgba(53,208,127,.16);border:1px solid rgba(53,208,127,.35);padding:4px 10px;border-radius:999px;}
  .li-h{margin:10px 0 4px;font-size:clamp(21px,3vw,30px);line-height:1.1;font-weight:800;color:#fff;letter-spacing:-.02em;}
  .li-sub{color:#b8bcc8;font-size:13px;display:flex;flex-wrap:wrap;gap:4px 14px;}
  .li-body{padding:4px 28px 28px;display:flex;flex-direction:column;gap:16px;}
  .li-box{background:var(--card,#1a1a24);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:16px 18px;}
  .li-ph{display:flex;align-items:center;gap:8px;margin:0 0 12px;}
  .li-ph h4{margin:0;font-size:13px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#cfd2da;}
  .li-ph .ct{margin-left:auto;font-size:12px;color:#9aa0ad;font-weight:700;}
  .li-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;}
  .li-tile{background:var(--card,#1a1a24);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:12px 14px;min-width:0;}
  .li-tile .n{font-size:18px;font-weight:800;color:#fff;overflow-wrap:anywhere;}
  .li-tile .l{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7d8290;margin-top:3px;}
  .li-tile.hl .n{color:#f5c518;}
  .li-vers{display:flex;flex-wrap:wrap;gap:8px;}
  .li-vers button{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#cfd2da;border-radius:10px;padding:8px 12px;font-weight:700;font-size:13px;cursor:pointer;}
  .li-vers button.on{background:rgba(53,208,127,.16);border-color:rgba(53,208,127,.45);color:#fff;}
  .li-file{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12.5px;color:#dfe1e8;background:rgba(0,0,0,.28);border-radius:9px;padding:9px 11px;overflow-wrap:anywhere;margin-bottom:10px;}
  .li-kv{display:grid;grid-template-columns:auto 1fr;gap:7px 14px;font-size:13px;}
  .li-kv dt{color:#9aa0ad;} .li-kv dd{margin:0;color:#e6e6ec;text-align:right;overflow-wrap:anywhere;}
  .li-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;}
  .li-tbl{width:100%;border-collapse:collapse;font-size:13px;}
  .li-tbl th{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7d8290;text-align:left;padding:0 8px 7px 0;}
  .li-tbl td{padding:8px 8px 8px 0;border-top:1px solid rgba(255,255,255,.05);color:#e6e6ec;vertical-align:middle;}
  .li-tbl td.dim{color:#9aa0ad;}
  .li-tags{display:flex;flex-wrap:wrap;gap:5px;}
  .li-tag{font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.08);color:#cfd2da;white-space:nowrap;}
  .li-tag.ext{background:rgba(106,168,255,.16);color:#a9cbff;}
  .li-tag.emb{background:rgba(255,255,255,.07);color:#b8bcc8;}
  .li-tag.forced{background:rgba(245,197,24,.16);color:#f5d36a;}
  .li-tag.sdh{background:rgba(139,125,255,.18);color:#c9c2ff;}
  .li-tag.def{background:rgba(53,208,127,.16);color:#7ef0b0;}
  .li-tag.img{background:rgba(255,107,107,.16);color:#ff9a9a;}
  .li-langs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}
  .li-lang{font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.07);color:#e6e6ec;}
  .li-lang b{color:#9aa0ad;font-weight:700;margin-left:4px;}
  .li-note{display:flex;gap:9px;font-size:13px;line-height:1.45;color:#dcdce4;padding:9px 12px;border-radius:11px;background:rgba(255,255,255,.04);border-left:3px solid var(--c,#9aa0ad);}
  .li-notes{display:flex;flex-direction:column;gap:8px;}
  .li-empty{color:#9aa0ad;font-size:13px;}
  .li-season{border-top:1px solid rgba(255,255,255,.06);}
  .li-season:first-child{border-top:0;}
  .li-season>summary{list-style:none;display:flex;align-items:center;gap:10px;padding:12px 2px;cursor:pointer;font-weight:800;color:#fff;}
  .li-season>summary::-webkit-details-marker{display:none;}
  .li-season>summary::before{content:"›";display:inline-block;transition:transform .15s;color:#9aa0ad;font-size:18px;width:12px;}
  .li-season[open]>summary::before{transform:rotate(90deg);}
  .li-season>summary .ct{margin-left:auto;color:#9aa0ad;font-weight:700;font-size:12.5px;}
  .li-ep{display:grid;grid-template-columns:44px 1fr auto;align-items:center;gap:10px;padding:8px 6px;border-radius:10px;cursor:pointer;}
  .li-ep:hover,.li-ep:focus-visible{background:rgba(255,255,255,.05);outline:none;}
  .li-ep .no{color:#9aa0ad;font-weight:800;font-size:12.5px;font-variant-numeric:tabular-nums;}
  .li-ep .t{min-width:0;}
  .li-ep .t div{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .li-ep .t .a{color:#fff;font-weight:700;font-size:13.5px;}
  .li-ep .t .b{color:#8a8f9c;font-size:12px;margin-top:2px;}
  .li-ep .r{color:#9aa0ad;font-size:12px;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;}
  .li-ep .r .w{color:#7ef0b0;}
  .li-loading{color:#9aa0ad;padding:6px 2px;}
  @media (max-width:768px){
    .li-overlay{padding:0;align-items:flex-end;}
    .li-card{width:100%;max-height:94vh;max-height:94dvh;border-radius:22px 22px 0 0;}
    .li-card::before{content:"";position:sticky;display:block;top:6px;z-index:6;width:42px;height:5px;margin:6px auto -11px;border-radius:999px;background:rgba(255,255,255,.35);}
    .li-hero{padding:24px 16px 14px;}
    .li-poster{width:78px;border-radius:10px;}
    .li-body{padding:4px 14px 24px;gap:12px;}
    .li-box{padding:14px;}
    .li-grid{grid-template-columns:1fr;}
    .li-tiles{grid-template-columns:repeat(2,minmax(0,1fr));}
    .li-tbl .hide-m{display:none;}
    .li-ep{grid-template-columns:36px 1fr auto;}
  }
  @media (prefers-reduced-motion:reduce){.li-card{animation:none;}}`;

// ---------- formatting ----------
const fmtSize = (b) => (!b ? '—' : b >= 1099511627776 ? `${(b / 1099511627776).toFixed(2)} TB` : b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : `${Math.round(b / 1048576)} MB`);
const fmtRate = (k) => (!k ? '' : k >= 1000 ? `${(k / 1000).toFixed(1)} Mbps` : `${Math.round(k)} kbps`);
const fmtDur = (ms) => { const m = Math.round((ms || 0) / 60000); return !m ? '' : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const fmtDate = (s) => (s ? new Date(s * 1000).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtRes = (r) => { const v = String(r || '').toLowerCase(); if (!v) return ''; if (v === '4k' || v === '2160') return '4K'; if (/^\d+$/.test(v)) return v + 'p'; return v.toUpperCase(); };
const fmtCh = (n, layout) => { const l = String(layout || '').replace(/\(.*\)/, ''); if (l) return l === 'stereo' ? 'Stereo' : l === 'mono' ? 'Mono' : l; return n === 2 ? 'Stereo' : n === 1 ? 'Mono' : n === 6 ? '5.1' : n === 8 ? '7.1' : n ? n + 'ch' : ''; };
const SUB_NAMES = { SRT: 'SRT', SUBRIP: 'SRT', ASS: 'ASS', SSA: 'SSA', PGS: 'PGS', HDMV_PGS_SUBTITLE: 'PGS', VOBSUB: 'VobSub', DVD_SUBTITLE: 'VobSub', MOV_TEXT: 'MP4 text', WEBVTT: 'WebVTT', VTT: 'WebVTT', SMI: 'SAMI' };
const subFmt = (c) => SUB_NAMES[c] || c || '—';
const kv = (pairs) => `<dl class="li-kv">${pairs.filter(([, v]) => v !== '' && v != null && v !== false).map(([k, v]) => `<dt>${escHTML(k)}</dt><dd>${escHTML(v)}</dd>`).join('')}</dl>`;
const box = (icon, title, inner, count = '') => `<section class="li-box"><div class="li-ph"><span>${icon}</span><h4>${title}</h4>${count ? `<span class="ct">${escHTML(count)}</span>` : ''}</div>${inner}</section>`;
const tile = (n, l, hl) => (n ? `<div class="li-tile${hl ? ' hl' : ''}"><div class="n">${escHTML(n)}</div><div class="l">${escHTML(l)}</div></div>` : '');

// ---------- sheet host with a back stack ----------
let stack = [], seq = 0, ctx = {};
function host() {
  let h = document.getElementById('libInfo');
  if (h) return h;
  const st = document.createElement('style'); st.id = 'libinfo-styles'; st.textContent = CSS; document.head.appendChild(st);
  h = document.createElement('div');
  h.id = 'libInfo'; h.className = 'li-overlay hidden';
  h.innerHTML = '<div class="li-backdrop"></div><div class="li-card" role="dialog" aria-modal="true" aria-label="Library details"></div>';
  document.body.appendChild(h);
  h.querySelector('.li-backdrop').addEventListener('click', close);
  h.addEventListener('click', (e) => {
    if (e.target.closest('.li-x')) return close();
    if (e.target.closest('.li-back')) { stack.pop(); return draw(); }
    const v = e.target.closest('[data-li-ver]');
    if (v) { v.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === v)); const s = h.querySelector('.li-ver-slot'); if (s && ctx.item) s.innerHTML = versionHTML(ctx.item.versions[Number(v.dataset.liVer)]); return; }
    const ep = e.target.closest('[data-li-ep]');
    if (ep) { stack.push({ kind: 'item', key: ep.dataset.liEp }); draw(); }
  });
  h.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-li-ep]')) { e.preventDefault(); e.target.click(); } });
  enableSheetDrag(h.querySelector('.li-card'), close);
  return h;
}
function isOpen() { const h = document.getElementById('libInfo'); return !!h && !h.classList.contains('hidden'); }
function close() {
  const h = document.getElementById('libInfo');
  if (!h || h.classList.contains('hidden')) return;
  h.classList.add('hidden');
  clearSheetDrag(h.querySelector('.li-card'));
  h.querySelector('.li-card').innerHTML = '';
  stack = []; seq++;
  releaseScrollLock('libinfo');
}
// Esc / remote Back closes this sheet only, not the title modal under it.
// Capture on document runs before app.js's own nav:back listener.
document.addEventListener('nav:back', (e) => { if (isOpen()) { e.stopImmediatePropagation(); close(); } }, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { e.stopImmediatePropagation(); close(); } }, true);

function open(o) {
  if (!o || !o.key) return;
  const h = host();
  ctx = { title: o.title, poster: o.poster, backdrop: o.backdrop, year: o.year };
  stack = [{ kind: o.media === 'tv' ? 'show' : 'item', key: o.key }];
  if (h.classList.contains('hidden')) { h.classList.remove('hidden'); applyScrollLock('libinfo'); }
  draw();
}
window.openLibraryInfo = open;

async function draw() {
  const h = document.getElementById('libInfo');
  const top = stack[stack.length - 1];
  if (!h || !top) return close();
  const card = h.querySelector('.li-card');
  const my = ++seq;
  const back = stack.length > 1;
  card.innerHTML = `<button class="li-x" aria-label="Close">✕</button>${back ? '<button class="li-back">‹ Back</button>' : ''}<div class="li-slot"><div class="li-body" style="padding-top:70px"><div class="li-loading">Reading your Plex library…</div></div></div>`;
  card.scrollTop = 0;
  const d = await api(`/api/discover/library/${top.kind === 'show' ? 'show' : 'item'}/${encodeURIComponent(top.key)}`);
  if (my !== seq || !isOpen()) return;
  const slot = card.querySelector('.li-slot');
  if (d.error) { slot.innerHTML = `<div class="li-body" style="padding-top:70px"><div class="li-note" style="--c:#ff6b6b">Couldn't read this from Plex: ${escHTML(d.error)}</div></div>`; return; }
  slot.innerHTML = top.kind === 'show' ? showHTML(d, back) : itemHTML(d, back);
  if (top.kind === 'show') { const first = slot.querySelector('.li-season'); if (first) first.open = true; }
}

function hero(d, back, kicker, title, subBits) {
  const bg = ctx.backdrop || ctx.poster;
  return `<div class="li-hero${back ? ' hasback' : ''}">
    ${bg ? `<div class="li-hero-bg" style="background-image:url('${escHTML(bg)}')"></div>` : ''}
    <div class="li-hero-in">
      ${ctx.poster ? `<img class="li-poster" src="${escHTML(ctx.poster)}" alt="">` : ''}
      <div style="min-width:0">
        <span class="li-kick">✓ ${escHTML(kicker)}</span>
        <h2 class="li-h">${escHTML(title)}</h2>
        <div class="li-sub">${subBits.filter(Boolean).map((x) => `<span>${escHTML(x)}</span>`).join('')}</div>
      </div>
    </div></div>`;
}

// ---------- movie / episode ----------
function itemHTML(d, back) {
  ctx.item = d;
  const ep = d.type === 'episode';
  const title = ep ? `${d.show || ctx.title || ''} · S${String(d.season).padStart(2, '0')}E${String(d.episode).padStart(2, '0')}` : (d.title || ctx.title);
  const sub = [ep ? d.title : (d.year || ctx.year), d.section ? `${d.section} library` : '', d.addedAt ? `Added ${fmtDate(d.addedAt)}` : '', d.viewCount ? `Watched ${d.viewCount}×` : 'Not watched yet', d.lastViewedAt ? `last ${fmtDate(d.lastViewedAt)}` : ''];
  const vers = d.versions || [];
  const verBar = vers.length > 1 ? box('🗂️', 'Versions', `<div class="li-vers">${vers.map((v, i) => `<button data-li-ver="${i}" class="${i === 0 ? 'on' : ''}">${escHTML([v.edition, fmtRes(v.resolution), v.videoCodec, v.video?.[0]?.dynamicRange !== 'SDR' ? v.video?.[0]?.dynamicRange : '', fmtSize(v.size)].filter(Boolean).join(' · '))}</button>`).join('')}</div>`, `${vers.length} files`) : '';
  return `${hero(d, back, vers.length > 1 ? `In library · ${vers.length} versions` : 'In library', title, sub)}
    <div class="li-body">${verBar}<div class="li-ver-slot" style="display:contents">${vers.length ? versionHTML(vers[0]) : '<div class="li-empty">Plex reports no media files for this title.</div>'}</div></div>`;
}

function versionHTML(v) {
  if (!v) return '';
  const vid = v.video?.[0] || {};
  const a0 = (v.audio || []).find((a) => a.default) || v.audio?.[0] || {};
  const subs = v.subtitles || [];
  const hdr = vid.dynamicRange && vid.dynamicRange !== 'SDR' ? vid.dynamicRange : '';
  const tiles = `<div class="li-tiles">
    ${tile(fmtRes(v.resolution) || (v.height ? v.height + 'p' : ''), 'Resolution', fmtRes(v.resolution) === '4K')}
    ${tile(hdr || 'SDR', 'Dynamic range', !!hdr)}
    ${tile(v.videoCodec, 'Video codec')}
    ${tile([a0.codec || v.audioCodec, fmtCh(a0.channels || v.audioChannels, a0.layout)].filter(Boolean).join(' '), 'Main audio')}
    ${tile(fmtSize(v.size), 'File size')}
    ${tile(fmtRate(v.bitrate), 'Bitrate')}
    ${tile(String(subs.length), subs.length === 1 ? 'Subtitle' : 'Subtitles')}
    ${tile(fmtDur(v.duration), 'Runtime')}
  </div>`;
  const files = (v.parts || []).map((p) => `<div class="li-file">📄 ${escHTML(p.file || 'unknown file')}</div>`).join('');
  const fileBox = box('📁', 'File', `${files}${kv([['Container', v.container], ['Size', fmtSize(v.size)], ['Overall bitrate', fmtRate(v.bitrate)], ['Parts', (v.parts || []).length > 1 ? String(v.parts.length) : ''], ['Edition', v.edition], ['Optimized for streaming', (v.parts || []).some((p) => p.optimized) ? 'Yes' : '']])}`);
  const videoBox = box('🎞️', 'Video', (v.video || []).length ? (v.video || []).map((s) => kv([
    ['Codec', [s.codec, s.profile ? `(${s.profile})` : ''].filter(Boolean).join(' ')], ['Frame size', s.width ? `${s.width}×${s.height}` : ''],
    ['Dynamic range', s.dynamicRange + (s.doviProfile ? ` · profile ${s.doviProfile}` : '')], ['Bit depth', s.bitDepth ? `${s.bitDepth}-bit` : ''],
    ['Frame rate', s.fps ? `${s.fps} fps` : v.fps ? String(v.fps).toUpperCase() : ''], ['Bitrate', fmtRate(s.bitrate)], ['Aspect ratio', v.aspect ? `${v.aspect}:1` : ''],
    ['Chroma', s.chroma], ['Colour primaries', s.primaries], ['Scan', s.scan]
  ])).join('<hr style="border:0;border-top:1px solid rgba(255,255,255,.06);margin:12px 0">') : '<div class="li-empty">No video track reported.</div>');
  const audioBox = box('🔊', 'Audio tracks', (v.audio || []).length ? `<table class="li-tbl"><tr><th>Language</th><th>Format</th><th class="hide-m">Bitrate</th><th></th></tr>${(v.audio || []).map((a) => `<tr><td>${escHTML(a.language || 'Unknown')}${a.label ? `<div class="li-empty" style="font-size:11.5px">${escHTML(a.label)}</div>` : ''}</td><td>${escHTML([a.codec, a.profile && !/lc/i.test(a.profile) ? a.profile.toUpperCase() : '', fmtCh(a.channels, a.layout)].filter(Boolean).join(' '))}</td><td class="dim hide-m">${escHTML(fmtRate(a.bitrate))}</td><td>${a.default ? '<span class="li-tag def">Default</span>' : ''}</td></tr>`).join('')}</table>` : '<div class="li-empty">No audio tracks reported.</div>', `${(v.audio || []).length} track${(v.audio || []).length === 1 ? '' : 's'}`);
  return `${tiles}${subsHTML(subs)}<div class="li-grid">${videoBox}${audioBox}</div>${fileBox}${notesHTML(v)}`;
}

function subsHTML(subs) {
  if (!subs.length) return box('💬', 'Subtitles', '<div class="li-empty">No subtitles in this file or next to it. Plex can still search for some (Subtitles → Search in the Plex player).</div>', '0');
  const byLang = new Map();
  subs.forEach((s) => byLang.set(s.language, (byLang.get(s.language) || 0) + 1));
  const langs = `<div class="li-langs">${[...byLang].map(([l, n]) => `<span class="li-lang">${escHTML(l)}${n > 1 ? `<b>×${n}</b>` : ''}</span>`).join('')}</div>`;
  const rows = subs.map((s) => {
    const tags = [
      s.external ? '<span class="li-tag ext">External file</span>' : '<span class="li-tag emb">Embedded</span>',
      s.forced ? '<span class="li-tag forced">Forced</span>' : '',
      s.hearingImpaired ? '<span class="li-tag sdh">SDH</span>' : '',
      s.default ? '<span class="li-tag def">Default</span>' : '',
      s.image ? '<span class="li-tag img" title="Image subtitles usually force a transcode">Image</span>' : ''
    ].join('');
    return `<tr><td>${escHTML(s.language)}${s.label ? `<div class="li-empty" style="font-size:11.5px">${escHTML(s.label)}</div>` : ''}</td><td>${escHTML(subFmt(s.codec))}</td><td><div class="li-tags">${tags}</div></td></tr>`;
  }).join('');
  return box('💬', 'Subtitles', `${langs}<table class="li-tbl"><tr><th>Language</th><th>Format</th><th>Type</th></tr>${rows}</table>`, `${subs.length} track${subs.length === 1 ? '' : 's'} · ${byLang.size} language${byLang.size === 1 ? '' : 's'}`);
}

// What this file means for playback on typical players.
function notesHTML(v) {
  const out = [];
  const add = (c, i, msg) => out.push(`<div class="li-note" style="--c:${c}"><span>${i}</span><span>${msg}</span></div>`);
  const vid = v.video?.[0] || {};
  const imgSubs = (v.subtitles || []).filter((s) => s.image);
  const textSubs = (v.subtitles || []).filter((s) => !s.image);
  if (imgSubs.length) add('#f5c518', '💬', `<b>${imgSubs.length} image subtitle track${imgSubs.length === 1 ? '' : 's'}</b> (${escHTML([...new Set(imgSubs.map((s) => subFmt(s.codec)))].join(', '))}). Turning ${imgSubs.length === 1 ? 'it' : 'one'} on often forces a video transcode on TVs and phones${textSubs.length ? ` — the ${textSubs.length} text track${textSubs.length === 1 ? '' : 's'} won't` : ''}.`);
  if (/TRUEHD|DTS/.test((v.audio || []).map((a) => a.codec).join(' '))) add('#8b7dff', '🔊', 'Has <b>TrueHD/DTS</b> audio. Many TV apps can\'t play it and Plex converts the audio (cheap, video untouched). Use a receiver or passthrough for the original.');
  if (/HEVC|AV1/.test(v.videoCodec) && fmtRes(v.resolution) === '4K') add('#6aa8ff', '🎞️', `<b>${escHTML(v.videoCodec)} 4K</b> — Direct Plays on modern 4K TVs; older devices and browsers will transcode it.`);
  if (/dolby vision/i.test(vid.dynamicRange || '') && !/hdr10/i.test(vid.dynamicRange)) add('#f5c518', '🌈', '<b>Dolby Vision without an HDR10 layer</b> — non-DV screens will show wrong colours or need tone mapping.');
  if (fmtRate(v.bitrate) && v.bitrate > 40000) add('#ff6b6b', '📶', `<b>High bitrate (${escHTML(fmtRate(v.bitrate))})</b> — remote viewers with a lower Remote Streaming limit will get a transcode.`);
  if (!out.length) add('#35d07f', '✅', 'Standard formats — this file should Direct Play on almost every device.');
  return box('🧠', 'Playback notes', `<div class="li-notes">${out.join('')}</div>`);
}

// ---------- series ----------
function showHTML(d, back) {
  const t = d.totals || {};
  const chips = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${fmtRes(k) || k} ×${n}`).join(' · ');
  const sub = [d.year || ctx.year, d.section ? `${d.section} library` : '', d.addedAt ? `Added ${fmtDate(d.addedAt)}` : ''];
  const tiles = `<div class="li-tiles">
    ${tile(String(d.seasonCount), d.seasonCount === 1 ? 'Season' : 'Seasons')}
    ${tile(String(d.episodes), 'Episodes')}
    ${tile(`${d.watchedEpisodes || 0}/${d.episodes}`, 'Watched')}
    ${tile(fmtSize(t.size), 'Total size', true)}
  </div>`;
  const quality = box('📊', 'Quality across episodes', kv([['Average per episode', d.episodes ? fmtSize(t.size / d.episodes) : ''], ['Resolution', chips(t.resolutions)], ['Video codec', chips(t.videoCodecs)], ['Audio codec', chips(t.audioCodecs)]]));
  const seasons = (d.seasons || []).map((s) => `<details class="li-season"><summary>${escHTML(s.title)}<span class="ct">${s.episodes.length} ep · ${fmtSize(s.size)}</span></summary>
    ${s.episodes.map((e) => `<div class="li-ep" role="button" tabindex="0" data-li-ep="${escHTML(e.ratingKey)}">
      <span class="no">E${String(e.episode).padStart(2, '0')}</span>
      <span class="t"><div class="a">${escHTML(e.title || `Episode ${e.episode}`)}</div><div class="b">${escHTML([fmtRes(e.resolution), e.videoCodec, [e.audioCodec, fmtCh(e.audioChannels)].filter(Boolean).join(' '), e.container, e.versions > 1 ? `${e.versions} versions` : ''].filter(Boolean).join(' · '))}</div></span>
      <span class="r">${escHTML(fmtSize(e.size))}<br>${e.viewCount ? '<span class="w">✓ watched</span>' : escHTML(fmtDur(e.duration))}</span>
    </div>`).join('')}</details>`).join('');
  return `${hero(d, back, 'In library', d.title || ctx.title, sub)}
    <div class="li-body">${tiles}${quality}
      ${box('📺', 'Episodes', seasons || '<div class="li-empty">No episodes found.</div>', 'Tap an episode for its tracks & subtitles')}
    </div>`;
}
