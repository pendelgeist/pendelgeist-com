import { STREAMING_URL_FIELDS } from '../streaming.js';

/**
 * The `toReview` ("To Be Reviewed") and `notReviewing` ("Not Reviewing") lists in
 * a lineup file. An entry is either a plain title string, or an object that adds
 * optional pre-season notes to the title:
 *
 *   toReview:     { title, streaming?, premieres?, availableNow?, <service>Url? }
 *   notReviewing: { title, reason?, streaming?, <service>Url? }
 *
 * Both shapes can sit side by side in one list, so every consumer goes through
 * the helpers here rather than assuming a string. `streaming` takes the same
 * service keys as a show's (see public/streaming.js), `premieres` is the first
 * episode's day (`YYYY-MM-DD`), `availableNow: true` says it's already out (instead of a date),
 * and a `crunchyrollUrl`-style field (the same ones a review takes) makes that service's
 * badge a link.
 * Shared by /vqar, /anime-stat-sheet, src/schema.js and the scripts, so the shape
 * can't drift between them.
 */

/**
 * @typedef {Object} ListEntryDetails
 * @property {string} title
 * @property {string[]} [streaming] - service keys, as on a review
 * @property {string} [premieres] - toReview only, the first episode's day, `YYYY-MM-DD`
 * @property {boolean} [availableNow] - toReview only, true when the show is already out; used instead of premieres
 * @property {string} [reason] - notReviewing only, why it isn't being reviewed
 * @property {string} [crunchyrollUrl] - and hidiveUrl, netflixUrl, huluUrl, primeUrl, youtubeUrl: direct link, makes that badge clickable
 */

/** @typedef {string | ListEntryDetails} ListEntry */

const URL_KEYS = Object.values(STREAMING_URL_FIELDS);

/** Keys an entry object may carry, per list. */
export const LIST_ENTRY_KEYS = {
  toReview: ['title', 'streaming', 'premieres', 'availableNow', ...URL_KEYS],
  notReviewing: ['title', 'reason', 'streaming', ...URL_KEYS],
};

/**
 * @param {ListEntry|null|undefined} entry
 * @returns {string|undefined} the show's title, whichever shape the entry has
 */
export function entryTitle(entry) {
  return typeof entry === 'string' ? entry : entry?.title;
}

/**
 * Always the object shape, so callers read `.title`, `.streaming` and so on
 * without checking which form was committed.
 * @param {ListEntry} entry
 * @returns {ListEntryDetails}
 */
export function normalizeEntry(entry) {
  return typeof entry === 'string' ? { title: entry } : { ...entry };
}
