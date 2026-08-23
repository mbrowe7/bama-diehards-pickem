import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const checks = [
  ['teams', sb.from('teams').select('id', { count: 'exact', head: true })],
  ['players', sb.from('players').select('id', { count: 'exact', head: true })],
  ['seasons', sb.from('seasons').select('id', { count: 'exact', head: true })],
  ['weeks', sb.from('weeks').select('id', { count: 'exact', head: true })],
  ['games', sb.from('games').select('id', { count: 'exact', head: true })],
  ['picks', sb.from('picks').select('id', { count: 'exact', head: true })],
  ['bonus_picks', sb.from('bonus_picks').select('id', { count: 'exact', head: true })],
  ['preseason_projections', sb.from('preseason_projections').select('id', { count: 'exact', head: true })],
];

for (const [name, promise] of checks) {
  const { count, error } = await promise;
  console.log(name, error ? `ERROR: ${error.message}` : `${count} rows`);
}

console.log('\n2025 standings (pick + bonus points only, no preseason yet):');
const { data: standings, error: sErr } = await sb.from('standings')
  .select('display_name, pick_points, bonus_points, total_points, wins, losses')
  .eq('season_year', 2025)
  .order('total_points', { ascending: false });
if (sErr) console.log('ERROR:', sErr.message);
else console.table(standings);
