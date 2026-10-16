import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  flattenReviews, computeGlanceStats, computeRatingDistribution, computeRatingsOverTime,
  computeHallOfFame, computeSecondImpressions, computeOpEdHighlights,
  computeCategoryRatings, computeLovesAndHates, computeGenreBySeason,
  computeRevisitCandidates, computeContinuationWatch, computeSeasonCoverage, computeHopeCheck,
} from '../public/vqar-stats/stats.js';
import { createPathFetchStub } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- stats.js: pure computation ---

const seasons = [
  {
    id: 'summer-2026', name: 'Summer 2026',
    reviewed: [
      { titleEN: 'Peak Show', ratingNumber: 5, ratingText: 'Peak', review: 'An excellent episode all around', dateReviewed: '2026-07-01', anilistId: 111, op: true },
      { titleEN: 'Meh Show', ratingNumber: 3, ratingText: 'Meh', review: 'Just fine, nothing special here', dateReviewed: '2026-07-05', fullReview: { ratingNumber: 5, ratingText: 'Peak', review: 'Turned out great after all' } },
      { titleEN: 'Trash Show', ratingNumber: 1, ratingText: 'Trash', review: 'Rough episode, animation was bad', dateReviewed: '2026-07-10', ed: true, finishedSeason: true },
    ],
    pending: ['Pending Show'],
    skipped: [],
  },
  {
    id: 'spring-2026', name: 'Spring 2026',
    reviewed: [
      { titleEN: 'Fine Show', ratingNumber: 3, ratingText: 'Meh', review: 'Perfectly fine, nothing special', dateReviewed: '2026-04-01' },
      { titleEN: 'Great Show', ratingNumber: 4, ratingText: 'Yeah', review: 'Great animation and great story', dateReviewed: '2026-04-15', fullReview: { ratingNumber: 2, ratingText: 'Trash', review: 'It fell apart badly' } },
      { titleEN: 'No Rating Show', ratingText: 'Custom Rating', review: 'Unrated but noted', dateReviewed: '2026-04-20' },
    ],
    pending: [],
    skipped: ['Skipped Show'],
  },
];

const reviews = flattenReviews(seasons);

test('flattenReviews tags each review with season id/name and a parsed timestamp', () => {
  assert.equal(reviews.length, 6);
  assert.ok(reviews.every(r => r.season && r.seasonName));
  assert.equal(reviews.find(r => r.titleEN === 'Peak Show').seasonName, 'Summer 2026');
  assert.equal(reviews.find(r => r.titleEN === 'Peak Show')._timestamp, Date.parse('2026-07-01'));
});

test('computeGlanceStats totals reviews, averages numeric ratings, and finds the busiest season', () => {
  const s = computeGlanceStats(seasons, reviews);
  assert.equal(s.totalReviews, 6);
  assert.equal(s.seasonsCovered, 2);
  assert.equal(s.avgRating, (5 + 5 + 1 + 3 + 2) / 5); // "No Rating Show" excluded; Meh Show/Great Show use their fullReview rating
  assert.equal(s.fullReReviews, 2);
  assert.equal(s.likedOps, 1);
  assert.equal(s.likedEds, 1);
  assert.equal(s.finishedSeasons, 1);
  assert.equal(s.busiestSeasonName, 'Summer 2026');
  assert.equal(s.busiestSeasonCount, 3);
  assert.equal(s.anilistCoveragePct, Math.round((1 / 6) * 100));
});

