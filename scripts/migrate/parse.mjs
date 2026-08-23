// Parses the historical "Bama Diehards Pick Em.xlsx" workbook into a
// structured JSON dump, without touching any database. Run this first and
// review the output + review.csv before running load.mjs.
//
// Usage: node scripts/migrate/parse.mjs "<path to .xlsx>" [outDir]

import XLSX from 'xlsx';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { resolveTeam, resolveTeamInGame, stripSpreadToken } from './teams.mjs';

// Connector must be whitespace-delimited -- otherwise "at" matches inside
// team names like "State" or "Atlanta".
const GAME_LINE_RE =
  /^(?<team1>.+?)\s*(?:\(\s*(?<sign1p>[+-])\s*(?<num1p>\d+(?:\.\d+)?)\s*\)|(?<sign1b>[+-])\s*(?<num1b>\d+(?:\.\d+)?))?\s+(?<connector>vs\.?|at)\s+(?<team2>.+?)(?:\s*\(\s*(?<site>[^)]+?)\s*\))?$/i;

const filePath = process.argv[2];
const outDir = process.argv[3] || path.join(process.cwd(), 'migration-output');
if (!filePath) {
  console.error('Usage: node parse.mjs <path-to-xlsx> [outDir]');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const wb = XLSX.readFile(filePath, { cellDates: true, cellStyles: true });
const reviewRows = []; // { season, sheet, row, field, raw, reason }

// The sheet color-codes each pick green/red for correct/incorrect (confirmed
// by cross-checking against the weekly point totals) -- that's the ground
// truth for is_correct, since the sheet never recorded actual final scores.
// Different weeks/seasons used different light/dark shades of the same two
// colors (verified by inspecting every distinct fill color in the workbook).
const CORRECT_FILLS = new Set(['B6D7A8', 'D9EAD3', '93C47D', '6AA84F']);
const INCORRECT_FILLS = new Set(['EA9999', 'F4CCCC', 'E06666', 'CC0000']);
function fillToIsCorrect(color) {
  if (CORRECT_FILLS.has(color)) return true;
  if (INCORRECT_FILLS.has(color)) return false;
  return null; // no fill / unrecognized color (e.g. the rare yellow push marker) -> ungraded
}

// Returns a grid of { value, color } cells (color = fill rgb hex or null).
function rowsOf(sheetName) {
  const ws = wb.Sheets[sheetName];
  const ref = XLSX.utils.decode_range(ws['!ref']);
  const rows = [];
  for (let r = ref.s.r; r <= ref.e.r; r++) {
    const row = [];
    for (let c = ref.s.c; c <= ref.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      let value = '';
      if (cell) {
        value = cell.w !== undefined ? cell.w : (cell.v ?? '');
        if (typeof value === 'string') value = value.trim();
      }
      row.push({ value, color: cell?.s?.fgColor?.rgb ?? null });
    }
    rows.push(row);
  }
  return rows;
}

// Day-of-week annotations like "(Thurs.)" or "(Sunday)" show up as an extra
// trailing paren alongside (or instead of) a real neutral-site paren -- strip
// them before parsing so they're never mistaken for the site.
const DAY_OF_WEEK_PAREN_RE =
  /\s*\((?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\.?\)/gi;

function parseGameLine(rawIn) {
  const raw = rawIn.replace(DAY_OF_WEEK_PAREN_RE, '');
  const m = GAME_LINE_RE.exec(raw.trim());
  if (!m) return null;
  const g = m.groups;
  const sign = g.sign1p || g.sign1b;
  const num = g.num1p || g.num1b;

  let favoriteRaw, underdogRaw, spread;
  if (sign === '-') {
    favoriteRaw = g.team1; underdogRaw = g.team2; spread = Number(num);
  } else if (sign === '+') {
    favoriteRaw = g.team2; underdogRaw = g.team1; spread = Number(num);
  } else {
    favoriteRaw = g.team1; underdogRaw = g.team2; spread = 0;
  }
  return {
    favoriteRaw: favoriteRaw.trim(),
    underdogRaw: underdogRaw.trim(),
    spread,
    neutralSite: g.site ? g.site.trim() : null,
  };
}

function resolveOrFlag(raw, ctx) {
  const resolved = resolveTeam(raw);
  if (!resolved || resolved.confidence === 'fuzzy') {
    reviewRows.push({
      ...ctx,
      raw,
      resolvedGuess: resolved ? resolved.team : '',
      confidence: resolved ? `fuzzy(dist=${resolved.distance})` : 'no_match',
    });
  }
  return resolved ? resolved.team : null;
}

// ---------------------------------------------------------------------------
// Walk sheets in workbook order, tracking which season we're in via the
// "Standings (YYYY)" marker sheets. Bare "Week N" sheets (2024) belong to
// whatever season section we're currently in.
// ---------------------------------------------------------------------------
const seasons = {}; // year -> { weeks: [...], postseasonAwards: sheetName|null }
let currentYear = null;

for (const sheetName of wb.SheetNames) {
  const standingsMatch = /^Standings \((\d{4})\)$/.exec(sheetName);
  if (standingsMatch) {
    currentYear = Number(standingsMatch[1]);
    seasons[currentYear] = seasons[currentYear] || { weeks: [], postseasonAwards: null };
    continue;
  }
  if (currentYear === null) continue; // skip anything before the first Standings marker

  if (/^PostseasonAwards/.test(sheetName)) {
    seasons[currentYear].postseasonAwards = sheetName;
    continue;
  }
  if (/^Week \d+/.test(sheetName) || /^Bowls/.test(sheetName)) {
    seasons[currentYear].weeks.push(sheetName);
  }
}

const output = { seasons: [] };

for (const [yearStr, info] of Object.entries(seasons)) {
  const year = Number(yearStr);
  const seasonOut = { year, weeks: [], preseasonProjections: [] };

  info.weeks.forEach((sheetName, weekIdx) => {
    const isBowls = /^Bowls/.test(sheetName);
    const weekNumMatch = /^Week (\d+)/.exec(sheetName);
    const label = isBowls ? 'Bowls/Playoffs' : `Week ${weekNumMatch[1]}`;
    const sortOrder = isBowls ? 9999 : Number(weekNumMatch[1]);

    const rows = rowsOf(sheetName);
    const players = rows[0].slice(1).map((c) => c.value).filter((p) => p !== '');
    const weekOut = { sheetName, label, sortOrder, games: [], bonusPicks: [] };

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const desc = row[0].value;
      if (desc === '' ) continue;
      if (/^total$/i.test(desc)) break; // record/total rows end the game list
      if (/^\d+-\d+$/.test(desc)) continue; // stray record-looking cell

      if (desc === 'BONUS') {
        players.forEach((player, i) => {
          const cell = row[i + 1];
          if (cell && cell.value !== '') {
            weekOut.bonusPicks.push({
              player, description: cell.value, isCorrect: fillToIsCorrect(cell.color),
            });
          }
        });
        continue;
      }

      const parsed = parseGameLine(desc);
      const ctx = { season: year, sheet: sheetName, row: r + 1 };
      if (!parsed) {
        reviewRows.push({ ...ctx, raw: desc, resolvedGuess: '', confidence: 'unparseable_game_line' });
        continue;
      }
      const favorite = resolveOrFlag(parsed.favoriteRaw, { ...ctx, field: 'favorite' });
      const underdog = resolveOrFlag(parsed.underdogRaw, { ...ctx, field: 'underdog' });

      const gameOut = {
        rawDescription: desc,
        favorite, underdog,
        spread: parsed.spread,
        neutralSite: parsed.neutralSite,
        picks: [],
      };

      players.forEach((player, i) => {
        const cell = row[i + 1];
        if (!cell || cell.value === '') return;
        const cellText = cell.value;
        const teamRaw = stripSpreadToken(cellText);
        const resolved = resolveTeam(teamRaw);
        let teamName = resolved ? resolved.team : null;
        const inGame = teamName === favorite || teamName === underdog;

        if (!resolved || !inGame) {
          // Global resolution failed or landed on a team not in this game
          // (e.g. "USC" globally means Southern Cal, but here South Carolina
          // is playing) -- try resolving against this game's two known teams.
          const contextTeam = resolveTeamInGame(cellText, favorite, underdog);
          if (contextTeam) {
            reviewRows.push({
              ...ctx, field: `pick:${player}`, raw: cellText,
              resolvedGuess: contextTeam,
              confidence: !resolved ? 'context_match' : 'context_match_overrode_global',
            });
            teamName = contextTeam;
          } else {
            reviewRows.push({
              ...ctx, field: `pick:${player}`, raw: cellText,
              resolvedGuess: teamName || '',
              confidence: !resolved ? 'no_match' : 'resolved_but_not_in_game',
            });
            teamName = null; // don't store a guess we don't trust
          }
        } else if (resolved.confidence === 'fuzzy') {
          reviewRows.push({
            ...ctx, field: `pick:${player}`, raw: cellText,
            resolvedGuess: teamName, confidence: `fuzzy(dist=${resolved.distance})`,
          });
        }
        gameOut.picks.push({
          player, teamRaw: cellText, team: teamName, isCorrect: fillToIsCorrect(cell.color),
        });
      });

      weekOut.games.push(gameOut);
    }

    seasonOut.weeks.push(weekOut);
  });

  // PostseasonAwards -> preseason_projections
  if (info.postseasonAwards) {
    const rows = rowsOf(info.postseasonAwards);
    const players = rows[0].slice(1).map((c) => c.value).filter((p) => p !== '');
    const categoryMap = {
      'ACC Champ': 'acc_champ',
      'Big 10 Champ': 'big10_champ',
      'Big 12 Champ': 'big12_champ',
      'SEC Champ': 'sec_champ',
      'G5 Rep': 'g5_rep',
      '7 At Large Bids': 'at_large',
      'National Champion': 'national_champion',
      'Three Heisman finalists': 'heisman_finalist',
      'Heisman Winner': 'heisman_winner',
    };
    for (let r = 1; r < rows.length; r++) {
      const label = rows[r][0].value;
      const category = categoryMap[label];
      if (!category) continue;
      players.forEach((player, i) => {
        const cell = rows[r][i + 1].value;
        if (!cell || cell === '') return;
        const ctx = { season: year, sheet: info.postseasonAwards, row: r + 1, field: `${category}:${player}` };

        if (category === 'heisman_finalist' || category === 'heisman_winner') {
          const names = category === 'heisman_finalist' ? cell.split(',').map((s) => s.trim()) : [cell.trim()];
          names.forEach((name, slot) => {
            seasonOut.preseasonProjections.push({ player, category, slot: slot + 1, playerName: name });
          });
        } else if (category === 'at_large') {
          cell.split(',').map((s) => s.trim()).forEach((teamRaw, slot) => {
            const team = resolveOrFlag(teamRaw, { ...ctx, field: `at_large:${player}:${slot + 1}` });
            seasonOut.preseasonProjections.push({ player, category, slot: slot + 1, team });
          });
        } else {
          const team = resolveOrFlag(cell, ctx);
          seasonOut.preseasonProjections.push({ player, category, slot: 1, team });
        }
      });
    }
  }

  output.seasons.push(seasonOut);
}

writeFileSync(path.join(outDir, 'parsed.json'), JSON.stringify(output, null, 2));

if (reviewRows.length) {
  const header = 'season,sheet,row,field,raw,resolvedGuess,confidence';
  const csvLines = [header, ...reviewRows.map((r) =>
    [r.season, r.sheet, r.row, r.field ?? '', JSON.stringify(r.raw ?? ''), r.resolvedGuess ?? '', r.confidence]
      .join(','))];
  writeFileSync(path.join(outDir, 'review.csv'), csvLines.join('\n'));
}

console.log(`Parsed ${output.seasons.length} season(s).`);
for (const s of output.seasons) {
  const gameCount = s.weeks.reduce((n, w) => n + w.games.length, 0);
  const pickCount = s.weeks.reduce((n, w) => n + w.games.reduce((m, g) => m + g.picks.length, 0), 0);
  const bonusCount = s.weeks.reduce((n, w) => n + w.bonusPicks.length, 0);
  console.log(`  ${s.year}: ${s.weeks.length} weeks, ${gameCount} games, ${pickCount} picks, ${bonusCount} bonus picks, ${s.preseasonProjections.length} preseason projections`);
}
console.log(`Rows needing manual review: ${reviewRows.length}`);
console.log(`Output written to ${outDir}/parsed.json${reviewRows.length ? ` and ${outDir}/review.csv` : ''}`);
