/**
 * Renders "VQAR By The Numbers" - a stats page over the same committed VQAR
 * data /vqar/app.js reads (the season index + every season) and crunched by
 * stats.js. Unlike /vqar, this page always needs every season loaded since
 * every stat here is an aggregate, so there's no per-season lazy fetch.
 */

import { VQAR_INDEX_PATH } from '../vqar/data-paths.js';
import { createDataTable, renderStatGrid, renderBarChart } from '../data-table.js';
import {
  flattenReviews, computeGlanceStats, computeRatingDistribution, computeRatingsOverTime,
  computeHallOfFame, computeSecondImpressions, computeOpEdHighlights,
  computeRevisitCandidates, computeContinuationWatch,
} from './stats.js';

/** @typedef {import('../vqar/app.js').SeasonData} SeasonData */

const dom = {
  infoToggle: document.getElementById('infoToggle'),
  guidelines: document.getElementById('guidelines'),
  seasonFilter: /** @type {HTMLSelectElement} */ (document.getElementById('seasonFilter')),
  spotlightSeasonName: document.getElementById('spotlightSeasonName'),
  revisitList: document.getElementById('revisitList'),
  continuationList: document.getElementById('continuationList'),
  statsGlance: document.getElementById('statsGlance'),
  ratingDistributionChart: document.getElementById('ratingDistributionChart'),
  ratingDistributionBlurb: document.getElementById('ratingDistributionBlurb'),
  ratingsOverTimeSection: document.getElementById('ratingsOverTimeSection'),
  ratingsOverTimeChart: document.getElementById('ratingsOverTimeChart'),
  hallOfFameBest: document.getElementById('hallOfFameBest'),
  hallOfFameWorst: document.getElementById('hallOfFameWorst'),
  secondImpressionsStats: document.getElementById('secondImpressionsStats'),
  secondImpressionsTable: document.getElementById('secondImpressionsTable'),
  topOps: document.getElementById('topOps'),
  topEds: document.getElementById('topEds'),
};

dom.infoToggle?.addEventListener('click', (e) => {
  e.preventDefault();
  dom.guidelines?.classList.toggle('show');
});

/**
 * `no-cache` revalidates rather than refetching, so an unchanged season comes
 * back as a 304 - the seasons are same-origin assets now, so there's no cache
 * of our own to go stale on an edit.
 * @param {{id: string|number, name: string, file: string}} meta
 */
async function getSeasonData(meta) {
  const response = await fetch(meta.file, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status} loading season "${meta.name}"`);
  return response.json();
}

/**
 * Every table on this page replaces its container's whole contents, so the
 * shared builder's return value goes straight in.
 * @param {HTMLElement} container
 * @param {string[]} columns
 * @param {string[][]} rows
 */
function renderDataTable(container, columns, rows) {
  container.replaceChildren(createDataTable(columns, rows));
}

/**
 * @param {HTMLElement} container
 * @param {string[]} titles
 */
function renderShowList(container, titles) {
  const ul = document.createElement('ul');
  ul.className = 'show-list';
  ul.append(...titles.map(title => {
    const li = document.createElement('li');
    li.textContent = title;
    return li;
  }));
  container.replaceChildren(ul);
}

function formatRating(n) {
  return typeof n === 'number' ? n.toFixed(1) : '—';
}

function formatDelta(n) {
  if (typeof n !== 'number') return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}`;
}

function renderGlanceStats(seasons, reviews) {
  const s = computeGlanceStats(seasons, reviews);
  renderStatGrid(dom.statsGlance, [
    { label: 'Total Reviews', value: String(s.totalReviews) },
    { label: 'Seasons Covered', value: String(s.seasonsCovered) },
    { label: 'Average Rating', value: s.avgRating != null ? `${s.avgRating.toFixed(1)} / 5` : '—' },
    { label: 'Full Re-Reviews', value: String(s.fullReReviews) },
    { label: 'OP Callouts', value: String(s.opCallouts) },
    { label: 'ED Callouts', value: String(s.edCallouts) },
    { label: 'AniList-Linked', value: s.anilistCoveragePct != null ? `${s.anilistCoveragePct}%` : '—' },
    { label: s.busiestSeasonName ? `Busiest Season: ${s.busiestSeasonName}` : 'Busiest Season', value: s.busiestSeasonCount != null ? String(s.busiestSeasonCount) : '—' },
  ]);
}

