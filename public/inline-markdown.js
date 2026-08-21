/**
 * Tiny inline-markdown parser shared by the pages that render curated prose
 * from committed JSON (/nasubi, /fsar). Supports **bold**, *italic*, and
 * [text](url) links - deliberately not real Markdown, just the three things
 * hand-written body text actually needs.
 *
 * Everything here builds DOM nodes rather than assigning innerHTML, so a
 * stray '<' in a review body is text, never markup.
 */

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
    } else {
      const a = document.createElement('a');
      a.href = match[4];
      a.textContent = match[3];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      nodes.push(a);
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
