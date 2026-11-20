import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDay, isMoment, isEasternMoment, easternOffset, dayOf, easternMoment } from '../public/dates.js';

test('isDay accepts real YYYY-MM-DD days only', () => {
  assert.equal(isDay('2026-04-01'), true);
  assert.equal(isDay('2024-02-29'), true);
  for (const value of ['2026-02-31', '2026-4-1', '2026-04-01T12:00:00-04:00', 'April 1st', '', 20260401, undefined]) {
    assert.equal(isDay(value), false, `accepted ${JSON.stringify(value)}`);
  }
});

test('isMoment accepts a full timestamp with any offset, and nothing less', () => {
  assert.equal(isMoment('2026-10-08T14:30:00-04:00'), true);
  assert.equal(isMoment('2026-10-08T14:30:00Z'), true);
  assert.equal(isMoment('2026-10-08T14:30:00.250-04:00'), true);
  for (const value of ['2026-10-08', '2026-10-08T14:30-04:00', '2026-02-31T12:00:00-05:00', 'soon', null]) {
    assert.equal(isMoment(value), false, `accepted ${JSON.stringify(value)}`);
  }
});

test('easternOffset follows daylight saving', () => {
  assert.equal(easternOffset(Date.parse('2026-07-01T12:00:00Z')), '-04:00');
  assert.equal(easternOffset(Date.parse('2026-01-15T12:00:00Z')), '-05:00');
});

test('isEasternMoment rejects UTC and the wrong side of a daylight-saving change', () => {
  assert.equal(isEasternMoment('2026-07-01T08:00:00-04:00'), true);
  assert.equal(isEasternMoment('2026-01-15T08:00:00-05:00'), true);
  assert.equal(isEasternMoment('2026-07-01T12:00:00Z'), false);
  assert.equal(isEasternMoment('2026-07-01T08:00:00-05:00'), false);
  assert.equal(isEasternMoment('2026-01-15T08:00:00-04:00'), false);
  assert.equal(isEasternMoment('2026-01-15'), false);
});

test('dayOf is the date exactly as written, offset and all', () => {
  assert.equal(dayOf('2026-10-08T23:30:00-07:00'), '2026-10-08');
  assert.equal(dayOf('2026-10-08'), '2026-10-08');
});

test('easternMoment gives a day a time with the right offset for that date', () => {
  assert.equal(easternMoment('2026-08-05'), '2026-08-05T12:00:00-04:00');
  assert.equal(easternMoment('2026-12-05'), '2026-12-05T12:00:00-05:00');
  assert.equal(easternMoment('2026-03-08'), '2026-03-08T12:00:00-04:00'); // the day daylight time starts
  assert.equal(easternMoment('2026-11-01'), '2026-11-01T12:00:00-05:00'); // the day it ends
  assert.equal(easternMoment('2026-08-05', '07:30:00'), '2026-08-05T07:30:00-04:00');
  assert.equal(isEasternMoment(easternMoment('2026-03-08')), true);
});