function renderRatingDistribution(reviews) {
  const dist = computeRatingDistribution(reviews);
  renderBarChart(dom.ratingDistributionChart, dist.map(d => ({ label: d.ratingText, value: d.count, display: String(d.count) })));

  if (dist.length) {
    const top = dist.reduce((a, b) => (b.count > a.count ? b : a));
    dom.ratingDistributionBlurb.textContent = `"${top.ratingText}" is the most-used rating, given ${top.count} time${top.count === 1 ? '' : 's'}.`;
  } else {
    dom.ratingDistributionBlurb.textContent = '';
  }
}

function renderRatingsOverTime(reviews) {
  const overTime = computeRatingsOverTime(reviews);
  // A trend needs more than one point on it - skip the section entirely
  // when the current view (e.g. the season filter) only covers one season.
  dom.ratingsOverTimeSection.hidden = overTime.length <= 1;
  if (dom.ratingsOverTimeSection.hidden) return;

  renderBarChart(
    dom.ratingsOverTimeChart,
    overTime.filter(s => s.avgRating != null).map(s => ({ label: s.seasonName, value: s.avgRating, display: formatRating(s.avgRating) }))
  );
}

function renderHallOfFame(reviews) {
  const { best, worst } = computeHallOfFame(reviews, 10);
  const cols = ['Title', 'Season', 'Rating'];
  renderDataTable(dom.hallOfFameBest, cols, best.map(r => [r.titleEN ?? 'Untitled', r.seasonName, formatRating(r.ratingNumber)]));
  renderDataTable(dom.hallOfFameWorst, cols, worst.map(r => [r.titleEN ?? 'Untitled', r.seasonName, formatRating(r.ratingNumber)]));
}

function renderSecondImpressions(reviews) {
  const s = computeSecondImpressions(reviews);
  renderStatGrid(dom.secondImpressionsStats, [
    { label: 'Full Re-Reviews Compared', value: String(s.total) },
    { label: 'Average Shift', value: formatDelta(s.avgDelta) },
    { label: 'Upgraded', value: String(s.upgrades) },
    { label: 'Downgraded', value: String(s.downgrades) },
  ]);
  renderDataTable(
    dom.secondImpressionsTable,
    ['Title', 'Ep 1 Rating', 'Full Series Rating', 'Shift'],
    s.swings.map(r => [r.titleEN ?? 'Untitled', formatRating(r.ratingNumber), formatRating(r.fullReview.ratingNumber), formatDelta(r.delta)])
  );
}

/**
 * Renders the "Season Spotlight" sections for whichever season is currently
 * in view: the current season when the filter is "All Seasons" (or the
 * current season itself), or the picked season when a past one is selected -
 * see the `seasonId` passed in from `applySeasonFilter()`.
 * @param {SeasonData[]} seasons
 * @param {ReturnType<typeof flattenReviews>} reviews
 * @param {string} seasonId
 */
function renderSeasonSpotlight(seasons, reviews, seasonId) {
  if (dom.spotlightSeasonName) {
    dom.spotlightSeasonName.textContent = seasons.find(s => String(s.id) === seasonId)?.name ?? '';
  }

  const revisitCandidates = computeRevisitCandidates(reviews, seasonId);
  if (revisitCandidates.length === 0) {
    const div = document.createElement('div');
    div.className = 'loading';
    div.textContent = 'No 4/5s awaiting a revisit this season.';
    dom.revisitList.replaceChildren(div);
  } else {
    renderShowList(dom.revisitList, revisitCandidates.map(r => r.titleEN ?? 'Untitled'));
  }

  const continuationMatches = computeContinuationWatch(seasons, seasonId);
  if (continuationMatches.length === 0) {
    const div = document.createElement('div');
    div.className = 'loading';
    div.textContent = "No returning favorites spotted in this season's lineup.";
    dom.continuationList.replaceChildren(div);
  } else {
    renderShowList(dom.continuationList, continuationMatches.map(m => m.title));
  }
}

