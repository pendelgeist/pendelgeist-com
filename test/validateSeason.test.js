import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSeason, validateSeasonCollection } from '../scripts/validateSeason.js';

function cleanSeason() {
  return {
    id: 'spring-2026',
    name: 'Spring 2026',
    reviewed: [
      { titleEN: 'Cool Show', ratingNumber: 3, ratingText: 'Finish Ep', dateReviewed: '2026-04-01T08:00:00-04:00' },
    ],
    pending: ['Pending Show'],
    skipped: ['Skipped Show'],
  };
}

test('a clean season has no issues', () => {
  assert.deepEqual(validateSeason(cleanSeason()), []);
});

test('flags a show that is reviewed but still listed in pending', () => {
  const season = cleanSeason();
  season.pending.push('Cool Show');

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Cool Show"') && i.includes('pending')));
});

test('flags a show that is reviewed but also listed in skipped', () => {
  const season = cleanSeason();
  season.skipped.push('Cool Show');

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Cool Show"') && i.includes('skipped')));
});

test('flags a show listed in both pending and skipped', () => {
  const season = cleanSeason();
  season.pending.push('Contested Show');
  season.skipped.push('Contested Show');

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Contested Show"') && i.includes('both pending and skipped')));
});

test('flags duplicate entries within the same list', () => {
  const season = cleanSeason();
  season.pending.push('Pending Show');

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Pending Show"') && i.includes('more than once in pending')));
});

test('flags a reviewed entry missing required fields', () => {
  const season = cleanSeason();
  season.reviewed.push({ titleEN: 'Half-filled-out Show' });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Half-filled-out Show"') && i.includes('ratingText')));
  assert.ok(issues.some(i => i.includes('"Half-filled-out Show"') && i.includes('dateReviewed')));
});

test('flags an unparseable dateReviewed', () => {
  const season = cleanSeason();
  season.reviewed.push({ titleEN: 'Bad Date Show', ratingNumber: 3, ratingText: 'Meh', dateReviewed: 'not-a-date' });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Date Show"') && i.includes('dateReviewed')));
});

test('flags a dateReviewed that is only a date, with no time', () => {
  const season = cleanSeason();
  season.reviewed.push({ titleEN: 'Date Only Show', ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02' });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Date Only Show"') && i.includes('dateReviewed') && i.includes('timestamp')));
});

test('accepts a dateReviewed stamped in the right Eastern offset, summer or winter', () => {
  const season = cleanSeason();
  season.reviewed.push(
    { titleEN: 'Summer Show', ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T20:15:00-04:00' },
    { titleEN: 'Winter Show', ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-01-02T20:15:00-05:00' },
  );

  assert.deepEqual(validateSeason(season), []);
});

test('flags a dateReviewed in UTC or another offset, since the page shows the date as written', () => {
  for (const dateReviewed of ['2026-04-02T03:04:05Z', '2026-04-02T20:15:00-07:00', '2026-01-02T20:15:00-04:00', '2026-04-02T20:15:00-05:00']) {
    const season = cleanSeason();
    season.reviewed.push({ titleEN: 'Wrong Zone Show', ratingNumber: 3, ratingText: 'Meh', dateReviewed });

    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Wrong Zone Show"') && i.includes('Eastern')), `accepted ${dateReviewed}`);
  }
});

test('flags a dateReviewed in the future', () => {
  const season = cleanSeason();
  season.reviewed.push({ titleEN: 'Time Traveller', ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-05T08:00:00-04:00' });

  const now = Date.parse('2026-04-04T00:00:00-04:00');
  assert.ok(validateSeason(season, { now }).some(i => i.includes('"Time Traveller"') && i.includes('future')));
  assert.deepEqual(validateSeason(season, { now: Date.parse('2026-04-06T00:00:00-04:00') }), []);
});

test('flags a malformed fullReview/op/ed (not an object)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Malformed Addenda Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    op: 'should be an object, not a string',
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Malformed Addenda Show"') && i.includes('op')));
});

test('flags a malformed anilistId (not an integer)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad AnilistId Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    anilistId: 'not-a-number',
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad AnilistId Show"') && i.includes('anilistId')));
});

test('a well-formed anilistId does not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Linked Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    anilistId: 154587,
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed annId (not an integer)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad AnnId Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    annId: 'not-a-number',
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad AnnId Show"') && i.includes('annId')));
});

test('a well-formed annId does not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Linked Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    annId: 22622,
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed streaming (not an array)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad Streaming Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    streaming: 'netflix',
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Streaming Show"') && i.includes('streaming')));
});

