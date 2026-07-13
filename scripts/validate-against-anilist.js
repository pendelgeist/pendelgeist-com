#!/usr/bin/env node
/**
 * Cross-checks VQAR season data against AniList's public GraphQL API
 * (https://anilist.co/graphiql) — the same one linked from the site for full
 * show metadata. This is a separate, slower check from validate-gists.js:
 * it makes one live AniList request per show, so it's meant to be run
 * occasionally rather than in CI.
 *
 * For each reviewed show:
 *   - if it has an `anilistId`, confirms that id still resolves to a show
 *     with a matching title (catches typos/drift if the wrong id got pasted in)
 *   - if it doesn't, searches AniList by title and suggests an `anilistId`
 *     to add when a confident match is found
 * For pending/skipped titles (plain strings, nowhere to attach an id), it
 * just flags titles AniList has no confident match for, as a spelling check.
 *
 *   npm run validate-anilist
 *   npm run validate-anilist -- ./draft-season.json
 *   npm run validate-anilist -- --delay=2000   # slower, if AniList starts rate-limiting
 */
import { resolveTargets } from './loadTargets.js';
import { titlesLikelyMatch } from './anilistMatch.js';

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const DEFAULT_DELAY_MS = 1500;

const MEDIA_BY_ID_QUERY = `#graphql
  query($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      siteUrl
      title { romaji english native }
    }
  }
`;

const MEDIA_BY_SEARCH_QUERY = `#graphql
  query($search: String) {
    Media(search: $search, type: ANIME) {
      id
      siteUrl
      title { romaji english native }
    }
  }
`;

async function anilistRequest(query, variables) {
  const response = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors) {
    const message = body.errors?.map(e => e.message).join('; ') ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body.data;
}

const lookupById = (id) => anilistRequest(MEDIA_BY_ID_QUERY, { id }).then(d => d.Media);
const lookupBySearch = (search) => anilistRequest(MEDIA_BY_SEARCH_QUERY, { search }).then(d => d.Media);

/** @param {{ title: { romaji?: string, english?: string, native?: string } }} media */
function titlesOf(media) {
  return [media.title?.romaji, media.title?.english, media.title?.native].filter(Boolean);
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @param {object} review
 * @param {string[]} issues
 * @param {string[]} suggestions
 */
async function checkReviewed(review, issues, suggestions) {
  const title = review.titleEN;

  if (review.anilistId) {
    let media;
    try {
      media = await lookupById(review.anilistId);
    } catch (err) {
      issues.push(`"${title}": AniList lookup for id ${review.anilistId} failed: ${err.message}`);
      return;
    }
    if (!media) {
      issues.push(`"${title}": anilistId ${review.anilistId} doesn't exist on AniList`);
      return;
    }
    if (!titlesLikelyMatch(title, titlesOf(media))) {
      issues.push(`"${title}": anilistId ${review.anilistId} points at "${media.title.romaji}" on AniList, titles don't match`);
    }
    return;
  }

  let media;
  try {
    media = await lookupBySearch(title);
  } catch (err) {
    issues.push(`"${title}": AniList search failed: ${err.message}`);
    return;
  }
  if (!media) {
    issues.push(`"${title}": no AniList match found (check spelling, or it may not be listed as an anime)`);
    return;
  }
  if (titlesLikelyMatch(title, titlesOf(media))) {
    suggestions.push(`"${title}": matches AniList id ${media.id} (${media.siteUrl}) — consider adding "anilistId": ${media.id}`);
  } else {
    issues.push(`"${title}": closest AniList search match is "${media.title.romaji}" (id ${media.id}) — verify this is the right show`);
  }
}

/**
 * @param {string} title
 * @param {string[]} issues
 */
async function checkTitleExists(title, issues) {
  let media;
  try {
    media = await lookupBySearch(title);
  } catch (err) {
    issues.push(`"${title}": AniList search failed: ${err.message}`);
    return;
  }
  if (!media || !titlesLikelyMatch(title, titlesOf(media))) {
    issues.push(`"${title}": no confident AniList match found (check spelling)`);
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const delayArg = rawArgs.find(a => a.startsWith('--delay='));
  const delayMs = delayArg ? Number(delayArg.split('=')[1]) : DEFAULT_DELAY_MS;
  const targets = await resolveTargets(rawArgs.filter(a => !a.startsWith('--')));

  let anyIssues = false;
  for (const { label, season } of targets) {
    const issues = [];
    const suggestions = [];

    for (const review of season.reviewed ?? []) {
      await checkReviewed(review, issues, suggestions);
      await delay(delayMs);
    }
    for (const title of [...(season.pending ?? []), ...(season.skipped ?? [])]) {
      await checkTitleExists(title, issues);
      await delay(delayMs);
    }

    if (issues.length > 0) anyIssues = true;
    const status = issues.length === 0 ? '✔' : '✘';
    console.log(`${status} ${label}: ${issues.length} issue(s), ${suggestions.length} suggestion(s)`);
    for (const issue of issues) console.log(`  - ${issue}`);
    for (const suggestion of suggestions) console.log(`  + ${suggestion}`);
  }

  process.exitCode = anyIssues ? 1 : 0;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
