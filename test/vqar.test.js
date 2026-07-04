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

function search(document, value) {
  const input = document.getElementById('searchInput');
  input.value = value;
  input.dispatchEvent(new document.defaultView.Event('input'));
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

test('"All Seasons" loads whatever is missing, sorts by most recent, and caches what it loaded', async () => {
  const fetch = createFetchStub(routes());
  const localStorage = createLocalStorageStub();
  const { document } = await loadApp({ fetch, localStorage });

  fetch.calls.length = 0;
  selectSeason(document, 'all');
  await waitFor(() => titles(document).length === 3);

  assert.deepEqual(fetch.calls, ['vqar-season-spring-2026.json', 'vqar-season-winter-2026.json']);
  assert.deepEqual(titles(document), ['Summer Show', 'Spring Show', 'Winter Show']);
  assert.ok(localStorage.getItem('vqar:v1:season:spring-2026') !== null);
  assert.ok(localStorage.getItem('vqar:v1:season:winter-2026') !== null);
});

test('search filters within "All Seasons" once all seasons are loaded', async () => {
  const fetch = createFetchStub(routes());
  const { document } = await loadApp({ fetch });

  selectSeason(document, 'all');
  await waitFor(() => titles(document).length === 3);

  search(document, 'winter');

  assert.deepEqual(titles(document), ['Winter Show']);
});

test('search only looks within the season the dropdown is scoped to, not other unloaded seasons', async () => {
  const fetch = createFetchStub(routes());
  const { document } = await loadApp({ fetch });

  // Still on the current season (summer-2026); a search matching only another
  // season's content shouldn't reach into seasons the dropdown doesn't cover.
  search(document, 'winter');

  assert.deepEqual(titles(document), []);
  assert.match(document.getElementById('reviewedShows').textContent, /NO REVIEWS FOUND/);
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

test('a full-series re-review and OP/ED notes render as addenda below the main review', async () => {
  const fetch = createFetchStub({
    'vqar-manifest.json': manifest,
    'vqar-season-summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [{
        titleEN: 'Summer Show',
        ratingNumber: 4,
        ratingText: 'Finish Ep',
        review: 'great start',
        dateReviewed: '2026-07-01',
        fullReview: { ratingNumber: 5, ratingText: 'Nice Ep Broh', review: 'stuck the landing', dateReviewed: '2026-09-20' },
        op: { ratingText: 'Bop of the year', review: 'incredible guitar riff', dateReviewed: '2026-07-05' },
        ed: { ratingText: 'Catchy AF', review: 'still stuck in my head', dateReviewed: '2026-07-06' },
      }],
      pending: [],
      skipped: [],
    },
  });
  const { document } = await loadApp({ fetch });

  const labels = [...document.querySelectorAll('.entry-addendum-label')].map((el) => el.textContent);
  assert.deepEqual(labels, ['Full Series', 'OP', 'ED']);
  assert.match(document.getElementById('reviewedShows').textContent, /stuck the landing/);
  assert.match(document.getElementById('reviewedShows').textContent, /incredible guitar riff/);
  assert.match(document.getElementById('reviewedShows').textContent, /still stuck in my head/);
});

test('search matches text inside a full-series re-review or OP/ED note, not just the main review', async () => {
  const fetch = createFetchStub({
    'vqar-manifest.json': manifest,
    'vqar-season-summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [{
        titleEN: 'Summer Show',
        ratingNumber: 4,
        ratingText: 'Finish Ep',
        review: 'great start',
        dateReviewed: '2026-07-01',
        ed: { ratingText: 'Catchy AF', review: 'best ending song of the year', dateReviewed: '2026-07-06' },
      }],
      pending: [],
      skipped: [],
    },
  });
  const { document } = await loadApp({ fetch });

  search(document, 'best ending song');

  assert.deepEqual(titles(document), ['Summer Show']);
});
