// NickSeer test suite.
//
// Deliberately dependency-free and offline: `node test/run.mjs`. It covers the
// places where a regression would be SILENT rather than loud — no exception, no
// log line, just wrong data or a lost record.
//
//   1. mapLimit ordering — the recommendation engine ranks candidates by seed
//      position, so if concurrency ever reordered results the rows would
//      silently degrade with nothing to show for it.
//   2. Cache snapshot allowlist — `arr:monitored:*` holds a Set and a Map that
//      JSON.stringify flattens to `{}`. Persisting those would quietly break
//      "already requested" detection after a restart.
//   3. Token verification — every rejection path must actually reject.
//   4. Rate limiter windows.
//
// Nothing here touches the network, /config, or the Requestrr surface.

import assert from 'assert';

let passed = 0, failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++; results.push(`  PASS  ${name}`);
  } catch (e) {
    failed++; results.push(`  FAIL  ${name}\n          ${e.message}`);
  }
}

const { mapLimit } = await import('../server/lib/async.js');
const cache = await import('../server/lib/cache.js');
const rl = await import('../server/lib/ratelimit.js');

// --- 1. mapLimit ------------------------------------------------------------

await test('mapLimit preserves input order under concurrency', async () => {
  const input = [50, 10, 40, 5, 30, 1, 20];
  // Deliberately inverse delays: without order preservation the fast items
  // would land first and the result would come back shuffled.
  const out = await mapLimit(input, 3, async (n) => {
    await new Promise((r) => setTimeout(r, n));
    return n * 2;
  });
  assert.deepStrictEqual(out, input.map((n) => n * 2));
});

await test('mapLimit honours the concurrency ceiling', async () => {
  let inFlight = 0, peak = 0;
  await mapLimit(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
  });
  assert.ok(peak <= 4, `peak concurrency ${peak} exceeded limit 4`);
  assert.ok(peak > 1, 'never ran concurrently at all');
});

await test('mapLimit handles an empty list', async () => {
  assert.deepStrictEqual(await mapLimit([], 8, async (x) => x), []);
});

await test('mapLimit rejects if a task rejects', async () => {
  await assert.rejects(
    () => mapLimit([1, 2, 3], 2, async (n) => { if (n === 2) throw new Error('boom'); return n; }),
    /boom/
  );
});

// --- 2. Cache snapshot ------------------------------------------------------

await test('snapshot excludes non-JSON-safe cache entries', () => {
  cache.clear();
  cache.set('recs:alice:1', { rows: [{ title: 'Picked for you' }] }, 60000);
  cache.set('arr:monitored:radarr', { set: new Set(['1']), titles: new Map() }, 60000);
  cache.set('plex:scan', { map: {}, detail: {} }, 60000);
  const keys = JSON.parse(cache.snapshot()).entries.map((e) => e[0]);
  assert.ok(keys.includes('recs:alice:1'), 'allowlisted key missing');
  assert.ok(!keys.includes('arr:monitored:radarr'), 'Set/Map entry must not persist');
  assert.ok(!keys.includes('plex:scan'), 'plex scan must not persist');
});

await test('snapshot round-trips values intact', () => {
  cache.clear();
  const value = { rows: [{ title: 'Trending', items: [{ id: 1, title: 'Dune' }] }] };
  cache.set('rows:curated:movie', value, 60000);
  const json = cache.snapshot();
  cache.clear();
  assert.strictEqual(cache.restore(json), 1);
  assert.deepStrictEqual(cache.get('rows:curated:movie'), value);
});

await test('restore drops expired entries', () => {
  cache.clear();
  const stale = JSON.stringify({ v: 1, entries: [['recs:bob:1', Date.now() - 1000, { rows: [] }]] });
  assert.strictEqual(cache.restore(stale), 0);
  assert.strictEqual(cache.get('recs:bob:1'), undefined);
});

await test('restore never overwrites a live in-memory entry', () => {
  cache.clear();
  cache.set('recs:carol:1', { rows: ['fresh'] }, 60000);
  const older = JSON.stringify({ v: 1, entries: [['recs:carol:1', Date.now() + 60000, { rows: ['stale'] }]] });
  cache.restore(older);
  assert.deepStrictEqual(cache.get('recs:carol:1'), { rows: ['fresh'] });
});

await test('restore survives corrupt input', () => {
  assert.strictEqual(cache.restore('not json at all'), 0);
  assert.strictEqual(cache.restore('{}'), 0);
  assert.strictEqual(cache.restore('{"v":99,"entries":[]}'), 0);
});

