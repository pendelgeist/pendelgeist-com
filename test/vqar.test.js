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

test('reviews sharing a date sort most recently added first', async () => {
  const fetch = createPathFetchStub({
    ...routes(),
    '/vqar/data/seasons/summer-2026.json': {
      ...seasons['/vqar/data/seasons/summer-2026.json'],
      // Appended in the order they were reviewed, all on one day.
      reviewed: ['First', 'Second', 'Third'].map(titleEN => ({
        titleEN, ratingText: 'Meh', dateReviewed: '2026-10-08',
      })),
    },
  });
  const { document } = await loadApp({ fetch });
  await waitFor(() => titles(document).length === 3);

  assert.deepEqual(titles(document), ['Third', 'Second', 'First']);
});

test('"Most recent" orders by the time of day, whatever the order in the file', async () => {
  const fetch = createPathFetchStub({
    ...routes(),
    '/vqar/data/seasons/summer-2026.json': {
      ...seasons['/vqar/data/seasons/summer-2026.json'],
      reviewed: [
        { titleEN: 'Morning', ratingText: 'Meh', dateReviewed: '2026-10-08T09:00:00Z' },
        { titleEN: 'Evening', ratingText: 'Meh', dateReviewed: '2026-10-08T21:00:00Z' },
        { titleEN: 'Noon', ratingText: 'Meh', dateReviewed: '2026-10-08T12:00:00Z' },
      ],
    },
  });
  const { document } = await loadApp({ fetch });
  await waitFor(() => titles(document).length === 3);

  assert.deepEqual(titles(document), ['Evening', 'Noon', 'Morning']);
});