test('flags an unknown streaming service key', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Typo Streaming Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    streaming: ['netflex'],
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Typo Streaming Show"') && i.includes('netflex')));
});

test('a well-formed streaming list does not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Streamed Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    streaming: ['crunchyroll', 'hidive', 'youtube', 'netflix', 'hulu', 'prime', 'oceanveil'],
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed crunchyrollUrl (not a string)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad CR Url Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    crunchyrollUrl: 12345,
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad CR Url Show"') && i.includes('crunchyrollUrl')));
});

test('a well-formed crunchyrollUrl does not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Streamed Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    streaming: ['crunchyroll'],
    crunchyrollUrl: 'https://www.crunchyroll.com/series/ABC123/streamed-show',
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed wikipediaUrl or wikipediaJaUrl (not a string)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad Wiki Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    wikipediaUrl: 12345,
  });
  season.reviewed.push({
    titleEN: 'Bad JP Wiki Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-03T08:00:00-04:00',
    wikipediaJaUrl: 67890,
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Wiki Show"') && i.includes('wikipediaUrl')));
  assert.ok(issues.some(i => i.includes('"Bad JP Wiki Show"') && i.includes('wikipediaJaUrl')));
});

test('well-formed Wikipedia URLs do not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Documented Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Documented_Show',
    wikipediaJaUrl: 'https://ja.wikipedia.org/wiki/\u745E\u9E97',
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed hidiveUrl or netflixUrl (not a string)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad HD Url Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    hidiveUrl: 12345,
  });
  season.reviewed.push({
    titleEN: 'Bad NF Url Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-03T08:00:00-04:00',
    netflixUrl: 67890,
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad HD Url Show"') && i.includes('hidiveUrl')));
  assert.ok(issues.some(i => i.includes('"Bad NF Url Show"') && i.includes('netflixUrl')));
});

test('a well-formed hidiveUrl and netflixUrl do not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Streamed Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    streaming: ['hidive', 'netflix'],
    hidiveUrl: 'https://www.hidive.com/season/streamed-show',
    netflixUrl: 'https://www.netflix.com/title/12345',
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed huluUrl or primeUrl (not a string)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad HU Url Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    huluUrl: 12345,
  });
  season.reviewed.push({
    titleEN: 'Bad PV Url Show',
    ratingNumber: 3,
    ratingText: 'Meh',
    dateReviewed: '2026-04-03T08:00:00-04:00',
    primeUrl: 67890,
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad HU Url Show"') && i.includes('huluUrl')));
  assert.ok(issues.some(i => i.includes('"Bad PV Url Show"') && i.includes('primeUrl')));
});

test('flags a malformed watchProgress (not a string)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad Progress Show',
    ratingNumber: 3,
    ratingText: 'Yeah',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    watchProgress: 3,
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Progress Show"') && i.includes('watchProgress')));
});

test('a well-formed watchProgress does not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'In-Progress Show',
    ratingNumber: 3,
    ratingText: 'Yeah',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    watchProgress: 'Ep 3',
  });

  assert.deepEqual(validateSeason(season), []);
});

test('a well-formed fullReview and liked op/ed do not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Fully Reviewed Show',
    ratingNumber: 3,
    ratingText: 'Finish Ep',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    fullReview: { ratingNumber: 5, ratingText: 'Nice Ep Broh', review: 'great', dateReviewed: '2026-06-01T08:00:00-04:00' },
    op: true,
    ed: true,
  });

  assert.deepEqual(validateSeason(season), []);
});

test('pending and skipped entries may be objects carrying the optional notes', () => {
  const season = cleanSeason();
  season.pending = [
    'Plain Pending Show',
    { title: 'Dated Show', firstEpisode: '2026-10-08' },
    { title: 'Streamed Show', streaming: ['crunchyroll', 'netflix'], firstEpisode: '2026-10-01' },
  ];
  season.skipped = [
    'Plain Skipped Show',
    { title: 'Paywalled Show', reason: 'Not paying for another service', streaming: ['oceanveil'] },
    { title: 'Unlicensed Show', reason: 'Not streaming in the US' },
  ];

  assert.deepEqual(validateSeason(season), []);
});