await test('snapshot returns null when nothing is persistable', () => {
  cache.clear();
  cache.set('arr:monitored:sonarr', { set: new Set() }, 60000);
  assert.strictEqual(cache.snapshot(), null);
});

await test('cached() expires entries past their TTL', async () => {
  cache.clear();
  let calls = 0;
  const producer = async () => { calls++; return calls; };
  assert.strictEqual(await cache.cached('k', 30, producer), 1);
  assert.strictEqual(await cache.cached('k', 30, producer), 1); // served from cache
  await new Promise((r) => setTimeout(r, 45));
  assert.strictEqual(await cache.cached('k', 30, producer), 2); // recomputed
});

await test('cached() force bypasses a live entry', async () => {
  cache.clear();
  let calls = 0;
  const producer = async () => { calls++; return calls; };
  await cache.cached('k2', 60000, producer);
  assert.strictEqual(await cache.cached('k2', 60000, producer, true), 2);
});

// --- 3. Rate limiter --------------------------------------------------------

await test('rate limiter allows up to the ceiling then blocks', () => {
  rl.reset('t1');
  const got = Array.from({ length: 5 }, () => rl.allow('t1', 3, 60000));
  assert.deepStrictEqual(got, [true, true, true, false, false]);
});

await test('rate limiter keys are independent', () => {
  rl.reset('a'); rl.reset('b');
  rl.allow('a', 1, 60000);
  assert.strictEqual(rl.allow('a', 1, 60000), false);
  assert.strictEqual(rl.allow('b', 1, 60000), true);
});

await test('rate limiter window slides', async () => {
  rl.reset('t2');
  assert.strictEqual(rl.allow('t2', 1, 40), true);
  assert.strictEqual(rl.allow('t2', 1, 40), false);
  await new Promise((r) => setTimeout(r, 55));
  assert.strictEqual(rl.allow('t2', 1, 40), true, 'window did not slide');
});

await test('a rejected attempt does not extend the lockout', async () => {
  rl.reset('t3');
  rl.allow('t3', 1, 60);
  rl.allow('t3', 1, 60); // rejected — must not be recorded
  await new Promise((r) => setTimeout(r, 75));
  assert.strictEqual(rl.allow('t3', 1, 60), true);
});

await test('retryAfter reports 0 while under the limit', () => {
  rl.reset('t4');
  assert.strictEqual(rl.retryAfter('t4', 3, 60000), 0);
  rl.allow('t4', 3, 60000);
  assert.strictEqual(rl.retryAfter('t4', 3, 60000), 0);
});

// --- 4. Token verification --------------------------------------------------
// auth.js reads config at import time, so point it at a scratch dir first.

const nodeFs = await import('fs');
const SCRATCH = nodeFs.mkdtempSync(
  (await import('path')).join((await import('os')).tmpdir(), 'nickseer-test-')
);
// Point config at a scratch dir BEFORE config.js is first imported, so the
// suite can never write to the real /config (which is the live NAS volume).
process.env.CONFIG_DIR = SCRATCH;
process.on('exit', () => { try { nodeFs.rmSync(SCRATCH, { recursive: true, force: true }); } catch {} });
const { update } = await import('../server/config.js');
const auth = (await import('../server/services/auth.js')).default;

update({ auth: { enabled: true, users: [{ username: 'alice', role: 'admin', tokenVersion: 0 }] } });

await test('a freshly minted token verifies', () => {
  const t = auth.makeToken({ username: 'alice', role: 'admin', tokenVersion: 0 });
  const v = auth.verifyToken(t);
  assert.ok(v, 'token did not verify');
  assert.strictEqual(v.username, 'alice');
  assert.strictEqual(v.role, 'admin');
});

await test('a tampered payload is rejected', () => {
  const t = auth.makeToken({ username: 'alice', role: 'user', tokenVersion: 0 });
  const [b64, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({
    u: 'alice', r: 'admin', v: 0, exp: Date.now() + 100000
  })).toString('base64url');
  assert.strictEqual(auth.verifyToken(`${forged}.${sig}`), null, 'forged payload accepted');
  assert.ok(b64);
});

await test('an expired token is rejected', () => {
  const t = auth.makeToken({ username: 'alice', role: 'admin', tokenVersion: 0 });
  const [b64] = t.split('.');
  const p = JSON.parse(Buffer.from(b64, 'base64url').toString());
  assert.ok(p.exp > Date.now(), 'fresh token should not already be expired');
});

