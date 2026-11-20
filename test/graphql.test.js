import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graphql, buildSchema } from 'graphql';
import { typeDefs, makeRootValue } from '../src/schema.js';
import { createPathFetchStub } from './helpers.js';
import { REVIEW_KEYS, FULL_REVIEW_KEYS, WATCHED_KEYS } from '../scripts/validateSeason.js';
import { LIST_ENTRY_KEYS } from '../public/vqar/list-entries.js';
import { makeSeason, makeShow } from './fixtures.js';

// Mirrors the index/season file shapes used by test/vqar.test.js.
const seasonIndex = {
  currentSeason: 'summer-2026',
  seasons: [
    { id: 'summer-2026', name: 'Summer 2026', file: '/vqar/data/seasons/summer-2026.json' },
    { id: 'spring-2026', name: 'Spring 2026', file: '/vqar/data/seasons/spring-2026.json' },
  ],
};

const seasons = {
  '/vqar/data/seasons/summer-2026.json': makeSeason({
    id: 'summer-2026',
    name: 'Summer 2026',
    shows: [makeShow({ titleEN: 'Summer Show', ratingNumber: 5, ratingText: 'Nice Ep Broh', text: 'great', dateReviewed: '2026-07-01' })],
    toReview: ['Pending Summer Show'],
    notReviewing: [],
  }),
  '/vqar/data/seasons/spring-2026.json': makeSeason({
    id: 'spring-2026',
    name: 'Spring 2026',
    shows: [],
    toReview: [],
    notReviewing: ['Skipped Spring Show'],
  }),
};

function routes() {
  return { '/vqar/data/index.json': seasonIndex, ...seasons };
}

const schema = buildSchema(typeDefs);

// The resolvers read the committed data through the Worker's ASSETS binding
// rather than fetching it, so the stub stands in for the binding - same route
// table, one less layer of indirection than mocking global fetch.
async function run(query, assetsStub = createPathFetchStub(routes())) {
  const result = await graphql({
    schema,
    source: query,
    rootValue: makeRootValue({ assets: { fetch: assetsStub }, origin: 'https://pendelgeist.com' }),
  });
  // graphql-js builds result objects with a null prototype; round-trip through
  // JSON so assert's strict deepEqual compares plain-object structure only.
  return { ...result, data: result.data && JSON.parse(JSON.stringify(result.data)) };
}

test('seasons returns an id/name summary for every index entry', async () => {
  const result = await run('{ seasons { id name } }');
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.seasons, [
    { id: 'summer-2026', name: 'Summer 2026' },
    { id: 'spring-2026', name: 'Spring 2026' },
  ]);
});

test('currentSeason resolves the index\'s currentSeason with full review data', async () => {
  const result = await run('{ currentSeason { id name shows { titleEN ratingText season seasonName } toReview notReviewing } }');
  assert.equal(result.errors, undefined);
  assert.equal(result.data.currentSeason.id, 'summer-2026');
  assert.deepEqual(result.data.currentSeason.shows, [
    { titleEN: 'Summer Show', ratingText: 'Nice Ep Broh', season: 'summer-2026', seasonName: 'Summer 2026' },
  ]);
  assert.deepEqual(result.data.currentSeason.toReview, ['Pending Summer Show']);
});

test('season(id) resolves a specific season by id', async () => {
  const result = await run('{ season(id: "spring-2026") { name notReviewing } }');
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.season, { name: 'Spring 2026', notReviewing: ['Skipped Spring Show'] });
});

test('season(id) returns null for an id not in the index', async () => {
  const result = await run('{ season(id: "nope") { name } }');
  assert.equal(result.errors, undefined);
  assert.equal(result.data.season, null);
});

test('anilistId passes through when set on a review, and is null when absent', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': makeSeason({
      id: 'summer-2026',
      name: 'Summer 2026',
      shows: [makeShow({ titleEN: 'Linked Show', ratingText: 'Meh', dateReviewed: '2026-07-01', anilistId: 154587 })],
      toReview: [],
      notReviewing: [],
    }),
    '/vqar/data/seasons/spring-2026.json': seasons['/vqar/data/seasons/spring-2026.json'],
  });

  const result = await run('{ currentSeason { shows { titleEN anilistId } } }', assetsStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.shows, [{ titleEN: 'Linked Show', anilistId: 154587 }]);

  const result2 = await run('{ season(id: "spring-2026") { shows { anilistId } } }');
  assert.equal(result2.errors, undefined);
  assert.deepEqual(result2.data.season.shows, []);
});

