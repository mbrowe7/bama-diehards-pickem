// Loads parsed.json (from parse.mjs) into a live Supabase project using the
// service role key (bypasses RLS). Idempotent: re-running it replaces each
// season's games/picks/bonus_picks/preseason_projections from scratch rather
// than appending duplicates.
//
// Requires env vars SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service
// role, never the anon key -- this script needs to bypass RLS and create
// auth users). Requires scripts/migrate/players-map.json (see
// players-map.example.json) with every player's real email filled in.
//
// Usage: node scripts/migrate/load.mjs [parsedDir]

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parsedDir = process.argv[2] || path.join(process.cwd(), 'migration-output');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.');
  process.exit(1);
}

const mapPath = path.join(__dirname, 'players-map.json');
if (!existsSync(mapPath)) {
  console.error(`Missing ${mapPath}. Copy players-map.example.json to players-map.json and fill in real emails.`);
  process.exit(1);
}
const playersMap = JSON.parse(readFileSync(mapPath, 'utf8'));
delete playersMap._comment;
for (const [name, email] of Object.entries(playersMap)) {
  if (!email) {
    console.error(`players-map.json is missing an email for "${name}".`);
    process.exit(1);
  }
}

const parsed = JSON.parse(readFileSync(path.join(parsedDir, 'parsed.json'), 'utf8'));
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const DEFAULT_SCORING_RULES = {
  correct_pick: 2,
  correct_bonus: 3,
  correct_conf_champ: 10,
  correct_at_large: 7,
  correct_heisman_finalist: 7,
  correct_heisman_winner: 18,
  correct_national_champ: 20,
};

// The source sheet never recorded actual kickoff times, only which
// season/week a game belonged to. Since these are historical (already-
// played) games, the exact timestamp doesn't matter functionally -- it just
// needs to be in the past so the picks-lock RLS policy treats them as
// closed. This gives each week a plausible real-world date.
function approximateKickoff(year, sortOrder) {
  const week0 = new Date(Date.UTC(year, 7, 23)); // ~Aug 23, typical Week 0
  if (sortOrder >= 9999) { // Bowls/Playoffs
    return new Date(Date.UTC(year + 1, 0, 1));
  }
  const d = new Date(week0);
  d.setUTCDate(d.getUTCDate() + sortOrder * 7);
  return d.toISOString();
}

async function ensurePlayer(name) {
  const email = playersMap[name];
  const { data: existing, error: listErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  let user = existing.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    user = data.user;
    console.log(`Created auth user for ${name} <${email}>`);
  }
  const { error: upsertErr } = await sb.from('players')
    .update({ display_name: name })
    .eq('id', user.id);
  if (upsertErr) throw upsertErr;
  return user.id;
}

