/**
 * A show's reviews, and what each one is.
 *
 * A show carries every review written about it in `reviews`, oldest first.
 * Each review records how much of the show it's based on - `episodes`, the
 * episodes watched when it was written, or `final: true` for a verdict on the
 * whole run - and its **stage** is derived from that, never stored:
 *
 * - **first impression**: `episodes: 1`, the episode-1 review a lineup is
 *   built on. At most one, and always first.
 * - **final**: `final: true`, the verdict once the show is finished. Always last.
 * - **revisit**: any later review that isn't final.
 * - **review**: a first review with no episode-1 basis - a backfill written
 *   after watching a stretch of the show, or one whose basis wasn't recorded.
 *
 * The latest review is the show's current verdict (see effectiveRatingNumber
 * in rating.js). Shared by /vqar, /anime-stat-sheet, src/schema.js and the
 * validator, so the rules can't drift between them.
 */

/** @typedef {'first' | 'revisit' | 'final' | 'review'} Stage */

/**
 * @typedef {Object} Review
 * @property {number} [episodes] - episodes watched when it was written
 * @property {true} [final] - a verdict on the whole run
 * @property {number} ratingNumber - 0-5
 * @property {string} [ratingText] - custom label; falls back to the tier's (see ratingText in rating.js)
 * @property {string} [text]
 * @property {string} dateReviewed - an Eastern moment (see public/dates.js)
 */

/** Every stage, in the order a show goes through them; also each one's label. */
export const STAGE_LABELS = {
  first: 'First impression',
  review: 'Review',
  revisit: 'Revisit',
  final: 'Final',
};

/**
 * @param {{ reviews?: Review[] }} show
 * @returns {Review[]}
 */
export function reviewsOf(show) {
  return Array.isArray(show?.reviews) ? show.reviews : [];
}

/**
 * The stage of a show's review at `index` (see the module comment).
 * @param {Review[]} reviews - the show's reviews, oldest first
 * @param {number} index
 * @returns {Stage}
 */
export function reviewStage(reviews, index) {
  const review = reviews[index];
  if (review.final === true) return 'final';
  if (review.episodes === 1) return 'first';
  return index > 0 ? 'revisit' : 'review';
}

/**
 * The show's current verdict: its latest review.
 * @param {{ reviews?: Review[] }} show
 * @returns {Review|undefined}
 */
export function currentReview(show) {
  const reviews = reviewsOf(show);
  return reviews[reviews.length - 1];
}

/**
 * The episode-1 review, if the show has one.
 * @param {{ reviews?: Review[] }} show
 * @returns {Review|undefined}
 */
export function firstImpression(show) {
  const [first] = reviewsOf(show);
  return first?.episodes === 1 ? first : undefined;
}

/**
 * The reviews after the first one - the revisits and final verdict that
 * followed it.
 * @param {{ reviews?: Review[] }} show
 * @returns {Review[]}
 */
export function laterReviews(show) {
  return reviewsOf(show).slice(1);
}

/**
 * How a show's rating moved after its first impression: the episode-1 rating
 * and the latest one, once something has been written since. Null for a show
 * with no first impression (a backfill) or nothing after it.
 * @param {{ reviews?: Review[] }} show
 * @returns {{ before: number, after: number } | null}
 */
export function ratingShift(show) {
  const first = firstImpression(show);
  const latest = currentReview(show);
  if (!first || latest === first) return null;
  if (typeof first.ratingNumber !== 'number' || typeof latest?.ratingNumber !== 'number') return null;
  return { before: first.ratingNumber, after: latest.ratingNumber };
}
