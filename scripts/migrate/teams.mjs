// Canonical team list + alias resolution for the Excel migration.
// Must stay in sync with supabase/seed.sql -- this is the source of truth
// the migration script matches free text against.

export const CANONICAL_TEAMS = [
  'Boston College', 'California', 'Clemson', 'Duke', 'Florida State',
  'Georgia Tech', 'Louisville', 'Miami', 'NC State', 'North Carolina',
  'Pittsburgh', 'SMU', 'Stanford', 'Syracuse', 'Virginia',
  'Virginia Tech', 'Wake Forest',
  'Illinois', 'Indiana', 'Iowa', 'Maryland', 'Michigan',
  'Michigan State', 'Minnesota', 'Nebraska', 'Northwestern', 'Ohio State',
  'Oregon', 'Penn State', 'Purdue', 'Rutgers', 'UCLA',
  'USC', 'Washington', 'Wisconsin',
  'Arizona', 'Arizona State', 'Baylor', 'BYU', 'Cincinnati',
  'Colorado', 'Houston', 'Iowa State', 'Kansas', 'Kansas State',
  'Oklahoma State', 'TCU', 'Texas Tech', 'UCF', 'Utah', 'West Virginia',
  'Alabama', 'Arkansas', 'Auburn', 'Florida', 'Georgia',
  'Kentucky', 'LSU', 'Mississippi State', 'Missouri', 'Oklahoma',
  'Ole Miss', 'South Carolina', 'Tennessee', 'Texas', 'Texas A&M', 'Vanderbilt',
  'Notre Dame', 'UConn', 'UMass',
  'Army', 'Charlotte', 'East Carolina', 'Florida Atlantic', 'Memphis',
  'Navy', 'North Texas', 'Rice', 'South Florida', 'Temple',
  'Tulane', 'Tulsa', 'UAB', 'UTSA',
  'Delaware', 'FIU', 'Jacksonville State', 'Kennesaw State', 'Liberty',
  'Louisiana Tech', 'Middle Tennessee', 'Missouri State', 'New Mexico State',
  'Sam Houston', 'UTEP', 'Western Kentucky',
  'Akron', 'Ball State', 'Bowling Green', 'Buffalo', 'Central Michigan',
  'Eastern Michigan', 'Kent State', 'Miami (OH)', 'Northern Illinois',
  'Ohio', 'Toledo', 'Western Michigan',
  'Air Force', 'Boise State', 'Colorado State', 'Fresno State', "Hawai'i",
  'Nevada', 'New Mexico', 'San Diego State', 'San Jose State', 'UNLV',
  'Utah State', 'Wyoming',
  'Oregon State', 'Washington State',
  'Appalachian State', 'Arkansas State', 'Coastal Carolina', 'Georgia Southern',
  'Georgia State', 'James Madison', 'Louisiana', 'Louisiana-Monroe', 'Marshall',
  'Old Dominion', 'South Alabama', 'Southern Miss', 'Texas State', 'Troy',
  'Montana State', 'North Dakota State', 'Sacramento State',
  'Eastern Illinois', 'Mercer',
];

// name (lowercased, normalized) -> canonical name. Extend as review.csv
// surfaces new abbreviations/misspellings from later seasons.
export const ALIASES = {
  bama: 'Alabama',
  uga: 'Georgia',
  nd: 'Notre Dame',
  'notre dame': 'Notre Dame',
  osu: 'Ohio State', // ambiguous with Oklahoma State in theory; not seen in this data
  'ohio st': 'Ohio State',
  iu: 'Indiana',
  scar: 'South Carolina',
  vandy: 'Vanderbilt',
  cal: 'California',
  unc: 'North Carolina',
  wvu: 'West Virginia',
  usf: 'South Florida',
  ucf: 'UCF',
  gt: 'Georgia Tech',
  'georgia tech': 'Georgia Tech',
  jmu: 'James Madison',
  fsu: 'Florida State',
  lsu: 'LSU',
  tcu: 'TCU',
  byu: 'BYU',
  smu: 'SMU',
  uab: 'UAB',
  utsa: 'UTSA',
  utep: 'UTEP',
  unlv: 'UNLV',
  hawaii: "Hawai'i",
  "hawai'i": "Hawai'i",
  'kansas state': 'Kansas State',
  'kansas st': 'Kansas State',
  'boise st': 'Boise State',
  'ohio state': 'Ohio State',
  'iowa state': 'Iowa State',
  'iowa st': 'Iowa State',
  'georgia southern': 'Georgia Southern',
  'georgia state': 'Georgia State',
  'texas a&m': 'Texas A&M',
  tamu: 'Texas A&M',
  'ole miss': 'Ole Miss',
  miss: 'Ole Miss',
  'mississippi state': 'Mississippi State',
  'miss state': 'Mississippi State',
  'miss st': 'Mississippi State',
  'nc state': 'NC State',
  'north carolina state': 'NC State',
  'missouri state': 'Missouri State',
  mizzou: 'Missouri',
  // common typos observed in the source data
  'celmson': 'Clemson',
  'tenessee': 'Tennessee',
  'notee dame': 'Notre Dame',
  'illionis': 'Illinois',
  'montana state': 'Montana State',
  'montana st': 'Montana State',
  // more abbreviations found while migrating 2024/2025 data. Note "ut" and
  // "usc" are genuinely nationally ambiguous (Texas/Tennessee, Southern
  // Cal/South Carolina) -- these entries reflect how *this* group actually
  // used them across every instance found, not a universal convention.
  psu: 'Penn State',
  'penn st': 'Penn State',
  pitt: 'Pittsburgh',
  ou: 'Oklahoma',
  'ok state': 'Oklahoma State',
  'ok st': 'Oklahoma State',
  'oklahoma st': 'Oklahoma State',
  'a&m': 'Texas A&M',
  wazzu: 'Washington State',
  ndsu: 'North Dakota State',
  vt: 'Virginia Tech',
  'va tech': 'Virginia Tech',
  tenn: 'Tennessee',
  ut: 'Tennessee',
  'app state': 'Appalachian State',
  wisco: 'Wisconsin',
  wisc: 'Wisconsin',
  wku: 'Western Kentucky',
  ulm: 'Louisiana-Monroe',
  uk: 'Kentucky',
  'k state': 'Kansas State',
  'ms st': 'Mississippi State',
  cocks: 'South Carolina',
  boise: 'Boise State',
  bc: 'Boston College',
  'ga tech': 'Georgia Tech',
  'arizona st': 'Arizona State',
  'oregon st': 'Oregon State',
  cincy: 'Cincinnati',
};

