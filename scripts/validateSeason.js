// Keep in sync with STREAMING_SERVICES in public/vqar/app.js.
const STREAMING_KEYS = new Set(['crunchyroll', 'hidive', 'youtube', 'netflix', 'hulu', 'prime']);

/** @param {string[]} list */
function findDuplicates(list) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of list) {
    if (seen.has(item)) duplicates.add(item);
    seen.add(item);
  }
  return [...duplicates];
}

/**
 * Checks a single season's data for internal consistency: a show shouldn't be
 * reviewed and still sitting in pending/skipped, shouldn't be in both pending
 * and skipped, and shouldn't be listed twice in the same list. Also flags
 * reviews missing required fields or with an unparseable date.
 * @param {object} season - a SeasonData object ({ reviewed, pending, skipped })
 * @returns {string[]} human-readable issues found; empty if the data is clean
 */
export function validateSeason(season) {
  const issues = [];
  const reviewed = Array.isArray(season.reviewed) ? season.reviewed : [];
  const pending = Array.isArray(season.pending) ? season.pending : [];
  const skipped = Array.isArray(season.skipped) ? season.skipped : [];

  const reviewedTitles = reviewed.map(r => r.titleEN);
  const reviewedSet = new Set(reviewedTitles);
  const pendingSet = new Set(pending);
  const skippedSet = new Set(skipped);

  for (const title of reviewedSet) {
    if (pendingSet.has(title)) issues.push(`"${title}" is reviewed but still listed in pending`);
    if (skippedSet.has(title)) issues.push(`"${title}" is reviewed but also listed in skipped`);
  }
  for (const title of pendingSet) {
    if (skippedSet.has(title)) issues.push(`"${title}" is in both pending and skipped`);
  }

  for (const dupe of findDuplicates(reviewedTitles)) issues.push(`"${dupe}" appears more than once in reviewed`);
  for (const dupe of findDuplicates(pending)) issues.push(`"${dupe}" appears more than once in pending`);
  for (const dupe of findDuplicates(skipped)) issues.push(`"${dupe}" appears more than once in skipped`);

  reviewed.forEach((r, i) => {
    const label = r.titleEN || `reviewed[${i}]`;
    if (!r.titleEN) issues.push(`reviewed[${i}] is missing titleEN`);
    if (!r.ratingText) issues.push(`"${label}" is missing ratingText`);
    if (!r.dateReviewed || Number.isNaN(Date.parse(r.dateReviewed))) {
      issues.push(`"${label}" has a missing or unparseable dateReviewed`);
    }
    if (r.anilistId !== undefined && !Number.isInteger(r.anilistId)) {
      issues.push(`"${label}" has a malformed anilistId (expected an integer)`);
    }
    if (r.annId !== undefined && !Number.isInteger(r.annId)) {
      issues.push(`"${label}" has a malformed annId (expected an integer)`);
    }
    if (r.streaming !== undefined) {
      if (!Array.isArray(r.streaming)) {
        issues.push(`"${label}" has a malformed streaming (expected an array)`);
      } else {
        for (const service of r.streaming) {
          if (!STREAMING_KEYS.has(service)) {
            issues.push(`"${label}" has an unknown streaming service "${service}" (expected one of ${[...STREAMING_KEYS].join(', ')})`);
          }
        }
      }
    }
    if (r.watchProgress !== undefined && typeof r.watchProgress !== 'string') {
      issues.push(`"${label}" has a malformed watchProgress (expected a string)`);
    }
    for (const key of ['fullReview', 'op', 'ed']) {
      if (r[key] !== undefined && (typeof r[key] !== 'object' || r[key] === null || Array.isArray(r[key]))) {
        issues.push(`"${label}" has a malformed ${key} (expected an object)`);
      }
    }
  });

  return issues;
}
