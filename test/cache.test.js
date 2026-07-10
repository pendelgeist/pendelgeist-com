import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cachedFetch } from '../src/cache.js';

function createCacheStub() {
  const store = new Map();
  return {
    match: async (key) => store.get(String(key)),
    put: async (key, response) => {
      store.set(String(key), response);
    },
  };
}

test('a second request for the same URL is served from cache, not re-fetched', async () => {
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount++;
    return new Response(JSON.stringify({ hits: fetchCount }), { status: 200 });
  };
  global.caches = { default: createCacheStub() };

  try {
    const first = await cachedFetch('https://example.test/data.json');
    const second = await cachedFetch('https://example.test/data.json');

    assert.equal(fetchCount, 1);
    assert.deepEqual(await first.json(), { hits: 1 });
    assert.deepEqual(await second.json(), { hits: 1 });
  } finally {
    delete global.caches;
  }
});

test('different URLs are cached independently', async () => {
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount++;
    return new Response('ok', { status: 200 });
  };
  global.caches = { default: createCacheStub() };

  try {
    await cachedFetch('https://example.test/a.json');
    await cachedFetch('https://example.test/b.json');

    assert.equal(fetchCount, 2);
  } finally {
    delete global.caches;
  }
});

test('a non-ok response is never cached', async () => {
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount++;
    return new Response('server error', { status: 500 });
  };
  global.caches = { default: createCacheStub() };

  try {
    await cachedFetch('https://example.test/broken.json');
    const second = await cachedFetch('https://example.test/broken.json');

    assert.equal(fetchCount, 2);
    assert.equal(second.status, 500);
  } finally {
    delete global.caches;
  }
});

test('without a caches binding available, every call re-fetches', async () => {
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount++;
    return new Response('ok', { status: 200 });
  };
  delete global.caches;

  await cachedFetch('https://example.test/no-cache-binding.json');
  await cachedFetch('https://example.test/no-cache-binding.json');

  assert.equal(fetchCount, 2);
});
