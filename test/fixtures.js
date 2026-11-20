/**
 * Fixture builders for tests.
 *
 * Tests describe shows, seasons and games in the vocabulary the data uses
 * (see the README glossary), and these turn that into the data's actual shape.
 * When the shape changes, these change - not every test that happens to need a
 * show. A builder never invents a field: what a test leaves out stays out, so
 * a fixture is exactly what the test wrote.
 */

/** Copies the keys of `source` that are not undefined. */
function defined(source) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined));
}

/**
 * One review, in the data's shape.
 * @param {{ ratingNumber?: number, ratingText?: string, text?: string, dateReviewed?: string, episodes?: number, final?: boolean }} review
 */
function reviewFields({ ratingNumber, ratingText, text, dateReviewed }) {
  return defined({ ratingNumber, ratingText, review: text, dateReviewed });
}

/**
 * When a show was watched, in the data's shape.
 * @param {{ from?: string, to?: string, season?: number, episode?: number, finished?: boolean }} watched
 */
function watchedFields({ from, to, season, episode }) {
  const lastEpisode = episode === undefined ? undefined : season === undefined ? episode : `S${season} E${episode}`;
  return defined({ first: from, last: to, lastEpisode });
}

/**
 * A show in a season.
 *
 * Its reviews are listed oldest first in `reviews`, or - for the usual show
 * with one - given straight on the show (`ratingNumber`, `ratingText`, `text`,
 * `dateReviewed`), with `revisit` for a later review on top of that one.
 * Everything else (`titleEN`, `anilistId`, `op`, `streaming`...) passes
 * through as written.
 *
 * @param {Record<string, any>} spec
 */
export function makeShow(spec) {
  const { reviews, revisit, ratingNumber, ratingText, text, dateReviewed, episodes, final, watched, ...rest } = spec;
  const list = reviews ? [...reviews] : [{ ratingNumber, ratingText, text, dateReviewed, episodes, final }];
  if (revisit) list.push(revisit);
  if (list.length > 2) throw new Error('makeShow(): the data can hold at most two reviews per show');

  const [first, second] = list;
  const out = { ...rest, ...reviewFields(first ?? {}) };
  if (second) out.fullReview = reviewFields(second);
  if (watched) {
    out.watched = watchedFields(watched);
    if (watched.finished) out.finishedSeason = true;
  }
  return out;
}

/**
 * A to-review entry: a plain title, or an object with optional notes
 * (`premieres` for the first episode's date).
 * @param {string | Record<string, any>} entry
 */
function toReviewEntry(entry) {
  if (typeof entry === 'string') return entry;
  const { premieres, ...rest } = entry;
  return defined({ ...rest, firstEpisode: premieres });
}

/**
 * A season: `shows` (reviewed), `toReview` and `notReviewing`. Other keys
 * (`id`, `name`, `current`, `sortKey`...) pass through, so a test can spread
 * one built season into another and override just its lists.
 * @param {Record<string, any>} spec
 */
export function makeSeason(spec) {
  const { shows, toReview, notReviewing, ...rest } = spec;
  const out = { ...rest };
  if (shows !== undefined) out.reviewed = shows;
  if (toReview !== undefined) out.pending = Array.isArray(toReview) ? toReview.map(toReviewEntry) : toReview;
  if (notReviewing !== undefined) out.skipped = notReviewing;
  return out;
}

/**
 * A game: like a show, its reviews oldest first in `reviews` or one given
 * straight on the game, with `hoursPlayed` per review; `played.finished` for a
 * game played to the end. Other keys (`id`, `title`, `platform`) pass through.
 * @param {Record<string, any>} spec
 */
export function makeGame(spec) {
  const { reviews, ratingNumber, ratingText, text, dateReviewed, hoursPlayed, final, played, ...rest } = spec;
  const [first, ...later] = reviews ?? [{ ratingNumber, ratingText, text, dateReviewed, hoursPlayed, final }];
  const toFields = (r) => defined({ ...reviewFields(r), hoursPlayed: r.hoursPlayed });
  const out = { ...rest, ...toFields(first ?? {}) };
  if (later.length) out.updates = later.map(toFields);
  if (played?.finished) out.finished = true;
  return out;
}
