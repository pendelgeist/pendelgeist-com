/**
 * Renders the Anime Stat Sheet - a stats page over the same committed VQAR
 * data /vqar/app.js reads (the season index + every season), crunched by
 * stats.js. Every stat is an aggregate, so it loads every season up front
 * rather than lazily like /vqar.
 *
 * Two views share the page. **Career** (All Seasons) compares and profiles:
 * an Over Time table, taste by genre/studio/tag, and peaks and valleys across
 * everything. A **season report** (one season picked) is about that season
 * alone: its coverage when it was reviewed live, its average
 * against your career's, and its own peaks and valleys. Sections carry `data-view` for
 * the view they belong to; ones without it show in both, and any with
 * nothing to say in the current view is hidden rather than left empty.
 *
 * Both views can be narrowed to live or historical reviews (see stats.js),
 * since historical picks skew high. Season and source are mirrored into the
 * URL (`?season=spring-2026&source=live`), as is the Over Time table's
 * grouping (`?by=decade`).
 */

import { VQAR_INDEX_PATH } from '../vqar/data-paths.js';
import { createDataTable, renderStatGrid, renderBarChart, MISSING } from '../data-table.js';
import { FORMAT_LABELS } from '../vqar/filters.js';
import { STREAMING_SERVICES } from '../streaming.js';
import {
  flattenReviews, filterBySource, SOURCES, hasLiveLineup, computeGlanceStats, computeSeasonTable, computeDecadeTable,
  computeRatingDistribution, computePeaksAndValleys, computeRevisits, computeOpEdHighlights,
  computeCategoryRatings, computeLovesAndHates, MIN_CATEGORY_SHOWS,
  computeSeasonCoverage, computeHopeCheck,
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
  overTimeSwitch: document.getElementById('overTimeSwitch'),
  overTimeNote: document.getElementById('overTimeNote'),
  coverageSection: document.getElementById('coverageSection'),
  coverageBar: document.getElementById('coverageBar'),
  ratingDistributionChart: document.getElementById('ratingDistributionChart'),
  ratingDistributionBlurb: document.getElementById('ratingDistributionBlurb'),
  peaksHeading: document.getElementById('peaksHeading'),
  peaksTable: document.getElementById('peaksTable'),
  valleys: document.getElementById('valleys'),
  valleysHeading: document.getElementById('valleysHeading'),
  valleysTable: document.getElementById('valleysTable'),
  revisitsSection: document.getElementById('revisitsSection'),
  revisitStats: document.getElementById('revisitStats'),
  hopeBlock: document.getElementById('hopeBlock'),
  hopeCheckStats: document.getElementById('hopeCheckStats'),
  hopeCheckTable: document.getElementById('hopeCheckTable'),
  swingsBlock: document.getElementById('swingsBlock'),
  swingsTable: document.getElementById('swingsTable'),
  opEdSection: document.getElementById('opEdSection'),
  likedOps: document.getElementById('likedOps'),
  likedEds: document.getElementById('likedEds'),
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
/** How the career view's Over Time table groups: by season file, or by the decade shows aired in. */
let overTimeBy = 'season';
/** The reviews the Over Time table was last drawn from, so its switch can redraw it. */
/** @type {Reviews} */
let overTimeReviews = [];

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
    { label: 'Revisited', value: String(s.fullReReviews) },
    { label: 'Seasons Finished', value: String(s.finishedSeasons) },
    { label: 'Liked OPs', value: String(s.likedOps) },
    { label: 'Liked EDs', value: String(s.likedEds) },
  );
  if (!career) tiles.push({ label: 'AniList-Linked', value: s.anilistCoveragePct != null ? `${s.anilistCoveragePct}%` : '—' });
  renderStatGrid(dom.statsGlance, tiles);
}

// --- Season by Season (career) ---

const OVER_TIME_NOTES = {
  season: 'Every season with a review, newest first. Pick a season for its report, or sort by any column.',
  decade: 'Every show by the decade it aired, wherever it was reviewed, newest first. Sort by any column.',
};

/** @param {Reviews} reviews */
function renderOverTime(reviews) {
  overTimeReviews = reviews;
  for (const button of dom.overTimeSwitch?.querySelectorAll('.vs-switch-button') ?? []) {
    button.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (button).dataset.by === overTimeBy));
  }
  if (dom.overTimeNote) dom.overTimeNote.textContent = OVER_TIME_NOTES[overTimeBy];
  if (overTimeBy === 'decade') renderDecadeTable(reviews);
  else renderSeasonTable(reviews);
}

/**
 * The top-rated titles of a decade, shortened past a few so the column stays
 * readable: "A, B, C +4".
 * @param {{ titles: string[] }} top
 */
function topTitles({ titles }) {
  const shown = titles.slice(0, 3).join(', ');
  return titles.length > 3 ? `${shown} +${titles.length - 3}` : shown;
}