test('computeGlanceStats handles an empty dataset without dividing by zero', () => {
  const s = computeGlanceStats([], []);
  assert.equal(s.totalReviews, 0);
  assert.equal(s.avgRating, null);
  assert.equal(s.busiestSeasonName, null);
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

test('computeRatingsOverTime averages rating per season, ordered by earliest review date', () => {
  const overTime = computeRatingsOverTime(reviews);
  assert.deepEqual(overTime.map(s => s.seasonName), ['Spring 2026', 'Summer 2026']);
  const spring = overTime.find(s => s.seasonName === 'Spring 2026');
  assert.equal(spring.avgRating, (3 + 2) / 2); // "No Rating Show" excluded; Great Show uses its fullReview rating (2)
  assert.equal(spring.count, 2);
});

test('computeHallOfFame ranks numerically-rated shows best and worst, by their fullReview rating once they have one', () => {
  const { best, worst } = computeHallOfFame(reviews, 2);
  // Meh Show's fullReview (5) ties it with Peak Show for best; alphabetical tiebreak puts it first.
  assert.deepEqual(best.map(r => r.titleEN), ['Meh Show', 'Peak Show']);
  // Great Show's fullReview (2) drops it out of the top ranks and into the bottom two.
  assert.deepEqual(worst.map(r => r.titleEN), ['Trash Show', 'Great Show']);
});

test('computeSecondImpressions compares episode-1 rating to full-series re-review', () => {
  const s = computeSecondImpressions(reviews);
  assert.equal(s.total, 2);
  assert.equal(s.upgrades, 1); // Meh Show: 3 -> 5
  assert.equal(s.downgrades, 1); // Great Show: 4 -> 2
  assert.equal(s.avgDelta, ((5 - 3) + (2 - 4)) / 2);
  assert.equal(s.swings.length, 2);
});

test('computeSecondImpressions is empty when nothing has a full re-review', () => {
  const s = computeSecondImpressions(flattenReviews([{ id: 'x', name: 'X', reviewed: [{ titleEN: 'A', ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-01-01' }] }]));
  assert.equal(s.total, 0);
  assert.equal(s.avgDelta, null);
  assert.deepEqual(s.swings, []);
});

test('computeOpEdHighlights lists the liked OPs and EDs, with their season', () => {
  const s = computeOpEdHighlights(reviews);
  assert.equal(s.opCount, 1);
  assert.equal(s.edCount, 1);
  assert.deepEqual(s.likedOps, [{ titleEN: 'Peak Show', seasonName: 'Summer 2026' }]);
  assert.deepEqual(s.likedEds, [{ titleEN: 'Trash Show', seasonName: 'Summer 2026' }]);
});

test('computeOpEdHighlights lists every liked OP by title, with no top-N cap', () => {
  const liked = flattenReviews([{
    id: 'summer-2026', name: 'Summer 2026',
    reviewed: ['F', 'B', 'D', 'A', 'E', 'C', 'G'].map(t => ({ titleEN: `Show ${t}`, ratingText: 'Meh', review: '', dateReviewed: '2026-07-01', op: true })),
    pending: [], skipped: [],
  }]);
  const s = computeOpEdHighlights(liked);
  assert.deepEqual(s.likedOps.map(r => r.titleEN), ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(t => `Show ${t}`));
});

test('computeRevisitCandidates finds current-season 4/5s without a fullReview, excluding 5/5s and already-revisited ones', () => {
  const currentSeasonReviews = flattenReviews([
    {
      id: 'current-season', name: 'Current Season',
      reviewed: [
        { titleEN: 'Worth Revisiting', ratingNumber: 4, ratingText: 'Yeah', dateReviewed: '2026-07-01' },
        { titleEN: 'Already Revisited', ratingNumber: 4, ratingText: 'Yeah', dateReviewed: '2026-07-02', fullReview: { ratingNumber: 5, ratingText: 'Peak', dateReviewed: '2026-08-01' } },
        { titleEN: 'Already Peak', ratingNumber: 5, ratingText: 'Peak', dateReviewed: '2026-07-03' },
        { titleEN: 'Just Meh', ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-07-04' },
      ],
    },
    {
      id: 'other-season', name: 'Other Season',
      reviewed: [{ titleEN: 'Other Season 4/5', ratingNumber: 4, ratingText: 'Yeah', dateReviewed: '2026-01-01' }],
    },
  ]);

  const candidates = computeRevisitCandidates(currentSeasonReviews, 'current-season');
  assert.deepEqual(candidates.map(r => r.titleEN), ['Worth Revisiting']);
});

test('computeSeasonCoverage counts reviewed out of reviewed + pending, ignoring skipped shows', () => {
  assert.deepEqual(computeSeasonCoverage([seasons[0]]), { reviewed: 3, pending: 1, total: 4, pct: 75 });
  const all = computeSeasonCoverage(seasons);
  assert.equal(all.total, all.reviewed + all.pending);
  assert.equal(all.total, 7);
});

test('computeSeasonCoverage has no percentage when nothing is reviewed or pending', () => {
  assert.deepEqual(computeSeasonCoverage([{ id: 'x', name: 'X', reviewed: [], pending: [], skipped: [] }]),
    { reviewed: 0, pending: 0, total: 0, pct: null });
});

test('computeContinuationWatch matches sequel-marker titles in the current season against highly-rated past shows', () => {
  const seasonsWithSequels = [
    {
      id: 'past-season', name: 'Past Season',
      reviewed: [
        { titleEN: 'Great Show', ratingNumber: 5, ratingText: 'Peak', dateReviewed: '2026-01-01' },
        { titleEN: 'Fine Show', ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-01-02' },
      ],
    },
    {
      id: 'current-season', name: 'Current Season',
      pending: ['Great Show Season 2', 'Unrelated New Show'],
      skipped: ['Fine Show 2nd Season'],
      reviewed: [{ titleEN: 'Great Show II', ratingNumber: 4, ratingText: 'Yeah', dateReviewed: '2026-07-01' }],
    },
  ];

  const matches = computeContinuationWatch(seasonsWithSequels, 'current-season');
  // Both matched "Great Show" at the same rating, so tiebreaker is alphabetical title.
  assert.deepEqual(
    matches.map(m => ({ title: m.title, status: m.status, matchedTitle: m.matchedTitle })),
    [
      { title: 'Great Show II', status: 'reviewed', matchedTitle: 'Great Show' },
      { title: 'Great Show Season 2', status: 'pending', matchedTitle: 'Great Show' },
    ]
  );
  assert.ok(matches.every(m => m.seasonName === 'Past Season' && m.rating === 5));
});

test('computeContinuationWatch returns nothing when the current season id is unknown or nothing clears minRating', () => {
  assert.deepEqual(computeContinuationWatch(seasons, 'no-such-season'), []);

  const lowRatedPast = [
    { id: 'past', name: 'Past', reviewed: [{ titleEN: 'Fine Show', ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-01-01' }] },
    { id: 'current', name: 'Current', pending: ['Fine Show Season 2'], skipped: [], reviewed: [] },
  ];
  assert.deepEqual(computeContinuationWatch(lowRatedPast, 'current'), []);
});


// --- Rendered page ---

const INDEX_HTML_PATH = path.join(__dirname, '../public/vqar-stats/index.html');
const APP_JS_PATH = path.join(__dirname, '../public/vqar-stats/app.js');

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

let importCounter = 0;

async function loadApp({ fetch = createPathFetchStub(routes()), url = 'http://localhost/vqar-stats/index.html' } = {}) {
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

test('renders the glance stat grid from live-fetched season data', async () => {
  const { document } = await loadApp();

  const tiles = [...document.querySelectorAll('#statsGlance .stat-tile')];
  assert.equal(tiles.length, 9);
  const tile = (label) => tiles.find(t => t.querySelector('.stat-label').textContent === label).querySelector('.stat-value').textContent;
  assert.equal(tile('Total Reviews'), '6');
  assert.equal(tile('Seasons Finished'), '1');
});

test('renders a rating distribution bar chart and a hall of fame table', async () => {
  const { document } = await loadApp();

  assert.ok(document.querySelectorAll('#ratingDistributionChart .bar-fill').length > 0);
  const bestRows = [...document.querySelectorAll('#hallOfFameBest tbody tr')].map(tr => tr.children[0].textContent);
  assert.equal(bestRows[0], 'Meh Show'); // ties Peak Show at 5 via its fullReview; alphabetical tiebreak puts it first
});

test('shows an error message if the season index fails to load', async () => {
  const fetch = async () => ({ ok: false, status: 500 });
  const { document } = await loadApp({ fetch });

  const err = document.querySelector('#statsGlance .loading');
  assert.ok(err, 'expected an error message in the stats-glance container');
  assert.match(err.textContent, /ERROR/);
});

test('season filter is populated from the index and defaults to "All Seasons"', async () => {
  const { document } = await loadApp();

  const options = [...document.querySelectorAll('#seasonFilter option')].map(o => ({ value: o.value, text: o.textContent }));
  assert.deepEqual(options, [
    { value: 'all', text: 'All Seasons' },
    { value: 'summer-2026', text: 'Summer 2026' },
    { value: 'spring-2026', text: 'Spring 2026' },
  ]);
  assert.equal(document.getElementById('seasonFilter').value, 'all');
});

test('picking a season in the filter scopes every stat and the glance grid to just that season', async () => {
  const { document } = await loadApp();

  const select = /** @type {any} */ (document.getElementById('seasonFilter'));
  select.value = 'spring-2026';
  select.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));

  const tiles = [...document.querySelectorAll('#statsGlance .stat-tile')];
  const totalReviewsTile = tiles.find(t => t.querySelector('.stat-label').textContent === 'Total Reviews');
  assert.equal(totalReviewsTile.querySelector('.stat-value').textContent, '3'); // only Spring 2026's reviews

  const bestRows = [...document.querySelectorAll('#hallOfFameBest tbody tr')].map(tr => tr.children[0].textContent);
  // Peak Show (Summer 2026) is out of scope now. Great Show's fullReview rating (2) ranks
  // it below Fine Show (3) within Spring 2026.
  assert.equal(bestRows[0], 'Fine Show');
});

test('Review Coverage shows reviewed out of reviewed + pending, and follows the season filter', async () => {
  const { document } = await loadApp();
  const text = () => document.querySelector('#coverageBar .coverage-summary').textContent;
  const bar = () => document.querySelector('#coverageBar [role="progressbar"]');

  assert.equal(document.getElementById('coverageSeasonName').textContent, 'All Seasons');
  assert.match(text(), /^6 of 7 shows reviewed \(86%\)$/);
  assert.equal(document.querySelector('#coverageBar .vs-prose').textContent, '6 reviewed · 1 pending');
  assert.equal(bar().getAttribute('aria-valuenow'), '6');
  assert.equal(bar().getAttribute('aria-valuemax'), '7');

  const select = /** @type {any} */ (document.getElementById('seasonFilter'));
  select.value = 'summer-2026';
  select.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  assert.equal(document.getElementById('coverageSeasonName').textContent, 'Summer 2026');
  assert.match(text(), /^3 of 4 shows reviewed \(75%\)$/);
});

test('the nav links back to VQAR', async () => {
  const { document } = await loadApp();
  assert.ok(document.querySelector('nav a[href="/vqar"]'));
});

test('Ratings Over Time is shown for All Seasons but hides once the filter narrows to a single season', async () => {
  const { document } = await loadApp();

  assert.equal(document.getElementById('ratingsOverTimeSection').hidden, false);

  const select = /** @type {any} */ (document.getElementById('seasonFilter'));
  select.value = 'spring-2026';
  select.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  assert.equal(document.getElementById('ratingsOverTimeSection').hidden, true);

  select.value = 'all';
  select.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  assert.equal(document.getElementById('ratingsOverTimeSection').hidden, false);
});

test('a "?season=" URL pre-selects that season on load', async () => {
  const { document } = await loadApp({ url: 'http://localhost/vqar-stats/index.html?season=spring-2026' });

  assert.equal(document.getElementById('seasonFilter').value, 'spring-2026');
  const tiles = [...document.querySelectorAll('#statsGlance .stat-tile')];
  const totalReviewsTile = tiles.find(t => t.querySelector('.stat-label').textContent === 'Total Reviews');
  assert.equal(totalReviewsTile.querySelector('.stat-value').textContent, '3');
});

test('an unknown "?season=" value is ignored, falling back to "All Seasons"', async () => {
  const { document } = await loadApp({ url: 'http://localhost/vqar-stats/index.html?season=nonexistent-season' });

  assert.equal(document.getElementById('seasonFilter').value, 'all');
});

test('renders Season Spotlight empty-state messages when the current season has nothing to flag', async () => {
  const { document } = await loadApp();

  assert.equal(document.getElementById('spotlightSeasonName').textContent, 'Summer 2026');
  assert.match(document.getElementById('revisitList').textContent, /No 4\/5s awaiting a revisit/);
  assert.match(document.getElementById('continuationList').textContent, /No returning favorites/);
});

test('Season Spotlight defaults to the current season for "All Seasons", then follows the filter to a picked past season', async () => {
  const spotlightSeasons = {
    currentSeason: 'summer-2026',
    seasons: [
      { id: 'fall-2025', name: 'Fall 2025', file: '/vqar/data/seasons/fall-2025.json' },
      { id: 'spring-2026', name: 'Spring 2026', file: '/vqar/data/seasons/spring-2026.json' },
      { id: 'summer-2026', name: 'Summer 2026', file: '/vqar/data/seasons/summer-2026.json' },
    ],
  };
  // Fall 2025 rated "Great Show" highly; Spring 2026 has its own 4/5 ("Spring
  // Revisit") and a returning season of Fall's "Great Show"; Summer 2026 (the
  // current season) has its own 4/5 ("Summer Revisit") and a returning season
  // of Spring's "Spring Revisit". This lets the test tell apart "spotlight
  // always shows the current season" from "spotlight follows the filter,
  // re-anchoring what counts as 'the past' to whichever season is picked".
  const fall = {
    id: 'fall-2025', name: 'Fall 2025',
    reviewed: [{ titleEN: 'Great Show', ratingNumber: 5, ratingText: 'Peak', dateReviewed: '2025-10-01' }],
    pending: [], skipped: [],
  };
  const spring = {
    id: 'spring-2026', name: 'Spring 2026',
    reviewed: [{ titleEN: 'Spring Revisit', ratingNumber: 4, ratingText: 'Yeah', dateReviewed: '2026-04-01' }],
    pending: ['Great Show Season 2'], skipped: [],
  };
  const summer = {
    id: 'summer-2026', name: 'Summer 2026',
    reviewed: [{ titleEN: 'Summer Revisit', ratingNumber: 4, ratingText: 'Yeah', dateReviewed: '2026-07-01' }],
    pending: ['Spring Revisit Season 2'], skipped: [],
  };
  const fetch = createPathFetchStub({
    '/vqar/data/index.json': spotlightSeasons,
    '/vqar/data/seasons/fall-2025.json': fall,
    '/vqar/data/seasons/spring-2026.json': spring,
    '/vqar/data/seasons/summer-2026.json': summer,
  });

  const { document } = await loadApp({ fetch });
  const revisitTitles = () => [...document.querySelectorAll('#revisitList .show-list li')].map(li => li.textContent);
  const continuationTitles = () => [...document.querySelectorAll('#continuationList .show-list li')].map(li => li.textContent);

  // "All Seasons" (the default) shows the current season, Summer 2026.
  assert.equal(document.getElementById('spotlightSeasonName').textContent, 'Summer 2026');
  assert.deepEqual(revisitTitles(), ['Summer Revisit']);
  assert.deepEqual(continuationTitles(), ['Spring Revisit Season 2']);

  // Picking a past season re-anchors the spotlight to it, and to whatever came before *it*.
  const select = /** @type {any} */ (document.getElementById('seasonFilter'));
  select.value = 'spring-2026';
  select.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));

  assert.equal(document.getElementById('spotlightSeasonName').textContent, 'Spring 2026');
  assert.deepEqual(revisitTitles(), ['Spring Revisit']);
  assert.deepEqual(continuationTitles(), ['Great Show Season 2']);
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

test('computeContinuationWatch reads titles from object-form pending and skipped entries', () => {
  const past = {
    id: 'past', name: 'Past', pending: [], skipped: [],
    reviewed: [{ titleEN: 'Great Show', ratingNumber: 5, ratingText: 'Nice Ep Broh', dateReviewed: '2025-01-01T00:00:00Z' }],
  };
  const current = {
    id: 'now', name: 'Now', reviewed: [],
    pending: [{ title: 'Great Show Season 2', firstEpisode: '2026-10-08' }],
    skipped: [{ title: 'Great Show 3rd Season', reason: 'no time' }],
  };

  const matches = computeContinuationWatch([past, current], 'now');
  assert.deepEqual(matches.map(m => [m.title, m.status]).sort(), [
    ['Great Show 3rd Season', 'skipped'],
    ['Great Show Season 2', 'pending'],
  ]);
});

// --- category cross-references ---

const tagged = (titleEN, ratingNumber, anilist, extra = {}) =>
  ({ titleEN, ratingNumber, ratingText: 'x', review: '', dateReviewed: '2026-07-01', anilistId: 1, anilist: { genres: [], tags: [], studios: [], ...anilist }, ...extra });

const categorySeasons = [
  {
    id: 'summer-2026', name: 'Summer 2026',
    reviewed: [
      tagged('Isekai A', 1, { format: 'TV', genres: ['Fantasy'], tags: ['Isekai'], studios: ['GoHands'] }, { streaming: ['crunchyroll'] }),
      tagged('Isekai B', 0, { format: 'TV', genres: ['Fantasy'], tags: ['Isekai'], studios: ['GoHands'] }, { streaming: ['crunchyroll'], finishedSeason: true }),
      tagged('Romcom A', 5, { format: 'ONA', genres: ['Comedy', 'Romance'], tags: ['School'], studios: ['MAPPA'] }, { op: true }),
    ],
    pending: [], skipped: [],
  },
  {
    id: 'spring-2026', name: 'Spring 2026',
    reviewed: [
      // Revisited 2 -> 4: counts as a 4, and as a +2 shift.
      tagged('Isekai C', 2, { format: 'TV', genres: ['Fantasy', 'Comedy'], tags: ['Isekai'], studios: ['MAPPA'] }, { fullReview: { ratingNumber: 4, ratingText: 'y' }, dateReviewed: '2026-04-01' }),
      tagged('Romcom B', 4, { format: 'TV', genres: ['Comedy', 'Romance'], tags: ['School'], studios: ['MAPPA'] }, { dateReviewed: '2026-04-02' }),
      { titleEN: 'Untagged', ratingNumber: 3, ratingText: 'x', review: '', dateReviewed: '2026-04-03' },
    ],
    pending: [], skipped: [],
  },
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

test('computeGenreBySeason averages each genre per season, seasons in airing order', () => {
  const grid = computeGenreBySeason(categoryReviews, { minShows: 2 });
  assert.deepEqual(grid.seasons.map((s) => s.id), ['spring-2026', 'summer-2026']);
  const comedy = grid.rows.find((r) => r.value === 'Comedy');
  assert.deepEqual(comedy.cells, { 'spring-2026': { avgRating: 4, shows: 2 }, 'summer-2026': { avgRating: 5, shows: 1 } });
  assert.deepEqual(grid.rows.find((r) => r.value === 'Fantasy').cells['spring-2026'], { avgRating: 4, shows: 1 });
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

const tableRows = (document, id) => [...document.querySelectorAll(`#${id} tbody tr`)].map((tr) => [...tr.children].map((td) => td.textContent));

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

test('Loves & Hates lists best and worst per genre/studio/tag, and Genre by Season needs more than one season', async () => {
  const { document } = await loadApp({ fetch: categoryRoutes() });
  await waitForTable(document, 'lovesHates');
  const headings = [...document.querySelectorAll('#lovesHates h3')].map((h) => h.textContent);
  assert.deepEqual(headings, ['Genres', 'Studios', 'Tags']);
  assert.equal(document.querySelector('#lovesHates .vs-loves + .table-scroll td a').textContent, 'Comedy');
  assert.equal(document.querySelector('#lovesHates .vs-hates + .table-scroll td a').textContent, 'Fantasy');

  assert.equal(document.getElementById('genreBySeasonSection').hidden, false);
  assert.deepEqual(tableRows(document, 'genreBySeasonTable')[0], ['Comedy', '4.0', '5.0']);
});

test('picking one season scopes the category sections and hides Genre by Season', async () => {
  const { document } = await loadApp({ fetch: categoryRoutes(), url: 'http://localhost/vqar-stats/index.html?season=summer-2026' });
  await waitForTable(document, 'tasteTable').catch(() => {});
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(document.getElementById('genreBySeasonSection').hidden, true);
  // Summer alone has no genre with 3 shows.
  assert.match(document.querySelector('#tasteTable .loading').textContent, /No genres with 3\+ shows/);
});

// --- Hope Check ---

const hope = (titleEN, after, extra = {}) => ({
  titleEN, ratingNumber: 4, ratingText: 'Yeah', dateReviewed: '2026-07-01',
  ...(after === undefined ? {} : { fullReview: { ratingNumber: after, ratingText: 'x' } }), ...extra,
});

const hopeSeasons = [
  {
    id: 'summer-2026', name: 'Summer 2026',
    reviewed: [hope('Rose', 5), hope('Fell', 2), hope('Waiting'), { titleEN: 'Peak', ratingNumber: 5, ratingText: 'Peak', dateReviewed: '2026-07-01' }],
    pending: [], skipped: [],
  },
  {
    id: 'spring-2026', name: 'Spring 2026',
    reviewed: [
      hope('Held', 4, { dateReviewed: '2026-04-01' }),
      // A 3 that grew isn't a dashed or kept hope - it never was one.
      { titleEN: 'Grower', ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02', fullReview: { ratingNumber: 5, ratingText: 'Peak' } },
    ],
    pending: [], skipped: [],
  },
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
  const h = computeHopeCheck(flattenReviews([{ id: 'x', name: 'X', reviewed: [hope('Waiting')] }]));
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
  // Revisit Candidates links to the same view for the season in the spotlight.
  const link = document.getElementById('revisitLink');
  assert.equal(link.hidden, false);
  assert.equal(link.getAttribute('href'), '/vqar?season=summer-2026&has=queue');
});

test('Hope Check drops the per-season table once the filter picks one season', async () => {
  const { document } = await loadApp({ fetch: hopeRoutes(), url: 'http://localhost/vqar-stats/index.html?season=spring-2026' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(document.querySelector('#hopeCheckTable table'), null);
  // Spring's only 4 has been revisited, so there's nothing to link to.
  assert.equal(document.getElementById('revisitLink').hidden, true);
});
