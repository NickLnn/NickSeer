// Offline test for server/services/personview.js — what counts as "known for".
//   node test/personview.test.mjs
import assert from 'assert';
import { buildPersonView } from '../server/services/personview.js';

const c = (id, o) => ({ id, media_type: 'movie', title: 'T' + id, poster_path: '/p' + id, backdrop_path: '/b' + id, vote_average: 7, vote_count: 1000, popularity: 10, release_date: '2015-01-01', genre_ids: [18], character: 'Role ' + id, order: 0, ...o });
const tv = (id, o) => c(id, { media_type: 'tv', name: 'S' + id, title: undefined, first_air_date: '2012-01-01', release_date: undefined, episode_count: 30, ...o });
const TODAY = '2026-11-13';
const view = (cast, crew = [], extra = {}) => buildPersonView({ id: 1, name: 'A B', known_for_department: 'Acting', birthday: '1986-06-18', combined_credits: { cast, crew }, ...extra }, { today: TODAY, isOwned: (k) => k === 'movie:2' || k === 'tv:90' });

// 1) Talk shows and guest spots never lead, however "popular" they are.
let v = view([
  tv(90, { name: 'Late Show', genre_ids: [10767], character: 'Self - Guest', popularity: 5000, episode_count: 2 }),
  tv(91, { name: 'Panel', genre_ids: [35], character: 'Himself', popularity: 4000, episode_count: 1 }),
  c(1, { vote_count: 20000, vote_average: 8.5 }), c(2, { vote_count: 9000 }), c(3, { vote_count: 500 }), tv(4, { vote_count: 15000, vote_average: 9 }),
  tv(5, { vote_count: 30000, vote_average: 9, episode_count: 1 })       // one-episode guest role in a huge show
]);
assert.deepEqual(v.knownFor.map((k) => k.id).slice(0, 2).sort(), [1, 4]);
assert.ok(!v.knownFor.some((k) => k.id === 90 || k.id === 91), 'appearances excluded');
assert.ok(v.knownFor.findIndex((k) => k.id === 5) > v.knownFor.findIndex((k) => k.id === 2), 'guest spot ranks below a real role');
assert.equal(v.counts.appearances, 2);
console.log('ok  talk shows and guest spots do not lead');

// 2) Library row, header count and filmography filter agree, and skip appearances.
assert.equal(v.counts.library, 1); assert.equal(v.inLibrary.length, 1); assert.equal(v.inLibrary[0].id, 2);
assert.equal(v.filmography.filter((f) => f.owned).length, 1);
assert.ok(!v.filmography.some((f) => f.id === 90));
console.log('ok  library counts agree');

// 3) Unreleased titles go to "Coming up", not "Known for"; filmography is newest first with undated on top.
v = view([c(1), c(2, { release_date: '2027-03-01' }), c(3, { release_date: '' }), c(4, { release_date: '2020-01-01' })]);
assert.deepEqual(v.upcoming.map((k) => k.id), [2, 3]);
assert.deepEqual(v.knownFor.map((k) => k.id).sort(), [1, 4]);
assert.deepEqual(v.filmography.map((f) => f.id), [3, 2, 4, 1]);
console.log('ok  upcoming and ordering');

// 4) A host is known for their own show (20+ episodes as themselves).
v = view([tv(7, { name: 'Own Show', genre_ids: [10767], character: 'Self - Host', episode_count: 3000 }), c(1)]);
assert.ok(v.knownFor.some((k) => k.id === 7));
console.log('ok  hosts keep their own show');

// 5) A director leads with crew work; several jobs on one title are merged.
v = view([tv(90, { genre_ids: [10767], character: 'Self', episode_count: 1 })],
  [c(1, { job: 'Director' }), c(1, { job: 'Writer' }), c(2, { job: 'Director' }), c(3, { job: 'Producer' }), c(4, { job: 'Gaffer' })],
  { known_for_department: 'Directing' });
assert.equal(v.primary, 'crew'); assert.equal(v.knownFor.length, 0);
assert.equal(v.crewKnownFor.length, 3);
assert.equal(v.crewKnownFor.find((k) => k.id === 1).job, 'Director · Writer');
assert.equal(v.filmography.find((f) => f.id === 1).role, 'Director · Writer');
console.log('ok  directors lead with crew work');

// 6) Facts.
assert.equal(view([c(1)]).age, 40);
assert.equal(view([c(1)], [], { birthday: '1950-12-31', deathday: '2020-06-01' }).age, 69);
assert.equal(view([c(1)], [], { birthday: null }).age, null);
const empty = buildPersonView({ id: 9, name: 'X' });
assert.equal(empty.knownFor.length, 0); assert.equal(empty.filmography.length, 0); assert.equal(empty.counts.library, 0);
console.log('ALL PASS');
