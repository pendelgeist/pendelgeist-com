import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES = {
  home: path.join(__dirname, '../public/index.html'),
  vqar: path.join(__dirname, '../public/vqar/index.html'),
  eva: path.join(__dirname, '../public/eva-tv/index.html'),
  'eva-sources': path.join(__dirname, '../public/eva-tv/sources/index.html'),
  graphql: path.join(__dirname, '../public/graphql/index.html'),
  nasubi: path.join(__dirname, '../public/nasubi/index.html'),
  'vqar-stats': path.join(__dirname, '../public/vqar-stats/index.html'),
  fsar: path.join(__dirname, '../public/fsar/index.html'),
};

/** The inline <head> script, whitespace-normalized so indentation isn't the diff. */
function prePaintScript(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const { document } = new JSDOM(html).window;
  const script = [...document.querySelectorAll('head script:not([src])')]
    .find(s => s.textContent.includes('pendelgeist:theme'));
  return script?.textContent.replace(/\s+/g, ' ').trim() ?? null;
}

// The pre-paint script is duplicated into every page on purpose - it has to run
// before the first paint, so it can't be an external module. Nothing but this
// test stops the copies drifting once one of them is edited.
test('every page carries the same pre-paint theme script', () => {
  const [reference, ...rest] = Object.entries(PAGES);
  const expected = prePaintScript(reference[1]);
  assert.ok(expected, `expected ${reference[0]} to carry a pre-paint script`);

  for (const [name, htmlPath] of rest) {
    assert.equal(
      prePaintScript(htmlPath), expected,
      `${name}'s pre-paint theme script has drifted from ${reference[0]}'s`
    );
  }
});

// The script reads the same storage keys theme.js writes; a rename on one side
// only shows up as a flash of the wrong theme, which is easy to miss.
test('the pre-paint script and theme.js agree on the storage keys', () => {
  const themeJs = fs.readFileSync(path.join(__dirname, '../public/theme.js'), 'utf-8');
  const script = prePaintScript(PAGES.home);

  for (const key of ["'pendelgeist:theme'", "'pendelgeist:theme:palette:'"]) {
    assert.ok(themeJs.includes(key), `expected theme.js to use ${key}`);
    assert.ok(script.includes(key.replaceAll("'", '')), `expected the pre-paint script to use ${key}`);
  }
});

for (const [name, htmlPath] of Object.entries(PAGES)) {
  test(`${name} page loads the theme picker script and has a nav to attach it to`, () => {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const { document } = new JSDOM(html).window;

    assert.ok(document.querySelector('script[src="/theme.js"]'), 'expected a script tag loading /theme.js');
    assert.ok(document.querySelector('nav'), 'expected a <nav> for theme.js to attach the picker to');
  });

  test(`${name} page applies a saved theme before first paint`, () => {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const { document } = new JSDOM(html).window;

    const headScripts = [...document.querySelectorAll('head script:not([src])')].map(s => s.textContent);
    assert.ok(
      headScripts.some(s => s.includes('pendelgeist:theme') && s.includes('data-theme')),
      'expected an inline <head> script applying a saved theme before paint'
    );
  });
}
