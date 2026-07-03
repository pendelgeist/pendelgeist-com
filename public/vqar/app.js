/**
 * @typedef {Object} Review
 * @property {string} titleEN
 * @property {string} titleJP
 * @property {number} ratingNumber
 * @property {string} ratingText
 * @property {string} review
 * @property {string} dateReviewed
 * @property {string} season
 * @property {string} seasonName
 * @property {number} _timestamp
 */

/**
 * @typedef {Object} Season
 * @property {string|number} id
 * @property {string} name
 * @property {Review[]} reviewed
 * @property {string[]} pending
 * @property {string[]} skipped
 */

/**
 * @typedef {Object} VQARData
 * @property {string|number} currentSeason
 * @property {Season[]} seasons
 */

const GIST_URL = 'https://gist.githubusercontent.com/pendelgeist/8185a42df4e11290513cf6326bd3fc60/raw/vqar-data.json';

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
  seasonFilter: /** @type {HTMLSelectElement|null} */ (document.getElementById('seasonFilter')),
  searchInput: /** @type {HTMLInputElement|null} */ (document.getElementById('searchInput')),
  sortBy: /** @type {HTMLSelectElement|null} */ (document.getElementById('sortBy')),
  reviewedShows: document.getElementById('reviewedShows'),
  pendingShows: document.getElementById('pendingShows'),
  skippedShows: document.getElementById('skippedShows'),
};

/** @type {Review[]} */
let allReviews = [];
/** @type {VQARData|null} */
let currentData = null;

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

async function loadData() {
  try {
    const response = await fetch(`${GIST_URL}?t=${Date.now()}`, { cache: 'no-cache' });
    if (!response.ok) {
      showError(`HTTP ${response.status}`);
      return;
    }

    const data = /** @type {VQARData} */ (await response.json());
    if (!Array.isArray(data?.seasons)) {
      showError('Invalid data format');
      return;
    }

    currentData = data;

    const currentId = String(data.currentSeason);
    const currentSeason = data.seasons.find(s => String(s.id) === currentId);
    if (dom.currentSeasonName) {
      dom.currentSeasonName.textContent = currentSeason?.name ?? '';
    }

    if (dom.seasonFilter) {
      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = 'All Seasons';

      const fragment = document.createDocumentFragment();
      for (const season of data.seasons) {
        const option = document.createElement('option');
        option.value = String(season.id);
        option.textContent = season.name;
        option.selected = String(season.id) === currentId;
        fragment.appendChild(option);
      }

      dom.seasonFilter.replaceChildren(allOption, fragment);
    }

    allReviews = data.seasons.flatMap(s =>
      (s.reviewed ?? []).map(r => ({
        ...r,
        season: String(s.id),
        seasonName: s.name,
        _timestamp: Date.parse(r.dateReviewed) || 0,
      }))
    );

    renderReviews();
    renderList(dom.pendingShows, 'pending');
    renderList(dom.skippedShows, 'skipped');
  } catch (error) {
    console.error('Error loading data:', error);
    showError(error instanceof Error ? error.message : 'Unknown error');
  }
}

/** @param {Review} r */
function createReviewArticle(r) {
  const article = document.createElement('article');
  const body = document.createElement('div');
  body.className = 'entry-body';

  const title = document.createElement('div');
  title.className = 'entry-title';
  title.textContent = r.titleEN ?? 'Untitled';

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
  body.append(title, titleJp, desc, meta);
  article.appendChild(body);
  return article;
}

function renderReviews() {
  if (!dom.searchInput || !dom.seasonFilter || !dom.sortBy || !dom.reviewedShows) return;

  const searchTerm = dom.searchInput.value.toLowerCase();
  const season = dom.seasonFilter.value;
  const sortBy = dom.sortBy.value;

  const filtered = allReviews.filter(r => {
    const matchesSearch = !searchTerm ||
      (r.titleEN ?? '').toLowerCase().includes(searchTerm) ||
      (r.titleJP ?? '').toLowerCase().includes(searchTerm) ||
      (r.review ?? '').toLowerCase().includes(searchTerm) ||
      (r.ratingText ?? '').toLowerCase().includes(searchTerm);
    return matchesSearch && (season === 'all' || r.season === season);
  });

  filtered.sort(SORTERS[sortBy] ?? (() => 0));

  if (filtered.length === 0) {
    const div = document.createElement('div');
    div.className = 'loading';
    div.textContent = 'NO REVIEWS FOUND';
    dom.reviewedShows.replaceChildren(div);
  } else {
    dom.reviewedShows.replaceChildren(...filtered.map(createReviewArticle));
  }
}

/**
 * @param {HTMLElement|null} container
 * @param {string} key
 */
function renderList(container, key) {
  if (!container) return;

  const currentId = String(currentData?.currentSeason ?? '');
  const season = currentData?.seasons?.find(s => String(s.id) === currentId);
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
dom.seasonFilter?.addEventListener('change', renderReviews);
dom.sortBy?.addEventListener('change', renderReviews);

await loadData();
