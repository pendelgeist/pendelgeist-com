import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  flattenReviews, reviewSource, filterBySource, hasLiveLineup, computeGlanceStats, computeSeasonTable, computeDecadeTable, airedYear,
  computeRatingDistribution, computePeaksAndValleys, computeRevisits, computeOpEdHighlights,
  computeCategoryRatings, computeLovesAndHates,
  computeSeasonCoverage, computeHopeCheck,
} from '../public/anime-stat-sheet/stats.js';
import { createPathFetchStub } from './helpers.js';
import { makeSeason, makeShow } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- stats.js: pure computation ---

const seasons = [
  makeSeason({
    id: 'summer-2026', name: 'Summer 2026',
    shows: [
      makeShow({ titleEN: 'Peak Show', ratingNumber: 5, ratingText: 'Peak', text: 'An excellent episode all around', dateReviewed: '2026-07-01', anilistId: 111, op: [1] }),
      makeShow({ titleEN: 'Meh Show', ratingNumber: 3, ratingText: 'Meh', text: 'Just fine, nothing special here', dateReviewed: '2026-07-05', revisit: { ratingNumber: 5, ratingText: 'Peak', text: 'Turned out great after all' } }),
      makeShow({ titleEN: 'Trash Show', ratingNumber: 1, ratingText: 'Trash', text: 'Rough episode, animation was bad', dateReviewed: '2026-07-10', ed: [1], watched: { from: '2026-07-01', finished: true } }),
    ],
    toReview: ['Pending Show'],
    notReviewing: [],
  }),
  makeSeason({
    id: 'spring-2026', name: 'Spring 2026',
    shows: [
      makeShow({ titleEN: 'Fine Show', ratingNumber: 3, ratingText: 'Meh', text: 'Perfectly fine, nothing special', dateReviewed: '2026-04-01' }),
      makeShow({ titleEN: 'Great Show', ratingNumber: 4, ratingText: 'Yeah', text: 'Great animation and great story', dateReviewed: '2026-04-15', revisit: { ratingNumber: 2, ratingText: 'Trash', text: 'It fell apart badly' } }),
      makeShow({ titleEN: 'No Rating Show', ratingText: 'Custom Rating', text: 'Unrated but noted', dateReviewed: '2026-04-20' }),
    ],
    toReview: [],
    notReviewing: ['Skipped Show'],
  }),
];

const reviews = flattenReviews(seasons);

test('flattenReviews tags each review with season id/name and a parsed timestamp', () => {
  assert.equal(reviews.length, 6);
  assert.ok(reviews.every(r => r.season && r.seasonName));
  assert.equal(reviews.find(r => r.titleEN === 'Peak Show').seasonName, 'Summer 2026');
  assert.equal(reviews.find(r => r.titleEN === 'Peak Show')._timestamp, Date.parse('2026-07-01'));
});

test('computeGlanceStats totals shows, averages numeric ratings, and counts the seasons they come from', () => {
  const s = computeGlanceStats(reviews);
  assert.equal(s.shows, 6);
  assert.equal(s.live, 6);
  assert.equal(s.historical, 0);
  assert.equal(s.seasons, 2);
  assert.equal(s.avgRating, (5 + 5 + 1 + 3 + 2) / 5); // "No Rating Show" excluded; Meh Show/Great Show use their fullReview rating
  assert.equal(s.avgLive, s.avgRating);
  assert.equal(s.avgHistorical, null);
  assert.equal(s.highShare, 2 / 5);
  assert.equal(s.fullReReviews, 2);
  assert.equal(s.likedOps, 1);
  assert.equal(s.likedEds, 1);
  assert.equal(s.finishedSeasons, 1);
  assert.equal(s.anilistCoveragePct, Math.round((1 / 6) * 100));
});

test('computeGlanceStats handles an empty dataset without dividing by zero', () => {
  const s = computeGlanceStats([]);
  assert.equal(s.shows, 0);
  assert.equal(s.avgRating, null);
  assert.equal(s.highShare, null);
  assert.equal(s.seasons, 0);
  assert.equal(s.anilistCoveragePct, null);
});

test('computeRatingDistribution counts by ratingNumber, ordered ascending and labeled with the default rating text', () => {
  const dist = computeRatingDistribution(reviews);
  // "No Rating Show" excluded - no ratingNumber. Meh Show/Great Show bucket under
  // their fullReview rating (5 and 2) rather than their original ratingNumber.
  assert.deepEqual(dist.map(d => d.ratingNumber), [1, 2, 3, 5]);
  assert.deepEqual(
    dist.map(d => d.ratingText),
    ['Never, Please No More Like This Ever', 'Trash, for Second Screen Only', 'Meh, Finishing the Ep', 'Peak, Nice Ep Broh']
  );
  assert.equal(dist.find(d => d.ratingNumber === 5).count, 2); // Peak Show + Meh Show's fullReview
});

test('computePeaksAndValleys lists every show at the top and bottom rating, by their latest review', () => {
  const { peaks: fame, valleys: shame } = computePeaksAndValleys(reviews);
  // Meh Show's revisit (5) ties it with Peak Show; the whole tier is listed, by title.
  assert.equal(fame.ratingNumber, 5);
  assert.equal(fame.ratingText, 'Peak, Nice Ep Broh');
  assert.deepEqual(fame.shows.map(r => r.titleEN), ['Meh Show', 'Peak Show']);
  assert.equal(shame.ratingNumber, 1);
  assert.deepEqual(shame.shows.map(r => r.titleEN), ['Trash Show']);
});

