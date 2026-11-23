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

import { DATA_PATH, STAGE_LABELS, currentRating, gameReviewStage, lastActivity, ratingText } from './schema.js';

/**
 * @typedef {Object} Review
 * @property {string} text - paragraphs separated by a blank line
 * @property {number} ratingNumber - 0-5, the same scale as VQAR's
 * @property {string} [ratingText] - custom label; the tier's own otherwise
 * @property {string} dateReviewed - a timestamp with the reviewer's own offset
 * @property {number} [hoursPlayed] - roughly how far in this review was written
 * @property {true} [final] - the verdict once it's finished
 */

/**
 * @typedef {Object} Game
 * @property {string} id
 * @property {string} title
 * @property {string} [platform]
 * @property {Review[]} reviews - oldest first; the latest is the verdict that counts
 * @property {{ finished?: true }} [played]
 */

const TITLE = 'Very Quick Game Reviews';

/** The date exactly as written - its own offset, so an evening review stays on its day. */
const displayDate = (value) => value.slice(0, 10);

const dom = {
  intro: document.getElementById('gamesIntro'),
  backLink: document.getElementById('backLink'),
  listHeading: document.getElementById('listHeading'),
  gameReviews: document.getElementById('gameReviews'),
};

/** @param {string} text @param {string} [className] */
function showMessage(text, className = 'loading') {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  dom.gameReviews?.replaceChildren(div);
}

/** `no-cache` revalidates, so an unchanged file comes back as a 304. */
async function loadGames() {
  const response = await fetch(DATA_PATH, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status} loading the reviews`);
  const data = await response.json();
  if (!Array.isArray(data?.games)) throw new Error('Invalid review data format');
  return /** @type {Game[]} */ (data.games);
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
 * The rating/date/hours line of one review.
 * @param {Review} impression
 * @param {string} [label] - its stage, when there's more than one review
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
  rating.textContent = ratingText(impression);
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

/**
 * One review: its meta line and text. A game with a single review shows it
 * plainly; once there are more, each is labeled with its stage, and the ones
 * after the first are set off like VQAR's revisits.
 * @param {Review[]} reviews
 * @param {number} index
 */
function createReviewBlock(reviews, index) {
  const review = reviews[index];
  const label = reviews.length > 1 ? STAGE_LABELS[gameReviewStage(reviews, index)] : undefined;
  const desc = document.createElement('div');
  desc.className = 'entry-description';
  desc.append(...createParagraphs(review.text ?? ''));
  const meta = createMeta(review, label);
  if (index === 0) return [desc, meta];
  const block = document.createElement('div');
  block.className = 'entry-addendum';
  block.append(meta, desc);
  return [block];
}

/** @param {Game} game */
function createReviewArticle(game) {
  const article = document.createElement('article');
  article.id = game.id;
  // The rating that counts, for themes to key off the way they do on /vqar.
  const { ratingNumber: rating } = currentRating(game);
  if (typeof rating === 'number') article.dataset.rating = String(rating);

  const body = document.createElement('div');
  body.className = 'entry-body';

  const title = document.createElement('div');
  title.className = 'entry-title';
  const link = document.createElement('a');
  link.className = 'entry-permalink';
  link.href = `/games?game=${encodeURIComponent(game.id)}`;
  link.textContent = game.title ?? 'Untitled';
  title.appendChild(link);
  body.append(title);

  if (game.platform) {
    const facts = document.createElement('div');
    facts.className = 'entry-facts';
    facts.textContent = `Played on ${game.platform}`;
    body.append(facts);
  }

  const reviews = game.reviews ?? [];
  reviews.forEach((_, i) => body.append(...createReviewBlock(reviews, i)));

  if (game.played?.finished) {
    // On the first review's meta line, where it's always been.
    const meta = body.querySelector('.entry-meta');
    const mark = document.createElement('span');
    mark.className = 'entry-mark entry-mark-finished';
    mark.textContent = 'Finished it';
    meta?.appendChild(mark);
  }

  article.appendChild(body);
  return article;
}

/** @param {Game[]} reviews */
function render(reviews) {
  const id = new URLSearchParams(window.location.search).get('game');

  if (id) {
    if (dom.backLink) dom.backLink.hidden = false;
    if (dom.intro) dom.intro.hidden = true;
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
    render(await loadGames());
  } catch (error) {
    console.error('Error loading game reviews:', error);
    showMessage(`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`, 'loading loading-error');
  }
}

await init();
