/**
 * `pnpm emit-as-published` — emit `as-published.config.json` from the
 * catalogue (ADR-010, sailscoring#283), the input to the app repo's
 * `pnpm archive-generate`.
 *
 * One as-published series per captured Sailwave page that KSC actually
 * published results on; one fleet per summary section on that page. Pages
 * the catalogue marks `superseded` (an earlier upload of a running series)
 * or `placeholder` (an entry list, nothing sailed) are skipped and listed in
 * `as-published-skips.json` with the reason.
 *
 * URLs: the season is the published slug and each event sits under it —
 * `/p/ksc/2025/summer-series`, and `/p/ksc/2023/fireball-420/fireball-fleet`
 * where an event scored several fleets. Slugs are data, minted once here and
 * never derived at ingest; series ids are UUIDv5 over `ksc-archive/series/
 * <key>`, so regeneration updates rows in place and can never mint
 * duplicates. **Never rename an emitted `key`** — it re-mints the id and
 * orphans the ingested series and its identity links.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { seriesIdForKey } from '../../sailscoring/lib/archive-kit/ids';

const CATALOG = 'sources/catalog.json';
const OUT = 'as-published.config.json';
const SKIPS = 'as-published-skips.json';
const CAPTURE_DIR = 'sources/sailwave.com/results/KSC';

const REPO_KEY = 'ksc-archive';
const VENUE_URL = 'https://www.killaloesailingclub.com';

interface CatalogFleet {
  title: string | null;
  entries: number;
  raceColumns: number;
  caption: string | null;
}

interface CatalogPage {
  file: string;
  url: string;
  uploadedAt: string | null;
  year: number | null;
  eventName: string | null;
  venueLine: string | null;
  clubHeading: string | null;
  clubYearPage: string | null;
  fleets: CatalogFleet[];
  raceCount: number;
  status: 'current' | 'superseded' | 'placeholder';
  supersededBy?: string;
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'series'
  );
}

/** Club prefixes several event titles carry ("KSC Summer Series"), longest
 *  first — the series is already filed under the club, so the prefix is noise. */
const CLUB_PREFIXES = [
  'killaloe sailing club',
  'killaloe sailing',
  'killaloe',
  'ksc',
];

/** Drop a leading club name, but only while at least two words survive it:
 *  stripping "Killaloe Sailing" from "Killaloe Sailing Regatta" would leave a
 *  bare "Regatta", and stripping just "Killaloe" would leave the misleading
 *  "Sailing Regatta". Longest prefix decides; if it doesn't fit, none does. */
function stripClubPrefix(name: string): string {
  const lower = name.toLowerCase();
  const prefix = CLUB_PREFIXES.find((p) => lower.startsWith(`${p} `));
  if (!prefix) return name;
  const rest = name.slice(prefix.length).trim();
  return rest.split(/\s+/).length >= 2 ? rest : name;
}

/** The venue, from the Sailwave `<h2>`: "Lough Derg" on almost every page,
 *  "Killaloe Sailing Club" on three. Two pages need help — one gives the
 *  club's website in the venue slot, and one spells the lake "Lough derg". */
