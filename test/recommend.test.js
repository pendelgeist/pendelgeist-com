import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graphql, buildSchema, parse } from 'graphql';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { buildAniListQuery, parseAniListResponse, buildProfile, recommend, candidateIds } from '../src/recommend.js';
import { typeDefs, makeRootValue } from '../src/schema.js';
import { createPathFetchStub, waitFor } from './helpers.js';

/** An AniList media as the liked searches return it. */
function media(id, genres, tags = [], { relations = [], title = `Show ${id}` } = {}) {
  return {
    id,
    title: { english: title, romaji: title },
    genres,
    tags: tags.map((name) => ({ name, rank: 80, isGeneralSpoiler: false, isMediaSpoiler: false, isAdult: false })),
    relations: { nodes: relations.map((rid) => ({ id: rid })) },
  };
}

/** A review with a generated `anilist` object. */
function review(titleEN, anilistId, ratingNumber, genres, tags = [], extra = {}) {
  return { titleEN, anilistId, ratingNumber, ratingText: 'x', dateReviewed: '2026-07-01T08:00:00-04:00', anilist: { genres, tags, studios: [] }, season: 'summer-2026', seasonName: 'Summer 2026', ...extra };
}

const liked = [
  media(1, ['Action', 'Supernatural'], ['Shounen', 'Super Power']),
  media(2, ['Action', 'Fantasy'], ['Shounen', 'Ninja']),
  media(3, ['Mystery', 'Thriller', 'Psychological'], ['Detective']),
];

test('the profile weights each genre and tag by the share of liked shows carrying it', () => {
  const profile = buildProfile(liked);
  assert.deepEqual(profile.slice(0, 2), [
    { name: 'Action', kind: 'genre', weight: 2 / 3 },
    { name: 'Shounen', kind: 'tag', weight: 2 / 3 },
  ]);
  assert.ok(profile.some((p) => p.name === 'Detective' && p.weight === 1 / 3));
});

test('a genre and a tag with the same name stay separate features', () => {
  const profile = buildProfile([media(1, ['Mecha'], ['Mecha'])]);
  assert.deepEqual(profile.map((p) => `${p.kind}:${p.name}`).sort(), ['genre:Mecha', 'tag:Mecha']);
});

test('picks are 4+ matches, best first, and never the liked shows or their relations', () => {
  const reviews = [
    review('Liked Itself', 1, 5, ['Action', 'Supernatural'], ['Shounen', 'Super Power']),
    review('Its Sequel', 99, 5, ['Action', 'Supernatural'], ['Shounen']),
    review('Close Match', 10, 5, ['Action', 'Supernatural'], ['Shounen']),
    review('Rated Three', 11, 3, ['Action', 'Supernatural'], ['Shounen']),
    review('Revisited Up', 12, 3, ['Mystery', 'Thriller'], ['Detective'], { fullReview: { ratingNumber: 4 } }),
    review('No Overlap', 13, 5, ['Sports'], ['Baseball']),
  ];
  const likedWithSequel = [{ ...liked[0], relations: { nodes: [{ id: 99 }] } }, liked[1], liked[2]];
  const result = recommend({ reviews, likedMedia: likedWithSequel, count: 5 });
  const titles = result.picks.map((p) => p.review.titleEN);
  assert.equal(titles[0], 'Close Match');
  assert.ok(titles.includes('Revisited Up'), 'the revisit rating is the one that counts');
  for (const excluded of ['Liked Itself', 'Its Sequel', 'Rated Three', 'No Overlap']) {
    assert.ok(!titles.includes(excluded), `${excluded} was recommended`);
  }
  assert.deepEqual(result.picks[0].sharedGenres, ['Action', 'Supernatural']);
  assert.deepEqual(result.picks[0].sharedTags, ['Shounen']);
});

