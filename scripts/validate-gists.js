#!/usr/bin/env node
/**
 * Validates VQAR season gist data for internal consistency. Run with no
 * arguments to fetch the live manifest and check every season it lists, or
 * pass one or more file paths / URLs to check specific season JSON directly
 * (handy for checking a draft before pasting it into a gist).
 *
 *   npm run validate-gists
 *   npm run validate-gists -- ./draft-season.json
 */
import { validateSeason } from './validateSeason.js';
import { resolveTargets } from './loadTargets.js';

async function main() {
  const targets = await resolveTargets(process.argv.slice(2));

  let anyIssues = false;
  for (const { label, season } of targets) {
    const issues = validateSeason(season);
    if (issues.length === 0) {
      console.log(`✔ ${label}: OK`);
      continue;
    }
    anyIssues = true;
    console.log(`✘ ${label}: ${issues.length} issue(s)`);
    for (const issue of issues) console.log(`  - ${issue}`);
  }

  process.exitCode = anyIssues ? 1 : 0;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
