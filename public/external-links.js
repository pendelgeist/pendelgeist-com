/**
 * The "look this show up elsewhere" links both review pages render (/vqar and
 * /fsar), built from the same optional fields on a review.
 *
 * AniList and ANN are stored as numeric ids and expanded into URLs here, so a
 * site redesign on their end is one edit. Wikipedia is stored as the article
 * URL itself: it keys on the article title rather than an id, and the two
 * language editions rarely agree about what that title is.
 */

/**
 * @typedef {Object} Linkable
 * @property {number} [anilistId]
 * @property {number} [annId]
 * @property {string} [wikipediaUrl]
 * @property {string} [wikipediaJaUrl]
 */

/**
 * Builds one outbound `<a>` per reference the entry carries, in a fixed order.
 * Callers style them by adding a class or by where they're appended.
 * @param {Linkable} entry
 * @returns {HTMLAnchorElement[]} empty if the entry carries no references
 */
export function createExternalLinks(entry) {
  return [
    entry.anilistId && ['AniList', `https://anilist.co/anime/${entry.anilistId}`],
    entry.annId && ['ANN', `https://www.animenewsnetwork.com/encyclopedia/anime.php?id=${entry.annId}`],
    entry.wikipediaUrl && ['Wikipedia', entry.wikipediaUrl],
    entry.wikipediaJaUrl && ['Wikipedia (JP)', entry.wikipediaJaUrl],
  ].filter(Boolean).map(([label, href]) => {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    return a;
  });
}
