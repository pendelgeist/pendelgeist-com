# pendelgeist-com

Personal site, served as static assets from a Cloudflare Worker (see `wrangler.jsonc`).
The Worker (`src/worker.js`) also backs a small GraphQL API over the same anime data.

## Structure

- `public/index.html` — homepage, links out to the other sites.
- `public/vqar/` — Very Quick Anime Reviews, a small vanilla-JS app.
- `public/graphql/` — a GraphQL query explorer for the API described below.
- `public/styles.css` — shared site styles. `public/vqar/styles.css` and `public/graphql/styles.css`
  layer page-specific styles on top.
- `public/theme.js` / `public/theme-palette.js` — the theme picker (see below) and the
  color-math behind the two random themes, loaded by every page.
- `public/manifest-url.js` — the manifest gist URL, the one thing `public/vqar/app.js`,
  `src/schema.js`, and `scripts/validate-gists.js` all need to agree on.
- `src/worker.js` / `src/schema.js` — the Worker's fetch handler and GraphQL schema/resolvers.

## Theme

Every page loads `theme.js`, which adds a theme `<select>` into the `<nav>` and persists
the choice to `localStorage` (`pendelgeist:theme`). Picking a theme sets `data-theme="..."`
on `<html>`; "Auto" removes it and falls back to the OS/browser preference. An inline
script in each page's `<head>` applies a saved theme (and, for the random themes, its
saved palette — see below) before first paint to avoid a flash of the wrong theme.

The actual colors live in `styles.css` as `--color-*` custom properties. "Auto"/Light/Dark
define them with `light-dark(lightValue, darkValue)`, which resolves off the *used value*
of `color-scheme` — so picking Light or Dark just narrows `color-scheme` to one value
(`:root[data-theme="dark"] { color-scheme: dark; }`) rather than redefining every variable.
Rainbow, Vaporwave, and FFVII Menu are fixed novelty themes that instead override every
`--color-*` directly for their own `[data-theme="..."]` selector, plus theme-specific
flourishes layered on top: Rainbow adds an animated background wash, a gradient "frame"
around every card and the nav bar, gradient text on every heading, and confetti-colored
list bullets; Vaporwave adds a hazy sunset glow and a neon grid floor (both fixed
background layers behind the page content) plus glowing card/nav borders; FFVII Menu keeps
it to a radial background glow. A new theme along these lines just needs a CSS block like
those and an entry in the `THEMES` list in `theme.js`.

### Random (Light) / Random (Dark)

These two don't have fixed colors — `public/theme-palette.js` rolls a random hue for the
background and a random (but sufficiently different) hue for the accent, then *solves for*
a lightness at each hue that clears WCAG AA contrast (4.5:1) against whatever it'll actually
render on, rather than just picking one and hoping. `test/theme-palette.test.js` rolls each
mode 200 times and checks every text/background pairing still clears that bar.

The rolled palette is saved to `localStorage` per mode (`pendelgeist:theme:palette:random-light`/
`...random-dark`), so revisiting or switching back to it reuses the same colors instead of
re-rolling — a 🎲 button appears next to the picker (only while a random theme is active) to
roll a new one on demand. Switching to any other theme clears the inline overrides so they
don't linger on top of that theme's plain CSS.

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

Gist fetches (manifest and each season) are cached at the edge via `src/cache.js`, keyed
on URL, for 10 minutes — shows are added at most a few times a day, often zero, so a
query lagging behind a fresh edit by up to that long is a reasonable trade for cutting
nearly all repeat gist fetches. A failed fetch is never cached, so an outage isn't stuck.
`caches.default` isn't available under `node --test`, so tests exercise it via a small
in-memory stub (see `test/cache.test.js`) and otherwise just fall back to a plain fetch.

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
