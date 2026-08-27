/**
 * Tiny inline-markdown parser shared by the pages that render curated prose
 * from committed JSON (/nasubi, /fsar). Supports **bold**, *italic*, and
 * [text](url) links - deliberately not real Markdown, just the three things
 * hand-written body text actually needs.
 *
 * Everything here builds DOM nodes rather than assigning innerHTML, so a
 * stray '<' in a review body is text, never markup, and a link's href has to
 * be http(s) - a `javascript:` URL renders as plain text instead.
 *
 * Deliberate limits, since this is a grammar rather than a parser: markers
 * don't nest (`***x***` is not both), don't span newlines, and aren't
 * word-boundary aware, so prose that needs a literal asterisk between digits
 * ("a 2*3*4 grid") will italicize instead. Write those around it.
 */

/**
 * Links come from committed JSON, so this is a guard against a typo becoming a
 * script URL rather than against an attacker - but the cost is one check.
 * @param {string} url
 */
function isSafeHref(url) {
  return /^https?:\/\//i.test(url.trim());
}

/**
 * @param {string} text
 * @returns {Node[]}
 */
export function parseInline(text) {
  const nodes = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((.+?)\)/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    if (match[1] !== undefined) {
      const strong = document.createElement('strong');
      strong.textContent = match[1];
      nodes.push(strong);
    } else if (match[2] !== undefined) {
      const em = document.createElement('em');
      em.textContent = match[2];
      nodes.push(em);
    } else if (isSafeHref(match[4])) {
      const a = document.createElement('a');
      a.href = match[4].trim();
      a.textContent = match[3];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      nodes.push(a);
    } else {
      // Not a link we're willing to render: keep the source text visible so the
      // mistake is obvious in the page rather than silently dropped.
      nodes.push(document.createTextNode(match[0]));
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(document.createTextNode(text.slice(lastIndex)));
  }
  return nodes;
}

/** @param {string} text */
export function createParagraph(text) {
  const p = document.createElement('p');
  p.append(...parseInline(text));
  return p;
}

/**
 * @param {HTMLElement} container
 * @param {string[]} paragraphs
 */
export function renderProse(container, paragraphs) {
  container.replaceChildren(...(paragraphs ?? []).map(createParagraph));
}
