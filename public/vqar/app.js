import { VQAR_INDEX_PATH } from './data-paths.js';
import { effectiveRatingNumber } from './rating.js';
import { createStreamingRow, STREAMING_SERVICES } from '../streaming.js';
import { normalizeEntry } from './list-entries.js';
import { createExternalLinks } from '../external-links.js';
import {
  RATING_VALUES, HAS_OPTIONS, emptyChipFilters, ratingChipLabel, reviewValues, matchesChipFilters,
  chipCounts, activeChipCount, chipFiltersFromParams, writeChipFiltersToParams,
} from './filters.js';

/**
 * A full-series re-review attached to a Review, once a "Finish Ep"-rated show
 * is actually finished.
 * @typedef {Object} SubReview
 * @property {number} [ratingNumber]
 * @property {string} [ratingText]
 * @property {string} [review]
 * @property {string} [dateReviewed] - ISO 8601 date or timestamp
 */

/**
 * @typedef {Object} Review
 * @property {string} titleEN
 * @property {string} titleJP
 * @property {number} ratingNumber
 * @property {string} ratingText
 * @property {string} review
 * @property {string} dateReviewed
 * @property {SubReview} [fullReview] - optional full-series re-review
 * @property {true} [op] - optional marking: an opening worth remembering
 * @property {true} [ed] - optional marking: an ending worth remembering
 * @property {string} season
 * @property {string} seasonName
 * @property {number} _timestamp
 * @property {number} _seasonRank - position of its season in the index (0 = newest)
 * @property {number} _index - position within its season file
 * @property {number} [anilistId] - optional AniList media id, links out to the show's AniList page
 * @property {number} [annId] - optional Anime News Network encyclopedia id, links out to the show's ANN page
 * @property {string} [wikipediaUrl] - optional English Wikipedia article URL
 * @property {string} [wikipediaJaUrl] - optional Japanese Wikipedia article URL, usually
 *   far more detailed on staff and broadcast history than the English one
 * @property {string[]} [streaming] - optional list of streaming service keys (see STREAMING_SERVICES) the show is available on
 * @property {string} [crunchyrollUrl] - optional direct link to the show's Crunchyroll page; makes the "CR" streaming badge clickable
 * @property {string} [hidiveUrl] - optional direct link to the show's HIDIVE page; makes the "HD" streaming badge clickable
 * @property {string} [netflixUrl] - optional direct link to the show's Netflix page; makes the "NF" streaming badge clickable
 * @property {string} [huluUrl] - optional direct link to the show's Hulu page; makes the "HU" streaming badge clickable
 * @property {string} [primeUrl] - optional direct link to the show's Prime Video page; makes the "PV" streaming badge clickable
 * @property {string} [youtubeUrl] - optional direct link to the show's YouTube channel or playlist; makes the "YT" streaming badge clickable
 * @property {string} [watchProgress] - optional, free-text note on how far a revisit actually got (e.g. "Ep 3")
 */

/**
 * @typedef {Object} SeasonData
 * @property {string|number} id
 * @property {string} name
 * @property {Review[]} reviewed
 * @property {import('./list-entries.js').ListEntry[]} pending
 * @property {import('./list-entries.js').ListEntry[]} skipped
 */

/**
 * @typedef {Object} SeasonMeta
 * @property {string|number} id
 * @property {string} name
 * @property {string} file - absolute path to this season's own data file
 */

/**
 * @typedef {Object} SeasonIndex
 * @property {string|number} currentSeason
 * @property {SeasonMeta[]} seasons
 */

/** @type {Record<string, (a: Review, b: Review) => number>} */
const SORTERS = {
  // dateReviewed is a full timestamp, so ties are rare. Break any by position:
  // seasons are listed newest-first, and within a season reviews are appended
  // as they're written, so a later entry is the more recent one.
  recent: (a, b) =>
    b._timestamp - a._timestamp || a._seasonRank - b._seasonRank || b._index - a._index,
  'rating-high': (a, b) => (effectiveRatingNumber(b) ?? 0) - (effectiveRatingNumber(a) ?? 0),
  'rating-low': (a, b) => (effectiveRatingNumber(a) ?? 0) - (effectiveRatingNumber(b) ?? 0),
  title: (a, b) => (a.titleEN ?? '').localeCompare(b.titleEN ?? ''),
};

