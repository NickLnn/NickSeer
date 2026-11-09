// Request audit log.
//
// Before this, only QUEUED requests (non-admin, approvals on) were ever written
// to `requests`. Anything that went straight to Radarr/Sonarr — every admin
// request, every request while approvals were off, every collection batch and
// every Requestrr/Discord request — called arr.add() and recorded nothing. The
// Requests tab therefore could not answer "who added this, when, from where",
// which is exactly the question unexplained additions raise.
//
// Every path that can add to Radarr/Sonarr now writes one entry here, in the
// same shape the approvals queue already uses, plus:
//   source   'app' | 'collection' | 'discord'   — where the request came from
//   byRole   'admin' | 'user' | 'guest' | 'external'
//   result   'added' | 'exists' | 'failed'      — what Radarr/Sonarr said
//   external Requestrr's X-API-User value, verbatim, when there was one
//
// Direct additions are stored as status 'approved' with decidedBy 'auto' so the
// existing Approved/All tabs pick them up; failures as status 'failed'.
import crypto from 'crypto';
import { mutateRequests } from '../config.js';

// The log lives inside config/settings.json. Bound it so a busy install cannot
// grow that file forever. Pending entries are never trimmed — they are work
// someone still has to act on.
const MAX_ENTRIES = 2000;

export function roleOf(user) {
  if (!user) return 'guest';
  return user.role === 'admin' ? 'admin' : 'user';
}

export function logRequest(entry) {
  const rec = { id: crypto.randomUUID(), at: Date.now(), ...entry };
  mutateRequests((cur) => {
    cur.unshift(rec);
    // Drop the oldest non-pending entries until we are back under the cap.
    for (let i = cur.length - 1; cur.length > MAX_ENTRIES && i >= 0; i--) {
      if (cur[i].status !== 'pending') cur.splice(i, 1);
    }
    return cur;
  });
  return rec;
}

// Shorthand for the outcome of a direct arr.add() — one call per request.
export function logDirect(base, outcome) {
  const now = Date.now();
  const byOutcome = {
    added: { status: 'approved', result: 'added' },
    exists: { status: 'approved', result: 'exists', note: 'already in library' },
    failed: { status: 'failed', result: 'failed' }
  }[outcome.kind] || { status: 'failed', result: 'failed' };
  return logRequest({
    ...base,
    ...byOutcome,
    decidedAt: now,
    decidedBy: 'auto',
    ...(outcome.error ? { error: String(outcome.error).slice(0, 300) } : {}),
    ...(outcome.arrId ? { arrId: outcome.arrId } : {})
  });
}