test('the second pick favors a different kind of show over a near-copy of the first', () => {
  const reviews = [
    review('Action A', 10, 5, ['Action', 'Supernatural'], ['Shounen', 'Super Power']),
    review('Action B', 11, 5, ['Action', 'Supernatural'], ['Shounen', 'Super Power']),
    review('Mystery', 12, 5, ['Mystery', 'Thriller', 'Psychological'], ['Detective']),
  ];
  const titles = recommend({ reviews, likedMedia: liked, count: 2 }).picks.map((p) => p.review.titleEN);
  assert.deepEqual(titles, ['Action A', 'Mystery']);
});

test('a show split into parts is picked once, by its best part', () => {
  const reviews = [
    review('Long Show', 10, 4, ['Action'], ['Shounen'], { part: 1 }),
    review('Long Show Part 2', 10, 5, ['Action'], ['Shounen'], { part: 2 }),
  ];
  const titles = recommend({ reviews, likedMedia: liked, count: 3 }).picks.map((p) => p.review.titleEN);
  assert.deepEqual(titles, ['Long Show Part 2']);
});

test('the hidden gem is the least popular remaining 5 that shares something', () => {
  const reviews = [
    review('Big Hit', 10, 5, ['Action', 'Supernatural'], ['Shounen', 'Super Power']),
    review('Popular Five', 11, 5, ['Action'], []),
    review('Obscure Five', 12, 5, ['Drama', 'Action'], []),
    review('Obscure Four', 13, 4, ['Action'], []),
    review('Obscure, Unrelated', 14, 5, ['Sports'], []),
  ];
  const popularity = new Map([[10, 500000], [11, 90000], [12, 1200], [13, 50], [14, 10]]);
  const result = recommend({ reviews, likedMedia: liked, popularity, count: 1 });
  assert.deepEqual(result.picks.map((p) => p.review.titleEN), ['Big Hit']);
  assert.equal(result.hiddenGem.review.titleEN, 'Obscure Five');
  assert.equal(result.hiddenGem.popularity, 1200);
});

test('with no 5 left, the hidden gem falls back to a 4; with nothing left, it is null', () => {
  const reviews = [review('Pick', 10, 5, ['Action'], []), review('Four', 11, 4, ['Action'], [])];
  assert.equal(recommend({ reviews, likedMedia: liked, count: 1 }).hiddenGem.review.titleEN, 'Four');
  assert.equal(recommend({ reviews, likedMedia: liked, count: 2 }).hiddenGem, null);
});

test('nothing found on AniList means no profile and no picks, not an error', () => {
  const result = recommend({ reviews: [review('Pick', 10, 5, ['Action'], [])], likedMedia: [], count: 2 });
  assert.deepEqual(result, { profile: [], picks: [], hiddenGem: null });
});

test('candidateIds is every 4+ review with AniList data, once each', () => {
  const reviews = [
    review('A', 10, 5, ['Action']),
    review('A Part 2', 10, 4, ['Action']),
    review('Low', 11, 2, ['Action']),
    { titleEN: 'No Tags', anilistId: 12, ratingNumber: 5 },
  ];
  assert.deepEqual(candidateIds(reviews), [10]);
});