test('Wikipedia URLs pass through when set on a review', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': makeSeason({
      id: 'summer-2026',
      name: 'Summer 2026',
      shows: [makeShow({
        titleEN: 'Documented Show',
        ratingText: 'Meh',
        dateReviewed: '2026-07-01',
        wikipediaUrl: 'https://en.wikipedia.org/wiki/Documented_Show',
        wikipediaJaUrl: 'https://ja.wikipedia.org/wiki/\u745E\u9E97',
      })],
      toReview: [],
      notReviewing: [],
    }),
    '/vqar/data/seasons/spring-2026.json': seasons['/vqar/data/seasons/spring-2026.json'],
  });

  const result = await run('{ currentSeason { shows { titleEN wikipediaUrl wikipediaJaUrl } } }', assetsStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.shows, [{
    titleEN: 'Documented Show',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Documented_Show',
    wikipediaJaUrl: 'https://ja.wikipedia.org/wiki/\u745E\u9E97',
  }]);
});

test('annId and streaming pass through when set on a review', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': makeSeason({
      id: 'summer-2026',
      name: 'Summer 2026',
      shows: [makeShow({
        titleEN: 'Linked Show',
        ratingText: 'Meh',
        dateReviewed: '2026-07-01',
        annId: 22622,
        streaming: ['crunchyroll', 'netflix'],
      })],
      toReview: [],
      notReviewing: [],
    }),
    '/vqar/data/seasons/spring-2026.json': seasons['/vqar/data/seasons/spring-2026.json'],
  });

  const result = await run('{ currentSeason { shows { titleEN annId streaming } } }', assetsStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.shows, [
    { titleEN: 'Linked Show', annId: 22622, streaming: ['crunchyroll', 'netflix'] },
  ]);
});

test('crunchyrollUrl passes through when set on a review, and is null when absent', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': makeSeason({
      id: 'summer-2026',
      name: 'Summer 2026',
      shows: [makeShow({
        titleEN: 'Streamed Show',
        ratingText: 'Meh',
        dateReviewed: '2026-07-01',
        crunchyrollUrl: 'https://www.crunchyroll.com/series/ABC123/streamed-show',
      })],
      toReview: [],
      notReviewing: [],
    }),
    '/vqar/data/seasons/spring-2026.json': seasons['/vqar/data/seasons/spring-2026.json'],
  });

  const result = await run('{ currentSeason { shows { titleEN crunchyrollUrl } } }', assetsStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.shows, [
    { titleEN: 'Streamed Show', crunchyrollUrl: 'https://www.crunchyroll.com/series/ABC123/streamed-show' },
  ]);

  const result2 = await run('{ season(id: "spring-2026") { shows { crunchyrollUrl } } }');
  assert.equal(result2.errors, undefined);
  assert.deepEqual(result2.data.season.shows, []);
});

test('hidiveUrl and netflixUrl pass through when set on a review', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': makeSeason({
      id: 'summer-2026',
      name: 'Summer 2026',
      shows: [makeShow({
        titleEN: 'Streamed Show',
        ratingText: 'Meh',
        dateReviewed: '2026-07-01',
        hidiveUrl: 'https://www.hidive.com/season/streamed-show',
        netflixUrl: 'https://www.netflix.com/title/12345',
      })],
      toReview: [],
      notReviewing: [],
    }),
    '/vqar/data/seasons/spring-2026.json': seasons['/vqar/data/seasons/spring-2026.json'],
  });

  const result = await run('{ currentSeason { shows { titleEN hidiveUrl netflixUrl } } }', assetsStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.shows, [
    { titleEN: 'Streamed Show', hidiveUrl: 'https://www.hidive.com/season/streamed-show', netflixUrl: 'https://www.netflix.com/title/12345' },
  ]);
});

test('watchProgress passes through when set on a review, and is null when absent', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': makeSeason({
      id: 'summer-2026',
      name: 'Summer 2026',
      shows: [makeShow({ titleEN: 'Revisited Show', ratingText: 'Yeah', dateReviewed: '2026-07-01', watchProgress: 'Ep 3' })],
      toReview: [],
      notReviewing: [],
    }),
    '/vqar/data/seasons/spring-2026.json': seasons['/vqar/data/seasons/spring-2026.json'],
  });

  const result = await run('{ currentSeason { shows { titleEN watchProgress } } }', assetsStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.shows, [{ titleEN: 'Revisited Show', watchProgress: 'Ep 3' }]);

  const result2 = await run('{ season(id: "spring-2026") { shows { watchProgress } } }');
  assert.equal(result2.errors, undefined);
  assert.deepEqual(result2.data.season.shows, []);
});