test('a timestamped dateReviewed is shown as just its date', async () => {
  const fetch = createPathFetchStub({
    ...routes(),
    '/vqar/data/seasons/summer-2026.json': {
      ...seasons['/vqar/data/seasons/summer-2026.json'],
      reviewed: [{
        titleEN: 'Stamped Show', ratingText: 'Meh', dateReviewed: '2026-10-08T23:30:00-07:00',
        fullReview: { ratingText: 'Meh', dateReviewed: '2026-10-09T01:00:00Z' },
      }],
    },
  });
  const { document } = await loadApp({ fetch });
  await waitFor(() => titles(document).length === 1);

  const published = [...document.querySelectorAll('.entry-published')].map(el => el.textContent);
  assert.deepEqual(published, ['Reviewed: 2026-10-08', 'Reviewed: 2026-10-09']);
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
        streaming: ['hidive', 'netflix', 'youtube'],
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
  const yt = badges.find((b) => b.textContent === 'YT');
  assert.equal(hd.tagName, 'A');
  assert.equal(hd.getAttribute('href'), 'https://www.hidive.com/season/streamed-show');
  assert.equal(nf.tagName, 'A');
  assert.equal(nf.getAttribute('href'), 'https://www.netflix.com/title/12345');
  assert.equal(yt.tagName, 'SPAN');
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

function withLists(pending, skipped) {
  return createPathFetchStub({
    ...routes(),
    '/vqar/data/seasons/summer-2026.json': { ...seasons['/vqar/data/seasons/summer-2026.json'], pending, skipped },
  });
}

const text = (el) => el.textContent.trim();
const badgeTitles = (el) => [...el.querySelectorAll('.entry-streaming-badge')].map((b) => b.title);

test('pending shows with premiere dates group under date headings, earliest first, undated last', async () => {
  const { document } = await loadApp({
    fetch: withLists([
      'Undated Show',
      { title: 'Late Show', firstEpisode: '2026-10-12', streaming: ['hidive', 'crunchyroll'] },
      { title: 'Early Show', firstEpisode: '2026-10-04', streaming: ['netflix'] },
      { title: 'Same Day Show', firstEpisode: '2026-10-12' },
    ], []),
  });

  const groups = [...document.querySelectorAll('#pendingShows > .show-group')];
  assert.deepEqual(groups.map((g) => text(g.querySelector('.show-group-heading'))), ['Oct 4', 'Oct 12', 'Date TBD']);
  assert.deepEqual(
    groups.map((g) => [...g.querySelectorAll('.show-row-title')].map(text)),
    [['Early Show'], ['Late Show', 'Same Day Show'], ['Undated Show']]
  );
  // Badges follow STREAMING_SERVICES order, not the order they were written in.
  assert.deepEqual(badgeTitles(groups[1]), ['Crunchyroll', 'HIDIVE']);
  assert.deepEqual(badgeTitles(groups[0]), ['Netflix']);
});

test('pending stays a flat list, not one big "Date TBD" group, until some show has a date', async () => {
  const { document } = await loadApp({
    fetch: withLists(['Plain Show', { title: 'Streamed Show', streaming: ['hulu'] }], []),
  });

  assert.equal(document.querySelector('#pendingShows .show-group'), null);
  const rows = [...document.querySelectorAll('#pendingShows > li')];
  assert.deepEqual(rows.map(text), ['Plain Show', 'Streamed ShowHU']);
  assert.deepEqual(badgeTitles(rows[1]), ['Hulu']);
});

test('an unparseable premiere date is shown as written rather than dropped', async () => {
  const { document } = await loadApp({ fetch: withLists([{ title: 'Odd Show', firstEpisode: 'Fall' }], []) });
  assert.equal(text(document.querySelector('.show-group-heading')), 'Fall');
});

test('skipped shows group by reason in the fixed priority order, no-reason last', async () => {
  const { document } = await loadApp({
    fetch: withLists([], [
      'No Reason Show',
      { title: 'Kids A', reason: 'Kids show' },
      { title: 'Paywalled', reason: 'Not paying for another service ($13/mo)', streaming: ['oceanveil'] },
      { title: 'Unlicensed', reason: 'Not streaming in the US' },
      { title: 'Seq 1', reason: 'Continuing series' },
      { title: 'Kids B', reason: 'Kids show' },
      { title: 'Streamed Only', streaming: ['prime'] },
    ]),
  });

  const groups = [...document.querySelectorAll('#skippedShows > .show-group')];
  // Priority order wins over group size: the two kids shows come after the single-show groups above them.
  assert.deepEqual(groups.map((g) => text(g.querySelector('.show-group-heading'))), [
    'Continuing series',
    'Not streaming in the US',
    'Not paying for another service ($13/mo)',
    'Kids show',
    'No reason given',
  ]);
  assert.deepEqual(groups.map((g) => [...g.querySelectorAll('.show-row-title')].map(text)), [
    ['Seq 1'],
    ['Unlicensed'],
    ['Paywalled'],
    ['Kids A', 'Kids B'],
    ['No Reason Show', 'Streamed Only'],
  ]);
  assert.deepEqual(badgeTitles(groups[2]), ['OceanVeil']);
  assert.deepEqual(badgeTitles(groups[4]), ['Prime Video']);
});

test('a reason matches the priority list case-insensitively on its start', async () => {
  const { document } = await loadApp({
    fetch: withLists([], [
      { title: 'Late', reason: 'NOT INTERESTED, honestly' },
      { title: 'Early', reason: 'continuing series (S3)' },
    ]),
  });

  assert.deepEqual(
    [...document.querySelectorAll('#skippedShows .show-group-heading')].map(text),
    ['continuing series (S3)', 'NOT INTERESTED, honestly']
  );
});

test('reasons not on the priority list come after it, biggest group first, ties in order of appearance', async () => {
  const { document } = await loadApp({
    fetch: withLists([], [
      { title: 'Odd 1', reason: 'Ran out of time' },
      { title: 'Odd 2', reason: 'Dropped by studio' },
      { title: 'Odd 3', reason: 'Dropped by studio' },
      { title: 'Odd 4', reason: 'Another one' },
      { title: 'Known', reason: 'Not interested' },
    ]),
  });

  assert.deepEqual(
    [...document.querySelectorAll('#skippedShows .show-group-heading')].map(text),
    ['Not interested', 'Dropped by studio', 'Ran out of time', 'Another one']
  );
});

test('skipped stays a flat list when no show has a reason', async () => {
  const { document } = await loadApp({ fetch: withLists([], ['Skip A', { title: 'Skip B', streaming: ['hulu'] }]) });

  assert.equal(document.querySelector('#skippedShows .show-group'), null);
  assert.deepEqual([...document.querySelectorAll('#skippedShows > li')].map(text), ['Skip A', 'Skip BHU']);
});

test('flat pending and skipped lists show just titles', async () => {
  const { document } = await loadApp({ fetch: withLists(['A', 'B', 'C'], ['D', 'E', 'F']) });
  assert.deepEqual([...document.querySelectorAll('#pendingShows > li')].map(text), ['A', 'B', 'C']);
  assert.deepEqual([...document.querySelectorAll('#skippedShows > li')].map(text), ['D', 'E', 'F']);
});

test('titles and reasons render as text, never markup', async () => {
  const { document } = await loadApp({
    fetch: withLists(
      [{ title: '<b>Bold</b> Show', firstEpisode: '2026-10-01' }],
      [{ title: 'Tag <i>Show</i>', reason: '<script>x</script>' }]
    ),
  });

  assert.equal(document.querySelector('#pendingShows b'), null);
  assert.equal(text(document.querySelector('.show-row-title')), '<b>Bold</b> Show');
  assert.equal(document.querySelector('#skippedShows i, #skippedShows script'), null);
  assert.equal(text(document.querySelector('#skippedShows .show-group-heading')), '<script>x</script>');
});

test('a pending show with a service link renders that badge as a link', async () => {
  const { document } = await loadApp({
    fetch: withLists([{ title: 'Linked Show', streaming: ['crunchyroll', 'netflix'], crunchyrollUrl: 'https://www.crunchyroll.com/series/X/linked' }], []),
  });

  const [cr, nf] = [...document.querySelectorAll('#pendingShows .entry-streaming-badge')];
  assert.equal(cr.tagName, 'A');
  assert.equal(cr.href, 'https://www.crunchyroll.com/series/X/linked');
  assert.equal(nf.tagName, 'SPAN'); // no netflixUrl, so no link
});

test('available-now pending shows get their own group ahead of the dated ones', async () => {
  const { document } = await loadApp({
    fetch: withLists([
      'Undated Show',
      { title: 'Dated Show', firstEpisode: '2026-10-04' },
      { title: 'Out Already', availableNow: true, streaming: ['netflix'] },
    ], []),
  });

  const groups = [...document.querySelectorAll('#pendingShows > .show-group')];
  assert.deepEqual(groups.map((g) => text(g.querySelector('.show-group-heading'))), ['Available now', 'Oct 4', 'Date TBD']);
  assert.deepEqual(groups.map((g) => [...g.querySelectorAll('.show-row-title')].map(text)), [['Out Already'], ['Dated Show'], ['Undated Show']]);
});

test('a lone available-now show is enough to group the pending list', async () => {
  const { document } = await loadApp({ fetch: withLists(['Undated Show', { title: 'Out Already', availableNow: true }], []) });
  assert.deepEqual(
    [...document.querySelectorAll('#pendingShows .show-group-heading')].map(text),
    ['Available now', 'Date TBD']
  );
});

// A season with enough variety for the chip filters: ratings, services, a
// revisit that moved the rating, OP notes.
const filterIndex = {
  currentSeason: 'fall-2026',
  seasons: [
    { id: 'fall-2026', name: 'Fall 2026', file: '/vqar/data/seasons/fall-2026.json' },
    { id: 'summer-2026', name: 'Summer 2026', file: '/vqar/data/seasons/summer-2026.json' },
  ],
};

const filterSeasons = {
  '/vqar/data/seasons/fall-2026.json': {
    id: 'fall-2026',
    name: 'Fall 2026',
    reviewed: [
      { titleEN: 'Peak Show', ratingNumber: 5, ratingText: 'Peak', review: '', dateReviewed: '2026-10-04', streaming: ['crunchyroll'] },
      { titleEN: 'Hidive Show', ratingNumber: 4, ratingText: 'Hoping', review: '', dateReviewed: '2026-10-03', streaming: ['hidive'] },
      { titleEN: 'Grower', ratingNumber: 3, ratingText: 'Meh', review: '', dateReviewed: '2026-10-02', streaming: ['crunchyroll'], fullReview: { ratingNumber: 5, ratingText: 'Peak' } },
      { titleEN: 'Trash Show', ratingNumber: 2, ratingText: 'Trash', review: 'bad OP', dateReviewed: '2026-10-01', streaming: ['crunchyroll'], op: { review: 'good OP though' } },
    ],
    pending: [],
    skipped: [],
  },
  '/vqar/data/seasons/summer-2026.json': {
    id: 'summer-2026',
    name: 'Summer 2026',
    reviewed: [
      { titleEN: 'Summer Peak', ratingNumber: 5, ratingText: 'Peak', review: '', dateReviewed: '2026-07-01', streaming: ['netflix'] },
    ],
    pending: [],
    skipped: [],
  },
};

async function loadFiltered(query = '') {
  const fetch = createPathFetchStub({ '/vqar/data/index.json': filterIndex, ...filterSeasons });
  const page = await loadApp({ fetch, url: `http://localhost/vqar/${query}` });
  await waitFor(() => page.document.querySelectorAll('.entry-title').length > 0);
  return page;
}

function chip(document, dimension, value) {
  return document.querySelector(`.filter-chip[data-dimension="${dimension}"][data-value="${value}"]`);
}

function chipCount(document, dimension, value) {
  return chip(document, dimension, value)?.querySelector('.chip-count')?.textContent;
}

test('rating chips run 5 to 0 with counts, filing a revisited show under its revisit rating', async () => {
  const { document } = await loadFiltered();
  const labels = [...document.querySelectorAll('#ratingChips .filter-chip')].map((b) => b.firstChild.textContent);
  assert.deepEqual(labels, ['5 Peak', '4 Yeah', '3 Meh', '2 Trash', '1 Never', '0 Dead']);
  assert.equal(chipCount(document, 'rating', '5'), '2');
  assert.equal(chipCount(document, 'rating', '3'), '0');
});

test('pressing a rating chip filters to it, marks it pressed, and puts it in the URL', async () => {
  const { document, window } = await loadFiltered();
  chip(document, 'rating', '5').click();
  assert.deepEqual(titles(document), ['Peak Show', 'Grower']);
  assert.equal(chip(document, 'rating', '5').getAttribute('aria-pressed'), 'true');
  assert.equal(window.location.search, '?rating=5');

  chip(document, 'rating', '5').click();
  assert.equal(titles(document).length, 4);
  assert.equal(window.location.search, '');
});

test('streaming only offers services something in the season is on', async () => {
  const { document } = await loadFiltered();
  const offered = [...document.querySelectorAll('#onChips .filter-chip')].map((b) => b.dataset.value);
  assert.deepEqual(offered, ['crunchyroll', 'hidive']);
});

test('chips in a row are any-of, rows are all-of', async () => {
  const { document, window } = await loadFiltered();
  chip(document, 'on', 'crunchyroll').click();
  chip(document, 'on', 'hidive').click();
  assert.equal(titles(document).length, 4);
  assert.equal(window.location.search, '?on=crunchyroll,hidive');
  chip(document, 'rating', '4').click();
  assert.deepEqual(titles(document), ['Hidive Show']);
});

test('Extras filters on revisits that moved the rating, and on OP/ED notes', async () => {
  const { document } = await loadFiltered();
  chip(document, 'has', 'up').click();
  assert.deepEqual(titles(document), ['Grower']);
  chip(document, 'has', 'up').click();
  chip(document, 'has', 'oped').click();
  assert.deepEqual(titles(document), ['Trash Show']);
});

test('a filtered URL restores season, search, sort and chips on load', async () => {
  const { document } = await loadFiltered('?season=all&q=peak&sort=title&rating=5');
  assert.equal(document.getElementById('seasonFilter').value, 'all');
  assert.equal(document.getElementById('searchInput').value, 'peak');
  assert.equal(document.getElementById('sortBy').value, 'title');
  // Grower is found by its revisit's "Peak" rating text, and counts as a 5 by it.
  await waitFor(() => titles(document).length === 3);
  assert.deepEqual(titles(document), ['Grower', 'Peak Show', 'Summer Peak']);
  assert.equal(chip(document, 'rating', '5').getAttribute('aria-pressed'), 'true');
});

test('unknown URL values fall back to the defaults and drop out of the URL', async () => {
  const { document, window } = await loadFiltered('?season=fall-1999&sort=nope&rating=11');
  assert.equal(document.getElementById('seasonFilter').value, 'fall-2026');
  assert.equal(document.getElementById('sortBy').value, 'recent');
  assert.equal(titles(document).length, 4);
  assert.equal(window.location.search, '');
});

test('the URL leaves out the current season but names any other choice', async () => {
  const { document, window } = await loadFiltered();
  selectSeason(document, 'all');
  await waitFor(() => titles(document).length === 5);
  assert.equal(window.location.search, '?season=all');
  search(document, 'show');
  assert.equal(window.location.search, '?season=all&q=show');
});

test('the summary counts what is shown, and Clear filters resets search and chips but not the season', async () => {
  const { document, window } = await loadFiltered('?season=all');
  await waitFor(() => titles(document).length === 5);
  const count = document.getElementById('resultCount');
  const clear = document.getElementById('clearFilters');
  assert.equal(count.textContent, '5 reviews');
  assert.equal(clear.hidden, true);

  chip(document, 'rating', '5').click();
  search(document, 'peak');
  assert.equal(count.textContent, 'Showing 3 of 5 reviews');
  assert.equal(clear.hidden, false);

  clear.click();
  assert.equal(titles(document).length, 5);
  assert.equal(document.getElementById('searchInput').value, '');
  assert.equal(document.getElementById('seasonFilter').value, 'all');
  assert.equal(window.location.search, '?season=all');
});

test('the mobile toggle shows how many chips are on and opens the chip rows', async () => {
  const { document } = await loadFiltered();
  const toggle = document.getElementById('filtersToggle');
  chip(document, 'rating', '5').click();
  chip(document, 'on', 'hidive').click();
  assert.equal(toggle.textContent, 'More filters (2)');

  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.ok(document.getElementById('filterChips').classList.contains('open'));
});

test('keyboard focus stays on a chip after pressing it, though the row is rebuilt', async () => {
  const { document } = await loadFiltered();
  chip(document, 'rating', '4').focus();
  chip(document, 'rating', '4').click();
  assert.equal(document.activeElement, chip(document, 'rating', '4'));
});
