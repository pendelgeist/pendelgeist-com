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
};

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