function venueOf(page: CatalogPage): string {
  const line = page.venueLine?.trim() ?? '';
  if (!line || /^https?:\/\//i.test(line)) return 'Lough Derg';
  return /^lough\s+derg$/i.test(line) ? 'Lough Derg' : line;
}

/** The display name, preferring KSC's own curated heading from their year
 *  page ("Brass Monkey / Winter Racing Results" -> "Brass Monkey / Winter")
 *  over the Sailwave `<h1>`, which is the same scorer's less-tended wording
 *  and sometimes stale (2026's Warmer Series page still says "2025 Warmer
 *  Series"). The year is appended so a series reads unambiguously on its own.
 */
function displayName(page: CatalogPage): string {
  // A capture filename ending in a small sequence number marks one of a
  // numbered run of events (the 2024 June Sprints). There the filename is the
  // only signal that separates them — the scorer left the `<h1>` of Sprint 2
  // reading "Wk 1" — so it wins over both other sources. One or two digits
  // only: plenty of filenames end in `_2021`, which is a season, not an
  // ordinal.
  const numbered = /_\d{1,2}\.htm$/i.test(page.file);
  const source = numbered
    ? page.file.replace(/\.htm$/i, '')
    : page.clubHeading?.replace(/\s*racing results\s*/i, ' ').trim() ||
      page.eventName?.trim() ||
      'Series';

  const base = stripClubPrefix(
    source
      // A few `<h1>`s are just the filename the scorer saved under
      // ("2024_GP14_Munsters"); underscores also hide the year from the strip
      // below, since `_` is a word character.
      .replace(/_/g, ' ')
      // Several names already carry the year; strip it so the rendered name
      // doesn't read "KSC 2018 Baltic Series 2018".
      .replace(/\s*\b20\d{2}\b\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  // KSC published two scorings of the 2024 GP14 Munsters — a Gold/Silver/
  // Bronze split and a single overall — a minute apart. Both are part of the
  // published record, so both are kept; the suffix keeps them tellable apart
  // instead of colliding into a bare "-2". Which the class considers official
  // is a question for the club (CLARIFICATIONS.md).
  const alternate = /_alternate\b/i.test(page.file) ? ' (alternate scoring)' : '';
  return `${base || 'Series'}${alternate} ${page.year}`;
}

/** The event's slug within its season — the sub-path all its fleet pages
 *  hang off. Derived from the display name so the URL matches what the page
 *  is called, and de-duplicated within the season. */
function eventSlug(page: CatalogPage, taken: Set<string>): string {
  const base = slug(displayName(page).replace(/\s*\b20\d{2}\b\s*$/, ''));
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) candidate = `${base}-${n++}`;
  taken.add(candidate);
  return candidate;
}

interface EmittedFleet {
  name: string;
  subPath: string;
  file: string;
  sectionTitle?: string;
  includeRaces?: boolean;
}

function main(): void {
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8')) as {
    pages: CatalogPage[];
  };

  const current = catalog.pages
    .filter((p) => p.status === 'current')
    .sort(
      (a, b) =>
        (a.year ?? 0) - (b.year ?? 0) ||
        (a.uploadedAt ?? '').localeCompare(b.uploadedAt ?? ''),
    );

  const takenByYear = new Map<number, Set<string>>();
  const seriesKeys = new Set<string>();
  const series = [];

  for (const page of current) {
    if (!page.year) continue;
    const taken = takenByYear.get(page.year) ?? new Set<string>();
    takenByYear.set(page.year, taken);

    const event = eventSlug(page, taken);
    const key = `ksc-${page.year}-${event}`;
    if (seriesKeys.has(key)) throw new Error(`duplicate series key: ${key}`);
    seriesKeys.add(key);

    const multi = page.fleets.length > 1;
    const fleets: EmittedFleet[] = page.fleets.map((fleet, i) => {
      // Sailwave titles a lone section "Overall"; on a multi-fleet page the
      // titles are the real class names ("ILCA 6 / Laser Radial Class").
      const name = fleet.title?.trim() || 'Overall';
      return {
        name,
        subPath: multi ? `${event}/${slug(name)}` : event,
        file: `${CAPTURE_DIR}/${page.file}`,
        // Only disambiguate when there is something to disambiguate; a
        // single-section page needs no title match (and some have none).
        ...(multi || (page.fleets.length === 1 && fleet.title)
          ? { sectionTitle: fleet.title ?? undefined }
          : {}),
        // Carry the per-race detail tables where the page publishes them.
        // Many KSC pages are standings-only — a complete published result,
        // just without the per-race breakdown.
        ...(page.raceCount > 0 ? { includeRaces: true } : {}),
      };
    });

    series.push({
      key,
      id: seriesIdForKey(REPO_KEY, key),
      publishedSlug: String(page.year),
      name: displayName(page),
      venue: venueOf(page),
      venueUrl: VENUE_URL,
      // The club's own archive page for the season, where it is public.
      ...(page.clubYearPage && /^20\d{2}$/.test(page.clubYearPage)
        ? {
            eventUrl: `${VENUE_URL}/${page.clubYearPage}-archived-racing-results/`,
          }
        : {}),
      // No startDate/endDate: the capture states no reliable event dates.
      // See CLARIFICATIONS.md — this is the main metadata gap.
      source: 'sailwave' as const,
      category: String(page.year),
      fleets,
    });
  }

  writeFileSync(
    OUT,
    `${JSON.stringify({ version: 1, out: 'as-published', series }, null, 2)}\n`,
  );

  const skips = catalog.pages
    .filter((p) => p.status !== 'current')
    .map((p) => ({
      file: p.file,
      reason:
        p.status === 'superseded'
          ? `superseded by ${p.supersededBy} — an earlier upload of the same series`
          : 'placeholder — an entry list with no races sailed',
      year: p.year,
      uploadedAt: p.uploadedAt,
    }));
  writeFileSync(SKIPS, `${JSON.stringify({ skipped: skips }, null, 2)}\n`);

  const fleetCount = series.reduce((n, s) => n + s.fleets.length, 0);
  const years = [...new Set(series.map((s) => s.publishedSlug))].sort();
  console.log(
    `${series.length} series / ${fleetCount} fleet pages -> ${OUT}\n` +
      `  seasons ${years[0]}–${years[years.length - 1]} (${years.length})\n` +
      `  ${skips.length} pages skipped -> ${SKIPS}`,
  );
}

main();
