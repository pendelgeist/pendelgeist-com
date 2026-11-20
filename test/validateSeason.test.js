import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSeason, validateSeasonCollection } from '../scripts/validateSeason.js';

function cleanSeason() {
  return {
    id: 'spring-2026',
    name: 'Spring 2026',
    shows: [
      { titleEN: 'Cool Show', reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Finish Ep', dateReviewed: '2026-04-01T08:00:00-04:00' }] },
    ],
    toReview: ['Pending Show'],
    notReviewing: ['Skipped Show'],
  };
}

test('a clean season has no issues', () => {
  assert.deepEqual(validateSeason(cleanSeason()), []);
});

test('flags a show that is reviewed but still listed in toReview', () => {
  const season = cleanSeason();
  season.toReview.push('Cool Show');

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Cool Show"') && i.includes('toReview')));
});

test('flags a show that is reviewed but also listed in notReviewing', () => {
  const season = cleanSeason();
  season.notReviewing.push('Cool Show');

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Cool Show"') && i.includes('notReviewing')));
});

test('flags a show listed in both toReview and notReviewing', () => {
  const season = cleanSeason();
  season.toReview.push('Contested Show');
  season.notReviewing.push('Contested Show');

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Contested Show"') && i.includes('both toReview and notReviewing')));
});

test('flags duplicate entries within the same list', () => {
  const season = cleanSeason();
  season.toReview.push('Pending Show');

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Pending Show"') && i.includes('more than once in toReview')));
});

test('flags a show with no reviews, and a review missing its rating or date', () => {
  const season = cleanSeason();
  season.shows.push({ titleEN: 'Unreviewed Show' }, { titleEN: 'Empty Show', reviews: [] }, { titleEN: 'Half-filled-out Show', reviews: [{}] });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Unreviewed Show"') && i.includes('reviews list')));
  assert.ok(issues.some(i => i.includes('"Empty Show"') && i.includes('reviews list')));
  assert.ok(issues.some(i => i.includes('"Half-filled-out Show"') && i.includes('ratingNumber')));
  assert.ok(issues.some(i => i.includes('"Half-filled-out Show"') && i.includes('dateReviewed')));
});

test('flags an unparseable dateReviewed', () => {
  const season = cleanSeason();
  season.shows.push({ titleEN: 'Bad Date Show', reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: 'not-a-date' }] });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Date Show"') && i.includes('dateReviewed')));
});

test('flags a dateReviewed that is only a date, with no time', () => {
  const season = cleanSeason();
  season.shows.push({ titleEN: 'Date Only Show', reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02' }] });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Date Only Show"') && i.includes('dateReviewed') && i.includes('timestamp')));
});

test('accepts a dateReviewed stamped in the right Eastern offset, summer or winter', () => {
  const season = cleanSeason();
  season.shows.push(
    { titleEN: 'Summer Show', reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T20:15:00-04:00' }] },
    { titleEN: 'Winter Show', reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-01-02T20:15:00-05:00' }] },
  );

  assert.deepEqual(validateSeason(season), []);
});

test('flags a dateReviewed in UTC or another offset, since the page shows the date as written', () => {
  for (const dateReviewed of ['2026-04-02T03:04:05Z', '2026-04-02T20:15:00-07:00', '2026-01-02T20:15:00-04:00', '2026-04-02T20:15:00-05:00']) {
    const season = cleanSeason();
    season.shows.push({ titleEN: 'Wrong Zone Show', reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: dateReviewed }] });

    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Wrong Zone Show"') && i.includes('Eastern')), `accepted ${dateReviewed}`);
  }
});

