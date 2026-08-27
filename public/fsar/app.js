/**
 * Full Season Anime Reviews (/fsar) - long-form writeups of shows watched all
 * the way through, the counterpart to VQAR's first-episode one-liners.
 *
 * Unlike VQAR, the data is committed to this repo rather than living in gists:
 * public/fsar/data/index.json holds every review's card-level metadata (built
 * by scripts/build-fsar-index.js), and each full writeup is its own file under
 * public/fsar/data/reviews/. The list view needs only the index; a review body
 * is fetched when that review is opened, so a page with forty reviews on it
 * doesn't download forty writeups to render forty cards.
 *
 * One page, two views, switched on the `?show=` query param - so every review
 * has its own shareable URL without needing a build step or server routing.
 */

import { createParagraph } from '../inline-markdown.js';
import { createStreamingBadges } from '../streaming.js';
import {
  STATUSES, SECTIONS, NOTES_HEADING, SPOILERS_HEADING,
  decadeOf, decadeLabel, airedText, episodesText,
} from './schema.js';

/**
 * @typedef {Object} Verdict
 * @property {number|null} [ratingNumber] - 0-5, deliberately the same scale as VQAR's
 * @property {string} [ratingText]
 * @property {string} [oneLiner]
 */

/**
 * @typedef {Object} ReviewCard
 * @property {string} id
 * @property {'wip'|'done'} status
 * @property {string} titleEN
 * @property {string} [titleJP]
 * @property {string} format
 * @property {number} year
 * @property {string} [airedLabel]
 * @property {number|null} [episodeCount]
 * @property {number|null} [episodesWatched]
 * @property {string} dateReviewed
 * @property {string} [dateUpdated]
 * @property {Verdict} verdict
 * @property {string[]} [recommendedFor]
 * @property {string[]} [notFor]
 * @property {string[]} [tags]
 * @property {number} [anilistId]
 * @property {number} [annId]
 * @property {string} [wikipediaUrl] - English Wikipedia article
 * @property {string} [wikipediaJaUrl] - Japanese Wikipedia article, which is
 *   routinely far more detailed on staff and broadcast history
 * @property {string[]} [streaming]
 * @property {string} [availabilityNote] - for shows no service carries (most older ones)
 */

/**
 * @typedef {ReviewCard & { sections: Object }} Review
 */

const INDEX_URL = '/fsar/data/index.json';
const SPOILER_KEY = 'pendelgeist:fsar:spoilers';

/** @param {string} id */
const reviewUrl = (id) => `/fsar/data/reviews/${encodeURIComponent(id)}.json`;

const dom = {
  infoToggle: document.getElementById('infoToggle'),
  guidelines: document.getElementById('guidelines'),
  listView: document.getElementById('listView'),
  showView: document.getElementById('showView'),
  showContent: document.getElementById('showContent'),
  backLink: document.getElementById('backLink'),
  reviewCards: document.getElementById('reviewCards'),
  searchInput: /** @type {HTMLInputElement|null} */ (document.getElementById('searchInput')),
  decadeFilter: /** @type {HTMLSelectElement|null} */ (document.getElementById('decadeFilter')),
  tagFilter: /** @type {HTMLSelectElement|null} */ (document.getElementById('tagFilter')),
  statusFilter: /** @type {HTMLSelectElement|null} */ (document.getElementById('statusFilter')),
  sortBy: /** @type {HTMLSelectElement|null} */ (document.getElementById('sortBy')),
};

/** @type {ReviewCard[]} */
let cards = [];
/** @type {Map<string, Review>} full writeups, fetched once each and kept for the session */
const reviewCache = new Map();
/** Guards against a slow review fetch landing after the reader moved on. */
let loadToken = 0;

dom.infoToggle?.addEventListener('click', (e) => {
  e.preventDefault();
  dom.guidelines?.classList.toggle('show');
});