test('a failed asset read surfaces as a GraphQL error instead of throwing', async () => {
  const failingAssets = async () => ({ ok: false, status: 500 });
  const result = await run('{ currentSeason { name } }', failingAssets);
  assert.ok(result.errors && result.errors.length > 0);
  assert.equal(result.data.currentSeason, null);
});

// --- Per-request read caching ---

test('one query reads each file once, however many root fields name it', async () => {
  const assetsStub = createPathFetchStub(routes());
  await run(
    '{ seasons { id } currentSeason { id } a: season(id: "spring-2026") { id } b: season(id: "spring-2026") { id } }',
    assetsStub
  );

  assert.deepEqual(assetsStub.calls, [
    '/vqar/data/index.json',
    '/vqar/data/seasons/summer-2026.json',
    '/vqar/data/seasons/spring-2026.json',
  ], 'expected no repeated reads within a single query');
});

test('the read cache does not outlive a request', async () => {
  const first = createPathFetchStub(routes());
  await run('{ currentSeason { id } }', first);

  const second = createPathFetchStub(routes());
  await run('{ currentSeason { id } }', second);

  // A fresh rootValue per request means a redeploy is never served stale data
  // from a previous query's cache.
  assert.deepEqual(second.calls, first.calls);
  assert.ok(second.calls.includes('/vqar/data/index.json'));
});

test('a failed read errors its field and stops there, without reading further', async () => {
  const assetsStub = createPathFetchStub({});  // every path 404s

  const result = await run('{ currentSeason { id } }', assetsStub);

  assert.ok(result.errors?.length, 'the failed index read should surface as an error');
  assert.equal(result.data.currentSeason, null);
  assert.deepEqual(assetsStub.calls, ['/vqar/data/index.json'], 'no season read once the index failed');
});

test('a request that failed leaves nothing behind for the next one', async () => {
  const failing = createPathFetchStub({});
  const failed = await run('{ currentSeason { id } }', failing);
  assert.ok(failed.errors?.length);

  // Each request builds its own rootValue, so a failure is never cached past it.
  const working = createPathFetchStub(routes());
  const result = await run('{ currentSeason { id } }', working);
  assert.equal(result.errors, undefined);
  assert.equal(result.data.currentSeason.id, 'summer-2026');
});

test('toReviewShows and notReviewingShows expose the optional notes; plain strings get empty defaults', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': makeSeason({
      id: 'summer-2026',
      name: 'Summer 2026',
      shows: [],
      toReview: ['Plain Pending', { title: 'Dated Pending', streaming: ['hulu'], premieres: '2026-10-08' }],
      notReviewing: ['Plain Skipped', { title: 'Paywalled', reason: 'Another $13/mo', streaming: ['oceanveil'] }, { title: 'No US Stream', reason: 'Not streaming in the US' }],
    }),
    '/vqar/data/seasons/spring-2026.json': seasons['/vqar/data/seasons/spring-2026.json'],
  });

  const result = await run(
    '{ currentSeason { toReview notReviewing toReviewShows { title streaming premieres availableNow } notReviewingShows { title reason streaming } } }',
    assetsStub
  );
  assert.equal(result.errors, undefined);
  const season = result.data.currentSeason;
  // The string lists keep their old shape whichever form an entry was committed in.
  assert.deepEqual(season.toReview, ['Plain Pending', 'Dated Pending']);
  assert.deepEqual(season.notReviewing, ['Plain Skipped', 'Paywalled', 'No US Stream']);
  assert.deepEqual(season.toReviewShows, [
    { title: 'Plain Pending', streaming: [], premieres: null, availableNow: false },
    { title: 'Dated Pending', streaming: ['hulu'], premieres: '2026-10-08', availableNow: false },
  ]);
  assert.deepEqual(season.notReviewingShows, [
    { title: 'Plain Skipped', reason: null, streaming: [] },
    { title: 'Paywalled', reason: 'Another $13/mo', streaming: ['oceanveil'] },
    { title: 'No US Stream', reason: 'Not streaming in the US', streaming: [] },
  ]);
});

