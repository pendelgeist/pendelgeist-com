/**
 * Renders "VQAR By The Numbers" - a stats page over the same VQAR gist data
 * /vqar/app.js reads, fetched live (manifest + every season) and crunched by
 * stats.js. Unlike /vqar, this page always needs every season loaded since
 * every stat here is an aggregate, so there's no per-season lazy fetch.
 */

import { MANIFEST_URL } from '../manifest-url.js';
import {
  flattenReviews, computeGlanceStats, computeRatingDistribution, computeRatingsOverTime,
  computeHallOfFame, computeSecondImpressions, computeOpEdHighlights, computeWordChoice,
} from './stats.js';

/** @typedef {import('../vqar/app.js').SeasonData} SeasonData */

// Shares its cache key prefix with /vqar/app.js on purpose - a season fetched
// from either page warms the cache for the other.
const CACHE_PREFIX = 'vqar:v1:season:';

const dom = {
  infoToggle: document.getElementById('infoToggle'),
  guidelines: document.getElementById('guidelines'),
  seasonFilter: /** @type {HTMLSelectElement} */ (document.getElementById('seasonFilter')),
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
  wordChoiceList: document.getElementById('wordChoiceList'),
  dataSearch: /** @type {HTMLInputElement} */ (document.getElementById('dataSearch')),
  dataTableWrap: document.getElementById('dataTableWrap'),
};

dom.infoToggle?.addEventListener('click', (e) => {
  e.preventDefault();
  dom.guidelines?.classList.toggle('show');
});

/** @param {string} key */
function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 */
function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort only (private browsing / quota); a cache miss just means we re-fetch.
  }
}

/**
 * @param {{id: string|number, name: string, file: string}} meta
 * @param {boolean} isCurrent
 */
async function getSeasonData(meta, isCurrent) {
  const cacheKey = CACHE_PREFIX + String(meta.id);
  if (!isCurrent) {
    const cached = readCache(cacheKey);
    if (cached) return cached;
  }

  const response = await fetch(`${meta.file}?t=${Date.now()}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status} loading season "${meta.name}"`);
  const data = await response.json();

  if (!isCurrent) writeCache(cacheKey, data);
  return data;
}

/** @param {{label: string, value: string}[]} stats */
function renderStatGrid(container, stats) {
  container.replaceChildren(...stats.map(({ label, value }) => {
    const tile = document.createElement('div');
    tile.className = 'stat-tile';
    const val = document.createElement('div');
    val.className = 'stat-value';
    val.textContent = value;
    const lbl = document.createElement('div');
    lbl.className = 'stat-label';
    lbl.textContent = label;
    tile.append(val, lbl);
    return tile;
  }));
}

/** Parses "84,000" / "13.3%" / "991,164" into a comparable number, or NaN. */
function parseNumeric(cell) {
  const cleaned = String(cell).replace(/,/g, '').replace(/%$/, '');
  return Number(cleaned);
}

/**
 * @param {HTMLElement} container
 * @param {string[]} columns
 * @param {string[][]} rows
 */
