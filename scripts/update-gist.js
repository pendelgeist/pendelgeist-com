#!/usr/bin/env node
/**
 * Pushes a locally-edited VQAR gist file (a season, or the manifest) back to
 * GitHub, replacing the manual "copy JSON, paste into the gist editor" step.
 * Runs as a dry run (prints a diff summary, writes nothing) unless --write is
 * passed. Season files are also run through validateSeason first; a season
 * with issues is never pushed, --write or not.
 *
 *   node scripts/update-gist.js spring-2026 ./draft-season.json           # dry run
 *   node scripts/update-gist.js spring-2026 ./draft-season.json --write   # push it
 *   node scripts/update-gist.js manifest ./draft-manifest.json --write
 *
 * Requires a GITHUB_TOKEN env var (a fine-grained PAT with just the "Gists"
 * write permission, or a classic token with the `gist` scope) to actually
 * write - dry runs work without one.
 */
import { readFile } from 'node:fs/promises';
import { validateSeason } from './validateSeason.js';
import { parseGistRawUrl, resolveTargetUrl, isSeasonData, summarizeDiff } from './updateGist.js';

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const [target, filePath] = args.filter(a => a !== '--write');

  if (!target || !filePath) {
    console.error('Usage: node scripts/update-gist.js <season-id|manifest|gist-raw-url> <local-file.json> [--write]');
    process.exitCode = 1;
    return;
  }

  const url = await resolveTargetUrl(target);
  const { gistId, filename } = parseGistRawUrl(url);

  const updated = JSON.parse(await readFile(filePath, 'utf-8'));

  if (isSeasonData(updated)) {
    const issues = validateSeason(updated);
    if (issues.length > 0) {
      console.error(`✘ ${filePath} has ${issues.length} issue(s), not pushing:`);
      for (const issue of issues) console.error(`  - ${issue}`);
      process.exitCode = 1;
      return;
    }
  }

  const liveResponse = await fetch(`${url}?_=${Date.now()}`);
  if (!liveResponse.ok) throw new Error(`HTTP ${liveResponse.status} fetching current ${url}`);
  const live = await liveResponse.json();

  console.log(`${filename} (gist ${gistId}):`);
  for (const line of summarizeDiff(live, updated)) console.log(`  ${line}`);

  if (!write) {
    console.log('\nDry run - no changes pushed. Re-run with --write to push this to the gist.');
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN env var is required to --write (a PAT with gist write access)');

  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'pendelgeist-com-update-gist-script',
    },
    body: JSON.stringify({ files: { [filename]: { content: JSON.stringify(updated, null, 2) } } }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} updating gist ${gistId}: ${await response.text()}`);

  console.log(`\n✔ Pushed to https://gist.github.com/${gistId}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
