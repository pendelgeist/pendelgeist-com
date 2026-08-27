import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, createPathFetchStub, waitFor } from './helpers.js';

// Each season's "file" is the path to its own committed data file, mirroring
// the index public/vqar/data/index.json is generated into.
const seasonIndex = {
  currentSeason: 'summer-2026',
  seasons: [
    { id: 'summer-2026', name: 'Summer 2026', file: '/vqar/data/seasons/summer-2026.json' },
    { id: 'spring-2026', name: 'Spring 2026', file: '/vqar/data/seasons/spring-2026.json' },
    { id: 'winter-2026', name: 'Winter 2026', file: '/vqar/data/seasons/winter-2026.json' },
  ],
};

const seasons = {
  '/vqar/data/seasons/summer-2026.json': {
    id: 'summer-2026',
    name: 'Summer 2026',
    reviewed: [{ titleEN: 'Summer Show', ratingNumber: 5, ratingText: 'Nice Ep Broh', review: 'great', dateReviewed: '2026-07-01' }],
    pending: ['Pending Summer Show'],
    skipped: ['Skipped Summer Show'],
  },
  '/vqar/data/seasons/spring-2026.json': {
    id: 'spring-2026',
    name: 'Spring 2026',
    reviewed: [{ titleEN: 'Spring Show', ratingNumber: 3, ratingText: 'Meh', review: 'ok', dateReviewed: '2026-04-01' }],
    pending: [],
    skipped: [],
  },
  '/vqar/data/seasons/winter-2026.json': {
    id: 'winter-2026',
    name: 'Winter 2026',
    reviewed: [{ titleEN: 'Winter Show', ratingNumber: 1, ratingText: 'Streaming Garbage', review: 'bad', dateReviewed: '2026-01-01' }],
    pending: [],
    skipped: [],
  },
};

