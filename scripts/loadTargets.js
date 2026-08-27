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
 * @typedef {Object} Target
 * @property {string} label - how to name this season in output
 * @property {object} season
 * @property {string} [filename] - set only for committed files, where the name
 *   is expected to match the season id. A draft passed on the CLI can be called
 *   anything, so it deliberately has none.
 */

/**
 * Resolves the season(s) a validation script should check: whatever file
 * paths/URLs were passed on the CLI, or every committed season under
 * public/vqar/data/seasons/ if none were.
 * @param {string[]} args
 * @returns {Promise<{ targets: Target[], committed: boolean }>} `committed` says
 *   whether this is the full committed set, which is what makes the
 *   whole-collection checks (unique ids, exactly one current season) meaningful.
 */
export async function resolveTargets(args) {
  if (args.length > 0) {
    const targets = await Promise.all(
      args.map(async source => ({ label: source, season: await loadJson(source) }))
    );
    return { targets, committed: false };
  }

  const targets = readSeasons().map(({ filename, season }) => ({ label: filename, filename, season }));
  return { targets, committed: true };
}