test('flags a dateReviewed in the future', () => {
  const season = cleanSeason();
  season.shows.push({ titleEN: 'Time Traveller', reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-05T08:00:00-04:00' }] });

  const now = Date.parse('2026-04-04T00:00:00-04:00');
  assert.ok(validateSeason(season, { now }).some(i => i.includes('"Time Traveller"') && i.includes('future')));
  assert.deepEqual(validateSeason(season, { now: Date.parse('2026-04-06T00:00:00-04:00') }), []);
});

test('flags a malformed fullReview/op/ed (not an object)', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Malformed Addenda Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    op: 'should be an object, not a string',
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Malformed Addenda Show"') && i.includes('op')));
});

test('flags a malformed anilistId (not an integer)', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Bad AnilistId Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    anilistId: 'not-a-number',
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad AnilistId Show"') && i.includes('anilistId')));
});

test('a well-formed anilistId does not trigger a false positive', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Linked Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    anilistId: 154587,
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed annId (not an integer)', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Bad AnnId Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    annId: 'not-a-number',
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad AnnId Show"') && i.includes('annId')));
});

test('a well-formed annId does not trigger a false positive', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Linked Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    annId: 22622,
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed streaming (not an array)', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Bad Streaming Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    streaming: 'netflix',
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Streaming Show"') && i.includes('streaming')));
});

test('flags an unknown streaming service key', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Typo Streaming Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    streaming: ['netflex'],
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Typo Streaming Show"') && i.includes('netflex')));
});

test('a well-formed streaming list does not trigger a false positive', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Streamed Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    streaming: ['crunchyroll', 'hidive', 'youtube', 'netflix', 'hulu', 'prime', 'oceanveil'],
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed crunchyrollUrl (not a string)', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Bad CR Url Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    crunchyrollUrl: 12345,
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad CR Url Show"') && i.includes('crunchyrollUrl')));
});

test('a well-formed crunchyrollUrl does not trigger a false positive', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Streamed Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    streaming: ['crunchyroll'],
    crunchyrollUrl: 'https://www.crunchyroll.com/series/ABC123/streamed-show',
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed wikipediaUrl or wikipediaJaUrl (not a string)', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Bad Wiki Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    wikipediaUrl: 12345,
  });
  season.shows.push({
    titleEN: 'Bad JP Wiki Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-03T08:00:00-04:00' }],
    wikipediaJaUrl: 67890,
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Wiki Show"') && i.includes('wikipediaUrl')));
  assert.ok(issues.some(i => i.includes('"Bad JP Wiki Show"') && i.includes('wikipediaJaUrl')));
});

test('well-formed Wikipedia URLs do not trigger a false positive', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Documented Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Documented_Show',
    wikipediaJaUrl: 'https://ja.wikipedia.org/wiki/\u745E\u9E97',
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed hidiveUrl or netflixUrl (not a string)', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Bad HD Url Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    hidiveUrl: 12345,
  });
  season.shows.push({
    titleEN: 'Bad NF Url Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-03T08:00:00-04:00' }],
    netflixUrl: 67890,
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad HD Url Show"') && i.includes('hidiveUrl')));
  assert.ok(issues.some(i => i.includes('"Bad NF Url Show"') && i.includes('netflixUrl')));
});

test('a well-formed hidiveUrl and netflixUrl do not trigger a false positive', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Streamed Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    streaming: ['hidive', 'netflix'],
    hidiveUrl: 'https://www.hidive.com/season/streamed-show',
    netflixUrl: 'https://www.netflix.com/title/12345',
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed huluUrl or primeUrl (not a string)', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Bad HU Url Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    huluUrl: 12345,
  });
  season.shows.push({
    titleEN: 'Bad PV Url Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-03T08:00:00-04:00' }],
    primeUrl: 67890,
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad HU Url Show"') && i.includes('huluUrl')));
  assert.ok(issues.some(i => i.includes('"Bad PV Url Show"') && i.includes('primeUrl')));
});

test('rejects the fields the reviews list replaced, so old-shape data cannot slip back in', () => {
  for (const field of ['ratingNumber', 'ratingText', 'review', 'dateReviewed', 'fullReview', 'finishedSeason', 'finishedDate', 'watchProgress', 'part', 'airedLabel']) {
    const season = cleanSeason();
    season.shows[0][field] = 'x';
    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Cool Show"') && i.includes(`unknown field "${field}"`)), `accepted ${field}`);
  }
});

