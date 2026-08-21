import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFsarApp, createPathFetchStub, createLocalStorageStub, waitFor } from './helpers.js';

const INDEX_PATH = '/fsar/data/index.json';
const reviewPath = (id) => `/fsar/data/reviews/${id}.json`;

/** A finished review of an 80s OVA - the "not everything here is recent" case. */
const GUNBUSTER = {
  id: 'gunbuster',
  status: 'done',
  titleEN: 'Gunbuster',
  titleJP: 'トップをねらえ！',
  format: 'OVA',
  year: 1988,
  airedLabel: '1988-89',
  episodeCount: 6,
  episodesWatched: 6,
  dateReviewed: '2026-03-02',
  dateUpdated: '2026-03-09',
  tags: ['mecha', 'sci-fi'],
  verdict: { ratingNumber: 5, ratingText: 'Peak', oneLiner: 'Six episodes that keep raising the stakes.' },
  recommendedFor: ['anyone curious where a lot of Gainax started'],
  notFor: ['you need every episode to look the same'],
  availabilityNote: 'Out of print in the US; secondhand disc or bust.',
  sections: {
    story: ['It starts as a sports show and does not stay one.'],
    production: ['The last episode changes technique entirely.'],
    op: { ratingText: 'Peak', body: ['Still one of the great openings.'] },
    ed: { ratingText: 'Nice', body: ['Quiet, and it earns it.'] },
    notes: [{ heading: 'The science lectures', body: ['Short segments between episodes.'] }],
    spoilers: [
      { heading: 'The ending', body: ['Something happens with time.'] },
      { heading: 'The last shot', body: ['And then there is a sign.'] },
    ],
  },
};

/** A draft of a recent show, with almost nothing filled in yet. */
const RURI = {
  id: 'ruri-rocks',
  status: 'wip',
  titleEN: 'Ruri Rocks',
  titleJP: '瑠璃の宝石',
  format: 'TV',
  year: 2025,
  airedLabel: 'Summer 2025',
  episodeCount: null,
  episodesWatched: null,
  dateReviewed: '2026-08-21',
  tags: ['hobby', 'slice-of-life'],
  verdict: { ratingNumber: null, ratingText: '', oneLiner: '' },
  recommendedFor: [],
  notFor: [],
  sections: { story: ['Draft.'] },
};

const REVIEWS = [GUNBUSTER, RURI];

/** Builds the routing table the page expects: an index plus one file per review. */
function routes(reviews = REVIEWS) {
  const table = {
    [INDEX_PATH]: { reviews: reviews.map(({ sections, ...card }) => card) },
  };
  for (const review of reviews) table[reviewPath(review.id)] = review;
  return table;
}

const cardTitles = (document) =>
  [...document.querySelectorAll('#reviewCards .card-title')].map((el) => el.textContent.replace(/In Progress$/, '').trim());

// --- List view ---

test('renders a card for every review in the index', async () => {
  const { document } = await loadFsarApp({ fetch: createPathFetchStub(routes()) });

  assert.equal(document.querySelectorAll('#reviewCards .review-card').length, 2);
  assert.deepEqual(cardTitles(document).sort(), ['Gunbuster', 'Ruri Rocks']);
});

test('only fetches the index for the list view, never the review bodies', async () => {
  const fetch = createPathFetchStub(routes());
  await loadFsarApp({ fetch });

  assert.deepEqual(fetch.calls, [INDEX_PATH]);
});

test('badges an in-progress review and leaves a finished one unbadged', async () => {
  const { document } = await loadFsarApp({ fetch: createPathFetchStub(routes()) });

  const badged = [...document.querySelectorAll('#reviewCards .review-card')]
    .filter((card) => card.querySelector('.status-badge'))
    .map((card) => card.querySelector('.card-title').textContent);

  assert.equal(badged.length, 1);
  assert.match(badged[0], /Ruri Rocks/);
  assert.match(badged[0], /In Progress/);
});

test('a draft with no verdict yet says so instead of rendering an empty line', async () => {
  const { document } = await loadFsarApp({ fetch: createPathFetchStub(routes()) });

  const empty = document.querySelectorAll('.card-oneliner-empty');
  assert.equal(empty.length, 1);
  assert.match(empty[0].textContent, /no verdict/i);
});

