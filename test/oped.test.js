import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLikedOpEd, opEdNumbers, opEdProblem, likedLabel, whichLabel } from '../public/vqar/oped.js';

test('true and a non-empty list are likings; nothing, false and an empty list are not', () => {
  assert.equal(isLikedOpEd(true), true);
  assert.equal(isLikedOpEd([2]), true);
  assert.equal(isLikedOpEd([1, 3]), true);
  for (const value of [undefined, null, false, [], 'yes', 1]) {
    assert.equal(isLikedOpEd(value), false, `treated ${JSON.stringify(value)} as liked`);
  }
});

test('opEdNumbers lists the numbered ones ascending, and nothing for a bare true', () => {
  assert.deepEqual(opEdNumbers([3, 1]), [1, 3]);
  assert.deepEqual(opEdNumbers(true), []);
  assert.deepEqual(opEdNumbers(undefined), []);
  assert.deepEqual(opEdNumbers([0, 2, 1.5, 'x']), [2]);
});

test('opEdProblem accepts true and distinct positive whole numbers, and says what is wrong otherwise', () => {
  assert.equal(opEdProblem(true), null);
  assert.equal(opEdProblem([1]), null);
  assert.equal(opEdProblem([1, 2, 5]), null);

  assert.match(opEdProblem(false), /expected true/);
  assert.match(opEdProblem('yes'), /expected true/);
  assert.match(opEdProblem(2), /expected true/);
  assert.match(opEdProblem({ ratingText: 'Honorable Mention' }), /expected true/);
  assert.match(opEdProblem([]), /empty list/);
  assert.match(opEdProblem([0]), /whole number from 1/);
  assert.match(opEdProblem([1.5]), /whole number from 1/);
  assert.match(opEdProblem(['1']), /whole number from 1/);
  assert.match(opEdProblem([2, 2]), /twice/);
});

test('likedLabel and whichLabel name the numbers when there are some', () => {
  assert.equal(likedLabel('OP', true), 'Liked OP');
  assert.equal(likedLabel('OP', [2]), 'Liked OP 2');
  assert.equal(likedLabel('ED', [3, 1]), 'Liked ED 1, 3');

  assert.equal(whichLabel('OP', true), '-');
  assert.equal(whichLabel('OP', [2]), 'OP 2');
  assert.equal(whichLabel('ED', [1, 2]), 'ED 1, 2');
});
