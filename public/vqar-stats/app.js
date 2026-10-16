/**
 * Renders "VQAR By The Numbers" - a stats page over the same committed VQAR
 * data /vqar/app.js reads (the season index + every season) and crunched by
 * stats.js. Unlike /vqar, this page always needs every season loaded since
 * every stat here is an aggregate, so there's no per-season lazy fetch.
 */

import { VQAR_INDEX_PATH } from '../vqar/data-paths.js';
import { createDataTable, renderStatGrid, renderBarChart, MISSING } from '../data-table.js';
import { FORMAT_LABELS } from '../vqar/filters.js';
import { STREAMING_SERVICES } from '../streaming.js';
import {
  flattenReviews, computeGlanceStats, computeRatingDistribution, computeRatingsOverTime,
  computeHallOfFame, computeSecondImpressions, computeOpEdHighlights,
  computeCategoryRatings, computeLovesAndHates, computeGenreBySeason, MIN_CATEGORY_SHOWS,
  computeRevisitCandidates, computeContinuationWatch, computeSeasonCoverage,
} from './stats.js';

/** @typedef {import('../vqar/app.js').SeasonData} SeasonData */

const dom = {
  infoToggle: document.getElementById('infoToggle'),
  guidelines: document.getElementById('guidelines'),
  seasonFilter: /** @type {HTMLSelectElement} */ (document.getElementById('seasonFilter')),
  coverageSeasonName: document.getElementById('coverageSeasonName'),
  coverageBar: document.getElementById('coverageBar'),
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
  tasteSwitch: document.getElementById('tasteSwitch'),
  tasteTable: document.getElementById('tasteTable'),
  tasteNote: document.getElementById('tasteNote'),
  lovesHates: document.getElementById('lovesHates'),
  genreBySeasonSection: document.getElementById('genreBySeasonSection'),
  genreBySeasonTable: document.getElementById('genreBySeasonTable'),
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
    { label: 'Seasons Finished', value: String(s.finishedSeasons) },
    { label: 'Liked OPs', value: String(s.likedOps) },
    { label: 'Liked EDs', value: String(s.likedEds) },
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
 * A progress bar of reviewed shows out of reviewed + pending, with both counts
 * labeled underneath.
 * @param {SeasonData[]} seasons
 * @param {string} label
 */
function renderCoverage(seasons, label) {
  dom.coverageSeasonName.textContent = label;
  const c = computeSeasonCoverage(seasons);
  if (c.total === 0) {
    const div = document.createElement('div');
    div.className = 'loading';
    div.textContent = 'No shows logged for review this season yet.';
    dom.coverageBar.replaceChildren(div);
    return;
  }

  const summary = document.createElement('p');
  summary.className = 'coverage-summary';
  summary.textContent = `${c.reviewed} of ${c.total} shows reviewed (${c.pct}%)`;

  const track = document.createElement('div');
  track.className = 'coverage-track';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', 'Shows reviewed');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', String(c.total));
  track.setAttribute('aria-valuenow', String(c.reviewed));
  const fill = document.createElement('div');
  fill.className = 'coverage-fill';
  fill.style.width = `${(c.reviewed / c.total) * 100}%`;
  track.append(fill);

  const detail = document.createElement('p');
  detail.className = 'vs-prose';
  detail.textContent = `${c.reviewed} reviewed · ${c.pending} pending`;

  dom.coverageBar.replaceChildren(summary, track, detail);
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
  const cols = ['Title', 'Season'];
  const row = r => [r.titleEN ?? 'Untitled', r.seasonName];
  renderDataTable(dom.topOps, cols, s.likedOps.map(row));
  renderDataTable(dom.topEds, cols, s.likedEds.map(row));
}

/**
 * The Taste Profile's dimensions: how each is labelled, and how a value of it
 * reads (an AniList format enum or a streaming key isn't what a person
 * would call it). Each `key` is also the /vqar URL parameter for it.
 */
const TASTE_DIMENSIONS = [
  { key: 'genre', label: 'Genre', singular: 'genre', plural: 'genres', display: (v) => v },
  { key: 'studio', label: 'Studio', singular: 'studio', plural: 'studios', display: (v) => v },
  { key: 'tag', label: 'Tag', singular: 'tag', plural: 'tags', display: (v) => v },
  { key: 'format', label: 'Format', singular: 'format', plural: 'formats', display: (v) => FORMAT_LABELS[v] ?? v },
  { key: 'on', label: 'Streaming', singular: 'service', plural: 'services', display: (v) => STREAMING_SERVICES[v]?.name ?? v },
];

/** Which dimension the Taste Profile is showing. */
let tasteDimension = 'genre';
/** The reviews the category sections were last drawn from, so the switch can redraw without a refetch. */
let categoryReviews = [];

/**
 * A link to /vqar filtered to one category, in the season this page is
 * showing - "these are the shows that number is about".
 * @param {string} key - the dimension, which is also its /vqar URL parameter
 * @param {string} value
 */
