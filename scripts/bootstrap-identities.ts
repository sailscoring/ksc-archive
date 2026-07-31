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

interface Row {
  seriesKey: string;
  seriesId: string;
  /** Unique per row — `(seriesKey, sail)` is not, since KSC shares hulls. */
  rowId: string;
  sail: string;
  name: string;
  club: string | null;
  year: number | null;
}

interface ManifestIdentity {
  slug: string;
  name: string;
  club?: string;
  members: Array<[string, string]>;
  note?: string;
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

function loadRows(): Row[] {
  if (!existsSync(DOCS_DIR)) {
    throw new Error(
      `${DOCS_DIR} not found — run \`pnpm archive-generate\` in ${APP_DIR} first`,
    );
  }
  const rows: Row[] = [];
  for (const file of readdirSync(DOCS_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const doc = JSON.parse(readFileSync(join(DOCS_DIR, file), 'utf8'));
    const seriesKey = file.replace(/\.json$/, '');
    const year = Number.parseInt(doc.series.publishedSlug ?? '', 10);
    doc.competitors.forEach((c: Record<string, unknown>, i: number) => {
      const sail = String(c.sailNumber ?? '');
      rows.push({
        seriesKey,
        seriesId: doc.series.id,
        rowId: `${seriesKey}#${i}`,
        sail,
        name: String(c.name ?? ''),
        club: (c.club as string) ?? null,
        year: Number.isFinite(year) ? year : null,
      });
    });
  }
  return rows;
}

interface ClusterResult {
  clusters: Array<{ label?: string; name?: string; competitorIds: string[] }>;
  suggestions: Array<{ a: number; b: number; reason: string }>;
  stats: Record<string, unknown>;
}

/** Cluster through the app's matcher rather than a fork of it. `raceYear`
 *  normally comes from `series.start_date`; this corpus states no dates
 *  (CLARIFICATIONS §6), so the season the archive does know stands in. */
function cluster(rows: Row[]): ClusterResult {
  const input = rows.map((r) => ({
    competitorId: r.rowId,
    name: r.name,
    sailNumber: r.sail,
    club: r.club ?? undefined,
    age: null,
    raceYear: r.year,
    existingIdentityId: null,
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
  const rows = loadRows();
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
  const slugByMember = new Map<string, string>();
  const priorBySlug = new Map<string, ManifestIdentity>();
  for (const identity of existing.identities ?? []) {
    priorBySlug.set(identity.slug, identity);
    for (const [seriesKey, sail] of identity.members) {
      slugByMember.set(`${seriesKey}|${sail}`, identity.slug);
    }
  }

  const identities: ManifestIdentity[] = [];
  for (const [groupKey, group] of [...groups.entries()].sort()) {
    const members = [
      ...new Set(
        group.rowIds.map((id) => {
          const r = byRowId.get(id)!;
          return `${r.seriesKey}|${r.sail}`;
        }),
      ),
    ].sort();

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

    const priorSlug = members.map((m) => slugByMember.get(m)).find(Boolean);
    const prior = priorSlug ? priorBySlug.get(priorSlug) : undefined;
    const slug =
      priorSlug ?? mintSlug(name, members.join('|'), takenSlugs);

    identities.push({
      slug,
      // A name already curated in the manifest is never overwritten by the
      // commonest spelling — hand corrections outrank the count.
      name: prior?.name ?? name,
      ...(prior?.club ?? club ? { club: prior?.club ?? club } : {}),
      members: members.map((m) => {
        const at = m.lastIndexOf('|');
        return [m.slice(0, at), m.slice(at + 1)] as [string, string];
      }),
      ...(noteFor.get(groupKey) ? { note: noteFor.get(groupKey) } : {}),
    });
  }
  identities.sort((a, b) => a.slug.localeCompare(b.slug));

  const seriesMap: Record<string, string> = {};
  for (const r of rows) seriesMap[r.seriesKey] = r.seriesId;

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

  // The apply resolves each member by `(series-slug, sail)`, disambiguating a
  // sail two rows share by name tokens. Check that here rather than discover it
  // as `unresolvedMembers` after a production push: a golden record that
  // silently loses rows isn't a golden record.
  const rowsByMember = new Map<string, string[]>();
  for (const r of rows) {
    const key = `${r.seriesKey}|${r.sail}`;
    rowsByMember.set(key, [...(rowsByMember.get(key) ?? []), r.name]);
  }
  const tokens = (n: string) =>
    new Set(nameKey(n).split(' ').filter((t) => t.length >= 2));
  const problems: string[] = [];
  const claimed = new Set<string>();
  for (const identity of identities) {
    for (const [seriesKey, sail] of identity.members) {
      const key = `${seriesKey}|${sail}`;
      const candidates = rowsByMember.get(key);
      if (!candidates) {
        problems.push(`${identity.slug}: no row for ${key}`);
        continue;
      }
      claimed.add(key);
      if (candidates.length > 1) {
        const want = tokens(identity.name);
        const resolves = candidates.some(
          (c) => [...tokens(c)].filter((t) => want.has(t)).length > 0,
        );
        if (!resolves) {
          problems.push(
            `${identity.slug}: ${key} is shared by ${candidates.length} rows and none matches the name`,
          );
        }
      }
    }
  }
  for (const key of rowsByMember.keys()) {
    if (!claimed.has(key)) problems.push(`no identity claims ${key}`);
  }
  const dupes = identities
    .map((i) => i.slug)
    .filter((s, i, a) => a.indexOf(s) !== i);
  for (const slug of new Set(dupes)) problems.push(`duplicate slug: ${slug}`);

  if (problems.length > 0) {
    for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
    throw new Error(
      `${problems.length} manifest problem(s) — not written cleanly, fix before pushing`,
    );
  }

  const multi = identities.filter((i) => i.members.length > 1).length;
  const minted = identities.filter((i) => !priorBySlug.has(i.slug)).length;
  console.log(
    `${rows.length} rows -> ${identities.length} identities -> ${OUT}\n` +
      `  ${multi} appear in more than one series, ${identities.length - multi} in one\n` +
      `  ${result.clusters.length} raw clusters merged to ${identities.length} ` +
      `(one name, one sailor; ${separate.size} names held apart)\n` +
      `  ${minted} slugs minted, ${identities.length - minted} preserved`,
  );
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
