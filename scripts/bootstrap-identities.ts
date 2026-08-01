/**
 * `pnpm identities` — draft/refresh `identities.json`, the competitor-identity
 * manifest (app #218) named by `as-published.config.json`.
 *
 * Reads the generated ingest documents (so run `archive-generate` first),
 * clusters their competitor rows through the app's *canonical* matcher
 * (`pnpm cluster-rows` in the sibling checkout — the same one the workspace
 * apply uses, so a draft matches what apply would produce), then writes the
 * manifest.
 *
 * Two things then shape the raw clusters:
 *
 *  1. **One name, one sailor.** KSC is a small club whose entrants are drawn
 *     from a few hundred members, so two rows sharing a name are the same
 *     person, and the matcher's caution about it is miscalibrated here: with
 *     boats shared around the club, sail-number continuity — its main
 *     corroborating signal — mostly isn't there, so it splits a regular into
 *     several clusters ("no sail-number, club, or age corroboration"). Clusters
 *     sharing a normalised name are merged by default. Genuine namesakes are
 *     the exception and go in `separate` in the curation file.
 *  2. **Curated aliases.** Cross-spelling merges the matcher can't see, listed
 *     in `identity-curation.json`.
 *
 * **Crew count as sailors** (app #348). Nearly half of KSC's rows name a crew,
 * and most of those people never helm at all — so reading the helm field alone
 * left them out of the record entirely, and left anyone who helms some seasons
 * and crews others with half a career. Each person on a boat is now a member
 * row of their own, tagged with the slot they filled. Crew names are recorded
 * loosely, so the ones that don't identify anybody ("Michael", "AM", "???")
 * are reported and skipped rather than published as sailors.
 *
 * Slugs are minted **once** and then never move — they are public URLs, and the
 * identity id is a UUIDv5 of the slug. A re-run keeps every slug, name and club
 * already in `identities.json` and only assigns rows that aren't claimed yet,
 * so this is safe to re-run as the live 2026 season adds races and entrants.
 *
 *   pnpm identities            # refresh, preserving existing curation
 *   pnpm identities --report   # also print the matcher's review suggestions
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const DOCS_DIR = 'as-published/series';
const CURATION = 'identity-curation.json';
const OUT = 'identities.json';
const APP_DIR = '../sailscoring';

const MANIFEST_VERSION = 1;

/** The app's slug-suffix alphabet (`lib/competitor-slug.ts`) — no 0/o/1/l/i,
 *  the characters people misread copying a slug off a results sheet. */
const SUFFIX_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const SUFFIX_LENGTH = 4;

interface CurationGroup {
  /** The display name to publish under. */
  name: string;
  /** Other spellings of the same person, as they appear in the results. */
  aliases: string[];
  note?: string;
}

interface Curation {
  unify?: CurationGroup[];
  /** Names that really are two or more different sailors, so the
   *  one-name-one-sailor default must not merge them. */
  separate?: string[];
  /** Display-name overrides, keyed by the name the matcher labelled a cluster
   *  with — for fixing a spelling without touching the underlying rows. */
  rename?: Record<string, string>;
}

/** Which slot of an entry a person came out of (app #348). Half of KSC's rows
 *  carry a named crew, and 196 people appear only ever as crew — invisible to
 *  the manifest while it read the helm field alone. */
type Role = 'primary' | 'crew';

interface Row {
  seriesKey: string;
  seriesId: string;
  /** Unique per person — `(seriesKey, sail)` is not, since KSC shares hulls,
   *  and a crewed boat carries two people under the one sail. */
  rowId: string;
  /** The boat this person sailed on: `${seriesKey}#${index}`. Two people
   *  sharing this are two sailors, never one. */
  boatId: string;
  sail: string;
  name: string;
  role: Role;
  club: string | null;
  year: number | null;
}

/** A manifest member row: the boat, plus the slot when it isn't the primary
 *  one. The app defaults a two-element row to `primary`. */
type Member = [string, string] | [string, string, Role];

interface ManifestIdentity {
  slug: string;
  name: string;
  club?: string;
  members: Member[];
  note?: string;
}

/** `(series, sail, slot)` — the manifest's member key, as one string. */
function memberKey(m: Member): string {
  return `${m[0]}|${m[1]}|${m[2] ?? 'primary'}`;
}

