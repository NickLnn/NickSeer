// buttons.js — High-Definition YouTube Trailer & IMDb Action Badges.
const YT_LOGO = `<svg width="22" height="16" viewBox="0 0 22 16" aria-label="YouTube" style="display:block"><rect width="22" height="16" rx="4" fill="#FF0000"/><path d="M9 4.5l5 3.5-5 3.5z" fill="#fff"/></svg>`;

const IMDB_LOGO = `<svg viewBox="0 0 40 20" width="34" height="17" style="display:block"><rect width="40" height="20" rx="3.5" fill="#F5C518"/><text x="3.5" y="15" font-family="'Arial Black',Impact,sans-serif" font-weight="900" font-size="13" fill="#000000" letter-spacing="-0.5">IMDb</text></svg>`;

function styleGhost(btn) {
  btn.style.display = 'inline-flex';
  btn.style.alignItems = 'center';
  btn.style.gap = '7px';
  btn.style.padding = '9px 14px';
  btn.style.background = 'rgba(255,255,255,.08)';
  btn.style.border = '1px solid rgba(255,255,255,.14)';
  btn.style.borderRadius = '10px';
  btn.style.color = '#eaeaf0';
  btn.style.fontWeight = '700';
  btn.style.fontSize = '13.5px';
  btn.style.textDecoration = 'none';
}

function upgradeButton(btn) {
  if (!btn || btn.dataset.logoBtn) return;
  const txt = (btn.textContent || '').trim();
  const href = btn.getAttribute('href') || '';
  const isYT = btn.classList.contains('btn-yt') || /youtube/i.test(href) || /youtube/i.test(txt);
  const isIMDb = btn.classList.contains('btn-imdb') || /imdb/i.test(txt) || /imdb\.com/i.test(href);
  if (isYT) {
    btn.dataset.logoBtn = '1'; styleGhost(btn);
    btn.innerHTML = `${YT_LOGO}<span>Trailer</span>`;
    btn.setAttribute('title', 'Watch trailer on YouTube');
  } else if (isIMDb) {
    btn.dataset.logoBtn = '1'; styleGhost(btn);
    btn.innerHTML = `${IMDB_LOGO}<span>IMDb</span>`;
    btn.setAttribute('title', 'View on IMDb');
  }
}

function upgradeIn(root) {
  (root || document).querySelectorAll('.modal-actions a, .modal-actions button, a.btn-imdb, a.btn-yt, a.btn-ghost').forEach(upgradeButton);
}
window.__nsUpgradeButtons = upgradeIn;

const obs = new MutationObserver((muts) => {
  for (const m of muts) {
    for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches && n.matches('.modal-actions a, .modal-actions button')) upgradeButton(n);
      if (n.querySelectorAll) upgradeIn(n);
    }
  }
});
obs.observe(document.body, { childList: true, subtree: true });
setTimeout(() => upgradeIn(document), 400);