test('computePeaksAndValleys has no valleys when only one rating is in view, and nothing with no ratings', () => {
  const one = flattenReviews([makeSeason({ id: 'x', name: 'X', shows: [makeShow({ titleEN: 'A', ratingNumber: 4 }), makeShow({ titleEN: 'B', ratingNumber: 4 })] })]);
  const { peaks: fame, valleys: shame } = computePeaksAndValleys(one);
  assert.deepEqual(fame.shows.map(r => r.titleEN), ['A', 'B']);
  assert.equal(shame, null);
  assert.deepEqual(computePeaksAndValleys([]), { peaks: null, valleys: null });
});

test('computeRevisits compares the episode-1 rating with the latest review after it', () => {
  const s = computeRevisits(reviews);
  assert.equal(s.total, 2);
  assert.equal(s.upgrades, 1); // Meh Show: 3 -> 5
  assert.equal(s.downgrades, 1); // Great Show: 4 -> 2
  assert.equal(s.avgDelta, ((5 - 3) + (2 - 4)) / 2);
  assert.equal(s.swings.length, 2);
});

test('computeRevisits is empty when nothing has been revisited', () => {
  const s = computeRevisits(flattenReviews([makeSeason({ id: 'x', name: 'X', shows: [makeShow({ titleEN: 'A', ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-01-01' })] })]));
  assert.equal(s.total, 0);
  assert.equal(s.avgDelta, null);
  assert.deepEqual(s.swings, []);
});

test('computeOpEdHighlights lists the liked OPs and EDs, with their season', () => {
  const s = computeOpEdHighlights(reviews);
  assert.equal(s.opCount, 1);
  assert.equal(s.edCount, 1);
  assert.deepEqual(s.likedOps, [{ titleEN: 'Peak Show', seasonName: 'Summer 2026', which: 'OP 1' }]);
  assert.deepEqual(s.likedEds, [{ titleEN: 'Trash Show', seasonName: 'Summer 2026', which: 'ED 1' }]);
});

test('numbered OP/ED likings count like bare ones, and say which OP/ED they were', () => {
  const numbered = flattenReviews([makeSeason({
    id: 'summer-2026', name: 'Summer 2026',
    shows: [
      makeShow({ titleEN: 'Two OPs', ratingText: 'Meh', text: '', dateReviewed: '2026-07-01', op: [1, 2] }),
      makeShow({ titleEN: 'Third ED', ratingText: 'Meh', text: '', dateReviewed: '2026-07-02', ed: [3] }),
      makeShow({ titleEN: 'One Each', ratingText: 'Meh', text: '', dateReviewed: '2026-07-03', op: [1], ed: [1] }),
      makeShow({ titleEN: 'Neither', ratingText: 'Meh', text: '', dateReviewed: '2026-07-04' }),
    ],
    toReview: [], notReviewing: [],
  })]);
  const s = computeOpEdHighlights(numbered);
  assert.deepEqual(s.likedOps.map(r => [r.titleEN, r.which]), [['One Each', 'OP 1'], ['Two OPs', 'OP 1, 2']]);
  assert.deepEqual(s.likedEds.map(r => [r.titleEN, r.which]), [['One Each', 'ED 1'], ['Third ED', 'ED 3']]);
  assert.equal(s.opCount, 2);
  assert.equal(s.edCount, 2);
});

test('computeOpEdHighlights lists every liked OP by title, with no top-N cap', () => {
  const liked = flattenReviews([makeSeason({
    id: 'summer-2026', name: 'Summer 2026',
    shows: ['F', 'B', 'D', 'A', 'E', 'C', 'G'].map(t => makeShow({ titleEN: `Show ${t}`, ratingText: 'Meh', text: '', dateReviewed: '2026-07-01', op: [1] })),
    toReview: [], notReviewing: [],
  })]);
  const s = computeOpEdHighlights(liked);
  assert.deepEqual(s.likedOps.map(r => r.titleEN), ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(t => `Show ${t}`));
});

test('computeSeasonCoverage counts reviewed out of reviewed + to review, ignoring not-reviewing shows', () => {
  assert.deepEqual(computeSeasonCoverage([seasons[0]]), { reviewed: 3, toReview: 1, total: 4, pct: 75 });
  const all = computeSeasonCoverage(seasons);
  assert.equal(all.total, all.reviewed + all.toReview);
  assert.equal(all.total, 7);
});

test('computeSeasonCoverage has no percentage when nothing is reviewed or to review', () => {
  assert.deepEqual(computeSeasonCoverage([makeSeason({ id: 'fall-2026', name: 'Fall 2026', shows: [], toReview: [], notReviewing: [] })]),
    { reviewed: 0, toReview: 0, total: 0, pct: null });
});

test('computeSeasonCoverage leaves a shelf out', () => {
  assert.deepEqual(computeSeasonCoverage([makeSeason({ id: 'backlog', name: 'Backlog', sortKey: 0, shows: [makeShow({ titleEN: 'Old Show', ratingNumber: 4 })], toReview: [], notReviewing: [] })]),
    { reviewed: 0, toReview: 0, total: 0, pct: null });
});


// --- Rendered page ---

const INDEX_HTML_PATH = path.join(__dirname, '../public/anime-stat-sheet/index.html');
const APP_JS_PATH = path.join(__dirname, '../public/anime-stat-sheet/app.js');

const seasonIndex = {
  currentSeason: 'summer-2026',
  seasons: [
    { id: 'summer-2026', name: 'Summer 2026', file: '/vqar/data/seasons/summer-2026.json' },
    { id: 'spring-2026', name: 'Spring 2026', file: '/vqar/data/seasons/spring-2026.json' },
  ],
};

function routes() {
  return {
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': seasons[0],
    '/vqar/data/seasons/spring-2026.json': seasons[1],
  };
}

const tableRows = (document, id) => [...document.querySelectorAll(`#${id} tbody tr`)].map((tr) => [...tr.children].map((td) => td.textContent));

let importCounter = 0;

async function loadApp({ fetch = createPathFetchStub(routes()), url = 'http://localhost/anime-stat-sheet/index.html' } = {}) {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });

  global.document = dom.window.document;
  global.fetch = fetch;
  global.location = dom.window.location;
  global.history = dom.window.history;
  global.URL = dom.window.URL;
  global.URLSearchParams = dom.window.URLSearchParams;

  await import(`${pathToFileURL(APP_JS_PATH)}?t=${importCounter++}`);
  return { document: dom.window.document, window: dom.window };
}

/** The glance tiles as { label: value }. */
const glance = (document) => Object.fromEntries([...document.querySelectorAll('#statsGlance .stat-tile')]
  .map(t => [t.querySelector('.stat-label').textContent, t.querySelector('.stat-value').textContent]));

/** Sets the season picker and fires its change event. */
function pickSeason(document, value) {
  const select = /** @type {any} */ (document.getElementById('seasonFilter'));
  select.value = value;
  select.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
}

const pickSource = (document, value) => document.querySelector(`#sourceSwitch [data-source="${value}"]`).click();

test('renders the glance stat grid from live-fetched season data', async () => {
  const { document } = await loadApp();
  const tiles = glance(document);
  assert.equal(tiles['Shows Reviewed'], '6');
  assert.equal(tiles['Seasons'], '2');
  assert.equal(tiles['Seasons Finished'], '1');
  // Every fixture show is live, so there's no live/historical split to show.
  assert.equal(tiles['Live'], undefined);
});

test('renders Peaks & Valleys: the distribution, and every show in its top and bottom tiers', async () => {
  const { document } = await loadApp();

  assert.ok(document.querySelectorAll('#ratingDistributionChart .bar-fill').length > 0);
  assert.deepEqual(tableRows(document, 'peaksTable'), [['Meh Show', 'Summer 2026'], ['Peak Show', 'Summer 2026']]);
  assert.equal(document.getElementById('peaksHeading').textContent, 'Peak, Nice Ep Broh (2)');
  assert.equal(document.getElementById('valleysHeading').textContent, 'Never, Please No More Like This Ever (1)');
});

test('shows an error message if the season index fails to load', async () => {
  const fetch = async () => ({ ok: false, status: 500 });
  const { document } = await loadApp({ fetch });

  const err = document.querySelector('#statsGlance .loading');
  assert.ok(err, 'expected an error message in the stats-glance container');
  assert.match(err.textContent, /ERROR/);
});

test('the season picker lists each season with its show count, and defaults to the career view', async () => {
  const { document } = await loadApp();

  const options = [...document.querySelectorAll('#seasonFilter option')].map(o => ({ value: o.value, text: o.textContent }));
  assert.deepEqual(options, [
    { value: 'all', text: 'All Seasons (6)' },
    { value: 'summer-2026', text: 'Summer 2026 (3)' },
    { value: 'spring-2026', text: 'Spring 2026 (3)' },
  ]);
  assert.equal(document.getElementById('seasonFilter').value, 'all');
  assert.equal(document.getElementById('viewTitle').textContent, 'Career');
});

test('picking a season turns the page into that season\'s report', async () => {
  const { document } = await loadApp();
  pickSeason(document, 'spring-2026');

  assert.equal(document.getElementById('viewTitle').textContent, 'Spring 2026 Season Report');
  const tiles = glance(document);
  assert.equal(tiles['Shows Reviewed'], '3');
  // Spring's 2.5 against the career's (5+5+1+3+2)/5 = 3.2, both live.
  assert.equal(tiles['vs. Live Average'], '-0.7');
  // A career-only tile doesn't repeat the filter back.
  assert.equal(tiles['Seasons'], undefined);

  // Peak Show (Summer 2026) is out of scope; Great Show's revisit (2) puts Fine Show (3) on top.
  // A season's own halls drop the Season column, which would say the same thing on every row.
  assert.deepEqual(tableRows(document, 'peaksTable'), [['Fine Show']]);
});

test('each section shows only in the view it makes sense in, and there is no Season Spotlight', async () => {
  assert.equal((await loadApp()).document.getElementById('seasonSpotlightSection'), null);

  const { document } = await loadApp();
  const visible = () => [...document.querySelectorAll('section.section')].filter(s => !s.hidden).map(s => s.id);

  assert.deepEqual(visible(), [
    'glanceSection', 'seasonTableSection', 'peaksValleysSection', 'revisitsSection',
    'tasteProfileSection', 'lovesHatesSection', 'opEdSection',
  ]);

  pickSeason(document, 'summer-2026');
  assert.deepEqual(visible(), [
    'glanceSection', 'coverageSection', 'peaksValleysSection', 'revisitsSection', 'opEdSection',
  ]);
});

test('Review Coverage is part of a live season\'s report: reviewed out of reviewed + to review', async () => {
  const { document } = await loadApp({ url: 'http://localhost/anime-stat-sheet/index.html?season=summer-2026' });
  const bar = document.querySelector('#coverageBar [role="progressbar"]');
  assert.match(document.querySelector('#coverageBar .coverage-summary').textContent, /^3 of 4 shows reviewed \(75%\)$/);
  assert.equal(document.querySelector('#coverageBar .vs-prose').textContent, '3 reviewed · 1 to be reviewed');
  assert.equal(bar.getAttribute('aria-valuenow'), '3');
  assert.equal(bar.getAttribute('aria-valuemax'), '4');
});

test('Season by Season tables each season, linking to its report, which opens in place', async () => {
  const { document, window } = await loadApp();
  assert.deepEqual(tableRows(document, 'seasonTable'), [
    ['Summer 2026', '3', '3', '0', '3.7', '67%', '33%', '75%'],
    ['Spring 2026', '3', '3', '0', '2.5', '0%', '0%', '100%'],
  ]);
  const link = document.querySelector('#seasonTable td a');
  assert.equal(link.getAttribute('href'), '?season=summer-2026');

  link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  assert.equal(document.getElementById('seasonFilter').value, 'summer-2026');
  assert.equal(document.getElementById('viewTitle').textContent, 'Summer 2026 Season Report');
  assert.equal(new URL(window.location.href).searchParams.get('season'), 'summer-2026');
});

test('the nav links back to VQAR', async () => {
  const { document } = await loadApp();
  assert.ok(document.querySelector('nav a[href="/vqar"]'));
});

test('a "?season=" URL pre-selects that season on load', async () => {
  const { document } = await loadApp({ url: 'http://localhost/anime-stat-sheet/index.html?season=spring-2026' });

  assert.equal(document.getElementById('seasonFilter').value, 'spring-2026');
  assert.equal(glance(document)['Shows Reviewed'], '3');
});

test('an unknown "?season=" value is ignored, falling back to "All Seasons"', async () => {
  const { document } = await loadApp({ url: 'http://localhost/anime-stat-sheet/index.html?season=nonexistent-season' });

  assert.equal(document.getElementById('seasonFilter').value, 'all');
});

test('changing the season filter updates the "?season=" URL param, without adding history entries', async () => {
  const { document, window } = await loadApp();

  const select = /** @type {any} */ (document.getElementById('seasonFilter'));
  select.value = 'spring-2026';
  select.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  assert.equal(new URL(window.location.href).searchParams.get('season'), 'spring-2026');

  select.value = 'all';
  select.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  assert.equal(new URL(window.location.href).searchParams.get('season'), null);
});

// --- category cross-references ---

const tagged = (titleEN, ratingNumber, anilist, extra = {}) =>
  makeShow({ titleEN, ratingNumber, ratingText: 'x', text: '', dateReviewed: '2026-07-01', anilistId: 1, anilist: { genres: [], tags: [], studios: [], ...anilist }, ...extra });

const categorySeasons = [
  makeSeason({
    id: 'summer-2026', name: 'Summer 2026',
    shows: [
      tagged('Isekai A', 1, { format: 'TV', genres: ['Fantasy'], tags: ['Isekai'], studios: ['GoHands'] }, { streaming: ['crunchyroll'] }),
      tagged('Isekai B', 0, { format: 'TV', genres: ['Fantasy'], tags: ['Isekai'], studios: ['GoHands'] }, { streaming: ['crunchyroll'], watched: { from: '2026-07-01', finished: true } }),
      tagged('Romcom A', 5, { format: 'ONA', genres: ['Comedy', 'Romance'], tags: ['School'], studios: ['MAPPA'] }, { op: [1] }),
    ],
    toReview: [], notReviewing: [],
  }),
  makeSeason({
    id: 'spring-2026', name: 'Spring 2026',
    shows: [
      // Revisited 2 -> 4: counts as a 4, and as a +2 shift.
      tagged('Isekai C', 2, { format: 'TV', genres: ['Fantasy', 'Comedy'], tags: ['Isekai'], studios: ['MAPPA'] }, { revisit: { ratingNumber: 4, ratingText: 'y' }, dateReviewed: '2026-04-01' }),
      tagged('Romcom B', 4, { format: 'TV', genres: ['Comedy', 'Romance'], tags: ['School'], studios: ['MAPPA'] }, { dateReviewed: '2026-04-02' }),
      makeShow({ titleEN: 'Untagged', ratingNumber: 3, ratingText: 'x', text: '', dateReviewed: '2026-04-03' }),
    ],
    toReview: [], notReviewing: [],
  }),
];
const categoryReviews = flattenReviews(categorySeasons);

test('computeCategoryRatings averages each genre by its revisit-aware rating, with share and note counts', () => {
  const rows = computeCategoryRatings(categoryReviews, 'genre', { minShows: 1 });
  const fantasy = rows.find((r) => r.value === 'Fantasy');
  assert.deepEqual(fantasy, {
    value: 'Fantasy', shows: 3, avgRating: (1 + 0 + 4) / 3,
    highShare: 1 / 3, lowShare: 2 / 3, revisitShift: 2, revisits: 1, finished: 1, likedOpEd: 0,
  });
  // Best first; reviews with no AniList data simply don't appear under any genre.
  assert.deepEqual(rows.map((r) => r.value), ['Romance', 'Comedy', 'Fantasy']);
  assert.equal(rows.find((r) => r.value === 'Romance').revisitShift, null);
});

test('computeCategoryRatings leaves out categories under the minimum, and says how many', () => {
  const rows = computeCategoryRatings(categoryReviews, 'studio', { minShows: 3 });
  assert.deepEqual(rows.map((r) => [r.value, r.shows]), [['MAPPA', 3]]);
  assert.equal(rows.hidden, 1);
});

test('computeCategoryRatings works for format and streaming too', () => {
  assert.deepEqual(computeCategoryRatings(categoryReviews, 'format', { minShows: 1 }).map((r) => r.value), ['ONA', 'TV']);
  assert.deepEqual(computeCategoryRatings(categoryReviews, 'on', { minShows: 1 }).map((r) => [r.value, r.shows]), [['crunchyroll', 2]]);
});

test('computeLovesAndHates picks the best and worst rated categories that clear the minimum', () => {
  const { loves, hates } = computeLovesAndHates(categoryReviews, 'tag', { n: 1, minShows: 2 });
  assert.deepEqual(loves.map((r) => r.value), ['School']);
  assert.deepEqual(hates.map((r) => r.value), ['Isekai']);
});

test('computeLovesAndHates never lists the same category as both a love and a hate', () => {
  const { loves, hates } = computeLovesAndHates(categoryReviews, 'tag', { n: 5, minShows: 2 });
  assert.deepEqual(loves.map((r) => r.value), ['School']);
  assert.deepEqual(hates.map((r) => r.value), ['Isekai']);
});

function categoryRoutes() {
  return createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': categorySeasons[0],
    '/vqar/data/seasons/spring-2026.json': categorySeasons[1],
  });
}

async function waitForTable(document, id) {
  for (let i = 0; i < 200 && !document.querySelector(`#${id} table`); i++) await new Promise((r) => setTimeout(r, 5));
}


test('Taste Profile tables genres by your ratings, each name linking to that genre on /vqar', async () => {
  const { document } = await loadApp({ fetch: categoryRoutes() });
  await waitForTable(document, 'tasteTable');

  // Romance has only 2 shows, under the 3-show minimum.
  assert.deepEqual(tableRows(document, 'tasteTable'), [
    ['Comedy', '3', '4.3', '100%', '0%', '+2.0', '0', '1'],
    ['Fantasy', '3', '1.7', '33%', '67%', '+2.0', '1', '0'],
  ]);
  assert.equal(document.querySelector('#tasteTable td a').getAttribute('href'), '/vqar?season=all&genre=Comedy');
  assert.equal(document.getElementById('tasteNote').textContent, "1 more genre with fewer than 3 shows isn't listed.");
});

test('the Taste Profile switch re-slices by studio, format or streaming service', async () => {
  const { document } = await loadApp({ fetch: categoryRoutes() });
  await waitForTable(document, 'tasteTable');

  document.querySelector('.vs-switch-button[data-dimension="studio"]').click();
  assert.deepEqual(tableRows(document, 'tasteTable').map((r) => r[0]), ['MAPPA']);
  assert.equal(document.querySelector('.vs-switch-button[data-dimension="studio"]').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('#tasteTable td a').getAttribute('href'), '/vqar?season=all&studio=MAPPA');

  document.querySelector('.vs-switch-button[data-dimension="format"]').click();
  assert.deepEqual(tableRows(document, 'tasteTable').map((r) => r[0]), ['TV']);

  document.querySelector('.vs-switch-button[data-dimension="on"]').click();
  assert.match(document.querySelector('#tasteTable .loading').textContent, /No services with 3\+ shows/);
});

test('Loves & Hates lists best and worst per genre/studio/tag', async () => {
  const { document } = await loadApp({ fetch: categoryRoutes() });
  await waitForTable(document, 'lovesHates');
  const headings = [...document.querySelectorAll('#lovesHates h3')].map((h) => h.textContent);
  assert.deepEqual(headings, ['Genres', 'Studios', 'Tags']);
  assert.equal(document.querySelector('#lovesHates .vs-loves + .table-scroll td a').textContent, 'Comedy');
  assert.equal(document.querySelector('#lovesHates .vs-hates + .table-scroll td a').textContent, 'Fantasy');
});

test('the taste sections are the career view\'s: a season report leaves them out', async () => {
  const { document } = await loadApp({ fetch: categoryRoutes(), url: 'http://localhost/anime-stat-sheet/index.html?season=summer-2026' });
  assert.equal(document.getElementById('tasteProfileSection').hidden, true);
  assert.equal(document.getElementById('lovesHatesSection').hidden, true);
});

// --- Hope Check ---

const hope = (titleEN, after, extra = {}) => makeShow({
  titleEN, ratingNumber: 4, ratingText: 'Yeah', dateReviewed: '2026-07-01',
  ...(after === undefined ? {} : { revisit: { ratingNumber: after, ratingText: 'x' } }), ...extra,
});

const hopeSeasons = [
  makeSeason({
    id: 'summer-2026', name: 'Summer 2026',
    shows: [hope('Rose', 5), hope('Fell', 2), hope('Waiting'), makeShow({ titleEN: 'Peak', ratingNumber: 5, ratingText: 'Peak', dateReviewed: '2026-07-01' })],
    toReview: [], notReviewing: [],
  }),
  makeSeason({
    id: 'spring-2026', name: 'Spring 2026',
    shows: [
      hope('Held', 4, { dateReviewed: '2026-04-01' }),
      // A 3 that grew isn't a dashed or kept hope - it never was one.
      makeShow({ titleEN: 'Grower', ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02', revisit: { ratingNumber: 5, ratingText: 'Peak' } }),
    ],
    toReview: [], notReviewing: [],
  }),
];

test('computeHopeCheck follows episode-1 4s: rose, held, fell or still waiting, overall and per season in airing order', () => {
  const h = computeHopeCheck(flattenReviews(hopeSeasons));
  assert.deepEqual(
    { hoping: h.hoping, revisited: h.revisited, rose: h.rose, held: h.held, fell: h.fell, waiting: h.waiting },
    { hoping: 4, revisited: 3, rose: 1, held: 1, fell: 1, waiting: 1 });
  assert.equal(h.heldShare, 2 / 3);
  assert.deepEqual(h.bySeason.map(s => [s.id, s.hoping, s.revisited, s.waiting, s.heldShare]), [
    ['spring-2026', 1, 1, 0, 1],
    ['summer-2026', 3, 2, 1, 0.5],
  ]);
});

test('computeHopeCheck has no held-up share before any 4 is revisited', () => {
  const h = computeHopeCheck(flattenReviews([makeSeason({ id: 'x', name: 'X', shows: [hope('Waiting')] })]));
  assert.equal(h.heldShare, null);
  assert.equal(h.waiting, 1);
});

function hopeRoutes() {
  return createPathFetchStub({
    '/vqar/data/index.json': seasonIndex,
    '/vqar/data/seasons/summer-2026.json': hopeSeasons[0],
    '/vqar/data/seasons/spring-2026.json': hopeSeasons[1],
  });
}

test('Hope Check tiles the totals and tables each season, linking its waiting count to /vqar', async () => {
  const { document } = await loadApp({ fetch: hopeRoutes() });
  await waitForTable(document, 'hopeCheckTable');
  const tiles = Object.fromEntries([...document.querySelectorAll('#hopeCheckStats .stat-tile')]
    .map((el) => [el.querySelector('.stat-label').textContent, el.querySelector('.stat-value').textContent]));
  assert.equal(tiles['Hope Held Up'], '67%');
  assert.equal(tiles['Still Waiting'], '1');
  assert.deepEqual(tableRows(document, 'hopeCheckTable'), [
    ['Spring 2026', '1', '1', '0', '1', '0', '100%', '0'],
    ['Summer 2026', '3', '2', '1', '0', '1', '50%', '1'],
  ]);
  assert.equal(document.querySelector('#hopeCheckTable td a').getAttribute('href'), '/vqar?season=summer-2026&has=queue');
});

test('Hope Check drops the per-season table once the filter picks one season', async () => {
  const { document } = await loadApp({ fetch: hopeRoutes(), url: 'http://localhost/anime-stat-sheet/index.html?season=spring-2026' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(document.querySelector('#hopeCheckTable table'), null);
});

// --- Live and historical reviews ---

// A season reviewed live, and a lineup of backfills: shows reviewed after the
// fact, with no episode-1 first impression - historical picks, which skew high.
const backfilledLineup = makeSeason({
  id: 'spring-2022', name: 'Spring 2022',
  shows: [
    makeShow({ titleEN: 'Caught Live, Reviewed Later', reviews: [{ ratingNumber: 5, dateReviewed: '2026-11-17T12:00:00-05:00' }] }),
    makeShow({ titleEN: 'Another One', reviews: [{ episodes: 12, ratingNumber: 4, dateReviewed: '2026-11-17T12:05:00-05:00' }], op: [1] }),
  ],
  toReview: [], notReviewing: [],
});
const withBackfilledLineup = [...seasons, backfilledLineup];
const backfilledReviews = flattenReviews(withBackfilledLineup);

test('a show is live when it has an episode-1 first impression, and historical when it doesn\'t', () => {
  assert.equal(reviewSource(makeShow({ titleEN: 'A', ratingNumber: 3 })), 'live');
  assert.equal(reviewSource(backfilledLineup.shows[0]), 'historical');
  assert.equal(reviewSource(backfilledLineup.shows[1]), 'historical');
  assert.deepEqual(filterBySource(backfilledReviews, 'historical').map(r => r.titleEN), ['Caught Live, Reviewed Later', 'Another One']);
  assert.equal(filterBySource(backfilledReviews, 'live').length, 6);
  assert.equal(filterBySource(backfilledReviews, 'all').length, 8);
});

test('the glance stats keep live and historical averages apart as well as pooled', () => {
  const s = computeGlanceStats(backfilledReviews);
  assert.equal(s.shows, 8);
  assert.equal(s.live, 6);
  assert.equal(s.historical, 2);
  assert.equal(s.avgLive, (5 + 5 + 1 + 3 + 2) / 5);
  assert.equal(s.avgHistorical, (5 + 4) / 2);
  assert.equal(s.seasons, 3);
});

test('a season of backfills has no coverage, and counts in the season table with no coverage', () => {
  assert.equal(hasLiveLineup(backfilledLineup), false);
  assert.equal(hasLiveLineup(seasons[0]), true);
  assert.deepEqual(computeSeasonCoverage(withBackfilledLineup), computeSeasonCoverage(seasons));
  const row = computeSeasonTable(withBackfilledLineup, backfilledReviews).find(r => r.id === 'spring-2022');
  assert.deepEqual(row, { id: 'spring-2022', name: 'Spring 2022', shows: 2, live: 0, historical: 2, avgRating: 4.5, highShare: 1, lowShare: 0, coveragePct: null });
  assert.deepEqual(computeHopeCheck(backfilledReviews).bySeason.map(x => x.name), computeHopeCheck(reviews).bySeason.map(x => x.name));
});

test('a filled-in Not Reviewing list does not make a season of backfills live', () => {
  const filledIn = makeSeason({
    id: 'spring-2022', name: 'Spring 2022',
    shows: backfilledLineup.shows,
    notReviewing: ['Everything Else That Aired', { title: 'A Sequel', reason: 'Continuing series' }],
  });
  assert.equal(hasLiveLineup(filledIn), false);
  assert.equal(hasLiveLineup(makeSeason({ id: 'fall-2026', name: 'Fall 2026', toReview: ['Upcoming'] })), true);
});

test('computeSeasonTable lists seasons in the order given, skipping any with nothing in view', () => {
  const live = filterBySource(backfilledReviews, 'live');
  assert.deepEqual(computeSeasonTable(withBackfilledLineup, live).map(r => r.id), ['summer-2026', 'spring-2026']);
  assert.deepEqual(computeSeasonTable(withBackfilledLineup, backfilledReviews).map(r => r.id), ['summer-2026', 'spring-2026', 'spring-2022']);
});

function backfillRoutes() {
  return createPathFetchStub({
    '/vqar/data/index.json': { ...seasonIndex, seasons: [...seasonIndex.seasons, { id: 'spring-2022', name: 'Spring 2022', file: '/vqar/data/seasons/spring-2022.json' }] },
    '/vqar/data/seasons/summer-2026.json': seasons[0],
    '/vqar/data/seasons/spring-2026.json': seasons[1],
    '/vqar/data/seasons/spring-2022.json': backfilledLineup,
  });
}

test('the career glance splits live and historical when both are in view', async () => {
  const { document } = await loadApp({ fetch: backfillRoutes() });
  const tiles = glance(document);
  assert.equal(tiles['Live'], '6');
  assert.equal(tiles['Historical'], '2');
  assert.equal(tiles['Live Average'], '3.2');
  assert.equal(tiles['Historical Average'], '4.5');
});

test('the Reviews switch narrows every section to live or historical reviews, and says so in the URL', async () => {
  const { document, window } = await loadApp({ fetch: backfillRoutes() });

  pickSource(document, 'historical');
  assert.equal(document.querySelector('#sourceSwitch [data-source="historical"]').getAttribute('aria-pressed'), 'true');
  assert.equal(glance(document)['Shows Reviewed'], '2');
  assert.equal(new URL(window.location.href).searchParams.get('source'), 'historical');
  // The picker's counts follow the source, and the season table drops the split and the coverage.
  assert.equal(document.querySelector('#seasonFilter option[value="spring-2022"]').textContent, 'Spring 2022 (2)');
  assert.equal(document.querySelector('#seasonFilter option[value="summer-2026"]').textContent, 'Summer 2026 (0)');
  assert.deepEqual(tableRows(document, 'seasonTable'), [['Spring 2022', '2', '4.5', '100%', '0%']]);
  // Nothing historical has an episode-1 rating to compare against, or a hope to check.
  assert.equal(document.getElementById('revisitsSection').hidden, true);

  pickSource(document, 'all');
  assert.equal(new URL(window.location.href).searchParams.get('source'), null);
  assert.equal(glance(document)['Shows Reviewed'], '8');
});

test('a "?source=" link opens narrowed, and a season with nothing of that source says so', async () => {
  const { document } = await loadApp({ fetch: backfillRoutes(), url: 'http://localhost/anime-stat-sheet/index.html?season=summer-2026&source=historical' });
  assert.equal(document.querySelector('#sourceSwitch [aria-pressed="true"]').dataset.source, 'historical');
  assert.equal(document.getElementById('seasonFilter').value, 'summer-2026');
  assert.equal(document.getElementById('statsGlance').textContent, 'No historical reviews in Summer 2026.');
  assert.ok([...document.querySelectorAll('section.section')].filter(s => !s.hidden).every(s => s.id === 'glanceSection'));
});

test('a season of backfills is measured against your historical average, with no coverage', async () => {
  const { document } = await loadApp({ fetch: backfillRoutes(), url: 'http://localhost/anime-stat-sheet/index.html?season=spring-2022' });
  assert.equal(glance(document)['vs. Historical Average'], '0.0');
  assert.equal(document.getElementById('coverageSection').hidden, true);
  // Its two shows are a 5 and a 4: both halls, each with its own tier.
  assert.equal(document.getElementById('valleys').hidden, false);
});

// --- By decade ---

// Shows from three decades, filed wherever they were reviewed: an old show
// picked up live sits in a 2026 lineup but counts in its own decade.
const decadeSeasons = [
  makeSeason({
    id: 'fall-2026', name: 'Fall 2026', current: true,
    shows: [
      makeShow({ titleEN: 'New Show', ratingNumber: 2, dateReviewed: '2026-10-01T12:00:00-04:00', aired: { season: 'fall', year: 2026 } }),
      makeShow({ titleEN: 'Paranoia Agent', ratingNumber: 5, dateReviewed: '2026-10-02T12:00:00-04:00', aired: { season: 'winter', year: 2004 } }),
      makeShow({ titleEN: 'No Aired Field', ratingNumber: 3, dateReviewed: '2026-10-03T12:00:00-04:00' }),
    ],
    toReview: [], notReviewing: [],
  }),
  makeSeason({
    id: 'spring-1979', name: 'Spring 1979',
    shows: [
      makeShow({ titleEN: 'Mobile Suit Gundam', reviews: [{ ratingNumber: 5, dateReviewed: '2026-11-01T12:00:00-05:00' }], aired: { season: 'spring', year: 1979 } }),
      makeShow({ titleEN: 'Captain Harlock', reviews: [{ ratingNumber: 5, dateReviewed: '2026-11-01T12:05:00-05:00' }], aired: { season: 'spring', year: 1978 } }),
      makeShow({ titleEN: 'Lesser Classic', reviews: [{ ratingNumber: 3, dateReviewed: '2026-11-01T12:10:00-05:00' }], aired: { year: 1977 } }),
    ],
    toReview: [], notReviewing: [],
  }),
];
const decadeReviews = flattenReviews(decadeSeasons);

test('airedYear reads aired.year, falling back to the year in the lineup id', () => {
  const byTitle = (t) => decadeReviews.find(r => r.titleEN === t);
  assert.equal(airedYear(byTitle('Paranoia Agent')), 2004);
  assert.equal(airedYear(byTitle('No Aired Field')), 2026);
  assert.equal(airedYear({ season: 'some-shelf' }), null);
});

test('computeDecadeTable groups by the decade a show aired in, newest first, with its top-rated titles', () => {
  const rows = computeDecadeTable(decadeReviews);
  assert.deepEqual(rows.map(r => [r.label, r.shows, r.live, r.historical]), [
    ['2020s', 2, 2, 0],
    ['2000s', 1, 1, 0],
    ['1970s', 3, 0, 3],
  ]);
  const seventies = rows[2];
  assert.equal(seventies.avgRating, (5 + 5 + 3) / 3);
  assert.equal(seventies.highShare, 2 / 3);
  assert.deepEqual(seventies.top, { ratingNumber: 5, titles: ['Captain Harlock', 'Mobile Suit Gundam'] });
  // With no year at all, a show still counts, under "Unknown", last.
  const unknown = computeDecadeTable(flattenReviews([makeSeason({ id: 'shelf', name: 'Shelf', sortKey: 0, shows: [makeShow({ titleEN: 'X', ratingNumber: 3 })] })]));
  assert.deepEqual(unknown.map(r => [r.decade, r.label]), [[null, 'Unknown']]);
});

function decadeRoutes() {
  return createPathFetchStub({
    '/vqar/data/index.json': {
      currentSeason: 'fall-2026',
      seasons: [
        { id: 'fall-2026', name: 'Fall 2026', file: '/vqar/data/seasons/fall-2026.json' },
        { id: 'spring-1979', name: 'Spring 1979', file: '/vqar/data/seasons/spring-1979.json' },
      ],
    },
    '/vqar/data/seasons/fall-2026.json': decadeSeasons[0],
    '/vqar/data/seasons/spring-1979.json': decadeSeasons[1],
  });
}

test('the Over Time switch regroups the career table by decade, and keeps it in the URL', async () => {
  const { document, window } = await loadApp({ fetch: decadeRoutes() });
  assert.deepEqual(tableRows(document, 'seasonTable').map(r => r[0]), ['Fall 2026', 'Spring 1979']);

  document.querySelector('#overTimeSwitch [data-by="decade"]').click();
  assert.equal(document.querySelector('#overTimeSwitch [data-by="decade"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(tableRows(document, 'seasonTable'), [
    ['2020s', '2', '2', '0', '2.5', '0%', '0%', 'No Aired Field (3.0)'],
    ['2000s', '1', '1', '0', '5.0', '100%', '0%', 'Paranoia Agent (5.0)'],
    ['1970s', '3', '0', '3', '4.3', '67%', '0%', 'Captain Harlock, Mobile Suit Gundam (5.0)'],
  ]);
  assert.equal(new URL(window.location.href).searchParams.get('by'), 'decade');

  // Narrowing the source keeps the grouping, and drops the live/historical split.
  pickSource(document, 'historical');
  assert.deepEqual(tableRows(document, 'seasonTable').map(r => r[0]), ['1970s']);
  assert.equal(tableRows(document, 'seasonTable')[0].length, 6);

  document.querySelector('#overTimeSwitch [data-by="season"]').click();
  assert.equal(new URL(window.location.href).searchParams.get('by'), null);
});

test('a "?by=decade" link opens on the decade table, and a long list of top titles is shortened', async () => {
  const many = makeSeason({
    id: 'fall-2026', name: 'Fall 2026', current: true,
    shows: ['A', 'B', 'C', 'D', 'E'].map(t => makeShow({ titleEN: `Show ${t}`, ratingNumber: 5, dateReviewed: '2026-10-01T12:00:00-04:00', aired: { season: 'fall', year: 2026 } })),
    toReview: [], notReviewing: [],
  });
  const fetch = createPathFetchStub({
    '/vqar/data/index.json': { currentSeason: 'fall-2026', seasons: [{ id: 'fall-2026', name: 'Fall 2026', file: '/vqar/data/seasons/fall-2026.json' }] },
    '/vqar/data/seasons/fall-2026.json': many,
  });
  const { document } = await loadApp({ fetch, url: 'http://localhost/anime-stat-sheet/index.html?by=decade' });
  const [row] = tableRows(document, 'seasonTable');
  assert.equal(row[0], '2020s');
  assert.equal(row.at(-1), 'Show A, Show B, Show C +2 (5.0)');
});

// --- Revisits ---

test('Revisits tiles every revisit, then the Here\'s Hoping 4s, then the biggest swings', async () => {
  const { document } = await loadApp({ fetch: hopeRoutes() });
  await waitForTable(document, 'swingsTable');
  const tiles = Object.fromEntries([...document.querySelectorAll('#revisitStats .stat-tile')]
    .map((el) => [el.querySelector('.stat-label').textContent, el.querySelector('.stat-value').textContent]));
  // Rose 4->5, Fell 4->2, Held 4->4, Grower 3->5.
  assert.deepEqual(tiles, { 'Revisited': '4', 'Average Shift': '+0.3', 'Went Up': '2', 'Held': '1', 'Went Down': '1' });
  assert.equal(document.getElementById('hopeBlock').hidden, false);
  assert.deepEqual(tableRows(document, 'swingsTable')[0], ['Fell', '4.0', '2.0', '-2.0']);
});

test('Revisits keeps the Here\'s Hoping block when every 4 is still waiting, and hides the rest', async () => {
  const fetch = createPathFetchStub({
    '/vqar/data/index.json': { currentSeason: 'summer-2026', seasons: [{ id: 'summer-2026', name: 'Summer 2026', file: '/vqar/data/seasons/summer-2026.json' }] },
    '/vqar/data/seasons/summer-2026.json': makeSeason({ id: 'summer-2026', name: 'Summer 2026', shows: [hope('Waiting')], toReview: [], notReviewing: [] }),
  });
  const { document } = await loadApp({ fetch });
  assert.equal(document.getElementById('revisitsSection').hidden, false);
  assert.equal(document.getElementById('hopeBlock').hidden, false);
  assert.equal(document.getElementById('revisitStats').hidden, true);
  assert.equal(document.getElementById('swingsBlock').hidden, true);
});
