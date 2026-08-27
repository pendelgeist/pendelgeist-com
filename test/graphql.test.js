import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graphql, buildSchema } from 'graphql';
import { typeDefs, makeRootValue } from '../src/schema.js';
import { createPathFetchStub } from './helpers.js';

// Mirrors the index/season file shapes used by test/vqar.test.js.
const seasonIndex = {
  currentSeason: 'summer-2026',
  seasons: [
    { id: 'summer-2026', name: 'Summer 2026', file: '/vqar/data/seasons/summer-2026.json' },
    { id: 'spring-2026', name: 'Spring 2026', file: '/vqar/data/seasons/spring-2026.json' },
  ],
};

const seasons = {
  '/vqar/data/seasons/summer-2026.json': {
    id: 'summer-2026',
    name: 'Summer 2026',
    reviewed: [{ titleEN: 'Summer Show', ratingNumber: 5, ratingText: 'Nice Ep Broh', review: 'great', dateReviewed: '2026-07-01' }],
    pending: ['Pending Summer Show'],
    skipped: [],
  },
  '/vqar/data/seasons/spring-2026.json': {
    id: 'spring-2026',
    name: 'Spring 2026',
    reviewed: [],
    pending: [],
    skipped: ['Skipped Spring Show'],
  },
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
  const result = await run('{ currentSeason { id name reviewed { titleEN ratingText season seasonName } pending skipped } }');
  assert.equal(result.errors, undefined);
  assert.equal(result.data.currentSeason.id, 'summer-2026');
  assert.deepEqual(result.data.currentSeason.reviewed, [
    { titleEN: 'Summer Show', ratingText: 'Nice Ep Broh', season: 'summer-2026', seasonName: 'Summer 2026' },
  ]);
  assert.deepEqual(result.data.currentSeason.pending, ['Pending Summer Show']);
});

test('season(id) resolves a specific season by id', async () => {
  const result = await run('{ season(id: "spring-2026") { name skipped } }');
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.season, { name: 'Spring 2026', skipped: ['Skipped Spring Show'] });
});

test('season(id) returns null for an id not in the index', async () => {
  const result = await run('{ season(id: "nope") { name } }');
  assert.equal(result.errors, undefined);
  assert.equal(result.data.season, null);
});

test('anilistId passes through when set on a review, and is null when absent', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [{ titleEN: 'Linked Show', ratingText: 'Meh', dateReviewed: '2026-07-01', anilistId: 154587 }],
      pending: [],
      skipped: [],
    },
    '/vqar/data/seasons/spring-2026.json': seasons['/vqar/data/seasons/spring-2026.json'],
  });

  const result = await run('{ currentSeason { reviewed { titleEN anilistId } } }', assetsStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.reviewed, [{ titleEN: 'Linked Show', anilistId: 154587 }]);

  const result2 = await run('{ season(id: "spring-2026") { reviewed { anilistId } } }');
  assert.equal(result2.errors, undefined);
  assert.deepEqual(result2.data.season.reviewed, []);
});

test('Wikipedia URLs pass through when set on a review', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [{
        titleEN: 'Documented Show',
        ratingText: 'Meh',
        dateReviewed: '2026-07-01',
        wikipediaUrl: 'https://en.wikipedia.org/wiki/Documented_Show',
        wikipediaJaUrl: 'https://ja.wikipedia.org/wiki/\u745E\u9E97',
      }],
      pending: [],
      skipped: [],
    },
    '/vqar/data/seasons/spring-2026.json': seasons['/vqar/data/seasons/spring-2026.json'],
  });

  const result = await run('{ currentSeason { reviewed { titleEN wikipediaUrl wikipediaJaUrl } } }', assetsStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.reviewed, [{
    titleEN: 'Documented Show',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Documented_Show',
    wikipediaJaUrl: 'https://ja.wikipedia.org/wiki/\u745E\u9E97',
  }]);
});

test('annId and streaming pass through when set on a review', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [{
        titleEN: 'Linked Show',
        ratingText: 'Meh',
        dateReviewed: '2026-07-01',
        annId: 22622,
        streaming: ['crunchyroll', 'netflix'],
      }],
      pending: [],
      skipped: [],
    },
    '/vqar/data/seasons/spring-2026.json': seasons['/vqar/data/seasons/spring-2026.json'],
  });

  const result = await run('{ currentSeason { reviewed { titleEN annId streaming } } }', assetsStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.reviewed, [
    { titleEN: 'Linked Show', annId: 22622, streaming: ['crunchyroll', 'netflix'] },
  ]);
});

test('crunchyrollUrl passes through when set on a review, and is null when absent', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [{
        titleEN: 'Streamed Show',
        ratingText: 'Meh',
        dateReviewed: '2026-07-01',
        crunchyrollUrl: 'https://www.crunchyroll.com/series/ABC123/streamed-show',
      }],
      pending: [],
      skipped: [],
    },
    '/vqar/data/seasons/spring-2026.json': seasons['/vqar/data/seasons/spring-2026.json'],
  });

  const result = await run('{ currentSeason { reviewed { titleEN crunchyrollUrl } } }', assetsStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.reviewed, [
    { titleEN: 'Streamed Show', crunchyrollUrl: 'https://www.crunchyroll.com/series/ABC123/streamed-show' },
  ]);

  const result2 = await run('{ season(id: "spring-2026") { reviewed { crunchyrollUrl } } }');
  assert.equal(result2.errors, undefined);
  assert.deepEqual(result2.data.season.reviewed, []);
});

test('hidiveUrl and netflixUrl pass through when set on a review', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [{
        titleEN: 'Streamed Show',
        ratingText: 'Meh',
        dateReviewed: '2026-07-01',
        hidiveUrl: 'https://www.hidive.com/season/streamed-show',
        netflixUrl: 'https://www.netflix.com/title/12345',
      }],
      pending: [],
      skipped: [],
    },
    '/vqar/data/seasons/spring-2026.json': seasons['/vqar/data/seasons/spring-2026.json'],
  });

  const result = await run('{ currentSeason { reviewed { titleEN hidiveUrl netflixUrl } } }', assetsStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.reviewed, [
    { titleEN: 'Streamed Show', hidiveUrl: 'https://www.hidive.com/season/streamed-show', netflixUrl: 'https://www.netflix.com/title/12345' },
  ]);
});

test('watchProgress passes through when set on a review, and is null when absent', async () => {
  const assetsStub = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [{ titleEN: 'Revisited Show', ratingText: 'Yeah', dateReviewed: '2026-07-01', watchProgress: 'Ep 3' }],
      pending: [],
      skipped: [],
    },
    '/vqar/data/seasons/spring-2026.json': seasons['/vqar/data/seasons/spring-2026.json'],
  });

  const result = await run('{ currentSeason { reviewed { titleEN watchProgress } } }', assetsStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.reviewed, [{ titleEN: 'Revisited Show', watchProgress: 'Ep 3' }]);

  const result2 = await run('{ season(id: "spring-2026") { reviewed { watchProgress } } }');
  assert.equal(result2.errors, undefined);
  assert.deepEqual(result2.data.season.reviewed, []);
});

test('a failed asset read surfaces as a GraphQL error instead of throwing', async () => {
  const failingAssets = async () => ({ ok: false, status: 500 });
  const result = await run('{ currentSeason { name } }', failingAssets);
  assert.ok(result.errors && result.errors.length > 0);
  assert.equal(result.data.currentSeason, null);
});