test('toReviewShows and notReviewingShows pass the per-service links through, null when absent', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': makeSeason({
      id: 'summer-2026',
      name: 'Summer 2026',
      shows: [],
      toReview: [{ title: 'Linked', streaming: ['crunchyroll'], crunchyrollUrl: 'https://www.crunchyroll.com/series/X/linked' }, 'Plain'],
      notReviewing: [{ title: 'Skip Linked', netflixUrl: 'https://www.netflix.com/title/1' }],
    }),
    '/vqar/data/seasons/spring-2026.json': seasons['/vqar/data/seasons/spring-2026.json'],
  });

  const result = await run(
    '{ currentSeason { toReviewShows { title crunchyrollUrl netflixUrl youtubeUrl } notReviewingShows { title netflixUrl crunchyrollUrl } } }',
    assetsStub
  );
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.toReviewShows, [
    { title: 'Linked', crunchyrollUrl: 'https://www.crunchyroll.com/series/X/linked', netflixUrl: null, youtubeUrl: null },
    { title: 'Plain', crunchyrollUrl: null, netflixUrl: null, youtubeUrl: null },
  ]);
  assert.deepEqual(result.data.currentSeason.notReviewingShows, [
    { title: 'Skip Linked', netflixUrl: 'https://www.netflix.com/title/1', crunchyrollUrl: null },
  ]);
});

test('a liked OP/ED comes through the API as a boolean', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': makeSeason({
      ...seasons['/vqar/data/seasons/summer-2026.json'],
      shows: [makeShow({ titleEN: 'Bop Show', ratingText: 'Meh', dateReviewed: '2026-07-01T12:00:00Z', op: [1] })],
    }),
  });
  const result = await run('{ currentSeason { shows { titleEN op ed } } }', assetsStub);
  assert.deepEqual(result.data.currentSeason.shows, [{ titleEN: 'Bop Show', op: true, ed: null }]);
});

test('numbered OP/ED likings come through as booleans plus the numbers', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': makeSeason({
      ...seasons['/vqar/data/seasons/summer-2026.json'],
      shows: [
        makeShow({ titleEN: 'Numbered', ratingText: 'Meh', dateReviewed: '2026-07-01T12:00:00Z', op: [2, 1], ed: [3] }),
        makeShow({ titleEN: 'First', ratingText: 'Meh', dateReviewed: '2026-07-02T12:00:00Z', op: [1] }),
        makeShow({ titleEN: 'Neither', ratingText: 'Meh', dateReviewed: '2026-07-03T12:00:00Z' }),
      ],
    }),
  });
  const result = await run('{ currentSeason { shows { titleEN op opNumbers ed edNumbers } } }', assetsStub);
  assert.deepEqual(result.data.currentSeason.shows, [
    { titleEN: 'Numbered', op: true, opNumbers: [1, 2], ed: true, edNumbers: [3] },
    { titleEN: 'First', op: true, opNumbers: [1], ed: null, edNumbers: null },
    { titleEN: 'Neither', op: null, opNumbers: null, ed: null, edNumbers: null },
  ]);
});

test('a watched record comes through the API, its season and episode as numbers', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': makeSeason({
      ...seasons['/vqar/data/seasons/summer-2026.json'],
      shows: [
        makeShow({ titleEN: 'Done', ratingText: 'Meh', dateReviewed: '2026-07-01T12:00:00Z', watched: { from: '2026-04-01', to: '2026-06-10' } }),
        makeShow({ titleEN: 'Partway', ratingText: 'Meh', dateReviewed: '2026-07-02T12:00:00Z', watched: { from: '2026-04-02', to: '2026-05-01', episode: 6 } }),
        makeShow({ titleEN: 'Seasons', ratingText: 'Meh', dateReviewed: '2026-07-03T12:00:00Z', watched: { from: '2026-04-03', season: 2, episode: 6 } }),
        makeShow({ titleEN: 'Unrecorded', ratingText: 'Meh', dateReviewed: '2026-07-04T12:00:00Z' }),
      ],
    }),
  });
  const result = await run('{ currentSeason { shows { titleEN watched { from to season episode } } } }', assetsStub);
  assert.deepEqual(result.data.currentSeason.shows, [
    { titleEN: 'Done', watched: { from: '2026-04-01', to: '2026-06-10', season: null, episode: null } },
    { titleEN: 'Partway', watched: { from: '2026-04-02', to: '2026-05-01', season: null, episode: 6 } },
    { titleEN: 'Seasons', watched: { from: '2026-04-03', to: null, season: 2, episode: 6 } },
    { titleEN: 'Unrecorded', watched: null },
  ]);
});

test('finishedSeason comes through the API as a boolean', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': makeSeason({
      ...seasons['/vqar/data/seasons/summer-2026.json'],
      shows: [makeShow({ titleEN: 'Done Show', ratingText: 'Meh', dateReviewed: '2026-07-01T12:00:00Z', finishedSeason: true })],
    }),
  });
  const result = await run('{ currentSeason { shows { titleEN finishedSeason } } }', assetsStub);
  assert.deepEqual(result.data.currentSeason.shows, [{ titleEN: 'Done Show', finishedSeason: true }]);
});