/** Mirrors the app's `slugifyName`. */
function slugifyName(label: string): string {
  const base = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'competitor';
}

/** Name → comparison key: diacritics folded, punctuation and case dropped, so
 *  "Stephen O' Brien", "Stephen O'Brien" and "Stephen O'brien" agree. */
function nameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A deterministic suffix, so a re-run that has to mint the same identity
 *  mints the same slug. */
function suffix(stableKey: string): string {
  const digest = createHash('sha1').update(stableKey, 'utf8').digest();
  let n = digest.readBigUInt64BE(0);
  const size = BigInt(SUFFIX_ALPHABET.length);
  let out = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    out += SUFFIX_ALPHABET[Number(n % size)];
    n /= size;
  }
  return out;
}

function mintSlug(name: string, stableKey: string, taken: Set<string>): string {
  const base = slugifyName(name);
  let key = stableKey;
  for (let i = 0; i < 20; i++) {
    const candidate = `${base}-${suffix(key)}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
    key += '+';
  }
  const candidate = `${base}-${suffix(key)}-${suffix(`${key}!`)}`;
  taken.add(candidate);
  return candidate;
}

/** Stand-ins a scorer types when the crew isn't known. Mirrors the app's
 *  `CREW_PLACEHOLDERS` in `lib/competitor-identity-match.ts`. */
const CREW_PLACEHOLDERS = new Set([
  'tbd', 'tba', 'na', 'n/a', 'none', 'unknown', 'crew', 'guest', 'various', 'visitor',
]);

/** Mirrors the app's `splitCrewCell`: a few KSC cells list a whole crew in one
 *  field ("Maeve Dervan, Amber Robson"), some with a slash. Never splits on
 *  whitespace. */
function splitCrewCell(cell: string): string[] {
  return cell
    .split(/\s*[,&+/]\s*|\s+and\s+/i)
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
}

/**
 * Mirrors the app's `isLowSignalPersonName`. KSC's crew field carries bare
 * first names ("Michael"), initials ("AM"), and placeholders ("???", "TBD").
 * None of those identifies anyone, and each would otherwise become a sailor
 * with a public page naming nobody. They stay in the published results, which
 * is where they belong; they just don't become a person.
 *
 * Kept in step with the app by construction: a rule that drifts shows up as a
 * member the workspace apply can't resolve, which the check at the end of this
 * script fails on before anything is pushed.
 */
function isLowSignalName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (CREW_PLACEHOLDERS.has(trimmed.toLowerCase())) return true;
  const tokens = trimmed
    .split(/\s+/)
    .map((t) => t.toLowerCase().normalize('NFKD').replace(/[^a-z]/g, ''))
    .filter((t) => t.length > 0);
  return tokens.length < 2;
}

interface LoadResult {
  rows: Row[];
  /** Crew mentions dropped as unrecognisable, for the operator's report. */
  droppedCrew: string[];
}

function loadRows(): LoadResult {
  if (!existsSync(DOCS_DIR)) {
    throw new Error(
      `${DOCS_DIR} not found — run \`pnpm archive-generate\` in ${APP_DIR} first`,
    );
  }
  const rows: Row[] = [];
  const droppedCrew: string[] = [];
  for (const file of readdirSync(DOCS_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const doc = JSON.parse(readFileSync(join(DOCS_DIR, file), 'utf8'));
    const seriesKey = file.replace(/\.json$/, '');
    const year = Number.parseInt(doc.series.publishedSlug ?? '', 10);
    doc.competitors.forEach((c: Record<string, unknown>, i: number) => {
      const sail = String(c.sailNumber ?? '');
      const boatId = `${seriesKey}#${i}`;
      const base = {
        seriesKey,
        seriesId: doc.series.id as string,
        boatId,
        sail,
        club: (c.club as string) ?? null,
        year: Number.isFinite(year) ? year : null,
      };
      rows.push({
        ...base,
        rowId: boatId,
        name: String(c.name ?? ''),
        role: 'primary',
      });
      const crewCell = typeof c.crewName === 'string' ? c.crewName : '';
      splitCrewCell(crewCell).forEach((name, j) => {
        if (isLowSignalName(name)) {
          droppedCrew.push(name);
          return;
        }
        rows.push({ ...base, rowId: `${boatId}:crew${j}`, name, role: 'crew' });
      });
    });
  }
  return { rows, droppedCrew };
}

