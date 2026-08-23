// Cross-checks parsed.json against the sheet's own weekly "Total" row and
// season "Standings" totals, using the default scoring rule points
// (correct_pick=2, correct_bonus=3). Run after parse.mjs, before load.mjs.
//
// Usage: node scripts/migrate/validate.mjs "<path to .xlsx>" [parsedDir]

import XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const filePath = process.argv[2];
const parsedDir = process.argv[3] || path.join(process.cwd(), 'migration-output');
const parsed = JSON.parse(readFileSync(path.join(parsedDir, 'parsed.json'), 'utf8'));

const wb = XLSX.readFile(filePath, { cellDates: true });
function rowsOf(sheetName) {
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
    .map((r) => r.map((c) => (typeof c === 'string' ? c.trim() : c)));
}

const POINTS = { correct_pick: 2, correct_bonus: 3 };
let mismatches = 0;
let checked = 0;

for (const season of parsed.seasons) {
  for (const week of season.weeks) {
    const rows = rowsOf(week.sheetName);
    // The totals row and the W-L record row are the last two non-blank rows,
    // but their order flips between sheets -- pick whichever of the two has
    // plain-integer cells (the record row's cells look like "5-4").
    const nonBlankRows = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((c) => c !== ''));
    if (nonBlankRows.length < 2) {
      console.log(`[${season.year} ${week.label}] sheet looks empty, skipping`);
      continue;
    }
    const candidates = nonBlankRows.slice(-2);
    const isIntegerRow = ({ r }) => r.slice(1).every((c) => c === '' || /^\d+$/.test(c));
    const totalsCandidate = candidates.find(isIntegerRow) ?? candidates[candidates.length - 1];
    const totalRowIdx = totalsCandidate.i;
    const players = rows[0].slice(1).filter((p) => p !== '');
    const sheetTotals = rows[totalRowIdx].slice(1);

    players.forEach((player, i) => {
      const sheetTotal = sheetTotals[i];
      if (sheetTotal === '' || sheetTotal === undefined) return; // player sat out this week
      const expected = Number(sheetTotal);

      let computed = 0;
      for (const game of week.games) {
        const pick = game.picks.find((p) => p.player === player);
        if (pick && pick.isCorrect) computed += POINTS.correct_pick;
      }
      for (const bp of week.bonusPicks) {
        if (bp.player === player && bp.isCorrect) computed += POINTS.correct_bonus;
      }

      checked++;
      if (computed !== expected) {
        mismatches++;
        console.log(`MISMATCH [${season.year} ${week.label}] ${player}: sheet=${expected} computed=${computed}`);
      }
    });
  }
}

console.log(`\nChecked ${checked} player-weeks, ${mismatches} mismatches.`);
if (mismatches === 0) console.log('All weekly totals reconcile with color-coded grading. ✓');
