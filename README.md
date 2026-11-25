# pendelgeist-com

**Status: alpha.** Personal site, actively in flux — structure, content, and conventions
here can and do change without much ceremony.

Personal site, served as static assets from a Cloudflare Worker (see `wrangler.jsonc`).
The Worker (`src/worker.js`) also backs a small GraphQL API over the same anime data.

## Structure

- `public/index.html` — homepage, links out to the other sites.
- `public/vqar/` — Very Quick Anime Reviews, a small vanilla-JS app.
- `public/games/` — Very Quick Game Reviews, first impressions of games in the VQAR spirit.
- `public/eva-tv/` — Neon Genesis Evangelion episode timeline, a small vanilla-JS app.
- `public/nasubi/` — a data analysis of Nasubi's *Susunu! Denpa Shonen* sweepstakes ordeal.
- `public/anime-stat-sheet/` — the "Anime Stat Sheet": career numbers and season reports over the VQAR review data.
- `public/graphql/` — a GraphQL query explorer for the API described below.
- `public/styles.css` — shared site styles (nav, theme variables, cards, filters). Every
  page then layers its own stylesheet on top — `public/vqar/styles.css`,
  `public/games/styles.css`, and so on — deliberately holding its own copy of anything
  page-specific rather than sharing it.
- `public/theme.js` / `public/theme-palette.js` — the theme picker (see below) and the
  color-math behind the two random themes, loaded by every page.
- `public/inline-markdown.js` — the tiny `**bold**`/`*italic*`/`[text](url)` parser the
  page that renders committed prose (`/nasubi`) uses.
- `public/streaming.js` — streaming service metadata + badge rendering, shared by `/vqar` and
  `scripts/validateSeason.js`.
- `public/vqar/list-entries.js` — the shape of a `toReview`/`notReviewing` list entry (a title string
  or an object with optional notes) and the helpers that read either, shared by `/vqar`,
  `src/schema.js` and the scripts.
- `public/dates.js` — the two forms a date takes in the committed data (a day, `YYYY-MM-DD`, or
  a moment, a full Eastern-offset timestamp) and the helpers that check and read them, shared by
  the pages, the GraphQL schema and the validators. See "Dates" under "VQAR data".
- `public/vqar/seasons.js` — what a season file's id means: whether it's a lineup or a shelf
  (see "Lineups and shelves"), and where it sorts.
- `public/external-links.js` — the AniList/ANN/Wikipedia reference links `/vqar` renders
  from the optional fields on a review.
- `public/data-table.js` — the sortable table, stat-tile grid, and bar chart the two
  data-analysis pages (`/nasubi`, `/anime-stat-sheet`) both render. Only the JS is shared: each
  page keeps its own `.data-table`/`.stat-tile`/`.bar-chart` rules, like every other
  page-specific style here.
- `public/vqar/data-paths.js` — the path to the VQAR season index, the one thing
  `public/vqar/app.js`, `public/anime-stat-sheet/app.js`, and `src/schema.js` all need to agree on.
- `public/vqar/oped.js` — what a liked OP/ED is: always a list of the numbers liked (`[1]`,
  `[1, 2]`). `/vqar`, `/anime-stat-sheet`, the GraphQL schema and the validator all read it through here.
- `public/vqar/reviews.js` — a show's `reviews` list: each review's stage (first impression,
  revisit, final, review), the current one, and the first impression. See "Show shape".
- `public/vqar/rating.js` — the other thing they have to agree on: which rating counts (the
  latest review's), each tier's default label (`RATING_NUMBER_LABELS`) that a review without its
  own `ratingText` falls back to, and which shows are waiting on a revisit.
- `public/vqar/aired.js` — when a show first aired (`aired`), how to show it, and whether it's
  worth showing (not when it's the lineup the show sits in).
- `src/worker.js` / `src/schema.js` — the Worker's fetch handler and GraphQL schema/resolvers.
- `src/recommend.js` — the `recommend` query's scoring (see "Recommendations").

## Theme

Every page loads `theme.js`, which adds a theme `<select>` into the `<nav>` and persists
the choice to `localStorage` (`pendelgeist:theme`). Picking a theme sets `data-theme="..."`
on `<html>`; "Auto" removes it and falls back to the OS/browser preference. An inline
script in each page's `<head>` applies a saved theme (and, for the random themes, its
saved palette — see below) before first paint to avoid a flash of the wrong theme.

A theme can be shared by link: `?theme=<id>` on any page (`/vqar?theme=manga-seinen-cinema`)
opens it in that theme — the pre-paint script reads the parameter first — and `theme.js`
then saves it as the visitor's choice and takes the parameter off the address bar, so the
pages that mirror their own controls into the query string keep a clean URL. An id the
picker doesn't offer is ignored rather than resetting the visitor's own theme. The 🔗 button
next to the picker copies a link to the current page in the current theme (falling back to a
prompt to copy by hand where the clipboard isn't available).

The actual colors live in `styles.css` as `--color-*` custom properties. "Auto"/Light/Dark
define them with `light-dark(lightValue, darkValue)`, which resolves off the *used value*
of `color-scheme` — so picking Light or Dark just narrows `color-scheme` to one value
(`:root[data-theme="dark"] { color-scheme: dark; }`) rather than redefining every variable.
Vaporwave, FFVII Menu, Eva-01, the manga themes, and Game Boy are fixed novelty themes that instead override
every `--color-*` directly for their own `[data-theme="..."]` selector. Beyond color, each
also gets its own `--font-heading`/`--font-body`, `--border-width`/`--border-style`,
`--radius-card`, and `--spacing-section` (the base values live in `:root`, same pattern as
the colors), plus theme-specific flourishes layered on top: Vaporwave is a synthwave dusk — a striped sunset sun and palm silhouettes
(`public/themes/vaporwave/`) on the horizon, a neon grid floor in perspective drifting toward
you, chrome italic headings with a VHS color split, and every section a
frosted Windows-95 window with its own title bar, dense enough (85%) that the sun behind
never drops text below AA; FFVII Menu keeps it to a radial
background glow, a diagonal gradient/bevel on every card echoing the game's own dialog
boxes with the menu window's silver rim, a pulsing "materia" glow on section headings, and
the pointing-hand cursor on the list row you're over; Eva-01 (Neon Genesis Evangelion's
Unit-01: violet chrome and cards, lime-green headings and armor-stripe card edges, the
orange chest plate for ratings, on the black-and-blood-red backdrop of the unit's key art,
in a MAGI-terminal monospace font) adds faint scanlines, lime/black caution striping under
the nav, and a quick heartbeat-style pulse on section
headings; the two manga themes share a grayscale base (both match `[data-theme^="manga"]`:
Mincho headings, hairline panels, the review in a speech bubble) with sketch art from
`public/themes/manga/` — Shoujo Manga (`manga-shoujo`), after Fruits Basket and Kare Kano (hairline
panels on a lot of white, a gray glitter-and-bokeh tone fading down from the top, light gray
chrome, serif-italic headings between sparkles, fine-lined roses and bubbles), and Seinen
Manga (`manga-seinen-cinema`), after Monster, Junji Ito and the modern seinen page, borrowing no
American-comic lettering, bursts or offset shadows (white pages and chrome; on `/vqar` the
reviews laid out as a page of panels in mixed widths with white gutters, each opening on a
band of tone with a katakana sound effect in its corner, both picked by the review's rating —
`app.js` stamps each card with `data-rating`, a revisit's rating once there is one: 5 ドーン
DOOON over focus lines raining down, 4 ワクワク WAKU WAKU over bright dot screen, 3 シーン SILENCE over flat
gray, 2 ズーン ZUUUN under hanging gloom lines, 1 ガーン GAAAN over heavy cross-hatching, 0
チーン CHIIIN on solid black; plain left-aligned review text; chapter openers with a ドン; a
page number at the foot; foliage and an old European street in fine line); Game Boy uses the DMG-01's four
greens, a pixel font and a faint LCD dot grid. The manga themes and Game Boy also redraw the
streaming badges in their own palette, rather than leaving brand orange and red as the only
off-palette color on the page.

Full-page decoration lives on `body::before`/`::after`, which every theme gets at
`z-index: -1` inside an `isolation: isolate` body, so it paints under the content instead
of across the text. The picker files the themes under `<optgroup>`s (the `group` on each
`THEMES` entry). All per-theme motion is neutralized by a
blanket `prefers-reduced-motion: reduce` rule at the bottom of `styles.css`, so it never
overrides that OS/browser preference. A new theme along these lines just needs a CSS block
like those and an entry in the `THEMES` list in `theme.js`.

FFVII Menu's headings also use Reactor7, a pixel font by Caveras modeled on the original
PlayStation release's actual in-game font, self-hosted at `public/fonts/reactor7/` and
loaded via `@font-face` at the top of `styles.css`. It's licensed CC BY-NC-SA 3.0 (see
`public/fonts/reactor7/license.txt`) — non-commercial use only, with attribution — and is
deliberately only ever set at 8px multiples, since it's a pixel font that blurs at any
other size. Like the game, the theme sets everything it can in it — section headings at
3rem, and the nav, card titles, ratings and review text at 2rem (the nav drops to 1.5rem on
a phone) — since its glyphs sit small in their em box and read at about body-text size there.