/** A review's recency: last revision if it's been revised, else first publication. */
const reviewedTime = (c) => Date.parse(c.dateUpdated || c.dateReviewed) || 0;
const byTitle = (a, b) => (a.titleEN ?? '').localeCompare(b.titleEN ?? '');

/** @type {Record<string, (a: ReviewCard, b: ReviewCard) => number>} */
const SORTERS = {
  recent: (a, b) => reviewedTime(b) - reviewedTime(a),
  'year-new': (a, b) => (b.year ?? 0) - (a.year ?? 0) || byTitle(a, b),
  'year-old': (a, b) => (a.year ?? 0) - (b.year ?? 0) || byTitle(a, b),
  // An unrated review sorts last rather than as a zero, since "no verdict yet"
  // isn't the same claim as "rated zero".
  'rating-high': (a, b) => (b.verdict?.ratingNumber ?? -1) - (a.verdict?.ratingNumber ?? -1) || byTitle(a, b),
  title: byTitle,
};

// --- Data ---

function showError(message) {
  const div = document.createElement('div');
  div.className = 'loading loading-error';
  div.textContent = `ERROR: ${message}`;
  (dom.showView?.hidden === false ? dom.showContent : dom.reviewCards)?.replaceChildren(div);
}

async function loadIndex() {
  const response = await fetch(`${INDEX_URL}?t=${Date.now()}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status} loading the review index`);
  const data = await response.json();
  if (!Array.isArray(data?.reviews)) throw new Error('Invalid review index format');
  return data.reviews;
}

