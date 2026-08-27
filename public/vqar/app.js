import { VQAR_INDEX_PATH } from './data-paths.js';
import { createStreamingBadges } from '../streaming.js';

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
 * @property {number} [annId] - optional Anime News Network encyclopedia id, links out to the show's ANN page
 * @property {string} [wikipediaUrl] - optional English Wikipedia article URL
 * @property {string} [wikipediaJaUrl] - optional Japanese Wikipedia article URL, usually
 *   far more detailed on staff and broadcast history than the English one
 * @property {string[]} [streaming] - optional list of streaming service keys (see STREAMING_SERVICES) the show is available on
 * @property {string} [crunchyrollUrl] - optional direct link to the show's Crunchyroll page; makes the "CR" streaming badge clickable
 * @property {string} [hidiveUrl] - optional direct link to the show's HIDIVE page; makes the "HD" streaming badge clickable
 * @property {string} [netflixUrl] - optional direct link to the show's Netflix page; makes the "NF" streaming badge clickable
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
 * @property {string} file - absolute path to this season's own data file
 */

/**
 * @typedef {Object} SeasonIndex
 * @property {string|number} currentSeason
 * @property {SeasonMeta[]} seasons
 */

/**
 * A review's rating for sorting purposes: once a full-series `fullReview`
 * exists, its rating supersedes the original episode-1 `ratingNumber`, since
 * it reflects the more informed verdict.
 * @param {Review} r
 */
function effectiveRatingNumber(r) {
  return typeof r.fullReview?.ratingNumber === 'number' ? r.fullReview.ratingNumber : r.ratingNumber;
}

/** @type {Record<string, (a: Review, b: Review) => number>} */
const SORTERS = {
  recent: (a, b) => b._timestamp - a._timestamp,
  'rating-high': (a, b) => (effectiveRatingNumber(b) ?? 0) - (effectiveRatingNumber(a) ?? 0),
  'rating-low': (a, b) => (effectiveRatingNumber(a) ?? 0) - (effectiveRatingNumber(b) ?? 0),
  title: (a, b) => (a.titleEN ?? '').localeCompare(b.titleEN ?? ''),
};

const dom = {
  infoToggle: document.getElementById('infoToggle'),
  guidelines: document.getElementById('guidelines'),
  currentSeasonName: document.getElementById('currentSeasonName'),
  seasonFilter: /** @type {HTMLSelectElement|null} */ (document.getElementById('seasonFilter')),
  searchInput: /** @type {HTMLInputElement|null} */ (document.getElementById('searchInput')),
  sortBy: /** @type {HTMLSelectElement|null} */ (document.getElementById('sortBy')),
  reviewedShows: document.getElementById('reviewedShows'),
  pendingShows: document.getElementById('pendingShows'),
  skippedShows: document.getElementById('skippedShows'),
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
  // AniList and ANN are ids we expand into URLs; Wikipedia is stored as the URL
  // itself, since it keys on the article title and the two language editions
  // disagree about what that is.
  const externalLinks = [
    r.anilistId && ['AniList', `https://anilist.co/anime/${r.anilistId}`],
    r.annId && ['ANN', `https://www.animenewsnetwork.com/encyclopedia/anime.php?id=${r.annId}`],
    r.wikipediaUrl && ['Wikipedia', r.wikipediaUrl],
    r.wikipediaJaUrl && ['Wikipedia (JP)', r.wikipediaJaUrl],
  ];
  for (const link of externalLinks) {
    if (!link) continue;
    const [label, href] = link;
    const a = document.createElement('a');
    a.className = 'entry-external-link';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    title.appendChild(a);
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

  const badges = createStreamingBadges(r);
  if (badges.length > 0) {
    const streaming = document.createElement('span');
    streaming.className = 'entry-streaming';
    streaming.append(...badges);
    meta.appendChild(streaming);
  }

  body.append(title, titleJp, desc, meta);

  if (r.fullReview) {
    body.appendChild(createSubReviewBlock('Revisit', r.fullReview));
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
