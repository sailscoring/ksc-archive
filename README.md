# KSC results → Sail Scoring

A capture of **Killaloe Sailing Club**'s published racing results — nine
seasons of Sailwave pages, 2018–2026 — and the **as-published ingest
pipeline** that feeds them into [Sail Scoring](https://app.sailscoring.ie).

It is the KSC counterpart of the sibling [`hyc-archive`](https://github.com/sailscoring/hyc-archive),
[`dbsc-archive`](https://github.com/sailscoring/dbsc-archive), and
[`iodai-archive`](https://github.com/sailscoring/iodai-archive) repos, and
follows the **as-published** model (app ADR-010,
`docs/design/decisions/010-as-published-archives.md`): the results KSC
originally published are ingested and displayed faithfully — structured ranks
plus verbatim display cells — and **never re-scored**.

> 📋 **[CLARIFICATIONS.md](CLARIFICATIONS.md)** — the judgement calls the
> corpus forced, the coverage gaps, and the open questions for the club.

## Why

The payoff is the **cross-series identity and ranking** work on the Sail
Scoring horizon (`docs/design/horizon.md` in the app repo — the
competitor-identity spine, the workspace season ladder, the per-competitor
multi-year career-arc page). Those features come alive with *years of real
history* in one workspace. KSC has kept a tidy, continuous archive since 2018:
one mixed handicap fleet racing under PY, the same sailors recurring season
after season, plus the occasional class open (Fireball, RS, ILCA, GP14).

That continuity is what makes it valuable — it is a small club's complete
record, not a fragment.

## Sources

Two public sources, captured verbatim under `sources/`:

| Source | What it gives |
|---|---|
| [`sailwave.com/results/KSC/`](https://www.sailwave.com/results/KSC/) | **The results.** 88 Sailwave pages, 2018–2026, plus the folder listing with each page's upload timestamp. Fully public. |
| [`killaloesailingclub.com`](https://www.killaloesailingclub.com/members-area/racing-results/) | **The club's curated naming.** Each season's archive page lists results under the club's own headings ("Brass Monkey / Winter Racing Results") and embeds the Sailwave page in an `<iframe>` — which is what joins heading to file. |

The club's site is where these results are *presented*; sailwave.com is where
they are *hosted*. The club's 2018–2023 season pages are members-only, so the
curated naming is available for 2024–2026 only — **the results themselves are
public for every season**, because the gate sits on the club page, not on the
embedded Sailwave file. See CLARIFICATIONS.md for what members-area access
would add.

## What's here

```
sources/
  sailwave.com/results/KSC/    88 captured Sailwave pages (verbatim)
    _folder-listing.html         the results-folder index, with upload times
  killaloesailingclub.com/     8 captured season-archive pages (verbatim)
  catalog.json                 the normalised join (generated; the deliverable)
scripts/
  capture.ts                   refresh the capture      (`pnpm capture`)
  build-catalog.ts             capture → catalog.json   (`pnpm catalog`)
  emit-as-published-config.ts  catalog → ingest config  (`pnpm emit-as-published`)
  bootstrap-identities.ts      rows → identities.json   (`pnpm identities`)
identity-curation.json         hand-maintained input to `pnpm identities`
identities.json                the competitor-identity manifest (committed)
as-published.config.json       generated ingest config (committed; the input
                               to the app's `archive-generate`)
as-published-skips.json        pages deliberately not ingested, with reasons
.github/workflows/
  as-published.yml             emit → generate → push to the ksc workspace
```

## The pipeline

1. **Capture** — `pnpm capture` mirrors both sources. Single-threaded, 0.75 s
   between requests, and files already on disk are reused rather than
   re-fetched (`--refresh` overrides).
2. **Catalogue** — `pnpm catalog` parses every captured page with the app's
   Sailwave parser and joins the club's headings, producing
   `sources/catalog.json`: one entry per page, with the season, the fleets,
   the entry counts, and — for each derived field — which signal produced it.
   It also classifies each page as `current`, `superseded`, or `placeholder`.
3. **Emit** — `pnpm emit-as-published` turns the `current` pages into
   `as-published.config.json`: one as-published series per page, one fleet per
   summary section, at `/p/ksc/{year}/{event}` (and
   `/p/ksc/{year}/{event}/{fleet}` where an event scored several fleets).
   Series ids are UUIDv5 over `ksc-archive/series/<key>` and can never
   re-mint.
4. **Identities** — `pnpm identities` clusters the generated documents through
   the app's canonical matcher and writes `identities.json`, the manifest the
   ingest applies. It runs against `archive-generate`'s output, so it is an
   operator step rather than a CI one; slugs are minted once and never move,
   and a re-run only assigns rows that aren't claimed yet. Rows added between
   refreshes still get identities — the ingest's auto-pass drafts them — they
   just aren't curated until the next run.
5. **Ingest** — CI checks out the app repo, runs `pnpm archive-generate` over
   the config, and pushes with `pnpm cli as-published push … --workspace ksc`,
   authenticated by a workspace- and capability-scoped archivist token.
   Ingest is idempotent — unchanged documents are no-ops by content hash, so
   a push that touches one capture re-publishes only what actually moved.
   Publishing is automatic; there is no separate publish step.

## Status

**Live.** All **75 series / 81 fleet pages / 1,604 competitor rows** across
2018–2026 are ingested into the `ksc` workspace and published at
[app.sailscoring.ie/p/ksc](https://app.sailscoring.ie/p/ksc), one season index
per year. CI re-ingests on every push to `main`.

| Season | Series | Notes |
|---|--:|---|
| 2018 | 5 | back-filled by the scorer in 2022; 3 pages carry race dates |
| 2019 | 8 | back-filled in 2022 |
| 2020 | 2 | short season |
| 2021 | 8 | Summer Series also present as three weekly snapshots (skipped) |
| 2022 | 10 | includes the RS Inlands (2 fleets) and Munster Fireballs |
| 2023 | 11 | includes the Fireball Munsters & 420 Leinsters (2 fleets) |
| 2024 | 13 | first season with the club's curated naming; GP14 Munsters (3 fleets) |
| 2025 | 12 | includes the ILCA Westerns (3 fleets) |
| 2026 | 6 | season in progress — re-capture to refresh |

- ✅ Capture of both public sources, reproducible via `pnpm capture`.
- ✅ Catalogue with per-field provenance; 0 pages with an unresolvable season.
- ✅ As-published config + clean `archive-generate` over all nine seasons.
- ✅ Accented Irish names survive ingest — 34 of the 88 pages are
  windows-1252, and the app decodes captures by their encoding
  ([#344](https://github.com/sailscoring/sailscoring/issues/344)).
- ✅ `ksc` workspace provisioned, CI armed, and the whole corpus ingested and
  published (2026-07-31).
- ✅ **The identity manifest** — 1,604 rows resolved to **407 sailors**
  (`identities.json`), applied and live: the
  [competitor index](https://app.sailscoring.ie/p/ksc/competitors) and a career
  arc per sailor, spanning nine seasons
  ([John Callanan](https://app.sailscoring.ie/p/ksc/competitor/john-callanan-dzwh)
  has 56 series).
- ✅ **Crew count as sailors** (app
  [#348](https://github.com/sailscoring/sailscoring/issues/348)) — 47% of rows
  name a crew, and reading the helm field alone left those people out of the
  record entirely. Each person on a boat is now a sailor in their own right:
  **142 who had no page at all**, and **62 existing sailors** who turn out to
  helm some seasons and crew others. See CLARIFICATIONS §11.
- ✅ **Cross-spelling merges** — 55 curated groups covering 82 alternative
  spellings, including the `(J)` junior tag and five bare first names, took
  444 drafted sailors to 407. Six pairs that had been put to the club as open
  questions have been answered: five are one sailor each, one is two brothers.
  See CLARIFICATIONS §9.
- ⬜ **Drop the duplicate 2024 GP14 Munsters** — the club confirmed the Gold /
  Silver / Bronze split and the single overall are the same result, published
  both ways at the class's request
  ([#4](https://github.com/sailscoring/ksc-archive/issues/4)). The fleet split
  is kept and the overall skipped, which takes the corpus to 75 series and
  stops every GP14 competitor entering the identity spine twice. The skipped
  series row needs deleting from the workspace. Publishing both properly is
  app [#363](https://github.com/sailscoring/sailscoring/issues/363).
- ⬜ **Land the Cooler Series rename** — the club confirmed the autumn series
  is the Cooler Series everywhere
  ([#3](https://github.com/sailscoring/ksc-archive/issues/3)), so 2023 and 2024
  are no longer "October Series". That re-mints two series ids and two
  competitor slugs, and the two superseded series rows need deleting from the
  workspace. The old paths are left to 404 — nothing links into the archive
  yet, so URLs may still move. See CLARIFICATIONS §5.
- ⬜ **Refresh 2026** as the season finishes
  ([#8](https://github.com/sailscoring/ksc-archive/issues/8)).

### Open questions for the club

Much of what's left needs someone who knows the club, not more code. Each is
filed as a [`club-input` issue](https://github.com/sailscoring/ksc-archive/issues?q=is%3Aissue+is%3Aopen+label%3Aclub-input)
and written up in CLARIFICATIONS.md.

| | Why it matters |
|---|---|
| [#1](https://github.com/sailscoring/ksc-archive/issues/1) **Event dates** | the corpus states none, so every career arc shows `—` for its dates and isn't really ordered — the biggest single gap |
| [#2](https://github.com/sailscoring/ksc-archive/issues/2) **Members-area access** | would confirm the 2018–2023 naming; the results themselves are unaffected |
| [#3](https://github.com/sailscoring/ksc-archive/issues/3) **Event names** | the autumn series is answered — it is the Cooler Series everywhere, and 2023/2024 have been renamed to match; the rest of the naming is still open |
| [#4](https://github.com/sailscoring/ksc-archive/issues/4) **2024 GP14 Munsters** | answered — one result published two ways, on purpose; the archive keeps the fleet split and skips the overall |
| [#5](https://github.com/sailscoring/ksc-archive/issues/5) **Identity questions** | answered and closed — all six same-sailor-or-two pairs are settled, four by the club, including his two crew turning out to be one person. Never pinned down: the correct spelling of that Fireball sailor's own name, and three helms entered under a first name alone. CLARIFICATIONS §9 records both rather than asking again |
| [#6](https://github.com/sailscoring/ksc-archive/issues/6) **Other club records** | mostly answered — nothing survives pre-2018, no trophy list was ever published, and the club's standing scoring rules are now on record; still open is a prize-winner spreadsheet the scorer is looking for |

## Relationship to the app repo

This repo assumes the sibling app checkout exists at `../sailscoring`. It
**reuses** the app's Sailwave parser and id derivation by relative import
(`../sailscoring/lib/archive-kit/…`) rather than forking them — one canonical
toolkit. The as-published toolkit (parsers, generator, ingest client) lives in
the app's `lib/archive-kit/` and is driven from here via config.

Importing into the production workspace is CI's job; this repo's job ends at
a validated config.

## Licensing

- **Code** — `scripts/`: [MIT](LICENSE).
- **Normalised data & docs** — `sources/catalog.json`,
  `as-published.config.json`, `as-published-skips.json`, `README.md`,
  `SOURCES.md`, `CLARIFICATIONS.md`: [CC0 1.0](LICENSE-DATA). These are
  extractions of published facts (event names, seasons, structure), and facts
  are not copyrightable.
- **Source pages** — the verbatim captures under `sources/`: **not covered by
  either license.** These are results published by Killaloe Sailing Club
  (hosted by Sailwave), included only for reproducibility. All rights remain
  with their owners.
