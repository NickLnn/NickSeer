// errors.js — shows any uncaught JS error / unhandled promise on screen, so a
// boot crash (blank Home) is diagnosable instead of silent. Load this FIRST.
(function () {
  function banner() {
    let b = document.getElementById('ns-error-banner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'ns-error-banner';
      b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;max-height:40vh;overflow:auto;background:#2a0b0e;color:#ffd7d9;border-top:2px solid #e50914;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:10px 14px;white-space:pre-wrap;';
      const close = document.createElement('button');
      close.textContent = '✕ hide';
      close.style.cssText = 'position:sticky;top:0;float:right;background:#e50914;color:#fff;border:0;border-radius:6px;padding:4px 8px;font-weight:800;cursor:pointer;';
      close.onclick = () => b.remove();
      b.appendChild(close);
      const t = document.createElement('div');
      t.id = 'ns-error-body';
      t.style.marginTop = '2px';
      b.appendChild(t);
      (document.body || document.documentElement).appendChild(b);
    }
    return document.getElementById('ns-error-body');
  }
  function log(msg) {
    try { const body = banner(); const line = document.createElement('div'); line.textContent = msg; body.appendChild(line); } catch { /* ignore */ }
  }
  window.addEventListener('error', (e) => {
    const where = e.filename ? ` @ ${e.filename.split('/').pop()}:${e.lineno}:${e.colno}` : '';
    log('❌ ' + (e.message || 'Script error') + where);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    log('❌ Promise: ' + (r && (r.stack || r.message) ? (r.stack || r.message) : String(r)));
  });
  // Also surface a note if Home stays empty for a few seconds (likely a boot crash).
  setTimeout(() => {
    const app = document.getElementById('app');
    if (app && app.children.length === 0) log('⚠ #app is still empty after 5s — Home did not render (a module likely threw above).');
  }, 5000);
})();