test('an object entry still takes part in the duplicate and cross-list checks', () => {
  const season = cleanSeason();
  season.pending = [{ title: 'Cool Show' }, { title: 'Twice' }, 'Twice'];
  season.skipped = [{ title: 'Twice', reason: 'x' }];

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Cool Show"') && i.includes('reviewed but still listed in pending')));
  assert.ok(issues.some(i => i.includes('"Twice"') && i.includes('more than once in pending')));
  assert.ok(issues.some(i => i.includes('"Twice"') && i.includes('both pending and skipped')));
});

test('flags an entry with no usable title', () => {
  const season = cleanSeason();
  season.pending = [{ firstEpisode: '2026-10-08' }, ''];
  season.skipped = [42];

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('pending[0]') && i.includes('title')));
  assert.ok(issues.some(i => i.includes('pending[1]') && i.includes('title')));
  assert.ok(issues.some(i => i.includes('skipped[0]') && i.includes('title')));
});

test('flags unknown fields, including one that belongs to the other list', () => {
  const season = cleanSeason();
  season.pending = [{ title: 'Typo Show', reasn: 'oops' }, { title: 'Wrong List Show', reason: 'not for pending' }];
  season.skipped = [{ title: 'Wrong List Skip', firstEpisode: '2026-10-08' }];

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Typo Show"') && i.includes('unknown field "reasn"')));
  assert.ok(issues.some(i => i.includes('"Wrong List Show"') && i.includes('unknown field "reason"')));
  assert.ok(issues.some(i => i.includes('"Wrong List Skip"') && i.includes('unknown field "firstEpisode"')));
});

test('flags malformed notes on a list entry', () => {
  const season = cleanSeason();
  season.pending = [
    { title: 'Bad Streaming', streaming: 'crunchyroll' },
    { title: 'Unknown Service', streaming: ['nope'] },
    { title: 'Not A Date', firstEpisode: '10/08/2026' },
    { title: 'Impossible Date', firstEpisode: '2026-02-30' },
  ];
  season.skipped = [
    { title: 'Empty Reason', reason: '  ' },
    { title: 'Old Flag', noUSStreaming: true },
  ];

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Streaming"') && i.includes('malformed streaming')));
  assert.ok(issues.some(i => i.includes('"Unknown Service"') && i.includes('unknown streaming service "nope"')));
  assert.ok(issues.some(i => i.includes('"Not A Date"') && i.includes('malformed firstEpisode')));
  assert.ok(issues.some(i => i.includes('"Impossible Date"') && i.includes('malformed firstEpisode')));
  assert.ok(issues.some(i => i.includes('"Empty Reason"') && i.includes('malformed reason')));
  // The flag this replaced is now just an unknown field, so old data fails loudly instead of being ignored.
  assert.ok(issues.some(i => i.includes('"Old Flag"') && i.includes('unknown field "noUSStreaming"')));
});

test('list entries accept the per-service link fields, and flag a malformed one', () => {
  const season = cleanSeason();
  season.pending = [{ title: 'Linked Show', streaming: ['crunchyroll'], crunchyrollUrl: 'https://www.crunchyroll.com/series/X/linked' }];
  season.skipped = [{ title: 'Linked Skip', netflixUrl: 'https://www.netflix.com/title/1' }];
  assert.deepEqual(validateSeason(season), []);

  season.pending = [{ title: 'Bad Link', crunchyrollUrl: 42 }, { title: 'Empty Link', huluUrl: ' ' }];
  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Link"') && i.includes('malformed crunchyrollUrl')));
  assert.ok(issues.some(i => i.includes('"Empty Link"') && i.includes('malformed huluUrl')));
});

test('availableNow is a boolean on a pending entry, and not combined with a firstEpisode', () => {
  const season = cleanSeason();
  season.pending = [{ title: 'Out Already', availableNow: true }];
  assert.deepEqual(validateSeason(season), []);

  season.pending = [
    { title: 'Bad Flag', availableNow: 'yes' },
    { title: 'Both', availableNow: true, firstEpisode: '2026-10-01' },
  ];
  season.skipped = [{ title: 'Wrong List', availableNow: true }];
  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Flag"') && i.includes('malformed availableNow')));
  assert.ok(issues.some(i => i.includes('"Both"') && i.includes('availableNow but also has a firstEpisode')));
  assert.ok(issues.some(i => i.includes('"Wrong List"') && i.includes('unknown field "availableNow"')));
});

