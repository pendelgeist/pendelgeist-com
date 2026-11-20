import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reviewStage, currentReview, firstImpression, laterReviews, ratingShift, reviewsOf, STAGE_LABELS } from '../public/vqar/reviews.js';
import { makeShow } from './fixtures.js';

const stages = (show) => show.reviews.map((_, i) => reviewStage(show.reviews, i));

test('each review\'s stage comes from what it was based on and where it sits', () => {
  assert.deepEqual(stages(makeShow({ ratingNumber: 4 })), ['first']);
  assert.deepEqual(stages(makeShow({ ratingNumber: 4, revisit: { ratingNumber: 5 } })), ['first', 'revisit']);
  assert.deepEqual(stages(makeShow({
    reviews: [{ episodes: 1, ratingNumber: 4 }, { episodes: 6, ratingNumber: 4 }, { final: true, episodes: 12, ratingNumber: 5 }],
  })), ['first', 'revisit', 'final']);
  // A backfill: written after a stretch of the show, or with no basis recorded.
  assert.deepEqual(stages(makeShow({ reviews: [{ episodes: 12, ratingNumber: 3 }] })), ['review']);
  assert.deepEqual(stages(makeShow({ reviews: [{ ratingNumber: 3 }, { ratingNumber: 4 }] })), ['review', 'revisit']);
  assert.deepEqual(stages(makeShow({ reviews: [{ final: true, ratingNumber: 3 }] })), ['final']);
});

test('every stage has a label', () => {
  for (const stage of ['first', 'revisit', 'final', 'review']) assert.equal(typeof STAGE_LABELS[stage], 'string');
});

test('the current review is the latest; the first impression is only an episode-1 one', () => {
  const show = makeShow({ ratingNumber: 3, text: 'first', revisit: { ratingNumber: 5, text: 'later' } });
  assert.equal(currentReview(show).text, 'later');
  assert.equal(firstImpression(show).text, 'first');
  assert.deepEqual(laterReviews(show).map(r => r.text), ['later']);
  assert.equal(firstImpression(makeShow({ reviews: [{ episodes: 12, ratingNumber: 3 }] })), undefined);
  assert.equal(currentReview({}), undefined);
  assert.deepEqual(reviewsOf({ reviews: 'nope' }), []);
});

test('ratingShift compares the first impression with the latest review, once there is one', () => {
  assert.deepEqual(ratingShift(makeShow({ ratingNumber: 4, revisit: { ratingNumber: 2 } })), { before: 4, after: 2 });
  assert.equal(ratingShift(makeShow({ ratingNumber: 4 })), null);
  assert.equal(ratingShift(makeShow({ reviews: [{ episodes: 6, ratingNumber: 3 }, { ratingNumber: 5 }] })), null);
});
