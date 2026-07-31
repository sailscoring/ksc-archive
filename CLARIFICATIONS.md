# Clarifications

Coverage gaps, judgement calls, and open questions for the club. Under
as-published, results are never recomputed, so a *results* delta cannot
arise — but skipped pages, naming and dating approximations, and anything we
inferred rather than read must be recorded here, not papered over.

## Judgement calls

### 1. Which season a result belongs to

The corpus offers four year signals and they disagree on 23 of 88 pages. The
emit step resolves in this order, and every page records which signal won
(`yearSource` in `sources/catalog.json`):

1. **The club's season page** — authoritative, available for 2024–2026.
2. **The filename** — correct on every page but one, and rejected when it
   falls outside the published seasons (2018–2026). That single rejection is
   `2004_Summer_Super_Series.htm`, a transposition of 2024: it was uploaded
   2024-07-23, its `<title>` says 2024, and it is an earlier upload of the
   2024 Summer Super Series.
3. **Sailwave's event-year global** (the trailing year in `<title>`) — last,
   because it is the *re-publish* year on back-filled seasons. Every
   2018–2021 page says "2022": the scorer loaded that history into Sailwave
   in July 2022 and the global carried the then-current year.

The `<h1>` is never used for the year; where it states one it agrees with the
filename.

### 2. Which upload of a series is the published record

KSC re-uploads a running series as it progresses, sometimes under a variant
filename. Where several uploads are the same series, the one with the most
races wins (ties break to the latest upload); the rest are recorded in
`as-published-skips.json` and not ingested. Six pages:

| Skipped | Superseded by | Why |
|---|---|---|
| `Summer_Series_wk7.htm` | `Summer_Series_2021.htm` | week-7 snapshot, 13 races |
| `Summer_Series_wk8.htm` | `Summer_Series_2021.htm` | week-8 snapshot, 15 races |
| `Summer_Series_wk9.htm` | `Summer_Series_2021.htm` | week-9 snapshot, 17 races (identical results to the final) |
| `2022_September_Series.htm` | `September_Series_2022.htm` | 4 races, mid-series |
| `Summer_Series_2022.htm` | `2022_Summer_Series.htm` | byte-identical, uploaded 21 s apart |
| `2004_Summer_Super_Series.htm` | `2024_Summer_Super_Series.htm` | 8 races vs 16 |

### 3. Pages with nothing sailed

Six pages publish an entry list and "Sailed: 0" — stubs the scorer uploaded
ahead of the season. They are skipped; there is no published result to
archive yet. Five are 2026 events not yet raced, one is
`2024_KSC_Open_Regatta.htm`.

This is judged on the standings' race columns, never on whether per-race
detail tables are present: several genuine results (e.g.
`2018_Summer_Regatta.htm`, Sailed: 7) publish standings only, which is a
complete published result.

### 4. The 2024 GP14 Munsters was published twice

`2024_GP14_Munsters.htm` (Gold / Silver / Bronze fleets) and
`2024_GP14_Munsters_alternate.htm` (a single overall) were uploaded a minute
apart on 2024-04-21. Both are part of the published record, so both are
ingested; the second is named "GP14 Munsters (alternate scoring) 2024".

> ❓ **For the club:** which of the two does the class consider the official
> result? If one supersedes the other we should skip it rather than publish
> both.

### 5. Event names

Where the club's season page gives a heading it wins, with "Racing Results"
stripped. Otherwise the Sailwave `<h1>` is used. Both are the same scorer's
wording; the `<h1>` is just less tended, and demonstrably stale in places —
the 2026 Warmer Series page is still headed "2025 Warmer Series", and the
`<h1>` of June Sprint 2 reads "Wk 1". Three normalisations are applied:

- a leading club name is dropped, but only while two words survive it (so
  "Killaloe Sailing Regatta 2021" keeps its name rather than becoming a bare
  "Regatta");
- an embedded year is dropped, since the season is appended anyway;
- for a numbered run of events (the 2024 June Sprints) the filename ordinal
  wins, being the only signal that separates them.

> ❓ **For the club:** are "Baltic Series", "Warmer Series", "Cooler Series",
> "Mayfly Series" and "Brass Monkey" the names the club wants shown, and is
> "Summer Series" the right label for what Sailwave files as "Summer Super
> Series"? The 2024–2026 season pages say yes; the earlier seasons are
> inferred from Sailwave alone.

## Coverage gaps

### 6. No event dates

Nothing in the corpus states when a series was sailed. Only 3 of 76 pages
carry dated race titles, and those look bulk-set by the scorer (every race in
`2018_Cooler_Series.htm` is dated 30/09/2018). Rather than invent dates, the
config omits `startDate`/`endDate` entirely.

Consequence: seasons group correctly (each series is filed under its year),
but series are not ordered *within* a season by when they were sailed.

