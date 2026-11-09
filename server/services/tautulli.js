// Tautulli — history (with dynamic per-user isolation) + rich NOW WATCHING + home stats.
import { load } from '../config.js';

function cfg() {
  const { services } = load();
  const s = services.tautulli;
  if (!s || !s.url || !s.apikey) throw new Error('tautulli not configured');
  return { base: s.url.replace(/\/+$/, ''), key: s.apikey };
}

async function cmd(command, params = {}) {
  const { base, key } = cfg();
  const url = new URL(base + '/api/v2');
  url.searchParams.set('apikey', key);
  url.searchParams.set('cmd', command);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`tautulli ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json?.response?.result !== 'success') throw new Error('tautulli: ' + (json?.response?.message || 'error'));
  return json.response.data;
}

export async function test() { const d = await cmd('get_server_info'); return { ok: true, server: d?.pms_name }; }
export const users = () => cmd('get_users');

let cachedUserMap = null;
let lastUserFetch = 0;

export async function resolveUserId(identifier) {
  if (!identifier) return undefined;
  if (typeof identifier === 'number' || /^\d+$/.test(String(identifier))) {
    return Number(identifier);
  }
  try {
    const now = Date.now();
    if (!cachedUserMap || now - lastUserFetch > 300000) {
      const list = (await users()) || [];
      cachedUserMap = list;
      lastUserFetch = now;
    }
    const target = String(identifier).toLowerCase().trim();
    const hit = (cachedUserMap || []).find((u) =>
      String(u.user_id) === target ||
      (u.friendly_name && u.friendly_name.toLowerCase().trim() === target) ||
      (u.username && u.username.toLowerCase().trim() === target) ||
      (u.email && u.email.toLowerCase().trim() === target)
    );
    if (hit) return hit.user_id;
  } catch (e) {
    console.warn('[tautulli] resolveUserId error:', e.message);
  }
  return undefined;
}

export async function history(length = 300, userIdentifier) {
  const params = { length, order_column: 'date', order_dir: 'desc' };
  if (userIdentifier) {
    const uid = await resolveUserId(userIdentifier);
    if (uid !== undefined) params.user_id = uid;
    else params.user = userIdentifier;
  }
  const data = await cmd('get_history', params);
  const rows = data?.data || [];
  return rows.map((r) => ({
    title: r.full_title || r.title,
    type: r.media_type === 'episode' ? 'show' : r.media_type,
    grandparentTitle: r.grandparent_title,
    year: r.year,
    ratingKey: r.rating_key,
    watched: r.watched_status,
    percentComplete: r.percent_complete,
    date: r.date,
    user: r.friendly_name || r.user,
    userId: r.user_id
  }));
}

export async function historyDays(days = 30, userIdentifier, length = 600) {
  const rows = await history(length, userIdentifier);
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  return rows.filter((r) => Number(r.date || 0) >= cutoff);
}

// NOW WATCHING — full stream detail for a rich card.
export async function activity() {
  const d = await cmd('get_activity');
  const sessions = d?.sessions || [];
  return {
    count: Number(d?.stream_count || sessions.length || 0),
    totalBandwidth: Number(d?.total_bandwidth || 0),
    sessions: sessions.map((s) => {
      const res = (s.stream_video_full_resolution || s.video_full_resolution || '').toString();
      const is4k = /4k|2160/i.test(res) || Number(s.video_resolution) >= 2160;
      const vDec = s.stream_video_decision || s.video_decision || s.transcode_decision;
      const aDec = s.stream_audio_decision || s.audio_decision;
      return {
        user: s.friendly_name || s.username,
        title: s.full_title || s.title,
        grandparent: s.grandparent_title || '',
        parentTitle: s.parent_title || '',
        type: s.media_type, year: s.year,
        progress: Number(s.progress_percent || 0),
        state: s.state,
        player: s.player, device: s.platform, product: s.product,
        resolution: res || (s.video_resolution ? s.video_resolution + 'p' : ''),
        is4k,
        videoCodec: (s.stream_video_codec || s.video_codec || '').toUpperCase(),
        dynamicRange: s.video_dynamic_range || '',
        audioCodec: (s.stream_audio_codec || s.audio_codec || '').toUpperCase(),
        audioChannels: s.stream_audio_channel_layout || s.audio_channel_layout || (s.audio_channels ? s.audio_channels + 'ch' : ''),
        videoDecision: vDec, audioDecision: aDec, transcode: s.transcode_decision,
        container: (s.stream_container || s.container || '').toUpperCase(),
        bitrate: Number(s.stream_bitrate || s.bitrate || 0),
        bandwidth: Number(s.bandwidth || 0),
        ratingKey: s.rating_key, grandparentRatingKey: s.grandparent_rating_key,
        sessionKey: String(s.session_key || s.session_id || s.rating_key || ''),
        detail: sessionDetail(s)
      };
    })
  };
}

// Everything the Live Streaming detail sheet shows. Tautulli reports the
// SOURCE file (video_*, audio_*) and what actually goes over the wire
// (stream_video_*, stream_audio_*) side by side, so the sheet can show exactly
// what Plex changed. Empty strings / 0 mean "Tautulli did not report it".
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const up = (v) => (v == null ? '' : String(v)).toUpperCase();
const yes = (v) => v === 1 || v === '1' || v === true;
const listOf = (v) => (Array.isArray(v) ? v : (v ? String(v).split(/;\s*|,\s*/) : [])).filter(Boolean);
export function sessionDetail(s) {
  const fps = (v) => (v ? String(v).replace(/p$/i, '') : '');
  return {
    summary: s.summary || '', tagline: s.tagline || '',
    contentRating: s.content_rating || '', studio: s.studio || '',
    released: s.originally_available_at || '',
    genres: listOf(s.genres), directors: listOf(s.directors),
    season: num(s.parent_media_index), episode: num(s.media_index),
    episodeTitle: s.media_type === 'episode' ? (s.title || '') : '',
    userThumb: s.user_thumb || '',
    duration: num(s.duration), viewOffset: num(s.view_offset),
    transcodeProgress: num(s.transcode_progress),
    file: {
      // Basename only — the full NAS path is not something the UI needs.
      name: String(s.file || '').split(/[\\/]/).pop(),
      size: num(s.file_size), container: up(s.container), bitrate: num(s.bitrate),
      streamContainer: up(s.stream_container || s.transcode_container || s.container),
      streamBitrate: num(s.stream_bitrate), qualityProfile: s.quality_profile || '',
      optimized: yes(s.optimized_version), synced: yes(s.synced_version)
    },
    video: {
      decision: s.stream_video_decision || s.video_decision || '',
      src: {
        codec: up(s.video_codec), profile: s.video_profile || '', level: s.video_codec_level || '',
        width: num(s.video_width), height: num(s.video_height),
        resolution: s.video_full_resolution || (s.video_resolution ? s.video_resolution + 'p' : ''),
        bitrate: num(s.video_bitrate), bitDepth: num(s.video_bit_depth), fps: fps(s.video_framerate),
        dynamicRange: s.video_dynamic_range || '', scan: s.video_scan_type || '',
        aspect: s.aspect_ratio || '', chroma: s.video_chroma_subsampling || '',
        primaries: s.video_color_primaries || '', colorSpace: s.video_color_space || '', trc: s.video_color_trc || ''
      },
      out: {
        codec: up(s.stream_video_codec || s.transcode_video_codec), width: num(s.stream_video_width), height: num(s.stream_video_height),
        resolution: s.stream_video_full_resolution || (s.stream_video_resolution ? s.stream_video_resolution + 'p' : ''),
        bitrate: num(s.stream_video_bitrate), bitDepth: num(s.stream_video_bit_depth), fps: fps(s.stream_video_framerate),
        dynamicRange: s.stream_video_dynamic_range || ''
      }
    },
    audio: {
      decision: s.stream_audio_decision || s.audio_decision || '',
      src: {
        codec: up(s.audio_codec), profile: s.audio_profile || '', channels: num(s.audio_channels),
        layout: s.audio_channel_layout || '', bitrate: num(s.audio_bitrate),
        sampleRate: num(s.audio_sample_rate), language: s.audio_language || ''
      },
      out: {
        codec: up(s.stream_audio_codec || s.transcode_audio_codec), channels: num(s.stream_audio_channels),
        layout: s.stream_audio_channel_layout || '', bitrate: num(s.stream_audio_bitrate),
        language: s.stream_audio_language || ''
      }
    },
    subtitle: {
      on: yes(s.subtitles) || !!s.subtitle_codec,
      decision: s.stream_subtitle_decision || s.subtitle_decision || '',
      codec: up(s.subtitle_codec), language: s.subtitle_language || '', forced: yes(s.subtitle_forced),
      outCodec: up(s.stream_subtitle_codec)
    },
    transcode: {
      decision: s.transcode_decision || '',
      speed: s.transcode_speed ? String(s.transcode_speed) : '', throttled: yes(s.transcode_throttled),
      hwRequested: yes(s.transcode_hw_requested),
      hwDecode: yes(s.transcode_hw_decoding), hwEncode: yes(s.transcode_hw_encoding),
      hwDecodeTitle: s.transcode_hw_decode_title || '', hwEncodeTitle: s.transcode_hw_encode_title || ''
    },
    player: {
      name: s.player || '', product: s.product || '', productVersion: s.product_version || '',
      platform: s.platform_name || s.platform || '', platformVersion: s.platform_version || '',
      device: s.device || '', ip: s.ip_address || '',
      location: s.location || '', local: yes(s.local), secure: s.secure === '' || s.secure == null ? null : yes(s.secure),
      relayed: yes(s.relayed), bandwidth: num(s.bandwidth)
    }
  };
}

// ---------------------------------------------------------------------------
// PLAY HISTORY — the Live tab's History view and the Stats drill-downs.
// One query builder serves both: the list pages through Tautulli with
// start/length, the drill-downs ask for a larger window and aggregate it.
// ---------------------------------------------------------------------------
const DECISIONS = new Set(['direct play', 'copy', 'transcode']);
function ymd(daysAgo) { const d = new Date(Date.now() - daysAgo * 86400000); return d.toISOString().slice(0, 10); }

export function historyRow(r) {
  const ep = r.media_type === 'episode';
  return {
    rowId: r.row_id ?? r.id ?? r.reference_id,
    date: num(r.date), started: num(r.started), stopped: num(r.stopped),
    // Tautulli reports duration in seconds of actual playback (pauses removed).
    duration: num(r.play_duration ?? r.duration), paused: num(r.paused_counter),
    user: r.friendly_name || r.user || '', userId: r.user_id,
    media: r.media_type || '', ep,
    title: ep ? (r.grandparent_title || r.title) : (r.title || r.full_title),
    episodeTitle: ep ? r.title || '' : '',
    season: num(r.parent_media_index), episode: num(r.media_index),
    year: r.year || '',
    ratingKey: r.rating_key, showKey: ep ? r.grandparent_rating_key : null,
    decision: r.transcode_decision || '',
    percent: num(r.percent_complete), watched: num(r.watched_status) >= 1,
    player: r.player || '', platform: r.platform || '', product: r.product || '',
    ip: r.ip_address || '', location: r.location || '',
    secure: r.secure === '' || r.secure == null ? null : yes(r.secure),
    relayed: yes(r.relayed), live: yes(r.live)
  };
}

export async function historyQuery({ days = 30, userId, ratingKey, showKey, media, decision, start = 0, length = 50 } = {}) {
  const params = { order_column: 'date', order_dir: 'desc', start: Math.max(0, Number(start) || 0), length: Math.min(1000, Math.max(1, Number(length) || 50)) };
  if (days) params.after = ymd(Number(days));
  if (userId != null && userId !== '' && /^\d+$/.test(String(userId))) params.user_id = userId;
  if (ratingKey && /^\d+$/.test(String(ratingKey))) params.rating_key = ratingKey;
  if (showKey && /^\d+$/.test(String(showKey))) params.grandparent_rating_key = showKey;
  if (media === 'movie' || media === 'episode') params.media_type = media;
  if (DECISIONS.has(decision)) params.transcode_decision = decision;
  const data = await cmd('get_history', params);
  return { total: num(data?.recordsFiltered), rows: (data?.data || []).map(historyRow) };
}

// Roll a window of plays up into the numbers the drill-down sheets show.
export function summarize(rows) {
  const tally = (key, extra) => {
    const m = new Map();
    for (const r of rows) {
      const k = key(r); if (!k) continue;
      const e = m.get(k) || { name: k, plays: 0, seconds: 0, ...(extra ? extra(r) : {}) };
      e.plays += 1; e.seconds += r.duration; m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.plays - a.plays || b.seconds - a.seconds);
  };
  const decisions = { 'direct play': 0, copy: 0, transcode: 0 };
  for (const r of rows) if (r.decision in decisions) decisions[r.decision] += 1;
  return {
    plays: rows.length,
    seconds: rows.reduce((a, r) => a + r.duration, 0),
    avgPercent: rows.length ? Math.round(rows.reduce((a, r) => a + r.percent, 0) / rows.length) : 0,
    first: rows.length ? rows[rows.length - 1].date : 0,
    last: rows.length ? rows[0].date : 0,
    decisions,
    users: tally((r) => r.user, (r) => ({ userId: r.userId })),
    platforms: tally((r) => r.platform),
    players: tally((r) => r.player),
    titles: tally((r) => r.title, (r) => ({ media: r.ep ? 'tv' : 'movie', year: r.ep ? '' : r.year, ratingKey: r.ep ? null : r.ratingKey, showKey: r.showKey })),
    episodes: tally((r) => (r.ep ? `S${String(r.season).padStart(2, '0')}E${String(r.episode).padStart(2, '0')}${r.episodeTitle ? ' · ' + r.episodeTitle : ''}` : null))
  };
}

// The per-play media record Tautulli saved when the session ended. Same
// source/stream field names as a live session, so sessionDetail() maps it.
export async function playDetail(rowId) {
  if (!/^\d+$/.test(String(rowId))) throw new Error('bad row id');
  const s = await cmd('get_stream_data', { row_id: rowId });
  if (!s || typeof s !== 'object') throw new Error('no stream data for this play');
  return sessionDetail(s);
}

export async function userList() {
  const list = (await users()) || [];
  return list.filter((u) => Number(u.user_id) > 0 && u.is_active !== 0)
    .map((u) => ({ id: u.user_id, name: u.friendly_name || u.username || String(u.user_id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Home stats — map the NAME from the right field per stat type.
export async function homeStats(days = 30, count = 10) {
  const data = await cmd('get_home_stats', { time_range: days, stats_type: 0, stats_count: count });
  const list = Array.isArray(data) ? data : (data?.rows || []);
  const byId = {}; for (const b of list) byId[b.stat_id] = b.rows || [];
  const mapTitle = (rows) => (rows || []).map((r) => ({ name: r.title, total: r.total_plays || r.total_duration || 0, year: r.year, ratingKey: r.rating_key, thumb: r.thumb || '', kind: 'title' }));
  const mapUser = (rows) => (rows || []).map((r) => ({ name: r.friendly_name || r.user, total: r.total_plays || r.total_duration || 0, thumb: r.user_thumb || '', userId: r.user_id, kind: 'user' }));
  const mapPlatform = (rows) => (rows || []).map((r) => ({ name: r.platform || r.title || '?', total: r.total_plays || r.total_duration || 0, kind: 'platform' }));
  return {
    days,
    topMovies: mapTitle(byId['top_movies']),
    popularMovies: mapTitle(byId['popular_movies']),
    topTv: mapTitle(byId['top_tv']),
    popularTv: mapTitle(byId['popular_tv']),
    topUsers: mapUser(byId['top_users']),
    topPlatforms: mapPlatform(byId['top_platforms'])
  };
}

export default { test, users, resolveUserId, history, historyDays, activity, homeStats, historyQuery, summarize, playDetail, userList };
