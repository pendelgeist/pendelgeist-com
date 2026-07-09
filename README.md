# pendelgeist-com

Personal site, served as static assets from a Cloudflare Worker (see `wrangler.jsonc`).
The Worker (`src/worker.js`) also backs a small GraphQL API over the same anime data.

## Structure

- `public/index.html` — homepage, links out to the other sites.
- `public/vqar/` — Very Quick Anime Reviews, a small vanilla-JS app.
- `public/graphql/` — a GraphQL query explorer for the API described below.
- `public/styles.css` — shared site styles. `public/vqar/styles.css` and `public/graphql/styles.css`
  layer page-specific styles on top.
- `public/theme.js` — the theme picker (see below), loaded by every page.
- `src/worker.js` / `src/schema.js` — the Worker's fetch handler and GraphQL schema/resolvers.

## Theme

Every page loads `theme.js`, which adds an Auto/Light/Dark `<select>` into the `<nav>`
and persists the choice to `localStorage` (`pendelgeist:theme`). Picking a theme sets
`data-theme="light"|"dark"` on `<html>`; "Auto" removes it and falls back to the
OS/browser preference. An inline script in each page's `<head>` applies a saved theme
before first paint to avoid a flash of the wrong theme.

The actual colors live in `styles.css` as `--color-*` custom properties defined with
`light-dark(lightValue, darkValue)`, which resolve off the *used value* of `color-scheme`
— so picking a theme just narrows `color-scheme` to `light` or `dark`
(`:root[data-theme="dark"] { color-scheme: dark; }`) rather than redefining every
variable. A future non-light/dark theme would instead override the `--color-*`
variables directly for its own `[data-theme="..."]` selector, and get added to the
`THEMES` list in `theme.js`.

## VQAR data

Review data lives in gists, not in this repo. `public/vqar/app.js` fetches a manifest
gist first (`MANIFEST_URL`), which lists each season and an absolute raw URL to that
season's own gist:

```json
{
  "currentSeason": "spring-2026",
  "seasons": [
    { "id": "spring-2026", "name": "Spring 2026", "file": "https://gist.githubusercontent.com/.../raw/vqar-season-spring-2026.json" }
  ]
}
```

Each season's `file` must be the full raw URL to its own gist — not a bare filename —
since seasons are separate gists rather than multiple files in one. Adding a new season
means creating a new gist and adding an entry to the manifest; editing an old season's
gist never touches the others.

Each season's own gist has `id`, `name`, `reviewed`, `pending`, and `skipped`. It may also
carry a `number` (e.g. a MAL season id like `2603`) — that's optional, informational
metadata for your own reference and isn't read by the app or the manifest.

The manifest and the *current* season are always fetched fresh. Past seasons are cached
in `localStorage` after their first load, so switching between them is free after the
first visit — clear site data to force a re-fetch. If a season's URL is wrong or its gist
is unreachable, the page shows an error naming that season instead of failing silently.

### Review shape

Each entry in a season's `reviewed` array is a single-episode review plus three optional
follow-up notes, each shaped like `{ ratingNumber, ratingText, review, dateReviewed }`:

- `fullReview` — a full-series re-review once a "Finish Ep"-rated show actually gets finished.
- `op` / `ed` — opening/ending callouts, handy for finding the year's best OP/ED later.

All three are optional and independent — add whichever applies whenever you get to it.

### Validating gist data

`scripts/validate-gists.js` is a standalone check — it's not part of the website, just
something to run occasionally to make sure the underlying data is internally consistent.
It flags a show that's marked reviewed but still left in pending/skipped, a show listed in
both pending and skipped, duplicate entries within the same list, and reviews missing
required fields or with an unparseable date.

```
npm run validate-gists                  # fetches the live manifest and checks every season
npm run validate-gists -- ./draft.json  # or check one or more local files/URLs directly
```

## GraphQL API

`GET /graphql` serves a small vanilla-JS query explorer (`public/graphql/`); `POST /graphql`
runs a query against a schema (`src/schema.js`) built with `graphql-js` and executed in the
Worker. Both routes are handled by `src/worker.js`, which otherwise just forwards every
other request to the static assets — the VQAR page itself is untouched and still fetches
the gists directly, client-side.

The API fetches the same manifest + per-season gists documented above, reshaping each
review to add its `season`/`seasonName`, the way `public/vqar/app.js` does on the client.
Nothing is cached; every query re-fetches from the gists.

```
type Query {
  seasons: [SeasonSummary!]!    # every season in the manifest (id + name only)
  currentSeason: Season         # the manifest's current season, with full review data
  season(id: ID!): Season       # a specific season's full data, by id
}
```

Example request:

```
curl -X POST https://pendelgeist.com/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{ currentSeason { name reviewed { titleEN ratingText } } }"}'
```

CORS is open on `/graphql`, so it's queryable from other origins too. Because the Worker
now has a `main` script (`src/worker.js`) instead of serving assets only, `/graphql` is
listed under `assets.run_worker_first` in `wrangler.jsonc` — otherwise Cloudflare would
serve the static explorer page for every method, including `POST`, without ever running
the Worker.

## Development

```
npm install
npm test
npm run dev     # wrangler dev, for exercising the Worker (including /graphql) locally
npm run deploy  # wrangler deploy
```

Tests (`test/`) run against the real `app.js` and `index.html` with a mocked
`fetch`/`localStorage` via jsdom — see `test/helpers.js`. The GraphQL schema/resolvers
(`test/graphql.test.js`) and the Worker's routing (`test/worker.test.js`) are tested the
same way, with `fetch` mocked instead of hitting the real gists. CI runs them on every PR
(`.github/workflows/test.yml`).
