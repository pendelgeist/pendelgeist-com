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
    ],
    toReview: ['Plain Pending', { title: 'Dated Pending', premieres: '2026-07-20' }],
    notReviewing: [{ title: 'Skipped Show', reason: 'Not streaming in the US' }],
  });

  assert.deepEqual(validateSeason(season, { now: Date.parse('2026-11-20T00:00:00Z') }), []);
});

test('a show with both review forms given at once is rejected rather than guessed at', () => {
  assert.throws(() => makeShow({
    titleEN: 'Too Many',
    reviews: [{ ratingNumber: 1 }, { ratingNumber: 2 }],
    revisit: { ratingNumber: 3 },
  }), /at most two reviews/);
});

test('a built game, played over time and finished, passes validation', () => {
  const data = {
    reviews: [
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
    ],
  };

  assert.deepEqual(validateGameReviews(data), []);
});
