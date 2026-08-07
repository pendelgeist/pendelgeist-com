import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSeason } from '../scripts/validateSeason.js';

function cleanSeason() {
  return {
    id: 'spring-2026',
    name: 'Spring 2026',
    reviewed: [
      { titleEN: 'Cool Show', ratingText: 'Finish Ep', dateReviewed: '2026-04-01' },
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

test('flags a malformed fullReview/op/ed (not an object)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Malformed Addenda Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02',
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
    dateReviewed: '2026-04-02',
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
    dateReviewed: '2026-04-02',
    anilistId: 154587,
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed annId (not an integer)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad AnnId Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02',
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
    dateReviewed: '2026-04-02',
    annId: 22622,
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed malId (not an integer)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad MalId Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02',
    malId: 'not-a-number',
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad MalId Show"') && i.includes('malId')));
});

test('a well-formed malId does not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Linked Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02',
    malId: 52741,
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed malScore (not a number, or out of the 0-10 range)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad MalScore Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02',
    malScore: 'not-a-number',
  });
  season.reviewed.push({
    titleEN: 'Out Of Range MalScore Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-03',
    malScore: 11,
  });

  const issues = validateSeason(season);
  assert.ok(issues.some(i => i.includes('"Bad MalScore Show"') && i.includes('malScore')));
  assert.ok(issues.some(i => i.includes('"Out Of Range MalScore Show"') && i.includes('malScore')));
});

test('a well-formed malScore does not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Compared Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02',
    malScore: 7.82,
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed streaming (not an array)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad Streaming Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02',
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
    dateReviewed: '2026-04-02',
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
    dateReviewed: '2026-04-02',
    streaming: ['crunchyroll', 'hidive', 'youtube', 'netflix', 'hulu', 'prime'],
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed crunchyrollUrl (not a string)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad CR Url Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02',
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
    dateReviewed: '2026-04-02',
    streaming: ['crunchyroll'],
    crunchyrollUrl: 'https://www.crunchyroll.com/series/ABC123/streamed-show',
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed hidiveUrl or netflixUrl (not a string)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad HD Url Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-02',
    hidiveUrl: 12345,
  });
  season.reviewed.push({
    titleEN: 'Bad NF Url Show',
    ratingText: 'Meh',
    dateReviewed: '2026-04-03',
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
    dateReviewed: '2026-04-02',
    streaming: ['hidive', 'netflix'],
    hidiveUrl: 'https://www.hidive.com/season/streamed-show',
    netflixUrl: 'https://www.netflix.com/title/12345',
  });

  assert.deepEqual(validateSeason(season), []);
});

test('flags a malformed watchProgress (not a string)', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Bad Progress Show',
    ratingText: 'Yeah',
    dateReviewed: '2026-04-02',
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
    dateReviewed: '2026-04-02',
    watchProgress: 'Ep 3',
  });

  assert.deepEqual(validateSeason(season), []);
});

test('a well-formed fullReview/op/ed does not trigger a false positive', () => {
  const season = cleanSeason();
  season.reviewed.push({
    titleEN: 'Fully Reviewed Show',
    ratingText: 'Finish Ep',
    dateReviewed: '2026-04-02',
    fullReview: { ratingText: 'Nice Ep Broh', review: 'great', dateReviewed: '2026-06-01' },
    op: { ratingText: 'Bop of the Year' },
    ed: { ratingText: 'Catchy AF' },
  });

  assert.deepEqual(validateSeason(season), []);
});
