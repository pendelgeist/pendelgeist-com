import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  anilistFields, fetchMediaByIds, mediaFromResponses, applyAnilistFields, replaceReviewed, BATCH_SIZE, MIN_TAG_RANK,
  searchQueries, searchText, seasonFilter, searchResultsFromResponses, applySearchResults, SEARCH_BATCH_SIZE,
} from '../scripts/anilistTags.js';
import { titlesLikelyMatch } from '../scripts/anilistMatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = path.join(__dirname, '../public/vqar/data/seasons');

const media = {
  id: 101,
  format: 'TV',
  genres: ['Action', 'Fantasy'],
  tags: [
    { name: 'Male Protagonist', rank: 70, isGeneralSpoiler: false, isMediaSpoiler: false, isAdult: false },
    { name: 'Isekai', rank: 95, isGeneralSpoiler: false, isMediaSpoiler: false, isAdult: false },
    { name: 'Barely Relevant', rank: MIN_TAG_RANK - 1, isGeneralSpoiler: false, isMediaSpoiler: false, isAdult: false },
    { name: 'Big Twist', rank: 90, isGeneralSpoiler: false, isMediaSpoiler: true, isAdult: false },
    { name: 'Ending Reveal', rank: 90, isGeneralSpoiler: true, isMediaSpoiler: false, isAdult: false },
    { name: 'Nudity', rank: 80, isGeneralSpoiler: false, isMediaSpoiler: false, isAdult: true },
  ],
  studios: { nodes: [{ name: 'Satelight' }] },
};

test('anilistFields keeps relevant, spoiler-free, non-adult tags, most relevant first', () => {
  assert.deepEqual(anilistFields(media), {
    format: 'TV',
    genres: ['Action', 'Fantasy'],
    tags: ['Isekai', 'Male Protagonist'],
    studios: ['Satelight'],
  });
});

test('anilistFields leaves format out when AniList has none, and copes with missing lists', () => {
  assert.deepEqual(anilistFields({ id: 1, format: null }), { genres: [], tags: [], studios: [] });
});

test('fetchMediaByIds looks ids up in batches of BATCH_SIZE, each id once', async () => {
  const ids = Array.from({ length: BATCH_SIZE + 3 }, (_, i) => i + 1);
  const calls = [];
  const request = async (query, { ids: batch }) => {
    calls.push(batch);
    return { Page: { media: batch.map(id => ({ id })) } };
  };
  const byId = await fetchMediaByIds([...ids, 1, 2], { request });
  assert.deepEqual(calls.map(c => c.length), [BATCH_SIZE, 3]);
  assert.equal(byId.size, BATCH_SIZE + 3);
});

test('mediaFromResponses takes a whole saved response or just its data, and rejects errors', () => {
  const byId = mediaFromResponses([
    { data: { Page: { media: [{ id: 1 }] } } },
    { Page: { media: [{ id: 2 }] } },
  ]);
  assert.deepEqual([...byId.keys()], [1, 2]);
  assert.throws(() => mediaFromResponses([{ errors: [{ message: 'Too Many Requests.' }] }]), /Too Many Requests/);
  assert.throws(() => mediaFromResponses([{ data: { Media: { id: 1 } } }]), /no Page.media/);
});

test('applyAnilistFields sets only `anilist`, and reports the shows it could not fill in', () => {
  const season = {
    reviewed: [
      { titleEN: 'Tagged', anilistId: 101, review: 'kept as is' },
      { titleEN: 'No Id', review: 'x' },
      { titleEN: 'Gone From AniList', anilistId: 999, anilist: { genres: ['Drama'], tags: [], studios: [] } },
    ],
  };
  const result = applyAnilistFields(season, new Map([[101, media]]));

  assert.deepEqual(result.updated, ['Tagged']);
  assert.deepEqual(result.noId, ['No Id']);
  assert.deepEqual(result.notFound, ['Gone From AniList']);
  assert.equal(result.reviewed[0].review, 'kept as is');
  assert.deepEqual(result.reviewed[0].anilist.tags, ['Isekai', 'Male Protagonist']);
  // A show AniList didn't return keeps what it had, rather than losing it.
  assert.deepEqual(result.reviewed[2].anilist.genres, ['Drama']);

  const again = applyAnilistFields({ reviewed: result.reviewed }, new Map([[101, media]]));
  assert.deepEqual(again.updated, []);
  assert.equal(again.unchanged, 1);
});

test('replaceReviewed leaves every committed season file byte-for-byte as it was', () => {
  for (const file of fs.readdirSync(SEASONS_DIR).filter(f => f.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(SEASONS_DIR, file), 'utf-8');
    assert.equal(replaceReviewed(raw, JSON.parse(raw).reviewed), raw, file);
  }
});