test('youtubeUrl is accepted on a review and a list entry, and flagged when malformed', () => {
  const season = cleanSeason();
  season.reviewed[0].streaming = ['youtube'];
  season.reviewed[0].youtubeUrl = 'https://www.youtube.com/@Show';
  season.pending = [{ title: 'Linked Pending', streaming: ['youtube'], youtubeUrl: 'https://www.youtube.com/playlist?list=abc' }];
  assert.deepEqual(validateSeason(season), []);

  season.reviewed[0].youtubeUrl = 123;
  season.skipped = [{ title: 'Bad Skip Link', youtubeUrl: ' ' }];
  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('Cool Show') && i.includes('youtubeUrl')));
  assert.ok(issues.some(i => i.includes('"Bad Skip Link"') && i.includes('malformed youtubeUrl')));
});

// A revisit's rating replaces the episode-1 one in sorting, filtering and every
// /vqar-stats number, so saving a revisit without one silently keeps the old
// rating in all of those. Validation is what makes that impossible to miss.
test('flags a fullReview saved without a ratingNumber', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Unrated Revisit Show',
    ratingNumber: 3,
    ratingText: 'Finish Ep',
    dateReviewed: '2026-04-02T08:00:00-04:00',
    fullReview: { review: 'finished it, it was fine', dateReviewed: '2026-06-01' },
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Unrated Revisit Show"') && i.includes('fullReview') && i.includes('ratingNumber')));
  assert.ok(issues.some(i => i.includes('"Unrated Revisit Show"') && i.includes('fullReview') && i.includes('ratingText')));
});

test('flags a fullReview ratingNumber outside the 0-5 tiers', () => {
  for (const ratingNumber of [6, -1, 2.5, '4']) {
    const season = cleanSeason();
    season.reviewed.push({
      titleEN: 'Off-Scale Revisit Show',
      ratingNumber: 3,
      ratingText: 'Finish Ep',
      dateReviewed: '2026-04-02T08:00:00-04:00',
      fullReview: { ratingNumber, ratingText: 'whatever', review: 'x' },
    });

    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Off-Scale Revisit Show"') && i.includes('ratingNumber')), `accepted ${JSON.stringify(ratingNumber)}`);
  }
});

// A liked OP/ED is a bare marking now - the old rated/annotated object shape
// is rejected, so a session can't quietly reintroduce it.
test('flags an op/ed that is anything but true', () => {
  for (const value of [{ ratingText: 'Honorable Mention' }, false, 'yes', 1]) {
    const season = cleanSeason();
    season.reviewed.push({
      titleEN: 'Old-Shape OP Show',
      ratingNumber: 3,
      ratingText: 'Meh',
      dateReviewed: '2026-04-02T08:00:00-04:00',
      ed: value,
    });

    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Old-Shape OP Show"') && i.includes('ed')), `accepted ${JSON.stringify(value)}`);
  }
});

test('finishedSeason is a bare true marking, like op/ed', () => {
  const ok = cleanSeason();
  ok.reviewed[0].finishedSeason = true;
  assert.deepEqual(validateSeason(ok), []);

  for (const value of [false, 'yes', 1, { date: '2026-09-01' }]) {
    const season = cleanSeason();
    season.reviewed[0].finishedSeason = value;
    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Cool Show"') && i.includes('finishedSeason')), `accepted ${JSON.stringify(value)}`);
  }
});

test('a well-formed generated anilist object passes', () => {
  const season = cleanSeason();
  season.reviewed[0].anilistId = 154587;
  season.reviewed[0].anilist = { format: 'TV', genres: ['Action'], tags: ['Isekai'], studios: ['MAPPA'] };
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
    season.reviewed[0].anilistId = 154587;
    season.reviewed[0].anilist = anilist;
    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Cool Show"') && i.includes('anilist')), `accepted ${JSON.stringify(anilist)}`);
  }
});

test('flags anilist data on a review with no anilistId to have fetched it from', () => {
  const season = cleanSeason();
  season.reviewed[0].anilist = { genres: ['Action'], tags: [], studios: [] };
  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Cool Show"') && i.includes('anilistId')));
});

// --- Stricter review checks ---

function review(overrides = {}) {
  return { titleEN: 'Probe Show', ratingNumber: 3, ratingText: 'Meh', dateReviewed: '2026-04-02T08:00:00-04:00', ...overrides };
}