/**
 * `dateReviewed` is a timestamp for ordering; readers just see the date, as
 * written (so a `-07:00` offset shows the reviewer's own day, not UTC's).
 * @param {string} value
 */
const displayDate = (value) => value.slice(0, 10);

const dom = {
  infoToggle: document.getElementById('infoToggle'),
  guidelines: document.getElementById('guidelines'),
  currentSeasonName: document.getElementById('currentSeasonName'),
  seasonFilter: /** @type {HTMLSelectElement|null} */ (document.getElementById('seasonFilter')),
  searchInput: /** @type {HTMLInputElement|null} */ (document.getElementById('searchInput')),
  sortBy: /** @type {HTMLSelectElement|null} */ (document.getElementById('sortBy')),
  filtersToggle: document.getElementById('filtersToggle'),
  filterChips: document.getElementById('filterChips'),
  ratingChips: document.getElementById('ratingChips'),
  onChips: document.getElementById('onChips'),
  hasChips: document.getElementById('hasChips'),
  resultCount: document.getElementById('resultCount'),
  clearFilters: document.getElementById('clearFilters'),
  reviewedShows: document.getElementById('reviewedShows'),
  pendingShows: document.getElementById('pendingShows'),
  skippedShows: document.getElementById('skippedShows'),
  pendingCount: document.getElementById('pendingCount'),
  skippedCount: document.getElementById('skippedCount'),
  backToTop: document.getElementById('backToTop'),
};

/** @type {SeasonIndex|null} */
let seasonIndex = null;
/** @type {Map<string, SeasonData>} */
const seasonDataById = new Map();
/** @type {string} */
let currentSeasonId = '';
/** Guards against a slower, stale fetch clobbering a newer selection. */
let loadToken = 0;
/** @type {SeasonMeta[]} seasons that failed to load for the current filter, if any */
let loadErrors = [];
/** The Rating / Streaming / Extras chip selections; see filters.js. */
let chipFilters = emptyChipFilters();

dom.infoToggle?.addEventListener('click', (e) => {
  e.preventDefault();
  dom.guidelines?.classList.toggle('show');
});

function showError(message) {
  if (dom.reviewedShows) {
    const div = document.createElement('div');
    div.className = 'loading';
    div.style.color = 'red';
    div.textContent = `ERROR: ${message}`;
    dom.reviewedShows.replaceChildren(div);
  }
  for (const container of [dom.pendingShows, dom.skippedShows]) {
    if (!container) continue;
    const li = document.createElement('li');
    li.textContent = 'Error loading data';
    container.replaceChildren(li);
  }
}

function showLoading(message) {
  if (dom.reviewedShows) {
    const div = document.createElement('div');
    div.className = 'loading';
    div.textContent = message;
    dom.reviewedShows.replaceChildren(div);
  }
}

/**
 * Loads a season's data. `no-cache` revalidates rather than refetching, so a
 * season that hasn't changed comes back as a 304 - which is why there's no
 * cache of our own here any more.
 * @param {SeasonMeta} meta
 * @returns {Promise<SeasonData>}
 */