test('the status filter narrows the list to finished reviews', async () => {
  const { document } = await loadFsarApp({ fetch: createPathFetchStub(routes()) });

  const statusFilter = document.getElementById('statusFilter');
  statusFilter.value = 'done';
  statusFilter.dispatchEvent(new document.defaultView.Event('change'));

  assert.deepEqual(cardTitles(document), ['Gunbuster']);
});

test('the decade filter is built from the data and includes older decades', async () => {
  const { document } = await loadFsarApp({ fetch: createPathFetchStub(routes()) });

  const decadeFilter = document.getElementById('decadeFilter');
  assert.deepEqual([...decadeFilter.options].map((o) => o.value), ['all', '2020', '1980']);
  assert.deepEqual([...decadeFilter.options].map((o) => o.textContent), ['All Decades', '2020s', '1980s']);

  decadeFilter.value = '1980';
  decadeFilter.dispatchEvent(new document.defaultView.Event('change'));

  assert.deepEqual(cardTitles(document), ['Gunbuster']);
});

test('the tag filter is built from the data and narrows the list', async () => {
  const { document } = await loadFsarApp({ fetch: createPathFetchStub(routes()) });

  const tagFilter = document.getElementById('tagFilter');
  assert.deepEqual([...tagFilter.options].map((o) => o.value), ['all', 'hobby', 'mecha', 'sci-fi', 'slice-of-life']);

  tagFilter.value = 'mecha';
  tagFilter.dispatchEvent(new document.defaultView.Event('change'));

  assert.deepEqual(cardTitles(document), ['Gunbuster']);
});

test('filter selections are written to the URL so a filtered list is linkable', async () => {
  const { document, window } = await loadFsarApp({ fetch: createPathFetchStub(routes()) });

  const tagFilter = document.getElementById('tagFilter');
  tagFilter.value = 'mecha';
  tagFilter.dispatchEvent(new window.Event('change'));
  assert.equal(window.location.search, '?tag=mecha');

  tagFilter.value = 'all';
  tagFilter.dispatchEvent(new window.Event('change'));
  assert.equal(window.location.search, '');
});

test('filters are pre-selected from the URL, and an unknown value falls back to all', async () => {
  const { document } = await loadFsarApp({ fetch: createPathFetchStub(routes()), search: '?decade=1980&tag=nope' });

  assert.equal(document.getElementById('decadeFilter').value, '1980');
  assert.equal(document.getElementById('tagFilter').value, 'all');
  assert.deepEqual(cardTitles(document), ['Gunbuster']);
});

test('search matches titles, tags and verdicts', async () => {
  const { document, window } = await loadFsarApp({ fetch: createPathFetchStub(routes()) });
  const searchInput = document.getElementById('searchInput');

  const search = (term) => {
    searchInput.value = term;
    searchInput.dispatchEvent(new window.Event('input'));
    return cardTitles(document);
  };

  assert.deepEqual(search('瑠璃'), ['Ruri Rocks']);
  assert.deepEqual(search('sci-fi'), ['Gunbuster']);
  assert.deepEqual(search('raising the stakes'), ['Gunbuster']);
  assert.deepEqual(search('zzzz'), []);
  assert.equal(document.querySelector('#reviewCards .loading').textContent, 'NO REVIEWS FOUND');
});

test('sorting by oldest year puts the 80s OVA first', async () => {
  const { document, window } = await loadFsarApp({ fetch: createPathFetchStub(routes()) });
  const sortBy = document.getElementById('sortBy');

  sortBy.value = 'year-old';
  sortBy.dispatchEvent(new window.Event('change'));
  assert.deepEqual(cardTitles(document), ['Gunbuster', 'Ruri Rocks']);

  sortBy.value = 'year-new';
  sortBy.dispatchEvent(new window.Event('change'));
  assert.deepEqual(cardTitles(document), ['Ruri Rocks', 'Gunbuster']);
});

