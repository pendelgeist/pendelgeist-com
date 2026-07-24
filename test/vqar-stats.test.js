import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  flattenReviews, computeGlanceStats, computeRatingDistribution, computeRatingsOverTime,
  computeHallOfFame, computeSecondImpressions, computeOpEdHighlights, computeWordChoice,
} from '../public/vqar-stats/stats.js';
import { createFetchStub, createLocalStorageStub } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- stats.js: pure computation ---

const seasons = [
  {
    id: 'summer-2026', name: 'Summer 2026',
    reviewed: [
      { titleEN: 'Peak Show', ratingNumber: 5, ratingText: 'Peak', review: 'Total kino, certified banger episode', dateReviewed: '2026-07-01', anilistId: 111, op: { ratingNumber: 5, ratingText: 'Peak' } },
      { titleEN: 'Meh Show', ratingNumber: 3, ratingText: 'Meh', review: 'Pretty mid, nothing special here', dateReviewed: '2026-07-05', fullReview: { ratingNumber: 5, ratingText: 'Peak', review: 'Turned out goated after all' } },
      { titleEN: 'Trash Show', ratingNumber: 1, ratingText: 'Trash', review: 'Isekai harem trash, total waifu bait', dateReviewed: '2026-07-10', ed: { ratingNumber: 2, ratingText: 'Trash' } },
    ],
    pending: ['Pending Show'],
    skipped: [],
  },
  {
    id: 'spring-2026', name: 'Spring 2026',
    reviewed: [
      { titleEN: 'Fine Show', ratingNumber: 3, ratingText: 'Meh', review: 'Filler arc, plot armor nonsense', dateReviewed: '2026-04-01' },
      { titleEN: 'Great Show', ratingNumber: 4, ratingText: 'Yeah', review: 'Best girl carried, certified banger OP', dateReviewed: '2026-04-15', fullReview: { ratingNumber: 2, ratingText: 'Trash', review: 'It got cooked badly' } },
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
  assert.equal(s.avgRating, (5 + 3 + 1 + 3 + 4) / 5); // "No Rating Show" excluded
  assert.equal(s.fullReReviews, 2);
  assert.equal(s.opCallouts, 1);
  assert.equal(s.edCallouts, 1);
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

test('computeRatingDistribution counts by ratingText, ordered by rating number ascending (low to high)', () => {
  const dist = computeRatingDistribution(reviews);
  assert.deepEqual(dist.map(d => d.ratingText), ['Custom Rating', 'Trash', 'Meh', 'Yeah', 'Peak']);
  assert.equal(dist.find(d => d.ratingText === 'Meh').count, 2);
});

test('computeRatingsOverTime averages rating per season, ordered by earliest review date', () => {
  const overTime = computeRatingsOverTime(reviews);
  assert.deepEqual(overTime.map(s => s.seasonName), ['Spring 2026', 'Summer 2026']);
  const spring = overTime.find(s => s.seasonName === 'Spring 2026');
  assert.equal(spring.avgRating, (3 + 4) / 2); // "No Rating Show" excluded
  assert.equal(spring.count, 2);
});

test('computeHallOfFame ranks numerically-rated shows best and worst', () => {
  const { best, worst } = computeHallOfFame(reviews, 2);
  assert.deepEqual(best.map(r => r.titleEN), ['Peak Show', 'Great Show']);
  assert.deepEqual(worst.map(r => r.titleEN), ['Trash Show', 'Meh Show']);
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

test('computeOpEdHighlights ranks OP/ED callouts that carry their own rating', () => {
  const s = computeOpEdHighlights(reviews);
  assert.equal(s.opCount, 1);
  assert.equal(s.edCount, 1);
  assert.equal(s.topOps[0].titleEN, 'Peak Show');
  assert.equal(s.topEds[0].titleEN, 'Trash Show');
});

test('computeWordChoice only counts curated otaku/anime-slang terms, never plain English', () => {
  const words = computeWordChoice(reviews, 20);
  const byWord = Object.fromEntries(words.map(w => [w.word, w.count]));

  assert.equal(byWord.banger, 2); // "Peak Show" + "Great Show" reviews
  assert.equal(byWord.kino, 1);
  assert.equal(byWord.mid, 1);
  assert.equal(byWord.goated, 1);
  assert.equal(byWord.isekai, 1);
  assert.equal(byWord.harem, 1);
  assert.equal(byWord.waifu, 1);
  assert.equal(byWord.filler, 1);
  assert.equal(byWord['plot armor'], 1);
  assert.equal(byWord['best girl'], 1);
  assert.equal(byWord.cooked, 1);

  assert.ok(!('great' in byWord) && !('nothing' in byWord) && !('special' in byWord), 'plain English should never appear, even if repeated');
  // Highest count sorts first.
  assert.equal(words[0].word, 'banger');
});

test('computeWordChoice returns nothing when no review text contains a curated term', () => {
  const plainReviews = flattenReviews([{ id: 'x', name: 'X', reviewed: [{ titleEN: 'A', ratingText: 'Meh', review: 'This was a fine and normal episode with nothing notable', dateReviewed: '2026-01-01' }] }]);
  assert.deepEqual(computeWordChoice(plainReviews), []);
});

// --- Rendered page ---

const INDEX_HTML_PATH = path.join(__dirname, '../public/vqar-stats/index.html');
const APP_JS_PATH = path.join(__dirname, '../public/vqar-stats/app.js');

const manifest = {
  currentSeason: 'summer-2026',
  seasons: [
    { id: 'summer-2026', name: 'Summer 2026', file: 'https://gist.githubusercontent.com/pendelgeist/aaa/raw/vqar-season-summer-2026.json' },
    { id: 'spring-2026', name: 'Spring 2026', file: 'https://gist.githubusercontent.com/pendelgeist/bbb/raw/vqar-season-spring-2026.json' },
  ],
};

function routes() {
  return {
    'vqar-manifest.json': manifest,
    'vqar-season-summer-2026.json': seasons[0],
    'vqar-season-spring-2026.json': seasons[1],
  };
}

let importCounter = 0;

async function loadApp({ fetch = createFetchStub(routes()), localStorage = createLocalStorageStub(), url = 'http://localhost/vqar-stats/index.html' } = {}) {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });

  global.document = dom.window.document;
  global.localStorage = localStorage;
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
  assert.equal(tiles.length, 8);
  const totalReviewsTile = tiles.find(t => t.querySelector('.stat-label').textContent === 'Total Reviews');
  assert.equal(totalReviewsTile.querySelector('.stat-value').textContent, '6');
});

test('renders a rating distribution bar chart and a hall of fame table', async () => {
  const { document } = await loadApp();

  assert.ok(document.querySelectorAll('#ratingDistributionChart .bar-fill').length > 0);
  const bestRows = [...document.querySelectorAll('#hallOfFameBest tbody tr')].map(tr => tr.children[0].textContent);
  assert.equal(bestRows[0], 'Peak Show');
});

test('renders the browse table and filters it by search', async () => {
  const { document } = await loadApp();

  const rowsText = () => [...document.querySelectorAll('#dataTableWrap tbody tr')].map(tr => tr.children[0].textContent);
  assert.equal(rowsText().length, 6);

  const search = document.getElementById('dataSearch');
  search.value = 'peak show';
  search.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  assert.deepEqual(rowsText(), ['Peak Show']);
});

test('shows an error message if the manifest fails to load', async () => {
  const fetch = async () => ({ ok: false, status: 500 });
  const { document } = await loadApp({ fetch });

  const err = document.querySelector('#statsGlance .loading');
  assert.ok(err, 'expected an error message in the stats-glance container');
  assert.match(err.textContent, /ERROR/);
});

test('season filter is populated from the manifest and defaults to "All Seasons"', async () => {
  const { document } = await loadApp();

  const options = [...document.querySelectorAll('#seasonFilter option')].map(o => ({ value: o.value, text: o.textContent }));
  assert.deepEqual(options, [
    { value: 'all', text: 'All Seasons' },
    { value: 'summer-2026', text: 'Summer 2026' },
    { value: 'spring-2026', text: 'Spring 2026' },
  ]);
  assert.equal(document.getElementById('seasonFilter').value, 'all');
});

test('picking a season in the filter scopes every stat, the browse table, and the glance grid to just that season', async () => {
  const { document } = await loadApp();

  const select = /** @type {any} */ (document.getElementById('seasonFilter'));
  select.value = 'spring-2026';
  select.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));

  const tiles = [...document.querySelectorAll('#statsGlance .stat-tile')];
  const totalReviewsTile = tiles.find(t => t.querySelector('.stat-label').textContent === 'Total Reviews');
  assert.equal(totalReviewsTile.querySelector('.stat-value').textContent, '3'); // only Spring 2026's reviews

  const rowsText = () => [...document.querySelectorAll('#dataTableWrap tbody tr')].map(tr => tr.children[1].textContent);
  assert.deepEqual(new Set(rowsText()), new Set(['Spring 2026']));

  const bestRows = [...document.querySelectorAll('#hallOfFameBest tbody tr')].map(tr => tr.children[0].textContent);
  assert.equal(bestRows[0], 'Great Show'); // Peak Show (Summer 2026) is out of scope now
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
