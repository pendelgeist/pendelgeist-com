import { MANIFEST_URL } from '../public/manifest-url.js';

const GIST_RAW_RE = /^https:\/\/gist\.githubusercontent\.com\/[^/]+\/([0-9a-f]+)\/raw\/(?:[0-9a-f]+\/)?(.+)$/;

/** @param {string} url */
export function parseGistRawUrl(url) {
  const match = GIST_RAW_RE.exec(url);
  if (!match) throw new Error(`Not a gist raw URL: ${url}`);
  const [, gistId, filename] = match;
  return { gistId, filename };
}

/**
 * Resolves the target gist raw URL for "manifest", a season id from the live
 * manifest, or a raw gist URL passed directly.
 * @param {string} target
 */
export async function resolveTargetUrl(target) {
  if (GIST_RAW_RE.test(target)) return target;
  if (target === 'manifest') return MANIFEST_URL;

  const manifest = await (await fetch(MANIFEST_URL)).json();
  const season = manifest.seasons.find(s => s.id === target);
  if (!season) {
    const known = manifest.seasons.map(s => s.id).join(', ');
    throw new Error(`No season "${target}" in the manifest. Known seasons: ${known}`);
  }
  return season.file;
}

/** @param {unknown} value */
export function isSeasonData(value) {
  return value !== null && typeof value === 'object' && ('reviewed' in value || 'pending' in value || 'skipped' in value);
}

/** @param {string[]} before @param {string[]} after */
function diffLists(before, after) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter(item => !beforeSet.has(item)),
    removed: before.filter(item => !afterSet.has(item)),
  };
}

/**
 * Summarizes what changed between the live gist content and a locally-edited
 * version, so a write is never a total guess.
 * @returns {string[]} human-readable diff lines; a single "(no change)" line if nothing differs
 */
export function summarizeDiff(before, after) {
  if (!isSeasonData(before) || !isSeasonData(after)) {
    const same = JSON.stringify(before) === JSON.stringify(after);
    return [same ? '(no change)' : 'content differs (not a recognized season shape, showing no further detail)'];
  }

  const lines = [];
  const beforeReviewed = Array.isArray(before.reviewed) ? before.reviewed : [];
  const afterReviewed = Array.isArray(after.reviewed) ? after.reviewed : [];
  const { added, removed } = diffLists(beforeReviewed.map(r => r.titleEN), afterReviewed.map(r => r.titleEN));

  for (const title of added) lines.push(`+ reviewed: "${title}"`);
  for (const title of removed) lines.push(`- reviewed: "${title}"`);

  const beforeByTitle = new Map(beforeReviewed.map(r => [r.titleEN, r]));
  for (const r of afterReviewed) {
    const prior = beforeByTitle.get(r.titleEN);
    if (prior && JSON.stringify(prior) !== JSON.stringify(r)) lines.push(`~ reviewed: "${r.titleEN}" edited`);
  }

  for (const key of ['pending', 'skipped']) {
    const { added, removed } = diffLists(before[key] ?? [], after[key] ?? []);
    for (const title of added) lines.push(`+ ${key}: "${title}"`);
    for (const title of removed) lines.push(`- ${key}: "${title}"`);
  }

  return lines.length > 0 ? lines : ['(no change)'];
}