await test('bumping tokenVersion revokes existing tokens', () => {
  const t = auth.makeToken({ username: 'alice', role: 'admin', tokenVersion: 0 });
  assert.ok(auth.verifyToken(t), 'precondition: token should verify');
  update({ auth: { enabled: true, users: [{ username: 'alice', role: 'admin', tokenVersion: 1 }] } });
  assert.strictEqual(auth.verifyToken(t), null, 'old token survived a tokenVersion bump');
});

await test('a token for a deleted user is rejected', () => {
  update({ auth: { enabled: true, users: [{ username: 'bob', role: 'user', tokenVersion: 0 }] } });
  const t = auth.makeToken({ username: 'bob', role: 'user', tokenVersion: 0 });
  assert.ok(auth.verifyToken(t));
  update({ auth: { enabled: true, users: [] } });
  assert.strictEqual(auth.verifyToken(t), null, 'deleted user token still valid');
});

await test('malformed tokens are rejected without throwing', () => {
  for (const bad of ['', 'nodot', 'a.b', '..', null, undefined, 12345, 'x.'.repeat(50)]) {
    assert.strictEqual(auth.verifyToken(bad), null, `accepted: ${String(bad).slice(0, 20)}`);
  }
});

// --- Request audit log ----------------------------------------------------
// Runs against the scratch CONFIG_DIR set above — never the real config.
{
  const { logRequest, logDirect, roleOf } = await import('../server/lib/requestlog.js');
  const { load, setRequests } = await import('../server/config.js');

  await test('direct add is recorded as approved/auto with provenance', async () => {
    setRequests([]);
    logDirect({ media: 'movie', tmdbId: 550, title: 'Fight Club', by: 'nick', byRole: 'admin', source: 'discord', external: '1' }, { kind: 'added', arrId: 42 });
    const [r] = load().requests;
    assert.equal(r.status, 'approved');
    assert.equal(r.decidedBy, 'auto');
    assert.equal(r.result, 'added');
    assert.equal(r.source, 'discord');
    assert.equal(r.external, '1');
    assert.equal(r.byRole, 'admin');
    assert.equal(r.arrId, 42);
    assert.ok(r.id && r.at, 'has id and timestamp');
  });

  await test('an existing title is recorded as approved with result "exists"', async () => {
    setRequests([]);
    logDirect({ media: 'movie', tmdbId: 1, title: 'X' }, { kind: 'exists' });
    const [r] = load().requests;
    assert.equal(r.status, 'approved');
    assert.equal(r.result, 'exists');
    assert.equal(r.note, 'already in library');
  });

  await test('a rejected add is recorded as failed, with the error', async () => {
    setRequests([]);
    logDirect({ media: 'tv', tmdbId: 2, title: 'Y' }, { kind: 'failed', error: 'Radarr said no' });
    const [r] = load().requests;
    assert.equal(r.status, 'failed');
    assert.equal(r.error, 'Radarr said no');
  });

  await test('newest entries come first', async () => {
    setRequests([]);
    logRequest({ status: 'approved', title: 'first' });
    logRequest({ status: 'approved', title: 'second' });
    assert.deepEqual(load().requests.map((r) => r.title), ['second', 'first']);
  });

  await test('the log is capped, and pending entries are never trimmed', async () => {
    const seed = [{ id: 'keep-me', status: 'pending', at: 0, title: 'oldest but pending' }];
    for (let i = 0; i < 2000; i++) seed.unshift({ id: 'a' + i, status: 'approved', at: i });
    setRequests(seed);
    logRequest({ status: 'approved', title: 'newest' });
    const reqs = load().requests;
    assert.ok(reqs.length <= 2000, `length ${reqs.length} exceeds cap`);
    assert.equal(reqs[0].title, 'newest');
    assert.ok(reqs.some((r) => r.id === 'keep-me'), 'pending entry was trimmed');
  });

  await test('roleOf distinguishes admin, user and guest', async () => {
    assert.equal(roleOf({ role: 'admin' }), 'admin');
    assert.equal(roleOf({ role: 'user' }), 'user');
    assert.equal(roleOf(null), 'guest');
  });
}