function normalize(s) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // drop parenthetical spread/site text if present
    .replace(/[.'’]/g, '') // straight and curly apostrophes both
    .replace(/\s+/g, ' ')
    .trim();
}

const CANONICAL_BY_NORM = new Map(CANONICAL_TEAMS.map((t) => [normalize(t), t]));

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// Strips a leading/trailing spread token like "-6.5", "+13.5", "(-6.5)", or a
// bare trailing number with no sign ("Bama 13.5"), leaving just the team name.
export function stripSpreadToken(raw) {
  return raw
    .replace(/\(\s*[+-]?\s*\d+(\.\d+)?\s*\)/g, '')
    .replace(/[+-]?\s*\d+(\.\d+)?\s*$/g, '')
    .trim();
}

// Short tokens (<=4 normalized chars, e.g. "MSU", "USC", "PSU", "LSU") are
// too collision-prone for edit-distance fuzzy matching -- a single-letter
// swap between two entirely different schools' codes still looks "close".
// These are resolved via exact/alias lookup only; anything else short and
// unresolved falls through to the caller's per-game context matching.
const MIN_LENGTH_FOR_FUZZY = 5;

/**
 * Resolve free text to a canonical team name using only global information
 * (no knowledge of which game this text appeared in).
 * Returns { team, confidence: 'exact'|'alias'|'fuzzy', distance? } or null.
 */
export function resolveTeam(raw) {
  if (!raw) return null;
  const cleanedRaw = stripSpreadToken(raw);
  const norm = normalize(cleanedRaw);
  if (!norm) return null;

  if (CANONICAL_BY_NORM.has(norm)) {
    return { team: CANONICAL_BY_NORM.get(norm), confidence: 'exact' };
  }
  if (ALIASES[norm]) {
    return { team: ALIASES[norm], confidence: 'alias' };
  }

  if (norm.length < MIN_LENGTH_FOR_FUZZY) return null;

  // fuzzy: smallest edit distance relative to string length
  let best = null;
  for (const [candNorm, candName] of CANONICAL_BY_NORM.entries()) {
    const dist = levenshtein(norm, candNorm);
    const threshold = Math.max(1, Math.floor(candNorm.length * 0.2));
    if (dist <= threshold && (!best || dist < best.dist)) {
      best = { dist, name: candName };
    }
  }
  if (best) {
    return { team: best.name, confidence: 'fuzzy', distance: best.dist };
  }
  return null;
}

// Plausible short-form tokens for a canonical team name, used only to check
// "does this text refer to team X *given that X is already known to be one
// of the two teams in this specific game*" -- never for open-ended global
// matching, since e.g. "MSU" and "USC" each plausibly abbreviate two
// different real schools nationally.
function abbreviationCandidates(name) {
  const words = name.split(/\s+/).filter((w) => w.toLowerCase() !== 'of' && w !== '&');
  const candidates = new Set([name]);
  candidates.add(words[words.length - 1]); // e.g. "Tech", "State"
  const initials = words.map((w) => w[0]).join('');
  candidates.add(initials);
  candidates.add(`U${initials}`); // e.g. South Carolina -> USC
  if (words.length >= 2 && /^state$/i.test(words[words.length - 1])) {
    candidates.add(`${words[0][0]}SU`); // Michigan State -> MSU
    candidates.add(`${words[0][0]}ST`); // Michigan State -> MST-ish / "M St"
  }
  return [...candidates].map((c) => normalize(c));
}

/**
 * Resolve free text against the two known teams in a specific game. Use this
 * as a fallback when resolveTeam() fails or returns a team that isn't
 * actually one of `favorite`/`underdog` -- context narrows otherwise-
 * ambiguous national abbreviations (MSU, USC, ASU, "Tech") down to the one
 * school that's actually playing.
 */
export function resolveTeamInGame(raw, favorite, underdog) {
  if (!raw) return null;
  const norm = normalize(stripSpreadToken(raw));
  if (!norm) return null;

  const favMatch = favorite && abbreviationCandidates(favorite).includes(norm);
  const dogMatch = underdog && abbreviationCandidates(underdog).includes(norm);
  if (favMatch && !dogMatch) return favorite;
  if (dogMatch && !favMatch) return underdog;
  return null; // no match, or matched both (shouldn't happen) -- don't guess
}
