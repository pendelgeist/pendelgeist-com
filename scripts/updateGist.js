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
 * Fetches one file's content from a gist via the GitHub API (not the raw CDN
 * URL) so this only ever needs api.github.com to be reachable. Optionally
 * authenticated for a higher rate limit; unauthenticated works fine for
 * public gists.
 * @param {string} gistId @param {string} filename @param {string} [token]
 */
export async function fetchGistFile(gistId, filename, token) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'pendelgeist-com-update-gist-script' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching gist ${gistId}`);
  const gist = await response.json();

  const file = gist.files[filename];
  if (!file) throw new Error(`Gist ${gistId} has no file named "${filename}"`);
  if (!file.truncated) return file.content;

  // Files over ~1MB come back truncated; fall back to raw_url for those.
  const rawResponse = await fetch(file.raw_url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  if (!rawResponse.ok) throw new Error(`HTTP ${rawResponse.status} fetching truncated file ${filename}`);
  return rawResponse.text();
}

/**
 * Resolves the target gist id + filename for "manifest", a season id from
 * the live manifest, or a raw gist URL passed directly.
 * @param {string} target @param {string} [token]
 */
export async function resolveTarget(target, token) {
  if (GIST_RAW_RE.test(target)) return parseGistRawUrl(target);
  if (target === 'manifest') return parseGistRawUrl(MANIFEST_URL);

  const { gistId: manifestGistId, filename: manifestFilename } = parseGistRawUrl(MANIFEST_URL);
  const manifest = JSON.parse(await fetchGistFile(manifestGistId, manifestFilename, token));
  const season = manifest.seasons.find(s => s.id === target);
  if (!season) {
    const known = manifest.seasons.map(s => s.id).join(', ');
    throw new Error(`No season "${target}" in the manifest. Known seasons: ${known}`);
  }
  return parseGistRawUrl(season.file);
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