test('an unrated draft sorts below a rated review, not as a zero', async () => {
  const { document, window } = await loadFsarApp({ fetch: createPathFetchStub(routes()) });

  const sortBy = document.getElementById('sortBy');
  sortBy.value = 'rating-high';
  sortBy.dispatchEvent(new window.Event('change'));

  assert.deepEqual(cardTitles(document), ['Gunbuster', 'Ruri Rocks']);
});

// --- Single review view ---

test('?show= renders the full review and fetches only that review body', async () => {
  const fetch = createPathFetchStub(routes());
  const { document } = await loadFsarApp({ fetch, search: '?show=gunbuster' });

  await waitFor(() => document.querySelector('.review-full'));

  assert.equal(document.getElementById('listView').hidden, true);
  assert.equal(document.getElementById('showView').hidden, false);
  assert.equal(document.querySelector('.review-title').textContent, 'Gunbuster');
  assert.equal(document.querySelector('.review-title-jp').textContent, 'トップをねらえ！');
  assert.deepEqual(fetch.calls, [INDEX_PATH, reviewPath('gunbuster')]);
});

test('a review renders its fixed sections in order, with OP/ED ratings', async () => {
  const { document } = await loadFsarApp({ fetch: createPathFetchStub(routes()), search: '?show=gunbuster' });
  await waitFor(() => document.querySelector('.review-full'));

  const headings = [...document.querySelectorAll('.review-section h3')].map((h) => h.firstChild.textContent);
  assert.deepEqual(headings, ['Overall Story', 'Overall Production', 'Opening', 'Ending', 'Of Particular Note', 'Spoilers']);

  const ratings = [...document.querySelectorAll('.section-rating')].map((el) => el.textContent);
  assert.deepEqual(ratings, ['Peak', 'Nice']);
});

test('a review renders its audience callouts and availability note', async () => {
  const { document } = await loadFsarApp({ fetch: createPathFetchStub(routes()), search: '?show=gunbuster' });
  await waitFor(() => document.querySelector('.review-full'));

  assert.match(document.querySelector('.audience-good').textContent, /where a lot of Gainax started/);
  assert.match(document.querySelector('.audience-bad').textContent, /every episode to look the same/);
  assert.match(document.querySelector('.availability-note').textContent, /Out of print/);
});

test('a draft review skips the sections it has nothing in yet', async () => {
  const { document } = await loadFsarApp({ fetch: createPathFetchStub(routes()), search: '?show=ruri-rocks' });
  await waitFor(() => document.querySelector('.review-full'));

  const headings = [...document.querySelectorAll('.review-section h3')].map((h) => h.textContent);
  assert.deepEqual(headings, ['Overall Story']);
  assert.equal(document.querySelector('.audiences'), null);
  assert.ok(document.querySelector('.review-title .status-badge'), 'expected the In Progress badge');
});

test('the page title names the review being read', async () => {
  const { document } = await loadFsarApp({ fetch: createPathFetchStub(routes()), search: '?show=gunbuster' });
  await waitFor(() => document.querySelector('.review-full'));

  assert.match(document.title, /^Gunbuster —/);
});

// --- Spoilers ---

test('spoilers render collapsed by default', async () => {
  const { document } = await loadFsarApp({ fetch: createPathFetchStub(routes()), search: '?show=gunbuster' });
  await waitFor(() => document.querySelector('.review-full'));

  const spoilers = [...document.querySelectorAll('.spoiler')];
  assert.equal(spoilers.length, 2);
  assert.ok(spoilers.every((el) => !el.open), 'expected every spoiler to start closed');
  assert.equal(document.querySelector('.spoiler-toggle').textContent, 'Reveal all spoilers');
});

test('the spoiler toggle opens every block and remembers the choice', async () => {
  const localStorage = createLocalStorageStub();
  const { document } = await loadFsarApp({ fetch: createPathFetchStub(routes()), search: '?show=gunbuster', localStorage });
  await waitFor(() => document.querySelector('.review-full'));

  document.querySelector('.spoiler-toggle').dispatchEvent(new document.defaultView.MouseEvent('click'));

  assert.ok([...document.querySelectorAll('.spoiler')].every((el) => el.open));
  assert.equal(document.querySelector('.spoiler-toggle').textContent, 'Hide all spoilers');
  assert.equal(localStorage.getItem('pendelgeist:fsar:spoilers'), 'shown');
});