test('a well-formed later review and liked op/ed do not trigger a false positive', () => {
  const season = cleanSeason();
  season.shows.push({
    titleEN: 'Fully Reviewed Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Finish Ep', dateReviewed: '2026-04-02T08:00:00-04:00' }, { ratingNumber: 5, ratingText: 'Nice Ep Broh', text: 'great', dateReviewed: '2026-06-01T08:00:00-04:00' }],
    op: [1],
    ed: [2],
  });

  assert.deepEqual(validateSeason(season), []);
});

test('pending and skipped entries may be objects carrying the optional notes', () => {
  const season = cleanSeason();
  season.toReview = [
    'Plain Pending Show',
    { title: 'Dated Show', premieres: '2026-10-08' },
    { title: 'Streamed Show', streaming: ['crunchyroll', 'netflix'], premieres: '2026-10-01' },
  ];
  season.notReviewing = [
    'Plain Skipped Show',
    { title: 'Paywalled Show', reason: 'Not paying for another service', streaming: ['oceanveil'] },
    { title: 'Unlicensed Show', reason: 'Not streaming in the US' },
  ];

  assert.deepEqual(validateSeason(season), []);
});

test('an object entry still takes part in the duplicate and cross-list checks', () => {
  const season = cleanSeason();
  season.toReview = [{ title: 'Cool Show' }, { title: 'Twice' }, 'Twice'];
  season.notReviewing = [{ title: 'Twice', reason: 'x' }];

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Cool Show"') && i.includes('reviewed but still listed in toReview')));
  assert.ok(issues.some(i => i.includes('"Twice"') && i.includes('more than once in toReview')));
  assert.ok(issues.some(i => i.includes('"Twice"') && i.includes('both toReview and notReviewing')));
});

test('flags an entry with no usable title', () => {
  const season = cleanSeason();
  season.toReview = [{ premieres: '2026-10-08' }, ''];
  season.notReviewing = [42];

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('toReview[0]') && i.includes('title')));
  assert.ok(issues.some(i => i.includes('toReview[1]') && i.includes('title')));
  assert.ok(issues.some(i => i.includes('notReviewing[0]') && i.includes('title')));
});

test('flags unknown fields, including one that belongs to the other list', () => {
  const season = cleanSeason();
  season.toReview = [{ title: 'Typo Show', reasn: 'oops' }, { title: 'Wrong List Show', reason: 'not for pending' }];
  season.notReviewing = [{ title: 'Wrong List Skip', premieres: '2026-10-08' }];

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Typo Show"') && i.includes('unknown field "reasn"')));
  assert.ok(issues.some(i => i.includes('"Wrong List Show"') && i.includes('unknown field "reason"')));
  assert.ok(issues.some(i => i.includes('"Wrong List Skip"') && i.includes('unknown field "premieres"')));
});

test('flags malformed notes on a list entry', () => {
  const season = cleanSeason();
  season.toReview = [
    { title: 'Bad Streaming', streaming: 'crunchyroll' },
    { title: 'Unknown Service', streaming: ['nope'] },
    { title: 'Not A Date', premieres: '10/08/2026' },
    { title: 'Impossible Date', premieres: '2026-02-30' },
  ];
  season.notReviewing = [
    { title: 'Empty Reason', reason: '  ' },
    { title: 'Old Flag', noUSStreaming: true },
  ];

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Streaming"') && i.includes('malformed streaming')));
  assert.ok(issues.some(i => i.includes('"Unknown Service"') && i.includes('unknown streaming service "nope"')));
  assert.ok(issues.some(i => i.includes('"Not A Date"') && i.includes('malformed premieres')));
  assert.ok(issues.some(i => i.includes('"Impossible Date"') && i.includes('malformed premieres')));
  assert.ok(issues.some(i => i.includes('"Empty Reason"') && i.includes('malformed reason')));
  // The flag this replaced is now just an unknown field, so old data fails loudly instead of being ignored.
  assert.ok(issues.some(i => i.includes('"Old Flag"') && i.includes('unknown field "noUSStreaming"')));
});

