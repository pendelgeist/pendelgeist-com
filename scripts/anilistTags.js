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

/** Searches per query - each is a full Media lookup, so they're batched smaller than BATCH_SIZE. */
export const SEARCH_BATCH_SIZE = 12;

const MEDIA_FIELDS = `id
    title { romaji english native }
    season
    seasonYear
    format
    genres
    tags { name rank isGeneralSpoiler isMediaSpoiler isAdult }
    studios(isMain: true) { nodes { name } }`;

/**
 * A GraphQL alias for one review: its season and position, so a saved
 * response can be matched back to the review it searched for.
 * @param {string} seasonId
 * @param {number} index - position in that season's `reviewed`
 */
export function searchAlias(seasonId, index) {
  return `${String(seasonId).replace(/[^A-Za-z0-9]/g, '_')}__${index}`;
}

/**
 * What a review's title is searched as: without a trailing "(2026)"-style
 * year, which the reviews use to tell remakes apart but AniList titles don't
 * carry.
 * @param {string} title
 */
export function searchText(title) {
  return title.replace(/\s*\(\d{4}\)\s*$/, '').trim();
}

/** `fall-2026` -> `{ season: 'FALL', seasonYear: 2026 }`, or null for an id that isn't one. */
export function seasonFilter(seasonId) {
  const match = /^(winter|spring|summer|fall)-(\d{4})$/.exec(String(seasonId));
  return match ? { season: match[1].toUpperCase(), seasonYear: Number(match[2]) } : null;
}

/**
 * Search queries for reviews with no `anilistId`, SEARCH_BATCH_SIZE per
 * query, each search narrowed to the review's own AniList season when its id
 * names one - the top hit for a generic English title is far more often the
 * right show that way.
 * @param {{ seasonId: string, index: number, title: string }[]} entries
 * @param {{ anySeason?: boolean }} [options] - search every season, for a show
 *   the season-narrowed search found nothing for
 * @returns {string[]}
 */
export function searchQueries(entries, { anySeason = false } = {}) {
  const queries = [];
  for (let i = 0; i < entries.length; i += SEARCH_BATCH_SIZE) {
    const lines = entries.slice(i, i + SEARCH_BATCH_SIZE).map(({ seasonId, index, title }) => {
      const filter = anySeason ? null : seasonFilter(seasonId);
      const args = [`search: ${JSON.stringify(searchText(title))}`, 'type: ANIME'];
      if (filter) args.push(`season: ${filter.season}`, `seasonYear: ${filter.seasonYear}`);
      // Page(perPage: 1) rather than Media(...): a Media lookup that finds
      // nothing is a 404 error, and AniList then drops the results of every
      // other search in the same query; an empty Page is just an empty list.
      return `  ${searchAlias(seasonId, index)}: Page(perPage: 1) { media(${args.join(', ')}) { ...Show } }`;
    });
    queries.push(`{\n${lines.join('\n')}\n}\n\nfragment Show on Media {\n  ${MEDIA_FIELDS.replace(/\n {4}/g, '\n  ')}\n}`);
  }
  return queries;
}

/**
 * Pulls the per-review results out of saved search responses (from
 * searchQueries), keyed by alias. A search AniList found nothing for comes
 * back as an empty Page - or, in the older Media(...) form, as null with a
 * "Not Found." error alongside the data. Either is an answer, not a
 * failure, so it maps to null here rather than throwing.
 * @param {any[]} responses - parsed JSON, a whole response or just its `data`
 * @returns {Map<string, any|null>}
 */
export function searchResultsFromResponses(responses) {
  const results = new Map();
  for (const response of responses) {
    const notFound = (response?.errors ?? []).every(e => /not found/i.test(e.message ?? ''));
    if (!notFound) throw new Error(`a saved search response has errors: ${response.errors.map(e => e.message).join('; ')}`);
    const data = response?.data ?? response;
    if (!data || typeof data !== 'object' || data.Page) throw new Error('a saved response has no search results - was it run with --print-search-queries?');
    // A search is a Page (its first hit, if any); responses from the older
    // Media(...) form are taken as-is.
    for (const [alias, value] of Object.entries(data)) {
      results.set(alias, (value && 'media' in value ? value.media?.[0] : value) ?? null);
    }
  }
  return results;
}

/**
 * Links reviews that have no `anilistId` to their search results: the id,
 * the native title as `titleJP` (only where there isn't one), and the
 * generated `anilist` object. A result whose titles don't look like the
 * review's is held back as `unsure` rather than applied - a search's top hit
 * is a guess - unless its alias is listed in `accept`.
 * @param {{ id: string, reviewed?: any[] }} season
 * @param {Map<string, any|null>} results - from searchResultsFromResponses
 * @param {{ accept?: Set<string>, titlesLikelyMatch: (title: string, titles: string[]) => boolean }} options
 */
export function applySearchResults(season, results, { accept = new Set(), titlesLikelyMatch }) {
  const linked = [];
  const unsure = [];
  const notFound = [];
  const reviewed = (season.reviewed ?? []).map((review, index) => {
    const alias = searchAlias(season.id, index);
    if (review.anilistId || !results.has(alias)) return review;
    const media = results.get(alias);
    if (!media) {
      notFound.push({ alias, title: review.titleEN });
      return review;
    }
    const titles = [media.title?.romaji, media.title?.english, media.title?.native].filter(Boolean);
    if (!titlesLikelyMatch(review.titleEN, titles) && !accept.has(alias)) {
      unsure.push({ alias, title: review.titleEN, anilistId: media.id, anilistTitles: titles });
      return review;
    }
    linked.push(review.titleEN);
    const next = { ...review, anilistId: media.id, anilist: anilistFields(media) };
    if (!review.titleJP && media.title?.native) next.titleJP = media.title.native;
    return next;
  });
  return { reviewed, linked, unsure, notFound };
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