/** @param {string} id */
async function loadReview(id) {
  const cached = reviewCache.get(id);
  if (cached) return cached;

  const response = await fetch(reviewUrl(id), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status} loading that review`);
  const review = await response.json();
  reviewCache.set(id, review);
  return review;
}

// --- Routing ---

const currentShowId = () => new URLSearchParams(window.location.search).get('show');

/**
 * @param {string|null} id - a review id, or null for the list view
 * @param {{ replace?: boolean }} [options]
 */
function navigate(id, { replace = false } = {}) {
  const params = new URLSearchParams(window.location.search);
  if (id) params.set('show', id);
  else params.delete('show');
  const query = params.toString();
  const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  if (replace) window.history.replaceState({}, '', url);
  else window.history.pushState({}, '', url);
  return render();
}

/** Keeps the shareable filter params in the URL without spamming browser history. */
function syncFilterParams() {
  const params = new URLSearchParams(window.location.search);
  for (const [key, select] of Object.entries({
    decade: dom.decadeFilter, tag: dom.tagFilter, status: dom.statusFilter,
  })) {
    if (select && select.value !== 'all') params.set(key, select.value);
    else params.delete(key);
  }
  const query = params.toString();
  window.history.replaceState({}, '', query ? `${window.location.pathname}?${query}` : window.location.pathname);
}

/** Pre-selects filters from the URL; an unrecognized value just falls back to "all". */
function applyFilterParams() {
  const params = new URLSearchParams(window.location.search);
  for (const [key, select] of Object.entries({
    decade: dom.decadeFilter, tag: dom.tagFilter, status: dom.statusFilter,
  })) {
    const value = params.get(key);
    if (!select || !value) continue;
    if ([...select.options].some((o) => o.value === value)) select.value = value;
  }
}

// --- List view ---

/**
 * @param {string} label
 * @param {string} value
 */
function createOption(label, value) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

/** Both the Decade and Tag filters are derived from the data, not hardcoded. */
function populateFilters() {
  if (dom.decadeFilter) {
    const decades = [...new Set(cards.map((c) => decadeOf(c.year)))].sort((a, b) => b - a);
    dom.decadeFilter.replaceChildren(
      createOption('All Decades', 'all'),
      ...decades.map((d) => createOption(decadeLabel(d), String(d)))
    );
  }
  if (dom.tagFilter) {
    const tags = [...new Set(cards.flatMap((c) => c.tags ?? []))].sort();
    dom.tagFilter.replaceChildren(
      createOption('All Tags', 'all'),
      ...tags.map((t) => createOption(t, t))
    );
  }
}

/** @param {ReviewCard} c */
function searchableFields(c) {
  return [
    c.titleEN, c.titleJP, c.airedLabel, String(c.year ?? ''),
    c.verdict?.oneLiner, c.verdict?.ratingText,
    ...(c.tags ?? []), ...(c.recommendedFor ?? []), ...(c.notFor ?? []),
  ];
}

function filteredCards() {
  const term = (dom.searchInput?.value ?? '').trim().toLowerCase();
  const decade = dom.decadeFilter?.value ?? 'all';
  const tag = dom.tagFilter?.value ?? 'all';
  const status = dom.statusFilter?.value ?? 'all';

  const matches = cards.filter((c) => {
    if (decade !== 'all' && String(decadeOf(c.year)) !== decade) return false;
    if (tag !== 'all' && !(c.tags ?? []).includes(tag)) return false;
    if (status !== 'all' && c.status !== status) return false;
    if (term && !searchableFields(c).some((f) => (f ?? '').toLowerCase().includes(term))) return false;
    return true;
  });

  return matches.sort(SORTERS[dom.sortBy?.value ?? 'recent'] ?? SORTERS.recent);
}

/** @param {'wip'|'done'} status */
function createStatusBadge(status) {
  const badge = document.createElement('span');
  badge.className = `status-badge status-badge-${status}`;
  badge.textContent = STATUSES[status] ?? status;
  return badge;
}

/** @param {string[]} items */
function createTagList(items) {
  const list = document.createElement('span');
  list.className = 'tag-list';
  list.append(...items.map((tag) => {
    const el = document.createElement('span');
    el.className = 'tag';
    el.textContent = tag;
    return el;
  }));
  return list;
}

/** @param {ReviewCard} c */
function createCard(c) {
  const article = document.createElement('article');
  article.className = 'review-card';

  const link = document.createElement('a');
  link.className = 'card-link';
  // A real href, so middle-click/open-in-new-tab and copy-link both work; the
  // click handler below only intercepts plain left clicks.
  link.href = `?show=${encodeURIComponent(c.id)}`;
  link.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(c.id);
  });

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = c.titleEN ?? 'Untitled';
  if (c.status === 'wip') title.appendChild(createStatusBadge(c.status));

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  for (const text of [airedText(c), c.format, episodesText(c)].filter(Boolean)) {
    const span = document.createElement('span');
    span.textContent = text;
    meta.appendChild(span);
  }

  link.append(title, meta);

  const verdict = document.createElement('div');
  verdict.className = 'card-verdict';
  if (c.verdict?.ratingText) {
    const rating = document.createElement('span');
    rating.className = 'card-rating';
    rating.textContent = c.verdict.ratingText;
    verdict.appendChild(rating);
  }
  const oneLiner = document.createElement('span');
  oneLiner.className = c.verdict?.oneLiner ? 'card-oneliner' : 'card-oneliner card-oneliner-empty';
  oneLiner.textContent = c.verdict?.oneLiner || 'Draft — no verdict written yet.';
  verdict.appendChild(oneLiner);
  link.appendChild(verdict);

  article.appendChild(link);

  if (c.recommendedFor?.length) {
    const good = document.createElement('div');
    good.className = 'card-audience';
    const label = document.createElement('span');
    label.className = 'card-audience-label';
    label.textContent = 'Good for';
    good.append(label, document.createTextNode(c.recommendedFor.join(' • ')));
    article.appendChild(good);
  }

  const footer = document.createElement('div');
  footer.className = 'card-footer';
  if (c.tags?.length) footer.appendChild(createTagList(c.tags));
  const badges = createStreamingBadges(c);
  if (badges.length > 0) {
    const streaming = document.createElement('span');
    streaming.className = 'entry-streaming';
    streaming.append(...badges);
    footer.appendChild(streaming);
  }
  if (footer.childElementCount > 0) article.appendChild(footer);

  return article;
}

function renderList() {
  if (dom.listView) dom.listView.hidden = false;
  if (dom.showView) dom.showView.hidden = true;
  document.title = 'Full Season Anime Reviews';

  if (!dom.reviewCards) return;
  const matches = filteredCards();
  if (matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loading';
    empty.textContent = 'NO REVIEWS FOUND';
    dom.reviewCards.replaceChildren(empty);
    return;
  }
  dom.reviewCards.replaceChildren(...matches.map(createCard));
}

// --- Review view ---

/**
 * @param {string} heading
 * @param {string[]} paragraphs
 * @param {string} [ratingText]
 */
function createSection(heading, paragraphs, ratingText) {
  const section = document.createElement('section');
  section.className = 'review-section';

  const h = document.createElement('h3');
  h.textContent = heading;
  if (ratingText) {
    const rating = document.createElement('span');
    rating.className = 'section-rating';
    rating.textContent = ratingText;
    h.appendChild(rating);
  }
  section.appendChild(h);
  section.append(...paragraphs.map(createParagraph));
  return section;
}

/** @param {Review} review */
function createSpoilerBlock(review) {
  const blocks = review.sections?.spoilers ?? [];
  if (blocks.length === 0) return null;

  const wrapper = document.createElement('section');
  wrapper.className = 'review-section review-spoilers';

  const h = document.createElement('h3');
  h.textContent = SPOILERS_HEADING;
  wrapper.appendChild(h);

  const note = document.createElement('p');
  note.className = 'spoiler-note';
  note.textContent = 'Collapsed on purpose. Open only what you want to know.';
  wrapper.appendChild(note);

  // Whether spoilers start open is remembered per reader, so someone who has
  // already seen the show doesn't have to keep opening them on every review.
  let startOpen = false;
  try {
    startOpen = localStorage.getItem(SPOILER_KEY) === 'shown';
  } catch {
    // Private browsing / blocked storage: fall back to collapsed, the safe default.
  }

  const details = blocks.map((block) => {
    const el = document.createElement('details');
    el.className = 'spoiler';
    el.open = startOpen;
    const summary = document.createElement('summary');
    summary.textContent = block.heading;
    el.appendChild(summary);
    el.append(...block.body.map(createParagraph));
    return el;
  });

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'spoiler-toggle';
  const syncToggle = () => {
    const allOpen = details.every((d) => d.open);
    toggle.textContent = allOpen ? 'Hide all spoilers' : 'Reveal all spoilers';
    toggle.setAttribute('aria-expanded', String(allOpen));
  };
  toggle.addEventListener('click', () => {
    const open = !details.every((d) => d.open);
    for (const d of details) d.open = open;
    try {
      localStorage.setItem(SPOILER_KEY, open ? 'shown' : 'hidden');
    } catch {
      // Best-effort only; the toggle still works for this page view.
    }
    syncToggle();
  });
  for (const d of details) d.addEventListener('toggle', syncToggle);
  syncToggle();

  wrapper.append(toggle, ...details);
  return wrapper;
}

/**
 * @param {string} label
 * @param {string[]} items
 * @param {string} className
 */
function createAudienceList(label, items, className) {
  const wrapper = document.createElement('div');
  wrapper.className = `audience ${className}`;
  const h = document.createElement('h4');
  h.textContent = label;
  const ul = document.createElement('ul');
  ul.append(...items.map((item) => {
    const li = document.createElement('li');
    li.append(...createParagraph(item).childNodes);
    return li;
  }));
  wrapper.append(h, ul);
  return wrapper;
}

/**
 * A labelled block in the review's side rail. The rail is narrow (and becomes
 * a stacked strip on mobile), so the facts are grouped under short labels
 * rather than run together as one long bullet-separated line.
 *
 * @param {string} label
 * @param {Node[]} nodes
 * @param {string} [className]
 */
function createFactBlock(label, nodes, className = '') {
  if (nodes.length === 0) return null;
  const block = document.createElement('div');
  block.className = `fact-block ${className}`.trim();
  const h = document.createElement('h4');
  h.textContent = label;
  const body = document.createElement('div');
  body.className = 'fact-body';
  body.append(...nodes);
  block.append(h, body);
  return block;
}

/**
 * The masthead: title, original title and the verdict. Spans the full width of
 * the article on a wide screen, above the prose/rail split.
 *
 * @param {Review} review
 */
function createReviewHeader(review) {
  const header = document.createElement('header');
  header.className = 'review-header';

  const title = document.createElement('h1');
  title.className = 'review-title';
  title.textContent = review.titleEN ?? 'Untitled';
  if (review.status === 'wip') title.appendChild(createStatusBadge(review.status));
  header.appendChild(title);

  if (review.titleJP) {
    const jp = document.createElement('div');
    jp.className = 'review-title-jp';
    jp.textContent = review.titleJP;
    header.appendChild(jp);
  }

  const verdict = document.createElement('div');
  verdict.className = 'review-verdict';
  if (review.verdict?.ratingText) {
    const rating = document.createElement('span');
    rating.className = 'review-rating';
    rating.textContent = review.verdict.ratingText;
    verdict.appendChild(rating);
  }
  if (review.verdict?.oneLiner) {
    const oneLiner = document.createElement('p');
    oneLiner.className = 'review-oneliner';
    oneLiner.textContent = review.verdict.oneLiner;
    verdict.appendChild(oneLiner);
  }
  if (verdict.childElementCount > 0) header.appendChild(verdict);

  return header;
}

/**
 * The side rail: everything about the show rather than the opinion of it -
 * release facts, reference links, where to watch, who it is (and isn't) for,
 * tags, and when the review was written.
 *
 * @param {Review} review
 */
function createReviewFacts(review) {
  const aside = document.createElement('aside');
  aside.className = 'review-facts';

  const meta = document.createElement('div');
  meta.className = 'review-meta';
  for (const text of [airedText(review), review.format, episodesText(review)].filter(Boolean)) {
    const span = document.createElement('span');
    span.textContent = text;
    meta.appendChild(span);
  }
  if (meta.childElementCount > 0) {
    aside.appendChild(createFactBlock('Released', [meta]));
  }

  const externalLinks = [
    review.anilistId && ['AniList', `https://anilist.co/anime/${review.anilistId}`],
    review.annId && ['ANN', `https://www.animenewsnetwork.com/encyclopedia/anime.php?id=${review.annId}`],
    review.wikipediaUrl && ['Wikipedia', review.wikipediaUrl],
    review.wikipediaJaUrl && ['Wikipedia (JP)', review.wikipediaJaUrl],
  ].filter(Boolean).map(([label, href]) => {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    return a;
  });
  // The links keep the .review-meta class the rest of the site styles link
  // rows with, so a link here looks the same as one on a card.
  if (externalLinks.length > 0) {
    const links = document.createElement('div');
    links.className = 'review-meta review-links';
    links.append(...externalLinks);
    aside.appendChild(createFactBlock('Reference', [links]));
  }

  const badges = createStreamingBadges(review);
  if (badges.length > 0) {
    const streaming = document.createElement('span');
    streaming.className = 'entry-streaming';
    streaming.append(...badges);
    aside.appendChild(createFactBlock('Streaming', [streaming]));
  }

  if (review.availabilityNote) {
    const note = document.createElement('div');
    note.className = 'availability-note';
    note.append(...createParagraph(review.availabilityNote).childNodes);
    aside.appendChild(note);
  }

  if (review.recommendedFor?.length || review.notFor?.length) {
    const audiences = document.createElement('div');
    audiences.className = 'audiences';
    if (review.recommendedFor?.length) {
      audiences.appendChild(createAudienceList('Worth it if', review.recommendedFor, 'audience-good'));
    }
    if (review.notFor?.length) {
      audiences.appendChild(createAudienceList('Skip it if', review.notFor, 'audience-bad'));
    }
    aside.appendChild(audiences);
  }

  if (review.tags?.length) aside.appendChild(createFactBlock('Tags', [createTagList(review.tags)]));

  const dates = document.createElement('div');
  dates.className = 'review-dates';
  dates.textContent = review.dateUpdated
    ? `Reviewed: ${review.dateReviewed} • Updated: ${review.dateUpdated}`
    : `Reviewed: ${review.dateReviewed}`;
  aside.appendChild(dates);

  return aside;
}

