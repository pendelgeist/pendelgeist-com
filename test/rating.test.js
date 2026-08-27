import { test } from 'node:test';
import assert from 'node:assert/strict';

import { effectiveRatingNumber } from '../public/vqar/rating.js';

test('a review with no re-review keeps its episode-1 rating', () => {
  assert.equal(effectiveRatingNumber({ ratingNumber: 4 }), 4);
});

test('a full-series re-review supersedes the episode-1 rating', () => {
  assert.equal(effectiveRatingNumber({ ratingNumber: 3, fullReview: { ratingNumber: 5 } }), 5);
});

test('a zero from a re-review still supersedes - it is a rating, not a missing one', () => {
  assert.equal(effectiveRatingNumber({ ratingNumber: 4, fullReview: { ratingNumber: 0 } }), 0);
});

test('a re-review with only prose falls back to the episode-1 rating', () => {
  assert.equal(effectiveRatingNumber({ ratingNumber: 4, fullReview: { review: 'Held up.' } }), 4);
});

test('a text-only review has no numeric rating either way', () => {
  assert.equal(effectiveRatingNumber({ ratingText: 'Yeah' }), undefined);
});
