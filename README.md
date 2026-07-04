# pendelgeist-com

Personal site, served as static assets from a Cloudflare Worker (see `wrangler.jsonc`).

## Structure

- `public/index.html` — homepage, links out to the other sites.
- `public/vqar/` — Very Quick Anime Reviews, a small vanilla-JS app.
- `public/styles.css` — shared site styles. `public/vqar/styles.css` layers VQAR-only styles on top.

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

The manifest and the *current* season are always fetched fresh. Past seasons are cached
in `localStorage` after their first load, so switching between them is free after the
first visit — clear site data to force a re-fetch. If a season's URL is wrong or its gist
is unreachable, the page shows an error naming that season instead of failing silently.

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

## Development

```
npm install
npm test
```

Tests (`test/`) run against the real `app.js` and `index.html` with a mocked
`fetch`/`localStorage` via jsdom — see `test/helpers.js`. CI runs them on every PR
(`.github/workflows/test.yml`).
