/**
 * A liked opening or ending on a review (`op` / `ed`).
 *
 * A show can have several OPs or EDs inside one season, so a liking is either
 *
 *   true       - liked, without saying which one
 *   [1, 2]     - liked OP/ED number 1 and number 2
 *
 * and is left out entirely when nothing was liked. Anything else is rejected
 * by `scripts/validateSeason.js`. Shared by /vqar, /vqar-stats, src/schema.js
 * and the validator, so the shape can't drift between them.
 */

/**
 * Whether an `op` / `ed` value marks a liked opening/ending.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isLikedOpEd(value) {
  return value === true || (Array.isArray(value) && value.length > 0);
}

/**
 * The numbered OPs/EDs a value names, ascending; empty for `true`, nothing,
 * or anything malformed.
 * @param {unknown} value
 * @returns {number[]}
 */
export function opEdNumbers(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((n) => Number.isInteger(n) && n >= 1).sort((a, b) => a - b);
}

/**
 * What is wrong with an `op` / `ed` value, or null when it's fine.
 * @param {unknown} value
 * @returns {string|null}
 */
export function opEdProblem(value) {
  if (value === true) return null;
  if (!Array.isArray(value)) return 'expected true, or a list of numbers like [1, 2]';
  if (value.length === 0) return 'an empty list - leave it out, or use true for a liked one you did not number';
  if (!value.every((n) => Number.isInteger(n) && n >= 1)) return 'every number must be a whole number from 1';
  if (new Set(value).size !== value.length) return 'a number is listed twice';
  return null;
}

/**
 * The text of a liking: "Liked OP" for a bare `true`, "Liked OP 1, 2" for
 * numbered ones.
 * @param {'OP'|'ED'} kind
 * @param {unknown} value
 * @returns {string}
 */
export function likedLabel(kind, value) {
  const numbers = opEdNumbers(value);
  return numbers.length ? `Liked ${kind} ${numbers.join(', ')}` : `Liked ${kind}`;
}

/**
 * The short form for a table cell: "OP 1, 2", or "-" when the liking didn't
 * say which one.
 * @param {'OP'|'ED'} kind
 * @param {unknown} value
 * @returns {string}
 */
export function whichLabel(kind, value) {
  const numbers = opEdNumbers(value);
  return numbers.length ? `${kind} ${numbers.join(', ')}` : '-';
}
