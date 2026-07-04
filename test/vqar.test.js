import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, createFetchStub, createLocalStorageStub, waitFor } from './helpers.js';

// Each season's "file" is an absolute URL to its own gist, mirroring how the
// real manifest points at three separate gists rather than one shared one.
const manifest = {
  currentSeason: 'summer-2026',
  seasons: [
    { id: 'summer-2026', name: 'Summer 2026', file: 'https://gist.githubusercontent.com/pendelgeist/aaa/raw/vqar-season-summer-2026.json' },
    { id: 'spring-2026', name: 'Spring 2026', file: 'https://gist.githubusercontent.com/pendelgeist/bbb/raw/vqar-season-spring-2026.json' },
    { id: 'winter-2026', name: 'Winter 2026', file: 'https://gist.githubusercontent.com/pendelgeist/ccc/raw/vqar-season-winter-2026.json' },
  ],
};

const seasons = {
  'vqar-season-summer-2026.json': {
    id: 'summer-2026',
    name: 'Summer 2026',
    reviewed: [{ titleEN: 'Summer Show', ratingNumber: 5, ratingText: 'Nice Ep Broh', review: 'great', dateReviewed: '2026-07-01' }],
    pending: ['Pending Summer Show'],
    skipped: ['Skipped Summer Show'],
  },
  'vqar-season-spring-2026.json': {
    id: 'spring-2026',
    name: 'Spring 2026',
    reviewed: [{ titleEN: 'Spring Show', ratingNumber: 3, ratingText: 'Meh', review: 'ok', dateReviewed: '2026-04-01' }],
    pending: [],
    skipped: [],
  },
  'vqar-season-winter-2026.json': {
    id: 'winter-2026',
    name: 'Winter 2026',
    reviewed: [{ titleEN: 'Winter Show', ratingNumber: 1, ratingText: 'Streaming Garbage', review: 'bad', dateReviewed: '2026-01-01' }],
    pending: [],
    skipped: [],
  },
};

function routes() {
  return { 'vqar-manifest.json': manifest, ...seasons };
}

function titles(document) {
  return [...document.querySelectorAll('.entry-title')].map((el) => el.textContent);
}

function selectSeason(document, value) {
  const select = document.getElementById('seasonFilter');
  select.value = value;
  select.dispatchEvent(new document.defaultView.Event('change'));
}

test('initial load fetches only the manifest and the current season', async () => {
  const fetch = createFetchStub(routes());
  const { document } = await loadApp({ fetch });

  assert.deepEqual(fetch.calls, ['vqar-manifest.json', 'vqar-season-summer-2026.json']);
  assert.equal(document.getElementById('currentSeasonName').textContent, 'Summer 2026');
  assert.deepEqual(titles(document), ['Summer Show']);
  assert.deepEqual(
    [...document.querySelectorAll('#pendingShows li')].map((li) => li.textContent),
    ['Pending Summer Show']
  );
  assert.deepEqual(
    [...document.querySelectorAll('#skippedShows li')].map((li) => li.textContent),
    ['Skipped Summer Show']
  );
});

test('season dropdown is populated from the manifest, current season selected', async () => {
  const fetch = createFetchStub(routes());
  const { document } = await loadApp({ fetch });

  const options = [...document.querySelectorAll('#seasonFilter option')];
  assert.deepEqual(
    options.map((o) => o.value),
    ['all', 'summer-2026', 'spring-2026', 'winter-2026']
  );
  assert.equal(document.getElementById('seasonFilter').value, 'summer-2026');
});

test('selecting an unloaded season fetches only that season and caches it', async () => {
  const fetch = createFetchStub(routes());
  const localStorage = createLocalStorageStub();
  const { document } = await loadApp({ fetch, localStorage });

  fetch.calls.length = 0;
  selectSeason(document, 'spring-2026');
  await waitFor(() => titles(document).includes('Spring Show'));

  assert.deepEqual(fetch.calls, ['vqar-season-spring-2026.json']);
  assert.equal(localStorage.getItem('vqar:v1:season:spring-2026') !== null, true);
});

test('re-selecting an already-loaded season does not re-fetch', async () => {
  const fetch = createFetchStub(routes());
  const { document } = await loadApp({ fetch });

  selectSeason(document, 'spring-2026');
  await waitFor(() => titles(document).includes('Spring Show'));

  fetch.calls.length = 0;
  selectSeason(document, 'summer-2026');
  await waitFor(() => titles(document).includes('Summer Show'));

  assert.deepEqual(fetch.calls, []);
});

test('"All Seasons" loads whatever is missing and sorts by most recent', async () => {
  const fetch = createFetchStub(routes());
  const { document } = await loadApp({ fetch });

  fetch.calls.length = 0;
  selectSeason(document, 'all');
  await waitFor(() => titles(document).length === 3);

  assert.deepEqual(fetch.calls, ['vqar-season-spring-2026.json', 'vqar-season-winter-2026.json']);
  assert.deepEqual(titles(document), ['Summer Show', 'Spring Show', 'Winter Show']);
});

test('search filters the currently loaded reviews', async () => {
  const fetch = createFetchStub(routes());
  const { document } = await loadApp({ fetch });

  selectSeason(document, 'all');
  await waitFor(() => titles(document).length === 3);

  const searchInput = document.getElementById('searchInput');
  searchInput.value = 'winter';
  searchInput.dispatchEvent(new document.defaultView.Event('input'));

  assert.deepEqual(titles(document), ['Winter Show']);
});

test('a season cached from a previous page load is not re-fetched, but the current season always is', async () => {
  const localStorage = createLocalStorageStub();

  const firstLoadFetch = createFetchStub(routes());
  const first = await loadApp({ fetch: firstLoadFetch, localStorage });
  selectSeason(first.document, 'winter-2026');
  await waitFor(() => titles(first.document).includes('Winter Show'));

  const secondLoadFetch = createFetchStub(routes());
  const second = await loadApp({ fetch: secondLoadFetch, localStorage });

  assert.deepEqual(secondLoadFetch.calls, ['vqar-manifest.json', 'vqar-season-summer-2026.json']);

  secondLoadFetch.calls.length = 0;
  selectSeason(second.document, 'winter-2026');
  await waitFor(() => titles(second.document).includes('Winter Show'));
  assert.deepEqual(secondLoadFetch.calls, []);
});

test('a manifest load failure shows an error instead of crashing', async () => {
  const fetch = async () => ({ ok: false, status: 500 });
  const { document } = await loadApp({ fetch });

  assert.match(document.getElementById('reviewedShows').textContent, /ERROR/);
});

test('a season data load failure (e.g. a stale/wrong URL in the manifest) is shown on the page', async () => {
  const { 'vqar-season-summer-2026.json': _omitted, ...seasonsMinusSummer } = seasons;
  const fetch = createFetchStub({ 'vqar-manifest.json': manifest, ...seasonsMinusSummer });
  const { document } = await loadApp({ fetch });

  await waitFor(() => /ERROR/.test(document.getElementById('reviewedShows').textContent));
  assert.match(document.getElementById('reviewedShows').textContent, /Summer 2026/);
});
