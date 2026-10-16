/**
 * The testable core of fetch-anilist-tags.js: turning AniList media into the
 * `anilist` object a review carries, batching the id lookups, and writing a
 * season file back without disturbing anything but its `reviewed` block.
 *
 * A review's `anilist` object is generated - it's owned by this script and
 * overwritten wholesale on every run, so never hand-edit it. Everything else
 * on the review stays hand-maintained and untouched.
 */

/** Tags AniList ranks below this (a 0-100 relevance score) are noise. */
export const MIN_TAG_RANK = 60;

/** AniList's `Page` caps perPage at 50. */
export const BATCH_SIZE = 50;

export const MEDIA_BY_IDS_QUERY = `#graphql
  query($ids: [Int]) {
    Page(perPage: ${BATCH_SIZE}) {
      media(id_in: $ids, type: ANIME) {
        id
        format
        genres
        tags { name rank isGeneralSpoiler isMediaSpoiler isAdult }
        studios(isMain: true) { nodes { name } }
      }
    }
  }
`;

/**
 * @typedef {Object} AniListFields
 * @property {string} [format] - AniList's format enum, e.g. TV, TV_SHORT, ONA, MOVIE
 * @property {string[]} genres
 * @property {string[]} tags - non-spoiler, non-adult tags ranked at least MIN_TAG_RANK, most relevant first
 * @property {string[]} studios - main animation studios only
 */

/**
 * @param {any} media - one AniList `Media` from MEDIA_BY_IDS_QUERY
 * @returns {AniListFields}
 */
export function anilistFields(media) {
  const tags = (media.tags ?? [])
    .filter(t => !t.isGeneralSpoiler && !t.isMediaSpoiler && !t.isAdult && (t.rank ?? 0) >= MIN_TAG_RANK)
    .sort((a, b) => b.rank - a.rank)
    .map(t => t.name);
  const fields = {
    genres: [...(media.genres ?? [])],
    tags,
    studios: (media.studios?.nodes ?? []).map(n => n.name).filter(Boolean),
  };
  return media.format ? { format: media.format, ...fields } : fields;
}

/**
 * Looks up every id, BATCH_SIZE at a time, pausing between batches.
 * @param {number[]} ids
 * @param {{ request: (query: string, variables: object) => Promise<any>, delayMs?: number }} options
 * @returns {Promise<Map<number, any>>} media by id; an id AniList doesn't return is absent
 */
export async function fetchMediaByIds(ids, { request, delayMs = 0 }) {
  const unique = [...new Set(ids)];
  const byId = new Map();
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    if (i > 0 && delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    const data = await request(MEDIA_BY_IDS_QUERY, { ids: unique.slice(i, i + BATCH_SIZE) });
    for (const media of data?.Page?.media ?? []) byId.set(media.id, media);
  }
  return byId;
}

/**
 * Collects media from saved AniList responses - for `--from`, when the
 * queries were run by hand (e.g. in https://anilist.co/graphiql) rather than
 * by this script. Takes a whole response (`{ data: { Page } }`) or just its
 * `data` (`{ Page }`).
 * @param {any[]} responses - parsed JSON, one per saved response
 * @returns {Map<number, any>}
 */
export function mediaFromResponses(responses) {
  const byId = new Map();
  for (const response of responses) {
    if (response?.errors) throw new Error(`a saved response has errors: ${response.errors.map(e => e.message).join('; ')}`);
    const media = (response?.data ?? response)?.Page?.media;
    if (!Array.isArray(media)) throw new Error('a saved response has no Page.media - was it run with the query this script prints?');
    for (const m of media) byId.set(m.id, m);
  }
  return byId;
}

/**
 * Sets each review's `anilist` from the fetched media. A review AniList didn't
 * return keeps whatever it had, so a lookup hiccup never erases data.
 * @param {{ reviewed?: any[] }} season
 * @param {Map<number, any>} mediaById
 * @returns {{ reviewed: any[], updated: string[], unchanged: number, noId: string[], notFound: string[] }}
 */
export function applyAnilistFields(season, mediaById) {
  const updated = [];
  const noId = [];
  const notFound = [];
  let unchanged = 0;

  const reviewed = (season.reviewed ?? []).map(review => {
    if (!review.anilistId) {
      noId.push(review.titleEN);
      return review;
    }
    const media = mediaById.get(review.anilistId);
    if (!media) {
      notFound.push(review.titleEN);
      return review;
    }
    const anilist = anilistFields(media);
    if (JSON.stringify(anilist) === JSON.stringify(review.anilist)) {
      unchanged++;
      return review;
    }
    updated.push(review.titleEN);
    return { ...review, anilist };
  });

  return { reviewed, updated, unchanged, noId, notFound };
}

/**
 * Swaps a season file's `reviewed` array for a new one, leaving every other
 * byte as it was - the files don't all share one formatting (fall-2026's
 * pending list is one compact object per line), so re-serializing the whole
 * file would reformat lines this script has no business touching.
 * @param {string} raw - the season file's text
 * @param {any[]} reviewed
 */
export function replaceReviewed(raw, reviewed) {
  const marker = '\n  "reviewed": ';
  const start = raw.indexOf(marker);
  if (start === -1) throw new Error('no top-level "reviewed" key');
  const valueStart = start + marker.length;
  const rest = raw.slice(valueStart);
  // The value ends where the next top-level key (two-space indent) or the
  // closing brace begins, less the comma separating them.
  const next = rest.search(/\n {2}"|\n\}/);
  if (next === -1) throw new Error('could not find the end of "reviewed"');
  const valueEnd = valueStart + next - (rest[next - 1] === ',' ? 1 : 0);
  const body = JSON.stringify(reviewed, null, 2).replace(/\n/g, '\n  ');
  return raw.slice(0, valueStart) + body + raw.slice(valueEnd);
}
