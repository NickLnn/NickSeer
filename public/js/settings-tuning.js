// settings-tuning.js — adds "AI Suggestions tuning" sliders to Settings → AI
// Brain: min rating, min votes, max candidates, history days, and an English-
// only toggle. Saves to config.aiTuning. Additive; watches the settings overlay.
function authHeaders() { const t = localStorage.getItem('nickseer_token'); return t ? { Authorization: 'Bearer ' + t } : {}; }

let current = { minRating: 6.2, minVotes: 80, maxCandidates: 50, historyDays: 60, englishOnly: false };

async function loadTuning() {
  try { const c = await fetch('/api/settings', { headers: authHeaders() }).then((r) => r.json()); if (c && c.aiTuning) current = { ...current, ...c.aiTuning }; } catch { /* keep defaults */ }
}

function injectStyles() {
  if (document.getElementById('tuning-styles')) return;
  const css = `
  .tune-wrap{margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);}
  .tune-h{font-size:14px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#9aa0ad;margin-bottom:4px;}
  .tune-hint{font-size:12px;color:#9aa0ad;margin-bottom:14px;}
  .tune-row{margin-bottom:16px;}
  .tune-label{display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#eaeaf0;margin-bottom:6px;}
  .tune-val{color:#3aa0ff;font-weight:800;}
  .tune-range{width:100%;-webkit-appearance:none;appearance:none;height:6px;border-radius:999px;background:rgba(255,255,255,.14);outline:none;}
  .tune-range::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg,#3aa0ff,#1E88C7);cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.4);}
  .tune-range::-moz-range-thumb{width:18px;height:18px;border:0;border-radius:50%;background:#1E88C7;cursor:pointer;}
  .tune-toggle{display:flex;align-items:center;gap:10px;margin:6px 0 14px;}
  .tune-switch{width:44px;height:24px;border-radius:999px;background:rgba(255,255,255,.16);position:relative;cursor:pointer;transition:.2s;flex:0 0 auto;}
  .tune-switch.on{background:#1E88C7;}
  .tune-switch i{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.2s;}
  .tune-switch.on i{left:23px;}
  .tune-save{margin-top:6px;padding:9px 16px;border:0;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;background:linear-gradient(135deg,#3aa0ff,#1E88C7);color:#fff;}
  .tune-save:hover{filter:brightness(1.05);}
  .tune-msg{margin-left:10px;font-size:12.5px;font-weight:700;}`;
  const st = document.createElement('style'); st.id = 'tuning-styles'; st.textContent = css; document.head.appendChild(st);
}

function sliderRow(id, label, min, max, step, val, suffix) {
  return `<div class="tune-row">
    <div class="tune-label"><span>${label}</span><span class="tune-val"><span id="${id}-out">${val}</span>${suffix || ''}</span></div>
    <input class="tune-range" type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">
  </div>`;
}

async function inject() {
  const overlay = document.getElementById('settings');
  if (!overlay || overlay.classList.contains('hidden')) return;
  const body = document.getElementById('settingsBody'); if (!body) return;
  const seg = body.querySelector('[data-seg="ai.provider"]'); if (!seg) return;      // AI tab only
  if (document.getElementById('tuneWrap')) return;                                    // once
  await loadTuning();
  injectStyles();

  const wrap = document.createElement('div');
  wrap.id = 'tuneWrap'; wrap.className = 'tune-wrap';
  wrap.innerHTML = `
    <div class="tune-h">AI Suggestions tuning</div>
    <div class="tune-hint">Controls the quality/scope of the AI Suggestions tab.</div>
    ${sliderRow('tuneRating', 'Minimum ★ rating', 0, 9, 0.1, current.minRating, '')}
    ${sliderRow('tuneVotes', 'Minimum votes (less obscure)', 0, 1000, 10, current.minVotes, '')}
    ${sliderRow('tuneMax', 'Max candidates', 20, 150, 5, current.maxCandidates, '')}
    ${sliderRow('tuneDays', 'Watch history window', 14, 365, 1, current.historyDays, ' days')}
    <div class="tune-toggle"><div class="tune-switch ${current.englishOnly ? 'on' : ''}" id="tuneEn"><i></i></div><span style="font-weight:700;color:#eaeaf0">English only <span style="color:#9aa0ad;font-weight:500">(ignore your foreign-language history)</span></span></div>
    <button class="tune-save" id="tuneSave" type="button">Save tuning</button><span class="tune-msg" id="tuneMsg"></span>`;
  body.appendChild(wrap);

  const bind = (id) => { const el = document.getElementById(id); const out = document.getElementById(id + '-out'); el.addEventListener('input', () => { out.textContent = el.value; }); };
  ['tuneRating', 'tuneVotes', 'tuneMax', 'tuneDays'].forEach(bind);
  const sw = document.getElementById('tuneEn'); sw.addEventListener('click', () => sw.classList.toggle('on'));

  document.getElementById('tuneSave').addEventListener('click', async () => {
    const msg = document.getElementById('tuneMsg');
    const aiTuning = {
      minRating: Number(document.getElementById('tuneRating').value),
      minVotes: Number(document.getElementById('tuneVotes').value),
      maxCandidates: Number(document.getElementById('tuneMax').value),
      historyDays: Number(document.getElementById('tuneDays').value),
      englishOnly: document.getElementById('tuneEn').classList.contains('on')
    };
    try {
      const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ aiTuning }) }).then((x) => x.json());
      if (r.ok) { msg.textContent = '✓ saved — open AI Suggestions & hit ⟳'; msg.style.color = '#7ef0b0'; current = aiTuning; }
      else { msg.textContent = '✕ ' + (r.error || 'failed'); msg.style.color = '#ff9a9a'; }
    } catch (e) { msg.textContent = '✕ ' + e.message; msg.style.color = '#ff9a9a'; }
  });
}

const obs = new MutationObserver(() => inject());
obs.observe(document.body, { childList: true, subtree: true });
setTimeout(inject, 500);