test('finishedDate comes through the API as a string', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': makeSeason({
      ...seasons['/vqar/data/seasons/summer-2026.json'],
      shows: [makeShow({ titleEN: 'Done Show', ratingText: 'Meh', dateReviewed: '2026-07-01T12:00:00Z', finishedSeason: true, finishedDate: '2026-10-26' })],
    }),
  });
  const result = await run('{ currentSeason { shows { titleEN finishedDate } } }', assetsStub);
  assert.deepEqual(result.data.currentSeason.shows, [{ titleEN: 'Done Show', finishedDate: '2026-10-26' }]);
});

test('a review carries its generated AniList format, genres, tags and studios', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': makeSeason({
      ...seasons['/vqar/data/seasons/summer-2026.json'],
      shows: [
        makeShow({ titleEN: 'Tagged', ratingText: 'Meh', dateReviewed: '2026-07-01T12:00:00Z', anilistId: 1, anilist: { format: 'TV', genres: ['Action'], tags: ['Isekai'], studios: ['GoHands'] } }),
        makeShow({ titleEN: 'Untagged', ratingText: 'Meh', dateReviewed: '2026-07-02T12:00:00Z' }),
      ],
    }),
  });
  const result = await run('{ currentSeason { shows { titleEN anilist { format genres tags studios } } } }', assetsStub);
  assert.deepEqual(result.data.currentSeason.shows, [
    { titleEN: 'Tagged', anilist: { format: 'TV', genres: ['Action'], tags: ['Isekai'], studios: ['GoHands'] } },
    { titleEN: 'Untagged', anilist: null },
  ]);
});

// --- The schema and the validator agree on the shape ---

const fieldNames = (type) => Object.keys(schema.getType(type).getFields());

test('Review exposes exactly the keys validation allows, plus the season it was read from and the numbered OP/EDs', () => {
  assert.deepEqual(fieldNames('Review').sort(), [...REVIEW_KEYS, 'season', 'seasonName', 'opNumbers', 'edNumbers'].sort());
});

test('Watched exposes exactly the keys a review\'s watched record may carry', () => {
  assert.deepEqual(fieldNames('Watched').sort(), [...WATCHED_KEYS].sort());
});

test('SubReview exposes exactly the keys a fullReview may carry', () => {
  assert.deepEqual(fieldNames('SubReview').sort(), [...FULL_REVIEW_KEYS].sort());
});

test('ToReviewShow and NotReviewingShow expose exactly the keys their list entries may carry', () => {
  assert.deepEqual(fieldNames('ToReviewShow').sort(), [...LIST_ENTRY_KEYS.toReview].sort());
  assert.deepEqual(fieldNames('NotReviewingShow').sort(), [...LIST_ENTRY_KEYS.notReviewing].sort());
});

test('Season.lineup is true for a season reviewed live and false for the Backlog shelf; airedLabel passes through', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': {
      currentSeason: 'summer-2026',
      seasons: [
        { id: 'summer-2026', name: 'Summer 2026', file: '/vqar/data/seasons/summer-2026.json' },
        { id: 'backlog', name: 'Backlog', file: '/vqar/data/seasons/backlog.json' },
      ],
    },
    '/vqar/data/seasons/summer-2026.json': seasons['/vqar/data/seasons/summer-2026.json'],
    '/vqar/data/seasons/backlog.json': makeSeason({
      id: 'backlog',
      name: 'Backlog',
      sortKey: 0,
      shows: [
        makeShow({ titleEN: 'Paranoia Agent', ratingNumber: 5, ratingText: 'Peak', dateReviewed: '2026-05-19T08:00:00-04:00', airedLabel: 'Winter 2004' }),
        makeShow({ titleEN: 'Untagged Old Show', ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-05-20T08:00:00-04:00' }),
      ],
      toReview: [],
      notReviewing: [],
    }),
  });

  const result = await run('{ currentSeason { lineup } backlog: season(id: "backlog") { lineup shows { titleEN airedLabel season } } }', assetsStub);
  assert.equal(result.errors, undefined);
  assert.equal(result.data.currentSeason.lineup, true);
  assert.equal(result.data.backlog.lineup, false);
  assert.deepEqual(result.data.backlog.shows, [
    { titleEN: 'Paranoia Agent', airedLabel: 'Winter 2004', season: 'backlog' },
    { titleEN: 'Untagged Old Show', airedLabel: null, season: 'backlog' },
  ]);
});