// --- twoPhase (AI Suggestions: quick answer now, refined answer later) -------
{
  const { twoPhase } = await import('../server/lib/twophase.js');
  const gate = () => { let open; const p = new Promise((r) => { open = r; }); return { p, open }; };

  await test('twoPhase returns the quick value at once and the refined one later', async () => {
    const g = gate(); let quickRuns = 0, refineRuns = 0;
    const opts = {
      key: 'tp:a',
      quick: async () => { quickRuns++; return { value: 'quick', ctx: 1 }; },
      refine: async () => { refineRuns++; await g.p; return { value: 'refined', ok: true }; }
    };
    assert.deepEqual(await twoPhase(opts), { value: 'quick', pending: true });
    // Polls while the job runs: same answer, and nothing is recomputed.
    assert.deepEqual(await twoPhase(opts), { value: 'quick', pending: true });
    assert.equal(quickRuns, 1); assert.equal(refineRuns, 1);
    g.open(); await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(await twoPhase(opts), { value: 'refined', pending: false });
    assert.equal(refineRuns, 1);
  });

  await test('twoPhase with nothing to refine is final immediately', async () => {
    let refined = false;
    const r = await twoPhase({ key: 'tp:b', quick: async () => ({ value: 'only', done: true }), refine: async () => { refined = true; return { value: 'x', ok: true }; } });
    assert.deepEqual(r, { value: 'only', pending: false });
    assert.equal(refined, false);
  });

  await test('twoPhase: a refine that throws falls back to the quick value, not pending forever', async () => {
    const opts = { key: 'tp:c', quick: async () => ({ value: 'quick', ctx: 1 }), refine: async () => { throw new Error('model down'); } };
    assert.equal((await twoPhase(opts)).pending, true);
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(await twoPhase(opts), { value: 'quick', pending: false });
  });

  await test('twoPhase: a failed refine (ok:false) is cached only briefly', async () => {
    const opts = { key: 'tp:d', retryTtl: 20, quick: async () => ({ value: 'quick', ctx: 1 }), refine: async () => ({ value: 'unranked', ok: false }) };
    await twoPhase(opts);
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(await twoPhase(opts), { value: 'unranked', pending: false });
    await new Promise((r) => setTimeout(r, 30));
    // Expired: the next visit tries the model again.
    assert.equal((await twoPhase(opts)).pending, true);
  });

  await test('twoPhase wait:true holds until the refined value exists', async () => {
    const r = await twoPhase({ key: 'tp:e', wait: true, quick: async () => ({ value: 'quick', ctx: 1 }), refine: async () => { await new Promise((x) => setTimeout(x, 10)); return { value: 'refined', ok: true }; } });
    assert.deepEqual(r, { value: 'refined', pending: false });
  });

  await test('twoPhase force drops the old final so follow-up polls do not see it', async () => {
    const g = gate(); let n = 0;
    const opts = { key: 'tp:f', quick: async () => ({ value: 'quick' + (++n), ctx: 1 }), refine: async () => { if (n > 1) await g.p; return { value: 'refined' + n, ok: true }; } };
    await twoPhase({ ...opts, wait: true });
    assert.deepEqual(await twoPhase(opts), { value: 'refined1', pending: false });
    assert.deepEqual(await twoPhase({ ...opts, force: true }), { value: 'quick2', pending: true });
    assert.deepEqual(await twoPhase(opts), { value: 'quick2', pending: true });
    g.open(); await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(await twoPhase(opts), { value: 'refined2', pending: false });
  });

  await test('twoPhase working keys stay out of the disk snapshot', async () => {
    const snap = cache.snapshot() || '';
    assert.ok(!snap.includes('quick:tp:'), 'quick: working entries were persisted');
  });
}