> ❓ **For the club:** the season sailing programme, or simply the start and
> end date per series, would fill this. It is the single highest-value piece
> of metadata missing.

### 7. The club's naming for 2018–2023 is members-only

`/2018-…` through `/2023-archived-racing-results/` render a members-only gate
anonymously. The **results are unaffected** — they are public on
sailwave.com — but for those six seasons we have no curated headings, so
names come from the Sailwave `<h1>` alone (see §5), and no `eventUrl` links
back to the club's presentation.

> ❓ **For the club:** members-area access would let us confirm the 2018–2023
> naming, and would likely surface any results the club presents that were
> never uploaded to the Sailwave folder.

### 8. What the corpus does not contain

- **No prize-winners or trophies.** The sibling `dbsc-archive` carries a
  `yearbook/` of trophy winners transcribed from the club yearbook; nothing
  equivalent is published here.
- **No sailing instructions or notices of race**, so the discard rules and
  scoring systems are known only from each page's caption line ("Discards: 1,
  To count: 5, Rating system: PY, Scoring system: Appendix A"). That is
  enough for as-published — nothing is recomputed — but not enough to
  re-score.
- **No results before 2018.** Whether the club has earlier records in any
  form is unknown.

## Identity

### 9. One name, one sailor — and where that stops

The competitor-identity manifest (`identities.json`, app #218) groups the
1,631 competitor rows into **278 sailors**. It is drafted by `pnpm identities`
through the app's canonical matcher, then shaped by two rules.

**The default: clusters sharing a name are one sailor.** The matcher is
deliberately cautious about merging on a name alone, and wants sail-number,
club, or age continuity to corroborate it. That caution is miscalibrated for
this corpus: KSC shares boats around the club, so sail number tracks a *hull*,
not a person (§10), and the corroboration mostly isn't there. Left alone the
matcher splits regulars into several clusters — all 33 of its review
suggestions were a name against itself, e.g. Stephen O'Brien across clusters
of 45, 2 and 1. At a club whose entrants come from a few hundred members, two
rows sharing a name are the same person, so those merge by default.

**The exception: cross-spelling merges are listed, never guessed.**
`identity-curation.json` records them, and an entry is only added when the
variants share a club, never appear in the same series, and differ by an
obvious slip — a doubled or dropped letter, a transposition, Mac/Mc spacing, a
dropped `O'`, or a short form of a first name. That covers 23 groups, the
largest being the Fireball sailor published as **Andreas Gonzalves / Andres
Gonzalez / Andreas Gonzalez / Andres Gonzales / Andres Gonzalves** across
2019–2024 (confirmed by the club; the correct spelling still isn't known, so
the display name is simply the commonest of the five).

Under-linking splits one sailor's record; over-linking puts another sailor's
results in it. The second is worse and much harder to spot, so anything
failing those tests is left apart and asked about instead:

> ❓ **For the club:** are these the same sailor, or two?
>
> | | |
> |---|---|
> | `Brian Bryce` (42 rows, 2018–2026) / `Bryan Bryce` (8 rows, 2021–2023) | both KSC, never in the same series |
> | `Siofra MacNamara` (3, Lough Ree YC, 2023) / `Siofra McNamara` (3, KSC, 2023–24) | same spelling pattern as Fionn McNamara, but the clubs differ |
> | `Tim O'Neill` (20, KSC) / `Timothy O'Neill` (3, Cullaun SC) | different clubs |
> | `Sean Cunningham` (43, KSC) / `John Cunningham` (1, Killaloe SC) | same club; Seán/John is the same name in Irish, but also two common ones |
> | `Margaret Hayes` (1, Cullaun, 2019) / `Margaret Hynes` (2, KSC, 2025) | almost certainly two people — listed only for completeness |

### 10. Boats are shared, so a sail number is not a sailor

Fourteen `(series, sail)` pairs carry two different sailors — club ILCAs and
RS Visions, several entered as `TBD`. The manifest addresses members by
`(series-slug, sail)`, so those keys are ambiguous by construction; the apply
resolves them by name-token overlap, and all 28 affected member rows resolve
cleanly. `pnpm identities` re-checks this on every run and refuses to write a
manifest that would lose a row.

### 11. Crew have no identity

Identity attaches to the helm. **48% of KSC rows carry a named crew, and 196
people appear only ever as crew** — they sail the whole record and get no
sailor page. Tracked as app
[#348](https://github.com/sailscoring/sailscoring/issues/348).

Six rows named two sailors in the helm cell itself (`Aoibhí Ryan / Aoise
Ryan`). Each is attributed to the first named, matching how the matcher
resolved the two it could settle by sail number — the second sailor loses a
row they arguably should keep, which #348 is the real fix for.
