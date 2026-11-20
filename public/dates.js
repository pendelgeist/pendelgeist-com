/**
 * The two forms a date takes in the committed data, each for one kind of thing:
 *
 * - a **day**, `YYYY-MM-DD` in the reviewer's Eastern time, for things where
 *   only the day matters: when a show was watched (`watched.from`/`to`), when
 *   it premieres, when a season was finished;
 * - a **moment**, a full ISO 8601 timestamp in the reviewer's Eastern offset
 *   (`2026-10-08T14:30:00-04:00`), for when a review was written, so two
 *   written on the same day still sort in order.
 *
 * Both are shown exactly as written, so the Eastern offset is what keeps an
 * evening review on its own day. Shared by the pages, the GraphQL schema and
 * the validators, so the rules can't drift between them.
 */

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MOMENT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Whether a value is a real calendar day written `YYYY-MM-DD`.
 * @param {unknown} value
 * @returns {value is string}
 */
export function isDay(value) {
  if (typeof value !== 'string') return false;
  const match = DAY_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Whether a value is a full timestamp with a time and an offset (any offset -
 * `isEasternMoment` checks it's the reviewer's).
 * @param {unknown} value
 * @returns {value is string}
 */
export function isMoment(value) {
  return typeof value === 'string' && MOMENT_PATTERN.test(value) && isDay(value.slice(0, 10))
    && !Number.isNaN(Date.parse(value));
}

const EASTERN_OFFSET_FORMAT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' });

/**
 * The reviewer's UTC offset at an instant: `-04:00` in daylight time, `-05:00` otherwise.
 * @param {number} instant - epoch milliseconds
 * @returns {string}
 */
export function easternOffset(instant) {
  const zone = EASTERN_OFFSET_FORMAT.formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value ?? '';
  return zone.replace('GMT', '');
}

/**
 * Whether a moment is written in the reviewer's Eastern offset for its date
 * (not UTC `Z`, not the wrong side of a daylight-saving change).
 * @param {string} value - a moment (see isMoment)
 */
export function isEasternMoment(value) {
  if (!isMoment(value)) return false;
  const offset = value.endsWith('Z') ? 'Z' : value.slice(-6);
  return offset === easternOffset(Date.parse(value));
}

/**
 * The day part of a day or a moment, exactly as written.
 * @param {string} value
 * @returns {string}
 */
export function dayOf(value) {
  return value.slice(0, 10);
}

/**
 * A moment at a given Eastern wall-clock time on a day, with that day's offset:
 * `easternMoment('2026-08-05')` is `2026-08-05T12:00:00-04:00`. For giving a
 * time to a date that never had one - noon keeps it clear of either midnight.
 * @param {string} day - `YYYY-MM-DD`
 * @param {string} [time] - `HH:MM:SS`, noon by default
 * @returns {string}
 */
export function easternMoment(day, time = '12:00:00') {
  for (const offset of ['-05:00', '-04:00']) {
    const value = `${day}T${time}${offset}`;
    if (easternOffset(Date.parse(value)) === offset) return value;
  }
  // Only reachable inside the hour that daylight saving skips; use standard time.
  return `${day}T${time}-05:00`;
}
