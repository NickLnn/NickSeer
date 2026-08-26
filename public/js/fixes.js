// fixes.js — SAFE version. The previous build caused an infinite loop / Chrome
// crash: watchHero() observed attribute (style/class) changes on #app, and
// fixHero() SET style attributes on those elements → the observer re-fired
// forever. This version:
//   • never observes attributes (only childList),
//   • guards every action so it runs at most once per element,
//   • heavily debounces, and self-limits.
// Fixes: (1) search Backspace + ✕ clear, (2) hero background (one-shot per hero),
// (3) daily refresh (timer only — no DOM observing).

// ---------- 1) SEARCH: Backspace + ✕ clear ----------------------------------
function fixSearch() {
  const input = document.getElementById('search');
  if (!input || input.dataset.fixed) return;
  input.dataset.fixed = '1';
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') { e.stopPropagation(); }
    else if (e.key === 'Escape') { e.stopPropagation(); clear(); }
  }, true);
  const box = input.closest('.search-box') || input.parentElement;
  if (box && !box.querySelector('.search-clear')) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'search-clear'; btn.setAttribute('aria-label', 'Clear search'); btn.textContent = '✕';
    btn.addEventListener('click', (e) => { e.preventDefault(); clear(); input.focus(); });
    box.appendChild(btn);
    input.addEventListener('input', toggleClear);
    toggleClear();
  }
  function toggleClear() { const b = box && box.querySelector('.search-clear'); if (b) b.style.display = input.value ? 'grid' : 'none'; }
  function clear() { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); toggleClear(); }
  injectSearchStyles();
}
function injectSearchStyles() {
  if (document.getElementById('fixes-search-css')) return;
  const css = `
  .search-box{position:relative;}
  .search-box input[type="search"]{padding-right:34px;}
  .search-box input[type="search"]::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none;}
  .search-clear{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:22px;height:22px;border:0;border-radius:50%;
    background:rgba(255,255,255,.16);color:#eaeaf0;font-size:12px;line-height:1;display:none;place-items:center;cursor:pointer;z-index:2;}
  .search-clear:hover{background:rgba(255,255,255,.28);}`;
  const st = document.createElement('style'); st.id = 'fixes-search-css'; st.textContent = css; document.head.appendChild(st);
}

// ---------- 2) HERO background: ONE-SHOT per hero element --------------------
// We mark the hero element once so we never touch it again → no observer loop.
function fixHeroOnce() {
  const hero = document.querySelector('.hero');
  if (!hero || hero.dataset.bgFixed) return;
  const ambient = document.getElementById('ambient');
  let url = null;
  const active = hero.querySelector('.hero-slide.on') || hero.querySelector('.hero-slide');
  if (active) { const bg = active.style.backgroundImage; const m = bg && bg.match(/url\((['"]?)(.*?)\1\)/); if (m && m[2] && m[2] !== 'none') url = m[2]; }
  if (!url) { const img = document.querySelector('.card-poster'); if (img && img.src) url = img.src.replace('/w500', '/w1280'); }
  if (!url) return;                 // nothing to set yet; try again on next tick
  hero.dataset.bgFixed = '1';       // guard: do this only once per hero
  if (active) { active.style.backgroundImage = `url("${url}")`; active.style.backgroundSize = 'cover'; active.style.backgroundPosition = 'center top'; active.classList.add('on'); active.style.opacity = '1'; }
  if (ambient && !ambient.style.backgroundImage) { ambient.style.backgroundImage = `url("${url}")`; ambient.style.opacity = '1'; }
}

// ---------- 3) DAILY refresh (pure timers; NO DOM observing) -----------------
function dailyRefresh() {
  const DAY = 24 * 60 * 60 * 1000; const KEY = 'nickseer_last_daily';
  const doRefresh = () => {
    const homeActive = document.querySelector('.nav-link[data-view="home"]')?.classList.contains('active');
    const btn = document.getElementById('refreshBtn');
    if (homeActive && btn) btn.click();
    localStorage.setItem(KEY, String(Date.now()));
  };
  const last = Number(localStorage.getItem(KEY) || 0);
  if (Date.now() - last > DAY) setTimeout(doRefresh, 4000);
  setInterval(() => { const l = Number(localStorage.getItem(KEY) || 0); if (Date.now() - l > DAY) doRefresh(); }, 60 * 60 * 1000);
}

// ---------- boot: childList-only observer + gentle polling (no attr watching)
function tick() { fixSearch(); fixHeroOnce(); }
function boot() {
  injectSearchStyles();
  tick();
  dailyRefresh();
  // Observe ONLY added nodes (never attributes) so our own style writes can't
  // retrigger us. Debounced.
  let t = null;
  const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(tick, 150); });
  obs.observe(document.body, { childList: true, subtree: true });
  // A few delayed passes catch late renders without any attribute observing.
  setTimeout(tick, 600); setTimeout(tick, 1500);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 300));
else setTimeout(boot, 300);
