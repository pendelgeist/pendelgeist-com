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
import { readFile } from 'node:fs/promises';
import { validateSeason } from './validateSeason.js';
import { MANIFEST_URL } from '../public/manifest-url.js';

/** @param {string} source - a file path or an http(s) URL */
async function loadJson(source) {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${source}`);
    return response.json();
  }
  return JSON.parse(await readFile(source, 'utf-8'));
}

/** @returns {Promise<{ label: string, season: object }[]>} */
async function resolveTargets(args) {
  if (args.length > 0) {
    return Promise.all(args.map(async source => ({ label: source, season: await loadJson(source) })));
  }

  const manifest = await loadJson(MANIFEST_URL);
  return Promise.all(
    manifest.seasons.map(async meta => ({ label: meta.name, season: await loadJson(meta.file) }))
  );
}

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
