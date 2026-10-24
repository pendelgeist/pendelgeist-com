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

/**
 * A game gets played over weeks, so a review can grow `updates` - later
 * impressions, oldest first, each with its own rating. The latest one is the
 * verdict that counts.
 *
 * @param {{ updates?: object[] }} review
 * @returns {object|undefined}
 */
export function latestUpdate(review) {
  const updates = review.updates ?? [];
  return updates[updates.length - 1];
}

/**
 * The rating that counts: the latest update's once there is one, else the
 * first impression's.
 * @param {{ ratingNumber?: number, ratingText?: string, updates?: object[] }} review
 * @returns {{ ratingNumber?: number, ratingText?: string }}
 */
export function currentRating(review) {
  const latest = latestUpdate(review) ?? review;
  return { ratingNumber: latest.ratingNumber, ratingText: latest.ratingText };
}

/**
 * When a review last changed, for "most recent first" ordering - a fresh
 * update bumps an old game back to the top.
 * @param {{ dateReviewed?: string, updates?: { dateReviewed?: string }[] }} review
 */
export function lastActivity(review) {
  return Date.parse(latestUpdate(review)?.dateReviewed ?? review.dateReviewed ?? '') || 0;
}
