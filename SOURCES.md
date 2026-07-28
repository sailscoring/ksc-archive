# Sources

Everything under `sources/` is captured from two public web sources by
`pnpm capture`. Files are written as received — verbatim, third-party, never
edited by hand.

## 1. `sailwave.com/results/KSC/` — the results

<https://www.sailwave.com/results/KSC/>

Sailwave hosts a per-club results folder for anyone publishing from the
Sailwave application. KSC's holds **88 pages** spanning 2018–2026, the whole
published record.

The folder index is captured as `_folder-listing.html`. It is more than a
link list: each entry carries the **upload timestamp**, which is the only
publication date the corpus states anywhere, and it is how new results are
discovered on re-capture.

```
sources/sailwave.com/results/KSC/
  _folder-listing.html      the index, with upload times
  2018_Baltic_Series.htm
  …                          87 more result pages
```

Notes on the format:

- Pages are **Sailwave 2.x HTML**, parsed by the app's
  `lib/archive-kit/sailwave-html.ts` — an `<h3 class="summarytitle">`, a
  `<div class="caption">`, and a `<table class="summarytable">` per section,
  with per-race detail tables following the same shape.
- They declare **ISO-8859-1**, and 34 of the 88 carry high-bit bytes
  (accented Irish given names). Decode by the declared charset; see
  CLARIFICATIONS.md.
- The server is case-insensitive, and the club's pages link the same file as
  both `/results/KSC/` and `/results/ksc/`. Filenames are compared
  lowercased throughout.

## 2. `killaloesailingclub.com` — the club's naming

<https://www.killaloesailingclub.com/members-area/racing-results/>

The club's own results section presents the same Sailwave pages under
curated headings, one page per season. Each result sits in an accordion
panel: a heading, then an `<iframe>` embedding the Sailwave file. **That
`<iframe>` is the join** between the club's wording and the result.

```
sources/killaloesailingclub.com/
  2026-archived-racing-results.html
  2025-archived-racing-results.html
  2024-archived-results.html          (note: no "racing" in this one's slug)
  2023-archived-racing-results.html   ┐
  2022-archived-racing-results.html   │ members-only: these capture
  2021-archived-racing-results.html   │ as the gate page, kept so the
  2019-2020-archived-racing-results.html │ gate is evidenced, not assumed
  2018-archived-racing-results.html   ┘
```

The 2018–2023 pages return HTTP 200 to an anonymous request but render
"Members Only — You must be a member & logged in to view this content."
**The gate is on the club's presentation, not on the results**: every
Sailwave file those pages would embed is public in source 1. What is gated
is the club's curated naming for those seasons.

## What we derive

`sources/catalog.json` (via `pnpm catalog`) is the normalised join of the
two, one entry per captured page. Every derived field records the signal it
came from — see `yearSource` / `yearCandidates`, and CLARIFICATIONS.md for
the precedence and why it is ordered that way.

## Capture etiquette

Both are small public servers. `pnpm capture` is single-threaded with a
0.75 s delay between requests and never parallelised. Files already on disk
are reused rather than re-fetched, so re-runs cost only the two index
requests; `--refresh` forces a full re-fetch and should be rare. The capture
is read-only and unauthenticated.
