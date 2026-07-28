# CLAUDE.md

Guidance for Claude Code working in this repo. **Read `README.md` first** — it
has the mission, the sources, the pipeline, and the status tracker. This file
covers the working conventions.

## What this repo is

A data pipeline, not an application. It captures Killaloe Sailing Club's
published Sailwave results (2018–2026) verbatim from two public sources, and
emits the **as-published** ingest config (app ADR-010) that feeds that history
into Sail Scoring — ingested faithfully, never re-scored.

It is the KSC counterpart of the sibling `hyc-archive`, `dbsc-archive`, and
`iodai-archive` repos; the same spirit applies. It is closest to
`hyc-archive`, which is also Sailwave-sourced and also as-published-native.
Domain background (handicap systems, fleets) lives in the app repo under
`../sailscoring/docs/`.

## Commands

```
pnpm install
pnpm capture              # refresh both sources (skips files already on disk)
pnpm capture --refresh    # re-fetch everything
pnpm catalog              # capture → sources/catalog.json
pnpm emit-as-published    # catalog → as-published.config.json
pnpm typecheck
```

The full loop is `pnpm capture && pnpm catalog && pnpm emit-as-published`,
then in the app repo:

```
pnpm archive-generate ../ksc-archive/as-published.config.json
```

## Rules that are easy to get wrong

1. **Be a good citizen to both servers.** Keep the single-threaded 0.75 s
   delay in `scripts/capture.ts`; never parallelise. Files on disk are reused,
   so re-runs are cheap — `--refresh` should be rare.

2. **Source pages are verbatim and third-party.** Everything under `sources/`
   except `catalog.json` is unmodified published output, kept for
   reproducibility. Do not edit it, do not transcode it (see rule 4), and do
   not relicense it — see README "Licensing".

3. **Only real published data.** If something is missing, leave it missing —
   do not fabricate, interpolate, or guess. Partial coverage is fine. This is
   why the config carries no event dates at all: the corpus states none, and
   plausible ones would be invention.

4. **Decode by the declared charset.** Sailwave publishes ISO-8859-1 and 34
   of the 88 pages carry accented Irish names. Reading them as UTF-8 silently
   mangles the very names the identity spine matches on. `readCapture` in
   `scripts/build-catalog.ts` does this correctly; the app generator does not
   yet (app #344), which currently blocks ingest.

5. **Never rename an emitted series `key`.** Series ids are deterministic
   UUIDv5 over `ksc-archive/series/<key>`; renaming a key re-mints the id and
   orphans the ingested series and its identity links. The key derives from
   the display name, so a naming change is a migration, not a rename.

6. **Record every judgement call in [`CLARIFICATIONS.md`](CLARIFICATIONS.md).**
   This corpus needs more of them than most — the club's year signals
   disagree on a quarter of the pages, series are re-uploaded under variant
   filenames, and some titles are stale. State what is verified, mark what is
   inferred, and put the rest to the club as a question. Do not guess at
   intent.

7. **Derived fields carry their provenance.** `sources/catalog.json` records,
   per page, which signal produced each derived value (`yearSource`,
   `yearCandidates`). Keep that property when adding fields — it is what makes
   the inferences auditable rather than magic.

## Relationship to the app repo

This repo assumes the sibling app checkout exists at `../sailscoring`. It
**reuses** the app's Sailwave parser and id derivation by relative import
(`../sailscoring/lib/archive-kit/…`) rather than forking them — one canonical
toolkit, as `dbsc-archive` does with the scoring engine. `jsdom` is a direct
dependency here because the parser needs it.

The as-published toolkit (parsers, generator, ingest client) stays in the app;
this repo contributes config, not code, to the ingest. Pushing to the
production workspace is CI's job — this repo's job ends at a validated config.

## Git conventions

- Commit logically (one coherent change per commit). Keep the tree consistent.
- Commit as `markbmc@gmail.com`, unsigned (`commit.gpgsign=false`).
- **End every commit message with:**
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **Do not push unless asked.** Commit locally; let the human review and push.