/**
 * The article is a three-part grid: a full-width masthead, then the prose and
 * the facts rail side by side on a wide screen. Below the breakpoint the grid
 * collapses to one column and the rail simply follows the masthead, so the
 * reading order (title, verdict, facts, prose) is the same either way.
 *
 * @param {Review} review
 */
function createReviewArticle(review) {
  const article = document.createElement('article');
  article.className = 'review-full';
  article.appendChild(createReviewHeader(review));
  article.appendChild(createReviewFacts(review));

  const body = document.createElement('div');
  body.className = 'review-body';

  for (const { key, heading, kind } of SECTIONS) {
    const section = review.sections?.[key];
    const sectionBody = kind === 'prose' ? section : section?.body;
    if (!Array.isArray(sectionBody) || sectionBody.length === 0) continue;
    body.appendChild(createSection(heading, sectionBody, kind === 'rated' ? section.ratingText : undefined));
  }

  const notes = review.sections?.notes ?? [];
  if (notes.length > 0) {
    const wrapper = document.createElement('section');
    wrapper.className = 'review-section review-notes';
    const h = document.createElement('h3');
    h.textContent = NOTES_HEADING;
    wrapper.appendChild(h);
    for (const note of notes) {
      const h4 = document.createElement('h4');
      h4.textContent = note.heading;
      wrapper.append(h4, ...note.body.map(createParagraph));
    }
    body.appendChild(wrapper);
  }

  const spoilers = createSpoilerBlock(review);
  if (spoilers) body.appendChild(spoilers);

  article.appendChild(body);
  return article;
}

