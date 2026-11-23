/**
 * Renders the Anime Stat Sheet - a stats page over the same committed VQAR
 * data /vqar/app.js reads (the season index + every season), crunched by
 * stats.js. Every stat is an aggregate, so it loads every season up front
 * rather than lazily like /vqar.
 *
 * Two views share the page. **Career** (All Seasons) compares and profiles:
 * a Season by Season table, taste by genre/studio/tag, and the halls across
 * everything. A **season report** (one season picked) is about that season
 * alone: its coverage and spotlight when it was reviewed live, its average
 * against your career's, and its own halls. Sections carry `data-view` for
 * the view they belong to; ones without it show in both, and any with
 * nothing to say in the current view is hidden rather than left empty.
 *
 * Both views can be narrowed to live or historical reviews (see stats.js),
 * since historical picks skew high. Season and source are mirrored into the
 * URL (`?season=spring-2026&source=live`).
 */

import { VQAR_INDEX_PATH } from '../vqar/data-paths.js';
import { createDataTable, renderStatGrid, renderBarChart, MISSING } from '../data-table.js';
import { FORMAT_LABELS } from '../vqar/filters.js';
import { STREAMING_SERVICES } from '../streaming.js';
import {
  flattenReviews, filterBySource, SOURCES, hasLiveLineup, computeGlanceStats, computeSeasonTable,
  computeRatingDistribution, computeHallOfFame, computeSecondImpressions, computeOpEdHighlights,
  computeCategoryRatings, computeLovesAndHates, MIN_CATEGORY_SHOWS,
  computeRevisitCandidates, computeContinuationWatch, computeSeasonCoverage, computeHopeCheck,
} from './stats.js';

/** @typedef {import('../vqar/app.js').SeasonData} SeasonData */
/** @typedef {ReturnType<typeof flattenReviews>} Reviews */

const dom = {
  seasonFilter: /** @type {HTMLSelectElement} */ (document.getElementById('seasonFilter')),
  sourceSwitch: document.getElementById('sourceSwitch'),
  viewTitle: document.getElementById('viewTitle'),
  viewNote: document.getElementById('viewNote'),
  statsGlance: document.getElementById('statsGlance'),
  seasonTable: document.getElementById('seasonTable'),
  coverageSection: document.getElementById('coverageSection'),
  coverageBar: document.getElementById('coverageBar'),
  spotlightSection: document.getElementById('seasonSpotlightSection'),
  revisitList: document.getElementById('revisitList'),
  revisitLink: document.getElementById('revisitLink'),
  continuationList: document.getElementById('continuationList'),
  ratingDistributionChart: document.getElementById('ratingDistributionChart'),
  ratingDistributionBlurb: document.getElementById('ratingDistributionBlurb'),
  hallOfFameHeading: document.getElementById('hallOfFameHeading'),
  hallOfFameBest: document.getElementById('hallOfFameBest'),
  hallOfShame: document.getElementById('hallOfShame'),
  hallOfShameHeading: document.getElementById('hallOfShameHeading'),
  hallOfFameWorst: document.getElementById('hallOfFameWorst'),
  secondImpressionsSection: document.getElementById('secondImpressionsSection'),
  secondImpressionsStats: document.getElementById('secondImpressionsStats'),
  secondImpressionsTable: document.getElementById('secondImpressionsTable'),
  hopeCheckSection: document.getElementById('hopeCheckSection'),
  hopeCheckStats: document.getElementById('hopeCheckStats'),
  hopeCheckTable: document.getElementById('hopeCheckTable'),
  opEdSection: document.getElementById('opEdSection'),
  topOps: document.getElementById('topOps'),
  topEds: document.getElementById('topEds'),
  tasteSwitch: document.getElementById('tasteSwitch'),
  tasteTable: document.getElementById('tasteTable'),
  tasteNote: document.getElementById('tasteNote'),
  lovesHates: document.getElementById('lovesHates'),
};

/** Every season, as loaded. */
/** @type {SeasonData[]} */
let allSeasons = [];
/** Every review, flattened. */
/** @type {Reviews} */
let allReviews = [];
/** Which reviews are in view: all, live, or historical (see stats.js). */
let source = 'all';

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
 * @param {(string|{text: string, href: string})[][]} rows
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

/** @param {HTMLElement} container @param {string} message */
function renderEmpty(container, message) {
  const div = document.createElement('div');
  div.className = 'loading';
  div.textContent = message;
  container.replaceChildren(div);
}