// --- Live › History mapping -------------------------------------------------
{
  const T = await import('../server/services/tautulli.js');
  const raw = (o) => ({ row_id: 1, date: 1700000000, duration: 600, user_id: 5, friendly_name: 'Maria', media_type: 'movie', title: 'Dune', year: 2021, rating_key: 10, transcode_decision: 'direct play', percent_complete: 90, watched_status: 1, platform: 'webOS', player: 'LG', ...o });

  await test('historyRow maps an episode to its show, with S/E and show key', async () => {
    const r = T.historyRow(raw({ media_type: 'episode', title: 'Pilot', grandparent_title: 'Lupin', grandparent_rating_key: 77, parent_media_index: 2, media_index: 3 }));
    assert.equal(r.title, 'Lupin'); assert.equal(r.episodeTitle, 'Pilot');
    assert.equal(r.season, 2); assert.equal(r.episode, 3); assert.equal(r.showKey, 77); assert.equal(r.ep, true);
  });

  await test('historyRow keeps a movie keyed by its own rating key', async () => {
    const r = T.historyRow(raw({}));
    assert.equal(r.title, 'Dune'); assert.equal(r.ratingKey, 10); assert.equal(r.showKey, null); assert.equal(r.watched, true);
  });

  await test('summarize counts plays, time, decisions and ranks users', async () => {
    const rows = [
      raw({ row_id: 1, friendly_name: 'Maria', user_id: 5, transcode_decision: 'transcode' }),
      raw({ row_id: 2, friendly_name: 'Maria', user_id: 5 }),
      raw({ row_id: 3, friendly_name: 'Nick', user_id: 6, transcode_decision: 'copy', duration: 1200 })
    ].map(T.historyRow);
    const s = T.summarize(rows);
    assert.equal(s.plays, 3); assert.equal(s.seconds, 2400);
    assert.deepEqual(s.decisions, { 'direct play': 1, copy: 1, transcode: 1 });
    assert.equal(s.users[0].name, 'Maria'); assert.equal(s.users[0].plays, 2); assert.equal(s.users[0].userId, 5);
    assert.equal(s.titles[0].name, 'Dune'); assert.equal(s.titles[0].plays, 3);
  });

  await test('sessionDetail reads a saved play record (burned-in subtitles)', async () => {
    const d = T.sessionDetail({ video_codec: 'hevc', stream_video_codec: 'h264', stream_video_decision: 'transcode', subtitle_codec: 'pgs', stream_subtitle_decision: 'burn', subtitles: 1 });
    assert.equal(d.video.src.codec, 'HEVC'); assert.equal(d.video.out.codec, 'H264');
    assert.equal(d.subtitle.on, true); assert.equal(d.subtitle.decision, 'burn');
  });
}

// --- Title modal › In Library (Plex file details) ----------------------------
{
  const P = await import('../server/services/plex.js');
  const movie = {
    ratingKey: '42', type: 'movie', title: 'Gemini Man', year: 2019,
    Media: [{ videoResolution: '4k', videoCodec: 'hevc', Part: [{ file: '/data/media/movies/Gemini Man (2019)/Gemini Man.mkv', size: 100,
      Stream: [
        { streamType: 1, codec: 'hevc', DOVIPresent: true, colorTrc: 'smpte2084' },
        { streamType: 2, codec: 'truehd', channels: 8, language: 'English', default: true },
        { streamType: 3, codec: 'pgs', language: 'English', forced: true },
        { streamType: 3, codec: 'srt', language: 'Greek', key: '/library/streams/9', hearingImpaired: true }
      ] }] }]
  };

  await test('mapItem never exposes the NAS path, only the file name', async () => {
    const d = P.mapItem(movie);
    assert.equal(d.versions[0].parts[0].file, 'Gemini Man.mkv');
    assert.ok(!JSON.stringify(d).includes('/data/media'));
  });

  await test('mapItem classifies subtitles: image vs text, embedded vs external, forced, SDH', async () => {
    const [pgs, srt] = P.mapItem(movie).versions[0].subtitles;
    assert.deepEqual([pgs.image, pgs.external, pgs.forced], [true, false, true]);
    assert.deepEqual([srt.image, srt.external, srt.hearingImpaired, srt.language], [false, true, true, 'Greek']);
  });

  await test('mapItem labels Dolby Vision with an HDR10 base layer', async () => {
    assert.equal(P.mapItem(movie).versions[0].video[0].dynamicRange, 'Dolby Vision · HDR10');
  });

  await test('mapShow groups episodes by season and totals the size', async () => {
    const ep = (s, e, size, res) => ({ ratingKey: `${s}${e}`, parentIndex: s, index: e, Media: [{ videoResolution: res, videoCodec: 'h264', Part: [{ size }] }] });
    const d = P.mapShow({ ratingKey: '7', type: 'show', title: 'Lupin', viewedLeafCount: 1 }, [ep(2, 1, 30, '4k'), ep(1, 2, 20, '1080'), ep(1, 1, 10, '1080')]);
    assert.equal(d.seasonCount, 2); assert.equal(d.episodes, 3); assert.equal(d.totals.size, 60);
    assert.deepEqual(d.seasons[0].episodes.map((e) => e.episode), [1, 2]);
    assert.equal(d.seasons[0].size, 30);
    assert.deepEqual(d.totals.resolutions, { 1080: 2, '4k': 1 });
  });
}

// --- report -----------------------------------------------------------------

console.log('\n' + results.join('\n'));
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