test('a reader who already revealed spoilers gets them open on the next review', async () => {
  const localStorage = createLocalStorageStub();
  localStorage.setItem('pendelgeist:fsar:spoilers', 'shown');
  const { document } = await loadFsarApp({ fetch: createPathFetchStub(routes()), search: '?show=gunbuster', localStorage });
  await waitFor(() => document.querySelector('.review-full'));

  assert.ok([...document.querySelectorAll('.spoiler')].every((el) => el.open));
  assert.equal(document.querySelector('.spoiler-toggle').textContent, 'Hide all spoilers');
});

// --- Navigation ---

test('clicking a card opens the review and updates the URL', async () => {
  const { document, window } = await loadFsarApp({ fetch: createPathFetchStub(routes()) });

  const link = [...document.querySelectorAll('#reviewCards .card-link')]
    .find((a) => a.textContent.includes('Gunbuster'));
  link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  await waitFor(() => document.querySelector('.review-full'));
  assert.equal(window.location.search, '?show=gunbuster');
  assert.equal(document.querySelector('.review-title').textContent, 'Gunbuster');
});

test('the back link returns to the list without refetching the index', async () => {
  const fetch = createPathFetchStub(routes());
  const { document, window } = await loadFsarApp({ fetch, search: '?show=gunbuster' });
  await waitFor(() => document.querySelector('.review-full'));

  document.getElementById('backLink').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  await waitFor(() => document.getElementById('showView').hidden === true);
  assert.equal(window.location.search, '');
  assert.equal(document.querySelectorAll('#reviewCards .review-card').length, 2);
  assert.deepEqual(fetch.calls, [INDEX_PATH, reviewPath('gunbuster')]);
});

test('going back and forward re-renders the right view', async () => {
  const { document, window } = await loadFsarApp({ fetch: createPathFetchStub(routes()) });

  const link = [...document.querySelectorAll('#reviewCards .card-link')]
    .find((a) => a.textContent.includes('Gunbuster'));
  link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await waitFor(() => document.querySelector('.review-full'));

  window.history.back();
  await waitFor(() => document.getElementById('showView').hidden === true);
  assert.equal(document.querySelectorAll('#reviewCards .review-card').length, 2);
});

test('a review is only fetched once, however often it is reopened', async () => {
  const fetch = createPathFetchStub(routes());
  const { document, window } = await loadFsarApp({ fetch, search: '?show=gunbuster' });
  await waitFor(() => document.querySelector('.review-full'));

  document.getElementById('backLink').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await waitFor(() => document.getElementById('showView').hidden === true);

  const link = [...document.querySelectorAll('#reviewCards .card-link')]
    .find((a) => a.textContent.includes('Gunbuster'));
  link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await waitFor(() => document.querySelector('.review-full'));

  assert.deepEqual(fetch.calls, [INDEX_PATH, reviewPath('gunbuster')]);
});

// --- Failure modes ---

test('an unknown ?show= says so instead of failing silently', async () => {
  const fetch = createPathFetchStub(routes());
  const { document } = await loadFsarApp({ fetch, search: '?show=not-a-show' });

  await waitFor(() => document.querySelector('#showContent .loading-error'));
  assert.match(document.querySelector('#showContent .loading-error').textContent, /NO REVIEW CALLED "not-a-show"/);
  // Never requested: the index already proves there's no such review.
  assert.deepEqual(fetch.calls, [INDEX_PATH]);
});

test('a missing review file surfaces an error naming the status', async () => {
  const table = routes();
  delete table[reviewPath('gunbuster')];
  const { document } = await loadFsarApp({ fetch: createPathFetchStub(table), search: '?show=gunbuster' });

  await waitFor(() => document.querySelector('#showContent .loading-error'));
  assert.match(document.querySelector('#showContent .loading-error').textContent, /HTTP 404/);
});

test('an unreachable index surfaces an error instead of an empty list', async () => {
  const { document } = await loadFsarApp({ fetch: createPathFetchStub({}) });

  assert.match(document.querySelector('#reviewCards .loading-error').textContent, /HTTP 404/);
});
