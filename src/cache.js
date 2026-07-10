// New reviews land a few times a day at most, often zero, so it's fine for a
// query to lag behind a fresh edit by up to this long in exchange for cutting
// nearly all repeat gist fetches.
const CACHE_TTL_SECONDS = 600;

/**
 * A GET fetch that reuses Cloudflare's edge Cache API across requests, keyed
 * on the URL alone. Falls back to a plain fetch with no caching when `caches`
 * isn't available (e.g. under `node --test`). Non-ok responses are never
 * cached, so a transient gist outage doesn't get stuck.
 * @param {string} url
 */
export async function cachedFetch(url) {
  const cache = globalThis.caches?.default;

  if (cache) {
    const cached = await cache.match(url);
    if (cached) return cached;
  }

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok || !cache) return response;

  const toCache = new Response(response.clone().body, response);
  toCache.headers.set('cache-control', `max-age=${CACHE_TTL_SECONDS}`);
  await cache.put(url, toCache);

  return response;
}