test('list entries accept the per-service link fields, and flag a malformed one', () => {
  const season = cleanSeason();
  season.toReview = [{ title: 'Linked Show', streaming: ['crunchyroll'], crunchyrollUrl: 'https://www.crunchyroll.com/series/X/linked' }];
  season.notReviewing = [{ title: 'Linked Skip', netflixUrl: 'https://www.netflix.com/title/1' }];
  assert.deepEqual(validateSeason(season), []);

  season.toReview = [{ title: 'Bad Link', crunchyrollUrl: 42 }, { title: 'Empty Link', huluUrl: ' ' }];
  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Link"') && i.includes('malformed crunchyrollUrl')));
  assert.ok(issues.some(i => i.includes('"Empty Link"') && i.includes('malformed huluUrl')));
});

test('availableNow is a boolean on a pending entry, and not combined with a premieres', () => {
  const season = cleanSeason();
  season.toReview = [{ title: 'Out Already', availableNow: true }];
  assert.deepEqual(validateSeason(season), []);

  season.toReview = [
    { title: 'Bad Flag', availableNow: 'yes' },
    { title: 'Both', availableNow: true, premieres: '2026-10-01' },
  ];
  season.notReviewing = [{ title: 'Wrong List', availableNow: true }];
  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Flag"') && i.includes('malformed availableNow')));
  assert.ok(issues.some(i => i.includes('"Both"') && i.includes('availableNow but also has a premieres')));
  assert.ok(issues.some(i => i.includes('"Wrong List"') && i.includes('unknown field "availableNow"')));
});

test('youtubeUrl is accepted on a review and a list entry, and flagged when malformed', () => {
  const season = cleanSeason();
  season.shows[0].streaming = ['youtube'];
  season.shows[0].youtubeUrl = 'https://www.youtube.com/@Show';
  season.toReview = [{ title: 'Linked Pending', streaming: ['youtube'], youtubeUrl: 'https://www.youtube.com/playlist?list=abc' }];
  assert.deepEqual(validateSeason(season), []);

  season.shows[0].youtubeUrl = 123;
  season.notReviewing = [{ title: 'Bad Skip Link', youtubeUrl: ' ' }];
  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('Cool Show') && i.includes('youtubeUrl')));
  assert.ok(issues.some(i => i.includes('"Bad Skip Link"') && i.includes('malformed youtubeUrl')));
});

// The latest review's rating is the show's rating in sorting, filtering and
// every /vqar-stats number, so saving one without a rating silently keeps the
// old rating in all of those. Validation is what makes that impossible to miss.
test('flags a later review saved without a ratingNumber, or one outside the 0-5 tiers', () => {
  for (const ratingNumber of [undefined, 6, -1, 2.5, '4']) {
    const season = cleanSeason();
    season.shows.push({
      titleEN: 'Unrated Revisit Show',
      reviews: [
        { episodes: 1, ratingNumber: 3, dateReviewed: '2026-04-02T08:00:00-04:00' },
        { ratingNumber, text: 'finished it, it was fine', dateReviewed: '2026-06-01T08:00:00-04:00' },
      ],
    });

    const issues = validateSeason(season, { now: Date.parse('2026-07-01T00:00:00-04:00') });
    assert.ok(issues.some(i => i.includes('"Unrated Revisit Show"') && i.includes('reviews[1]') && i.includes('ratingNumber')), `accepted ${JSON.stringify(ratingNumber)}`);
  }
});

// A liked OP/ED is a bare marking now - the old rated/annotated object shape
// is rejected, so a session can't quietly reintroduce it.
test('flags an op/ed that is not a list of numbers - a bare true included', () => {
  for (const value of [{ ratingText: 'Honorable Mention' }, true, false, 'yes', 1]) {
    const season = cleanSeason();
    season.shows.push({
      titleEN: 'Old-Shape OP Show',
      reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00' }],
      ed: value,
    });

    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Old-Shape OP Show"') && i.includes('ed')), `accepted ${JSON.stringify(value)}`);
  }
});

