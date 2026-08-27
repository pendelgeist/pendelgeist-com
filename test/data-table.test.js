import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createDataTable, createBarChart, renderBarChart, renderStatGrid, parseNumeric } from '../public/data-table.js';

// The module builds DOM nodes off the global `document`, the same way it does
// in the browser - so a jsdom document is all the setup it needs.
beforeEach(() => {
  global.document = new JSDOM('<!doctype html><body></body>').window.document;
});

const cellText = (table, selector) => [...table.querySelectorAll(selector)].map(el => el.textContent);
const bodyRows = (wrap) => [...wrap.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent));

test('parseNumeric strips thousands separators and percent signs', () => {
  assert.equal(parseNumeric('84,000'), 84000);
  assert.equal(parseNumeric('13.3%'), 13.3);
  assert.ok(Number.isNaN(parseNumeric('Apron')));
});

test('createDataTable renders headers and rows in order', () => {
  const wrap = createDataTable(['Title', 'Rating'], [['B Show', '3'], ['A Show', '5']]);

  assert.equal(wrap.className, 'table-scroll');
  assert.deepEqual(cellText(wrap, 'thead th'), ['Title', 'Rating']);
  assert.deepEqual(bodyRows(wrap), [['B Show', '3'], ['A Show', '5']]);
});

test('each header is a real button inside a scoped th, so the sort is keyboard-reachable', () => {
  const wrap = createDataTable(['Title'], [['A Show']]);
  const th = wrap.querySelector('thead th');

  assert.equal(th.getAttribute('scope'), 'col');
  assert.equal(th.getAttribute('aria-sort'), 'none');

  const button = th.querySelector('button.sort-button');
  assert.ok(button, 'expected a <button> to carry the header label');
  assert.equal(button.type, 'button');
});

test('clicking a header sorts, and clicking it again reverses', () => {
  const wrap = createDataTable(['Title'], [['B Show'], ['A Show'], ['C Show']]);
  const [button] = wrap.querySelectorAll('.sort-button');
  const th = wrap.querySelector('thead th');

  button.click();
  assert.deepEqual(bodyRows(wrap), [['A Show'], ['B Show'], ['C Show']]);
  assert.equal(th.getAttribute('aria-sort'), 'ascending');
  assert.ok(th.classList.contains('sorted-asc'));

  button.click();
  assert.deepEqual(bodyRows(wrap), [['C Show'], ['B Show'], ['A Show']]);
  assert.equal(th.getAttribute('aria-sort'), 'descending');
  assert.ok(th.classList.contains('sorted-desc'));
});

test('a fully numeric column sorts numerically, not as text', () => {
  const wrap = createDataTable(['Postcards'], [['9'], ['100'], ['20']]);

  wrap.querySelector('.sort-button').click();
  assert.deepEqual(bodyRows(wrap), [['9'], ['20'], ['100']]);
});

test('a column of mixed text and digits falls back to text sorting', () => {
  const wrap = createDataTable(['Value'], [['10'], ['Unknown'], ['2']]);

  wrap.querySelector('.sort-button').click();
  assert.deepEqual(bodyRows(wrap), [['10'], ['2'], ['Unknown']]);
});

test('sorting one column clears the sort indicator on the others', () => {
  const wrap = createDataTable(['Title', 'Rating'], [['B', '3'], ['A', '5']]);
  const [titleButton, ratingButton] = wrap.querySelectorAll('.sort-button');
  const [titleTh, ratingTh] = wrap.querySelectorAll('thead th');

  titleButton.click();
  ratingButton.click();

  assert.equal(titleTh.getAttribute('aria-sort'), 'none');
  assert.ok(!titleTh.classList.contains('sorted-asc'));
  assert.equal(ratingTh.getAttribute('aria-sort'), 'ascending');
});

test('renderStatGrid builds one tile per stat', () => {
  const container = document.createElement('div');
  renderStatGrid(container, [{ label: 'Total Reviews', value: '12' }, { label: 'Seasons', value: '3' }]);

  assert.deepEqual(cellText(container, '.stat-value'), ['12', '3']);
  assert.deepEqual(cellText(container, '.stat-label'), ['Total Reviews', 'Seasons']);
});

test('createBarChart labels every bar and describes the whole chart once', () => {
  const chart = createBarChart(
    [{ label: 'Jan', value: 50, display: '50' }, { label: 'Feb', value: 100, display: '100' }],
    { ariaLabel: 'Bar chart of Postcards by Month.' }
  );

  assert.equal(chart.getAttribute('role'), 'img');
  assert.equal(chart.getAttribute('aria-label'), 'Bar chart of Postcards by Month.');
  assert.deepEqual(cellText(chart, '.bar-label'), ['Jan', 'Feb']);
  assert.deepEqual(cellText(chart, '.bar-value'), ['50', '100']);

  // Heights are relative to the largest bar, with a floor so a zero still shows.
  const [first, second] = [...chart.querySelectorAll('.bar-fill')];
  assert.equal(first.style.height, '50%');
  assert.equal(second.style.height, '100%');
});

test('createBarChart returns null when there is nothing to plot', () => {
  assert.equal(createBarChart([]), null);
});

test('renderBarChart empties its container rather than leaving a stale chart behind', () => {
  const container = document.createElement('div');
  renderBarChart(container, [{ label: 'Jan', value: 1, display: '1' }]);
  assert.ok(container.querySelector('.bar-chart'));

  renderBarChart(container, []);
  assert.equal(container.childElementCount, 0);
});
