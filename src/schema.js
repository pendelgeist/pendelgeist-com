/**
 * GraphQL schema and resolvers for the seasonal anime data. This mirrors the
 * index + per-season file shapes documented in the README and consumed by
 * public/vqar/app.js, but reads and reshapes them server-side instead.
 *
 * The data is committed to this repo and served as a static asset, so the
 * resolvers read it through the Worker's ASSETS binding rather than fetching it
 * over the network - no round trip, and no cache to lag behind a deploy.
 */

import { VQAR_INDEX_PATH } from '../public/vqar/data-paths.js';
import { STREAMING_URL_FIELDS } from '../public/streaming.js';
import { entryTitle, normalizeEntry } from '../public/vqar/list-entries.js';
import { isLikedOpEd, opEdNumbers } from '../public/vqar/oped.js';
import { isLineup } from '../public/vqar/seasons.js';
import { reviewStage, reviewsOf } from '../public/vqar/reviews.js';
import { effectiveRatingNumber, currentRatingText, ratingText } from '../public/vqar/rating.js';
import { recommend, buildAniListQuery, parseAniListResponse, candidateIds, MAX_LIKED, MAX_PICKS } from './recommend.js';

export const typeDefs = `#graphql
"""One review of a show. Its stage is derived from what it was based on."""
type Review {
  """first (a first impression, written after episode 1), revisit (a later review),
  final (the verdict on the whole run, once it's finished), or review (a first
  review with no episode-1 basis, like one written after watching a stretch of it)."""
  stage: String!
  "How many episodes it was based on. Null when not recorded."
  episodes: Int
  "True for the verdict on the whole run; it's always the last review."
  final: Boolean
  ratingNumber: Float
  "The rating label: the review's own text, or its tier's default when it didn't write one."
  ratingText: String
  text: String
  "When it was written, a timestamp in the reviewer's Eastern offset."
  dateReviewed: String
}

"""When a show first aired, from AniList."""
type Aired {
  "winter, spring, summer or fall. Null when AniList has only a year."
  season: String
  year: Int!
}

"""A show's AniList metadata, generated from its anilistId by scripts/fetch-anilist-tags.js."""
type AniListInfo {
  "AniList's format, e.g. TV, TV_SHORT, ONA, MOVIE."
  format: String
  genres: [String!]!
  "Non-spoiler, non-adult tags AniList ranks at least 60% relevant, most relevant first."
  tags: [String!]!
  "Main animation studios."
  studios: [String!]!
}

"""A show, with every review written about it."""
type Show {
  titleEN: String!
  titleJP: String
  "When it first aired, from AniList. Null when AniList has no date for it."
  aired: Aired
  "Every review of it, oldest first; the latest is the current verdict."
  reviews: [Review!]!
  "The current rating: the latest review's."
  ratingNumber: Float
  "The current rating's label: the latest review's own text, or its tier's default."
  ratingText: String
  "True when an opening was marked as one worth remembering."
  op: Boolean
  "The numbers of the openings marked as worth remembering (a season can have several); null when none were numbered."
  opNumbers: [Int!]
  "True when an ending was marked as one worth remembering."
  ed: Boolean
  "The numbers of the endings marked as worth remembering; null when none were numbered."
  edNumbers: [Int!]
  "The id of the season file the show is listed in."
  season: ID!
  "The display name of that season."
  seasonName: String!
  "Optional AniList media id, for linking out to the show's AniList page."
  anilistId: Int
  "Format, genres, tags and studios from AniList; null when the show has no anilistId."
  anilist: AniListInfo
  "Optional Anime News Network encyclopedia id, for linking out to the show's ANN page."
  annId: Int
  "Optional English Wikipedia article URL. Stored as a URL rather than an id, since Wikipedia keys on the article title."
  wikipediaUrl: String
  "Optional Japanese Wikipedia article URL, usually the more detailed of the two on staff and broadcast history."
  wikipediaJaUrl: String
  "Optional list of streaming service keys the show is available on (e.g. crunchyroll, netflix)."
  streaming: [String!]
  "Optional direct link to the show's Crunchyroll page; makes the CR streaming badge clickable."
  crunchyrollUrl: String
  "Optional direct link to the show's HIDIVE page; makes the HD streaming badge clickable."
  hidiveUrl: String
  "Optional direct link to the show's Netflix page; makes the NF streaming badge clickable."
  netflixUrl: String
  "Optional direct link to the show's Hulu page; makes the HU streaming badge clickable."
  huluUrl: String
  "Optional direct link to the show's Prime Video page; makes the PV streaming badge clickable."
  primeUrl: String
  "Optional direct link to the show's YouTube channel or playlist; makes the YT streaming badge clickable."
  youtubeUrl: String
  "When the show was watched: the first episode, the last, the last episode reached, and whether it got finished. Null when not recorded."
  watched: Watched
}

"""When a show was watched, from the first episode to the last."""
type Watched {
  "The day the first episode was watched, like 2026-04-01."
  from: String!
  "The day the last episode was watched. Null when the same as from, or not recorded."
  to: String
  "Which season the episode is in, for a show that ran across several. Null otherwise."
  season: Int
  "The last episode reached, for a show that wasn't finished (12.5 for a special). Null when not recorded."
  episode: Float
  "True when the whole thing was watched - independent of any review or rating."
  finished: Boolean
}

"""A show in a lineup still waiting to be reviewed, with whatever pre-season notes were committed for it."""
type ToReviewShow {
  title: String!
  "Streaming service keys the show is on (e.g. crunchyroll, netflix); empty when none are recorded."
  streaming: [String!]!
  "Optional day the first episode premieres, YYYY-MM-DD."
  premieres: String
  "True when the show is already out (used in place of premieres)."
  availableNow: Boolean!
  "Optional direct link to the show's Crunchyroll page."
  crunchyrollUrl: String
  "Optional direct link to the show's HIDIVE page."
  hidiveUrl: String
  "Optional direct link to the show's Netflix page."
  netflixUrl: String
  "Optional direct link to the show's Hulu page."
  huluUrl: String
  "Optional direct link to the show's Prime Video page."
  primeUrl: String
  "Optional direct link to the show's YouTube channel or playlist."
  youtubeUrl: String
}

"""A show in a lineup that won't be reviewed, with whatever notes were committed about why."""
type NotReviewingShow {
  title: String!
  "Optional short reason it isn't being reviewed."
  reason: String
  "Streaming service keys the show is on (e.g. crunchyroll, netflix); empty when none are recorded."
  streaming: [String!]!
  "Optional direct link to the show's Crunchyroll page."
  crunchyrollUrl: String
  "Optional direct link to the show's HIDIVE page."
  hidiveUrl: String
  "Optional direct link to the show's Netflix page."
  netflixUrl: String
  "Optional direct link to the show's Hulu page."
  huluUrl: String
  "Optional direct link to the show's Prime Video page."
  primeUrl: String
  "Optional direct link to the show's YouTube channel or playlist."
  youtubeUrl: String
}

"""A season file: a lineup watched as it aired (its shows, plus titles still to review or not being reviewed), or a shelf like the Backlog."""
type Season {
  id: ID!
  name: String!
  "True for a lineup - a season watched as it aired, with an id like spring-2026. False for a shelf like the Backlog, which per-season trends leave out."
  lineup: Boolean!
  shows: [Show!]!
  "Titles still to be reviewed; see toReviewShows for streaming and premiere info."
  toReview: [String!]!
  "Titles that won't be reviewed; see notReviewingShows for the reason and streaming info."
  notReviewing: [String!]!
  "The same shows as toReview, with the optional streaming service keys and premiere day."
  toReviewShows: [ToReviewShow!]!
  "The same shows as notReviewing, with the optional reason and streaming info."
  notReviewingShows: [NotReviewingShow!]!
}

"""A season as listed in the index, without its full review data."""
type SeasonSummary {
  id: ID!
  name: String!
}

"""One genre or tag in a recommendation's taste profile."""
type TasteFeature {
  name: String!
  "genre or tag."
  kind: String!
  "The share of the liked shows that carry it, 0 to 1."
  weight: Float!
}

"""How one of the liked shows passed to recommend was found on AniList."""
type LikedShow {
  "The title as it was searched (from the query's alias, so without punctuation), or the id."
  input: String!
  "False when AniList had nothing for it; it is left out of the profile."
  found: Boolean!
  anilistId: Int
  "AniList's English title, or its romaji one when there is no English title."
  title: String
}

"""One recommended show, and why it was picked."""
type Recommendation {
  show: Show!
  "How close the show is to the taste profile, scaled by its current rating, 0 to 1."
  score: Float!
  "The show's AniList popularity (members with it on their list), when AniList returned one."
  popularity: Int
  "Profile genres the show shares, strongest first."
  sharedGenres: [String!]!
  "Profile tags the show shares, strongest first."
  sharedTags: [String!]!
}

"""Recommendations from these reviews for someone, from shows they liked."""
type Recommendations {
  liked: [LikedShow!]!
  "The genres and tags the liked shows have in common, strongest first."
  profile: [TasteFeature!]!
  "The closest shows rated 4+, chosen so they don't all overlap each other."
  picks: [Recommendation!]!
  "The least popular remaining 5 (or 4, if no 5 is left) that still shares something with the profile."
  hiddenGem: Recommendation
}

type Query {
  "Every season in the index (id + name only); use season(id:) or currentSeason for full data."
  seasons: [SeasonSummary!]!
  "The season currently marked as in-progress in the index."
  currentSeason: Season
  "A specific season's full data, by id (e.g. \\"spring-2026\\")."
  season(id: ID!): Season
  """Recommendations, step 1: the AniList query to run at https://anilist.co/graphiql
  for shows someone liked. Pass titles (each is searched on AniList), AniList ids,
  or both, up to 25 in all. It's one self-contained line: paste it in as-is, then
  pass what AniList answers to recommend. (AniList blocks requests from this
  server, so the API can't run it itself.)"""
  anilistQuery(titles: [String!], anilistIds: [Int!]): String!
  """Recommendations, step 2: picks from the reviewed shows, from the JSON AniList
  answered anilistQuery's query with (paste it between triple quotes, as a block string).
  count close matches that differ from each other, plus one hidden gem. Shows they
  named, and their sequels and prequels, are never recommended back."""
  recommend(anilistResponse: String!, count: Int = 2): Recommendations!
}
`;

