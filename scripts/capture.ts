/**
 * `pnpm capture` — refresh the capture from the two public sources.
 *
 *   pnpm capture              # both sources, skipping files already on disk
 *   pnpm capture --refresh    # re-fetch everything, including existing files
 *   pnpm capture --club       # only the club's year-archive pages
 *   pnpm capture --sailwave   # only the Sailwave results folder
 *
 * Both are small public servers, so this is single-threaded with a delay
 * between requests and never parallelised. Existing files are reused rather
 * than re-fetched unless `--refresh` is passed — most of the corpus is
 * frozen, and only the current season's pages change.
 *
 * Files are written as received (bytes, not re-encoded): the captures are
 * verbatim third-party pages, kept for reproducibility.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DELAY_MS = 750;

const SAILWAVE_INDEX = 'https://www.sailwave.com/results/KSC/';
const SAILWAVE_DIR = 'sources/sailwave.com/results/KSC';
const LISTING = join(SAILWAVE_DIR, '_folder-listing.html');

const CLUB_DIR = 'sources/killaloesailingclub.com';
/** The club's per-season archive pages, linked from
 *  `/members-area/racing-results/`. 2018–2023 are members-only and capture as
 *  the gate page; they are kept so the gate is evidenced, not assumed. */
const CLUB_PAGES = [
  '2026-archived-racing-results',
  '2025-archived-racing-results',
  '2024-archived-results',
  '2023-archived-racing-results',
  '2022-archived-racing-results',
  '2021-archived-racing-results',
  '2019-2020-archived-racing-results',
  '2018-archived-racing-results',
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchTo(url: string, path: string, refresh: boolean): Promise<boolean> {
  if (!refresh && existsSync(path)) return false;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  ! ${res.status} ${url}`);
    return false;
  }
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  await sleep(DELAY_MS);
  return true;
}

async function captureSailwave(refresh: boolean): Promise<void> {
  mkdirSync(SAILWAVE_DIR, { recursive: true });
  console.log(`Sailwave: ${SAILWAVE_INDEX}`);
  // The folder listing is always re-fetched — it is how new results are
  // discovered, and it carries the upload timestamps the catalogue uses.
  await fetchTo(SAILWAVE_INDEX, LISTING, true);

  const html = readFileSync(LISTING, 'utf8');
  const files = [
    ...new Set(
      [...html.matchAll(/href="[^"]*\/results\/KSC\/([^"/]+\.htm)"/gi)].map(
        (m) => m[1],
      ),
    ),
  ].sort();

  let fetched = 0;
  for (const file of files) {
    if (await fetchTo(`${SAILWAVE_INDEX}${file}`, join(SAILWAVE_DIR, file), refresh)) {
      fetched++;
      console.log(`  + ${file}`);
    }
  }
  console.log(`  ${files.length} listed, ${fetched} fetched`);
}

async function captureClub(refresh: boolean): Promise<void> {
  mkdirSync(CLUB_DIR, { recursive: true });
  console.log('Club year-archive pages');
  let fetched = 0;
  for (const page of CLUB_PAGES) {
    const url = `https://www.killaloesailingclub.com/${page}/`;
    if (await fetchTo(url, join(CLUB_DIR, `${page}.html`), refresh)) {
      fetched++;
      console.log(`  + ${page}`);
    }
  }
  console.log(`  ${CLUB_PAGES.length} listed, ${fetched} fetched`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const refresh = args.includes('--refresh');
  const only = args.find((a) => a === '--club' || a === '--sailwave');

  if (only !== '--club') await captureSailwave(refresh);
  if (only !== '--sailwave') await captureClub(refresh);
  console.log('\nNext: pnpm catalog && pnpm emit-as-published');
}

void main();