async function getSeasonData(meta) {
  const response = await fetch(meta.file, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} loading season "${meta.name}"`);
  }
  return /** @type {SeasonData} */ (await response.json());
}

/**
 * Ensures every season in `metas` is present in `seasonDataById`, fetching
 * (cache-first) whichever ones are missing, in parallel.
 * @param {SeasonMeta[]} metas
 * @returns {Promise<SeasonMeta[]>} the metas that failed to load, if any
 */
async function ensureSeasonsLoaded(metas) {
  const missing = metas.filter(m => !seasonDataById.has(String(m.id)));
  if (missing.length === 0) return [];

  const results = await Promise.allSettled(missing.map(m => getSeasonData(m)));
  const failed = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      seasonDataById.set(String(missing[i].id), result.value);
    } else {
      console.error(`Error loading season "${missing[i].name}":`, result.reason);
      failed.push(missing[i]);
    }
  });
  return failed;
}

function buildReviewsForLoadedSeasons(seasonIds) {
  return seasonIds.flatMap(id => {
    const season = seasonDataById.get(id);
    if (!season) return [];
    const seasonRank = seasonIndex.seasons.findIndex(m => String(m.id) === id);
    return (season.reviewed ?? []).map((r, index) => ({
      ...r,
      season: id,
      seasonName: season.name,
      _timestamp: Date.parse(r.dateReviewed) || 0,
      _seasonRank: seasonRank,
      _index: index,
    }));
  });
}

/** Loads whatever the current season filter needs, then renders. */
async function loadForCurrentFilter() {
  if (!seasonIndex || !dom.seasonFilter) return;

  const token = ++loadToken;
  const filterValue = dom.seasonFilter.value;
  const metasNeeded = filterValue === 'all'
    ? seasonIndex.seasons
    : seasonIndex.seasons.filter(s => String(s.id) === filterValue);

  showLoading('LOADING SEASON...');
  dom.seasonFilter.disabled = true;
  const failed = await ensureSeasonsLoaded(metasNeeded);
  if (token !== loadToken) return; // a newer selection superseded this load

  dom.seasonFilter.disabled = false;
  loadErrors = failed;
  renderReviews();
  renderList(dom.pendingShows, 'pending');
  renderList(dom.skippedShows, 'skipped');
}

async function loadData() {
  try {
    const response = await fetch(VQAR_INDEX_PATH, { cache: 'no-cache' });
    if (!response.ok) {
      showError(`HTTP ${response.status}`);
      return;
    }

    seasonIndex = /** @type {SeasonIndex} */ (await response.json());
    if (!Array.isArray(seasonIndex?.seasons)) {
      showError('Invalid season index format');
      return;
    }

    currentSeasonId = String(seasonIndex.currentSeason);
    const currentMeta = seasonIndex.seasons.find(s => String(s.id) === currentSeasonId);
    if (dom.currentSeasonName) {
      dom.currentSeasonName.textContent = currentMeta?.name ?? '';
    }
    if (dom.seasonFilter) {
      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = 'All Seasons';

      const fragment = document.createDocumentFragment();
      for (const season of seasonIndex.seasons) {
        const option = document.createElement('option');
        option.value = String(season.id);
        option.textContent = season.name;
        fragment.appendChild(option);
      }

      dom.seasonFilter.replaceChildren(allOption, fragment);
    }
    applyStateFromUrl();

    await loadForCurrentFilter();
  } catch (error) {
    console.error('Error loading data:', error);
    showError(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Renders a full-series re-review as a small addendum block appended below
 * the main review.
 * @param {string} label
 * @param {SubReview} sub
 */
function createSubReviewBlock(label, sub) {
  const block = document.createElement('div');
  block.className = 'entry-addendum';

  const header = document.createElement('div');
  header.className = 'entry-meta';

  const labelEl = document.createElement('span');
  labelEl.className = 'entry-addendum-label';
  labelEl.textContent = label;
  header.appendChild(labelEl);

  if (sub.ratingText) {
    const rating = document.createElement('span');
    rating.className = 'entry-rating';
    rating.textContent = sub.ratingText;
    header.appendChild(rating);
  }

  if (sub.dateReviewed) {
    const published = document.createElement('span');
    published.className = 'entry-published';
    published.textContent = `Reviewed: ${displayDate(sub.dateReviewed)}`;
    header.appendChild(published);
  }

  block.appendChild(header);

  if (sub.review) {
    const desc = document.createElement('div');
    desc.className = 'entry-description';
    desc.textContent = sub.review;
    block.appendChild(desc);
  }

  return block;
}

/** @param {Review} r */
function createReviewArticle(r) {
  const article = document.createElement('article');
  const body = document.createElement('div');
  body.className = 'entry-body';

  const title = document.createElement('div');
  title.className = 'entry-title';
  title.textContent = r.titleEN ?? 'Untitled';
  for (const link of createExternalLinks(r)) {
    link.className = 'entry-external-link';
    title.appendChild(link);
  }

  const titleJp = document.createElement('div');
  titleJp.className = 'entry-title-jp';
  titleJp.textContent = r.titleJP ?? '';

  const desc = document.createElement('div');
  desc.className = 'entry-description';
  desc.textContent = r.review ?? '';

  const meta = document.createElement('div');
  meta.className = 'entry-meta';

  const rating = document.createElement('span');
  rating.className = 'entry-rating';
  rating.textContent = r.ratingText ?? '';

  const published = document.createElement('span');
  published.className = 'entry-published';
  published.textContent = `Reviewed: ${r.dateReviewed ? displayDate(r.dateReviewed) : 'Unknown'}`;

  meta.append(rating, published);

  if (r.watchProgress) {
    const progress = document.createElement('span');
    progress.className = 'entry-progress';
    progress.textContent = `Progress: ${r.watchProgress}`;
    meta.appendChild(progress);
  }

  for (const [key, text] of [['op', 'Liked OP'], ['ed', 'Liked ED']]) {
    if (!r[key]) continue;
    const mark = document.createElement('span');
    mark.className = 'entry-mark';
    mark.textContent = text;
    meta.appendChild(mark);
  }

  const streaming = createStreamingRow(r);
  if (streaming) meta.appendChild(streaming);

  body.append(title, titleJp, desc, meta);

  if (r.fullReview) {
    body.appendChild(createSubReviewBlock('Revisit', r.fullReview));
  }

  article.appendChild(body);
  return article;
}

/** Every text/rating field on a review worth matching a search term against. */
function searchableFields(r) {
  return [
    r.titleEN, r.titleJP, r.review, r.ratingText,
    r.fullReview?.review, r.fullReview?.ratingText,
  ];
}

/**
 * Restores every control from the query string, so a filtered view is a link
 * you can hand someone. Anything missing or unrecognized falls back to the
 * page's default: the current season, no search, Most Recent, no chips.
 */
function applyStateFromUrl() {
  const params = new URLSearchParams(location.search);
  if (dom.seasonFilter) {
    const season = params.get('season');
    const known = [...dom.seasonFilter.options].some(option => option.value === season);
    dom.seasonFilter.value = known && season ? season : currentSeasonId;
  }
  if (dom.searchInput) dom.searchInput.value = params.get('q') ?? '';
  if (dom.sortBy) {
    const sort = params.get('sort') ?? '';
    dom.sortBy.value = sort in SORTERS ? sort : 'recent';
  }
  chipFilters = chipFiltersFromParams(params);
}

/**
 * Mirrors every control into the query string, leaving out whatever's at its
 * default so the plain /vqar URL still means "this season, unfiltered". Uses
 * replaceState, like /vqar-stats and /fsar do for their filters, so working
 * through filters doesn't fill up browser history.
 */
function updateUrl() {
  if (!dom.seasonFilter || !dom.searchInput || !dom.sortBy) return;
  const url = new URL(location.href);
  const setOrDelete = (key, value, defaultValue) => {
    if (value && value !== defaultValue) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  };
  setOrDelete('season', dom.seasonFilter.value, currentSeasonId);
  setOrDelete('q', dom.searchInput.value.trim(), '');
  setOrDelete('sort', dom.sortBy.value, 'recent');
  writeChipFiltersToParams(url.searchParams, chipFilters);
  // URLSearchParams escapes the commas between chip values; a comma is legal
  // in a query string, and `rating=4,5` reads better in a shared link.
  const href = url.href.replace(/%2C/gi, ',');
  if (href !== location.href) history.replaceState(null, '', href);
}

/** Whether anything Clear Filters would reset is set. Season and sort aren't filters in that sense. */
function hasActiveFilters() {
  return Boolean(dom.searchInput?.value.trim()) || activeChipCount(chipFilters) > 0;
}

/**
 * One row of toggle chips. Rebuilding the buttons would drop keyboard focus
 * from the one just pressed, so focus is handed back to its replacement.
 * @param {HTMLElement|null} container
 * @param {import('./filters.js').ChipDimension} dimension
 * @param {{ value: string, label: string }[]} options
 * @param {Map<string, number>} counts
 */
function renderChipRow(container, dimension, options, counts) {
  if (!container) return;
  const focused = /** @type {HTMLElement|null} */ (document.activeElement);
  const refocus = focused && container.contains(focused) ? focused.dataset.value : null;

  const buttons = options.map(({ value, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-chip';
    button.dataset.dimension = dimension;
    button.dataset.value = value;
    button.setAttribute('aria-pressed', String(chipFilters[dimension].has(value)));
    const count = document.createElement('span');
    count.className = 'chip-count';
    count.textContent = String(counts.get(value) ?? 0);
    button.append(label, ' ', count);
    return button;
  });
  container.replaceChildren(...buttons);

  if (refocus !== null) {
    buttons.find(button => button.dataset.value === refocus)?.focus();
  }
}

/**
 * All three chip rows, counted over `reviews` (season- and search-scoped).
 * Streaming only offers the services something in scope is actually on, plus
 * any already selected, so a selection is never stranded without its chip.
 * @param {Review[]} reviews
 * @param {Review[]} seasonReviews - season-scoped only, for which services to offer
 */
function renderChips(reviews, seasonReviews) {
  const offered = new Set(seasonReviews.flatMap(r => reviewValues('on', r)));
  renderChipRow(dom.ratingChips, 'rating',
    RATING_VALUES.map(value => ({ value, label: ratingChipLabel(value) })),
    chipCounts(reviews, chipFilters, 'rating'));
  renderChipRow(dom.onChips, 'on',
    Object.entries(STREAMING_SERVICES)
      .filter(([key]) => offered.has(key) || chipFilters.on.has(key))
      .map(([value, service]) => ({ value, label: service.name })),
    chipCounts(reviews, chipFilters, 'on'));
  renderChipRow(dom.hasChips, 'has',
    Object.entries(HAS_OPTIONS).map(([value, label]) => ({ value, label })),
    chipCounts(reviews, chipFilters, 'has'));

  const active = activeChipCount(chipFilters);
  if (dom.filtersToggle) {
    dom.filtersToggle.textContent = active > 0 ? `More filters (${active})` : 'More filters';
  }
}

/**
 * @param {number} shown
 * @param {number} total
 */
function renderSummary(shown, total) {
  if (dom.resultCount) {
    const noun = total === 1 ? 'review' : 'reviews';
    dom.resultCount.textContent = hasActiveFilters()
      ? `Showing ${shown} of ${total} ${noun}`
      : `${total} ${noun}`;
  }
  if (dom.clearFilters) dom.clearFilters.hidden = !hasActiveFilters();
}

function renderReviews() {
  if (!dom.searchInput || !dom.seasonFilter || !dom.sortBy || !dom.reviewedShows) return;

  const searchTerm = dom.searchInput.value.trim().toLowerCase();
  const season = dom.seasonFilter.value;
  const sortBy = dom.sortBy.value;

  const seasonIds = season === 'all' ? [...seasonDataById.keys()] : [season];
  const reviews = buildReviewsForLoadedSeasons(seasonIds);

  const searched = reviews.filter(r =>
    !searchTerm || searchableFields(r).some(field => (field ?? '').toLowerCase().includes(searchTerm))
  );
  const filtered = searched.filter(r => matchesChipFilters(r, chipFilters));

  filtered.sort(SORTERS[sortBy] ?? (() => 0));

  renderChips(searched, reviews);
  renderSummary(filtered.length, reviews.length);
  updateUrl();

  const nodes = [];
  if (loadErrors.length > 0) {
    const warning = document.createElement('div');
    warning.className = 'loading';
    warning.style.color = 'red';
    warning.textContent = `ERROR: failed to load ${loadErrors.map(m => m.name).join(', ')}`;
    nodes.push(warning);
  }

  if (filtered.length === 0) {
    const div = document.createElement('div');
    div.className = 'loading';
    div.textContent = 'NO REVIEWS FOUND';
    nodes.push(div);
  } else {
    nodes.push(...filtered.map(createReviewArticle));
  }

  dom.reviewedShows.replaceChildren(...nodes);
}

/**
 * @param {HTMLElement|null} container
 * @param {string} key
 */
function renderList(container, key) {
  if (!container) return;

  const season = seasonDataById.get(currentSeasonId);
  const countEl = key === 'pending' ? dom.pendingCount : dom.skippedCount;
  if (countEl) countEl.textContent = Array.isArray(season?.[key]) ? `(${season[key].length})` : '';

  if (!season || !Array.isArray(season[key])) {
    const li = document.createElement('li');
    li.textContent = 'None';
    container.replaceChildren(li);
    return;
  }

  const shows = season[key].map(toShow);
  container.replaceChildren(...(key === 'pending' ? pendingItems(shows) : skippedItems(shows)));
}

/**
 * A list entry in its object form. An entry that's missing outright (null, or
 * an object with no title) still gets a row rather than breaking the list.
 * @param {import('./list-entries.js').ListEntry|null|undefined} entry
 * @returns {import('./list-entries.js').ListEntryDetails}
 */
function toShow(entry) {
  const show = normalizeEntry(entry ?? '');
  return { ...show, title: show.title || 'Unknown' };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10-08` -> `Oct 8`; anything that isn't a plain date is shown as written. */
function displayPremiere(value) {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(value);
  const month = match && MONTHS[Number(match[1]) - 1];
  return month ? `${month} ${Number(match[2])}` : value;
}

/**
 * One show as a line: the title, with its streaming badges pushed to the far end.
 * @param {import('./list-entries.js').ListEntryDetails} show
 */
function renderShowRow(show) {
  const li = document.createElement('li');
  li.className = 'show-row';
  const title = document.createElement('span');
  title.className = 'show-row-title';
  title.textContent = show.title;
  li.append(title);
  const badges = createStreamingRow(show);
  if (badges) li.append(badges);
  return li;
}

/**
 * A heading with its shows underneath, as one item of the To Be Reviewed / Not
 * Reviewing list.
 * @param {string} heading
 * @param {HTMLElement[]} rows
 */
function renderGroup(heading, rows) {
  const li = document.createElement('li');
  li.className = 'show-group';
  const headingEl = document.createElement('h3');
  headingEl.className = 'show-group-heading';
  headingEl.textContent = heading;
  const list = document.createElement('ul');
  list.className = 'show-list';
  list.append(...rows);
  li.append(headingEl, list);
  return li;
}

/**
 * To Be Reviewed. Once any show has a first-episode date, or is marked
 * `availableNow`, the list is grouped: "Available now" first, then premiere
 * dates earliest first, then "Date TBD" for the rest. Until then (early in the
 * preseason) it stays a flat list rather than one big "TBD" group.
 * @param {import('./list-entries.js').ListEntryDetails[]} shows
 */
function pendingItems(shows) {
  if (!shows.some(show => show.firstEpisode || show.availableNow)) return shows.map(show => renderShowRow(show));

  /** @type {Map<string, import('./list-entries.js').ListEntryDetails[]>} */
  const byDate = new Map();
  for (const show of shows) {
    if (show.availableNow || !show.firstEpisode) continue;
    byDate.set(show.firstEpisode, [...(byDate.get(show.firstEpisode) ?? []), show]);
  }

  const groups = [
    { heading: 'Available now', shows: shows.filter(show => show.availableNow) },
    ...[...byDate.keys()].sort().map(date => ({ heading: displayPremiere(date), shows: byDate.get(date) ?? [] })),
    { heading: 'Date TBD', shows: shows.filter(show => !show.availableNow && !show.firstEpisode) },
  ].filter(group => group.shows.length > 0);

  return groups.map(group => renderGroup(group.heading, group.shows.map(show => renderShowRow(show))));
}

/** The reason a show is skipped, as written. Empty when there isn't one. */
function skipReason(show) {
  return show.reason?.trim() ?? '';
}

/**
 * The order Not Reviewing groups appear in, and the order of precedence when
 * more than one reason applies to a show: the standing rule first, then the
 * factual blockers (hardest first), then taste. Matched case-insensitively on
 * the start of the reason, so "Not paying for another service ($13/mo)" still
 * counts. A reason that isn't listed goes after these, biggest group first.
 */
const SKIP_REASON_ORDER = [
  'continuing series',
  'not streaming in the us',
  'not paying for another service',
  'kids show',
  'adult content',
  'not interested',
];

/** @param {string} reason */
function skipReasonRank(reason) {
  const lower = reason.toLowerCase();
  const rank = SKIP_REASON_ORDER.findIndex(known => lower.startsWith(known));
  return rank === -1 ? SKIP_REASON_ORDER.length : rank;
}

/**
 * Not Reviewing. Once any show has a reason the list is grouped by that reason in
 * SKIP_REASON_ORDER, then any other reasons biggest group first, with the shows
 * that have none last. Until then it stays a flat list.
 * @param {import('./list-entries.js').ListEntryDetails[]} shows
 */
function skippedItems(shows) {
  if (!shows.some(skipReason)) return shows.map(show => renderShowRow(show));

  /** @type {Map<string, import('./list-entries.js').ListEntryDetails[]>} */
  const byReason = new Map();
  for (const show of shows) {
    const key = skipReason(show);
    byReason.set(key, [...(byReason.get(key) ?? []), show]);
  }

  // Array.prototype.sort is stable, so equally ranked, equally sized groups keep the order they first appear in.
  const reasons = [...byReason.keys()].filter(Boolean).sort((a, b) =>
    skipReasonRank(a) - skipReasonRank(b) || (byReason.get(b)?.length ?? 0) - (byReason.get(a)?.length ?? 0));
  if (byReason.has('')) reasons.push('');

  return reasons.map(reason => renderGroup(reason || 'No reason given', (byReason.get(reason) ?? []).map(show => renderShowRow(show))));
}

dom.searchInput?.addEventListener('input', renderReviews);
dom.seasonFilter?.addEventListener('change', loadForCurrentFilter);
dom.sortBy?.addEventListener('change', renderReviews);

dom.filterChips?.addEventListener('click', (e) => {
  const chip = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest('.filter-chip'));
  if (!chip) return;
  const selected = chipFilters[/** @type {import('./filters.js').ChipDimension} */ (chip.dataset.dimension)];
  const value = chip.dataset.value ?? '';
  if (!selected) return;
  if (selected.has(value)) selected.delete(value);
  else selected.add(value);
  renderReviews();
});

