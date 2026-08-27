#!/usr/bin/env node
/**
 * Validates VQAR season data for internal consistency. Run with no arguments to
 * check every committed season under public/vqar/data/seasons/, or pass one or
 * more file paths / URLs to check specific season JSON directly (handy for
 * checking a draft before it lands in the repo).
 *
 * The committed data is checked by test/vqar-data.test.js too, so CI catches
 * anything this would; this is the same check on demand, and the only way to
 * point it at a file that isn't committed yet.
 *
 *   npm run validate-vqar
 *   npm run validate-vqar -- ./draft-season.json
 */
import { validateSeason, validateSeasonCollection } from './validateSeason.js';
import { resolveTargets } from './loadTargets.js';

async function main() {
  const targets = await resolveTargets(process.argv.slice(2));

  let anyIssues = false;
  for (const { label, season } of targets) {
    const issues = validateSeason(season, { filename: label.split('/').pop() });
    if (issues.length === 0) {
      console.log(`✔ ${label}: OK`);
      continue;
    }
    anyIssues = true;
    console.log(`✘ ${label}: ${issues.length} issue(s)`);
    for (const issue of issues) console.log(`  - ${issue}`);
  }

  // Only meaningful over a full set - a single hand-picked draft is not
  // expected to be the one season carrying `current: true`.
  if (targets.length > 1) {
    const issues = validateSeasonCollection(targets.map(t => t.season));
    if (issues.length > 0) {
      anyIssues = true;
      console.log(`✘ across all seasons: ${issues.length} issue(s)`);
      for (const issue of issues) console.log(`  - ${issue}`);
    }
  }

  process.exitCode = anyIssues ? 1 : 0;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