interface ClusterResult {
  clusters: Array<{ label?: string; name?: string; competitorIds: string[] }>;
  suggestions: Array<{ a: number; b: number; reason: string }>;
  stats: Record<string, unknown>;
}

/** Cluster through the app's matcher rather than a fork of it. `raceYear`
 *  normally comes from `series.start_date`; this corpus states no dates
 *  (CLARIFICATIONS §6), so the season the archive does know stands in.
 *
 *  Crew go in flagged as fragments, exactly as the workspace apply flags them:
 *  everyone on a boat shares its club and sail, so neither can corroborate a
 *  crew's name match. That makes the matcher split crew hard on this corpus —
 *  which the one-name-one-sailor merge below is already there to undo. */
function cluster(rows: Row[]): ClusterResult {
  const input = rows.map((r) => ({
    competitorId: r.rowId,
    name: r.name,
    sailNumber: r.sail,
    club: r.club ?? undefined,
    age: null,
    raceYear: r.year,
    existingIdentityId: null,
    ...(r.role === 'crew' ? { role: 'crew', fromMultiPersonRow: true } : {}),
  }));
  const out = execFileSync('pnpm', ['--silent', '--dir', APP_DIR, 'cluster-rows'], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out) as ClusterResult;
}

function main(): void {
  const report = process.argv.includes('--report');
  const { rows, droppedCrew } = loadRows();
  const byRowId = new Map(rows.map((r) => [r.rowId, r]));
  const result = cluster(rows);

  const curation: Curation = existsSync(CURATION)
    ? JSON.parse(readFileSync(CURATION, 'utf8'))
    : {};
  const separate = new Set((curation.separate ?? []).map(nameKey));
  const aliasTo = new Map<string, string>();
  for (const group of curation.unify ?? []) {
    for (const alias of [group.name, ...group.aliases]) {
      aliasTo.set(nameKey(alias), nameKey(group.name));
    }
  }
  const noteFor = new Map(
    (curation.unify ?? [])
      .filter((g) => g.note)
      .map((g) => [nameKey(g.name), g.note!]),
  );
  const displayFor = new Map(
    (curation.unify ?? []).map((g) => [nameKey(g.name), g.name]),
  );
  for (const [from, to] of Object.entries(curation.rename ?? {})) {
    displayFor.set(nameKey(from), to);
    aliasTo.set(nameKey(from), nameKey(from));
  }

  // Group clusters. The merge key is the curated canonical name where there is
  // one, else the cluster's own normalised name — which merges the matcher's
  // same-name splits. A name in `separate` keeps the matcher's split, so its
  // clusters stay distinct.
  //
  // The key is slot-blind on purpose: someone who helms one season and crews
  // the next is one sailor with one record, which is the whole point.
  const groups = new Map<string, { rowIds: string[]; names: string[] }>();
  result.clusters.forEach((c, i) => {
    const label = c.label ?? c.name ?? '';
    const key = nameKey(label);
    const canonical = aliasTo.get(key) ?? key;
    const groupKey = separate.has(canonical) ? `${canonical}#${i}` : canonical;
    const g = groups.get(groupKey) ?? { rowIds: [], names: [] };
    g.rowIds.push(...c.competitorIds);
    g.names.push(...c.competitorIds.map((id) => byRowId.get(id)?.name ?? label));
    groups.set(groupKey, g);
  });

  // Existing curation wins: an identity keeps its slug, name and club, and a
  // group is recognised as that identity when it holds any of its member rows.
  const existing: { identities?: ManifestIdentity[] } = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, 'utf8'))
    : {};
  const takenSlugs = new Set((existing.identities ?? []).map((i) => i.slug));
  // A member key can carry several slugs: a boat with two named crew has two
  // sailors in the one `(series, sail, crew)` slot.
  const slugsByMember = new Map<string, string[]>();
  const priorBySlug = new Map<string, ManifestIdentity>();
  for (const identity of existing.identities ?? []) {
    priorBySlug.set(identity.slug, identity);
    for (const member of identity.members) {
      const key = memberKey(member);
      slugsByMember.set(key, [...(slugsByMember.get(key) ?? []), identity.slug]);
    }
  }

  const identities: ManifestIdentity[] = [];
  /** Prior slugs already inherited this run — a slug is one sailor's URL, so
   *  no two groups may carry it away. */
  const claimedPriorSlugs = new Set<string>();
  for (const [groupKey, group] of [...groups.entries()].sort()) {
    const byKey = new Map<string, Member>();
    for (const id of group.rowIds) {
      const r = byRowId.get(id)!;
      const member: Member =
        r.role === 'crew' ? [r.seriesKey, r.sail, 'crew'] : [r.seriesKey, r.sail];
      byKey.set(memberKey(member), member);
    }
    const members = [...byKey.keys()].sort().map((k) => byKey.get(k)!);

    // Most frequent raw spelling, unless curation names one.
    const counts = new Map<string, number>();
    for (const n of group.names) counts.set(n, (counts.get(n) ?? 0) + 1);
    const commonest = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0][0];
    const name = displayFor.get(groupKey) ?? commonest;

    const clubs = new Map<string, number>();
    for (const id of group.rowIds) {
      const club = byRowId.get(id)?.club;
      if (club) clubs.set(club, (clubs.get(club) ?? 0) + 1);
    }
    const club = [...clubs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    // Which prior identity is this group? Whichever claims most of its member
    // rows — not merely the first one to claim any, which two groups can
    // answer with the same slug once a boat carries two people, handing them
    // both the same public URL. A slug already taken by an earlier group falls
    // through to the next-best candidate, and then to a fresh mint.
    const priorCounts = new Map<string, number>();
    for (const m of members) {
      for (const s of slugsByMember.get(memberKey(m)) ?? []) {
        priorCounts.set(s, (priorCounts.get(s) ?? 0) + 1);
      }
    }
    const priorSlug = [...priorCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([s]) => s)
      .find((s) => !claimedPriorSlugs.has(s));
    if (priorSlug) claimedPriorSlugs.add(priorSlug);
    const prior = priorSlug ? priorBySlug.get(priorSlug) : undefined;
    const slug =
      priorSlug ?? mintSlug(name, members.map(memberKey).join('|'), takenSlugs);

    identities.push({
      slug,
      // A name already curated in the manifest is never overwritten by the
      // commonest spelling — hand corrections outrank the count.
      name: prior?.name ?? name,
      ...(prior?.club ?? club ? { club: prior?.club ?? club } : {}),
      members,
      ...(noteFor.get(groupKey) ? { note: noteFor.get(groupKey) } : {}),
    });
  }
  identities.sort((a, b) => a.slug.localeCompare(b.slug));

  const seriesMap: Record<string, string> = {};
  for (const r of rows) seriesMap[r.seriesKey] = r.seriesId;

  // The apply resolves each member by `(series-slug, sail)` and its slot,
  // disambiguating a sail two boats share by name tokens — against the crew
  // field for a crew member, since that is where its person appears. Check
  // that here rather than discover it as `unresolvedMembers` after a
  // production push: a golden record that silently loses rows isn't a golden
  // record.
  const rowsByMember = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.seriesKey}|${r.sail}|${r.role}`;
    rowsByMember.set(key, [...(rowsByMember.get(key) ?? []), r]);
  }
  const tokens = (n: string) =>
    new Set(nameKey(n).split(' ').filter((t) => t.length >= 2));
  const problems: string[] = [];
  /** How many identities claim each member key. A slot seats one identity per
   *  person it names, so a two-person crew may be claimed twice. */
  const claimCounts = new Map<string, number>();
  // Whether one identity ends up claiming two people off the same boat — the
  // family-boat shape ("Ann Ryan" helming, "A Ryan" crewing). The matcher
  // never fuses them, but the name merge above is slot-blind and could.
  const boatsBySlug = new Map<string, Set<string>>();
  for (const identity of identities) {
    for (const member of identity.members) {
      const [seriesKey, sail] = member;
      const role: Role = member[2] ?? 'primary';
      const key = memberKey(member);
      const candidates = rowsByMember.get(key);
      if (!candidates) {
        problems.push(`${identity.slug}: no ${role} row for ${seriesKey}|${sail}`);
        continue;
      }
      claimCounts.set(key, (claimCounts.get(key) ?? 0) + 1);
      const boats = boatsBySlug.get(identity.slug) ?? new Set<string>();
      for (const c of candidates) {
        if (boats.has(c.boatId) && candidates.length === 1) {
          problems.push(
            `${identity.slug}: claims two people off the same boat (${c.boatId})`,
          );
        }
        boats.add(c.boatId);
      }
      boatsBySlug.set(identity.slug, boats);
      if (candidates.length > 1) {
        const want = tokens(identity.name);
        const resolves = candidates.some(
          (c) => [...tokens(c.name)].filter((t) => want.has(t)).length > 0,
        );
        if (!resolves) {
          problems.push(
            `${identity.slug}: ${seriesKey}|${sail} (${role}) is shared by ` +
              `${candidates.length} rows and none matches the name`,
          );
        }
      }
    }
  }
  // Every person the corpus names must be somebody's, and no slot may be
  // claimed by more identities than it holds people.
  for (const [key, candidates] of rowsByMember) {
    const claims = claimCounts.get(key) ?? 0;
    if (claims === 0) {
      problems.push(`no identity claims ${key} (${candidates[0].name})`);
    } else if (claims > candidates.length) {
      problems.push(
        `${key} names ${candidates.length} ` +
          `${candidates.length === 1 ? 'person' : 'people'} but ${claims} identities claim it`,
      );
    }
  }
  const dupes = identities
    .map((i) => i.slug)
    .filter((s, i, a) => a.indexOf(s) !== i);
  for (const slug of new Set(dupes)) problems.push(`duplicate slug: ${slug}`);

  // Validate before writing. A run that fails must leave the committed
  // manifest exactly as it found it: the previous ordering wrote first and
  // checked after, so a failing re-run overwrote a good golden record with the
  // bad one it was complaining about.
  if (problems.length > 0) {
    for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
    throw new Error(
      `${problems.length} manifest problem(s) — ${OUT} left unchanged, fix before pushing`,
    );
  }

  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        version: MANIFEST_VERSION,
        series: Object.fromEntries(Object.entries(seriesMap).sort()),
        identities,
      },
      null,
      2,
    )}\n`,
  );

  const multi = identities.filter((i) => i.members.length > 1).length;
  const minted = identities.filter((i) => !priorBySlug.has(i.slug)).length;
  const crewRows = rows.filter((r) => r.role === 'crew').length;
  const roleOf = (i: ManifestIdentity) => ({
    helms: i.members.some((m) => (m[2] ?? 'primary') === 'primary'),
    crews: i.members.some((m) => m[2] === 'crew'),
  });
  const crewOnly = identities.filter((i) => {
    const r = roleOf(i);
    return r.crews && !r.helms;
  }).length;
  const both = identities.filter((i) => {
    const r = roleOf(i);
    return r.crews && r.helms;
  }).length;
  console.log(
    `${rows.length} people (${crewRows} crew) -> ${identities.length} identities -> ${OUT}\n` +
      `  ${multi} appear in more than one series, ${identities.length - multi} in one\n` +
      `  ${crewOnly} appear only ever as crew, ${both} both helm and crew\n` +
      `  ${result.clusters.length} raw clusters merged to ${identities.length} ` +
      `(one name, one sailor; ${separate.size} names held apart)\n` +
      `  ${minted} slugs minted, ${identities.length - minted} preserved`,
  );
  // Never silent: a dropped crew mention is a person the archive publishes and
  // the roster won't, so the operator sees exactly which ones and can add a
  // curated spelling if any of them is really identifiable.
  if (droppedCrew.length > 0) {
    const counts = new Map<string, number>();
    for (const n of droppedCrew) counts.set(n, (counts.get(n) ?? 0) + 1);
    const listed = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([n, c]) => (c > 1 ? `${n} (x${c})` : n));
    console.log(
      `  ${droppedCrew.length} crew mentions too vague to name a person: ${listed.join(', ')}`,
    );
  }
  if (report) {
    console.log(`\n  matcher review suggestions (${result.suggestions.length}):`);
    for (const s of result.suggestions) {
      const a = result.clusters[s.a];
      const b = result.clusters[s.b];
      console.log(
        `    ${(a?.label ?? a?.name) || '?'} <-> ${(b?.label ?? b?.name) || '?'}  (${s.reason})`,
      );
    }
  }
}

main();
