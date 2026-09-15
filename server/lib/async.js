// Bounded-concurrency map. Results come back in input order, so callers that
// depend on ordering (the recommendation engine ranks by seed position) can
// swap a sequential `for` loop for this without changing behaviour.
//
// TMDB tolerates bursts but not unbounded ones, so the default limit keeps us
// well under the rate ceiling while still collapsing dozens of round trips
// into a handful of waves.
export async function mapLimit(items, limit, fn) {
  const list = Array.from(items);
  const out = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= list.length) return;
      out[i] = await fn(list[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export default { mapLimit };
