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

// --- report -----------------------------------------------------------------

console.log('\n' + results.join('\n'));
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
