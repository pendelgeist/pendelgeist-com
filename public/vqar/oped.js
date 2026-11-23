/**
 * A liked opening or ending on a review (`op` / `ed`).
 *
 * A show can have several OPs or EDs inside one season, so a liking always
 * says which: a list of the numbers liked, `[1]` or `[1, 2]`. It's left out
 * entirely when nothing was liked. Anything else - including a bare `true` -
 * is rejected by `scripts/validateSeason.js`. Shared by /vqar, /anime-stat-sheet,
 * src/schema.js and the validator, so the shape can't drift between them.
 */

/**
 * Whether an `op` / `ed` value marks a liked opening/ending.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isLikedOpEd(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * The numbered OPs/EDs a value names, ascending; empty for nothing or
 * anything malformed.
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
  if (value === true) return 'a bare true is not accepted - name the number, like [1]';
  if (!Array.isArray(value)) return 'expected a list of the numbers liked, like [1] or [1, 2]';
  if (value.length === 0) return 'an empty list - leave it out, or name the number liked, like [1]';
  if (!value.every((n) => Number.isInteger(n) && n >= 1)) return 'every number must be a whole number from 1';
  if (new Set(value).size !== value.length) return 'a number is listed twice';
  return null;
}

/**
 * The text of a liking: "Liked OP 1", "Liked ED 1, 3".
 * @param {'OP'|'ED'} kind
 * @param {unknown} value
 * @returns {string}
 */
export function likedLabel(kind, value) {
  const numbers = opEdNumbers(value);
  return numbers.length ? `Liked ${kind} ${numbers.join(', ')}` : `Liked ${kind}`;
}

/**
 * The short form for a table cell: "OP 1, 2", or "-" when there's nothing to say.
 * @param {'OP'|'ED'} kind
 * @param {unknown} value
 * @returns {string}
 */
export function whichLabel(kind, value) {
  const numbers = opEdNumbers(value);
  return numbers.length ? `${kind} ${numbers.join(', ')}` : '-';
}
