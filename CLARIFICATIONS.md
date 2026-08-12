# Clarifications

Coverage gaps, judgement calls, and open questions for the club. Under
as-published, results are never recomputed, so a *results* delta cannot
arise — but skipped pages, naming and dating approximations, and anything we
inferred rather than read must be recorded here, not papered over.

Questions that need the club's answer are also filed as
[`club-input` issues](https://github.com/sailscoring/ksc-archive/issues?q=is%3Aissue+is%3Aopen+label%3Aclub-input);
the ❓ blocks below link to them.

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
`as-published-skips.json` and not ingested. Six pages, plus one the club told
us about (§4):

| Skipped | Superseded by | Why |
|---|---|---|
| `Summer_Series_wk7.htm` | `Summer_Series_2021.htm` | week-7 snapshot, 13 races |
| `Summer_Series_wk8.htm` | `Summer_Series_2021.htm` | week-8 snapshot, 15 races |
| `Summer_Series_wk9.htm` | `Summer_Series_2021.htm` | week-9 snapshot, 17 races (identical results to the final) |
| `2022_September_Series.htm` | `September_Series_2022.htm` | 4 races, mid-series |
| `Summer_Series_2022.htm` | `2022_Summer_Series.htm` | byte-identical, uploaded 21 s apart |
| `2004_Summer_Super_Series.htm` | `2024_Summer_Super_Series.htm` | 8 races vs 16 |
| `2024_GP14_Munsters_alternate.htm` | `2024_GP14_Munsters.htm` | the same result published a second way (§4) |

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
apart on 2024-04-21. Both were published on purpose: the club
([#4](https://github.com/sailscoring/ksc-archive/issues/4)) confirms they are
the same racing and the same scores, put out in both formats at the GP14
class's request, so sailors could see where they finished among their peers
*and* within their fleet.

Neither supersedes the other, then — but two series is the wrong shape for
one result. It lists the regatta twice in the 2024 index, and `rows` is
structural, not display: every GP14 competitor entered the identity spine
twice off one event, which is why the manifest counted 199 sailors in more
than one series where it now counts 153.

So the **fleet split is archived and the single overall is skipped** (§2) —
the finer-grained of the two, and the one the class's own gold/silver/bronze
placings live in. That drops a view the club deliberately published, which is
a loss, not a fix. Carrying both properly — one result, a switch between
presentations, only one of them structural — is app-side work, filed as
[sailscoring#363](https://github.com/sailscoring/sailscoring/issues/363).

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

**The autumn series is the Cooler Series.** It has been published under both
"Cooler Series" and "October Series", and for 2024 the two sources disagree
with each other — the Sailwave `<h1>` says Cooler, the club's own season page
says October. The club settled it
([#3](https://github.com/sailscoring/ksc-archive/issues/3)): it is one
recurring event, both names have been used for it over the years, and it is
the Cooler Series. The two pages published as October
(`2023_October_Series.htm` and `2024_Cooler_Series.htm`) take their name from
`CONFIRMED_NAMES` in `scripts/emit-as-published-config.ts`, which outranks
both sources; the captures themselves are untouched, as always.

A confirmed name is a **migration, not an edit** (rule 6): the key is derived
from the name, and the series id from the key.

| Was | Now |
|---|---|
| `ksc-2023-october-series` · `3ebd79e8-…` · `/p/ksc/2023/october-series` | `ksc-2023-cooler-series` · `b2c3958d-…` · `/p/ksc/2023/cooler-series` |
| `ksc-2024-october-series` · `29dd6f64-…` · `/p/ksc/2024/october-series` | `ksc-2024-cooler-series` · `43fc4f33-…` · `/p/ksc/2024/cooler-series` |

Two sailors appear in no other series, so the slug each was minted against
moved with the series key: `enda-griffin-49y8` → `enda-griffin-j5dm`, and
`liz-cooper-8k8f` → `liz-cooper-8r5e`. Every other slug was preserved.

**The four old paths are being left to 404 rather than redirected** — a
deliberate call while the archive is unannounced and nothing external links
into it, taken with the club's answers still arriving. Once it is announced,
rule 5 and rule 6 apply in full and a move needs a redirect (app ADR-011,
`pnpm redirects add ksc <from> <to>`).

The rename does still need **the two superseded series rows deleted** from the
workspace: ingest is additive and keyed by content hash, so nothing prunes a
series whose key no longer exists.

> ❓ **For the club** ([#3](https://github.com/sailscoring/ksc-archive/issues/3))**:** are "Baltic Series", "Warmer Series", "Mayfly Series"
> and "Brass Monkey" the names the club wants shown, and is "Summer Series"
> the right label for what Sailwave files as "Summer Super Series"? The
> 2024–2026 season pages say yes; the earlier seasons are inferred from
> Sailwave alone. Was the 2021 "Killaloe Sailing Regatta", captured as
> `2021_Spring_regatta.htm`, the Spring Regatta?

## Coverage gaps

### 6. No event dates

Nothing in the corpus states when a series was sailed. Only 3 of 75 pages
carry dated race titles, and those look bulk-set by the scorer (every race in
`2018_Cooler_Series.htm` is dated 30/09/2018). Rather than invent dates, the
config omits `startDate`/`endDate` entirely.

Consequence: seasons group correctly (each series is filed under its year),
but series are not ordered *within* a season by when they were sailed.

> ❓ **For the club** ([#1](https://github.com/sailscoring/ksc-archive/issues/1))**:** the season sailing programme, or simply the start and
> end date per series, would fill this. It is the single highest-value piece
> of metadata missing.

### 7. The club's naming for 2018–2023 is members-only

`/2018-…` through `/2023-archived-racing-results/` render a members-only gate
anonymously. The **results are unaffected** — they are public on
sailwave.com — but for those six seasons we have no curated headings, so
names come from the Sailwave `<h1>` alone (see §5), and no `eventUrl` links
back to the club's presentation.

> ❓ **For the club** ([#2](https://github.com/sailscoring/ksc-archive/issues/2))**:** members-area access would let us confirm the 2018–2023
> naming, and would likely surface any results the club presents that were
> never uploaded to the Sailwave folder.

### 8. What the corpus does not contain

- **No prize-winners or trophies.** The sibling `dbsc-archive` carries a
  `yearbook/` of trophy winners transcribed from the club yearbook; nothing
  equivalent is published here. The club has since described how the prizes
  are awarded, but not who won them — below.
- **No sailing instructions or notices of race**, so the discard rules and
  scoring systems are known only from each page's caption line ("Discards: 1,
  To count: 5, Rating system: PY, Scoring system: Appendix A"). That is
  enough for as-published — nothing is recomputed — but not enough to
  re-score. The club's standing scoring rules are now on record — below —
  which is not the same as a per-event document.
- **No results before 2018.** The Sailwave folder starts there, with the
  2018–2021 seasons back-filled by the scorer in July 2022.

The club has answered most of that
([#6](https://github.com/sailscoring/ksc-archive/issues/6)). What follows is
**the club's account, not something read off a captured page** — it is
recorded here as context and is not used to derive, correct or re-score
anything.

**Before 2018 there is most likely nothing to find.** 2018 is when the club's
current scorer took the results on; earlier seasons were scored ad hoc, and
the club does not believe those survive anywhere. So the archive starting in
2018 is not a capture gap — it is where the continuous record begins.

**No trophy list has ever been published**, but the prize structure is
consistent and worth having on the record:

- 1st, 2nd and 3rd overall;
- then first-in-class — ILCA 7 / 6 / 4, RS Vision, Fireball, RS 400, RS 200
  and so on — with the number of class prizes depending on the entry;
- a class needs **at least three boats racing** for a class prize to be
  awarded;
- anyone who takes a 1st–3rd overall is **not** eligible for a class prize, so
  the prizes spread across the fleet.

The scorer believes a spreadsheet of prize winners exists and is looking for
it. That is the one thread still open on #6; the structure above says nothing
about *who* won, which is the part that would actually enrich the archive.

**The scoring standard is written down**, in the club's sailing instructions —
adopted in either 2019 or 2020 (the club is not sure which) and in effect
since. In summary, and paraphrased rather than reproduced, since the wording
is the club's own:

- **Portsmouth Yardstick**, each boat carrying the PN of the PY system in
  effect on the first day of that series or event (SI 16.1);
- **Low Point, RRS Appendix A**, modified so a series score is the total of
  the race scores with the worst discarded (16.3);
- **one discard for every four races sailed** (16.3.1);
- **average points** for rostered safety duty and for sailing an external
  regatta, as defined in the NoR (16.4);
- **tie-breaks** for a series spanning more than one event, applied in order:
  A8.1 excluding discards, then A8.1 including them, then A8.2 (best recent
  scores, including discards), then B8.8 (best discards) (17.1–17.4).

The captures corroborate the first three. Every one of the 81 published fleet
standings is scored "Appendix A", and the 74 that name a rating system all say
PY. **80 of the 81 match one-discard-per-four exactly** — including all five
2018 standings, which predate the written standard, so the practice was
already settled before it was documented. The single exception is the 2025
Summer Super Series: 14 races sailed, 4 discards, where 16.3.1 gives 3.
Nothing follows from that here — under as-published a result is archived as it
was scored, and the caption is carried verbatim — but it is the one place the
corpus and the club's stated rule disagree, so it is recorded rather than
smoothed over.

What is still missing is the **per-event** notice of race and sailing
instructions, which is what would explain any individual series' scoring
(including that 2025 discard). The standing scoring section above is the club
default, not a per-event record.

> ❓ **For the club** ([#6](https://github.com/sailscoring/ksc-archive/issues/6))**:** the prize-winner spreadsheet, if it turns up. Names against
> trophies are the one kind of club record the results pages cannot supply,
> and they reach back past 2018 in a way the scored results cannot.

## Identity

### 9. One name, one sailor — and where that stops

The competitor-identity manifest (`identities.json`, app #218) groups the
**2,353 people** named across the 1,604 competitor rows — helms and crew
alike (§11) — into **407 sailors**. It is drafted by `pnpm identities`
through the app's canonical matcher, then shaped by two rules.

**The default: clusters sharing a name are one sailor.** The matcher is
deliberately cautious about merging on a name alone, and wants sail-number,
club, or age continuity to corroborate it. That caution is miscalibrated for
this corpus: KSC shares boats around the club, so sail number tracks a *hull*,
not a person (§10), and the corroboration mostly isn't there. Left alone the
matcher splits regulars into several clusters — all 33 of the review
suggestions it raised on the helm field alone were a name against itself, e.g.
Stephen O'Brien across clusters of 45, 2 and 1. Adding crew takes that to 367,
for the reason §11 gives. At a club whose entrants come from a few hundred
members, two rows sharing a name are the same person, so those merge by
default.

**The exception: cross-spelling merges are listed, never guessed.**
`identity-curation.json` records them, and an entry is only added when the
variants share a club, never appear in the same series, and differ by an
obvious slip. The slips that qualify:

- a doubled or dropped letter (`Sue Connannon`, `Bjorn Ihoff`), a
  transposition, Mac/Mc spacing, or a dropped `O'` (`Emma Farrell`,
  `Susan Mignon`);
- a short form of a first name (`Timothy` / `Tim`, `Dave` / `David`);
- a trailing **`(J)`** junior tag. Five sailors carry one, all in the 2023
  Mayfly and Warmer Series, where the scorer marked juniors that way and no
  untagged spelling of the same name appears in the same series;
- a **bare first name** where the corpus names exactly one such person, at the
  same club, and a boat corroborates it — `Andreas` on Fireball 1471 with
  `Ana` crewing, `Aziz` on Wayfarer 8170. `Birgit` and `Reggie` are merged on
  the name being unique alone, since the boats they sailed are shared club
  hulls (§10) and corroborate nothing.

That covers 55 groups and 82 alternative spellings, the two largest being one
Fireball crew: the sailor published as **Andreas Gonzalves / Andres Gonzalez /
Andreas Gonzalez / Andres Gonzales / Andreas / Andres Gonzalves** across
2019–2024 (confirmed by the club as one sailor, but #5 closed without settling
which of the six is his name, so the display name is simply the commonest), and
his crew, who carries eight spellings of two surnames — see her row in the
club's answers below.

Where a merge picks a display name the corpus does not favour by count — `Jo
Kramers` over `Jo Kramer` — the curation file says why. One name, `Ana Maria
Gonzalves`, is not a corpus spelling at all: it is what the club called her in
answering #5, and the club is the authority on a member's own name where the
scoresheets only ever recorded parts of it. Only the label moves: the slug is
the public URL and the seed of the identity's UUIDv5, so it stays exactly where
it was minted even when the name printed on the page changes.

Under-linking splits one sailor's record; over-linking puts another sailor's
results in it. The second is worse and much harder to spot, so anything
failing those tests is left apart. Three helm entries stay that way for good:

| | |
|---|---|
| `Colin` (1, KSC, 2020) — `Colin Hart` or `Colin Haugh`? | he helmed RS 200 761, a shared club boat Colin Hart, Mike Hart, Reggie Quinn and Shirley O'Neill all used, so it settles nothing |
| `Liam` (1, 2024), `Paul` (1, 2025) | two Liams and four Pauls in the corpus |

Two 2019–2022 helm entries are recorded as `??`, and stand as a single sailor
named `??` for want of anything to call them. These five are what the corpus
says, and they stay as published: one row is not worth the risk of filing it
under the wrong member. If the club ever recognises one, a curated spelling in
`identity-curation.json` is the whole fix.

**Six pairs used to sit alongside them, and all six are settled** — two by the
evidence and four by the club
([#5](https://github.com/sailscoring/ksc-archive/issues/5), now closed).

The two the corpus answered itself, once crew were read as well as helms
(§11): `Tim O'Neill` / `Timothy O'Neill`, held apart for carrying different
clubs, turned out to helm RS 200 1059 with the same crew in the same seasons,
with `Tim O'Neill` himself entered as Cullaun in 2022 — and `Margaret Hayes` /
`Margaret Hynes`, called "almost certainly two people", turned out to be the
same privately owned Wayfarer 10826 with the same crew, `Mike Hayes`, in 2019
and 2025. The club has since confirmed both of those and answered the four
still standing:

| Pair | The club's answer |
|---|---|
| `Ana Gonzalves` / `Ana Maria Grande` | one sailor: **Grande is her maiden name**. She is published as **Ana Maria Gonzalves**, the married name in the full form the club used — the corpus records `Ana …` on the Gonzalves rows and `… Maria Grande` on the Grande ones, and never the whole of it. The surnames overlap rather than switch cleanly (Grande 2019–23, Gonzalves 2022–24), which is why this needed the club: a different surname is not a slip, and 15 rows against 6 is not a typo. |
| `Brian Bryce` / `Bryan Bryce` | one sailor who uses both spellings; the club standardises on **Brian**. Both spellings sail RS 400 1035 and never meet in a series, which is why this was asked rather than guessed — 8 rows is a lot for a typo, and Brian and Bryan are two real names. |
| `Siofra MacNamara` / `Siofra McNamara` | one sailor, a member of both clubs. Both spellings sail 179313. Which spelling *she* uses is still unconfirmed; **McNamara** is published, being what her KSC entries carry. |
| `Sean Cunningham` / `John Cunningham` | **two people** — brothers, John not a regular sailor. The corpus agrees, and could have said so: in the 2018 Summer Regatta John helms 14750 with Sean crewing, so they are on one boat at one time. |
| `Timothy` / `Tim O'Neill` | one sailor, at another club before he joined KSC. Given name Timothy, preferred name **Tim**. |
| `Margaret Hayes` / `Margaret Hynes` | one sailor; **Hynes** is right and the 2019 spelling a typo. |

Merging the three pairs cost three identities and no data: 410 sailors became
**407**, with `Bryan Bryce`'s eight rows joining Brian's 42, Siofra's two
threes becoming one six, and Ana's 15 Grande rows and 6 Gonzalves rows becoming
a single 21-series record spanning 2019–2024. `Siofra McNamara` and `Ana Maria
Gonzalves` keep the slugs their `MacNamara` and `Ana-Marie Grande` clusters were
minted under, as five other curated names already do — the slug is the
identifier, the name is the label, and only the label moves.

With that, **#5 is closed**. Every pair the club could put a name to is
answered; what is left — which spelling of his own name Andres Gonzalves uses,
and the five entries above that name nobody identifiable — is recorded here
rather than held open as a question, because neither changes a result and
neither is worth asking the club a third time. Both would still be welcome
answers, and both are a curation-file change if they ever arrive.

### 10. Boats are shared, so a sail number is not a sailor

Fourteen `(series, sail)` pairs carry two different sailors — club ILCAs and
RS Visions, several entered as `TBD`. The manifest addresses members by
`(series-slug, sail)`, so those keys are ambiguous by construction; the apply
resolves them by name-token overlap, and all 28 affected member rows resolve
cleanly. `pnpm identities` re-checks this on every run and refuses to write a
manifest that would lose a row.

### 11. Crew are sailors too

Identity used to attach to the helm alone, so the 47% of KSC rows carrying a
named crew contributed nobody, and the people who only ever crew sailed the
whole record and got no sailor page. App
[#348](https://github.com/sailscoring/sailscoring/issues/348) fixed that:
every person on a boat is a member row of its own, tagged with the slot they
filled. The manifest went from 278 sailors to 444, and to **407** once the
cross-spelling merges in §9 were applied: **142 of them appear only ever as
crew** and had no record at all before this, and **62 both helm and crew**.

Three consequences worth knowing.

**Crew names are looser than helm names.** Twenty-five mentions name nobody
identifiable — `??`, `?????`, `TBD`, bare first names (`Michael`, `Daragh`,
`Ruan`), initials (`AM`, `SG`, `AS`), and two half-names (`?? Roycroft`,
`Colm ??`).
They stay in the published results, where they are what the club recorded, but
they don't become sailors: a page titled `???` serves nobody, and a lone
surname is exactly the shape that fuses unrelated people (§9). `pnpm
identities` lists every one it skipped, so if any of them *is* identifiable,
the fix is a curated spelling in `identity-curation.json`.

**The matcher splits crew harder than helms.** Everyone on a boat shares its
club and its sail number, so neither can corroborate a crew's name match the
way they do for a helm — the app deliberately demands more before merging a
crew. On this corpus that means the raw matcher returns 647 clusters where it
returned 352, which the one-name-one-sailor merge in §9 then collapses. That
merge was already carrying most of the weight here; it now carries more.

**Eleven cells name two sailors, and only one of them gets the row.** Eight
are **helm** cells (`Aoibhí Ryan / Aoise Ryan`, `Andrew Mullally/Thomas
Drayton`, `Brian Keane / Molly Kramers`, …), where the crew-cell split does
not reach — the app models a multi-person row (`names` is a list), but this
corpus's capture doesn't split the primary cell. Three are **crew** cells
naming the boat's two crews for the series with nothing but a space between
them (`Amber Robson Maeve Derven`, `Leon Mullally Dominic O'Sullivan`, `James
Purcell Kiki Ryan`); splitting on whitespace automatically would break every
sailor whose own name runs to three or four words.

All eleven are attributed to the **first sailor named** — three by the matcher
itself, eight by an alias in `identity-curation.json` so that they stop standing
as identities called things like "Andrew Mullally/Thomas Drayton". That is a
lossy compromise, not a fix: the second sailor loses a row they really sailed.
Splitting a cell properly needs the ingest document to carry both names, which
is app-side work. Tracked as
[#10](https://github.com/sailscoring/ksc-archive/issues/10) (helm cells) and
[#9](https://github.com/sailscoring/ksc-archive/issues/9) (space-separated
crew cells).
