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
function reviewFields({ episodes, final, ratingNumber, ratingText, text, dateReviewed }) {
  return defined({ episodes, final, ratingNumber, ratingText, text, dateReviewed });
}

/**
 * When a show was watched, in the data's shape.
 * @param {{ from?: string, to?: string, season?: number, episode?: number, finished?: boolean }} watched
 */
function watchedFields({ from, to, season, episode, finished }) {
  return defined({ from, to, season, episode, finished });
}

/**
 * A show in a season.
 *
 * Its reviews are listed oldest first in `reviews`, exactly as given. For the
 * usual show - reviewed on episode 1 - its first impression can be given
 * straight on the show instead (`ratingNumber`, `ratingText`, `text`,
 * `dateReviewed`), which makes it `episodes: 1` unless the test says
 * otherwise with `episodes` or `final`; `revisit` adds a later review on top.
 * Everything else (`titleEN`, `aired`, `anilistId`, `op`, `streaming`...)
 * passes through as written.
 *
 * @param {Record<string, any>} spec
 */
export function makeShow(spec) {
  const { reviews, revisit, ratingNumber, ratingText, text, dateReviewed, episodes, final, watched, ...rest } = spec;
  const firstImpression = { episodes: episodes ?? (final ? undefined : 1), final, ratingNumber, ratingText, text, dateReviewed };
  const list = reviews ? [...reviews] : [firstImpression];
  if (revisit) list.push(revisit);

  const out = { ...rest, reviews: list.map(reviewFields) };
  if (watched) out.watched = watchedFields(watched);
  return out;
}

/**
 * A season: `shows` (reviewed), `toReview` and `notReviewing`. Other keys
 * (`id`, `name`, `current`, `sortKey`...) pass through, so a test can spread
 * one built season into another and override just its lists.
 * @param {Record<string, any>} spec
 */
export function makeSeason(spec) {
  return { ...spec };
}

/**
 * A game: like a show, its reviews oldest first in `reviews`, or its first
 * one given straight on the game, with `hoursPlayed` per review;
 * `played.finished` for a game played to the end. Other keys (`id`, `title`,
 * `platform`) pass through.
 * @param {Record<string, any>} spec
 */
export function makeGame(spec) {
  const { reviews, ratingNumber, ratingText, text, dateReviewed, hoursPlayed, final, played, ...rest } = spec;
  const list = reviews ?? [{ ratingNumber, ratingText, text, dateReviewed, hoursPlayed, final }];
  const out = { ...rest, reviews: list.map((r) => defined({ hoursPlayed: r.hoursPlayed, final: r.final, ...reviewFields({ ...r, final: undefined }) })) };
  if (played) out.played = defined({ finished: played.finished });
  return out;
}
