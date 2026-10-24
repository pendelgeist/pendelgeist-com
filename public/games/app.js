/**
 * Very Quick Game Reviews (/games) - first impressions of games, a few hours
 * in, in the same spirit as VQAR but without its seasons, filters or stats.
 *
 * Every review is in one committed file (see schema.js). The list is newest
 * first; `?game=<id>` narrows the page to that one review, which is what a
 * shared link points at. Both are plain links rather than pushState routes -
 * the data is one small file that comes back as a 304, so a reload costs
 * nothing.
 */

import { DATA_PATH, currentRating, lastActivity } from './schema.js';

/**
 * @typedef {Object} Impression
 * @property {string} review - paragraphs separated by a blank line
 * @property {number} ratingNumber - 0-5, the same scale as VQAR's
 * @property {string} ratingText
 * @property {string} dateReviewed - a timestamp with the reviewer's own offset
 * @property {number} [hoursPlayed] - roughly how far in this impression was written
 */

/**
 * @typedef {Impression & {
 *   id: string,
 *   title: string,
 *   platform?: string,
 *   finished?: true,
 *   updates?: Impression[],
 * }} GameReview
 */

const TITLE = 'Very Quick Game Reviews';

/** The date exactly as written - its own offset, so an evening review stays on its day. */
const displayDate = (value) => value.slice(0, 10);

const dom = {
  infoToggle: document.getElementById('infoToggle'),
  guidelines: document.getElementById('guidelines'),
  backLink: document.getElementById('backLink'),
  listHeading: document.getElementById('listHeading'),
  gameReviews: document.getElementById('gameReviews'),
};

dom.infoToggle?.addEventListener('click', (e) => {
  e.preventDefault();
  dom.guidelines?.classList.toggle('show');
});

/** @param {string} text @param {string} [className] */
function showMessage(text, className = 'loading') {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  dom.gameReviews?.replaceChildren(div);
}

/** `no-cache` revalidates, so an unchanged file comes back as a 304. */
async function loadReviews() {
  const response = await fetch(DATA_PATH, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status} loading the reviews`);
  const data = await response.json();
  if (!Array.isArray(data?.reviews)) throw new Error('Invalid review data format');
  return /** @type {GameReview[]} */ (data.reviews);
}

/** @param {string} text */
function createParagraphs(text) {
  return text.split(/\n\s*\n/).map((para) => {
    const p = document.createElement('p');
    p.textContent = para.trim();
    return p;
  });
}

/**
 * The rating/date/hours line shared by a first impression and its updates.
 * @param {Impression} impression
 * @param {string} [label] - "Update", for an update block
 */
function createMeta(impression, label) {
  const meta = document.createElement('div');
  meta.className = 'entry-meta';

  if (label) {
    const labelEl = document.createElement('span');
    labelEl.className = 'entry-addendum-label';
    labelEl.textContent = label;
    meta.appendChild(labelEl);
  }

  const rating = document.createElement('span');
  rating.className = 'entry-rating';
  rating.textContent = impression.ratingText ?? '';
  meta.appendChild(rating);

  const published = document.createElement('span');
  published.className = 'entry-published';
  published.textContent = `Reviewed: ${impression.dateReviewed ? displayDate(impression.dateReviewed) : 'Unknown'}`;
  meta.appendChild(published);

  if (typeof impression.hoursPlayed === 'number') {
    const hours = document.createElement('span');
    hours.className = 'entry-progress';
    hours.textContent = `~${impression.hoursPlayed} hr${impression.hoursPlayed === 1 ? '' : 's'} in`;
    meta.appendChild(hours);
  }

  return meta;
}

/** @param {GameReview} r */
function createReviewArticle(r) {
  const article = document.createElement('article');
  article.id = r.id;
  // The rating that counts, for themes to key off the way they do on /vqar.
  const { ratingNumber: rating } = currentRating(r);
  if (typeof rating === 'number') article.dataset.rating = String(rating);

  const body = document.createElement('div');
  body.className = 'entry-body';

  const title = document.createElement('div');
  title.className = 'entry-title';
  const link = document.createElement('a');
  link.className = 'entry-permalink';
  link.href = `/games?game=${encodeURIComponent(r.id)}`;
  link.textContent = r.title ?? 'Untitled';
  title.appendChild(link);

  const facts = document.createElement('div');
  facts.className = 'entry-facts';
  facts.textContent = r.platform ? `Played on ${r.platform}` : '';

  const desc = document.createElement('div');
  desc.className = 'entry-description';
  desc.append(...createParagraphs(r.review ?? ''));

  const meta = createMeta(r);
  if (r.finished) {
    const mark = document.createElement('span');
    mark.className = 'entry-mark entry-mark-finished';
    mark.textContent = 'Finished it';
    meta.appendChild(mark);
  }

  body.append(title);
  if (r.platform) body.append(facts);
  body.append(desc, meta);

  for (const update of r.updates ?? []) {
    const block = document.createElement('div');
    block.className = 'entry-addendum';
    block.append(createMeta(update, 'Update'));
    const updateDesc = document.createElement('div');
    updateDesc.className = 'entry-description';
    updateDesc.append(...createParagraphs(update.review ?? ''));
    block.append(updateDesc);
    body.appendChild(block);
  }

  article.appendChild(body);
  return article;
}

/** @param {GameReview[]} reviews */
function render(reviews) {
  const id = new URLSearchParams(window.location.search).get('game');

  if (id) {
    if (dom.backLink) dom.backLink.hidden = false;
    if (dom.listHeading) dom.listHeading.hidden = true;
    const review = reviews.find((r) => r.id === id);
    if (!review) {
      document.title = `Not found — ${TITLE}`;
      showMessage(`NO REVIEW CALLED "${id}"`, 'loading loading-error');
      return;
    }
    document.title = `${review.title} — ${TITLE}`;
    dom.gameReviews?.replaceChildren(createReviewArticle(review));
    return;
  }

  if (reviews.length === 0) {
    showMessage('NO REVIEWS YET');
    return;
  }
  const sorted = [...reviews].sort((a, b) => lastActivity(b) - lastActivity(a));
  dom.gameReviews?.replaceChildren(...sorted.map(createReviewArticle));
}

async function init() {
  try {
    render(await loadReviews());
  } catch (error) {
    console.error('Error loading game reviews:', error);
    showMessage(`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`, 'loading loading-error');
  }
}

await init();
