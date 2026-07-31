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
4. **Ingest** — CI checks out the app repo, runs `pnpm archive-generate` over
   the config, and pushes with `pnpm cli as-published push … --workspace ksc`,
   authenticated by a workspace- and capability-scoped archivist token.
   Ingest is idempotent — unchanged documents are no-ops by content hash, so
   a push that touches one capture re-publishes only what actually moved.
   Publishing is automatic; there is no separate publish step.

## Status

**Live.** All **76 series / 82 fleet pages / 1,631 competitor rows** across
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
| 2024 | 14 | first season with the club's curated naming; GP14 Munsters (3 fleets) |
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
- ⬜ **Event dates** — the capture states none, so series don't order within a
  season. The biggest remaining gap; see CLARIFICATIONS.md §6.
- ⬜ **The club's naming for 2018–2023**, which sits behind their members-only
  gate (§7). The results are unaffected — only the curated headings are
  missing.
- ⬜ **The identity manifest** — pinned cross-series identities, so the same
  sailor links up across nine seasons and feeds the career arc.
- ⬜ Refresh 2026 as the season finishes: `pnpm capture --refresh` picks up
  re-uploads, and the five stub pages (§3) become real results.

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
