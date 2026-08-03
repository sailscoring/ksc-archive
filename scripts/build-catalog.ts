/**
 * `pnpm catalog` — build `sources/catalog.json` from the capture.
 *
 * The catalogue is this archive's normalised deliverable: one entry per
 * captured Sailwave page, joining everything two independent published
 * sources say about it.
 *
 *  1. The **Sailwave page itself** — its `<title>`, `<h1>` (event name),
 *     `<h2>` (venue), the summary section titles (the fleets), the race
 *     titles, and the entry count. Present for every page.
 *
 *  2. The **club's year-archive page** on killaloesailingclub.com — the
 *     heading KSC published each result under ("Brass Monkey / Winter Racing
 *     Results"), joined to the page by the `<iframe>` it embeds. Present only
 *     for 2024–2026; earlier years are members-only (see CLARIFICATIONS.md).
 *
 * Nothing is inferred beyond what those sources state, and every derived
 * field records which signal produced it. See CLARIFICATIONS.md for the two
 * judgement calls the corpus forces (season year, and which upload of a
 * re-published series is current).
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { decodeCapture } from '../../sailscoring/lib/archive-kit/capture-encoding';
import { parseSailwaveHtml } from '../../sailscoring/lib/archive-kit/sailwave-html';

const CAPTURE_DIR = 'sources/sailwave.com/results/KSC';
const FOLDER_LISTING = join(CAPTURE_DIR, '_folder-listing.html');
const CLUB_DIR = 'sources/killaloesailingclub.com';
const OUT = 'sources/catalog.json';

/** The corpus KSC actually published; a filename year outside it is a typo,
 *  not a season (`2004_Summer_Super_Series.htm` — see CLARIFICATIONS.md). */
const FIRST_SEASON = 2018;
const LAST_SEASON = 2026;

/** Sailwave's results folder is served case-insensitively, and the club's
 *  pages link with inconsistent case (`/results/KSC/` vs `/results/ksc/`) and
 *  the occasional doubled slash. Compare on this normalised form only. */
function normaliseFilename(raw: string): string {
  return raw.trim().replace(/\\/g, '/').split('/').pop()!.toLowerCase();
}

/** Sailwave publishes ISO-8859-1, and 34 of the 88 KSC pages carry high-bit
 *  bytes — accented Irish given names. Decoding is the app's job
 *  (`decodeCapture`), the same reader `archive-generate` uses, so the
 *  catalogue can never disagree with what gets ingested. */