function renderDataTable(container, columns, rows) {
  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  let sortState = { col: -1, dir: 1 };

  columns.forEach((col, i) => {
    const th = document.createElement('th');
    th.textContent = col;
    th.tabIndex = 0;
    th.addEventListener('click', () => {
      sortState = { col: i, dir: sortState.col === i ? -sortState.dir : 1 };
      applySort();
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  function renderRows(data) {
    tbody.replaceChildren(...data.map(row => {
      const tr = document.createElement('tr');
      tr.append(...row.map(cell => {
        const td = document.createElement('td');
        td.textContent = cell;
        return td;
      }));
      return tr;
    }));
  }

  function applySort() {
    const sorted = [...rows];
    if (sortState.col >= 0) {
      const { col, dir } = sortState;
      const allNumeric = rows.every(r => !Number.isNaN(parseNumeric(r[col])));
      sorted.sort((a, b) => {
        if (allNumeric) return (parseNumeric(a[col]) - parseNumeric(b[col])) * dir;
        return a[col].localeCompare(b[col]) * dir;
      });
    }
    renderRows(sorted);
    [...headRow.children].forEach((th, i) => {
      th.classList.toggle('sorted-asc', sortState.col === i && sortState.dir === 1);
      th.classList.toggle('sorted-desc', sortState.col === i && sortState.dir === -1);
    });
  }

  renderRows(rows);
  const wrap = document.createElement('div');
  wrap.className = 'table-scroll';
  wrap.appendChild(table);
  container.replaceChildren(wrap);
}

/**
 * A single-series magnitude bar chart, direct-labeled.
 * @param {HTMLElement} container
 * @param {{label: string, value: number, display: string}[]} items
 */
function renderBarChart(container, items) {
  if (!items.length) {
    container.replaceChildren();
    return;
  }
  const max = Math.max(...items.map(i => i.value), 1);

  const chart = document.createElement('div');
  chart.className = 'bar-chart';
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', 'Bar chart; see the values labeled on each bar.');

  for (const item of items) {
    const col = document.createElement('div');
    col.className = 'bar-col';
    col.title = `${item.label}: ${item.display}`;

    const value = document.createElement('div');
    value.className = 'bar-value';
    value.textContent = item.display;

    const bar = document.createElement('div');
    bar.className = 'bar-fill';
    bar.style.height = `${Math.max((item.value / max) * 100, 2)}%`;

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = item.label;

    col.append(value, bar, label);
    chart.appendChild(col);
  }

  container.replaceChildren(chart);
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
  const { best, worst } = computeHallOfFame(reviews, 5);
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

function renderOpEd(reviews) {
  const s = computeOpEdHighlights(reviews);
  const cols = ['Title', 'Season', 'Rating'];
  renderDataTable(dom.topOps, cols, s.topOps.map(r => [r.titleEN ?? 'Untitled', r.seasonName, formatRating(r.ratingNumber)]));
  renderDataTable(dom.topEds, cols, s.topEds.map(r => [r.titleEN ?? 'Untitled', r.seasonName, formatRating(r.ratingNumber)]));
}

function renderWordChoice(reviews) {
  const words = computeWordChoice(reviews, 25);
  dom.wordChoiceList.replaceChildren(...words.map(({ word, count }) => {
    const chip = document.createElement('span');
    chip.className = 'vs-word-chip';
    chip.textContent = `${word} (${count})`;
    return chip;
  }));
}

/** @type {SeasonData[]} */
let allSeasons = [];
/** @type {ReturnType<typeof flattenReviews>} */
let allReviews = [];
/** The review set currently in view - all seasons, or just the one picked in seasonFilter. */
let currentReviews = [];

function renderBrowseTable() {
  const term = dom.dataSearch.value.trim().toLowerCase();
  const filtered = term
    ? currentReviews.filter(r => (r.titleEN ?? '').toLowerCase().includes(term) || (r.review ?? '').toLowerCase().includes(term))
    : currentReviews;

  const sorted = [...filtered].sort((a, b) => b._timestamp - a._timestamp);
  renderDataTable(
    dom.dataTableWrap,
    ['Title', 'Season', 'Rating', 'Date Reviewed'],
    sorted.map(r => [r.titleEN ?? 'Untitled', r.seasonName, r.ratingText ?? formatRating(r.ratingNumber), r.dateReviewed ?? '—'])
  );
}

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
  currentReviews = reviews;

  renderGlanceStats(seasons, reviews);
  renderRatingDistribution(reviews);
  renderRatingsOverTime(reviews);
  renderHallOfFame(reviews);
  renderSecondImpressions(reviews);
  renderOpEd(reviews);
  renderWordChoice(reviews);
  renderBrowseTable();
}

function applySeasonFilter() {
  const value = dom.seasonFilter.value;
  updateUrlForSeason(value);
  if (value === 'all') {
    renderAll(allSeasons, allReviews);
  } else {
    renderAll(allSeasons.filter(s => String(s.id) === value), allReviews.filter(r => r.season === value));
  }
}

async function init() {
  try {
    const response = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status} loading manifest`);
    const manifest = await response.json();
    if (!Array.isArray(manifest?.seasons)) throw new Error('Invalid manifest format');

    const currentSeasonId = String(manifest.currentSeason);
    const results = await Promise.allSettled(
      manifest.seasons.map(meta => getSeasonData(meta, String(meta.id) === currentSeasonId))
    );

    const seasons = [];
    const failed = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') seasons.push(result.value);
      else failed.push(manifest.seasons[i]);
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
    dom.dataSearch.addEventListener('input', renderBrowseTable);
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
