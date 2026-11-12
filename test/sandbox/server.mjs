// NickSeer UI sandbox.
//
// Serves the REAL public/ directory against stubbed API responses so the front
// end can be driven in a browser without touching the NAS container.
//
// This deliberately does NOT import server/index.js. That module calls
// startMonitoring() on boot, which dispatches real Telegram and Discord alerts
// using the live config — booting it locally is exactly what must not happen.
// Nothing here reads config/, opens a socket to Plex/Radarr/Sonarr, or sends a
// notification. It is a static file server plus a fixture table.
//
//   node test/sandbox/server.mjs [port]      # default 5099
//
// Fixtures are shaped to exercise the things that are hard to eyeball:
//   * ROWS x PER_ROW cards, so the old document-wide repaint loop would be
//     plainly visible as jank and the viewport-scoped one plainly is not.
//   * Deliberate same-title collisions (Dune 1984/2021, IT 1990/2017) with
//     DIFFERENT ratings, so a card painted from a title match instead of its
//     data-id shows the wrong number and the bug is visible rather than subtle.
//   * Posters are generated locally as SVG — no image.tmdb.org dependency, so
//     the sandbox works with no outbound network at all.

import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', '..', 'public');
const PORT = Number(process.argv[2] || 5099);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff2': 'font/woff2'
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ROWS = 8;
const PER_ROW = 30;

// [title, year, imdb, tmdb] — the pairs sharing a title carry different scores
// on purpose. Under the old title-keyed lookup both cards resolved to whichever
// was harvested last, so they rendered identical numbers.
const COLLIDERS = [
  ['Dune', '1984', 6.3, 6.2],
  ['Dune', '2021', 8.0, 7.8],
  ['IT', '1990', 6.9, 7.0],
  ['IT', '2017', 7.3, 7.2],
  ['The Lion King', '1994', 8.5, 8.3],
  ['The Lion King', '2019', 6.8, 7.1]
];

const FILLER = [
  'Queen of the South', 'Breaking Bad', 'The Bear', 'Severance', 'Andor',
  'Shogun', 'Fallout', 'The Last of Us', 'Arcane', 'Dark', 'Chernobyl',
  'True Detective', 'Mr Robot', 'Peaky Blinders', 'The Wire', 'Fargo',
  'Better Call Saul', 'Succession', 'The Boys', 'Barry', 'Ozark', 'Mindhunter'
];

let nextId = 1000;
const byId = new Map();

// Latency knobs, so the things that only show up on a real network are
// visible here: the detail sheet's instant shell, and the AI tab's two phases.
//   node test/sandbox/server.mjs 5099 --detail-delay=900 --ai-pending=8000
const argNum = (name, dflt) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? Number(a.split('=')[1]) : dflt; };
const DETAIL_DELAY_MS = argNum('detail-delay', 900);
const AI_PENDING_MS = argNum('ai-pending', 8000);
// Slow Home (/api/discover/home + /rows), to reproduce typing into search while Home
// is still loading behind it: --home-delay=4000
const HOME_DELAY_MS = argNum('home-delay', 0);
let aiFirstSeen = 0;
const apiHits = { detail: 0 };

// Mutable so the Settings integrations panel can be tested end to end.
const secrets = {
  apiKey: 'SANDBOX-api-key-0000000000',
  webhookSecret: 'SANDBOX-webhook-secret-111'
};

function makeItem(title, year, imdb, tmdb, media = 'movie') {
  const id = nextId++;
  const it = {
    id, media, title, year,
    poster: `/sandbox-poster/${id}.svg`,
    backdrop: `/sandbox-poster/${id}.svg`,
    rating: tmdb,
    overview: `${title} (${year}) — sandbox fixture.`,
    imdbRating: imdb,
    imdbUrl: `https://www.imdb.com/find/?q=${encodeURIComponent(title)}`
  };
  byId.set(String(id), it);
  return it;
}

const rows = [];
for (let r = 0; r < ROWS; r++) {
  const items = [];
  // Every row leads with the colliding titles so they are on screen immediately.
  for (const [t, y, i, m] of COLLIDERS) items.push(makeItem(t, y, i, m));
  for (let n = items.length; n < PER_ROW; n++) {
    const title = FILLER[n % FILLER.length];
    const year = String(2005 + ((n * 3) % 20));
    // A third of the filler has no IMDb rating, to exercise the card fallback.
    const imdb = n % 3 === 0 ? null : Math.round((5.5 + (n % 45) / 10) * 10) / 10;
    const tmdb = Math.round((5.0 + (n % 50) / 10) * 10) / 10;
    items.push(makeItem(`${title}`, year, imdb, tmdb, n % 4 === 0 ? 'tv' : 'movie'));
  }
  rows.push({ title: `Sandbox Row ${r + 1}`, items });
}

const allItems = rows.flatMap((r) => r.items);