function readCapture(path: string): { text: string; encoding: string } {
  return decodeCapture(readFileSync(path));
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Upload timestamps from the Sailwave folder listing — the only publication
 *  date the source states. */
function readUploadTimes(): Map<string, string> {
  const html = readFileSync(FOLDER_LISTING, 'utf8');
  const times = new Map<string, string>();
  const re =
    /(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\s*<a[^>]+href="[^"]*\/results\/KSC\/([^"]+)"/gi;
  for (const m of html.matchAll(re)) {
    times.set(normaliseFilename(m[3]), `${m[1]}T${m[2]}Z`);
  }
  return times;
}

interface ClubEntry {
  year: number;
  yearLabel: string;
  heading: string;
  page: string;
  href: string;
}

/** KSC's curated heading → Sailwave file join, read from the captured
 *  year-archive pages: each result sits in an accordion panel — a heading,
 *  then an `<iframe>` whose (lazy) src is the Sailwave page. */
function readClubHeadings(): ClubEntry[] {
  const entries: ClubEntry[] = [];
  for (const file of readdirSync(CLUB_DIR).sort()) {
    if (!file.endsWith('.html')) continue;
    const yearLabel = basename(file).replace(/-arch.*$/, '');
    const html = readFileSync(join(CLUB_DIR, file), 'utf8');
    const re =
      /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>|data-lazy-src="(https:\/\/www\.sailwave\.com\/results\/[^"]+)"/gi;
    let heading: string | null = null;
    for (const m of html.matchAll(re)) {
      if (m[1] !== undefined) {
        const text = stripTags(m[1]);
        if (text) heading = text;
      } else if (m[2] && heading) {
        entries.push({
          // "2019-2020" pages label a two-season group; the first year is the
          // page's own, and such pages are gated anyway (no headings parsed).
          year: Number(yearLabel.slice(0, 4)),
          yearLabel,
          heading,
          page: normaliseFilename(m[2]),
          href: m[2],
        });
        heading = null;
      }
    }
  }
  return entries;
}

type YearSource = 'club-page' | 'filename' | 'document-title';

interface CatalogEntry {
  file: string;
  url: string;
  uploadedAt: string | null;
  encoding: string;
  /** Resolved season. See `yearSource` / `yearCandidates` for the working. */
  year: number | null;
  yearSource: YearSource | null;
  yearCandidates: {
    club: number | null;
    filename: number | null;
    /** Sailwave's event-year global, off the end of `<title>`. Unreliable on
     *  back-filled seasons: every 2018–2021 page says 2022, the year the
     *  scorer re-published them. */
    documentTitle: number | null;
    /** Where the `<h1>` states one. */
    heading: number | null;
  };
  documentTitle: string | null;
  /** The Sailwave `<h1>` / `<h2>`, verbatim. */
  eventName: string | null;
  venueLine: string | null;
  /** KSC's own heading for this result, where published openly. */
  clubHeading: string | null;
  clubYearPage: string | null;
  /** Summary section titles = the fleets. `"Overall"` on a single-fleet page.
   *  `raceColumns` is how many races the standings table scores. */
  fleets: Array<{
    title: string | null;
    entries: number;
    raceColumns: number;
    caption: string | null;
  }>;
  /** Per-race *detail* tables. Independent of `raceColumns`: several pages
   *  publish standings only, which is a complete published result, not a
   *  stub — the emit step just has no detail tables to carry. */
  raceCount: number;
  raceTitles: string[];
  /** `current` — the upload to ingest. `superseded` — an earlier upload of
   *  the same series (KSC re-publishes in progress under variant filenames),
   *  or a second presentation of a result captured elsewhere.
   *  `placeholder` — an entry-list stub with no racing yet. */
  status: 'current' | 'superseded' | 'placeholder';
  supersededBy?: string;
  /** Why, when it is not the ordinary earlier-upload case. */
  supersededNote?: string;
  /** Set when another captured file is byte-identical. */
  duplicateOf?: string;
}

/** Pages the club has told us are a second *presentation* of a result
 *  captured elsewhere, rather than a result of their own.
 *
 *  The 2024 GP14 Munsters was published twice, a minute apart: split Gold /
 *  Silver / Bronze, and as a single overall standing. The club confirms both
 *  are the same racing and the same scores, published in both formats at the
 *  GP14 class's request so sailors could see themselves against their fleet
 *  and against the whole entry (#4). Two series is the wrong shape for that —
 *  the season index lists the regatta twice, and every GP14 competitor lands
 *  in the identity spine twice off one event. The fleet split is kept, being
 *  the finer-grained of the two; carrying both properly is a publishing
 *  feature, filed as sailscoring#363.
 *
 *  Curated because the automatic pass below cannot see it: that groups by
 *  filename, and `_alternate` is a different key. */
const CONFIRMED_DUPLICATES: Record<string, { of: string; note: string }> = {
  '2024_GP14_Munsters_alternate.htm': {
    of: '2024_GP14_Munsters.htm',
    note: 'a second presentation of the same result, one overall standing rather than the Gold/Silver/Bronze split, confirmed by the club (#4)',
  },
};

function yearIn(text: string | null | undefined, tail = false): number | null {
  if (!text) return null;
  const m = tail ? /(20\d{2})\s*$/.exec(text) : /(20\d{2})/.exec(text);
  return m ? Number(m[1]) : null;
}

/** Series identity for supersession grouping: the filename with the year,
 *  any `wk<n>` progress suffix, and separators stripped. Deliberately *not*
 *  the club heading — only some pages have one, and a mixed key source
 *  splits the very groups this exists to find (the 2024 Summer Super Series
 *  has a heading; its earlier upload, misnamed `2004_…`, does not). */
function seriesKey(entry: CatalogEntry): string {
  return entry.file
    .toLowerCase()
    .replace(/\.htm$/, '')
    .replace(/(^|_)20\d{2}(_|$)/g, '_')
    .replace(/_wk\d+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function main(): void {
  const uploads = readUploadTimes();
  const clubEntries = readClubHeadings();
  const clubByPage = new Map(clubEntries.map((e) => [e.page, e]));

  const files = readdirSync(CAPTURE_DIR)
    .filter((f) => f.endsWith('.htm'))
    .sort();

  const seenContent = new Map<string, string>();
  const entries: CatalogEntry[] = [];

  for (const file of files) {
    const { text, encoding } = readCapture(join(CAPTURE_DIR, file));
    const page = parseSailwaveHtml(text);
    const key = normaliseFilename(file);
    const club = clubByPage.get(key) ?? null;

    const documentTitle =
      stripTags(/<title>([\s\S]*?)<\/title>/i.exec(text)?.[1] ?? '') || null;

    const candidates = {
      club: club?.year ?? null,
      filename: yearIn(file),
      documentTitle: yearIn(documentTitle, true),
      heading: yearIn(page.title),
    };

    // Precedence, in order of demonstrated reliability on this corpus:
    //   1. the club's own year page — authoritative where published;
    //   2. the filename — right everywhere except one transposition typo,
    //      which this rejects by falling outside the published seasons;
    //   3. Sailwave's event-year global, which is the *re-publish* year on
    //      every back-filled 2018–2021 page and so is the last resort.
    let year: number | null = null;
    let yearSource: YearSource | null = null;
    if (candidates.club) {
      year = candidates.club;
      yearSource = 'club-page';
    } else if (
      candidates.filename &&
      candidates.filename >= FIRST_SEASON &&
      candidates.filename <= LAST_SEASON
    ) {
      year = candidates.filename;
      yearSource = 'filename';
    } else if (candidates.documentTitle) {
      year = candidates.documentTitle;
      yearSource = 'document-title';
    }

    const entry: CatalogEntry = {
      file,
      url: `https://www.sailwave.com/results/KSC/${file}`,
      uploadedAt: uploads.get(key) ?? null,
      encoding,
      year,
      yearSource,
      yearCandidates: candidates,
      documentTitle,
      eventName: page.title,
      venueLine: page.subtitle,
      clubHeading: club?.heading ?? null,
      clubYearPage: club?.yearLabel ?? null,
      fleets: page.summaries.map((s) => ({
        title: s.title,
        entries: s.rows.length,
        raceColumns: s.raceHeaders.length,
        caption: s.caption,
      })),
      raceCount: page.races.length,
      raceTitles: page.races.map((r) => r.title),
      status: 'current',
    };

    const prior = seenContent.get(text);
    if (prior) entry.duplicateOf = prior;
    else seenContent.set(text, file);

    entries.push(entry);
  }

  // A page whose standings score no races is a stub the scorer uploaded at
  // season start (an entry list, "Sailed: 0"): nothing published to archive
  // yet. Judged on the standings' race columns, never on the presence of
  // per-race detail tables — several genuine results publish standings only.
  for (const e of entries) {
    if (e.fleets.every((f) => f.raceColumns === 0)) e.status = 'placeholder';
  }

  // KSC re-uploads a running series under variant filenames as it progresses
  // (`Summer_Series_wk7/8/9`, `2022_September_Series` then
  // `September_Series_2022`). The last upload is the published record; the
  // rest are kept as provenance but not ingested.
  const groups = new Map<string, CatalogEntry[]>();
  for (const e of entries) {
    if (e.status === 'placeholder' || !e.year) continue;
    const k = `${e.year}/${seriesKey(e)}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const winner = [...group].sort(
      (a, b) =>
        b.raceCount - a.raceCount ||
        (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''),
    )[0];
    for (const e of group) {
      if (e === winner) continue;
      e.status = 'superseded';
      e.supersededBy = winner.file;
    }
  }

  // A club-confirmed second presentation. Applied last: an answer from the
  // club outranks anything the filenames imply.
  for (const e of entries) {
    const duplicate = CONFIRMED_DUPLICATES[e.file];
    if (!duplicate) continue;
    e.status = 'superseded';
    e.supersededBy = duplicate.of;
    e.supersededNote = duplicate.note;
  }

  const unmatched = clubEntries.filter(
    (e) => !files.some((f) => normaliseFilename(f) === e.page),
  );

  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        source: {
          sailwave: 'https://www.sailwave.com/results/KSC/',
          club: 'https://www.killaloesailingclub.com/members-area/racing-results/',
        },
        pages: entries,
        /** Club headings whose Sailwave page is not in the capture. */
        unmatchedClubHeadings: unmatched,
      },
      null,
      2,
    )}\n`,
  );

  const count = (s: CatalogEntry['status']) =>
    entries.filter((e) => e.status === s).length;
  console.log(
    `${entries.length} pages -> ${OUT}\n` +
      `  ${count('current')} current, ${count('superseded')} superseded, ` +
      `${count('placeholder')} placeholder\n` +
      `  ${entries.filter((e) => e.clubHeading).length} with a club heading\n` +
      `  ${entries.filter((e) => e.encoding !== 'utf-8').length} not UTF-8\n` +
      `  ${entries.filter((e) => !e.year).length} with no resolvable year, ` +
      `${unmatched.length} club headings with no captured page`,
  );
  for (const e of entries.filter((x) => x.status !== 'current')) {
    console.log(
      `  ${e.status}: ${e.file}${e.supersededBy ? ` -> ${e.supersededBy}` : ''}`,
    );
  }
}

main();
