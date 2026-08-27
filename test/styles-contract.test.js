import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STREAMING_SERVICES } from '../public/streaming.js';

/**
 * Two lists in JS promise that a matching rule exists in styles.css - adding an
 * entry to either and forgetting the CSS ships an unstyled badge or a theme
 * that picks but does nothing. Both docblocks say as much; these assert it.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf-8');
const themeJs = fs.readFileSync(path.join(__dirname, '../public/theme.js'), 'utf-8');

/** The ids in theme.js's THEMES array, in order. */
function themeIds() {
  const block = themeJs.match(/const THEMES = \[([\s\S]*?)\];/);
  assert.ok(block, 'could not find the THEMES array in theme.js');
  return [...block[1].matchAll(/id: '([^']+)'/g)].map(m => m[1]);
}

/** The theme ids styles.css actually has a [data-theme="..."] block for. */
function styledThemeIds() {
  return new Set([...css.matchAll(/\[data-theme="([^"]+)"\]/g)].map(m => m[1]));
}

test('every streaming service key has a badge rule in styles.css', () => {
  for (const key of Object.keys(STREAMING_SERVICES)) {
    assert.ok(
      css.includes(`.entry-streaming-${key}`),
      `streaming key "${key}" has no .entry-streaming-${key} rule in styles.css`
    );
  }
});

test('every badge rule in styles.css belongs to a known streaming key', () => {
  const keys = new Set(Object.keys(STREAMING_SERVICES));
  const styled = [...css.matchAll(/\.entry-streaming-([a-z0-9-]+)/g)]
    .map(m => m[1])
    .filter(name => name !== 'badge');

  for (const name of new Set(styled)) {
    assert.ok(keys.has(name), `styles.css styles "${name}", which is not in STREAMING_SERVICES`);
  }
});

test('every fixed theme has a [data-theme] block in styles.css', () => {
  const styled = styledThemeIds();
  for (const id of themeIds()) {
    // "system" is Auto: it deliberately sets no override, so it has no block.
    if (id === 'system') continue;
    assert.ok(styled.has(id), `theme "${id}" is offered in the picker but has no [data-theme="${id}"] rules`);
  }
});

test('every [data-theme] block in styles.css is a theme the picker offers', () => {
  const ids = new Set(themeIds());
  for (const styled of styledThemeIds()) {
    assert.ok(ids.has(styled), `styles.css styles [data-theme="${styled}"], which no THEMES entry offers`);
  }
});