function poster(id) {
  const it = byId.get(String(id));
  const label = it ? it.title : 'poster';
  const year = it ? it.year : '';
  const hue = (Number(id) * 37) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 342 513">
  <rect width="342" height="513" fill="hsl(${hue},45%,22%)"/>
  <circle cx="171" cy="200" r="90" fill="hsl(${hue},55%,38%)"/>
  <text x="171" y="400" font-family="sans-serif" font-size="22" font-weight="700"
        fill="#fff" text-anchor="middle">${escapeXml(label)}</text>
  <text x="171" y="432" font-family="sans-serif" font-size="18"
        fill="#ffffffaa" text-anchor="middle">${year}</text>
</svg>`;
}

// Live Streaming fixtures, in the shape tautulli.activity() returns. The
// playing sessions advance with wall-clock time so the detail sheet's live
// progress can be watched moving between polls.
const LIVE_T0 = Date.now();
function liveNow() {
  const mv = allItems.find((i) => i.media === 'movie');
  const ep = allItems.find((i) => i.media === 'tv');
  const elapsed = Date.now() - LIVE_T0;
  const base = (it, o) => ({
    title: it.title, year: it.year, poster: it.poster, backdrop: it.backdrop,
    tmdbId: it.id, media: it.media, ...o,
    progress: Math.round((o.detail.viewOffset / o.detail.duration) * 100)
  });
  const det = (o) => ({
    summary: 'Sandbox summary from Plex.', tagline: '', contentRating: 'PG-13', studio: 'Sandbox Studios',
    released: '2010-11-19', genres: ['Adventure', 'Fantasy'], directors: ['Jane Director'],
    season: 0, episode: 0, episodeTitle: '', userThumb: '', transcodeProgress: 0,
    subtitle: { on: false, decision: '', codec: '', language: '', forced: false, outCodec: '' },
    transcode: { decision: 'direct play', speed: '', throttled: false, hwRequested: false, hwDecode: false, hwEncode: false, hwDecodeTitle: '', hwEncodeTitle: '' },
    ...o
  });
  return {
    count: 3, totalBandwidth: 112400,
    sessions: [
      base(mv, {
        user: 'NickLn', grandparent: '', type: 'movie', state: 'playing', sessionKey: '41',
        player: 'SHIELD Android TV', device: 'Android', resolution: '4k', is4k: true,
        videoCodec: 'HEVC', dynamicRange: 'HDR10', audioCodec: 'AAC', audioChannels: '5.1',
        videoDecision: 'transcode', audioDecision: 'transcode', transcode: 'transcode', container: 'MKV', bandwidth: 89600,
        detail: det({
          duration: 8760000, viewOffset: 3700000 + elapsed, transcodeProgress: 61,
          file: { name: 'Sandbox Movie (2010) {imdb-tt0000000} [Remux-2160p][HDR10][TrueHD Atmos 7.1].mkv', size: 64424509440, container: 'MKV', bitrate: 58800, streamContainer: 'MKV', streamBitrate: 40000, qualityProfile: '40 Mbps 4K', optimized: false, synced: false },
          video: { decision: 'transcode',
            src: { codec: 'HEVC', profile: 'main 10', level: '153', width: 3840, height: 2160, resolution: '4k', bitrate: 53000, bitDepth: 10, fps: '23.976', dynamicRange: 'HDR10', scan: 'progressive', aspect: '2.39', chroma: '4:2:0', primaries: 'bt2020', colorSpace: 'bt2020nc', trc: 'smpte2084' },
            out: { codec: 'HEVC', width: 3840, height: 2160, resolution: '4k', bitrate: 37200, bitDepth: 10, fps: '23.976', dynamicRange: 'HDR10' } },
          audio: { decision: 'transcode',
            src: { codec: 'TRUEHD', profile: 'atmos', channels: 8, layout: '7.1', bitrate: 5200, sampleRate: 48000, language: 'English' },
            out: { codec: 'AAC', channels: 6, layout: '5.1', bitrate: 640, language: 'English' } },
          subtitle: { on: true, decision: 'burn', codec: 'PGS', language: 'English', forced: true, outCodec: '' },
          transcode: { decision: 'transcode', speed: '1.8', throttled: false, hwRequested: true, hwDecode: true, hwEncode: true, hwDecodeTitle: 'NVDEC', hwEncodeTitle: 'NVENC' },
          player: { name: 'SHIELD Android TV', product: 'Plex for Android (TV)', productVersion: '10.18.0.1150', platform: 'Android', platformVersion: '11', device: 'SHIELD Android TV', ip: '192.168.1.40', location: 'lan', local: true, secure: true, relayed: false, bandwidth: 89600 }
        })
      }),
      base(ep, {
        user: 'Maria', grandparent: ep.title, title: 'The Long Night', type: 'episode', state: 'playing', sessionKey: '42',
        player: 'Living Room', device: 'tvOS', resolution: '1080', is4k: false,
        videoCodec: 'H264', dynamicRange: 'SDR', audioCodec: 'EAC3', audioChannels: '5.1',
        videoDecision: 'direct play', audioDecision: 'direct play', transcode: 'direct play', container: 'MKV', bandwidth: 11200,
        detail: det({
          duration: 3420000, viewOffset: 600000 + elapsed, season: 2, episode: 5, episodeTitle: 'The Long Night',
          file: { name: 'Sandbox Show - S02E05 - The Long Night [WEBDL-1080p].mkv', size: 3221225472, container: 'MKV', bitrate: 7400, streamContainer: 'MKV', streamBitrate: 7400, qualityProfile: 'Original', optimized: false, synced: false },
          video: { decision: 'direct play',
            src: { codec: 'H264', profile: 'high', level: '41', width: 1920, height: 1080, resolution: '1080p', bitrate: 6600, bitDepth: 8, fps: '24', dynamicRange: 'SDR', scan: 'progressive', aspect: '1.78', chroma: '4:2:0', primaries: 'bt709', colorSpace: 'bt709', trc: 'bt709' },
            out: { codec: 'H264', width: 1920, height: 1080, resolution: '1080p', bitrate: 6600, bitDepth: 8, fps: '24', dynamicRange: 'SDR' } },
          audio: { decision: 'direct play',
            src: { codec: 'EAC3', profile: '', channels: 6, layout: '5.1(side)', bitrate: 640, sampleRate: 48000, language: 'English' },
            out: { codec: 'EAC3', channels: 6, layout: '5.1(side)', bitrate: 640, language: 'English' } },
          player: { name: 'Living Room', product: 'Plex for Apple TV', productVersion: '8.40', platform: 'tvOS', platformVersion: '18.1', device: 'Apple TV', ip: '86.12.40.7', location: 'wan', local: false, secure: true, relayed: false, bandwidth: 11200 }
        })
      }),
      base(mv, {
        user: 'Guest', grandparent: '', type: 'movie', state: 'buffering', sessionKey: '43',
        player: 'iPhone', device: 'iOS', resolution: '720', is4k: false,
        videoCodec: 'H264', dynamicRange: 'SDR', audioCodec: 'AAC', audioChannels: 'stereo',
        videoDecision: 'transcode', audioDecision: 'copy', transcode: 'transcode', container: 'MPEGTS', bandwidth: 3600,
        detail: det({
          duration: 8760000, viewOffset: 120000, transcodeProgress: 3,
          file: { name: 'Sandbox Movie (2010) [Remux-2160p].mkv', size: 64424509440, container: 'MKV', bitrate: 58800, streamContainer: 'MPEGTS', streamBitrate: 3000, qualityProfile: '3 Mbps 720p', optimized: false, synced: false },
          video: { decision: 'transcode',
            src: { codec: 'HEVC', profile: 'main 10', level: '153', width: 3840, height: 2160, resolution: '4k', bitrate: 53000, bitDepth: 10, fps: '23.976', dynamicRange: 'HDR10', scan: 'progressive', aspect: '2.39', chroma: '4:2:0', primaries: 'bt2020', colorSpace: 'bt2020nc', trc: 'smpte2084' },
            out: { codec: 'H264', width: 1280, height: 536, resolution: '720p', bitrate: 2800, bitDepth: 8, fps: '23.976', dynamicRange: 'SDR' } },
          audio: { decision: 'copy',
            src: { codec: 'AAC', profile: 'lc', channels: 2, layout: 'stereo', bitrate: 192, sampleRate: 48000, language: 'English' },
            out: { codec: 'AAC', channels: 2, layout: 'stereo', bitrate: 192, language: 'English' } },
          transcode: { decision: 'transcode', speed: '0.9', throttled: false, hwRequested: true, hwDecode: false, hwEncode: true, hwDecodeTitle: '', hwEncodeTitle: 'NVENC' },
          player: { name: 'iPhone', product: 'Plex for iOS', productVersion: '2024.20', platform: 'iOS', platformVersion: '18.0', device: 'iPhone', ip: '10.8.0.6', location: 'wan', local: false, secure: true, relayed: true, bandwidth: 3600 }
        })
      })
    ]
  };
}


// Live › History / Stats drill-down fixtures, in RAW Tautulli shape and fed
// through the real mappers in server/services/tautulli.js (pure functions; the
// module only reads config when a Tautulli call is made, which never happens
// here). Covers every transcode cause the analysis sheet explains.
const TAUT = await import('../../server/services/tautulli.js');
const H_USERS = [[11, 'alex'], [12, 'NickLn'], [13, 'Maria'], [14, 'Guest']];
const H_PLAYERS = [['webOS', 'LG OLED65C1', 'Plex for LG'], ['Tizen', 'Samsung TV', 'Plex for Samsung'], ['Android', 'Pixel 8', 'Plex for Android'], ['iOS', 'iPhone', 'Plex for iOS'], ['Chrome', 'Chrome', 'Plex Web'], ['tvOS', 'Apple TV', 'Plex for Apple TV'], ['Roku', 'Roku Ultra', 'Plex for Roku'], ['Xbox', 'Xbox Series X', 'Plex for Xbox'], ['Windows', 'PC', 'Plex for Windows'], ['Playstation', 'PS5', 'Plex for PlayStation']];
// [video_decision, audio_decision, transcode_decision, extra raw stream fields]
const H_PROFILES = [
  ['direct play', 'direct play', 'direct play', {}],
  ['copy', 'copy', 'copy', { stream_container: 'mpegts' }],
  ['transcode', 'copy', 'transcode', { subtitles: 1, subtitle_codec: 'pgs', stream_subtitle_decision: 'burn', stream_video_codec: 'h264', stream_video_full_resolution: '1080p', video_full_resolution: '1080p', video_codec: 'h264' }],
  ['transcode', 'direct play', 'transcode', { quality_profile: '4 Mbps 720p', stream_video_codec: 'h264', stream_video_full_resolution: '720p', stream_video_bitrate: 3600, transcode_hw_decoding: 1, transcode_hw_encoding: 1 }],
  ['transcode', 'transcode', 'transcode', { stream_video_codec: 'h264', stream_video_dynamic_range: 'SDR', stream_audio_codec: 'aac', stream_audio_channels: 2 }],
  ['direct play', 'transcode', 'transcode', { audio_codec: 'truehd', audio_channels: 8, stream_audio_codec: 'eac3', stream_audio_channels: 6 }]
];
const H_NOW = Math.floor(Date.now() / 1000);
const H_RAW = [];
const H_STREAM = new Map();
for (let i = 0; i < 140; i++) {
  const ep = i % 3 !== 0;
  const it = allItems.filter((x) => x.media === (ep ? 'tv' : 'movie'))[i % 7];
  const [uid, uname] = H_USERS[i % H_USERS.length];
  const [platform, player, product] = H_PLAYERS[(i * 7) % H_PLAYERS.length];
  const [vd, ad, td, extra] = H_PROFILES[(i * 5) % H_PROFILES.length];
  const date = H_NOW - i * 5 * 3600 - 1200;
  const dur = ep ? 2400 + (i % 5) * 120 : 6000 + (i % 4) * 600;
  const rowId = 9000 + i;
  H_RAW.push({
    row_id: rowId, date, started: date, stopped: date + dur + 300, duration: dur, play_duration: dur, paused_counter: i % 4 ? 300 : 0,
    user_id: uid, friendly_name: uname, platform, player, product, ip_address: i % 4 === 3 ? '86.12.40.7' : '192.168.1.' + (20 + (i % 9)),
    location: i % 4 === 3 ? 'wan' : 'lan', secure: 1, relayed: 0,
    media_type: ep ? 'episode' : 'movie', rating_key: 500 + i, grandparent_rating_key: ep ? 100 + (i % 7) : '',
    title: ep ? `Episode ${(i % 10) + 1}` : it.title, grandparent_title: ep ? it.title : '', full_title: it.title,
    year: it.year, media_index: (i % 10) + 1, parent_media_index: (i % 3) + 1,
    transcode_decision: td, percent_complete: 40 + ((i * 13) % 61), watched_status: i % 3 ? 1 : 0
  });
  H_STREAM.set(String(rowId), {
    container: 'mkv', bitrate: 24000, video_codec: 'hevc', video_full_resolution: '4k', video_width: 3840, video_height: 2160, video_bitrate: 22000,
    video_dynamic_range: 'HDR10', video_framerate: '24p', audio_codec: 'eac3', audio_channels: 6, audio_bitrate: 640,
    stream_container: 'mkv', stream_bitrate: td === 'transcode' ? 8000 : 24000, stream_video_decision: vd, stream_audio_decision: ad,
    stream_video_codec: 'hevc', stream_video_full_resolution: '4k', stream_video_bitrate: td === 'transcode' ? 7400 : 22000, stream_video_dynamic_range: 'HDR10',
    stream_audio_codec: 'eac3', stream_audio_channels: 6, quality_profile: 'Original', transcode_decision: td, ...extra
  });
}
function liveHistory(url) {
  const q = url.searchParams;
  const after = H_NOW - Number(q.get('days') || 30) * 86400;
  const rows = H_RAW.filter((r) => r.date >= after
    && (!q.get('user') || String(r.user_id) === q.get('user'))
    && (!q.get('ratingKey') || String(r.rating_key) === q.get('ratingKey'))
    && (!q.get('showKey') || String(r.grandparent_rating_key) === q.get('showKey'))
    && (!q.get('media') || r.media_type === q.get('media'))
    && (!q.get('decision') || r.transcode_decision === q.get('decision'))).map(TAUT.historyRow);
  const posterOf = (name) => allItems.find((x) => x.title === name);
  const decorate = (r) => { const m = posterOf(r.title || r.name); return { ...r, poster: m?.poster || null, tmdbId: m?.id || null, tmdbMedia: m?.media || null, backdrop: m?.backdrop || null }; };
  const start = Number(q.get('start') || 0), length = Number(q.get('length') || 50);
  const out = { total: rows.length, rows: rows.slice(start, start + length).map(decorate) };
  if (q.get('summary') === '1') {
    out.summary = TAUT.summarize(rows);
    out.summary.titleCount = out.summary.titles.length;
    out.summary.titles = out.summary.titles.slice(0, 12).map(decorate);
  }
  return out;
}
function liveStats() {
  const mv = allItems.filter((x) => x.media === 'movie').slice(0, 7);
  const tv = allItems.filter((x) => x.media === 'tv').slice(0, 7);
  return {
    days: 30,
    topMovies: mv.map((m, i) => ({ name: m.title, total: 7 - i, year: m.year, ratingKey: H_RAW.find((r) => r.media_type === 'movie' && r.title === m.title)?.rating_key || null, poster: m.poster, id: m.id, media: 'movie' })),
    topTv: tv.map((m, i) => ({ name: m.title, total: 30 - i * 3, year: m.year, ratingKey: 100 + i, poster: m.poster, id: m.id, media: 'tv' })),
    // One working avatar, one broken link (initial must take over), two without.
    topUsers: H_USERS.map(([id, name], i) => ({ name, total: 50 - i * 9, userId: id, thumb: i === 0 ? 'http://localhost:5099/sandbox-poster/1003.svg' : i === 1 ? 'http://localhost:5099/missing-avatar.png' : '' })),
    topPlatforms: H_PLAYERS.map(([p], i) => ({ name: p, total: 90 - i * 8 }))
  };
}


// Title modal › In Library fixtures, in RAW Plex /library/metadata shape and
// fed through the real mapItem/mapShow in server/services/plex.js (pure; the
// module only reads config when it actually calls Plex). Movie keys alternate
// between a single 4K DV remux (image + text + external subs, TrueHD) and a
// two-version title (4K HEVC + 1080p H.264). Episode keys are 8xxxxxx.
const PLEX = await import('../../server/services/plex.js');
const pStream = (type, o) => ({ streamType: type, ...o });
function plexMovie(key, title) {
  const remux = {
    id: 1, videoResolution: '4k', width: 3840, height: 1608, bitrate: 58200, container: 'mkv', duration: 7020000,
    videoCodec: 'hevc', audioCodec: 'truehd', audioChannels: 8, videoFrameRate: '24p', aspectRatio: 2.39,
    Part: [{ file: `/data/media/movies/${title} (2019)/${title} (2019) [Remux-2160p][DV HDR10][TrueHD Atmos 7.1].mkv`, size: 51539607552, container: 'mkv', duration: 7020000,
      Stream: [
        pStream(1, { codec: 'hevc', profile: 'main 10', width: 3840, height: 1608, bitrate: 52000, bitDepth: 10, frameRate: 23.976, DOVIPresent: true, DOVIProfile: 8, colorTrc: 'smpte2084', colorPrimaries: 'bt2020', chromaSubsampling: '4:2:0', scanType: 'progressive', displayTitle: '4K DoVi/HDR10 (HEVC Main 10)' }),
        pStream(2, { codec: 'truehd', profile: 'atmos', channels: 8, audioChannelLayout: '7.1', bitrate: 5100, samplingRate: 48000, language: 'English', languageCode: 'eng', default: true, title: 'Dolby TrueHD Atmos' }),
        pStream(2, { codec: 'ac3', channels: 6, audioChannelLayout: '5.1(side)', bitrate: 640, language: 'English', languageCode: 'eng', title: 'Compatibility' }),
        pStream(2, { codec: 'eac3', channels: 6, audioChannelLayout: '5.1(side)', bitrate: 768, language: 'Greek', languageCode: 'ell' }),
        pStream(3, { codec: 'pgs', language: 'English', languageCode: 'eng', default: true }),
        pStream(3, { codec: 'pgs', language: 'English', languageCode: 'eng', forced: true, title: 'Forced' }),
        pStream(3, { codec: 'srt', language: 'English', languageCode: 'eng', hearingImpaired: true, title: 'SDH' }),
        pStream(3, { codec: 'srt', language: 'Greek', languageCode: 'ell', key: '/library/streams/991' }),
        pStream(3, { codec: 'ass', language: 'Spanish', languageCode: 'spa' })
      ] }]
  };
  const hd = {
    id: 2, videoResolution: '1080', width: 1920, height: 800, bitrate: 9800, container: 'mp4', duration: 7020000,
    videoCodec: 'h264', audioCodec: 'aac', audioChannels: 2, videoFrameRate: '24p', aspectRatio: 2.39,
    Part: [{ file: `C:\\Media\\Movies\\${title} (2019)\\${title} (2019) [WEBDL-1080p].mp4`, size: 8589934592, container: 'mp4', duration: 7020000, optimizedForStreaming: 1,
      Stream: [
        pStream(1, { codec: 'h264', profile: 'high', width: 1920, height: 800, bitrate: 9400, bitDepth: 8, frameRate: 23.976, colorPrimaries: 'bt709' }),
        pStream(2, { codec: 'aac', profile: 'lc', channels: 2, audioChannelLayout: 'stereo', bitrate: 256, language: 'English', default: true }),
        pStream(3, { codec: 'mov_text', language: 'English' })
      ] }]
  };
  const two = Number(key) % 2 === 0;
  return { ratingKey: String(key), type: 'movie', title, year: 2019, librarySectionTitle: 'Movies', addedAt: 1730000000, viewCount: two ? 0 : 3, lastViewedAt: two ? 0 : 1761000000, Media: two ? [remux, hd] : [remux] };
}
function plexEpisode(key) {
  const s = Math.floor((key - 8000000) / 100), e = (key - 8000000) % 100;
  return {
    ratingKey: String(key), type: 'episode', title: `Episode ${e}`, grandparentTitle: 'Sandbox Show', parentIndex: s, index: e, parentTitle: `Season ${s}`,
    librarySectionTitle: 'TV Shows', addedAt: 1730000000 + key, viewCount: e < 4 ? 1 : 0, duration: 2700000,
    Media: [{ id: key, videoResolution: s === 1 ? '1080' : '4k', width: s === 1 ? 1920 : 3840, height: s === 1 ? 1080 : 2160, bitrate: s === 1 ? 6200 : 18400, container: 'mkv', duration: 2700000,
      videoCodec: s === 1 ? 'h264' : 'hevc', audioCodec: 'eac3', audioChannels: 6,
      Part: [{ file: `/data/tv/Sandbox Show/Season ${s}/Sandbox Show - S0${s}E${String(e).padStart(2, '0')}.mkv`, size: s === 1 ? 2147483648 : 6442450944, container: 'mkv',
        Stream: [
          pStream(1, { codec: s === 1 ? 'h264' : 'hevc', width: 1920, height: 1080, bitDepth: s === 1 ? 8 : 10, colorTrc: s === 1 ? 'bt709' : 'smpte2084' }),
          pStream(2, { codec: 'eac3', channels: 6, audioChannelLayout: '5.1(side)', language: 'English', default: true }),
          pStream(3, { codec: 'srt', language: 'English', key: '/library/streams/' + key }),
          pStream(3, { codec: 'srt', language: 'Greek' })
        ] }] }]
  };
}
function libItem(key) {
  const k = Number(key);
  if (k >= 8000000) return PLEX.mapItem(plexEpisode(k));
  const rec = byId.get(String(k - 7000000));
  return PLEX.mapItem(plexMovie(k, rec ? rec.title : 'Sandbox Movie'));
}
function libShow(key) {
  const rec = byId.get(String(Number(key) - 7000000));
  const leaves = [];
  for (const s of [1, 2]) for (let e = 1; e <= (s === 1 ? 8 : 6); e++) leaves.push(plexEpisode(8000000 + s * 100 + e));
  // allLeaves carries no Streams — strip them like Plex does.
  const bare = leaves.map((l) => ({ ...l, Media: l.Media.map((m) => ({ ...m, Part: m.Part.map(({ Stream, ...p }) => p) })) }));
  return PLEX.mapShow({ ratingKey: String(key), type: 'show', title: rec ? rec.title : 'Sandbox Show', year: 2020, librarySectionTitle: 'TV Shows', addedAt: 1730000000, viewedLeafCount: 6 }, bare);
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

// ---------------------------------------------------------------------------
// Stubbed API
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Optional auth simulation (off by default, so every older test is unchanged).
//   GET /api/sandbox/auth?mode=on&plexAs=maria   turn login on; the fake Plex
//                                                approves as that account
//   GET /api/sandbox/auth?mode=off
// The fake Plex "authUrl" is just forwardUrl, i.e. it bounces straight back to
// the app exactly as app.plex.tv does after approval — which is the half of
// the phone flow the real sign-in loop lived in. Tokens are `sb:<username>`.
// ---------------------------------------------------------------------------
const SB_USERS = [
  { username: 'nick', role: 'admin', plex: true },
  { username: 'maria', role: 'user', plex: true },
  { username: 'kostas', role: 'user', plex: false }
];
const sbAuth = { on: false, plexAs: 'maria', pin: 4200, checks: 0 };
function sbViewer(req) {
  const m = /^Bearer\s+sb:(.+)$/i.exec(req?.headers?.authorization || '');
  return m ? SB_USERS.find((u) => u.username === m[1]) || null : null;
}
const sbDeploy = { n: 0 };
const sbSeen = { statusAuth: [] };
function sbApi(pathname, url, body, req) {
  if (pathname === '/api/sandbox/deploy') { sbDeploy.n++; return { deploy: sbDeploy.n }; }
  if (pathname === '/api/sandbox/seen') return sbSeen;
  if (pathname === '/api/discover/media-status') sbSeen.statusAuth.push(req?.headers?.authorization || '');
  if (pathname === '/api/sandbox/auth') {
    if (url.searchParams.has('mode')) sbAuth.on = url.searchParams.get('mode') === 'on';
    if (url.searchParams.get('plexAs')) sbAuth.plexAs = url.searchParams.get('plexAs');
    return { ...sbAuth };
  }
  if (!sbAuth.on) return undefined;
  const me = sbViewer(req);
  const pub = (u) => ({ username: u.username, name: u.username, role: u.role });
  if (pathname === '/api/public/bootstrap') {
    return { auth: { enabled: true, hasAdmin: true, plexLogin: true, approvals: false }, me: me ? { ok: true, user: pub(me) } : { ok: false }, health: { configured: true }, isAdmin: me?.role === 'admin' };
  }
  if (pathname === '/api/auth/status') return { enabled: true, hasAdmin: true, plexLogin: true, approvals: false };
  if (pathname === '/api/auth/me') return me ? { ok: true, user: pub(me) } : { ok: false };
  if (pathname === '/api/auth/profiles') {
    const vis = !me ? [] : me.role === 'admin' ? SB_USERS : [me];
    return { ok: true, profiles: vis.map((u) => ({ id: u.username, name: u.username, thumb: '', isAccount: true, plex: u.plex, role: u.role })) };
  }
  if (pathname === '/api/auth/plex/pin') {
    const id = ++sbAuth.pin, state = 'st' + id;
    const f = new URL(body?.forwardUrl || `http://127.0.0.1:${PORT}/`);
    f.searchParams.set('plexpin', String(id)); f.searchParams.set('plexstate', state);
    return { ok: true, id, code: 'sandbox', state, authUrl: f.toString() };
  }
  if (pathname.startsWith('/api/auth/plex/check/')) {
    sbAuth.checks++;
    const id = pathname.split('/').pop();
    if (url.searchParams.get('state') !== 'st' + id) return { __status: 403, ok: false, error: 'Sign-in link is not valid — start again.' };
    const u = SB_USERS.find((x) => x.username === sbAuth.plexAs) || SB_USERS[1];
    return { ok: true, pending: false, token: 'sb:' + u.username, user: { username: u.username, role: u.role } };
  }
  if (pathname === '/api/settings/users' && me?.role !== 'admin') return { error: 'admin access required' };
  return undefined;
}

