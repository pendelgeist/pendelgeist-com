import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');

test('homepage links to VQAR, the GraphQL API, the AMO Kenzoku Podcast, and GitHub', () => {
  const { document } = new JSDOM(html).window;

  const links = [...document.querySelectorAll('.link-card')].map((a) => a.getAttribute('href'));
  assert.ok(links.includes('/vqar'), 'expected a link to /vqar');
  assert.ok(links.includes('/vqar-stats'), 'expected a link to /vqar-stats');
  assert.ok(links.includes('/eva-tv'), 'expected a link to /eva-tv');
  assert.ok(links.includes('/nasubi'), 'expected a link to /nasubi');
  assert.ok(links.includes('/graphql'), 'expected a link to /graphql');
  assert.ok(
    links.includes('https://amokenzoku.com/podcast/'),
    'expected a link to the AMO Kenzoku podcast page'
  );
  assert.ok(
    links.includes('https://github.com/pendelgeist/pendelgeist-com'),
    'expected a link to the pendelgeist-com GitHub repo'
  );
  assert.ok(
    links.includes('https://github.com/pendelgeist/wanikani-claude-cli-skill'),
    'expected a link to the wanikani-claude-cli-skill GitHub repo'
  );
});

test('homepage uses the shared site stylesheet and its own page-specific stylesheet', () => {
  const { document } = new JSDOM(html).window;
  const hrefs = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
  assert.ok(hrefs.includes('/styles.css'));
  assert.ok(hrefs.includes('/home.css'));
});
