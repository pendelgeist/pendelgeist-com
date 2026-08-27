import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseInline, createParagraph, renderProse } from '../public/inline-markdown.js';

// The module builds DOM nodes, so it needs a document to build them with.
global.document = new JSDOM('').window.document;

/** Renders a source string and returns the markup it produced. */
function render(source) {
  const div = document.createElement('div');
  div.append(...parseInline(source));
  return div.innerHTML;
}

test('plain text passes through untouched', () => {
  assert.equal(render('just some prose'), 'just some prose');
});

test('renders bold and italic', () => {
  assert.equal(render('**bold** and *italic*'), '<strong>bold</strong> and <em>italic</em>');
});

test('renders a link, opening it safely in a new tab', () => {
  const div = document.createElement('div');
  div.append(...parseInline('[AniList](https://anilist.co/anime/1)'));
  const a = div.querySelector('a');

  assert.equal(a.getAttribute('href'), 'https://anilist.co/anime/1');
  assert.equal(a.textContent, 'AniList');
  assert.equal(a.target, '_blank');
  assert.equal(a.rel, 'noopener noreferrer');
});

test('markup in the source is text, never markup', () => {
  // The whole reason this builds nodes instead of assigning innerHTML.
  assert.equal(render('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(render('a < b && c > d'), 'a &lt; b &amp;&amp; c &gt; d');
});

test('a non-http link scheme is left as visible text rather than becoming a link', () => {
  for (const source of ['[x](javascript:alert(1))', '[x](  javascript:alert(1))', '[x](data:text/html,hi)']) {
    const div = document.createElement('div');
    div.append(...parseInline(source));

    assert.equal(div.querySelector('a'), null, `${source} should not produce a link`);
    assert.match(div.textContent, /\[x\]\(/, 'the unrendered source should stay visible');
  }
});

test('an unclosed marker stays literal instead of eating the rest of the line', () => {
  assert.equal(render('unclosed **bold'), 'unclosed **bold');
  assert.equal(render('a [link with no url'), 'a [link with no url');
});

test('markers do not span newlines', () => {
  assert.equal(render('**not\nbold**'), '**not\nbold**');
});

test('link text is not parsed for further markup', () => {
  assert.equal(
    render('[a **b**](https://e.test)'),
    '<a href="https://e.test" target="_blank" rel="noopener noreferrer">a **b**</a>'
  );
});

test('createParagraph wraps the parsed nodes in a <p>', () => {
  const p = createParagraph('some **emphasis**');

  assert.equal(p.tagName, 'P');
  assert.equal(p.innerHTML, 'some <strong>emphasis</strong>');
});

test('renderProse replaces a container with one paragraph per string', () => {
  const container = document.createElement('div');
  container.textContent = 'stale content';

  renderProse(container, ['first', 'second']);

  assert.deepEqual([...container.children].map(el => el.textContent), ['first', 'second']);
});

test('renderProse treats missing paragraphs as empty rather than throwing', () => {
  const container = document.createElement('div');
  renderProse(container, undefined);

  assert.equal(container.children.length, 0);
});
