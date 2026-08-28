// ai.js — Advanced LLM Taste Curator & Precision Reranker
import { load } from '../config.js';

const DEFAULT_TIMEOUT = 45000;
const GENRES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics'
};

function genreNames(ids) {
  return (ids || []).map((g) => GENRES[g]).filter(Boolean).slice(0, 3).join('/');
}
function trimSlash(u) { return String(u || '').replace(/\/+$/, ''); }
function isOpenAICompatible(url) {
  const u = trimSlash(url);
  return /\/v1$/i.test(u) || /\/v1\//i.test(u);
}

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function openaiCompatibleChat(baseUrl, apiKey, model, messages, { json = false, timeout = DEFAULT_TIMEOUT, maxTokens = 1000 } = {}) {
  const url = trimSlash(baseUrl) + '/chat/completions';
  const body = { model: model || 'local', messages, temperature: 0.2, max_tokens: maxTokens };
  if (json) body.response_format = { type: 'json_object' };
  let res;
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (apiKey || 'sk-local-dummy') },
      body: JSON.stringify(body)
    }, timeout);
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? `AI timeout (no response in ${Math.round(timeout / 1000)}s)` : e.message);
  }
  if (!res.ok) {
    if (json) return openaiCompatibleChat(baseUrl, apiKey, model, messages, { json: false, timeout, maxTokens });
    throw new Error(`chat ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function ollamaNative(prompt, timeout) {
  const { ai } = load();
  let res;
  try {
    res = await fetchWithTimeout(trimSlash(ai.ollamaUrl) + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ai.ollamaModel || 'llama3.1', prompt, stream: false, options: { temperature: 0.2 } })
    }, timeout);
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? `AI timeout (no response in ${Math.round(timeout / 1000)}s)` : e.message);
  }
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  return (await res.json()).response || '';
}

async function chat(messages, prompt, opts = {}) {
  const { ai } = load();
  if (ai.provider === 'openai') {
    const base = ai.openaiBaseUrl?.trim() ? ai.openaiBaseUrl : 'https://api.openai.com/v1';
    return openaiCompatibleChat(base, ai.openaiApiKey, ai.openaiModel || 'gpt-4o-mini', messages, opts);
  }
  if (ai.provider === 'ollama') {
    if (isOpenAICompatible(ai.ollamaUrl)) {
      return openaiCompatibleChat(ai.ollamaUrl, ai.openaiApiKey || 'sk-local-dummy', ai.ollamaModel || 'local', messages, opts);
    }
    return ollamaNative(prompt, opts.timeout || DEFAULT_TIMEOUT);
  }
  return '';
}

function extractJson(s) {
  const m = String(s).match(/\{[\s\S]*\}/);
  return m ? m[0] : s;
}

export async function aiRerank(candidates, seeds) {
  const { ai } = load();
  if (!ai.provider || ai.provider === 'none') return candidates;

  const seedList = seeds.slice(0, 10).map((s) => `${s.title}${s.genres ? ' (' + s.genres + ')' : ''}`).join('; ');
  const cand = candidates.slice(0, 35).map((c, i) => {
    const g = genreNames(c.genre_ids);
    const y = (c.release_date || c.first_air_date || '').slice(0, 4);
    const ov = (c.overview || '').replace(/\s+/g, ' ').slice(0, 130);
    return `${i}. ${c.title || c.name}${y ? ' (' + y + ')' : ''}${g ? ' [' + g + ']' : ''}${c.vote_average ? ' ★' + c.vote_average.toFixed(1) : ''}${ov ? ' — ' + ov : ''}`;
  }).join('\n');

  const sys = `You are an expert film & television curator for a private cinema system.
Analyze the VIEWER RECENTLY WATCHED list to determine their core taste: dominant genres, tone (e.g. prestige drama, gritty crime, psychological thriller, mature comedy, epic fantasy), target audience, and storytelling depth.

CRITICAL RULES:
1. Recommend titles that share the exact maturity level, dramatic weight, and atmosphere of their favorite watched titles.
2. STRICTLY AVOID children's cartoons, kids TV shows, and music concerts/tour films unless the viewer's history consists primarily of those genres.
3. Select and rank the 18 best matching candidates from the CANDIDATES list.

Respond with ONLY valid JSON:
{"picks":[{"i":<candidate index>,"why":"<concise 4-6 word reason like 'Gritty crime saga with intense drama'>"}]}`;

  const user = `VIEWER RECENTLY WATCHED:\n${seedList}\n\nCANDIDATES:\n${cand}`;

  let raw;
  try {
    raw = await chat(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      sys + '\n\n' + user,
      { json: true, timeout: DEFAULT_TIMEOUT, maxTokens: 900 }
    );
  } catch (e) {
    console.warn('[ai] rerank skipped:', e.message);
    return candidates;
  }

  let parsed;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return candidates;
  }

  const picks = parsed?.picks || parsed?.ranked;
  if (!Array.isArray(picks) || !picks.length) return candidates;

  const out = [];
  const used = new Set();
  for (const p of picks) {
    const idx = Number(p.i);
    const c = candidates[idx];
    if (c && !used.has(idx)) {
      c._why = (p.why || '').slice(0, 60);
      out.push(c);
      used.add(idx);
    }
  }

  candidates.forEach((c, i) => {
    if (!used.has(i)) out.push(c);
  });

  return out;
}

export async function ping(timeout = 15000) {
  const { ai } = load();
  if (!ai.provider || ai.provider === 'none') return { ok: false, error: 'AI provider is None' };
  try {
    const r = await chat([{ role: 'user', content: 'Say: ok' }], 'Say: ok', { json: false, timeout, maxTokens: 8 });
    return { ok: true, sample: String(r).trim().slice(0, 40), model: ai.ollamaModel || ai.openaiModel || 'local' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export default { aiRerank, ping };