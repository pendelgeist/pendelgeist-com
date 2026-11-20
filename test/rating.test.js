import { test } from 'node:test';
import assert from 'node:assert/strict';

import { effectiveRatingNumber, awaitingRevisit, ratingText, currentRatingText, RATING_NUMBER_LABELS } from '../public/vqar/rating.js';
import { makeShow } from './fixtures.js';

test('a show with one review keeps that rating', () => {
  assert.equal(effectiveRatingNumber(makeShow({ ratingNumber: 4 })), 4);
});

test('the latest review sets the rating', () => {
  assert.equal(effectiveRatingNumber(makeShow({ ratingNumber: 3, revisit: { ratingNumber: 5 } })), 5);
  assert.equal(effectiveRatingNumber(makeShow({
    reviews: [{ episodes: 1, ratingNumber: 3 }, { episodes: 6, ratingNumber: 5 }, { final: true, ratingNumber: 2 }],
  })), 2);
});

test('a zero from a later review still supersedes - it is a rating, not a missing one', () => {
  assert.equal(effectiveRatingNumber(makeShow({ ratingNumber: 4, revisit: { ratingNumber: 0 } })), 0);
});

test('a show with no reviews has no rating', () => {
  assert.equal(effectiveRatingNumber({}), undefined);
  assert.equal(currentRatingText({}), '');
});

test('a review without its own ratingText takes its tier\'s label', () => {
  assert.equal(ratingText({ ratingNumber: 3 }), RATING_NUMBER_LABELS[3]);
  assert.equal(ratingText({ ratingNumber: 3, ratingText: 'Custom' }), 'Custom');
  assert.equal(currentRatingText(makeShow({ ratingNumber: 3, ratingText: 'Custom', revisit: { ratingNumber: 5 } })), RATING_NUMBER_LABELS[5]);
});

test('only a first impression rated 4 with nothing after it is awaiting a revisit', () => {
  assert.equal(awaitingRevisit(makeShow({ ratingNumber: 4 })), true);
  assert.equal(awaitingRevisit(makeShow({ ratingNumber: 4, revisit: { ratingNumber: 4 } })), false);
  assert.equal(awaitingRevisit(makeShow({ ratingNumber: 5 })), false);
  assert.equal(awaitingRevisit(makeShow({ ratingNumber: 3 })), false);
  // A backfill - reviewed after a stretch of the show - has no first impression to follow up.
  assert.equal(awaitingRevisit(makeShow({ reviews: [{ episodes: 12, ratingNumber: 4 }] })), false);
  assert.equal(awaitingRevisit(makeShow({ reviews: [{ ratingNumber: 4 }] })), false);
});