Press Start 2P, Game Boy's pixel heading face, is self-hosted under `public/fonts/` too (SIL
OFL 1.1, license alongside) and kept at 8px multiples for the same reason as Reactor7. A
browser only downloads a face that a rendered element uses, so it costs nothing outside its
theme.

### Random

Random doesn't have fixed colors — `public/theme-palette.js` rolls a random hue for the
background and a random (but sufficiently different) hue for the accent, then *solves for*
a lightness at each hue that clears WCAG AA contrast (4.5:1) against whatever it'll actually
render on, rather than just picking one and hoping. Each roll also picks light or dark, and
the palette carries that as its own `color-scheme`, so Random needs no CSS rule of its own.
`test/theme-palette.test.js` rolls each mode 200 times and checks every text/background
pairing still clears that bar.

The rolled palette is saved to `localStorage` (`pendelgeist:theme:palette:random`), so
revisiting or switching back to it reuses the same colors instead of re-rolling — a 🎲 button
appears next to the picker (only while Random is active) to roll a new one on demand. Random
replaced an earlier Random (Light)/Random (Dark) pair: a visitor who had one of those saved
is moved to Random with the same colors, and one who had the removed Rainbow theme goes back
to Auto (`migrateSavedTheme` in `theme.js`). Switching to any other theme clears the inline overrides so they
don't linger on top of that theme's plain CSS.

### Contrast conventions for the fixed themes

Unlike Random, the fixed themes (Auto/Light/Dark, Vaporwave, FFVII, the Manga themes, Game Boy,
Eva-01) have hand-picked colors that can't self-correct — `test/theme-contrast.test.js`
checks every one of them against the real pairings the CSS actually produces, and encodes the
convention that keeps new components from breaking it:

- **Never pair `--color-text`/`--color-accent` with a `--color-chrome` background.**
  `--color-chrome` is meant for nav-bar-style UI (the nav itself, filter bars, chrome-styled
  buttons), and in some themes it's deliberately close to or identical to `--color-accent`
  (Light: both `#315979`) or close to `--color-text`'s darkness (Manga). Anything rendering
  text or a border on `--color-chrome` should use `--color-nav-link` instead — the variable
  specifically chosen to stay readable against it.
- **Don't dim text with `opacity` for a "muted/secondary" look** — it stacks with whatever
  color is already chosen (sometimes on top of `--color-muted`, which is already the
  de-emphasized tone) and can push a previously-fine pairing below AA depending on the theme.
  Use `--color-muted` outright instead; if a distinct hover state is needed, prefer inverting
  foreground/background or changing `text-decoration` over dimming opacity, since those don't
  put the contrast ratio at risk. A `:disabled` control is the one exception — dimming is the
  conventional affordance for it, and WCAG exempts disabled controls from the contrast bar.

## VQAR data

### Glossary

The same words mean the same thing in the data, the code, the pages and the API:

- **Show** — one entry in a season file's `shows`: a title, plus everything written about it.
- **Review** — one thing written about a show, at one time: a rating, text and `dateReviewed`.
  A show's `reviews` list holds every one, oldest first.
- **Stage** — what a review is, derived from its `episodes`/`final` and where it sits, never
  stored: a **first impression** (`episodes: 1`), a **revisit** (any later review), a **final**
  review (`final: true`, the verdict on the whole run), or just a **review** (a first review with
  no episode-1 basis). See "Show shape".
- **Current rating** — the latest review's. It's the show's rating everywhere.
- **Backfill** — a review written after watching a stretch of a show rather than on episode 1;
  its stage is "review".
- **Lineup** — a season file for an anime season (`spring-2026`), holding the shows that aired in it. **Shelf** — any
  other season file (there are none at the moment).
- **To review** / **not reviewing** — a lineup's titles still waiting for a first impression, and
  the ones it won't get (`toReview`, `notReviewing`).
- **Aired** — when a show first aired, from AniList. **Watched** — when you watched it, and how
  far; **finished** means you watched the whole thing.
- **Day** / **moment** — the two forms a date takes: `2026-04-01`, or a full Eastern timestamp.
  See "Dates".

### Season files

Review data is committed to this repo, under `public/vqar/data/`: one file per season in
`seasons/`, plus a **generated** `index.json` listing every season and naming the one
currently being reviewed. `public/vqar/app.js` loads the index first
(`VQAR_INDEX_PATH`), then fetches whichever season(s) the filter needs:

```json
{
  "currentSeason": "spring-2026",
  "seasons": [
    { "id": "spring-2026", "name": "Spring 2026", "file": "/vqar/data/seasons/spring-2026.json", "shows": 42 }
  ]
}
```

`shows` is how many shows the season file holds, so the Season dropdown can say "Spring 2026 (42)"
without loading every file (see "Filtering and linking").

Never hand-edit `index.json` — regenerate it with `npm run build-vqar-index` after touching
a season file. `test/vqar-data.test.js` fails if the committed one is stale, so CI catches a
forgotten rebuild.

Each season file has `id`, `name`, `shows` (the reviews), `toReview` ("To Be Reviewed") and
`notReviewing` ("Not Reviewing"). Every one is a **lineup**, one per anime season, holding the shows that aired in it
— see "Lineups and shelves" below.
Adding a season means dropping a new file in `seasons/` and rebuilding the index; editing an
old season never touches the others.

`toReview` ("To Be Reviewed") and `notReviewing` ("Not Reviewing") entries are each either a plain
title string or an object that adds optional pre-season notes, so you can fill things in as
the lineup becomes known. The two forms can be mixed in one list:

```json
"toReview": [
  "Show With Nothing Known Yet",
  { "title": "Premiering Soon", "streaming": ["crunchyroll"], "premieres": "2026-10-08" }
],
"notReviewing": [
  { "title": "Paywalled Show", "reason": "Not paying for another service", "streaming": ["oceanveil"] },
  { "title": "No US Stream", "reason": "Not streaming in the US" }
]
```

- **toReview** takes `title`, `streaming` (the same service keys as a review's) and
  `premieres` (the day its first episode airs, a `YYYY-MM-DD` day, shown as written), or
  `availableNow: true` for a show that's already out (not together with a `premieres`).
- Both take the same per-service link fields as a review (`crunchyrollUrl`, `hidiveUrl`,
  `netflixUrl`, `huluUrl`, `primeUrl`, `youtubeUrl`), which make that service's badge a link.
- **notReviewing** takes `title`, `reason` (a short free-text string, e.g. `"Continuing series"`,
  `"Kids show"` or `"Not streaming in the US"`) and `streaming`.

Everything but `title` is optional. Validation rejects an unknown field (so a typo like
`reasn` can't silently vanish) and a field from the other list. On the page, To Be
Reviewed groups shows under "Available now", then their premiere date (earliest first, undated
shows under "Date TBD") with streaming badges at the end of each line; it stays a flat list until some show has a
`premieres` day or is `availableNow`. Not Reviewing groups shows by their `reason` in a fixed order (below), then any other reason biggest group
first, and any show with no reason last under "No reason given"; until some show has a reason it stays flat. `/anime-stat-sheet` and the AniList check
only read the title. In GraphQL, `toReview` and `notReviewing` are lists of title strings; the
extra fields are on `toReviewShows` and `notReviewingShows`.

**Which reason a show not being reviewed gets.** A show can have several reasons; it records the first one that
applies from this list, and the page lists its groups in the same order (`SKIP_REASON_ORDER` in
`public/vqar/app.js`, matched case-insensitively on the start of the reason). The standing rule comes
first, then factual blockers, hardest first, then taste:

1. **Continuing series**: the standing rule; it holds even if the show is free and available.
2. **Not streaming in the US**: can't be watched at all, and may change if a license appears.
3. **Not paying for another service**: watchable, but costs money; may change if you subscribe.
4. **Kids show**: wouldn't watch it even if it were free.
5. **Adult content**: same, for content.
6. **Not interested**: the catch-all.

Two fields exist purely so the index can be generated rather than hand-maintained:

- `"current": true` marks the season being reviewed right now, which is where the index's
  `currentSeason` comes from. **Exactly one** season carries it — when a new season starts,
  move the flag. Validation fails loudly on zero or two, so a forgotten move can't quietly
  mis-render the page.
- Seasons are ordered newest-first by parsing `<season>-<year>` out of the id, since the
  directory listing would put spring before winter. A season id that doesn't follow that
  pattern (a shelf) needs an explicit numeric `sortKey` instead; validation
  rejects one with neither.

The index and the seasons are fetched with `cache: 'no-cache'`, which revalidates rather
than refetching — an unchanged season comes back as a 304. There's no `localStorage` cache
any more: same-origin assets behind a CDN don't need one, and a cache with no version key
would have hidden an edit to a past season from returning visitors indefinitely. If a
season's path is wrong or its file is missing, the page shows an error naming that season
instead of failing silently.

### Dates

Every date in the season files takes one of two forms, chosen by what it records, and
`public/dates.js` holds the rules for both:

- A **day**, `YYYY-MM-DD` in your Eastern time, for things where only the day matters: when a
  show was watched (`watched.from`/`to`), when it premieres (`premieres`). Stamp one with
  `TZ=America/New_York date +%F`.
- A **moment**, a full timestamp in your Eastern offset (`2026-10-08T14:30:00-04:00`, `-05:00`
  outside daylight time), for when a review was written (each review's `dateReviewed`), so two
  written the same day still sort in order. Stamp one with
  `TZ=America/New_York date +%Y-%m-%dT%H:%M:%S%:z`.

Validation rejects the wrong form in each place, a moment in any other offset (UTC `Z`
included), and a date in the future. Both are shown exactly as written, never converted, so the
Eastern offset is what keeps an evening review on its own day. When only the day of a review is
known, use noon that day, `easternMoment(day)` in `dates.js`: noon is clear of either
midnight, so the day can't drift.

### Show shape

Each entry in a season's `shows` array is a **show**, carrying every review you've written about
it in `reviews`, oldest first:

```json
{
  "titleEN": "Angel Beats!",
  "titleJP": "Angel Beats!",
  "aired": { "season": "spring", "year": 2010 },
  "reviews": [
    { "episodes": 1, "ratingNumber": 4, "text": "…", "dateReviewed": "2026-07-21T08:00:00-04:00" },
    { "episodes": 13, "final": true, "ratingNumber": 5, "ratingText": "Custom label", "text": "…", "dateReviewed": "2026-11-17T10:12:00-05:00" }
  ],
  "watched": { "from": "2026-07-20", "to": "2026-11-16", "finished": true },
  "op": [1],
  "anilistId": 6547,
  "streaming": ["crunchyroll"]
}
```

Only `titleEN` and at least one review are required. A **review** is:

- `ratingNumber` (required) — a whole number 0–5. The **latest** review's is the show's rating
  everywhere ratings are sorted, filtered or counted (`effectiveRatingNumber` in
  `public/vqar/rating.js`), so validation rejects a review saved without one rather than let the
  old rating quietly stand.
- `ratingText` (optional) — your own label, like "Delicious trash". Leave it out to use the tier's
  default (`RATING_NUMBER_LABELS`); most reviews do.
- `text` — what you wrote.
- `dateReviewed` (required) — when you wrote it, a moment (see "Dates"). Reviews are listed in
  date order, and "Most recent" sorts a show by its latest review, so a revisit brings an older
  show back to the top.
- `episodes` (optional) — how many episodes it was based on: `1` for a first impression.
- `final: true` (optional) — the verdict on the whole run, once you've finished it.

Each review's **stage** is derived from those, never stored (`reviewStage` in
`public/vqar/reviews.js`):

| Stage | When | Shown as |
| --- | --- | --- |
| first impression | `episodes: 1` | no label on its own; "First impression" next to later reviews |
| revisit | any later review that isn't final | "Revisit" |
| final | `final: true` | "Final" |
| review | a first review with no episode-1 basis (a backfill, written after watching a stretch of it) | "Review" |

Since the labels come from the list, validation keeps it making sense: at most one first
impression, and only first; `episodes` never goes down from one review to the next, nor past
the `watched.episode` you reached; a `final` review is the last one, and only on a show marked
`watched.finished`; and each review is dated no earlier than the one before it. A review based
on more than one episode shows "12 eps in" on `/vqar`.

A show rated "Yeah, Here's Hoping" (4) on its first impression, with nothing written since, is
**waiting on a revisit** (`awaitingRevisit`): that's the "To revisit" queue. A show with no first
impression - a backfill - is never in it.

**Re-reviewing a show** means appending to its `reviews`, never starting a new entry. A show
stays in the lineup where it was first reviewed, and every later review joins it there, a second
cour included. That's why the same `anilistId` in two season files is rejected: it would count
twice in every `/anime-stat-sheet` number.

Beside `reviews`, a show may carry:

- `aired` — when it first aired, from AniList: `{ "season": "spring", "year": 2010 }`, or just
  `{ "year": 2026 }` when AniList has no season for it. `npm run fetch-anilist-tags` fills it in
  where it's missing and never overwrites one, so a hand fix sticks. `/vqar` shows "Aired: Spring
  2010" only when it isn't the lineup the show sits in, and search finds it.
- `op` / `ed` — marks an opening/ending you liked, for finding it again later. A season can have
  several OPs or EDs, so it always names the number(s): `"op": [2]` is OP 2, `"ed": [1, 3]` is EDs
  1 and 3 (`[1]` when the show only had one). It's a bare marking, with no rating or note: a bare
  `true`, or anything but a list of distinct whole numbers from 1, is rejected, and an OP/ED you
  didn't note is simply left out. `/vqar` shows it as a "Liked OP 2"/"Liked ED 1, 3" pill,
  `/anime-stat-sheet` lists the numbers in a "Which" column, and the GraphQL `Show` type has
  `op`/`ed` as Booleans (true when anything was liked) with the numbers in `opNumbers`/`edNumbers`.

A show may also carry an optional `anilistId` (an AniList media id, e.g. `154587`) —
purely for linking out to that show's AniList page from VQAR and the GraphQL API. Full
show metadata (synopsis, episode counts, community scores) intentionally lives on AniList
rather than being duplicated into these files; see "Validating against AniList" below for
finding the right id.

A show may also carry an optional `annId` (an Anime News Network encyclopedia id, e.g.
`22622`) — same idea as `anilistId`, but links out to the show's ANN encyclopedia page
instead. Add it by hand; there's no automated lookup for it like `validate-against-anilist.js`.

A show may also carry optional `wikipediaUrl` and `wikipediaJaUrl` — the full article
URLs, rather than ids the way `anilistId`/`annId` work, because Wikipedia keys on the
article title and the two language editions rarely agree about what it is. Both render as
outbound links next to AniList and ANN. The Japanese article is worth carrying separately:
it is routinely far more detailed on staff and broadcast history. Hand-maintained, no
automated lookup.

A show may also carry an optional `streaming` array of service keys (`crunchyroll`,
`hidive`, `youtube`, `netflix`, `hulu`, `prime`, `oceanveil`) the show is available on, e.g.
`["crunchyroll", "hulu"]` — renders as small badges on the entry. Purely informational and
hand-maintained; there's no live lookup, so it'll drift if a show leaves a service.

A show may also carry an optional `crunchyrollUrl`, `hidiveUrl`, `netflixUrl`, `huluUrl`,
`primeUrl` and/or `youtubeUrl` (a direct link to the show's page, channel or playlist on that
service) — whichever of these are present makes the matching badge ("CR", "HD", "NF", "HU", "PV",
"YT") itself clickable. The OceanVeil badge stays non-clickable; there's no equivalent field for it.

A show may also carry `watched`, when you actually watched it: `{ "from": "2026-04-01",
"to": "2026-06-10" }` for the days the first and last episodes were watched. Both are days (see
"Dates"); validation rejects one in the future or a `to` before the `from`. `from` is required and
`to` is optional (leave it out while still watching). For a show you didn't finish add `episode`,
the last episode you reached (a number, `12.5` for a special is fine), plus `season` when it ran
across several (`"season": 2, "episode": 6` is S2 E6). Both are numbers, never text, so they can be
counted. Add `"finished": true` when you watched the whole thing - a bare marking (anything but
`true` is rejected) that's **independent of everything else**: a revisit doesn't imply it (one
may cover only an episode or two), and a low rating doesn't rule it out (a season of trash can get
finished too). Only mark it when you say you finished. It shows as a "Finished season" pill, has
its own Extras chip, is counted on `/anime-stat-sheet` as "Seasons Finished", and is what a `final`
review requires. `watched` is separate from `dateReviewed` (when a review was written). `/vqar`
shows it as "Watched: 2026-04-01 – 2026-06-10 (through ep 6)", and the GraphQL `Show` type has a
`watched` object with the same five fields.

### Editing a season

Edit the season's file under `public/vqar/data/seasons/`, then rebuild and check:

```
$EDITOR public/vqar/data/seasons/summer-2026.json
npm run build-vqar-index    # a no-op unless id/name/current changed, and it validates either way
npm test
git commit -am "Add <show> to Summer 2026"
```

Reviewing a new show means appending a show to that season's `shows` array, with its first
impression as the one review: `{ "titleEN": "...", "reviews": [{ "episodes": 1, "ratingNumber": 3,
"text": "...", "dateReviewed": "2026-10-08T14:30:00-04:00" }] }` — see "Show shape" above for
everything else it can carry. If the show was sitting in `toReview` or `notReviewing`, remove it
from there in the same edit; validation flags a title that's in both. Reviewing it again means
appending to its `reviews`.

`git` is the update mechanism now, so there's no push step and no token to keep around.

### Starting a new season

Four steps, and only the third is easy to forget:

1. **Create the file**, named after the season id, which must be `<season>-<year>`
   (`winter`, `spring`, `summer`, `fall`) so the index can order it. The `id` inside has to
   match the filename:

   ```
   cat > public/vqar/data/seasons/fall-2026.json <<'JSON'
   {
     "id": "fall-2026",
     "name": "Fall 2026",
     "current": true,
     "shows": [],
     "toReview": [],
     "notReviewing": []
   }
   JSON
   ```

2. **Fill in `toReview` and `notReviewing`** as you triage the season's lineup — plain strings, or
   objects when you know streaming, a premiere day or a reason (see above). `shows` fills in as you go.

3. **Take `"current": true` off the previous season** (`summer-2026.json` here). Exactly one
   season may carry it, and it's what the index's `currentSeason` — the page's default
   filter and "Currently Reviewing" heading — is built from. Forgetting fails the build with
   `2 seasons are marked "current": true`, so this can't silently ship wrong.

4. **Rebuild and check:**

   ```
   npm run build-vqar-index
   npm test
   ```

`npm run build-vqar-index` refuses to write the index at all if anything doesn't validate,
so a passing rebuild means the new season is well-formed, uniquely named, orderable, and the
only current one.

A season id that isn't `<season>-<year>` is a shelf, not a lineup (see below), and needs an
explicit numeric `sortKey` instead, higher meaning more recent — lineups sort at
`year * 10 + season`, so `20263` sits where a fall-2026 would.

### Lineups and shelves

A season file is one of two things, and its id says which (`isLineup` in
`public/vqar/seasons.js`), so no flag has to be kept in step with it:

- A **lineup** is an anime season. Its id is `<season>-<year>` (`spring-2026`), which also
  orders it. Only a lineup can be `current`, and only lineups count in the per-season stats. The
  2026 lineups were reviewed live, one first impression per show; the older ones (Spring 1978
  through Fall 2025) hold backfills: shows reviewed after watching a stretch of them, filed under
  the season they aired in, whenever you watched them. A backfill goes in its aired season's
  lineup (create the file if it isn't there yet). A live first impression goes in the season
  you're reviewing, even for an older show you picked up then (Paranoia Agent is in Spring 2026);
  its `aired` shows on the card as "Aired: Winter 2004" and is found by search. A show with no
  aired season to file it under (one AniList doesn't list) goes in the lineup of the season you
  watched it in.

  Every lineup from Winter 2010 through Fall 2025 also has its season's whole AniList lineup in
  `notReviewing`: each Japanese TV or ONA series that aired then (adult titles left out, and so are
  obscure ones with fewer than 1,000 AniList users, mostly promos and web shorts), with
  sequels marked `"Continuing series"` and everything else left without a reason. These were added
  in bulk so the older seasons are complete. Reviewing one of them means moving it from
  `notReviewing` into `shows` as a backfill. A season holding only backfills and this list still
  counts as historical: `hasLiveLineup` ignores a `notReviewing` list on its own.
- A **shelf** is any other id, with an explicit numeric `sortKey`. There aren't any right now (the
  one there was, the Backlog, was retired), but the validators, stats and API still understand one.

A show with no first impression (a backfill) is a **historical** review on `/anime-stat-sheet`, and
one with a first impression is **live**. Historical reviews count everywhere a show counts, and the
page can be narrowed to either kind, since historical picks tend to be favorites and skew high. A
season of backfills has no coverage bar there, and isn't a row in Here's Hoping by season. The GraphQL
API tells lineups and shelves apart with `Season.lineup`.

### Filtering and linking

**Season** picks the season file you browse, or All Seasons. Each option carries how many shows
that season holds (`shows` in `index.json`) and All Seasons the total: "Spring 2026 (42)". It sets
what's being browsed rather than filtering it, so it isn't one of the filters Clear Filters
resets. An older show picked up live sits in the season it was reviewed in and says when it aired
on its card ("Aired: Spring 2010"); search finds it by that too.

Besides Season / Search / Sort, `/vqar` has three rows of toggle chips: **Rating** (the 0–5
tiers, labeled from `RATING_NUMBER_LABELS`), **Streaming** (only the services something in the
selected season is on), **Extras** (to revisit, revisited, rated up/down on revisit, liked OP/ED, finished season), and
**Format**/**Genre**/**Tag**/**Studio** from AniList (see "AniList tags" below). Within
a row any pressed chip matches; across rows every row with a selection must match. A show with a
revisit is filed under its revisit rating, the same number "Highest Rating" sorts on. Each chip's
count ignores its own row's selection, so it says how many reviews pressing it would bring in.
All of the chip rows sit behind a single **Level 6 Otaku** toggle (on every screen size): Rating and
Streaming first, then two labelled groups, "Your notes" (Extras) and "From AniList" (Studio,
Format, Genre, Tag). The toggle carries a count of the active filters, and its open/closed state
is a remembered reader preference (`localStorage`, like the theme). It also opens on its own when
the URL sets any filter, so a filter is never active out of sight. In the AniList rows, a value
the other filters would leave with nothing isn't offered at all, rather than listed at "(0)",
though a selected one always stays.

To Be Reviewed / Not Reviewing follow the season picker: a past season shows its own lists, and its
name next to each heading. Under All Seasons they're the current season's.

Next to "Current Season", jump links with counts go straight to To Be Reviewed / Not Reviewing,
opening the collapsed section on the way (as does arriving on a `#pendingSection` /
`#skippedSection` link). Once you're a screen's worth down, a floating "↑ Top" button appears.
Both scroll smoothly unless the reader prefers reduced motion.

The matching and counting live in `public/vqar/filters.js`, DOM-free like `/anime-stat-sheet`'
`stats.js`, and tested in `test/vqar-filters.test.js`. Every control is mirrored into the URL
(`/vqar?season=all&rating=4,5&on=hidive`) via `history.replaceState`, as on `/anime-stat-sheet`;
anything at its default (the current season, Most Recent, nothing pressed) is left out,
and an unrecognized value falls back to the default on load.

### Validating season data

`scripts/validate-vqar.js` runs the same checks `npm test` does, on demand. It flags a show
that's reviewed but still left in toReview/notReviewing, a show listed in both toReview and
notReviewing, duplicate entries within the same list (or titles that differ only in case or
punctuation), a show with no reviews, a review missing its rating or date or with an
out-of-range `ratingNumber`, a reviews list whose stages wouldn't make sense (see "Show shape"),
an unknown field (a typo like `fullReveiw`, or a field the reviews list replaced) or a date that
is unparseable, not in Eastern time or in the future, the same AniList id listed in two seasons,
and a season that can't identify or order itself. The allowed keys live in `SHOW_KEYS`,
`REVIEW_KEYS`, `WATCHED_KEYS` and `AIRED_KEYS` in `scripts/validateSeason.js`, and
`test/graphql.test.js` checks the GraphQL `Show`, `Review`, `Watched` and `Aired` types against
those lists. Its one job the test can't do is checking a file that isn't committed yet.

```
npm run validate-vqar                  # checks every committed season
npm run validate-vqar -- ./draft.json  # or check one or more local files/URLs directly
```

### Validating against AniList

`scripts/validate-against-anilist.js` cross-checks the same season data against
[AniList's public GraphQL API](https://anilist.co/graphiql) — one live request per show, so
it's meant to be run occasionally rather than in CI (unlike `validate-vqar`, which is purely
local). For each reviewed show it either confirms an existing `anilistId` still resolves to
a matching title, or searches by title and suggests an `anilistId` to add when it finds a
confident match; toReview/notReviewing titles just get a lighter existence check as a spelling
sanity check.

```
npm run validate-anilist                    # checks every committed season
npm run validate-anilist -- ./draft.json    # or check one or more local files/URLs directly
npm run validate-anilist -- --delay=2500    # slow down if AniList starts rate-limiting
```

### AniList tags (format, genres, tags, studios)

Each show with an `anilistId` can carry a **generated** `anilist` object:

```json
"anilist": { "format": "TV", "genres": ["Action", "Fantasy"], "tags": ["Isekai", "Male Protagonist"], "studios": ["GoHands"] }
```

`scripts/fetch-anilist-tags.js` fills it in, 50 shows per AniList request, and owns it outright:
every run overwrites it, so never hand-edit it. It also fills in a show's `aired` from AniList's
season and year, but only where the show has none, so a hand fix sticks. It never touches the rest
of a show, and it rewrites only a season file's `shows` block, so the other lists keep the formatting they were
written in. AniList's genres are a fixed set of about 19; its **tags** are the fine-grained ones
("Isekai" is a tag, not a genre). Only tags AniList ranks at least 60% relevant are kept, and
spoiler and adult tags are dropped. The site never calls AniList: the data is committed like any
other edit, and a review with no `anilistId` simply has no tags.

```
npm run fetch-anilist-tags                  # fetch from AniList and write
npm run fetch-anilist-tags -- --dry-run     # report what would change, write nothing
```

Where AniList can't be reached (a sandbox whose network policy blocks it, say), run the same
queries by hand in [AniList's GraphiQL](https://anilist.co/graphiql) and import the responses:

```
npm run fetch-anilist-tags -- --print-queries           # the queries, ids filled in
npm run fetch-anilist-tags -- --from=q1.json,q2.json    # import the saved responses
```

**Linking reviews that have no `anilistId` yet** works the same way, by search. Each search is
narrowed to the review's own AniList season (`fall-2026` → Fall 2026), which makes the top hit far
more reliable for a generic English title. It's wrapped in `Page(perPage: 1)`, because a bare
`Media(search:)` that finds nothing is a 404, and AniList then nulls every other search in the same
query. A result is applied only when its titles resemble the review's (`titlesLikelyMatch`). Any
other result is reported for a person to check and pass with `--accept=<alias>`. Linking sets
`anilistId`, the generated `anilist` object, and `titleJP` from AniList's native title, but only
where the review has no `titleJP` already. For shows the season-narrowed search missed, retry
across every season with `--any-season`.

```
npm run fetch-anilist-tags -- --print-search-queries                 # one search per unlinked review
npm run fetch-anilist-tags -- --link-from=s1.json,s2.json            # link the confident matches
npm run fetch-anilist-tags -- --link-from=s1.json --accept=fall_2026__32   # take a checked unsure one
npm run fetch-anilist-tags -- --print-search-queries --any-season    # retry what found nothing
```

`/vqar` turns these into Format and Genre chip rows and Tag and Studio dropdowns, under the same
any-within-a-row, all-across-rows rule as the other filters. These rows stay hidden until
something in the selected season has AniList data. Each card also gets a quiet line with the
show's format, studio, genres and top five tags, set off by a left rule. Each type has its own
shape, so they read apart without labels: the format boxed, the studio plain, each genre an
outlined pill, each tag a `#hashtag`. Every value links to the current view narrowed to it
(`filterHref` in `app.js`); a plain click applies that in place and opens the filters,
while a modified click opens the link as usual. The line stays muted, so it's visibly apart
from the reviewer's own markings (♪ Liked OP/ED, ✓ Finished season), which are accent-coloured
pills. GraphQL exposes the same object as
`Show.anilist`. `scripts/validateSeason.js` checks its shape. It also rejects `anilist` data
on a show with no `anilistId` to have generated it from, and a comma in any value, since the
filter URLs separate values with commas.

## Evangelion page

`public/eva-tv/` is a small standalone page at `/eva-tv`, separate from the VQAR data flow
above — its content lives in a single `public/eva-tv/data.json` rather than a file per
season, since it changes far less often than a season's reviews.

It's a horizontally-scrolling timeline anchored to the 26 TV episodes plus a final "EoE"
(*The End of Evangelion*) column. The JSON has three top-level keys:

- `sources` — a dictionary of citations, keyed by a short id: `{ lang, title, url }`.
  Shared across entries so the same Wikipedia/EvaGeeks/etc. page isn't repeated inline
  every time it's cited.
- `episodes` — the columns themselves, in order: `{ number, title, subtitle? }`. `number`
  is either a TV episode int (1–26) or the string `"eoe"`.
- `entries` — everything that gets plotted onto the timeline: characters, facts, fan
  theories, and open questions, all in one flat list rather than four separate ones.
  Each has `{ id, episode, scene?, type, title, body, links, sourceRefs?, quote? }`:
  - `episode` matches an entry in `episodes[].number` — put an entry at whichever episode
    is its first meaningful point of appearance.
  - `scene` is an optional free-text marker (e.g. "Power cable severed, plug depth
    critical") for *where within* that episode, when it's clearly identifiable — left out
    otherwise rather than guessed at.
  - `type` is one of `character` / `fact` / `theory` / `unknowable`, and drives each
    node's styling on the timeline (badge letter, border style/color).
  - `links` is a list of `{ id, label }` pairs pointing at other entries — these render as
    "jump to" buttons in the detail panel, letting a theory point forward to where it's
    paid off, or a fact point forward to a theory built on it. This is deliberately
    hand-curated (not auto-derived), so where things link to is easy to keep tweaking.
  - `sourceRefs` is a list of keys into the top-level `sources` dictionary; each renders as
    a clickable citation link at the bottom of the entry's detail panel.
  - `quote` is optional: `{ lang, original, translation }` — the original-language excerpt
    a fact was actually drawn from (almost always Japanese, since most of the deeper
    production/episode-title material only exists on Japanese Wikipedia), paired with an
    English translation. Rendered as a small blockquote above the sources line. Entries
    sourced from English-language material (most of the character/theory entries) cite
    their `sourceRefs` without a `quote`, since there's no original-language excerpt to
    pair against.

`public/eva-tv/app.js` fetches `data.json` directly (no index indirection, since it's one
file), lays out one column per episode with its entries as clickable nodes, and opens the
selected entry in a fixed detail panel at the bottom — including its "jump to" links. A
long episode's entries flow into extra side-by-side sub-columns via plain CSS multi-column
layout (`columns` on `.episode-entries`, sized against a viewport-derived height on
`.timeline-scroll`) rather than a fixed per-episode count, so the split adapts to whatever
height is actually available in portrait or landscape. Editing the content means editing
`data.json` and redeploying — there's no live external data source to keep in sync here,
unlike VQAR.

## Nasubi page

`public/nasubi/` is a standalone page at `/nasubi`: a data analysis of Nasubi's 11-month
sweepstakes ordeal on *Susunu! Denpa Shonen* (1998-99) and the Korea sequel that followed.
Like the Evangelion page, all its content is committed JSON, under
`public/nasubi/data/`:

- `content.json` — the curated narrative: a `meta` block (title/subtitle/intro) plus a
  `japan` and `korea` object. Each of those is a flat map of named sections (e.g.
  `economics`, `categoryBreakdown`), rendered in the order listed in `JAPAN_SECTION_ORDER` /
  `KOREA_SECTION_ORDER` in `app.js` — reordering the narrative means editing those arrays,
  not the JSON. A section is `{ heading, body, columns?, rows?, chart?, items? }`: `body` is
  an array of paragraphs (supports `**bold**`, `*italic*`, `[text](url)` links via a small
  inline parser in `app.js`, not real Markdown); `columns`/`rows` render a sortable table;
  `chart` (`{ labelKey, valueKey }`, both matching entries in `columns`) adds a bar chart
  above it for a single numeric column; `items` (`[{ jp, en }]`) renders a bilingual list
  instead of a table, used for the Korea "oddities". `japan.keyTakeaways` and
  `korea.keyDifferences` are plain string arrays, rendered as a numbered list.
- `entries-japan.json` / `winnings-japan.json` / `entries-korea.json` — the full raw
  datasets behind the analysis (every postcard batch, every prize, every Korea entry),
  parsed from the original transcribed/translated tables. These back the "Browse the Raw
  Data" section at the bottom of the page (search by Japanese or English name, sort any
  column), independent of the curated `content.json` narrative above it.

Adding more analysis later means extending `content.json` (new section keys need adding to
the order arrays in `app.js` too) or dropping in a new dataset JSON file plus a matching
`<option>`/`DATASETS` entry for the data browser. There's no live external data source here,
same as the Evangelion page.

The three raw dataset JSON files are themselves generated, not hand-written: `scripts/nasubi/`
holds the original transcribed source tables (`source/*.md`), the categorization/parsing
scripts that turn them into stats, and `generate-data.js`, which imports those scripts'
parsing logic and writes `public/nasubi/data/{entries-japan,winnings-japan,entries-korea}.json`
plus prints every numeric table `content.json`'s narrative sections quote (category
breakdowns, food subcategory breakdown, persistence index) so a content edit can be checked
against fresh output. Run `node scripts/nasubi/generate-data.js` after editing anything in
`scripts/nasubi/source/` or the categorization logic. `content.json`'s prose isn't
regenerated — it's hand-maintained and needs updating manually if a script change shifts a
number it quotes.

## Anime Stat Sheet page

`public/anime-stat-sheet/` is a standalone page at `/anime-stat-sheet`, the "Anime Stat Sheet":
numbers over the VQAR review data, in the spirit of the Nasubi page above but computed live
instead of from committed JSON, since VQAR's data keeps growing. It was "VQAR By The Numbers" at
`/vqar-stats`; `public/_redirects` sends that path (and its `?season=`) here.

`app.js` fetches the same index + every season file documented under "VQAR data" above,
flattens every season's `shows` into one list (`flattenReviews`), and hands it to `stats.js`: pure,
DOM-free `compute*` functions, each deriving one section from the flattened list. Keeping them
apart from the fetch/render code is what makes them unit-testable without a DOM or a live fetch;
see `test/anime-stat-sheet.test.js`.

**Live and historical.** Every show is one or the other (`reviewSource`): **live** if it has an
episode-1 first impression, written as its season aired, **historical** if not - a backfill,
reviewed afterwards, often a favorite remembered rather than a show met cold. Historical reviews
skew high, so the **Reviews** switch (All / Live / Historical, `?source=`) narrows every section
to one kind (`filterBySource`). Under All, the career glance shows both averages side by side, and
a season's "vs." tile compares it with the career average of its own kind: a season of backfills
against your historical average, a live one against your live average, a mix against everything.

**Two views.** The Season picker (each season with its show count under the current source,
`?season=`) switches between them. Sections carry `data-view="career"` or `data-view="season"`
for the view they belong to; ones without it show in both. A section with nothing to say in the
current view (no revisits, no hopes, no liked OP/EDs) is hidden rather than left empty.

- **Career** (All Seasons): the glance tiles; **Over Time**, a sortable table switchable
  (`?by=decade`) between one row per season with a review (`computeSeasonTable`: shows,
  live/historical, average, share rated 4–5 and 0–1, and coverage for a season reviewed live,
  each name opening that season's report in place) and one row per decade (`computeDecadeTable`:
  the same numbers plus the decade's top-rated titles). Decades go by when a show aired
  (`airedYear`: its `aired.year`, or failing that its lineup's year), not where it's filed, so an
  older show picked up live counts in its own decade;
  **Peaks & Valleys**; **Revisits**, with Here's Hoping per season; the taste sections; and
  **Liked OPs & EDs**.
- **Season report** (one season): the glance tiles, including the "vs." comparison and the share
  rated 4–5; for a season reviewed live (`hasLiveLineup`), its **Review Coverage** bar; then the
  Peaks & Valleys, Revisits and Liked OPs & EDs for that season alone, without the Season
  columns that would repeat it on every row.

A show's latest review sets its rating everywhere ratings get aggregated or ranked (averages, the
Peaks & Valleys). `computeRevisits` is the one
exception, since it exists to compare the first impression with what came after (`ratingShift` in
`public/vqar/reviews.js`). `/vqar`'s own "Highest/Lowest Rating" sort follows the same rule.

**Peaks & Valleys** is the rating distribution with its two ends spelled out:
`computePeaksAndValleys` lists every show at the highest rating in view and every show at the
lowest, headed by the tier's own name ("Peak, Nice Ep Broh (37)"), rather than a top N: with dozens
of equal 5s, a cut-off would only be deciding alphabetically who makes it. There are no valleys
when only one rating is in view.

**Revisits** answers "did it hold up?" for every show reviewed on episode 1 and again later
(`computeRevisits`, by `ratingShift`): how many, the average shift, and how many went up, held or
went down; then **Here's Hoping, Revisited**, the episode-1 4s among them (below); then the biggest
swings. Each part hides itself when it has nothing to show, and the section when none of them do.
It used to be two sections, Second Impressions and Hope Check, which measured the same thing.

**Category cross-references** (career view). Both are computed live from the reviews.
- **Taste Profile** (`computeCategoryRatings`) is one sortable table, switchable between genre,
  studio, tag, format and streaming service. For each category it shows how many shows, your average
  rating, the share rated 4–5 and the share rated 0–1, the average revisit shift, and how many you
  finished or liked the OP/ED of.
- **Loves & Hates** (`computeLovesAndHates`) gives your three best- and worst-rated genres, studios
  and tags. Short lists are split down the middle, so nothing appears as both a love and a hate.

Categories with fewer than `MIN_CATEGORY_SHOWS` (3) shows are left out, so one show can't decide a
ranking, and the table notes how many were. Shows are categorised by the same `reviewValues` as
`/vqar`'s filters, and every name links to `/vqar` filtered to that category.
That works because `createDataTable` (`public/data-table.js`) takes `{ text, href }` cells, and its
`MISSING` placeholder ("—") sorts last without turning a numeric column into a text one.

**Here's Hoping, Revisited** (`computeHopeCheck`) treats an episode-1 4 ("Yeah, Here's Hoping") as "watch more"
rather than a verdict, and tracks how those turned out: how many got a revisit, whether it rose to 5,
held at 4 or fell, the share that held up (rose or held), and how many are still waiting. Totals as
tiles, plus a per-season table when more than one season is in view. Each "still waiting" count
links to `/vqar`'s **To revisit** Extras chip (`?has=queue`) for that season. Both count by
`awaitingRevisit` in `public/vqar/rating.js` - a first impression rated 4 with nothing after it -
so they can't disagree. Nothing is marked by hand: a show leaves
the queue when its next review is saved.

There used to be a **Season Spotlight** in a live season's report (Revisit Candidates and
Continuing Seasons Worth Watching). It was taken out because it had something to say for only 2 of
50 seasons, and never for the current one: Revisit Candidates repeated Here's Hoping's "still
waiting", and sequel-spotting belongs on `/vqar`'s To Be Reviewed list, if anywhere.

`applyFilters()` in `app.js` re-slices the in-memory `allSeasons`/`allReviews` fetched once at load,
so switching season or source never re-fetches. Both are kept in the URL via
`history.replaceState` (so they don't spam browser history), defaults left out, and an unrecognized
value falls back to the default rather than erroring.

Adding a new stat means adding a `compute*` function to `stats.js` (plus a test) and a
render function in `app.js` that calls it, in the view it belongs to — no committed data to
regenerate, unlike Nasubi. The tables, stat tiles and bar charts themselves come from
`public/data-table.js`, shared with the Nasubi page (see "Shared page components" below).

## Very Quick Game Reviews page

`/games` is VQAR's idea applied to games — first impressions a few hours in — without any
of VQAR's machinery. There are few of these, so there are no seasons, filters, stats or
generated index: every game lives in one file, `public/games/data.json`, newest activity
first on the page. `?game=<id>` narrows the page to one game, and each title links there,
so that's the link to share.

### Game shape

A game is shaped like a VQAR show: its reviews in a `reviews` list, oldest first.

```json
{
  "games": [
    {
      "id": "final-fantasy-resonance",
      "title": "Final Fantasy Resonance",
      "platform": "Switch 2",
      "reviews": [
        { "hoursPlayed": 4, "ratingNumber": 4, "text": "First paragraph.\n\nSecond paragraph.", "dateReviewed": "2026-10-24T20:15:00-04:00" },
        { "hoursPlayed": 40, "final": true, "ratingNumber": 5, "ratingText": "Custom label", "text": "...", "dateReviewed": "..." }
      ],
      "played": { "finished": true }
    }
  ]
}
```

- `id`, `title` and at least one review are required; `platform` and `played` are optional.
- Each review needs `text`, `ratingNumber` and `dateReviewed`; `ratingText`, `hoursPlayed` and
  `final` are optional.
- `text` is plain text; a blank line starts a new paragraph. Nothing in it is parsed as
  markup.
- `ratingNumber` is VQAR's 0–5 scale. The default labels (game-flavored versions of VQAR's)
  are `RATING_NUMBER_LABELS` in `public/games/schema.js`; leave `ratingText` out to use one, or
  write your own, which still needs the tier's number.
- `dateReviewed` is a full timestamp with the reviewer's Eastern offset, same as VQAR —
  stamp it with `TZ=America/New_York date +%Y-%m-%dT%H:%M:%S%:z`.
- Playing more of a game doesn't start a new entry: append to its `reviews`, in date order.
  Each needs its own rating, and the latest one is the verdict that counts (it also moves the
  game back to the top of the list). The first is labeled "First impression", the ones after
  it "Update", and a `final: true` one - always last, and only once the game is marked finished -
  "Final".
- `played: { "finished": true }` is a bare marking for having played it through, like VQAR's
  `watched.finished` — only when the reviewer says so.

`scripts/validateGameReviews.js` checks all of this, and `test/games-data.test.js` runs it
over the committed file in CI.

## Shared page components

`public/data-table.js` holds the three things `/nasubi` and `/anime-stat-sheet` both render, so
they can't drift the way they had:

- `createDataTable(columns, rows)` — a sortable table, returned as a `.table-scroll`
  wrapper for the caller to place. Each header is a real `<button>` inside a
  `<th scope="col">` carrying `aria-sort`, rather than a clickable `<th>`: that's what
  makes the sort reachable *and* activatable by keyboard, and what lets a screen reader
  announce the current order. A column sorts numerically only when every value in it
  parses as a number, so a column mixing text and digits still sorts predictably.
- `renderStatGrid(container, stats)` — the "big number over a label" tiles.
- `createBarChart(items, { ariaLabel })` / `renderBarChart(...)` — a single-series
  magnitude bar chart. It's one `role="img"` rather than a tree of nodes, since every
  value is already readable as text on the bar and in the table beside it.

Only the JS is shared. Each page keeps its own `.data-table`/`.stat-tile`/`.bar-chart`
rules in its own stylesheet, so a page added later can restyle them without disturbing the
others — the same convention as `.filters`/`.data-table`.

`public/external-links.js` (`createExternalLinks(entry)`) does the same job for the
AniList/ANN/Wikipedia reference links `/vqar` renders from the same fields.

## Data fetching conventions

Every page fetches its committed JSON with `cache: 'no-cache'` and nothing else. That
revalidates rather than refetching, so an unchanged file comes back as a 304. Deliberately
*not* used alongside it:

- **No cache-busting query string.** A unique URL per load forces a full download every
  time and throws away the 304 the `no-cache` above exists to get.
- **No `localStorage` cache of fetched data.** These are same-origin assets behind a CDN,
  and a cache with no version key would hide an edit from a returning visitor indefinitely.

`localStorage` is used only for reader preferences (theme, spoiler state, panel width), and
every read and write is wrapped in `try`/`catch`: with site data blocked, even *reading* it
throws, and these reads happen at module scope where an unguarded one takes the whole page
down with it.

## GraphQL API

`GET /graphql` serves a small vanilla-JS query explorer (`public/graphql/`); `POST /graphql`
runs a query against a schema (`src/schema.js`) built with `graphql-js` and executed in the
Worker. Both routes are handled by `src/worker.js`, which otherwise just forwards every
other request to the static assets — the VQAR page itself is untouched and still fetches
the same files directly, client-side.

The API reads the same index + per-season files documented above, reshaping each show to add
its `season`/`seasonName` and current `ratingNumber`/`ratingText`, and each of its `reviews` to
add its `stage` and fill in its `ratingText`, the way `public/vqar/app.js` does on the client.

Because that data is served from this Worker's own assets, the resolvers read it through
the `ASSETS` binding (`makeRootValue({ assets, origin })`) rather than fetching it over the
network. There's no round trip and no cache to keep — a deploy is immediately consistent,
where the old gist-backed version could lag a fresh edit by up to a 10-minute edge-cache
TTL. Tests pass a stub binding over the same route table the page tests use.

```
type Query {
  seasons: [SeasonSummary!]!    # every season in the index (id + name only)
  currentSeason: Season         # the index's current season, with full review data
  season(id: ID!): Season       # a specific season's full data, by id
  anilistQuery(titles: [String!], anilistIds: [Int!]): String!       # recommendations, step 1
  recommend(anilistResponse: String!, count: Int = 2): Recommendations!  # recommendations, step 2
}
```

### Recommendations

`recommend` answers "I liked these, what of yours should I watch?" from *these* reviews, not
AniList's own recommendations, which would mostly hand back the big shows the person has already
heard of. It needs AniList for the liked shows' genres and tags, but **AniList blocks requests
from Cloudflare Workers** ("You have been manually blocked"), so the API never calls it. It's two
steps instead, with you running the AniList part:

1. **`anilistQuery(titles, anilistIds)`** returns one AniList query: a search per liked title, a
   lookup for any ids, and the popularity of every review that could be a pick. It has no
   variables and sits on one line, so it pastes straight into
   [AniList's GraphiQL](https://anilist.co/graphiql). On `/graphql` the explorer shows a **Copy
   AniList Query** button under the result, since the JSON result escapes its quotes.
2. **`recommend(anilistResponse, count)`** takes AniList's whole result, pasted between triple
   quotes as a block string (`anilistResponse: """{ "data": … }"""`), and does the rest.

The scoring lives in `src/recommend.js`, all pure:

- The liked shows' genres and tags, filtered the same way as a review's generated `anilist`
  object, make a **taste profile**: each feature weighted by the share of liked shows that
  carry it.
- **Candidates** are shows rated 4+ (by their latest review) that have AniList data, minus the
  liked shows themselves and their AniList relations (sequels, prequels, spin-offs).
- **Picks** are scored by cosine similarity to the profile, times rating / 5, and chosen one at
  a time with a penalty for overlapping an earlier pick (`DIVERSITY_WEIGHT`), so two picks
  aren't the same kind of show.
- The **hidden gem** is the least popular remaining 5 on AniList (a 4 if no 5 is left) that
  still shares something with the profile.

Each recommendation carries its `score`, AniList `popularity`, and the `sharedGenres`/`sharedTags`
that got it picked. `liked` says what each search matched. Its `input` comes back out of the
query's alias (`liked0_Death_Note`), so it has no punctuation. A bad match, like a "Naruto"
that found a movie, shows up there; rerun step 1 with that show's id in `anilistIds`. Up to
25 liked shows and 10 picks.

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
`fetch`/`localStorage` via jsdom — see `test/helpers.js` for the page loaders (`loadApp`) and stubs (`createPathFetchStub`, `createLocalStorageStub`), and
`test/fixtures.js` for the fixture builders (`makeShow`, `makeSeason`, `makeGame`), which keep
test data in step with the data's shape so a shape change lands in one place. The shared
modules under `public/` get plain unit tests of their own, since they need nothing but a
jsdom `document`. The GraphQL schema/resolvers
(`test/graphql.test.js`) and the Worker's routing (`test/worker.test.js`) are tested the
same way — the Worker's `ASSETS` binding stubbed, rather than a mocked `fetch`. CI runs
them on every PR (`.github/workflows/test.yml`).
