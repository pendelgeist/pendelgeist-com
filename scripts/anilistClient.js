/**
 * The one way the scripts talk to AniList's public GraphQL API
 * (https://anilist.co/graphiql), shared by validate-against-anilist.js and
 * fetch-anilist-tags.js. Scripts only - the site itself never calls AniList.
 */

export const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

/**
 * @param {string} query
 * @param {object} variables
 * @returns {Promise<any>} the response's `data`
 */
export async function anilistRequest(query, variables) {
  const response = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors) {
    const message = body.errors?.map(e => e.message).join('; ') ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body.data;
}