function routes() {
  return { '/vqar/data/index.json': seasonIndex, ...seasons };
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

test('initial load fetches only the index and the current season', async () => {
  const fetch = createPathFetchStub(routes());
  const { document } = await loadApp({ fetch });

  assert.deepEqual(fetch.calls, ['/vqar/data/index.json', '/vqar/data/seasons/summer-2026.json']);
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

test('season dropdown is populated from the index, current season selected', async () => {
  const fetch = createPathFetchStub(routes());
  const { document } = await loadApp({ fetch });

  const options = [...document.querySelectorAll('#seasonFilter option')];
  assert.deepEqual(
    options.map((o) => o.value),
    ['all', 'summer-2026', 'spring-2026', 'winter-2026']
  );
  assert.equal(document.getElementById('seasonFilter').value, 'summer-2026');
});

test('selecting an unloaded season fetches only that season', async () => {
  const fetch = createPathFetchStub(routes());
  const { document } = await loadApp({ fetch });

  fetch.calls.length = 0;
  selectSeason(document, 'spring-2026');
  await waitFor(() => titles(document).includes('Spring Show'));

  assert.deepEqual(fetch.calls, ['/vqar/data/seasons/spring-2026.json']);
});

test('re-selecting an already-loaded season does not re-fetch', async () => {
  const fetch = createPathFetchStub(routes());
  const { document } = await loadApp({ fetch });

  selectSeason(document, 'spring-2026');
  await waitFor(() => titles(document).includes('Spring Show'));

  fetch.calls.length = 0;
  selectSeason(document, 'summer-2026');
  await waitFor(() => titles(document).includes('Summer Show'));

  assert.deepEqual(fetch.calls, []);
});

test('"All Seasons" loads whatever is missing and sorts by most recent', async () => {
  const fetch = createPathFetchStub(routes());
  const { document } = await loadApp({ fetch });

  fetch.calls.length = 0;
  selectSeason(document, 'all');
  await waitFor(() => titles(document).length === 3);

  assert.deepEqual(fetch.calls, ['/vqar/data/seasons/spring-2026.json', '/vqar/data/seasons/winter-2026.json']);
  assert.deepEqual(titles(document), ['Summer Show', 'Spring Show', 'Winter Show']);
});

test('search filters within "All Seasons" once all seasons are loaded', async () => {
  const fetch = createPathFetchStub(routes());
  const { document } = await loadApp({ fetch });

  selectSeason(document, 'all');
  await waitFor(() => titles(document).length === 3);

  search(document, 'winter');

  assert.deepEqual(titles(document), ['Winter Show']);
});

test('search only looks within the season the dropdown is scoped to, not other unloaded seasons', async () => {
  const fetch = createPathFetchStub(routes());
  const { document } = await loadApp({ fetch });

  // Still on the current season (summer-2026); a search matching only another
  // season's content shouldn't reach into seasons the dropdown doesn't cover.
  search(document, 'winter');

  assert.deepEqual(titles(document), []);
  assert.match(document.getElementById('reviewedShows').textContent, /NO REVIEWS FOUND/);
});

test('a fresh page load starts from the index again, carrying nothing over', async () => {
  const firstLoadFetch = createPathFetchStub(routes());
  const first = await loadApp({ fetch: firstLoadFetch });
  selectSeason(first.document, 'winter-2026');
  await waitFor(() => titles(first.document).includes('Winter Show'));

  // No cache of our own survives a page load any more - revalidation against
  // the served asset is what keeps the repeat cost down instead.
  const secondLoadFetch = createPathFetchStub(routes());
  const second = await loadApp({ fetch: secondLoadFetch });

  assert.deepEqual(secondLoadFetch.calls, ['/vqar/data/index.json', '/vqar/data/seasons/summer-2026.json']);

  secondLoadFetch.calls.length = 0;
  selectSeason(second.document, 'winter-2026');
  await waitFor(() => titles(second.document).includes('Winter Show'));
  assert.deepEqual(secondLoadFetch.calls, ['/vqar/data/seasons/winter-2026.json']);
});

test('an index load failure shows an error instead of crashing', async () => {
  const fetch = async () => ({ ok: false, status: 500 });
  const { document } = await loadApp({ fetch });

  assert.match(document.getElementById('reviewedShows').textContent, /ERROR/);
});

test('a season data load failure (e.g. a stale path in the index) is shown on the page', async () => {
  const { '/vqar/data/seasons/summer-2026.json': _omitted, ...seasonsMinusSummer } = seasons;
  const fetch = createPathFetchStub({ '/vqar/data/index.json': seasonIndex, ...seasonsMinusSummer });
  const { document } = await loadApp({ fetch });

  await waitFor(() => /ERROR/.test(document.getElementById('reviewedShows').textContent));
  assert.match(document.getElementById('reviewedShows').textContent, /Summer 2026/);
});

test('a full-series re-review and OP/ED notes render as addenda below the main review', async () => {
  const fetch = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': {
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
  assert.deepEqual(labels, ['Revisit', 'OP', 'ED']);
  assert.match(document.getElementById('reviewedShows').textContent, /stuck the landing/);
  assert.match(document.getElementById('reviewedShows').textContent, /incredible guitar riff/);
  assert.match(document.getElementById('reviewedShows').textContent, /still stuck in my head/);
});

test('a review renders a link per reference site it has, in a fixed order', async () => {
  const fetch = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [
        {
          titleEN: 'Linked Show',
          ratingText: 'Meh',
          dateReviewed: '2026-07-01',
          anilistId: 154587,
          annId: 22622,
          wikipediaUrl: 'https://en.wikipedia.org/wiki/Linked_Show',
          wikipediaJaUrl: 'https://ja.wikipedia.org/wiki/\u745E\u9E97',
        },
        { titleEN: 'Unlinked Show', ratingText: 'Meh', dateReviewed: '2026-07-02' },
      ],
      pending: [],
      skipped: [],
    },
  });
  const { document } = await loadApp({ fetch });

  const links = [...document.querySelectorAll('.entry-external-link')];
  assert.deepEqual(links.map((a) => a.textContent), ['AniList', 'ANN', 'Wikipedia', 'Wikipedia (JP)']);
  // getAttribute, not .href - the DOM percent-encodes the Japanese article title.
  assert.deepEqual(links.map((a) => a.getAttribute('href')), [
    'https://anilist.co/anime/154587',
    'https://www.animenewsnetwork.com/encyclopedia/anime.php?id=22622',
    'https://en.wikipedia.org/wiki/Linked_Show',
    'https://ja.wikipedia.org/wiki/\u745E\u9E97',
  ]);
  assert.ok(links.every((a) => a.rel === 'noopener noreferrer'), 'external links need rel=noopener');
});

test('a review with only some reference sites renders only those links', async () => {
  const fetch = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [
        {
          titleEN: 'Half-Linked Show',
          ratingText: 'Meh',
          dateReviewed: '2026-07-01',
          wikipediaUrl: 'https://en.wikipedia.org/wiki/Half_Linked_Show',
        },
        { titleEN: 'Unlinked Show', ratingText: 'Meh', dateReviewed: '2026-07-02' },
      ],
      pending: [],
      skipped: [],
    },
  });
  const { document } = await loadApp({ fetch });

  const links = [...document.querySelectorAll('.entry-external-link')];
  assert.deepEqual(links.map((a) => a.textContent), ['Wikipedia']);
});