test('requires a whole-number ratingNumber from 0 to 5 on a review', () => {
  for (const ratingNumber of [undefined, '4', 7, -1, 2.5, null]) {
    const season = cleanSeason();
    season.reviewed.push(review({ ratingNumber }));

    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Probe Show"') && i.includes('ratingNumber')), `accepted ${JSON.stringify(ratingNumber)}`);
  }
  for (const ratingNumber of [0, 3, 5]) {
    const season = cleanSeason();
    season.reviewed.push(review({ ratingNumber }));
    assert.deepEqual(validateSeason(season), []);
  }
});

test('rejects an unknown review field, so a typo does not quietly do nothing', () => {
  for (const typo of ['finshedSeason', 'fullReveiw', 'streming']) {
    const season = cleanSeason();
    season.reviewed.push(review({ [typo]: true }));

    const issues = validateSeason(season);
    assert.ok(issues.some(i => i.includes('"Probe Show"') && i.includes(`unknown field "${typo}"`)), `accepted ${typo}`);
  }
});

test('rejects an unknown fullReview field', () => {
  const season = cleanSeason();
  season.reviewed.push(review({ fullReview: { ratingNumber: 4, ratingText: 'Yeah', review: 'x', notes: 'oops' } }));

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Probe Show"') && i.includes('fullReview') && i.includes('"notes"')));
});

test('rejects an unknown season field and a malformed number', () => {
  const season = { ...cleanSeason(), curent: true, number: '2603' };

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('unknown field "curent"')));
  assert.ok(issues.some(i => i.includes('malformed number')));
  assert.deepEqual(validateSeason({ ...cleanSeason(), number: 2603 }), []);
});

test('flags a reviewed, pending or skipped list that is not an array', () => {
  for (const key of ['reviewed', 'pending', 'skipped']) {
    const issues = validateSeason({ ...cleanSeason(), [key]: {} });
    assert.ok(issues.some(i => i.includes(`malformed ${key}`) && i.includes('array')), `accepted a non-array ${key}`);
  }
});

test('flags titles that differ only in case or punctuation, across the lists too', () => {
  const season = cleanSeason();
  season.reviewed.push(review({ titleEN: 'Probe Show!' }));
  season.skipped.push('probe show');

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Probe Show!"') && i.includes('"probe show"') && i.includes('case or punctuation')));
});

test('flags a streaming service listed twice, and an empty link on a review', () => {
  const season = cleanSeason();
  season.reviewed.push(review({ streaming: ['hidive', 'hidive'], hidiveUrl: ' ' }));

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Probe Show"') && i.includes('"hidive"') && i.includes('more than once')));
  assert.ok(issues.some(i => i.includes('"Probe Show"') && i.includes('malformed hidiveUrl')));
});

test('checks a fullReview date: real, not in the future, not before the episode-1 review', () => {
  const withRevisit = (dateReviewed) => {
    const season = cleanSeason();
    season.reviewed.push(review({ fullReview: { ratingNumber: 4, ratingText: 'Yeah', review: 'x', dateReviewed } }));
    return validateSeason(season, { now: Date.parse('2026-06-01T00:00:00-04:00') });
  };

  assert.deepEqual(withRevisit('2026-04-20'), [], 'a plain date is allowed');
  assert.deepEqual(withRevisit('2026-04-20T21:00:00-04:00'), [], 'so is an Eastern timestamp');
  assert.ok(withRevisit('last tuesday').some(i => i.includes('fullReview.dateReviewed')));
  assert.ok(withRevisit('2026-02-30').some(i => i.includes('fullReview.dateReviewed')));
  assert.ok(withRevisit('2026-04-20T21:00:00Z').some(i => i.includes('Eastern')));
  assert.ok(withRevisit('2026-07-01').some(i => i.includes('future')));
  assert.ok(withRevisit('2026-04-01').some(i => i.includes('before its episode-1 review')));
});

test('flags the same AniList id reviewed in two seasons', () => {
  const winter = { ...cleanSeason(), id: 'winter-2026', reviewed: [review({ titleEN: 'Split Cour', anilistId: 187941 })] };
  const spring = { ...cleanSeason(), id: 'spring-2026', current: true, reviewed: [review({ titleEN: 'Split Cour, Again', anilistId: 187941 })] };

  const issues = validateSeasonCollection([winter, spring]);
  assert.ok(issues.some(i => i.includes('187941') && i.includes('"Split Cour" (winter-2026)') && i.includes('"Split Cour, Again" (spring-2026)')));

  spring.reviewed[0].anilistId = 1;
  assert.deepEqual(validateSeasonCollection([winter, spring]), []);
});
