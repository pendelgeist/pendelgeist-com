import { readFile } from 'node:fs/promises';
import { readSeasons } from './build-vqar-index.js';

/** @param {string} source - a file path or an http(s) URL */
async function loadJson(source) {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${source}`);
    return response.json();
  }
  return JSON.parse(await readFile(source, 'utf-8'));
}

/**
 * Resolves the season(s) a validation script should check: whatever file
 * paths/URLs were passed on the CLI, or every committed season under
 * public/vqar/data/seasons/ if none were.
 * @param {string[]} args
 * @returns {Promise<{ label: string, season: object }[]>}
 */
export async function resolveTargets(args) {
  if (args.length > 0) {
    return Promise.all(args.map(async source => ({ label: source, season: await loadJson(source) })));
  }

  return readSeasons().map(({ filename, season }) => ({ label: filename, season }));
}
