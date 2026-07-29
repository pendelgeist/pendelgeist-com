import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graphql, buildSchema } from 'graphql';
import { typeDefs, makeRootValue } from '../src/schema.js';
import { createFetchStub } from './helpers.js';

// Mirrors the manifest/season gist shapes used by test/vqar.test.js.
const manifest = {
  currentSeason: 'summer-2026',
  seasons: [
    { id: 'summer-2026', name: 'Summer 2026', file: 'https://gist.githubusercontent.com/pendelgeist/aaa/raw/vqar-season-summer-2026.json' },
    { id: 'spring-2026', name: 'Spring 2026', file: 'https://gist.githubusercontent.com/pendelgeist/bbb/raw/vqar-season-spring-2026.json' },
  ],
};

const seasons = {
  'vqar-season-summer-2026.json': {
    id: 'summer-2026',
    name: 'Summer 2026',
    reviewed: [{ titleEN: 'Summer Show', ratingNumber: 5, ratingText: 'Nice Ep Broh', review: 'great', dateReviewed: '2026-07-01' }],
    pending: ['Pending Summer Show'],
    skipped: [],
  },
  'vqar-season-spring-2026.json': {
    id: 'spring-2026',
    name: 'Spring 2026',
    reviewed: [],
    pending: [],
    skipped: ['Skipped Spring Show'],
  },
};

function routes() {
  return { 'vqar-manifest.json': manifest, ...seasons };
}

const schema = buildSchema(typeDefs);

async function run(query, fetchStub = createFetchStub(routes())) {
  global.fetch = fetchStub;
  const result = await graphql({ schema, source: query, rootValue: makeRootValue() });
  // graphql-js builds result objects with a null prototype; round-trip through
  // JSON so assert's strict deepEqual compares plain-object structure only.
  return { ...result, data: result.data && JSON.parse(JSON.stringify(result.data)) };
}

test('seasons returns an id/name summary for every manifest entry', async () => {
  const result = await run('{ seasons { id name } }');
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.seasons, [
    { id: 'summer-2026', name: 'Summer 2026' },
    { id: 'spring-2026', name: 'Spring 2026' },
  ]);
});

test('currentSeason resolves the manifest\'s currentSeason with full review data', async () => {
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

test('season(id) returns null for an id not in the manifest', async () => {
  const result = await run('{ season(id: "nope") { name } }');
  assert.equal(result.errors, undefined);
  assert.equal(result.data.season, null);
});

test('anilistId passes through when set on a review, and is null when absent', async () => {
  const fetchStub = createFetchStub({
    'vqar-manifest.json': manifest,
    'vqar-season-summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [{ titleEN: 'Linked Show', ratingText: 'Meh', dateReviewed: '2026-07-01', anilistId: 154587 }],
      pending: [],
      skipped: [],
    },
    'vqar-season-spring-2026.json': seasons['vqar-season-spring-2026.json'],
  });

  const result = await run('{ currentSeason { reviewed { titleEN anilistId } } }', fetchStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.reviewed, [{ titleEN: 'Linked Show', anilistId: 154587 }]);

  const result2 = await run('{ season(id: "spring-2026") { reviewed { anilistId } } }');
  assert.equal(result2.errors, undefined);
  assert.deepEqual(result2.data.season.reviewed, []);
});

test('annId and streaming pass through when set on a review', async () => {
  const fetchStub = createFetchStub({
    'vqar-manifest.json': manifest,
    'vqar-season-summer-2026.json': {
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
    'vqar-season-spring-2026.json': seasons['vqar-season-spring-2026.json'],
  });

  const result = await run('{ currentSeason { reviewed { titleEN annId streaming } } }', fetchStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.reviewed, [
    { titleEN: 'Linked Show', annId: 22622, streaming: ['crunchyroll', 'netflix'] },
  ]);
});

test('crunchyrollUrl passes through when set on a review, and is null when absent', async () => {
  const fetchStub = createFetchStub({
    'vqar-manifest.json': manifest,
    'vqar-season-summer-2026.json': {
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
    'vqar-season-spring-2026.json': seasons['vqar-season-spring-2026.json'],
  });

  const result = await run('{ currentSeason { reviewed { titleEN crunchyrollUrl } } }', fetchStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.reviewed, [
    { titleEN: 'Streamed Show', crunchyrollUrl: 'https://www.crunchyroll.com/series/ABC123/streamed-show' },
  ]);

  const result2 = await run('{ season(id: "spring-2026") { reviewed { crunchyrollUrl } } }');
  assert.equal(result2.errors, undefined);
  assert.deepEqual(result2.data.season.reviewed, []);
});

test('hidiveUrl and netflixUrl pass through when set on a review', async () => {
  const fetchStub = createFetchStub({
    'vqar-manifest.json': manifest,
    'vqar-season-summer-2026.json': {
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
    'vqar-season-spring-2026.json': seasons['vqar-season-spring-2026.json'],
  });

  const result = await run('{ currentSeason { reviewed { titleEN hidiveUrl netflixUrl } } }', fetchStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.reviewed, [
    { titleEN: 'Streamed Show', hidiveUrl: 'https://www.hidive.com/season/streamed-show', netflixUrl: 'https://www.netflix.com/title/12345' },
  ]);
});

test('watchProgress passes through when set on a review, and is null when absent', async () => {
  const fetchStub = createFetchStub({
    'vqar-manifest.json': manifest,
    'vqar-season-summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [{ titleEN: 'Revisited Show', ratingText: 'Yeah', dateReviewed: '2026-07-01', watchProgress: 'Ep 3' }],
      pending: [],
      skipped: [],
    },
    'vqar-season-spring-2026.json': seasons['vqar-season-spring-2026.json'],
  });

  const result = await run('{ currentSeason { reviewed { titleEN watchProgress } } }', fetchStub);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data.currentSeason.reviewed, [{ titleEN: 'Revisited Show', watchProgress: 'Ep 3' }]);

  const result2 = await run('{ season(id: "spring-2026") { reviewed { watchProgress } } }');
  assert.equal(result2.errors, undefined);
  assert.deepEqual(result2.data.season.reviewed, []);
});

test('a failed gist fetch surfaces as a GraphQL error instead of throwing', async () => {
  const failingFetch = async () => ({ ok: false, status: 500 });
  const result = await run('{ currentSeason { name } }', failingFetch);
  assert.ok(result.errors && result.errors.length > 0);
  assert.equal(result.data.currentSeason, null);
});