test('replaceReviewed rewrites only the reviewed block, keeping compact lines elsewhere as written', () => {
  const raw = [
    '{',
    '  "id": "fall-2026",',
    '  "reviewed": [',
    '    {',
    '      "titleEN": "A"',
    '    }',
    '  ],',
    '  "pending": [',
    '    { "title": "Compact", "firstEpisode": "2026-10-20" }',
    '  ]',
    '}',
    '',
  ].join('\n');
  const next = replaceReviewed(raw, [{ titleEN: 'A', anilist: { genres: ['Comedy'], tags: [], studios: [] } }]);
  assert.deepEqual(JSON.parse(next).reviewed[0].anilist.genres, ['Comedy']);
  assert.ok(next.includes('    { "title": "Compact", "firstEpisode": "2026-10-20" }'));
  assert.ok(next.endsWith('  ]\n}\n'));
});

test('search text drops a trailing remake year; the season filter comes from the season id', () => {
  assert.equal(searchText('Magic Knight Rayearth (2026)'), 'Magic Knight Rayearth');
  assert.equal(searchText('Lupin III (Part 7)'), 'Lupin III (Part 7)');
  assert.deepEqual(seasonFilter('fall-2026'), { season: 'FALL', seasonYear: 2026 });
  assert.equal(seasonFilter('special-2026'), null);
});

test('search queries are batched, aliased per review, narrowed to the season, and use Page so a miss is no error', () => {
  const entries = Array.from({ length: SEARCH_BATCH_SIZE + 1 }, (_, i) => ({ seasonId: 'fall-2026', index: i, title: `Show "${i}"` }));
  const queries = searchQueries(entries);
  assert.equal(queries.length, 2);
  assert.match(queries[0], /fall_2026__0: Page\(perPage: 1\) \{ media\(search: "Show \\"0\\"", type: ANIME, season: FALL, seasonYear: 2026\)/);
  assert.match(queries[1], /fall_2026__12:/);
  assert.match(queries[1], /fragment Show on Media/);
});

test('search results come from Page or older Media responses, and a "Not Found." miss is null, not a failure', () => {
  const results = searchResultsFromResponses([
    { data: { fall_2026__0: { media: [{ id: 1 }] }, fall_2026__1: { media: [] } } },
    { errors: [{ message: 'Not Found.' }], data: { fall_2026__2: null, fall_2026__3: { id: 4 } } },
  ]);
  assert.deepEqual(Object.fromEntries(results), { fall_2026__0: { id: 1 }, fall_2026__1: null, fall_2026__2: null, fall_2026__3: { id: 4 } });
  assert.throws(() => searchResultsFromResponses([{ errors: [{ message: 'Too Many Requests.' }], data: null }]), /Too Many Requests/);
});

test('linking sets the id, the native title and the tags, holds back unlike titles, and keeps an existing titleJP', () => {
  const season = {
    id: 'fall-2026',
    reviewed: [
      { titleEN: 'Overgeared' },
      { titleEN: 'Kanata Kara' },
      { titleEN: 'Already Linked', anilistId: 9 },
      { titleEN: 'Has A Title', titleJP: '既存' },
      { titleEN: 'Nowhere To Be Found' },
    ],
  };
  const media = (id, english, native) => ({ ...withTags, id, title: { romaji: 'r', english, native } });
  const withTags = { format: 'TV', genres: ['Action'], tags: [], studios: { nodes: [] } };
  const results = new Map([
    ['fall_2026__0', media(10, 'Overgeared', 'テムパル')],
    ['fall_2026__1', media(11, 'Something Else Entirely', 'ほか')],
    ['fall_2026__3', media(13, 'Has A Title', '新しい')],
    ['fall_2026__4', null],
  ]);

  const out = applySearchResults(season, results, { titlesLikelyMatch });
  assert.deepEqual(out.linked, ['Overgeared', 'Has A Title']);
  assert.deepEqual(out.unsure.map(u => u.alias), ['fall_2026__1']);
  assert.deepEqual(out.notFound.map(n => n.title), ['Nowhere To Be Found']);
  assert.equal(out.reviewed[0].anilistId, 10);
  assert.equal(out.reviewed[0].titleJP, 'テムパル');
  assert.deepEqual(out.reviewed[0].anilist.genres, ['Action']);
  assert.equal(out.reviewed[1].anilistId, undefined);
  assert.equal(out.reviewed[3].titleJP, '既存');

  const accepted = applySearchResults(season, results, { titlesLikelyMatch, accept: new Set(['fall_2026__1']) });
  assert.equal(accepted.reviewed[1].anilistId, 11);
});

test('--any-season searches drop the season filter', () => {
  const [query] = searchQueries([{ seasonId: 'fall-2026', index: 3, title: 'Lost Show' }], { anySeason: true });
  assert.match(query, /fall_2026__3: Page\(perPage: 1\) \{ media\(search: "Lost Show", type: ANIME\)/);
});