function renderOpEd(reviews) {
  const s = computeOpEdHighlights(reviews);
  const cols = ['Title', 'Season', 'Rating'];
  renderDataTable(dom.topOps, cols, s.topOps.map(r => [r.titleEN ?? 'Untitled', r.seasonName, formatRating(r.ratingNumber)]));
  renderDataTable(dom.topEds, cols, s.topEds.map(r => [r.titleEN ?? 'Untitled', r.seasonName, formatRating(r.ratingNumber)]));
}

/** @type {SeasonData[]} */
let allSeasons = [];
/** @type {ReturnType<typeof flattenReviews>} */
let allReviews = [];
/** The index's current season id, used as the Season Spotlight's default when the filter is "All Seasons". */
let currentSeasonId = '';

/** Reads the `?season=` query param, so a specific season's view is a shareable link. */
function seasonFromUrl() {
  return new URLSearchParams(location.search).get('season');
}

/**
 * Keeps `?season=` in sync with the current filter, via replaceState so
 * changing seasons doesn't spam browser history. Omits the param entirely
 * for "All Seasons" (the default), so the plain URL still means "all".
 * @param {string} value
 */
function updateUrlForSeason(value) {
  const url = new URL(location.href);
  if (value === 'all') url.searchParams.delete('season');
  else url.searchParams.set('season', value);
  history.replaceState(null, '', url);
}

/** @param {SeasonData[]} seasons */
function populateSeasonFilter(seasons) {
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'All Seasons';

  const fragment = document.createDocumentFragment();
  for (const season of seasons) {
    const option = document.createElement('option');
    option.value = String(season.id);
    option.textContent = season.name;
    fragment.appendChild(option);
  }

  dom.seasonFilter.replaceChildren(allOption, fragment);
}

/**
 * Renders every section from a given seasons/reviews slice - the full
 * dataset, or just the one season picked in seasonFilter.
 * @param {SeasonData[]} seasons
 * @param {ReturnType<typeof flattenReviews>} reviews
 */
function renderAll(seasons, reviews) {
  renderGlanceStats(seasons, reviews);
  renderRatingDistribution(reviews);
  renderRatingsOverTime(reviews);
  renderHallOfFame(reviews);
  renderSecondImpressions(reviews);
  renderOpEd(reviews);
}

function applySeasonFilter() {
  const value = dom.seasonFilter.value;
  updateUrlForSeason(value);

  // The Season Spotlight follows the filter too, defaulting to the current
  // season for "All Seasons" rather than showing nothing.
  renderSeasonSpotlight(allSeasons, allReviews, value === 'all' ? currentSeasonId : value);

  if (value === 'all') {
    renderAll(allSeasons, allReviews);
  } else {
    renderAll(allSeasons.filter(s => String(s.id) === value), allReviews.filter(r => r.season === value));
  }
}

async function init() {
  try {
    const response = await fetch(VQAR_INDEX_PATH, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status} loading season index`);
    const seasonIndex = await response.json();
    if (!Array.isArray(seasonIndex?.seasons)) throw new Error('Invalid season index format');

    currentSeasonId = String(seasonIndex.currentSeason);
    const results = await Promise.allSettled(
      seasonIndex.seasons.map(meta => getSeasonData(meta))
    );

    const seasons = [];
    const failed = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') seasons.push(result.value);
      else failed.push(seasonIndex.seasons[i]);
    });

    if (failed.length) {
      console.error('Failed to load seasons:', failed.map(m => m.name).join(', '));
    }
    if (seasons.length === 0) throw new Error('No season data could be loaded');

    allSeasons = seasons;
    allReviews = flattenReviews(seasons);

    populateSeasonFilter(seasons);

    const requestedSeason = seasonFromUrl();
    if (requestedSeason && seasons.some(s => String(s.id) === requestedSeason)) {
      dom.seasonFilter.value = requestedSeason;
    }
    applySeasonFilter();

    dom.seasonFilter.addEventListener('change', applySeasonFilter);
  } catch (error) {
    console.error('Error loading VQAR stats:', error);
    const err = document.createElement('div');
    err.className = 'loading';
    err.style.color = 'red';
    err.textContent = `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`;
    dom.statsGlance.replaceChildren(err);
  }
}

await init();
