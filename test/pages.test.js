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

/** The pre-paint script is duplicated into every page on purpose; this is what keeps the copies honest. */
function prePaintScript(htmlPath) {
  const { document } = new JSDOM(fs.readFileSync(htmlPath, 'utf-8')).window;
  return [...document.querySelectorAll('head script:not([src])')]
    .map(s => s.textContent)
    .find(s => s.includes('pendelgeist:theme'));
}

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

test('every page carries the same pre-paint theme script, character for character', () => {
  // It has to be inline and duplicated to run before first paint, so nothing
  // but a test stops one copy from drifting after an edit to another.
  const [firstName, firstPath] = Object.entries(PAGES)[0];
  const expected = prePaintScript(firstPath);
  assert.ok(expected, `${firstName} has no pre-paint script to compare against`);

  for (const [name, htmlPath] of Object.entries(PAGES)) {
    assert.equal(prePaintScript(htmlPath), expected, `${name}'s pre-paint script has drifted from ${firstName}'s`);
  }
});

test('every page has a meta description', () => {
  for (const [name, htmlPath] of Object.entries(PAGES)) {
    const { document } = new JSDOM(fs.readFileSync(htmlPath, 'utf-8')).window;
    const description = document.querySelector('meta[name="description"]');

    assert.ok(description, `${name} is missing a meta description`);
    assert.ok(description.content.length > 50, `${name}'s meta description is too short to be useful`);
  }
});

test('every page has its own title and declares a language', () => {
  const titles = new Map();
  for (const [name, htmlPath] of Object.entries(PAGES)) {
    const { document } = new JSDOM(fs.readFileSync(htmlPath, 'utf-8')).window;

    assert.equal(document.documentElement.getAttribute('lang'), 'en', `${name} is missing lang="en"`);
    const title = document.querySelector('title')?.textContent;
    assert.ok(title, `${name} has no title`);
    assert.equal(titles.get(title), undefined, `${name} shares its title with ${titles.get(title)}`);
    titles.set(title, name);
  }
});
