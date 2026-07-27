import { MANIFEST_URL } from '../manifest-url.js';

/**
 * A follow-up note attached to a Review: a full-series re-review once a
 * "Finish Ep"-rated show is actually finished, or an OP/ED callout.
 * @typedef {Object} SubReview
 * @property {number} [ratingNumber]
 * @property {string} [ratingText]
 * @property {string} [review]
 * @property {string} [dateReviewed]
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
 * @property {SubReview} [op] - optional opening notes/rating
 * @property {SubReview} [ed] - optional ending notes/rating
 * @property {string} season
 * @property {string} seasonName
 * @property {number} _timestamp
 * @property {number} [anilistId] - optional AniList media id, links out to the show's AniList page
 * @property {string} [watchProgress] - optional, free-text note on how far a revisit actually got (e.g. "Ep 3")
 */

/**
 * @typedef {Object} SeasonData
 * @property {string|number} id
 * @property {string} name
 * @property {Review[]} reviewed
 * @property {string[]} pending
 * @property {string[]} skipped
 */

/**
 * @typedef {Object} SeasonMeta
 * @property {string|number} id
 * @property {string} name
 * @property {string} file - absolute raw URL to this season's own gist file
 */

/**
 * @typedef {Object} Manifest
 * @property {string|number} currentSeason
 * @property {SeasonMeta[]} seasons
 */

// Bump this if SeasonData's shape ever changes, to invalidate everything cached under the old shape.
const CACHE_PREFIX = 'vqar:v1:season:';

/**
 * Builds an AniChart URL for a season id like "spring-2026" (AniChart, the
 * seasonal-browsing frontend for AniList's same backend, expects the season
 * word capitalized: "https://anichart.net/Spring-2026").
 * @param {string} seasonId
 */
function anichartUrlForSeason(seasonId) {
  return `https://anichart.net/${seasonId.replace(/^[a-z]/, (c) => c.toUpperCase())}`;
}

/** @type {Record<string, (a: Review, b: Review) => number>} */
const SORTERS = {
  recent: (a, b) => b._timestamp - a._timestamp,
  'rating-high': (a, b) => (b.ratingNumber ?? 0) - (a.ratingNumber ?? 0),
  'rating-low': (a, b) => (a.ratingNumber ?? 0) - (b.ratingNumber ?? 0),
  title: (a, b) => (a.titleEN ?? '').localeCompare(b.titleEN ?? ''),
};

const dom = {
  infoToggle: document.getElementById('infoToggle'),
  guidelines: document.getElementById('guidelines'),
  currentSeasonName: document.getElementById('currentSeasonName'),
  currentSeasonAnichart: /** @type {HTMLAnchorElement|null} */ (document.getElementById('currentSeasonAnichart')),
  seasonFilter: /** @type {HTMLSelectElement|null} */ (document.getElementById('seasonFilter')),
  searchInput: /** @type {HTMLInputElement|null} */ (document.getElementById('searchInput')),
  sortBy: /** @type {HTMLSelectElement|null} */ (document.getElementById('sortBy')),
  reviewedShows: document.getElementById('reviewedShows'),
  pendingShows: document.getElementById('pendingShows'),
  skippedShows: document.getElementById('skippedShows'),
};

/** @type {Manifest|null} */
let manifest = null;
/** @type {Map<string, SeasonData>} */
const seasonDataById = new Map();
/** @type {string} */
let currentSeasonId = '';
/** Guards against a slower, stale fetch clobbering a newer selection. */
let loadToken = 0;
/** @type {SeasonMeta[]} seasons that failed to load for the current filter, if any */
let loadErrors = [];

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
 * Loads a season's data, preferring the local cache. The current season is
 * always re-fetched, since it's the one still being actively edited.
 * @param {SeasonMeta} meta
 * @returns {Promise<SeasonData>}
 */
