// boxoffice.js — REAL weekly box-office data by scraping Box Office Mojo,
// then enriching each title via TMDB (poster + id for one-click request, AND
// the WORLDWIDE gross total from TMDB's `revenue` field).
//
// The weekend chart's "total" is domestic-only; the global cumulative total you
// see on each card comes from TMDB revenue, and it refreshes whenever the weekly
// scheduler re-fetches (7-day cache).
import { load } from '../config.js';
import tmdb from './tmdb.js';

const BOM = 'https://www.boxofficemojo.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`boxofficemojo ${res.status}`);
  return res.text();
}

function weekendUrl(area) {
  const q = area ? `?area=${encodeURIComponent(area)}` : '';
  return `${BOM}/weekend/${q}`;
}

export function parseWeekend(html) {
  const tableMatch = html.match(/<table[^>]*mojo-body-table[^>]*>([\s\S]*?)<\/table>/i);
  const scope = tableMatch ? tableMatch[1] : html;

  let label = null;
  const h1 = html.match(/<h1[^>]*>([^<]*Weekend[^<]*)<\/h1>/i);
  if (h1) label = h1[1].trim();
  if (!label) {
    const t = html.match(/<title>([^<]*Weekend[^<]*)<\/title>/i);
    if (t) label = t[1].replace(/\s*-\s*Box Office Mojo.*/i, '').trim();
  }

  const rows = scope.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const out = [];
  for (const row of rows) {
    if (!/mojo-field-type-release_group/.test(row)) continue;
    let rank = null;
    const rankHdr = row.match(/mojo-header-column[^>]*mojo-field-type-rank[^>]*>\s*([\d,]+)/i)
      || row.match(/mojo-field-type-rank[^>]*mojo-header-column[^>]*>\s*([\d,]+)/i)
      || row.match(/mojo-field-type-rank[^>]*>\s*([\d,]+)/i);
    if (rankHdr) rank = Number(rankHdr[1].replace(/,/g, ''));

    const titleM = row.match(/mojo-field-type-release_group[^>]*>\s*<a[^>]*>([^<]+)<\/a>/i)
      || row.match(/mojo-field-type-release_group[^>]*>\s*([^<]+)</i);
    const title = titleM ? decodeEntities(titleM[1].trim()) : null;
    if (!title) continue;

    const money = [...row.matchAll(/mojo-field-type-money[^>]*>\s*\$?([\d,]+)/gi)].map((m) => Number(m[1].replace(/,/g, '')));
    const weekendGross = money.length ? money[0] : null;
    const domesticTotal = money.length ? money[money.length - 1] : null;

    const weeksM = row.match(/mojo-field-type-weeks[^>]*>\s*([\d,]+)/i) || row.match(/mojo-field-type-running[^>]*>\s*([\d,]+)/i);
    const weeks = weeksM ? Number(weeksM[1].replace(/,/g, '')) : null;

    out.push({ rank: rank ?? out.length + 1, title, weekendGross, domesticTotal, weeks });
    if (out.length >= 10) break;
  }
  return { label, items: out };
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&hellip;/g, '…');
}

export function formatMoney(n) {
  if (n == null) return null;
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + Math.round(n).toLocaleString('en-US');
  return '$' + n;
}

function cleanTitle(t) {
  return t.replace(/\((?:19|20)\d{2}\s*(?:Re-?release)?\)/gi, '').replace(/\bRe-?release\b/gi, '').replace(/\s{2,}/g, ' ').trim();
}

async function matchToTmdb(title) {
  try {
    const res = await tmdb.search(cleanTitle(title), 'movie');
    const list = (res.results || []).filter((r) => r.poster_path);
    if (!list.length) return null;
    const exact = list.find((r) => (r.title || '').toLowerCase() === cleanTitle(title).toLowerCase());
    const pick = exact || list.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
    return {
      id: pick.id, title: pick.title, year: (pick.release_date || '').slice(0, 4),
      overview: pick.overview, poster: tmdb.img(pick.poster_path, 'w500'),
      backdrop: tmdb.img(pick.backdrop_path, 'w1280'), rating: pick.vote_average
    };
  } catch { return null; }
}

// Orchestrator: scrape latest completed weekend, enrich top 10 with poster +
// WORLDWIDE revenue (global total) from TMDB.
export async function topWeekend() {
  const { boxoffice } = load();
  const area = boxoffice?.area || '';
  const html = await fetchHtml(weekendUrl(area));
  const { label, items } = parseWeekend(html);
  if (!items.length) throw new Error('Box Office Mojo returned no rows');

  const enriched = [];
  for (const it of items) {
    const m = await matchToTmdb(it.title);
    let worldwide = null;
    if (m?.id) {
      try { const brief = await tmdb.movieBrief(m.id); if (brief && brief.revenue) worldwide = brief.revenue; } catch { /* ignore */ }
    }
    enriched.push({
      rank: it.rank,
      bomTitle: it.title,
      weekendGross: it.weekendGross,
      weekendGrossText: formatMoney(it.weekendGross),
      domesticTotal: it.domesticTotal,
      domesticTotalText: formatMoney(it.domesticTotal),
      worldwideTotal: worldwide,
      worldwideTotalText: formatMoney(worldwide),
      weeks: it.weeks,
      id: m?.id || null, media: 'movie', title: m?.title || it.title,
      year: m?.year || '', overview: m?.overview || '',
      poster: m?.poster || null, backdrop: m?.backdrop || null, rating: m?.rating || null,
      matched: !!m
    });
  }
  return { source: 'box-office-mojo', region: area || 'US & Canada', weekLabel: label, items: enriched };
}

export default { topWeekend, parseWeekend, formatMoney };