test('watched.finished is a bare true marking, like op/ed', () => {
  const ok = cleanSeason();
  ok.shows[0].watched = { from: '2026-04-01', finished: true };
  assert.deepEqual(validateSeason(ok), []);

  for (const value of [false, 'yes', 1, { date: '2026-09-01' }]) {
    const season = cleanSeason();
    season.shows[0].watched = { from: '2026-04-01', finished: value };
    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Cool Show"') && i.includes('watched.finished')), `accepted ${JSON.stringify(value)}`);
  }
});

test('a well-formed generated anilist object passes', () => {
  const season = cleanSeason();
  season.shows[0].anilistId = 154587;
  season.shows[0].anilist = { format: 'TV', genres: ['Action'], tags: ['Isekai'], studios: ['MAPPA'] };
  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed anilist object', () => {
  const cases = [
    'not an object',
    { genres: 'Action', tags: [], studios: [] },
    { genres: [], tags: [7], studios: [] },
    { format: 3, genres: [], tags: [], studios: [] },
    // The page's filter URLs separate values with commas, so a value can't contain one.
    { genres: [], tags: ['Comedy, Romance'], studios: [] },
  ];
  for (const anilist of cases) {
    const season = cleanSeason();
    season.shows[0].anilistId = 154587;
    season.shows[0].anilist = anilist;
    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Cool Show"') && i.includes('anilist')), `accepted ${JSON.stringify(anilist)}`);
  }
});

test('flags anilist data on a review with no anilistId to have fetched it from', () => {
  const season = cleanSeason();
  season.shows[0].anilist = { genres: ['Action'], tags: [], studios: [] };
  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Cool Show"') && i.includes('anilistId')));
});

// --- Stricter review checks ---

/** The probe show's one review, a first impression, with `overrides` applied. */
function probeReview(overrides = {}) {
  return { episodes: 1, ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00', ...overrides };
}

/** A show with one first impression, and `overrides` applied to the show. */
function review(overrides = {}) {
  return { titleEN: 'Probe Show', reviews: [probeReview()], ...overrides };
}

test('requires a whole-number ratingNumber from 0 to 5 on a review', () => {
  for (const ratingNumber of [undefined, '4', 7, -1, 2.5, null]) {
    const season = cleanSeason();
    season.shows.push(review({ reviews: [probeReview({ ratingNumber })] }));

    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Probe Show"') && i.includes('ratingNumber')), `accepted ${JSON.stringify(ratingNumber)}`);
  }
  for (const ratingNumber of [0, 3, 5]) {
    const season = cleanSeason();
    season.shows.push(review({ reviews: [probeReview({ ratingNumber })] }));
    assert.deepEqual(validateSeason(season), []);
  }
});

test('rejects an unknown review field, so a typo does not quietly do nothing', () => {
  for (const typo of ['finshedSeason', 'fullReveiw', 'streming']) {
    const season = cleanSeason();
    season.shows.push(review({ [typo]: true }));

    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Probe Show"') && i.includes(`unknown field "${typo}"`)), `accepted ${typo}`);
  }
});

test('rejects an unknown field on a review', () => {
  const season = cleanSeason();
  season.shows.push(review({ reviews: [probeReview({ notes: 'oops' })] }));

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Probe Show"') && i.includes('reviews[0]') && i.includes('"notes"')));
});

test('ratingText is optional, but not blank, and text is a string', () => {
  const season = cleanSeason();
  season.shows.push(review({ reviews: [probeReview({ ratingText: undefined })] }));
  assert.deepEqual(validateSeason(season), []);

  for (const [overrides, field] of [[{ ratingText: ' ' }, 'ratingText'], [{ ratingText: 4 }, 'ratingText'], [{ text: 5 }, 'text']]) {
    const bad = cleanSeason();
    bad.shows.push(review({ reviews: [probeReview(overrides)] }));
    assert.ok(validateSeason(bad).some(i => i.includes('"Probe Show"') && i.includes(`reviews[0].${field}`)), `accepted ${JSON.stringify(overrides)}`);
  }
});

test('rejects an unknown season field, including the retired number', () => {
  const season = { ...cleanSeason(), curent: true, number: 2603 };

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('unknown field "curent"')));
  assert.ok(issues.some(i => i.includes('unknown field "number"')));
});