/** The per-service link fields of a list entry, null where absent. */
function urlFields(entry) {
  return Object.fromEntries(Object.values(STREAMING_URL_FIELDS).map((key) => [key, entry[key] ?? null]));
}

/**
 * A season file's show as the API serves it: each review with its derived
 * stage and its rating label filled in, the current rating on the show itself,
 * and `op`/`ed` as Booleans (liked or not), with the numbered ones in
 * `opNumbers`/`edNumbers`.
 * @param {any} r
 * @param {string} season
 * @param {string} seasonName
 */
function toShow(r, season, seasonName) {
  const opNumbers = opEdNumbers(r.op);
  const edNumbers = opEdNumbers(r.ed);
  const reviews = reviewsOf(r);
  return {
    ...r,
    season,
    seasonName,
    reviews: reviews.map((review, i) => ({ ...review, stage: reviewStage(reviews, i), ratingText: ratingText(review) })),
    ratingNumber: effectiveRatingNumber(r) ?? null,
    ratingText: currentRatingText(r) || null,
    op: isLikedOpEd(r.op) ? true : undefined,
    ed: isLikedOpEd(r.ed) ? true : undefined,
    opNumbers: opNumbers.length ? opNumbers : null,
    edNumbers: edNumbers.length ? edNumbers : null,
  };
}

