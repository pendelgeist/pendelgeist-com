import { STATUSES, FORMATS, SECTIONS } from '../public/fsar/schema.js';
import { STREAMING_SERVICES } from '../public/streaming.js';

const STREAMING_KEYS = new Set(Object.keys(STREAMING_SERVICES));
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** @param {unknown} v */
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** @param {unknown} v */
const isProse = (v) => Array.isArray(v) && v.every((p) => typeof p === 'string' && p.trim() !== '');

/**
 * Checks one FSAR review for a well-formed shape. Everything except the
 * identifying fields is optional - a half-written "wip" review is legitimate
 * and still renders - but a review marked "done" has to actually say
 * something, which is the only difference the two statuses make here.
 *
 * @param {object} review - a parsed review JSON file
 * @param {{ filename?: string }} [options] - filename, to check it matches the id
 * @returns {string[]} human-readable issues found; empty if the data is clean
 */
export function validateFsarReview(review, { filename } = {}) {
  const issues = [];
  const label = review?.id || filename || 'review';
  const push = (msg) => issues.push(`"${label}": ${msg}`);

  if (!isPlainObject(review)) return [`"${label}": expected an object`];

  if (typeof review.id !== 'string' || !ID_PATTERN.test(review.id)) {
    push('id must be a lowercase slug (letters, digits, hyphens)');
  } else if (filename && filename !== `${review.id}.json`) {
    push(`id doesn't match its filename (expected ${review.id}.json, got ${filename})`);
  }

  if (!(review.status in STATUSES)) {
    push(`unknown status "${review.status}" (expected one of ${Object.keys(STATUSES).join(', ')})`);
  }
  if (typeof review.titleEN !== 'string' || review.titleEN.trim() === '') {
    push('missing titleEN');
  }
  if (review.titleJP !== undefined && typeof review.titleJP !== 'string') {
    push('malformed titleJP (expected a string)');
  }
  if (!FORMATS.includes(review.format)) {
    push(`unknown format "${review.format}" (expected one of ${FORMATS.join(', ')})`);
  }
  if (!Number.isInteger(review.year) || review.year < 1900 || review.year > 2200) {
    push('year must be a four-digit integer');
  }
  if (review.airedLabel !== undefined && typeof review.airedLabel !== 'string') {
    push('malformed airedLabel (expected a string)');
  }
  for (const key of ['episodeCount', 'episodesWatched']) {
    const value = review[key];
    if (value !== undefined && value !== null && (!Number.isInteger(value) || value < 1)) {
      push(`malformed ${key} (expected a positive integer or null)`);
    }
  }
  if (
    Number.isInteger(review.episodeCount) && Number.isInteger(review.episodesWatched) &&
    review.episodesWatched > review.episodeCount
  ) {
    push('episodesWatched is greater than episodeCount');
  }
  if (!review.dateReviewed || Number.isNaN(Date.parse(review.dateReviewed))) {
    push('missing or unparseable dateReviewed');
  }
  if (review.dateUpdated !== undefined && Number.isNaN(Date.parse(review.dateUpdated))) {
    push('unparseable dateUpdated');
  }

  if (!isPlainObject(review.verdict)) {
    push('missing verdict');
  } else {
    const { ratingNumber, ratingText, oneLiner } = review.verdict;
    if (ratingNumber !== undefined && ratingNumber !== null &&
        (typeof ratingNumber !== 'number' || ratingNumber < 0 || ratingNumber > 5)) {
      push('verdict.ratingNumber must be a number from 0 to 5, or null');
    }
    for (const [key, value] of Object.entries({ ratingText, oneLiner })) {
      if (value !== undefined && typeof value !== 'string') {
        push(`malformed verdict.${key} (expected a string)`);
      }
    }
    if (review.status === 'done' && !String(oneLiner ?? '').trim()) {
      push('is marked done but has no verdict.oneLiner');
    }
  }

  for (const key of ['recommendedFor', 'notFor', 'tags']) {
    const value = review[key];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
      push(`malformed ${key} (expected an array of non-empty strings)`);
    }
  }
  for (const tag of review.tags ?? []) {
    if (typeof tag === 'string' && !TAG_PATTERN.test(tag)) {
      push(`tag "${tag}" must be a lowercase slug (letters, digits, hyphens)`);
    }
  }

  for (const key of ['anilistId', 'annId']) {
    if (review[key] !== undefined && !Number.isInteger(review[key])) {
      push(`malformed ${key} (expected an integer)`);
    }
  }
  if (review.streaming !== undefined) {
    if (!Array.isArray(review.streaming)) {
      push('malformed streaming (expected an array)');
    } else {
      for (const service of review.streaming) {
        if (!STREAMING_KEYS.has(service)) {
          push(`unknown streaming service "${service}" (expected one of ${[...STREAMING_KEYS].join(', ')})`);
        }
      }
    }
  }
  for (const key of ['crunchyrollUrl', 'hidiveUrl', 'netflixUrl', 'availabilityNote']) {
    if (review[key] !== undefined && typeof review[key] !== 'string') {
      push(`malformed ${key} (expected a string)`);
    }
  }
  if (review.vqar !== undefined && !isPlainObject(review.vqar)) {
    push('malformed vqar (expected an object)');
  }

  if (!isPlainObject(review.sections)) {
    push('missing sections');
    return issues;
  }

  const knownSections = new Set([...SECTIONS.map((s) => s.key), 'notes', 'spoilers']);
  for (const key of Object.keys(review.sections)) {
    if (!knownSections.has(key)) {
      push(`unknown section "${key}" (expected one of ${[...knownSections].join(', ')}) - free-form material belongs in notes or spoilers`);
    }
  }

  for (const { key, kind } of SECTIONS) {
    const section = review.sections[key];
    if (section === undefined) continue;
    if (kind === 'prose') {
      if (!isProse(section)) push(`section "${key}" must be an array of non-empty paragraphs`);
      continue;
    }
    if (!isPlainObject(section)) {
      push(`section "${key}" must be an object ({ ratingText?, body })`);
    } else {
      if (section.ratingText !== undefined && typeof section.ratingText !== 'string') {
        push(`section "${key}" has a malformed ratingText (expected a string)`);
      }
      if (section.body !== undefined && !isProse(section.body)) {
        push(`section "${key}" body must be an array of non-empty paragraphs`);
      }
    }
  }

  for (const key of ['notes', 'spoilers']) {
    const blocks = review.sections[key];
    if (blocks === undefined) continue;
    if (!Array.isArray(blocks)) {
      push(`section "${key}" must be an array of { heading, body } blocks`);
      continue;
    }
    blocks.forEach((block, i) => {
      if (!isPlainObject(block)) {
        push(`${key}[${i}] must be a { heading, body } object`);
        return;
      }
      if (typeof block.heading !== 'string' || block.heading.trim() === '') {
        push(`${key}[${i}] is missing a heading`);
      }
      if (!isProse(block.body)) {
        push(`${key}[${i}] body must be an array of non-empty paragraphs`);
      }
    });
  }

  if (review.status === 'done') {
    const hasProse = SECTIONS.some(({ key, kind }) => {
      const section = review.sections[key];
      return kind === 'prose' ? isProse(section) : isProse(section?.body);
    });
    if (!hasProse) push('is marked done but has no written sections');
  }

  return issues;
}

/**
 * Cross-checks a whole set of reviews for collisions.
 * @param {object[]} reviews
 * @returns {string[]}
 */
export function validateFsarCollection(reviews) {
  const issues = [];
  const seen = new Map();
  for (const review of reviews) {
    if (seen.has(review.id)) issues.push(`duplicate id "${review.id}"`);
    seen.set(review.id, true);
  }
  return issues;
}