test('flags a shows, toReview or notReviewing list that is not an array', () => {
  for (const key of ['shows', 'toReview', 'notReviewing']) {
    const issues = validateSeason({ ...cleanSeason(), [key]: {} });
    assert.ok(issues.some(i => i.includes(`malformed ${key}`) && i.includes('array')), `accepted a non-array ${key}`);
  }
});

test('flags titles that differ only in case or punctuation, across the lists too', () => {
  const season = cleanSeason();
  season.shows.push(review({ titleEN: 'Probe Show!' }));
  season.notReviewing.push('probe show');

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Probe Show!"') && i.includes('"probe show"') && i.includes('case or punctuation')));
});

test('flags a streaming service listed twice, and an empty link on a review', () => {
  const season = cleanSeason();
  season.shows.push(review({ streaming: ['hidive', 'hidive'], hidiveUrl: ' ' }));

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Probe Show"') && i.includes('"hidive"') && i.includes('more than once')));
  assert.ok(issues.some(i => i.includes('"Probe Show"') && i.includes('malformed hidiveUrl')));
});

test('checks a later review\'s date: a real Eastern moment, not in the future, not before the review ahead of it', () => {
  const withRevisit = (dateReviewed) => {
    const season = cleanSeason();
    season.shows.push(review({ reviews: [probeReview(), { ratingNumber: 4, text: 'x', dateReviewed }] }));
    return validateSeason(season, { now: Date.parse('2026-06-01T00:00:00-04:00') });
  };

  assert.deepEqual(withRevisit('2026-04-20T21:00:00-04:00'), [], 'an Eastern timestamp is allowed');
  assert.ok(withRevisit('2026-04-20').some(i => i.includes('reviews[1].dateReviewed')), 'a plain day is not');
  assert.ok(withRevisit('last tuesday').some(i => i.includes('reviews[1].dateReviewed')));
  assert.ok(withRevisit('2026-02-30T12:00:00-05:00').some(i => i.includes('reviews[1].dateReviewed')));
  assert.ok(withRevisit('2026-04-20T21:00:00Z').some(i => i.includes('Eastern')));
  assert.ok(withRevisit('2026-07-01T12:00:00-04:00').some(i => i.includes('future')));
  assert.ok(withRevisit('2026-04-01T07:00:00-04:00').some(i => i.includes('before the review ahead of it')));
});

// --- The reviews list: stages are derived, so the list has to make sense ---

test('a list that runs first impression, revisit, final passes', () => {
  const season = cleanSeason();
  season.shows.push(review({
    reviews: [
      probeReview(),
      { episodes: 6, ratingNumber: 4, dateReviewed: '2026-04-20T08:00:00-04:00' },
      { episodes: 12, final: true, ratingNumber: 5, text: 'done', dateReviewed: '2026-05-20T08:00:00-04:00' },
    ],
    watched: { from: '2026-04-02', to: '2026-05-19', finished: true },
  }));
  season.shows.push({ titleEN: 'Backfilled Show', reviews: [{ episodes: 12, ratingNumber: 4, dateReviewed: '2026-05-21T08:00:00-04:00' }] });
  assert.deepEqual(validateSeason(season, { now: Date.parse('2026-06-01T00:00:00-04:00') }), []);
});

