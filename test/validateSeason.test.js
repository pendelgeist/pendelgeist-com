import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSeason } from '../scripts/validateSeason.js';

function cleanSeason() {
  return {
    id: 'spring-2026',
    name: 'Spring 2026',
    reviewed: [
      { titleEN: 'Cool Show', ratingText: 'Finish Ep', dateReviewed: '2026-04-01T12:00:00Z' },
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
  season.reviewed.push({ titleEN: 'Bad Date Show', ratingText: 'Meh', dateReviewed: 'not-a-date' });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Date Show"') && i.includes('dateReviewed')));
});

test('flags a dateReviewed that is only a date, with no time', () => {
  const season = cleanSeason();
  season.reviewed.push({ titleEN: 'Date Only Show', ratingText: 'Meh', dateReviewed: '2026-04-02' });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Date Only Show"') && i.includes('dateReviewed') && i.includes('timestamp')));
});

test('accepts a dateReviewed timestamp with a UTC or offset suffix', () => {
  const season = cleanSeason();
  season.reviewed.push(
    { titleEN: 'Zulu Show', ratingText: 'Meh', dateReviewed: '2026-04-02T03:04:05Z' },
    { titleEN: 'Offset Show', ratingText: 'Meh', dateReviewed: '2026-04-02T20:15:00-07:00' },
  );

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed fullReview/op/ed (not an object)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Malformed Addenda Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T12:00:00Z',
    op: 'should be an object, not a string',
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Malformed Addenda Show"') && i.includes('op')));
});

test('flags a malformed anilistId (not an integer)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad AnilistId Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T12:00:00Z',
    anilistId: 'not-a-number',
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad AnilistId Show"') && i.includes('anilistId')));
});

test('a well-formed anilistId does not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Linked Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T12:00:00Z',
    anilistId: 154587,
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed annId (not an integer)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad AnnId Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T12:00:00Z',
    annId: 'not-a-number',
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad AnnId Show"') && i.includes('annId')));
});

test('a well-formed annId does not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Linked Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T12:00:00Z',
    annId: 22622,
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed streaming (not an array)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad Streaming Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T12:00:00Z',
    streaming: 'netflix',
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Streaming Show"') && i.includes('streaming')));
});

test('flags an unknown streaming service key', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Typo Streaming Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T12:00:00Z',
    streaming: ['netflex'],
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Typo Streaming Show"') && i.includes('netflex')));
});

test('a well-formed streaming list does not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Streamed Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T12:00:00Z',
    streaming: ['crunchyroll', 'hidive', 'youtube', 'netflix', 'hulu', 'prime', 'oceanveil'],
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed crunchyrollUrl (not a string)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad CR Url Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T12:00:00Z',
    crunchyrollUrl: 12345,
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad CR Url Show"') && i.includes('crunchyrollUrl')));
});

test('a well-formed crunchyrollUrl does not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Streamed Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T12:00:00Z',
    streaming: ['crunchyroll'],
    crunchyrollUrl: 'https://www.crunchyroll.com/series/ABC123/streamed-show',
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed wikipediaUrl or wikipediaJaUrl (not a string)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad Wiki Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T12:00:00Z',
    wikipediaUrl: 12345,
  });
  season.reviewed.push({
    titleEN: 'Bad JP Wiki Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-03T12:00:00Z',
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
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T12:00:00Z',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Documented_Show',
    wikipediaJaUrl: 'https://ja.wikipedia.org/wiki/\u745E\u9E97',
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed hidiveUrl or netflixUrl (not a string)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad HD Url Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T12:00:00Z',
    hidiveUrl: 12345,
  });
  season.reviewed.push({
    titleEN: 'Bad NF Url Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-03T12:00:00Z',
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
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T12:00:00Z',
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
    ratingText: 'Meh',
    dateReviewed: '2026-04-02T12:00:00Z',
    huluUrl: 12345,
  });
  season.reviewed.push({
    titleEN: 'Bad PV Url Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-03T12:00:00Z',
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
    ratingText: 'Yeah',
    dateReviewed: '2026-04-02T12:00:00Z',
    watchProgress: 3,
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad Progress Show"') && i.includes('watchProgress')));
});

test('a well-formed watchProgress does not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'In-Progress Show',
    ratingText: 'Yeah',
    dateReviewed: '2026-04-02T12:00:00Z',
    watchProgress: 'Ep 3',
  });

  assert.deepEqual(validateSeason(season), []);
});

test('a well-formed fullReview and liked op/ed do not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Fully Reviewed Show',
    ratingText: 'Finish Ep',
    dateReviewed: '2026-04-02T12:00:00Z',
    fullReview: { ratingNumber: 5, ratingText: 'Nice Ep Broh', review: 'great', dateReviewed: '2026-06-01T12:00:00Z' },
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
    ratingText: 'Finish Ep',
    dateReviewed: '2026-04-02T12:00:00Z',
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
      ratingText: 'Finish Ep',
      dateReviewed: '2026-04-02T12:00:00Z',
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
      ratingText: 'Meh',
      dateReviewed: '2026-04-02T12:00:00Z',
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
