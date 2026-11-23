/**
 * When a show first aired: its `aired` object, `{ season, year }` from
 * AniList, or just `{ year }` when AniList has no season for it (and missing
 * when it has neither, or the show has no AniList entry). Filled in by
 * scripts/fetch-anilist-tags.js only where it's missing, so a hand fix sticks.
 *
 * Mostly a show airs in the lineup it was reviewed in; `aired` matters for the
 * ones that didn't - an older show picked up mid-season, say.
 * Shared by /vqar, src/schema.js and the validator.
 */

import { isLineup } from './seasons.js';

/** AniList's seasons, lowercased, in the order they fall in a year. */
export const AIRED_SEASONS = ['winter', 'spring', 'summer', 'fall'];

/**
 * How to show when something aired: "Spring 2010", or "2026" with no season.
 * @param {{ season?: string, year?: number }|undefined} aired
 * @returns {string}
 */
export function airedLabel(aired) {
  if (!aired || !Number.isInteger(aired.year)) return '';
  if (!aired.season) return String(aired.year);
  return `${aired.season[0].toUpperCase()}${aired.season.slice(1)} ${aired.year}`;
}

/**
 * The lineup id an aired season would have (`spring-2010`), or null when it
 * has no season.
 * @param {{ season?: string, year?: number }|undefined} aired
 * @returns {string|null}
 */
export function airedSeasonId(aired) {
  return aired?.season && Number.isInteger(aired.year) ? `${aired.season}-${aired.year}` : null;
}

/**
 * Whether a show's airing is worth pointing out where it's listed: it has
 * one, and it isn't the lineup the show sits in. A lineup show that aired in
 * that lineup's season says nothing the page doesn't already.
 * @param {{ aired?: { season?: string, year?: number } }} show
 * @param {string} seasonId - the season file the show is in
 */
export function airedDiffers(show, seasonId) {
  if (!airedLabel(show.aired)) return false;
  return !isLineup(seasonId) || airedSeasonId(show.aired) !== seasonId;
}