test('flags a reviews list whose stages would come out wrong', () => {
  const later = (overrides) => ({ ratingNumber: 4, dateReviewed: '2026-04-20T08:00:00-04:00', ...overrides });
  const cases = [
    ['a second first impression', { reviews: [probeReview(), later({ episodes: 1 })] }, /first impression .*reviews\[1\]/],
    ['a first impression after a backfill', { reviews: [probeReview({ episodes: 6 }), later({ episodes: 1 })] }, /first impression/],
    ['fewer episodes than before', { reviews: [probeReview({ episodes: 6 }), later({ episodes: 3 })] }, /fewer episodes/],
    ['more episodes than watched', { reviews: [probeReview(), later({ episodes: 9 })], watched: { from: '2026-04-01', episode: 6 } }, /past the watched\.episode/],
    ['a final that is not last', {
      reviews: [probeReview({ final: true, episodes: undefined }), later({})],
      watched: { from: '2026-04-01', finished: true },
    }, /final review at reviews\[0\] that isn't the last/],
    ['a final on a show not marked finished', { reviews: [probeReview(), later({ final: true })] }, /isn't marked finished/],
    ['a final that is not true', { reviews: [probeReview({ final: 'yes' })] }, /malformed reviews\[0\]\.final/],
    ['a zero episodes', { reviews: [probeReview({ episodes: 0 })] }, /malformed reviews\[0\]\.episodes/],
    ['a fractional episodes', { reviews: [probeReview({ episodes: 1.5 })] }, /malformed reviews\[0\]\.episodes/],
    ['a review that is not an object', { reviews: [probeReview(), 'more'] }, /malformed reviews\[1\]/],
  ];
  for (const [what, overrides, pattern] of cases) {
    const season = cleanSeason();
    season.shows.push(review(overrides));
    const issues = validateSeason(season, { now: Date.parse('2026-06-01T00:00:00-04:00') });
    assert.ok(issues.some(i => i.includes('"Probe Show"') && pattern.test(i)), `accepted ${what}: ${JSON.stringify(issues)}`);
  }
});

test('episodes past watched.episode is fine when the watch record is counted in another season', () => {
  const season = cleanSeason();
  season.shows.push(review({ reviews: [probeReview({ episodes: 20 })], watched: { from: '2026-04-01', season: 2, episode: 6 } }));
  assert.deepEqual(validateSeason(season), []);
});

test('flags the same AniList id listed in two seasons - later reviews join the first', () => {
  const winter = { ...cleanSeason(), id: 'winter-2026', shows: [review({ titleEN: 'Split Cour', anilistId: 187941 })] };
  const spring = { ...cleanSeason(), id: 'spring-2026', current: true, shows: [review({ titleEN: 'Split Cour, Again', anilistId: 187941 })] };

  const issues = validateSeasonCollection([winter, spring]);
  assert.ok(issues.some(i => i.includes('187941') && i.includes('"Split Cour" (winter-2026)') && i.includes('"Split Cour, Again" (spring-2026)') && i.includes('first reviewed')));

  spring.shows[0].anilistId = 1;
  assert.deepEqual(validateSeasonCollection([winter, spring]), []);
});

// --- Lineups and shelves (the Backlog), and aired ---

test('a shelf like the Backlog needs a sortKey and is never the current season', () => {
  const backlog = (overrides = {}) => ({ ...cleanSeason(), id: 'backlog', name: 'Backlog', sortKey: 0, ...overrides });

  assert.deepEqual(validateSeason(backlog(), { filename: 'backlog.json' }), []);
  assert.ok(validateSeason(backlog({ sortKey: undefined })).some(i => i.includes('sortKey')));
  assert.ok(validateSeason(backlog({ current: true })).some(i => i.includes('only a lineup')));
  assert.ok(validateSeason(backlog({ archive: true })).some(i => i.includes('unknown field "archive"')));
  assert.deepEqual(validateSeason({ ...cleanSeason(), current: true }), [], 'a lineup can be current');
});

test('aired is a season and year from AniList, or a year alone', () => {
  for (const aired of [{ season: 'spring', year: 2010 }, { year: 2026 }]) {
    const season = cleanSeason();
    season.shows.push(review({ aired }));
    assert.deepEqual(validateSeason(season), [], JSON.stringify(aired));
  }
  for (const aired of ['Winter 2004', { season: 'autumn', year: 2010 }, { season: 'Spring', year: 2010 }, { season: 'spring' }, { year: '2010' }, { year: 2010, month: 4 }]) {
    const season = cleanSeason();
    season.shows.push(review({ aired }));
    assert.ok(validateSeason(season).some(i => i.includes('"Probe Show"') && i.includes('aired')), `accepted ${JSON.stringify(aired)}`);
  }
});

test('op and ed can name the numbered openings/endings that were liked', () => {
  const season = cleanSeason();
  season.shows[0].op = [1, 2];
  season.shows[0].ed = [3];
  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed list of op/ed numbers', () => {
  for (const value of [[], [0], [1.5], ['1'], [2, 2], [true], [[1]]]) {
    const season = cleanSeason();
    season.shows[0].op = value;
    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Cool Show"') && i.includes('malformed op')), `accepted ${JSON.stringify(value)}`);
  }
});

test('a well-formed watched record does not trigger a false positive', () => {
  const season = cleanSeason();
  season.shows[0].watched = { from: '2026-04-01', to: '2026-06-10' };
  season.shows.push({
    titleEN: 'Unfinished Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Finish Ep', dateReviewed: '2026-04-02T08:00:00-04:00' }],
    watched: { from: '2026-04-02', to: '2026-05-01', episode: 6 },
  });
  season.shows.push({
    titleEN: 'Several Seasons Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Finish Ep', dateReviewed: '2026-04-03T08:00:00-04:00' }],
    watched: { from: '2026-04-03', to: '2026-05-02', season: 2, episode: 6 },
  });
  season.shows.push({
    titleEN: 'Still Watching Show',
    reviews: [{ episodes: 1, ratingNumber: 3, ratingText: 'Finish Ep', dateReviewed: '2026-04-04T08:00:00-04:00' }],
    watched: { from: '2026-04-04' },
  });
  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed watched record', () => {
  const bad = [
    ['not an object', 'a string', /malformed watched/],
    ['an array', ['2026-04-01'], /malformed watched/],
    ['no from day', { to: '2026-06-10' }, /without a from day/],
    ['an unknown field', { from: '2026-04-01', first: '2026-04-01' }, /unknown field "first"/],
    ['a bad from day', { from: 'April 1st' }, /watched\.from that isn't a day/],
    ['an impossible day', { from: '2026-02-31' }, /watched\.from that isn't a day/],
    ['a timestamp', { from: '2026-04-01T12:00:00-04:00' }, /watched\.from that isn't a day/],
    ['a bad to day', { from: '2026-04-01', to: 20260610 }, /watched\.to that isn't a day/],
    ['a to before the from', { from: '2026-06-10', to: '2026-04-01' }, /before its watched\.from/],
    ['a day in the future', { from: '2099-01-01' }, /watched\.from in the future/],
    ['a zero episode', { from: '2026-04-01', episode: 0 }, /malformed watched\.episode/],
    ['a text episode', { from: '2026-04-01', episode: 'S2 E6' }, /malformed watched\.episode/],
    ['an object as the episode', { from: '2026-04-01', episode: { n: 3 } }, /malformed watched\.episode/],
    ['a season without an episode', { from: '2026-04-01', season: 2 }, /season without a watched\.episode/],
    ['a fractional season', { from: '2026-04-01', season: 1.5, episode: 3 }, /malformed watched\.season/],
  ];
  for (const [what, watched, pattern] of bad) {
    const season = cleanSeason();
    season.shows[0].watched = watched;
    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Cool Show"') && pattern.test(i)), `accepted ${what}: ${JSON.stringify(issues)}`);
  }
});