/** @param {import('../public/vqar/list-entries.js').ListEntry} entry */
function toToReviewShow(entry) {
  const { title, streaming, premieres, availableNow, ...rest } = normalizeEntry(entry);
  return { title, streaming: streaming ?? [], premieres: premieres ?? null, availableNow: availableNow === true, ...urlFields(rest) };
}

/** @param {import('../public/vqar/list-entries.js').ListEntry} entry */
function toNotReviewingShow(entry) {
  const { title, streaming, reason, ...rest } = normalizeEntry(entry);
  return { title, reason: reason ?? null, streaming: streaming ?? [], ...urlFields(rest) };
}

/**
 * Root value whose fields graphql-js uses as the Query type's default resolvers.
 * Built fresh per request, so the read cache below lives exactly as long as one
 * query: a query naming several root fields (or the same season twice under
 * different aliases) reads each file once, and the next request still sees
 * whatever the assets currently hold.
 * @param {{ assets: { fetch: (url: URL) => Promise<Response> }, origin: string }} env
 *   `assets` is the Worker's ASSETS binding; `origin` is what the relative data
 *   paths get resolved against, since the binding needs an absolute URL.
 */
export function makeRootValue({ assets, origin }) {
  /** @type {Map<string, Promise<object>>} in-flight and settled reads, keyed by path */
  const reads = new Map();

  /**
   * @param {string} path
   * @param {string} label - what to name in the error if the read fails
   */
  function loadJson(path, label) {
    const cached = reads.get(path);
    if (cached) return cached;

    const read = (async () => {
      const response = await assets.fetch(new URL(path, origin));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} loading ${label}`);
      }
      return response.json();
    })();

    // Don't leave a rejected promise in the cache for the rest of the request;
    // a read starting after the failure should get a fresh attempt rather than
    // the old error. (The .catch is also what keeps the cached rejection from
    // counting as unhandled - the returned promise still carries the error to
    // whichever field awaited it.)
    read.catch(() => reads.delete(path));

    reads.set(path, read);
    return read;
  }

  const loadIndex = () => loadJson(VQAR_INDEX_PATH, 'the season index');

  /** Every show in every season, since a recommendation can come from any of them. */
  async function loadAllShows() {
    const index = await loadIndex();
    return (await Promise.all(index.seasons.map(loadSeason))).flatMap((s) => s.shows);
  }

  /** @param {{ id: string|number, name: string, file: string }} meta */
  async function loadSeason(meta) {
    const data = await loadJson(meta.file, `season "${meta.name}"`);
    const id = String(data.id ?? meta.id);
    const name = data.name ?? meta.name;
    return {
      id,
      name,
      lineup: isLineup(id),
      shows: (data.shows ?? []).map((r) => toShow(r, id, name)),
      toReview: (data.toReview ?? []).map(entryTitle),
      notReviewing: (data.notReviewing ?? []).map(entryTitle),
      toReviewShows: (data.toReview ?? []).map(toToReviewShow),
      notReviewingShows: (data.notReviewing ?? []).map(toNotReviewingShow),
    };
  }

  return {
    async seasons() {
      const index = await loadIndex();
      return index.seasons.map((s) => ({ id: String(s.id), name: s.name }));
    },
    async currentSeason() {
      const index = await loadIndex();
      const meta = index.seasons.find((s) => String(s.id) === String(index.currentSeason));
      return meta ? loadSeason(meta) : null;
    },
    async season({ id }) {
      const index = await loadIndex();
      const meta = index.seasons.find((s) => String(s.id) === String(id));
      return meta ? loadSeason(meta) : null;
    },
    async anilistQuery({ titles, anilistIds }) {
      const cleanTitles = [...new Set((titles ?? []).map((t) => t.trim()).filter(Boolean))];
      const ids = [...new Set(anilistIds ?? [])];
      if (cleanTitles.length + ids.length === 0) throw new Error('anilistQuery needs at least one title or anilistId');
      if (cleanTitles.length + ids.length > MAX_LIKED) throw new Error(`anilistQuery takes at most ${MAX_LIKED} liked shows`);
      return buildAniListQuery({ titles: cleanTitles, ids, candidateIds: candidateIds(await loadAllShows()) });
    },
    async recommend({ anilistResponse, count }) {
      if (count < 0 || count > MAX_PICKS) throw new Error(`count has to be between 0 and ${MAX_PICKS}`);
      const { liked, popularity } = parseAniListResponse(anilistResponse);
      const shows = await loadAllShows();
      return {
        liked: liked.map(({ input, media }) => ({
          input,
          found: media !== null,
          anilistId: media?.id ?? null,
          title: media ? media.title?.english ?? media.title?.romaji ?? null : null,
        })),
        ...recommend({ shows, likedMedia: liked.map((l) => l.media).filter(Boolean), popularity, count }),
      };
    },
  };
}
