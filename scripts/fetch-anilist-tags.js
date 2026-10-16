#!/usr/bin/env node
/**
 * Fills in each reviewed show's generated `anilist` object - format, genres,
 * tags, main studios - from AniList, for every committed VQAR season. The
 * site never calls AniList itself: this runs by hand, and the result is
 * committed like any other data change.
 *
 * Only reviews with an `anilistId` can be filled in; the rest are listed at
 * the end (`npm run validate-anilist` suggests ids for them). A show AniList
 * doesn't return keeps whatever `anilist` data it already had.
 *
 *   npm run fetch-anilist-tags                  # fetch and write
 *   npm run fetch-anilist-tags -- --dry-run     # fetch and report, write nothing
 *   npm run fetch-anilist-tags -- --delay=3000  # slower, if AniList starts rate-limiting
 *
 * Where this machine can't reach AniList, run the queries by hand instead:
 *
 *   npm run fetch-anilist-tags -- --print-queries          # the queries to run in https://anilist.co/graphiql
 *   npm run fetch-anilist-tags -- --from=q1.json,q2.json   # then import the saved responses
 *
 * Then `npm run build-vqar-index` and `npm test`, as with any season edit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SEASONS_DIR } from './build-vqar-index.js';
import { anilistRequest } from './anilistClient.js';
import {
  fetchMediaByIds, mediaFromResponses, applyAnilistFields, replaceReviewed, MEDIA_BY_IDS_QUERY, BATCH_SIZE,
} from './anilistTags.js';

const DEFAULT_DELAY_MS = 1500;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const delayArg = args.find(a => a.startsWith('--delay='));
  const delayMs = delayArg ? Number(delayArg.split('=')[1]) : DEFAULT_DELAY_MS;

  const files = fs.readdirSync(SEASONS_DIR).filter(f => f.endsWith('.json')).sort();
  const seasons = files.map(filename => {
    const file = path.join(SEASONS_DIR, filename);
    const raw = fs.readFileSync(file, 'utf-8');
    return { filename, file, raw, season: JSON.parse(raw) };
  });

  const ids = [...new Set(seasons.flatMap(s => (s.season.reviewed ?? []).map(r => r.anilistId).filter(Boolean)))]
    .sort((a, b) => a - b);

  if (args.includes('--print-queries')) {
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      console.log(`# Query ${i / BATCH_SIZE + 1} of ${Math.ceil(ids.length / BATCH_SIZE)} (${batch.length} shows)`);
      // The script's own query, with this batch's ids written in and the
      // variable declaration dropped, so it runs as pasted.
      const query = MEDIA_BY_IDS_QUERY
        .replace('#graphql', '').replace('query($ids: [Int]) ', '').replace('$ids', `[${batch.join(', ')}]`)
        .trim().split('\n').map(line => line.replace(/^ {2}/, '')).join('\n');
      console.log(query);
      console.log('');
    }
    return;
  }

  const fromArg = args.find(a => a.startsWith('--from='));
  let mediaById;
  if (fromArg) {
    const sources = fromArg.slice('--from='.length).split(',').filter(Boolean);
    mediaById = mediaFromResponses(sources.map(source => JSON.parse(fs.readFileSync(source, 'utf-8'))));
    console.log(`Read ${mediaById.size} show(s) from ${sources.length} saved response(s).`);
  } else {
    console.log(`Looking up ${ids.length} show(s) on AniList...`);
    mediaById = await fetchMediaByIds(ids, { request: anilistRequest, delayMs });
  }

  const noId = [];
  const notFound = [];
  for (const { filename, file, raw, season } of seasons) {
    const result = applyAnilistFields(season, mediaById);
    noId.push(...result.noId.map(t => `${t} (${filename})`));
    notFound.push(...result.notFound.map(t => `${t} (${filename})`));
    console.log(`${filename}: ${result.updated.length} updated, ${result.unchanged} unchanged`);
    for (const title of result.updated) console.log(`  ~ ${title}`);
    if (result.updated.length > 0 && !dryRun) {
      fs.writeFileSync(file, replaceReviewed(raw, result.reviewed));
    }
  }

  if (notFound.length > 0) {
    console.log(`\nAniList returned nothing for ${notFound.length} id(s) - check them with npm run validate-anilist:`);
    for (const title of notFound) console.log(`  ? ${title}`);
  }
  if (noId.length > 0) {
    console.log(`\n${noId.length} review(s) have no anilistId, so no tags (npm run validate-anilist suggests ids):`);
    for (const title of noId) console.log(`  - ${title}`);
  }
  if (dryRun) console.log('\n--dry-run: nothing written.');
}

main().catch(error => {
  console.error(`fetch-anilist-tags failed: ${error.message}`);
  process.exitCode = 1;
});
