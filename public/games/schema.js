/**
 * The shape of a Very Quick Game Review, shared by the page that renders them
 * (/games/app.js) and the validator (scripts/validateGameReviews.js) so the
 * two can't drift.
 *
 * Deliberately much smaller than VQAR: there's no season to organize by and
 * not many of these, so every review lives in one file,
 * public/games/data.json, with no generated index.
 */

/**
 * Default flavor text for each `ratingNumber`. Same 0-5 scale as VQAR's, with
 * the episode jokes swapped for game ones. A review can write its own
 * `ratingText`; it still needs the tier's number.
 */
export const RATING_NUMBER_LABELS = {
  0: 'Dead, El-Hazard 2 Over This',
  1: 'Never, Please No More Like This Ever',
  2: 'Trash, for Second Screen Only',
  3: 'Meh, Might Load the Save Again',
  4: "Yeah, Here's Hoping",
  5: 'Peak, Nice Game Broh',
};

export const DATA_PATH = '/games/data.json';

/** Every key a game may carry. */
export const GAME_KEYS = ['id', 'title', 'platform', 'reviews', 'played'];

/** Every key one of a game's `reviews` may carry. */
export const GAME_REVIEW_KEYS = ['hoursPlayed', 'final', 'ratingNumber', 'ratingText', 'text', 'dateReviewed'];

/** Every key a game's `played` object may carry. */
export const PLAYED_KEYS = ['finished'];

/**
 * What each review on a game is, derived from where it sits rather than
 * stored: the first is the first impression, a `final: true` one (always
 * last) is the verdict once it's finished, and anything between is an update.
 */
export const STAGE_LABELS = { first: 'First impression', update: 'Update', final: 'Final' };

/**
 * @param {{ final?: boolean }[]} reviews - oldest first
 * @param {number} index
 * @returns {'first' | 'update' | 'final'}
 */
export function gameReviewStage(reviews, index) {
  if (reviews[index]?.final === true) return 'final';
  return index === 0 ? 'first' : 'update';
}

/**
 * A game gets played over weeks, so it gathers `reviews` - oldest first, each
 * with its own rating. The latest one is the verdict that counts.
 * @param {{ reviews?: object[] }} game
 * @returns {any}
 */
export function latestReview(game) {
  const reviews = game.reviews ?? [];
  return reviews[reviews.length - 1];
}

/**
 * A review's rating label: its own `ratingText` when it wrote one, else its
 * tier's default.
 * @param {{ ratingNumber?: number, ratingText?: string }} review
 */
export function ratingText(review) {
  return review?.ratingText ?? RATING_NUMBER_LABELS[/** @type {number} */ (review?.ratingNumber)] ?? '';
}

/**
 * The rating that counts: the latest review's.
 * @param {{ reviews?: object[] }} game
 * @returns {{ ratingNumber?: number, ratingText: string }}
 */
export function currentRating(game) {
  const latest = latestReview(game);
  return { ratingNumber: latest?.ratingNumber, ratingText: ratingText(latest) };
}

/**
 * When a game last got a review, for "most recent first" ordering - a fresh
 * one bumps an old game back to the top.
 * @param {{ reviews?: { dateReviewed?: string }[] }} game
 */
export function lastActivity(game) {
  return Date.parse(latestReview(game)?.dateReviewed ?? '') || 0;
}
