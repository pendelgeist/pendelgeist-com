import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateFsarReview, validateFsarCollection } from '../scripts/validateFsarReview.js';
import { readReviews, buildIndex, serializeIndex, INDEX_PATH } from '../scripts/build-fsar-index.js';

// --- The committed data ---

test('every committed review is well-formed', () => {
  for (const { filename, review } of readReviews()) {
    assert.deepEqual(validateFsarReview(review, { filename }), [], `issues in ${filename}`);
  }
});

test('no two reviews share an id', () => {
  assert.deepEqual(validateFsarCollection(readReviews().map((e) => e.review)), []);
});

test('the committed index.json matches a fresh build', () => {
  const expected = serializeIndex(buildIndex(readReviews().map((e) => e.review)));
  assert.equal(
    fs.readFileSync(INDEX_PATH, 'utf-8'),
    expected,
    'index.json is stale - run: npm run build-fsar-index'
  );
});

test('the index carries card metadata but not the review bodies', () => {
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));

  assert.ok(index.reviews.length > 0, 'expected at least one review');
  for (const card of index.reviews) {
    assert.equal(card.sections, undefined, `${card.id} leaked its body into the index`);
    for (const key of ['id', 'status', 'titleEN', 'format', 'year', 'dateReviewed', 'verdict']) {
      assert.notEqual(card[key], undefined, `${card.id} is missing ${key} in the index`);
    }
  }
});

// --- The validator itself ---

/** A minimal review that passes, for the negative cases to break one field at a time. */
function validReview(overrides = {}) {
  return {
    id: 'a-show',
    status: 'done',
    titleEN: 'A Show',
    format: 'TV',
    year: 1995,
    dateReviewed: '2026-01-01',
    verdict: { ratingNumber: 4, ratingText: 'Yeah', oneLiner: 'It is good.' },
    sections: { story: ['It happens.'] },
    ...overrides,
  };
}

test('the baseline fixture is actually valid', () => {
  assert.deepEqual(validateFsarReview(validReview()), []);
});

test('flags a review whose id does not match its filename', () => {
  const issues = validateFsarReview(validReview(), { filename: 'other-show.json' });
  assert.match(issues.join('\n'), /doesn't match its filename/);
});

test('flags an unknown status, format, or malformed year', () => {
  assert.match(validateFsarReview(validReview({ status: 'draft' })).join('\n'), /unknown status/);
  assert.match(validateFsarReview(validReview({ format: 'Series' })).join('\n'), /unknown format/);
  assert.match(validateFsarReview(validReview({ year: '1995' })).join('\n'), /year must be/);
});

test('accepts every release format, since these are not all TV seasons', () => {
  for (const format of ['TV', 'OVA', 'ONA', 'Movie', 'Special']) {
    assert.deepEqual(validateFsarReview(validReview({ format })), [], format);
  }
});

test('accepts a decades-old release year', () => {
  assert.deepEqual(validateFsarReview(validReview({ year: 1974 })), []);
});

test('flags watching more episodes than the show has', () => {
  const issues = validateFsarReview(validReview({ episodeCount: 12, episodesWatched: 13 }));
  assert.match(issues.join('\n'), /greater than episodeCount/);
});

test('allows unknown episode counts, which older shows often have', () => {
  assert.deepEqual(validateFsarReview(validReview({ episodeCount: null, episodesWatched: null })), []);
});

test('flags a section name the page would silently drop', () => {
  const review = validReview({ sections: { story: ['x'], musings: ['y'] } });
  assert.match(validateFsarReview(review).join('\n'), /unknown section "musings"/);
});

test('flags a malformed spoiler or notes block', () => {
  const noHeading = validReview({ sections: { story: ['x'], spoilers: [{ body: ['y'] }] } });
  assert.match(validateFsarReview(noHeading).join('\n'), /missing a heading/);

  const noBody = validReview({ sections: { story: ['x'], notes: [{ heading: 'h' }] } });
  assert.match(validateFsarReview(noBody).join('\n'), /body must be an array/);
});

test('flags an OP/ED section written as bare prose instead of { ratingText, body }', () => {
  const review = validReview({ sections: { story: ['x'], op: ['not an object'] } });
  assert.match(validateFsarReview(review).join('\n'), /section "op" must be an object/);
});

test('a review marked done has to have a verdict and something written', () => {
  const noVerdict = validReview({ verdict: { ratingNumber: 4, ratingText: 'Yeah', oneLiner: '' } });
  assert.match(validateFsarReview(noVerdict).join('\n'), /marked done but has no verdict/);

  const nothingWritten = validReview({ sections: {} });
  assert.match(validateFsarReview(nothingWritten).join('\n'), /marked done but has no written sections/);
});

test('an in-progress review is allowed to be empty - that is the point of the status', () => {
  const draft = validReview({
    status: 'wip',
    verdict: { ratingNumber: null, ratingText: '', oneLiner: '' },
    sections: {},
  });
  assert.deepEqual(validateFsarReview(draft), []);
});

test('flags an unknown streaming service and a non-slug tag', () => {
  assert.match(validateFsarReview(validReview({ streaming: ['tubi'] })).join('\n'), /unknown streaming service/);
  assert.match(validateFsarReview(validReview({ tags: ['Slice Of Life'] })).join('\n'), /must be a lowercase slug/);
});

test('flags a rating outside the 0-5 scale', () => {
  const review = validReview({ verdict: { ratingNumber: 9, ratingText: 'Peak', oneLiner: 'x' } });
  assert.match(validateFsarReview(review).join('\n'), /0 to 5/);
});
