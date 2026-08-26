// Tautulli — history + rich NOW WATCHING + home stats with correct name fields.
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`tautulli ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json?.response?.result !== 'success') throw new Error('tautulli: ' + (json?.response?.message || 'error'));
  return json.response.data;
}

export async function test() { const d = await cmd('get_server_info'); return { ok: true, server: d?.pms_name }; }
export const users = () => cmd('get_users');

export async function history(length = 300, userId) {
  const params = { length, order_column: 'date', order_dir: 'desc' };
  if (userId) params.user_id = userId;
  const data = await cmd('get_history', params);
  const rows = data?.data || [];
  return rows.map((r) => ({ title: r.full_title || r.title, type: r.media_type === 'episode' ? 'show' : r.media_type, grandparentTitle: r.grandparent_title, year: r.year, ratingKey: r.rating_key, watched: r.watched_status, percentComplete: r.percent_complete, date: r.date, user: r.friendly_name, userId: r.user_id }));
}
export async function historyDays(days = 30, userId, length = 600) {
  const rows = await history(length, userId);
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
        // video
        resolution: res || (s.video_resolution ? s.video_resolution + 'p' : ''),
        is4k,
        videoCodec: (s.stream_video_codec || s.video_codec || '').toUpperCase(),
        dynamicRange: s.video_dynamic_range || '',        // e.g. HDR / Dolby Vision / SDR
        // audio
        audioCodec: (s.stream_audio_codec || s.audio_codec || '').toUpperCase(),
        audioChannels: s.stream_audio_channel_layout || s.audio_channel_layout || (s.audio_channels ? s.audio_channels + 'ch' : ''),
        // decisions
        videoDecision: vDec, audioDecision: aDec, transcode: s.transcode_decision,
        container: (s.stream_container || s.container || '').toUpperCase(),
        bitrate: Number(s.stream_bitrate || s.bitrate || 0),
        bandwidth: Number(s.bandwidth || 0),
        // ids for poster matching
        ratingKey: s.rating_key, grandparentRatingKey: s.grandparent_rating_key
      };
    })
  };
}

// Home stats — map the NAME from the right field per stat type (fixes "—"
// platforms and user rows showing episode titles).
export async function homeStats(days = 30, count = 10) {
  const data = await cmd('get_home_stats', { time_range: days, stats_type: 0, stats_count: count });
  const list = Array.isArray(data) ? data : (data?.rows || []);
  const byId = {}; for (const b of list) byId[b.stat_id] = b.rows || [];
  const mapTitle = (rows) => (rows || []).map((r) => ({ name: r.title, total: r.total_plays || r.total_duration || 0, year: r.year, ratingKey: r.rating_key, thumb: r.thumb || '', kind: 'title' }));
  const mapUser = (rows) => (rows || []).map((r) => ({ name: r.friendly_name || r.user, total: r.total_plays || r.total_duration || 0, thumb: r.user_thumb || '', kind: 'user' }));
  const mapPlatform = (rows) => (rows || []).map((r) => ({ name: r.platform || r.title || '—', total: r.total_plays || r.total_duration || 0, kind: 'platform' }));
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

export default { test, users, history, historyDays, activity, homeStats };