async function main() {
  console.log('Provisioning players...');
  const playerIds = {}; // name -> uuid
  for (const name of Object.keys(playersMap)) {
    playerIds[name] = await ensurePlayer(name);
  }

  const { data: teamRows, error: teamErr } = await sb.from('teams').select('id, name');
  if (teamErr) throw teamErr;
  const teamIdByName = new Map(teamRows.map((t) => [t.name, t.id]));

  let skippedPicks = 0, skippedProjections = 0;

  for (const season of parsed.seasons) {
    console.log(`\n=== Season ${season.year} ===`);

    const { data: seasonRow, error: seasonErr } = await sb.from('seasons')
      .upsert({ year: season.year }, { onConflict: 'year' })
      .select('id').single();
    if (seasonErr) throw seasonErr;
    const seasonId = seasonRow.id;

    const rulesPayload = Object.entries(DEFAULT_SCORING_RULES)
      .map(([rule_key, points]) => ({ season_id: seasonId, rule_key, points }));
    const { error: rulesErr } = await sb.from('scoring_rules')
      .upsert(rulesPayload, { onConflict: 'season_id,rule_key' });
    if (rulesErr) throw rulesErr;

    // Full-replace this season's migrated data so re-running is idempotent.
    const { data: existingWeeks } = await sb.from('weeks').select('id').eq('season_id', seasonId);
    const weekIds = existingWeeks?.map((w) => w.id) ?? [];
    if (weekIds.length) {
      await sb.from('bonus_picks').delete().in('week_id', weekIds);
      const { data: existingGames } = await sb.from('games').select('id').in('week_id', weekIds);
      if (existingGames?.length) {
        await sb.from('picks').delete().in('game_id', existingGames.map((g) => g.id));
        await sb.from('games').delete().in('id', existingGames.map((g) => g.id));
      }
    }
    await sb.from('preseason_projections').delete().eq('season_id', seasonId);

    for (const week of season.weeks) {
      const { data: weekRow, error: weekErr } = await sb.from('weeks')
        .upsert({ season_id: seasonId, label: week.label, sort_order: week.sortOrder },
          { onConflict: 'season_id,label' })
        .select('id').single();
      if (weekErr) throw weekErr;
      const weekId = weekRow.id;
      const kickoff = approximateKickoff(season.year, week.sortOrder);

      for (const game of week.games) {
        const favId = teamIdByName.get(game.favorite);
        const dogId = teamIdByName.get(game.underdog);
        if (!favId || !dogId) {
          console.warn(`Skipping unresolvable game "${game.rawDescription}" (${season.year} ${week.label})`);
          continue;
        }
        const { data: gameRow, error: gameErr } = await sb.from('games').insert({
          week_id: weekId,
          favorite_team_id: favId,
          underdog_team_id: dogId,
          spread: game.spread,
          neutral_site: game.neutralSite,
          kickoff_at: kickoff,
        }).select('id').single();
        if (gameErr) throw gameErr;

        const pickRows = [];
        for (const pick of game.picks) {
          if (!pick.team) { skippedPicks++; continue; }
          const playerId = playerIds[pick.player];
          pickRows.push({
            game_id: gameRow.id,
            player_id: playerId,
            team_id: teamIdByName.get(pick.team),
            submitted_by: playerId,
            outcome: pick.isCorrect === null ? null : pick.isCorrect ? 'win' : 'loss',
          });
        }
        if (pickRows.length) {
          const { error: pickErr } = await sb.from('picks').insert(pickRows);
          if (pickErr) throw pickErr;
        }
      }

      const bonusRows = week.bonusPicks.map((bp) => ({
        week_id: weekId,
        player_id: playerIds[bp.player],
        description: bp.description,
        submitted_by: playerIds[bp.player],
        is_correct: bp.isCorrect,
      }));
      if (bonusRows.length) {
        const { error: bonusErr } = await sb.from('bonus_picks').insert(bonusRows);
        if (bonusErr) throw bonusErr;
      }

      console.log(`  ${week.label}: ${week.games.length} games, ${week.bonusPicks.length} bonus picks`);
    }

    const week0Kickoff = approximateKickoff(season.year, 0);
    const projectionRows = [];
    for (const proj of season.preseasonProjections) {
      if ((proj.team && !teamIdByName.get(proj.team)) ) { skippedProjections++; continue; }
      projectionRows.push({
        season_id: seasonId,
        player_id: playerIds[proj.player],
        category: proj.category,
        slot: proj.slot,
        team_id: proj.team ? teamIdByName.get(proj.team) : null,
        player_name: proj.playerName ?? null,
        locked_at: week0Kickoff,
      });
    }
    if (projectionRows.length) {
      const { error: projErr } = await sb.from('preseason_projections').insert(projectionRows);
      if (projErr) throw projErr;
    }
    console.log(`  ${projectionRows.length} preseason projections loaded`);
  }

  console.log(`\nDone. Skipped ${skippedPicks} unresolved picks, ${skippedProjections} unresolved preseason projections (see review.csv).`);
  console.log('season_outcomes (actual conference champs / Heisman / national champion per season) still needs to be entered manually before preseason points show up in standings.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