/** @param {string} id */
async function renderShow(id) {
  if (dom.listView) dom.listView.hidden = true;
  if (dom.showView) dom.showView.hidden = false;
  if (!dom.showContent) return;

  const card = cards.find((c) => c.id === id);
  if (!card) {
    const missing = document.createElement('div');
    missing.className = 'loading loading-error';
    missing.textContent = `NO REVIEW CALLED "${id}"`;
    dom.showContent.replaceChildren(missing);
    document.title = 'Not found — Full Season Anime Reviews';
    return;
  }

  document.title = `${card.titleEN} — Full Season Anime Reviews`;

  const token = ++loadToken;
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = 'LOADING REVIEW...';
  dom.showContent.replaceChildren(loading);

  try {
    const review = await loadReview(id);
    if (token !== loadToken) return; // the reader navigated away mid-fetch
    dom.showContent.replaceChildren(createReviewArticle(review));
    window.scrollTo?.(0, 0);
  } catch (error) {
    if (token !== loadToken) return;
    console.error(`Error loading review "${id}":`, error);
    showError(error instanceof Error ? error.message : 'Unknown error');
  }
}

// --- Wiring ---

function render() {
  const id = currentShowId();
  return id ? renderShow(id) : Promise.resolve(renderList());
}

dom.backLink?.addEventListener('click', (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  navigate(null);
});

for (const select of [dom.decadeFilter, dom.tagFilter, dom.statusFilter]) {
  select?.addEventListener('change', () => {
    syncFilterParams();
    renderList();
  });
}
dom.sortBy?.addEventListener('change', renderList);
dom.searchInput?.addEventListener('input', renderList);
window.addEventListener('popstate', render);

async function init() {
  try {
    cards = await loadIndex();
  } catch (error) {
    console.error('Error loading the review index:', error);
    showError(error instanceof Error ? error.message : 'Unknown error');
    return;
  }
  populateFilters();
  applyFilterParams();
  await render();
}

await init();
