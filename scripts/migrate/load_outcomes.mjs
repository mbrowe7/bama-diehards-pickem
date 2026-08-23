// One-off: populate season_outcomes for 2024 and 2025 with the actual
// real-world results, researched via web search (see conversation). Safe to
// re-run (upserts on season_id+category+slot).
//
// Usage: node --env-file=../../.env load_outcomes.mjs

import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const OUTCOMES = {
  2024: {
    acc_champ: ['Clemson'],
    big10_champ: ['Oregon'],
    big12_champ: ['Arizona State'],
    sec_champ: ['Georgia'],
    g5_rep: ['Boise State'],
    at_large: ['Texas', 'Penn State', 'Notre Dame', 'Indiana', 'SMU', 'Ohio State', 'Tennessee'],
    national_champion: ['Ohio State'],
  },
  2025: {
    acc_champ: ['Duke'],
    big10_champ: ['Indiana'],
    big12_champ: ['Texas Tech'],
    sec_champ: ['Georgia'],
    // Two Group of 5 champs both made the CFP field this year (Duke, the
    // actual ACC champ, ranked below both) -- crediting either as correct.
    g5_rep: ['Tulane', 'James Madison'],
    at_large: ['Ohio State', 'Oregon', 'Ole Miss', 'Texas A&M', 'Oklahoma', 'Alabama', 'Miami'],
    national_champion: ['Indiana'],
  },
};

const HEISMAN = {
  2024: { finalists: ['Travis Hunter', 'Ashton Jeanty', 'Dillon Gabriel', 'Cam Ward'], winner: 'Travis Hunter' },
  2025: { finalists: ['Jeremiyah Love', 'Fernando Mendoza', 'Diego Pavia', 'Julian Sayin'], winner: 'Fernando Mendoza' },
};

const { data: teamRows, error: teamErr } = await sb.from('teams').select('id, name');
if (teamErr) throw teamErr;
const teamIdByName = new Map(teamRows.map((t) => [t.name, t.id]));

for (const [yearStr, categories] of Object.entries(OUTCOMES)) {
  const year = Number(yearStr);
  const { data: seasonRow, error: seasonErr } = await sb.from('seasons').select('id').eq('year', year).single();
  if (seasonErr) throw seasonErr;
  const seasonId = seasonRow.id;

  const rows = [];
  for (const [category, teamNames] of Object.entries(categories)) {
    teamNames.forEach((name, i) => {
      const teamId = teamIdByName.get(name);
      if (!teamId) { console.warn(`Unknown team "${name}" for ${year} ${category}`); return; }
      rows.push({ season_id: seasonId, category, slot: i + 1, team_id: teamId });
    });
  }
  HEISMAN[year].finalists.forEach((name, i) => {
    rows.push({ season_id: seasonId, category: 'heisman_finalist', slot: i + 1, player_name: name });
  });
  rows.push({ season_id: seasonId, category: 'heisman_winner', slot: 1, player_name: HEISMAN[year].winner });

  const { error: delErr } = await sb.from('season_outcomes').delete().eq('season_id', seasonId);
  if (delErr) throw delErr;
  const { error: insErr } = await sb.from('season_outcomes').insert(rows);
  if (insErr) throw insErr;
  console.log(`${year}: inserted ${rows.length} outcome rows`);
}