test('the AniList query is one self-contained line: searches, the id lookup and popularity pages', () => {
  const candidates = Array.from({ length: 60 }, (_, i) => i + 1000);
  const query = buildAniListQuery({ titles: ['Naruto', 'Steins;Gate "0"'], ids: [5], candidateIds: candidates });
  assert.doesNotMatch(query, /\n/);
  assert.doesNotMatch(query, /\$/, 'no variables to fill in');
  assert.doesNotThrow(() => parse(query), 'valid GraphQL');
  assert.match(query, /liked0_Naruto: Media\(search: "Naruto", type: ANIME, sort: SEARCH_MATCH\)/);
  assert.match(query, /liked1_Steins_Gate_0: Media\(search: "Steins;Gate \\"0\\""/);
  assert.match(query, /likedById: Page\(perPage: 50\) \{ media\(id_in: \[5\]/);
  assert.match(query, /popularity0: Page\(perPage: 50\) \{ media\(id_in: \[1000,/);
  assert.match(query, /popularity1: Page\(perPage: 50\) \{ media\(id_in: \[1050,1051,1052,1053,1054,1055,1056,1057,1058,1059\]/);
});

test('a title with nothing alias-safe in it still gets an alias', () => {
  assert.match(buildAniListQuery({ titles: ['進撃の巨人'], ids: [], candidateIds: [] }), /^query \{ liked0: Media/);
});

test('AniList\'s response splits back into liked shows, in order, and popularity', () => {
  const data = {
    liked1_Nope: null,
    liked0_Death_Note: media(1, ['Action']),
    likedById: { media: [media(5, ['Drama'])] },
    popularity0: { media: [{ id: 1000, popularity: 42 }] },
  };
  for (const text of [JSON.stringify({ data }), JSON.stringify(data)]) {
    const { liked: found, popularity } = parseAniListResponse(text);
    assert.deepEqual(found.map((l) => [l.input, l.media?.id ?? null]), [['Death Note', 1], ['Nope', null], ['5', 5]]);
    assert.equal(popularity.get(1000), 42);
  }
});

test('a pasted response that is not usable says why', () => {
  assert.throws(() => parseAniListResponse('{ "data": '), /isn't JSON/);
  assert.throws(() => parseAniListResponse(JSON.stringify({ data: null, errors: [{ message: 'Too Many Requests' }] })), /no results: Too Many Requests/);
  assert.throws(() => parseAniListResponse(JSON.stringify({ data: { Media: {} } })), /no liked shows/);
});

// --- the GraphQL resolvers ---
const seasonIndex = {
  currentSeason: 'fall-2026',
  seasons: [
    { id: 'fall-2026', name: 'Fall 2026', file: '/vqar/data/seasons/fall-2026.json' },
    { id: 'spring-2026', name: 'Spring 2026', file: '/vqar/data/seasons/spring-2026.json' },
  ],
};
const routes = {
  '/vqar/data/index.json': seasonIndex,
  '/vqar/data/seasons/fall-2026.json': { id: 'fall-2026', name: 'Fall 2026', reviewed: [review('Fall Action', 10, 5, ['Action'], ['Shounen'])], pending: [], skipped: [] },
  '/vqar/data/seasons/spring-2026.json': { id: 'spring-2026', name: 'Spring 2026', reviewed: [review('Spring Mystery', 11, 5, ['Mystery'], ['Detective'])], pending: [], skipped: [] },
};

async function run(query) {
  const result = await graphql({
    schema: buildSchema(typeDefs),
    source: query,
    rootValue: makeRootValue({ assets: { fetch: createPathFetchStub(routes) }, origin: 'https://pendelgeist.com' }),
  });
  return { ...result, data: result.data && JSON.parse(JSON.stringify(result.data)) };
}

test('anilistQuery builds the AniList query over every season\'s candidates', async () => {
  const result = await run('{ anilistQuery(titles: ["Naruto", " ", "Naruto", "Death Note"], anilistIds: [7]) }');
  assert.equal(result.errors, undefined);
  const query = result.data.anilistQuery;
  assert.match(query, /liked0_Naruto: .*liked1_Death_Note: /, 'blank and repeated titles dropped');
  assert.match(query, /id_in: \[7\]/);
  assert.match(query, /popularity0: Page\(perPage: 50\) \{ media\(id_in: \[10,11\]/);
});

test('anilistQuery rejects an empty or oversized list', async () => {
  assert.match((await run('{ anilistQuery(titles: [" "]) }')).errors[0].message, /at least one title/);
  const many = JSON.stringify(Array.from({ length: 26 }, (_, i) => `Show ${i}`));
  assert.match((await run(`{ anilistQuery(titles: ${many}) }`)).errors[0].message, /at most 25/);
});

const anilistResponse = JSON.stringify({
  data: {
    liked0_Naruto: media(20, ['Action'], ['Shounen'], { title: 'NARUTO' }),
    liked1_Nothing_Like_This: null,
    liked2_Death_Note: media(21, ['Mystery'], ['Detective'], { title: 'Death Note' }),
    popularity0: { media: [{ id: 10, popularity: 1000 }, { id: 11, popularity: 10 }] },
  },
});

const QUERY = `{ recommend(count: 1, anilistResponse: """${anilistResponse}""") {
  liked { input found anilistId title }
  profile { name kind weight }
  picks { score sharedGenres review { titleEN season seasonName } }
  hiddenGem { popularity review { titleEN season } }
} }`;

test('recommend picks across every season from a pasted AniList response', async () => {
  const result = await run(QUERY);
  assert.equal(result.errors, undefined);
  const { liked: found, picks, hiddenGem, profile } = result.data.recommend;
  assert.deepEqual(found, [
    { input: 'Naruto', found: true, anilistId: 20, title: 'NARUTO' },
    { input: 'Nothing Like This', found: false, anilistId: null, title: null },
    { input: 'Death Note', found: true, anilistId: 21, title: 'Death Note' },
  ]);
  assert.equal(profile.length, 4);
  assert.equal(picks.length, 1);
  // Both match equally, so the pick is the first by title and the other is the gem.
  assert.equal(picks[0].review.titleEN, 'Fall Action');
  assert.equal(picks[0].review.seasonName, 'Fall 2026');
  assert.deepEqual(hiddenGem, { popularity: 10, review: { titleEN: 'Spring Mystery', season: 'spring-2026' } });
});

test('recommend reports an unusable response or count as a GraphQL error', async () => {
  assert.match((await run('{ recommend(anilistResponse: "nope") { picks { score } } }')).errors[0].message, /isn't JSON/);
  assert.match((await run(`{ recommend(count: 11, anilistResponse: """${anilistResponse}""") { picks { score } } }`)).errors[0].message, /count has to be/);
});

// --- the explorer page's step-1 copy button ---

async function loadExplorer(fetch, clipboard) {
  const html = fs.readFileSync(new URL('../public/graphql/index.html', import.meta.url), 'utf-8');
  const dom = new JSDOM(html, { url: 'http://localhost/graphql/', runScripts: 'outside-only' });
  global.document = dom.window.document;
  global.fetch = fetch;
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard }, configurable: true });
  await import(`${new URL('../public/graphql/app.js', import.meta.url)}?t=${Date.now()}${Math.random()}`);
  return dom.window.document;
}

test('the explorer offers a copy button for step 1\'s AniList query, and only then', async () => {
  const anilistQuery = 'query { liked0_Naruto: Media(search: "Naruto") { id } }';
  let body = { data: { anilistQuery } };
  const fetch = async () => ({ json: async () => body });
  const copied = [];
  const document = await loadExplorer(fetch, { writeText: async (text) => { copied.push(text); } });
  const step = document.getElementById('anilistStep');
  assert.equal(step.hidden, true);

  document.getElementById('runQuery').click();
  await waitFor(() => !step.hidden);
  document.getElementById('copyAnilistQuery').click();
  await waitFor(() => copied.length === 1);
  assert.equal(copied[0], anilistQuery, 'the query itself, not its JSON-escaped form');
  assert.equal(document.getElementById('copyStatus').textContent, 'Copied.');

  body = { data: { seasons: [] } };
  document.getElementById('runQuery').click();
  await waitFor(() => document.getElementById('result').textContent.includes('seasons'));
  assert.equal(step.hidden, true);
});

test('without clipboard access, the AniList query lands in the editor, selected', async () => {
  const anilistQuery = 'query { liked0_Naruto: Media(search: "Naruto") { id } }';
  const fetch = async () => ({ json: async () => ({ data: { anilistQuery } }) });
  const document = await loadExplorer(fetch, { writeText: async () => { throw new Error('denied'); } });
  document.getElementById('runQuery').click();
  await waitFor(() => !document.getElementById('anilistStep').hidden);
  document.getElementById('copyAnilistQuery').click();
  await waitFor(() => document.getElementById('copyStatus').textContent !== '');
  assert.equal(document.getElementById('queryInput').value, anilistQuery);
  assert.match(document.getElementById('copyStatus').textContent, /in the editor/);
});