function vqarHref(key, value) {
  const params = new URLSearchParams({ season: dom.seasonFilter?.value || 'all', [key]: value });
  return `/vqar?${params}`;
}

const percent = (fraction) => `${Math.round(fraction * 100)}%`;

function renderTasteSwitch() {
  if (!dom.tasteSwitch) return;
  dom.tasteSwitch.replaceChildren(...TASTE_DIMENSIONS.map(({ key, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vs-switch-button';
    button.dataset.dimension = key;
    button.textContent = label;
    button.setAttribute('aria-pressed', String(key === tasteDimension));
    return button;
  }));
}

function renderTasteProfile(reviews) {
  const dimension = TASTE_DIMENSIONS.find(d => d.key === tasteDimension) ?? TASTE_DIMENSIONS[0];
  const rows = computeCategoryRatings(reviews, dimension.key);
  renderTasteSwitch();
  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loading';
    empty.textContent = `No ${dimension.plural} with ${MIN_CATEGORY_SHOWS}+ shows here yet.`;
    dom.tasteTable?.replaceChildren(empty);
  } else {
    renderDataTable(dom.tasteTable,
      [dimension.label, 'Shows', 'Avg', 'Rated 4–5', 'Rated 0–1', 'Revisit shift', 'Finished', 'Liked OP/ED'],
      rows.map(r => [
        { text: dimension.display(r.value), href: vqarHref(dimension.key, r.value) },
        String(r.shows),
        formatRating(r.avgRating),
        percent(r.highShare),
        percent(r.lowShare),
        r.revisitShift === null ? MISSING : formatDelta(r.revisitShift),
        String(r.finished),
        String(r.likedOpEd),
      ]));
  }
  if (dom.tasteNote) {
    dom.tasteNote.textContent = rows.hidden === 1
      ? `1 more ${dimension.singular} with fewer than ${MIN_CATEGORY_SHOWS} shows isn't listed.`
      : rows.hidden > 1 ? `${rows.hidden} more ${dimension.plural} with fewer than ${MIN_CATEGORY_SHOWS} shows aren't listed.` : '';
  }
}

function renderLovesAndHates(reviews) {
  if (!dom.lovesHates) return;
  const blocks = TASTE_DIMENSIONS.filter(d => ['genre', 'studio', 'tag'].includes(d.key)).map(dimension => {
    const block = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = dimension.plural[0].toUpperCase() + dimension.plural.slice(1);
    block.appendChild(heading);
    const { loves, hates } = computeLovesAndHates(reviews, dimension.key);
    if (loves.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'vs-note';
      empty.textContent = `Not enough ${dimension.plural} with ${MIN_CATEGORY_SHOWS}+ shows yet.`;
      block.appendChild(empty);
      return block;
    }
    const row = (r) => [{ text: dimension.display(r.value), href: vqarHref(dimension.key, r.value) }, formatRating(r.avgRating), String(r.shows)];
    for (const [label, list] of [['Loves', loves], ['Hates', hates]]) {
      if (list.length === 0) continue;
      const sub = document.createElement('h4');
      sub.className = `vs-loves-hates-label vs-${label.toLowerCase()}`;
      sub.textContent = label;
      block.append(sub, createDataTable([dimension.label, 'Avg', 'Shows'], list.map(row)));
    }
    return block;
  });
  dom.lovesHates.replaceChildren(...blocks);
}

function renderGenreBySeason(reviews) {
  const grid = computeGenreBySeason(reviews);
  // Like Ratings Over Time: a comparison across seasons needs more than one.
  if (dom.genreBySeasonSection) dom.genreBySeasonSection.hidden = grid.seasons.length <= 1 || grid.rows.length === 0;
  if (dom.genreBySeasonSection?.hidden) return;
  renderDataTable(dom.genreBySeasonTable,
    ['Genre', ...grid.seasons.map(s => s.name)],
    grid.rows.map(r => [
      { text: r.value, href: vqarHref('genre', r.value) },
      ...grid.seasons.map(s => r.cells[s.id] ? formatRating(r.cells[s.id].avgRating) : MISSING),
    ]));
}

function renderCategorySections(reviews) {
  categoryReviews = reviews;
  renderTasteProfile(reviews);
  renderLovesAndHates(reviews);
  renderGenreBySeason(reviews);
}

dom.tasteSwitch?.addEventListener('click', (e) => {
  const button = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest('.vs-switch-button'));
  if (!button?.dataset.dimension) return;
  tasteDimension = button.dataset.dimension;
  renderTasteProfile(categoryReviews);
  dom.tasteSwitch?.querySelector(`[data-dimension="${tasteDimension}"]`)?.focus();
});

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
  renderCategorySections(reviews);
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

  const picked = value === 'all' ? allSeasons : allSeasons.filter(s => String(s.id) === value);
  renderCoverage(picked, value === 'all' ? 'All Seasons' : picked[0]?.name ?? '');

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