test('a review with streaming services renders a badge per service, in a fixed order; one without renders none', async () => {
  const fetch = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [
        { titleEN: 'Streamed Show', ratingText: 'Meh', dateReviewed: '2026-07-01', streaming: ['netflix', 'crunchyroll'] },
        { titleEN: 'Unstreamed Show', ratingText: 'Meh', dateReviewed: '2026-07-02' },
      ],
      pending: [],
      skipped: [],
    },
  });
  const { document } = await loadApp({ fetch });

  const badges = [...document.querySelectorAll('.entry-streaming-badge')];
  assert.deepEqual(badges.map((b) => b.textContent), ['CR', 'NF']);
  assert.deepEqual(badges.map((b) => b.title), ['Crunchyroll', 'Netflix']);
});

test('a crunchyrollUrl makes the CR badge a clickable link; other badges stay non-clickable spans', async () => {
  const fetch = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [{
        titleEN: 'Streamed Show',
        ratingText: 'Meh',
        dateReviewed: '2026-07-01',
        streaming: ['crunchyroll', 'netflix'],
        crunchyrollUrl: 'https://www.crunchyroll.com/series/ABC123/streamed-show',
      }],
      pending: [],
      skipped: [],
    },
  });
  const { document } = await loadApp({ fetch });

  const badges = [...document.querySelectorAll('.entry-streaming-badge')];
  const cr = badges.find((b) => b.textContent === 'CR');
  const nf = badges.find((b) => b.textContent === 'NF');
  assert.equal(cr.tagName, 'A');
  assert.equal(cr.getAttribute('href'), 'https://www.crunchyroll.com/series/ABC123/streamed-show');
  assert.equal(nf.tagName, 'SPAN');
});

test('a crunchyroll streaming badge without crunchyrollUrl stays a non-clickable span', async () => {
  const fetch = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [{ titleEN: 'Streamed Show', ratingText: 'Meh', dateReviewed: '2026-07-01', streaming: ['crunchyroll'] }],
      pending: [],
      skipped: [],
    },
  });
  const { document } = await loadApp({ fetch });

  const cr = document.querySelector('.entry-streaming-badge');
  assert.equal(cr.tagName, 'SPAN');
});

test('hidiveUrl and netflixUrl make their badges clickable links, same as crunchyrollUrl', async () => {
  const fetch = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [{
        titleEN: 'Streamed Show',
        ratingText: 'Meh',
        dateReviewed: '2026-07-01',
        streaming: ['hidive', 'netflix', 'hulu'],
        hidiveUrl: 'https://www.hidive.com/season/streamed-show',
        netflixUrl: 'https://www.netflix.com/title/12345',
      }],
      pending: [],
      skipped: [],
    },
  });
  const { document } = await loadApp({ fetch });

  const badges = [...document.querySelectorAll('.entry-streaming-badge')];
  const hd = badges.find((b) => b.textContent === 'HD');
  const nf = badges.find((b) => b.textContent === 'NF');
  const hu = badges.find((b) => b.textContent === 'HU');
  assert.equal(hd.tagName, 'A');
  assert.equal(hd.getAttribute('href'), 'https://www.hidive.com/season/streamed-show');
  assert.equal(nf.tagName, 'A');
  assert.equal(nf.getAttribute('href'), 'https://www.netflix.com/title/12345');
  assert.equal(hu.tagName, 'SPAN');
});

test('a review with watchProgress renders it in the entry meta; one without does not', async () => {
  const fetch = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': {
      id: 'summer-2026',
      name: 'Summer 2026',
      reviewed: [
        { titleEN: 'Revisited Show', ratingText: 'Yeah', dateReviewed: '2026-07-01', watchProgress: 'Ep 3' },
        { titleEN: 'Untouched Show', ratingText: 'Yeah', dateReviewed: '2026-07-02' },
      ],
      pending: [],
      skipped: [],
    },
  });
  const { document } = await loadApp({ fetch });

  const badges = [...document.querySelectorAll('.entry-progress')];
  assert.equal(badges.length, 1);
  assert.equal(badges[0].textContent, 'Progress: Ep 3');
});

test('search matches text inside a full-series re-review or OP/ED note, not just the main review', async () => {
  const fetch = createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': {
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