/** @param {Reviews} reviews */
function renderDecadeTable(reviews) {
  const rows = computeDecadeTable(reviews);
  const showSplit = source === 'all';
  const columns = ['Decade', 'Shows'];
  if (showSplit) columns.push('Live', 'Historical');
  columns.push('Avg', 'Rated 4–5', 'Rated 0–1', 'Highest Rated');

  renderDataTable(dom.seasonTable, columns, rows.map(r => {
    const cells = [r.label, String(r.shows)];
    if (showSplit) cells.push(String(r.live), String(r.historical));
    cells.push(
      formatRating(r.avgRating),
      r.highShare === null ? MISSING : percent(r.highShare),
      r.lowShare === null ? MISSING : percent(r.lowShare),
      r.top ? `${topTitles(r.top)} (${formatRating(r.top.ratingNumber)})` : MISSING,
    );
    return cells;
  }));
}

dom.overTimeSwitch?.addEventListener('click', (e) => {
  const button = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest('.vs-switch-button'));
  const by = button?.dataset.by;
  if (!by || by === overTimeBy) return;
  overTimeBy = by;
  updateUrl();
  renderOverTime(overTimeReviews);
  dom.overTimeSwitch?.querySelector(`[data-by="${overTimeBy}"]`)?.focus();
});

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

// --- Peaks & Valleys: the distribution ---

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

// --- Peaks & Valleys ---

/**
 * The distribution's top and bottom tiers, spelled out as shows.
 * @param {Reviews} reviews
 * @param {boolean} withSeason - list each show's season (not in a season report, where it's the same for all)
 */
function renderPeaksAndValleys(reviews, withSeason) {
  const { peaks, valleys } = computePeaksAndValleys(reviews);
  const cols = withSeason ? ['Title', 'Season'] : ['Title'];
  const row = r => withSeason ? [r.titleEN ?? 'Untitled', r.seasonName] : [r.titleEN ?? 'Untitled'];
  /** @param {NonNullable<typeof peaks>} tier */
  const heading = (tier) => `${tier.ratingText} (${tier.shows.length})`;

  if (peaks) {
    dom.peaksHeading.textContent = heading(peaks);
    renderDataTable(dom.peaksTable, cols, peaks.shows.map(row));
  }
  dom.valleys.hidden = !valleys;
  if (valleys) {
    dom.valleysHeading.textContent = heading(valleys);
    renderDataTable(dom.valleysTable, cols, valleys.shows.map(row));
  }
}

// --- Revisits ---

/**
 * Revisits: every show reviewed on episode 1 and again later, then the
 * Here's Hoping 4s among them, then the biggest swings. Each part is hidden
 * when it has nothing to say; the section, when none of them do.
 * @param {Reviews} reviews
 * @returns {boolean} whether there was anything to show
 */
function renderRevisits(reviews) {
  const s = computeRevisits(reviews);
  const anyHopes = renderHopeCheck(reviews);
  dom.hopeBlock.hidden = !anyHopes;
  dom.revisitStats.hidden = s.total === 0;
  dom.swingsBlock.hidden = s.total === 0;
  if (s.total > 0) {
    renderStatGrid(dom.revisitStats, [
      { label: 'Revisited', value: String(s.total) },
      { label: 'Average Shift', value: formatDelta(s.avgDelta) },
      { label: 'Went Up', value: String(s.upgrades) },
      { label: 'Held', value: String(s.unchanged) },
      { label: 'Went Down', value: String(s.downgrades) },
    ]);
    renderDataTable(
      dom.swingsTable,
      ['Title', 'Ep 1', 'Latest', 'Shift'],
      s.swings.map(r => [r.titleEN ?? 'Untitled', formatRating(r.before), formatRating(r.after), formatDelta(r.delta)])
    );
  }
  return s.total > 0 || anyHopes;
}

/**
 * /vqar's "To revisit" view of one season - the Extras chip that lists the
 * same shows as Here's Hoping's "Still waiting".
 * @param {string} seasonId
 */
function queueHref(seasonId) {
  return `/vqar?${new URLSearchParams({ season: seasonId, has: 'queue' })}`;
}

/**
 * The Here's Hoping block: how the episode-1 4s turned out.
 * @param {Reviews} reviews
 * @returns {boolean} whether there were any
 */
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

// --- Coverage (season report, live seasons only) ---

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
  renderDataTable(dom.likedOps, cols, s.likedOps.map(row));
  renderDataTable(dom.likedEds, cols, s.likedEds.map(row));
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
  if (overTimeBy === 'season') url.searchParams.delete('by');
  else url.searchParams.set('by', overTimeBy);
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
  renderPeaksAndValleys(reviews, careerView);
  show(dom.revisitsSection, renderRevisits(reviews));
  show(dom.opEdSection, renderOpEd(reviews, careerView));

  if (careerView) {
    renderOverTime(career);
    categoryReviews = reviews;
    renderTasteProfile(reviews);
    renderLovesAndHates(reviews);
  } else {
    // Coverage is about a season reviewed as it aired.
    const live = season !== null && hasLiveLineup(season) && source !== 'historical';
    show(dom.coverageSection, live);
    if (live) renderCoverage([season]);
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
    overTimeBy = params.get('by') === 'decade' ? 'decade' : 'season';
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