function api(pathname, url, body, req) {
  const sb = sbApi(pathname, url, body, req);
  if (sb !== undefined) return sb;
  // Auth is reported as disabled so ensureAuth() short-circuits and the app
  // paints the real home view instead of the login overlay.
  if (pathname === '/api/public/bootstrap') {
    return {
      auth: { enabled: false },
      me: { ok: true, user: { username: 'Sandbox', name: 'Sandbox', role: 'admin' } },
      health: { configured: true },
      isAdmin: true
    };
  }
  // login-enhance.js's getMe() returns r.user and app.js reads .username off it.
  if (pathname === '/api/auth/me') return { ok: true, user: { username: 'Sandbox', name: 'Sandbox', role: 'admin' } };
  if (pathname === '/api/auth/profiles') return { profiles: [{ id: 'Sandbox', name: 'Sandbox', username: 'Sandbox', role: 'admin' }] };
  if (pathname === '/api/status') return { ok: true, services: [] };
  // Request counter, to prove prefetch + click share ONE detail request.
  if (pathname === '/api/sandbox/hits') return apiHits;
  if (pathname === '/api/discover/home') return { rows, cold: false };
  if (pathname === '/api/discover/rows') return { rows };
  // renderCategory() reads trend.movies / trend.tv, and the IMDb rail is a
  // Top *250* — the Movies/TV tabs are far heavier than Home, which is where
  // Nick reports the page seizing up. Match that shape.
  if (pathname === '/api/discover/trending') {
    return { movies: allItems.slice(0, 40), tv: allItems.slice(40, 80), items: allItems.slice(0, 40) };
  }
  if (pathname === '/api/discover/imdb-top') {
    const pool = [];
    while (pool.length < 250) pool.push(...allItems);
    return { items: pool.slice(0, 250) };
  }
  if (pathname === '/api/discover/boxoffice') return { items: allItems.slice(0, 20) };
  // The real route returns a bare array of mini items, filtered by the query.
  if (pathname === '/api/discover/search') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const hits = allItems.filter((it) => (it.title || '').toLowerCase().includes(q)).slice(0, 20);
    // A title TMDB has no poster for, so the no-artwork card is visible.
    if (q.length >= 2 && 'gemini'.includes(q)) hits.splice(1, 0, { id: 990001, media: 'movie', title: 'Gemini', year: '2022', poster: null, backdrop: null, rating: 7.7 });
    return hits;
  }

  if (pathname === '/api/discover/media-status') {
    const statuses = {};
    for (const it of body?.items || []) {
      // Roughly a third in library, a sixth requested.
      if (it.id % 3 === 0) statuses[it.id] = { status: 'in_library', label: 'In library' };
      else if (it.id % 6 === 1) statuses[it.id] = { status: 'requested', label: 'Requested' };
    }
    return { statuses };
  }

  if (pathname === '/api/discover/imdb-ratings') {
    const ratings = {}, urls = {};
    for (const it of body?.items || []) {
      const rec = byId.get(String(it.id));
      ratings[String(it.id)] = rec ? rec.imdbRating : null;
      if (rec && rec.imdbRating != null) urls[String(it.id)] = rec.imdbUrl;
    }
    return { ratings, urls };
  }

  // Two-phase AI Suggestions: rule-based + pending for the first AI_PENDING_MS
  // after the first request, then the "AI-ranked" list (reversed, with reasons)
  // so the swap is visible. ?reset=1 restarts the clock.
  if (pathname === '/api/discover/ai-suggest') {
    if (url.searchParams.get('reset') === '1') aiFirstSeen = 0;
    if (!aiFirstSeen) aiFirstSeen = Date.now();
    const pending = Date.now() - aiFirstSeen < AI_PENDING_MS;
    const base = allItems.slice(0, 24);
    const items = pending ? base : base.slice().reverse().map((it) => ({ ...it, why: 'Sandbox AI reason' }));
    return { source: pending ? 'rules' : 'ai', days: 60, basedOn: ['Dune', 'Severance'], items, pending, aiConfigured: true, tuning: { historyDays: 60 } };
  }

  const libm = pathname.match(/^\/api\/discover\/library\/(item|show)\/(\d+)$/);
  if (libm) return libm[1] === 'show' ? libShow(libm[2]) : libItem(libm[2]);

  const detail = pathname.match(/^\/api\/discover\/(movie|tv)\/(\d+)$/);
  if (detail) {
    const rec = byId.get(detail[2]);
    if (!rec) return { error: 'not found' };
    return {
      ...rec,
      runtime: 118,
      genres: ['Drama', 'Thriller', 'Crime'],
      // Opt-in (--trailers): embeds a real YouTube iframe, so it needs network.
      trailerKey: process.argv.includes('--trailers') ? 'aqz-KE-bpKQ' : null,
      inLibrary: Number(detail[2]) % 3 === 0,
      libraryKey: Number(detail[2]) % 3 === 0 ? String(7000000 + Number(detail[2])) : null,
      plexUrl: Number(detail[2]) % 3 === 0 ? 'https://app.plex.tv/desktop' : null,
      streamingService: Number(detail[2]) % 3 === 0 ? { key: 'paramount', name: 'Paramount+' } : null,
      isRequested: false,
      seriesStatus: detail[1] === 'tv' ? 'ended' : null,
      // Real cast shape (name/photo/character). Every fourth has no headshot so
      // the initials placeholder is exercised alongside photos.
      cast: allItems.slice(0, 14).map((c, i) => ({ id: 9000 + i, name: c.title, photo: i % 4 === 3 ? null : c.poster, character: i === 2 ? 'Sergeant Davis Tubbs the Second' : `Role ${i}`, job: 'Actor' })),
      recommendations: allItems.slice(20, 50),
      similar: allItems.slice(50, 80),
      productionCountries: [{ iso_31661: 'US', name: 'United States' }]
    };
  }

  if (pathname === '/api/discover/live/now') return liveNow();
  if (pathname === '/api/discover/live/stats') return liveStats();
  if (pathname === '/api/discover/live/history') return liveHistory(url);
  if (pathname === '/api/discover/live/users') return { users: H_USERS.map(([id, name]) => ({ id, name })) };
  if (pathname.startsWith('/api/discover/live/play/')) { const raw = H_STREAM.get(pathname.split('/').pop()); return raw ? { detail: TAUT.sessionDetail(raw) } : { error: 'no stream data for this play' }; }

  if (pathname.startsWith('/api/discover/person/')) return { ...allItems[0], knownFor: allItems.slice(0, 20) };
  if (pathname === '/api/request/options') return { profiles: [], rootFolders: [], tags: [] };
  if (pathname === '/api/settings/users') return { users: [] };

  // Requests tab — one of every kind the audit log can now produce, including
  // the Discord-as-admin case behind the unexplained additions.
  if (pathname === '/api/requests') {
    const h = 3600e3, now = Date.now();
    return { ok: true, admin: true, requests: [
      { id: 'r1', status: 'pending', media: 'movie', tmdbId: 603, title: 'The Matrix', by: 'maria', byRole: 'user', source: 'app', at: now - 1 * h },
      { id: 'r2', status: 'approved', decidedBy: 'auto', result: 'added', media: 'movie', tmdbId: 550, title: 'Fight Club', by: 'nick', byRole: 'admin', source: 'discord', external: '1', at: now - 2 * h },
      { id: 'r3', status: 'approved', decidedBy: 'auto', result: 'added', media: 'movie', tmdbId: 11, title: 'Star Wars', by: 'nick', byRole: 'admin', source: 'collection', collection: 'Star Wars Collection', at: now - 3 * h },
      { id: 'r4', status: 'failed', decidedBy: 'auto', result: 'failed', media: 'tv', tmdbId: 1399, title: 'Game of Thrones', by: 'Requestrr Bot', byRole: 'external', source: 'discord', external: null, error: 'Sonarr: root folder missing', at: now - 4 * h },
      { id: 'r5', status: 'approved', decidedBy: 'nick', media: 'tv', tmdbId: 1396, title: '<img src=x onerror=alert(1)>', by: '<b>eve</b>', byRole: 'user', source: 'app', at: now - 5 * h },
      { id: 'r6', status: 'declined', decidedBy: 'nick', media: 'movie', tmdbId: 1, title: 'Declined Movie', by: 'maria', byRole: 'user', source: 'app', at: now - 6 * h }
    ]};
  }

  // Settings pane fixtures. Shape mirrors config.js DEFAULTS (post-redacted()),
  // enough for renderTab() to build every pane without throwing.
  if (pathname === '/api/settings') {
    return {
      configured: true,
      app: { name: 'NickSeer', theme: 'dark' },
      services: {
        plex: { url: 'http://plex.local:32400', token: '••••••••abcd' },
        tautulli: { url: '', apikey: '' },
        radarr: { url: '', apikey: '', qualityProfileId: null, rootFolder: '' },
        sonarr: { url: '', apikey: '', qualityProfileId: null, rootFolder: '' },
        sabnzbd: { url: '', apikey: '' },
        gluetun: { url: '', apikey: '', username: '', password: '' },
        // Deliberately blank, so the pane exercises the "falls back to the
        // generated key" branch.
        overseerr: { apikey: '' }
      },
      tmdb: { apiKey: '••••••••1234', readToken: '', region: 'GR', language: 'en-US' },
      omdb: { apiKey: '' },
      imdb: { movieListId: '8647021', tvListId: '' },
      boxoffice: { source: 'bom', area: '' },
      ai: { provider: 'none', openaiApiKey: '', openaiModel: 'gpt-4o-mini', ollamaUrl: '', ollamaModel: 'llama3.1', ollamaEmbedModel: 'nomic-embed-text' },
      recommendation: { level: 1, historyDepth: 300, dedupeSeries: true },
      cache: { ttlHours: 24 },
      auth: { enabled: false, secret: '', users: [], approvals: false },
      plexAuth: { enabled: false, clientId: '' },
      api: { key: '••••••••wxyz' },
      webhook: { secret: '••••••••6789' },
      users: [],
      telegram: { enabled: false, botToken: '', chatId: '', sendSilently: false, systemTempThreshold: 90, types: {} },
      discord: { enabled: false, webhookUrl: '', botUsername: 'NickSeer Bot', types: {} }
    };
  }

  // Stateful, so regenerating actually changes what the next GET returns and
  // the UI's reload-after-regenerate path is genuinely exercised.
  if (pathname === '/api/settings/integrations') {
    return {
      apiKey: secrets.apiKey,
      overseerrApiKey: '',
      effectiveApiKey: secrets.apiKey,
      effectiveApiKeySource: 'api.key',
      webhookSecret: secrets.webhookSecret,
      webhookUrl: `http://127.0.0.1:${PORT}/api/v1/webhook?token=${secrets.webhookSecret}`
    };
  }

  if (pathname === '/api/settings/integrations/regenerate') {
    const target = body?.target;
    if (!['api', 'webhook'].includes(target)) return { error: "target must be 'api' or 'webhook'" };
    const value = 'SANDBOX-' + target + '-' + Math.random().toString(36).slice(2, 12);
    if (target === 'api') secrets.apiKey = value; else secrets.webhookSecret = value;
    return { ok: true, target, value };
  }

  return { ok: true, sandbox: true, path: pathname };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  const send = (code, type, payload) => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(payload);
  };

  if (pathname.startsWith('/sandbox-poster/')) {
    return send(200, MIME['.svg'], poster(pathname.split('/').pop().replace('.svg', '')));
  }

  if (pathname.startsWith('/api/')) {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    return req.on('end', () => {
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { /* not json */ }
      const result = api(pathname, url, body, req);
      const status = (result && result.__status) || 200;
      const payload = JSON.stringify(result);
      const slow = /^\/api\/discover\/(movie|tv)\/\d+$/.test(pathname) ? DETAIL_DELAY_MS
        : (pathname === '/api/discover/home' || pathname === '/api/discover/rows') ? HOME_DELAY_MS : 0;
      if (slow) apiHits.detail++;
      setTimeout(() => send(status, MIME['.json'], payload), slow);
    });
  }

  // Static, confined to public/.
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return send(403, 'text/plain', 'forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) return send(404, 'text/plain', 'not found');
    // Strong ETag like the real server (mini.js), so the service worker's
    // "newer code exists" check has something to compare.
    //   GET /api/sandbox/deploy   simulates a deploy: app.js and index.html
    //   get one extra comment line, i.e. new bytes and a new ETag, without
    //   touching the files on disk.
    const ext = path.extname(file).toLowerCase();
    if (sbDeploy.n && (rel === 'js/app.js' || rel === 'index.html')) {
      const mark = ext === '.html' ? `\n<!-- sandbox deploy ${sbDeploy.n} -->\n` : `\n// sandbox deploy ${sbDeploy.n}\n`;
      buf = Buffer.concat([buf, Buffer.from(mark)]);
    }
    const etag = '"' + crypto.createHash('sha1').update(buf).digest('base64url') + '"';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag });
    res.end(buf);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[sandbox] http://127.0.0.1:${PORT}`);
  console.log(`[sandbox] ${ROWS} rows x ${PER_ROW} cards = ${ROWS * PER_ROW} cards`);
  console.log('[sandbox] stubs only — no config, no Plex/Arr, no notifications');
});