function formatRating(n) {
  return typeof n === 'number' ? n.toFixed(1) : '—';
}

function formatDelta(n) {
  if (typeof n !== 'number') return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}`;
}

const percent = (fraction) => `${Math.round(fraction * 100)}%`;

/** The picked season's id, or 'all' for the career view. */
function selectedSeason() {
  return dom.seasonFilter?.value || 'all';
}

/** "live reviews" / "historical reviews" / "reviews", for messages. */
function sourceNoun() {
  return source === 'all' ? 'reviews' : `${source} reviews`;
}

/**
 * A link to this page for one season, keeping the source in view.
 * @param {string} seasonId
 */
function seasonHref(seasonId) {
  const params = new URLSearchParams({ season: seasonId });
  if (source !== 'all') params.set('source', source);
  return `?${params}`;
}

// --- Numbers at a Glance ---

/**
 * @param {Reviews} reviews
 * @param {Reviews|null} career - the career's reviews (same source) to compare a season against; null in the career view
 */
function renderGlanceStats(reviews, career) {
  const s = computeGlanceStats(reviews);
  const split = source === 'all' && s.live > 0 && s.historical > 0;
  /** @type {{label: string, value: string}[]} */
  const tiles = [{ label: 'Shows Reviewed', value: String(s.shows) }];
  if (split) tiles.push({ label: 'Live', value: String(s.live) }, { label: 'Historical', value: String(s.historical) });
  tiles.push({ label: 'Average Rating', value: s.avgRating != null ? `${s.avgRating.toFixed(1)} / 5` : '—' });

  if (career) {
    // Like against like: a season of only historical picks is measured
    // against your other historical picks (which skew high), a live one
    // against your live reviews, and a mix against everything.
    const kind = s.historical === 0 ? 'live' : s.live === 0 ? 'historical' : 'all';
    const careerAvg = computeGlanceStats(filterBySource(career, kind)).avgRating;
    const versus = kind === 'all' ? 'Career' : kind === 'live' ? 'Live' : 'Historical';
    tiles.push(
      { label: `vs. ${versus} Average`, value: s.avgRating != null && careerAvg != null ? formatDelta(s.avgRating - careerAvg) : '—' },
      { label: 'Rated 4–5', value: s.highShare != null ? percent(s.highShare) : '—' },
    );
  } else {
    if (split) {
      tiles.push(
        { label: 'Live Average', value: formatRating(s.avgLive) },
        { label: 'Historical Average', value: formatRating(s.avgHistorical) },
      );
    }
    tiles.push({ label: 'Seasons', value: String(s.seasons) });
  }

  tiles.push(
    { label: 'Full Re-Reviews', value: String(s.fullReReviews) },
    { label: 'Seasons Finished', value: String(s.finishedSeasons) },
    { label: 'Liked OPs', value: String(s.likedOps) },
    { label: 'Liked EDs', value: String(s.likedEds) },
  );
  if (!career) tiles.push({ label: 'AniList-Linked', value: s.anilistCoveragePct != null ? `${s.anilistCoveragePct}%` : '—' });
  renderStatGrid(dom.statsGlance, tiles);
}

// --- Season by Season (career) ---

/** @param {Reviews} reviews */
function renderSeasonTable(reviews) {
  const rows = computeSeasonTable(allSeasons, reviews);
  const showSplit = source === 'all';
  const showCoverage = source !== 'historical';
  const columns = ['Season', 'Shows'];
  if (showSplit) columns.push('Live', 'Historical');
  columns.push('Avg', 'Rated 4–5', 'Rated 0–1');
  if (showCoverage) columns.push('Coverage');

  renderDataTable(dom.seasonTable, columns, rows.map(r => {
    const cells = [{ text: r.name, href: seasonHref(r.id) }, String(r.shows)];
    if (showSplit) cells.push(String(r.live), String(r.historical));
    cells.push(
      formatRating(r.avgRating),
      r.highShare === null ? MISSING : percent(r.highShare),
      r.lowShare === null ? MISSING : percent(r.lowShare),
    );
    if (showCoverage) cells.push(r.coveragePct === null ? MISSING : `${r.coveragePct}%`);
    return cells;
  }));
}

// Picking a season from the table opens its report in place, rather than
// reloading the page; a modified click (new tab) still follows the link.
dom.seasonTable?.addEventListener('click', (e) => {
  const link = /** @type {HTMLAnchorElement|null} */ (/** @type {Element} */ (e.target).closest('a'));
  if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const seasonId = new URL(link.href).searchParams.get('season');
  if (!seasonId || !dom.seasonFilter) return;
  e.preventDefault();
  dom.seasonFilter.value = seasonId;
  applyFilters();
  dom.viewTitle?.scrollIntoView?.({ block: 'start' });
});

// --- Rating Distribution ---

/** @param {Reviews} reviews */
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

// --- Halls ---

/**
 * @param {Reviews} reviews
 * @param {boolean} withSeason - list each show's season (not in a season report, where it's the same for all)
 */
function renderHallOfFame(reviews, withSeason) {
  const { fame, shame } = computeHallOfFame(reviews);
  const cols = withSeason ? ['Title', 'Season'] : ['Title'];
  const row = r => withSeason ? [r.titleEN ?? 'Untitled', r.seasonName] : [r.titleEN ?? 'Untitled'];
  /** @param {NonNullable<typeof fame>} tier */
  const heading = (tier) => `${tier.ratingText} (${tier.shows.length})`;

  if (fame) {
    dom.hallOfFameHeading.textContent = heading(fame);
    renderDataTable(dom.hallOfFameBest, cols, fame.shows.map(row));
  }
  dom.hallOfShame.hidden = !shame;
  if (shame) {
    dom.hallOfShameHeading.textContent = heading(shame);
    renderDataTable(dom.hallOfFameWorst, cols, shame.shows.map(row));
  }
}

// --- Second Impressions & Hope Check ---

/** @param {Reviews} reviews @returns {boolean} whether there was anything to show */
function renderSecondImpressions(reviews) {
  const s = computeSecondImpressions(reviews);
  if (s.total === 0) return false;
  renderStatGrid(dom.secondImpressionsStats, [
    { label: 'Full Re-Reviews Compared', value: String(s.total) },
    { label: 'Average Shift', value: formatDelta(s.avgDelta) },
    { label: 'Upgraded', value: String(s.upgrades) },
    { label: 'Downgraded', value: String(s.downgrades) },
  ]);
  renderDataTable(
    dom.secondImpressionsTable,
    ['Title', 'Ep 1 Rating', 'Full Series Rating', 'Shift'],
    s.swings.map(r => [r.titleEN ?? 'Untitled', formatRating(r.before), formatRating(r.after), formatDelta(r.delta)])
  );
  return true;
}

/**
 * /vqar's "To revisit" view of one season - the Extras chip that lists the
 * same shows as Revisit Candidates and the Hope Check's "Still waiting".
 * @param {string} seasonId
 */
function queueHref(seasonId) {
  return `/vqar?${new URLSearchParams({ season: seasonId, has: 'queue' })}`;
}

/** @param {Reviews} reviews @returns {boolean} whether there was anything to show */
function renderHopeCheck(reviews) {
  const h = computeHopeCheck(reviews);
  if (h.hoping === 0) return false;
  renderStatGrid(dom.hopeCheckStats, [
    { label: "Rated 4 on Ep 1", value: String(h.hoping) },
    { label: 'Revisited', value: String(h.revisited) },
    { label: 'Rose to 5', value: String(h.rose) },
    { label: 'Held at 4', value: String(h.held) },
    { label: 'Fell', value: String(h.fell) },
    { label: 'Hope Held Up', value: h.heldShare === null ? '—' : percent(h.heldShare) },
    { label: 'Still Waiting', value: String(h.waiting) },
  ]);
  // Per season only says more than the tiles when there's more than one.
  if (h.bySeason.length <= 1) {
    dom.hopeCheckTable?.replaceChildren();
    return true;
  }
  renderDataTable(dom.hopeCheckTable,
    ['Season', 'Rated 4', 'Revisited', 'Rose', 'Held', 'Fell', 'Held up', 'Still waiting'],
    h.bySeason.map(s => [
      s.name,
      String(s.hoping),
      String(s.revisited),
      String(s.rose),
      String(s.held),
      String(s.fell),
      s.heldShare === null ? MISSING : percent(s.heldShare),
      s.waiting > 0 ? { text: String(s.waiting), href: queueHref(s.id) } : '0',
    ]));
  return true;
}

// --- Coverage & Spotlight (season report, live seasons only) ---

/**
 * A progress bar of reviewed shows out of reviewed + to review, with both counts
 * labeled underneath.
 * @param {SeasonData[]} seasons
 */
function renderCoverage(seasons) {
  const c = computeSeasonCoverage(seasons);
  if (c.total === 0) {
    const div = document.createElement('div');
    div.className = 'loading';
    div.textContent = 'Nothing on this season\'s lineup yet.';
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
  detail.textContent = `${c.reviewed} reviewed · ${c.toReview} to be reviewed`;

  dom.coverageBar.replaceChildren(summary, track, detail);
}

/**
 * The Season Spotlight for one season: its 4/5s still waiting on a revisit,
 * and the shows in its lineup that continue something you liked earlier.
 * @param {string} seasonId
 */
function renderSeasonSpotlight(seasonId) {
  const revisitCandidates = computeRevisitCandidates(allReviews, seasonId);
  if (revisitCandidates.length === 0) {
    renderEmpty(dom.revisitList, 'No 4/5s awaiting a revisit this season.');
  } else {
    renderShowList(dom.revisitList, revisitCandidates.map(r => r.titleEN ?? 'Untitled'));
  }
  if (dom.revisitLink) {
    dom.revisitLink.hidden = revisitCandidates.length === 0;
    dom.revisitLink.href = queueHref(seasonId);
  }

  const continuationMatches = computeContinuationWatch(allSeasons, seasonId);
  if (continuationMatches.length === 0) {
    renderEmpty(dom.continuationList, "No returning favorites spotted in this season's lineup.");
  } else {
    renderShowList(dom.continuationList, continuationMatches.map(m => m.title));
  }
}

// --- OP/ED ---

/**
 * @param {Reviews} reviews
 * @param {boolean} withSeason
 * @returns {boolean} whether there was anything to show
 */
function renderOpEd(reviews, withSeason) {
  const s = computeOpEdHighlights(reviews);
  if (s.opCount === 0 && s.edCount === 0) return false;
  const cols = withSeason ? ['Title', 'Season', 'Which'] : ['Title', 'Which'];
  const row = r => withSeason ? [r.titleEN ?? 'Untitled', r.seasonName, r.which] : [r.titleEN ?? 'Untitled', r.which];
  renderDataTable(dom.topOps, cols, s.likedOps.map(row));
  renderDataTable(dom.topEds, cols, s.likedEds.map(row));
  return true;
}

// --- Taste (career) ---

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
  const params = new URLSearchParams({ season: selectedSeason(), [key]: value });
  return `/vqar?${params}`;
}

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

dom.tasteSwitch?.addEventListener('click', (e) => {
  const button = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest('.vs-switch-button'));
  if (!button?.dataset.dimension) return;
  tasteDimension = button.dataset.dimension;
  renderTasteProfile(categoryReviews);
  dom.tasteSwitch?.querySelector(`[data-dimension="${tasteDimension}"]`)?.focus();
});

// --- Filters, URL and views ---

/**
 * The Season picker: every season with a review, each with how many it has
 * under the current source - like /vqar's own picker. A season with none
 * under it stays listed (picking it says so) so switching source never
 * drops the selection.
 */
function populateSeasonFilter() {
  const picked = selectedSeason();
  const inSource = filterBySource(allReviews, source);
  const counts = new Map();
  for (const r of inSource) counts.set(r.season, (counts.get(r.season) ?? 0) + 1);

  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = `All Seasons (${inSource.length})`;

  const options = allSeasons
    .filter(season => (season.shows ?? []).length > 0)
    .map(season => {
      const option = document.createElement('option');
      option.value = String(season.id);
      option.textContent = `${season.name} (${counts.get(String(season.id)) ?? 0})`;
      return option;
    });

  dom.seasonFilter.replaceChildren(allOption, ...options);
  dom.seasonFilter.value = options.some(o => o.value === picked) ? picked : 'all';
}

function renderSourceSwitch() {
  for (const button of dom.sourceSwitch?.querySelectorAll('.vs-switch-button') ?? []) {
    button.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (button).dataset.source === source));
  }
}

/**
 * Keeps `?season=` and `?source=` in sync with the filters, via replaceState
 * so changing them doesn't spam browser history. Defaults (All Seasons, all
 * reviews) are left out, so the plain URL still means the whole career.
 */
function updateUrl() {
  const url = new URL(location.href);
  const season = selectedSeason();
  if (season === 'all') url.searchParams.delete('season');
  else url.searchParams.set('season', season);
  if (source === 'all') url.searchParams.delete('source');
  else url.searchParams.set('source', source);
  history.replaceState(null, '', url);
}

/**
 * @param {HTMLElement|null} section
 * @param {boolean} visible
 */
function show(section, visible) {
  if (section) section.hidden = !visible;
}

/** Re-renders every section for the season and source now picked. */
function applyFilters() {
  updateUrl();
  renderSourceSwitch();

  const seasonId = selectedSeason();
  const careerView = seasonId === 'all';
  const season = careerView ? null : allSeasons.find(s => String(s.id) === seasonId) ?? null;
  const career = filterBySource(allReviews, source);
  const reviews = careerView ? career : career.filter(r => r.season === seasonId);

  // Each section belongs to the career view, a season's report, or both.
  for (const section of document.querySelectorAll('section[data-view]')) {
    /** @type {HTMLElement} */ (section).hidden = /** @type {HTMLElement} */ (section).dataset.view !== (careerView ? 'career' : 'season');
  }

  if (dom.viewTitle) dom.viewTitle.textContent = careerView ? 'Career' : `${season?.name ?? seasonId} Season Report`;
  if (dom.viewNote) {
    dom.viewNote.textContent = careerView
      ? `Every season, compared and pooled. ${source === 'all' ? 'All reviews' : `Only ${source} reviews`}.`
      : `This season on its own, measured against the rest of your reviews.${source === 'all' ? '' : ` Only ${source} reviews.`}`;
  }

  // Nothing in view at all (a season with no reviews of this source): say so once, and skip the rest.
  const anything = reviews.length > 0;
  for (const section of document.querySelectorAll('section.section')) {
    if (section.id !== 'glanceSection' && !anything) /** @type {HTMLElement} */ (section).hidden = true;
  }
  if (!anything) {
    renderEmpty(dom.statsGlance, `No ${sourceNoun()} ${careerView ? 'yet' : `in ${season?.name ?? seasonId}`}.`);
    return;
  }

  renderGlanceStats(reviews, careerView ? null : career);
  renderRatingDistribution(reviews);
  renderHallOfFame(reviews, careerView);
  show(dom.secondImpressionsSection, renderSecondImpressions(reviews));
  show(dom.hopeCheckSection, renderHopeCheck(reviews));
  show(dom.opEdSection, renderOpEd(reviews, careerView));

  if (careerView) {
    renderSeasonTable(career);
    categoryReviews = reviews;
    renderTasteProfile(reviews);
    renderLovesAndHates(reviews);
  } else {
    // Coverage and the spotlight are about a season reviewed as it aired.
    const live = season !== null && hasLiveLineup(season) && source !== 'historical';
    show(dom.coverageSection, live);
    show(dom.spotlightSection, live);
    if (live) {
      renderCoverage([season]);
      renderSeasonSpotlight(seasonId);
    }
  }
}

dom.sourceSwitch?.addEventListener('click', (e) => {
  const button = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest('.vs-switch-button'));
  const picked = button?.dataset.source;
  if (!picked || !SOURCES.includes(/** @type {any} */ (picked)) || picked === source) return;
  source = picked;
  populateSeasonFilter();
  applyFilters();
});

async function init() {
  try {
    const response = await fetch(VQAR_INDEX_PATH, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status} loading season index`);
    const seasonIndex = await response.json();
    if (!Array.isArray(seasonIndex?.seasons)) throw new Error('Invalid season index format');

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

    const params = new URLSearchParams(location.search);
    const askedSource = params.get('source');
    source = SOURCES.includes(/** @type {any} */ (askedSource)) ? /** @type {string} */ (askedSource) : 'all';
    populateSeasonFilter();
    const askedSeason = params.get('season');
    if (askedSeason && [...dom.seasonFilter.options].some(o => o.value === askedSeason)) {
      dom.seasonFilter.value = askedSeason;
    }
    applyFilters();

    dom.seasonFilter.addEventListener('change', applyFilters);
  } catch (error) {
    console.error('Error loading the Anime Stat Sheet:', error);
    const err = document.createElement('div');
    err.className = 'loading';
    err.style.color = 'red';
    err.textContent = `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`;
    dom.statsGlance.replaceChildren(err);
  }
}

await init();
