import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeShow, makeSeason, makeGame } from './fixtures.js';
import { validateSeason } from '../scripts/validateSeason.js';
import { validateGameReviews } from '../scripts/validateGameReviews.js';

// The builders are what keep test fixtures in step with the data's real shape,
// so what they build has to be data the validators accept.

test('a season built from every builder feature passes validation', () => {
  const season = makeSeason({
    id: 'summer-2026',
    name: 'Summer 2026',
    shows: [
      makeShow({
        titleEN: 'Plain Show', ratingNumber: 3, ratingText: 'Meh, Finishing the Ep', text: 'fine',
        dateReviewed: '2026-07-01T08:00:00-04:00',
      }),
      makeShow({
        titleEN: 'Revisited Show', ratingNumber: 4, ratingText: "Yeah, Here's Hoping", text: 'hopeful',
        dateReviewed: '2026-07-02T08:00:00-04:00',
        revisit: { ratingNumber: 5, ratingText: 'Peak, Nice Ep Broh', text: 'it delivered', dateReviewed: '2026-08-01T08:00:00-04:00' },
        op: [1],
      }),
      makeShow({
        titleEN: 'Watched Show', ratingNumber: 3, ratingText: 'Meh, Finishing the Ep', dateReviewed: '2026-07-03T08:00:00-04:00',
        watched: { from: '2026-07-03', to: '2026-08-20', episode: 6 },
      }),
      makeShow({
        titleEN: 'Long Show', ratingNumber: 3, ratingText: 'Meh, Finishing the Ep', dateReviewed: '2026-07-04T08:00:00-04:00',
        watched: { from: '2026-07-04', to: '2026-08-21', season: 2, episode: 6 },
      }),
      makeShow({
        titleEN: 'Finished Show', aired: { season: 'spring', year: 2010 }, dateReviewed: '2026-07-05T08:00:00-04:00', ratingNumber: 4,
        revisit: { episodes: 6, ratingNumber: 4, dateReviewed: '2026-07-20T08:00:00-04:00' },
        watched: { from: '2026-07-05', to: '2026-08-22', finished: true },
      }),
      makeShow({
        titleEN: 'Backfilled Show', reviews: [{ episodes: 12, final: true, ratingNumber: 5, text: 'all of it', dateReviewed: '2026-11-01T08:00:00-05:00' }],
        watched: { from: '2012-10-05', to: '2013-01-01', finished: true },
      }),
    ],
    toReview: ['Plain Pending', { title: 'Dated Pending', premieres: '2026-07-20' }],
    notReviewing: [{ title: 'Skipped Show', reason: 'Not streaming in the US' }],
  });

  assert.deepEqual(validateSeason(season, { now: Date.parse('2026-11-20T00:00:00Z') }), []);
});

test('a show given straight on the builder is a first impression, and a reviews list is taken as written', () => {
  assert.equal(makeShow({ ratingNumber: 3 }).reviews[0].episodes, 1);
  assert.equal(makeShow({ ratingNumber: 3, episodes: 6 }).reviews[0].episodes, 6);
  assert.equal(makeShow({ ratingNumber: 3, final: true }).reviews[0].episodes, undefined);
  assert.deepEqual(makeShow({ reviews: [{ ratingNumber: 3 }] }).reviews, [{ ratingNumber: 3 }]);
});

test('a built game, played over time and finished, passes validation', () => {
  const data = {
    games: [
      makeGame({
        id: 'a-game',
        title: 'A Game',
        platform: 'PC',
        reviews: [
          { text: 'Just started.', ratingNumber: 3, ratingText: 'Meh, Might Load the Save Again', dateReviewed: '2026-09-01T21:30:00-04:00', hoursPlayed: 2 },
          { text: 'It got better.', ratingNumber: 5, ratingText: 'Peak, Nice Game Broh', dateReviewed: '2026-10-20T22:00:00-04:00', hoursPlayed: 30 },
        ],
        played: { finished: true },
      }),
      makeGame({ id: 'b-game', title: 'B Game', text: 'Fine.', ratingNumber: 3, dateReviewed: '2026-09-02T21:30:00-04:00', hoursPlayed: 1 }),
    ],
  };

  assert.deepEqual(validateGameReviews(data), []);
});
