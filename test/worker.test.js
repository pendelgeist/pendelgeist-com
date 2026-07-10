import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { createFetchStub } from './helpers.js';

const manifest = {
  currentSeason: 'summer-2026',
  seasons: [{ id: 'summer-2026', name: 'Summer 2026', file: 'https://gist.githubusercontent.com/pendelgeist/aaa/raw/vqar-season-summer-2026.json' }],
};

const seasonFile = {
  id: 'summer-2026',
  name: 'Summer 2026',
  reviewed: [],
  pending: [],
  skipped: [],
};

function routes() {
  return { 'vqar-manifest.json': manifest, 'vqar-season-summer-2026.json': seasonFile };
}

function fakeEnv() {
  return {
    ASSETS: {
      fetch: async (request) => new Response(`asset:${new URL(request.url).pathname}`),
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
  global.fetch = createFetchStub(routes());
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