async function getSeasonData(meta) {
  const id = String(meta.id);
  const cacheKey = CACHE_PREFIX + id;
  const isCurrent = id === currentSeasonId;

  if (!isCurrent) {
    const cached = readCache(cacheKey);
    if (cached) return cached;
  }

  const response = await fetch(`${meta.file}?t=${Date.now()}`, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} loading season "${meta.name}"`);
  }
  const data = /** @type {SeasonData} */ (await response.json());

  if (!isCurrent) {
    writeCache(cacheKey, data);
  }
  return data;
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
    return (season.reviewed ?? []).map(r => ({
      ...r,
      season: id,
      seasonName: season.name,
      _timestamp: Date.parse(r.dateReviewed) || 0,
    }));
  });
}

/** Loads whatever the current season filter needs, then renders. */
async function loadForCurrentFilter() {
  if (!manifest || !dom.seasonFilter) return;

  const token = ++loadToken;
  const filterValue = dom.seasonFilter.value;
  const metasNeeded = filterValue === 'all'
    ? manifest.seasons
    : manifest.seasons.filter(s => String(s.id) === filterValue);

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
    const response = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-cache' });
    if (!response.ok) {
      showError(`HTTP ${response.status}`);
      return;
    }

    manifest = /** @type {Manifest} */ (await response.json());
    if (!Array.isArray(manifest?.seasons)) {
      showError('Invalid manifest format');
      return;
    }

    currentSeasonId = String(manifest.currentSeason);
    const currentMeta = manifest.seasons.find(s => String(s.id) === currentSeasonId);
    if (dom.currentSeasonName) {
      dom.currentSeasonName.textContent = currentMeta?.name ?? '';
    }
    if (dom.currentSeasonAnichart) {
      if (currentMeta) {
        dom.currentSeasonAnichart.href = anichartUrlForSeason(currentSeasonId);
        dom.currentSeasonAnichart.hidden = false;
      } else {
        dom.currentSeasonAnichart.hidden = true;
      }
    }

    if (dom.seasonFilter) {
      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = 'All Seasons';

      const fragment = document.createDocumentFragment();
      for (const season of manifest.seasons) {
        const option = document.createElement('option');
        option.value = String(season.id);
        option.textContent = season.name;
        option.selected = String(season.id) === currentSeasonId;
        fragment.appendChild(option);
      }

      dom.seasonFilter.replaceChildren(allOption, fragment);
    }

    await loadForCurrentFilter();
  } catch (error) {
    console.error('Error loading data:', error);
    showError(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Renders a follow-up note (full-series re-review, or an OP/ED callout) as a
 * small addendum block appended below the main review.
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
    published.textContent = `Reviewed: ${sub.dateReviewed}`;
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
  if (r.anilistId) {
    const anilistLink = document.createElement('a');
    anilistLink.className = 'entry-anilist-link';
    anilistLink.href = `https://anilist.co/anime/${r.anilistId}`;
    anilistLink.target = '_blank';
    anilistLink.rel = 'noopener noreferrer';
    anilistLink.textContent = 'AniList';
    title.appendChild(anilistLink);
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
  published.textContent = `Reviewed: ${r.dateReviewed ?? 'Unknown'}`;

  meta.append(rating, published);

  if (r.watchProgress) {
    const progress = document.createElement('span');
    progress.className = 'entry-progress';
    progress.textContent = `Progress: ${r.watchProgress}`;
    meta.appendChild(progress);
  }

  body.append(title, titleJp, desc, meta);

  if (r.fullReview) {
    body.appendChild(createSubReviewBlock('Full Series', r.fullReview));
  }
  if (r.op) {
    body.appendChild(createSubReviewBlock('OP', r.op));
  }
  if (r.ed) {
    body.appendChild(createSubReviewBlock('ED', r.ed));
  }

  article.appendChild(body);
  return article;
}

/** Every text/rating field on a review worth matching a search term against. */
function searchableFields(r) {
  return [
    r.titleEN, r.titleJP, r.review, r.ratingText,
    r.fullReview?.review, r.fullReview?.ratingText,
    r.op?.review, r.op?.ratingText,
    r.ed?.review, r.ed?.ratingText,
  ];
}

function renderReviews() {
  if (!dom.searchInput || !dom.seasonFilter || !dom.sortBy || !dom.reviewedShows) return;

  const searchTerm = dom.searchInput.value.trim().toLowerCase();
  const season = dom.seasonFilter.value;
  const sortBy = dom.sortBy.value;

  const seasonIds = season === 'all' ? [...seasonDataById.keys()] : [season];
  const reviews = buildReviewsForLoadedSeasons(seasonIds);

  const filtered = reviews.filter(r =>
    !searchTerm || searchableFields(r).some(field => (field ?? '').toLowerCase().includes(searchTerm))
  );

  filtered.sort(SORTERS[sortBy] ?? (() => 0));

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
  if (!season || !Array.isArray(season[key])) {
    const li = document.createElement('li');
    li.textContent = 'None';
    container.replaceChildren(li);
    return;
  }

  container.replaceChildren(...season[key].map(show => {
    const li = document.createElement('li');
    li.textContent = show ?? 'Unknown';
    return li;
  }));
}

dom.searchInput?.addEventListener('input', renderReviews);
dom.seasonFilter?.addEventListener('change', loadForCurrentFilter);
dom.sortBy?.addEventListener('change', renderReviews);

await loadData();
