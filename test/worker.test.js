import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const DATA = {
  '/vqar/data/index.json': {
    currentSeason: 'summer-2026',
    seasons: [{ id: 'summer-2026', name: 'Summer 2026', file: '/vqar/data/seasons/summer-2026.json' }],
  },
  '/vqar/data/seasons/summer-2026.json': {
    id: 'summer-2026',
    name: 'Summer 2026',
    reviewed: [],
    pending: [],
    skipped: [],
  },
};

/**
 * Stands in for the assets binding, which now serves two jobs: the static
 * passthrough for ordinary requests, and the VQAR data the GraphQL resolvers
 * read. `input` is a Request on the passthrough path and a URL from the
 * resolvers, so accept either.
 */
function fakeEnv() {
  return {
    ASSETS: {
      fetch: async (input) => {
        const { pathname } = new URL(input.url ?? input);
        return pathname in DATA
          ? Response.json(DATA[pathname])
          : new Response(`asset:${pathname}`);
      },
    },
  };
}

test('GET on a non-graphql path falls through to the assets binding', async () => {
  const response = await worker.fetch(new Request('https://pendelgeist.com/vqar'), fakeEnv());
  assert.equal(await response.text(), 'asset:/vqar');
});

test('GET /graphql serves the explorer page as a static asset', async () => {
  const response = await worker.fetch(new Request('https://pendelgeist.com/graphql'), fakeEnv());
  assert.equal(await response.text(), 'asset:/graphql');
});

test('POST /graphql executes a query and returns JSON', async () => {
  const response = await worker.fetch(
    new Request('https://pendelgeist.com/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ seasons { id name } }' }),
    }),
    fakeEnv()
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data.seasons, [{ id: 'summer-2026', name: 'Summer 2026' }]);
});

test('POST /graphql without a query returns a 400', async () => {
  const response = await worker.fetch(
    new Request('https://pendelgeist.com/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }),
    fakeEnv()
  );
  assert.equal(response.status, 400);
});

test('POST /graphql with a non-JSON body returns a 415', async () => {
  const response = await worker.fetch(
    new Request('https://pendelgeist.com/graphql', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'not json',
    }),
    fakeEnv()
  );
  assert.equal(response.status, 415);
});

test('OPTIONS /graphql answers the CORS preflight', async () => {
  const response = await worker.fetch(
    new Request('https://pendelgeist.com/graphql', { method: 'OPTIONS' }),
    fakeEnv()
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
});
