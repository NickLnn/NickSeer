// Two-phase cached producer: answer NOW with a cheap result, improve it in the
// background, and let the caller poll for the improved one.
//
// Built for AI Suggestions. That route used to do everything inside one
// cached() call — history, the TMDB fan-out AND the LLM rerank — so on a cold
// cache the HTTP request stayed open for as long as the model took (up to the
// 45s timeout in recommend/ai.js). The page showed "Building your picks…" over
// an empty grid the whole time. The candidates the model is asked to reorder
// are already a perfectly usable rule-based list seconds earlier, so serve
// those first and swap in the AI order when it lands.
//
//   quick()      -> { value, ctx }   cheap result. ctx is handed to refine();
//                                    omit ctx (or pass done:true) when there is
//                                    nothing to refine and value is final.
//   refine(ctx)  -> { value, ok }    slow improvement. ok:false means "it did
//                                    not actually improve" (model down, bad
//                                    JSON): the value is cached only for
//                                    retryTtl so the next visit tries again
//                                    instead of pinning a failure for a day.
//
// Returns { value, pending }. pending:true means value is the quick result and
// a refine job is running; call again later (same key) to collect the final.
import { get, set, del, cached, TTL_DAY } from './cache.js';

const jobs = new Map();               // key -> in-flight refine promise
const QUICK_TTL = 10 * 60 * 1000;     // polls reuse the quick result
const RETRY_TTL = 15 * 60 * 1000;

export async function twoPhase({ key, ttl = TTL_DAY, retryTtl = RETRY_TTL, quick, refine, force = false, wait = false }) {
  // A forced refresh while a job for this key is already running just joins it.
  const restart = force && !jobs.has(key);
  if (!force) {
    const hit = get(key);
    if (hit !== undefined) return { value: hit, pending: false };
  } else if (restart) {
    // Drop the old final, or the caller's follow-up polls (which are not
    // forced) would be handed yesterday's answer and stop polling.
    del(key);
  }

  // Deliberately a different prefix from `key`: it holds raw upstream objects
  // for refine() and must stay out of the disk snapshot allowlist.
  const base = await cached(`quick:${key}`, QUICK_TTL, quick, restart);

  if (!refine || base.done || base.ctx === undefined) {
    set(key, base.value, ttl);
    return { value: base.value, pending: false };
  }

  let job = jobs.get(key);
  if (!job) {
    job = Promise.resolve()
      .then(() => refine(base.ctx))
      .then((r) => { set(key, r.value, r.ok ? ttl : retryTtl); })
      .catch((e) => {
        console.warn(`[twophase] refine failed for ${key}: ${e.message}`);
        set(key, base.value, retryTtl);
      })
      .finally(() => { jobs.delete(key); });
    jobs.set(key, job);
  }

  if (wait) {
    await job;
    const done = get(key);
    return { value: done !== undefined ? done : base.value, pending: false };
  }
  return { value: base.value, pending: true };
}

export function pendingJobs() { return jobs.size; }

export default { twoPhase, pendingJobs };
