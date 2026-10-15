import { STREAMING_URL_FIELDS } from '../streaming.js';

/**
 * The `pending` ("To Be Reviewed") and `skipped` ("Not Reviewing") lists in a
 * season file. An entry is either a plain title string, or an object that adds
 * optional pre-season notes to the title:
 *
 *   pending: { title, streaming?, firstEpisode?, availableNow?, <service>Url? }
 *   skipped: { title, reason?, streaming?, <service>Url? }
 *
 * Both shapes can sit side by side in one list, so every consumer goes through
 * the helpers here rather than assuming a string. `streaming` takes the same
 * service keys as a review's (see public/streaming.js), `firstEpisode` is a
 * `YYYY-MM-DD` date, `availableNow: true` says it's already out (instead of a date),
 * and a `crunchyrollUrl`-style field (the same ones a review takes) makes that service's
 * badge a link.
 * Shared by /vqar, /vqar-stats, src/schema.js and the scripts, so the shape
 * can't drift between them.
 */

/**
 * @typedef {Object} ListEntryDetails
 * @property {string} title
 * @property {string[]} [streaming] - service keys, as on a review
 * @property {string} [firstEpisode] - pending only, `YYYY-MM-DD`
 * @property {boolean} [availableNow] - pending only, true when the show is already out; used instead of firstEpisode
 * @property {string} [reason] - skipped only, why it isn't being reviewed
 * @property {string} [crunchyrollUrl] - and hidiveUrl, netflixUrl, huluUrl, primeUrl, youtubeUrl: direct link, makes that badge clickable
 */

/** @typedef {string | ListEntryDetails} ListEntry */

const URL_KEYS = Object.values(STREAMING_URL_FIELDS);

/** Keys an entry object may carry, per list. */
export const LIST_ENTRY_KEYS = {
  pending: ['title', 'streaming', 'firstEpisode', 'availableNow', ...URL_KEYS],
  skipped: ['title', 'reason', 'streaming', ...URL_KEYS],
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
