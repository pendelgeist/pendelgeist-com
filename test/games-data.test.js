import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGameReviews } from '../scripts/validateGameReviews.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../public/games/data.json');

// --- The committed data ---

test('the committed game reviews are well-formed', () => {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  assert.deepEqual(validateGameReviews(data), []);
});

// --- The validator itself ---

/** A minimal review that passes, for the negative cases to break one field at a time. */
function validReview(overrides = {}) {
  return {
    id: 'a-game',
    title: 'A Game',
    review: 'It is a game.',
    ratingNumber: 4,
    ratingText: "Yeah, Here's Hoping",
    dateReviewed: '2026-10-24T20:00:00-04:00',
    ...overrides,
  };
}

const issuesFor = (...reviews) => validateGameReviews({ reviews });

test('the baseline fixture is actually valid, with or without optional fields', () => {
  assert.deepEqual(issuesFor(validReview()), []);
  assert.deepEqual(issuesFor(validReview({
    platform: 'PC',
    hoursPlayed: 3.5,
    finished: true,
    updates: [{ review: 'Still good.', ratingNumber: 5, ratingText: 'Peak', dateReviewed: '2026-11-01T21:00:00-04:00' }],
  })), []);
});

test('rejects a file without a reviews array', () => {
  assert.equal(validateGameReviews([]).length, 1);
  assert.equal(validateGameReviews({}).length, 1);
});

test('rejects a missing or malformed id, and duplicate ids', () => {
  assert.match(issuesFor(validReview({ id: 'Not A Slug' }))[0], /lowercase slug/);
  assert.match(issuesFor(validReview(), validReview())[0], /duplicate id/);
});

test('rejects a review missing its title, text, rating or date', () => {
  for (const [key, pattern] of [
    ['title', /missing title/],
    ['review', /missing review text/],
    ['ratingNumber', /ratingNumber/],
    ['ratingText', /missing ratingText/],
    ['dateReviewed', /dateReviewed/],
  ]) {
    const review = validReview();
    delete review[key];
    assert.match(issuesFor(review).join('\n'), pattern, `expected an issue for a missing ${key}`);
  }
});

test('rejects a rating outside the 0-5 tiers', () => {
  for (const ratingNumber of [6, -1, 3.5, '4']) {
    assert.match(issuesFor(validReview({ ratingNumber })).join('\n'), /ratingNumber/, `${ratingNumber}`);
  }
});

// A UTC or date-only stamp shows the wrong day for an evening review, same as on /vqar.
test('rejects a date with no time or offset', () => {
  assert.match(issuesFor(validReview({ dateReviewed: '2026-10-24' }))[0], /offset/);
  assert.match(issuesFor(validReview({ dateReviewed: '2026-10-24T20:00:00' }))[0], /offset/);
});

test('rejects a bad hoursPlayed and a finished marking that is not true', () => {
  assert.match(issuesFor(validReview({ hoursPlayed: 0 }))[0], /hoursPlayed/);
  assert.match(issuesFor(validReview({ hoursPlayed: 'a few' }))[0], /hoursPlayed/);
  assert.match(issuesFor(validReview({ finished: 'yes' }))[0], /finished/);
});

// The latest update's rating is the verdict that counts, so one without a rating
// would leave the old one standing.
test('an update needs its own rating, and updates run oldest first', () => {
  const unrated = validReview({ updates: [{ review: 'More.', dateReviewed: '2026-11-01T21:00:00-04:00' }] });
  assert.match(issuesFor(unrated).join('\n'), /updates\[0\]: ratingNumber/);

  const update = (dateReviewed) => ({ review: 'More.', ratingNumber: 3, ratingText: 'Meh', dateReviewed });
  const outOfOrder = validReview({
    updates: [update('2026-11-05T21:00:00-04:00'), update('2026-11-01T21:00:00-04:00')],
  });
  assert.match(issuesFor(outOfOrder).join('\n'), /updates\[1\]: .*date order/);
});