dom.clearFilters?.addEventListener('click', () => {
  if (dom.searchInput) dom.searchInput.value = '';
  chipFilters = emptyChipFilters();
  renderReviews();
});

/**
 * To Be Reviewed / Not Reviewing are collapsed <details>, so jumping to one
 * has to open it too, or the jump lands on a closed badge. Covers the jump
 * links, and a #pendingSection / #skippedSection link arriving from elsewhere.
 * @param {string} id
 */
function openSection(id) {
  const section = document.getElementById(id);
  if (section instanceof HTMLDetailsElement) section.open = true;
}

document.querySelectorAll('.jump-link').forEach(link => {
  link.addEventListener('click', () => openSection(/** @type {HTMLElement} */ (link).dataset.target ?? ''));
});
if (location.hash) openSection(location.hash.slice(1));

// Back to top, once a screen's worth down. Smooth scrolling (and its
// reduced-motion opt-out) is styles.css's `scroll-behavior`, not JS's.
function updateBackToTop() {
  if (dom.backToTop) dom.backToTop.hidden = window.scrollY < window.innerHeight;
}
window.addEventListener('scroll', updateBackToTop, { passive: true });
updateBackToTop();
dom.backToTop?.addEventListener('click', () => window.scrollTo(0, 0));

// Only visible on narrow screens (see styles.css), where the chip rows start
// collapsed so they don't push the reviews below the fold.
dom.filtersToggle?.addEventListener('click', () => {
  const open = dom.filterChips?.classList.toggle('open') ?? false;
  dom.filtersToggle?.setAttribute('aria-expanded', String(open));
});

await loadData();
