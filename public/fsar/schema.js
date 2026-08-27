/**
 * The shape of a Full Season Anime Review, shared by the page that renders
 * them (/fsar/app.js), the index builder (scripts/build-fsar-index.js), and
 * the validator (scripts/validateFsarReview.js) so the three can't drift.
 *
 * Unlike VQAR - which is organized around the season a show aired in - these
 * are individual, long-form writeups of shows from any era, one file each
 * under public/fsar/data/reviews/.
 */

/**
 * A review's writing status. A "wip" review is a draft in progress: it still
 * renders and is still linkable, it just wears a badge saying so, since these
 * take several passes before they settle.
 * @type {Record<string, string>}
 */
export const STATUSES = {
  wip: 'In Progress',
  done: 'Finished',
};

/** Release formats. Not every show here is a 12-episode TV season. */
export const FORMATS = ['TV', 'OVA', 'ONA', 'Movie', 'Special'];

/**
 * The fixed core sections, in render order. All are optional per review, but
 * a review can't invent new ones - keeping the layout identical across every
 * writeup is the point, so a linked friend always finds the same thing in the
 * same place. Anything that doesn't fit goes in `notes` (or `spoilers`).
 *
 * - `prose` sections are a plain array of paragraphs.
 * - `rated` sections are { ratingText?, body: [paragraphs] }, since an OP/ED
 *   usually wants a verdict of its own alongside the description.
 */
export const SECTIONS = [
  { key: 'story', heading: 'Overall Story', kind: 'prose' },
  { key: 'production', heading: 'Overall Production', kind: 'prose' },
  { key: 'op', heading: 'Opening', kind: 'rated' },
  { key: 'ed', heading: 'Ending', kind: 'rated' },
];

/** Free-form section lists, rendered after the fixed ones. */
export const NOTES_HEADING = 'Of Particular Note';
export const SPOILERS_HEADING = 'Spoilers';

/**
 * The fields the generated index.json carries per review - i.e. everything
 * except the review body itself. Expressed as the keys to *drop* rather than
 * the ones to keep, so a new card-level field needs no builder change.
 */
export const BODY_KEYS = ['sections'];

/** @param {number} year */
export function decadeOf(year) {
  return Math.floor(year / 10) * 10;
}

/** @param {number} decade */
export function decadeLabel(decade) {
  return `${decade}s`;
}

/**
 * How a show's release is labeled on a card: the hand-written `airedLabel`
 * when there is one ("Summer 2025", "1988-89"), otherwise just the year.
 * @param {{ year?: number, airedLabel?: string }} review
 */
export function airedText(review) {
  return review.airedLabel || (review.year ? String(review.year) : '');
}

/**
 * "12 episodes" / "8 of 26 episodes" / "" - episode counts are optional, since
 * for an older show they're sometimes not worth tracking (or not known).
 * @param {{ episodeCount?: number|null, episodesWatched?: number|null }} review
 */
export function episodesText(review) {
  const { episodeCount, episodesWatched } = review;
  if (!episodeCount && !episodesWatched) return '';
  if (!episodeCount) return `${episodesWatched} episodes watched`;
  if (!episodesWatched || episodesWatched === episodeCount) {
    return `${episodeCount} episode${episodeCount === 1 ? '' : 's'}`;
  }
  return `${episodesWatched} of ${episodeCount} episodes`;
}
