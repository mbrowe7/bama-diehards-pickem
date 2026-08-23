import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

type Season = Database['public']['Tables']['seasons']['Row'];
type StandingsRow = Database['public']['Views']['standings']['Row'];

export function History() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [rows, setRows] = useState<StandingsRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('seasons').select('*').order('year', { ascending: false }).then(({ data }) => {
      const list = data ?? [];
      setSeasons(list);
      if (list.length) setSeasonId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!seasonId) return;
    setLoading(true);
    supabase
      .from('standings')
      .select('*')
      .eq('season_id', seasonId)
      .order('total_points', { ascending: false })
      .then(({ data }) => {
        setRows(data ?? []);
        setLoading(false);
      });
  }, [seasonId]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>History</h1>
        <select value={seasonId ?? ''} onChange={(e) => setSeasonId(e.target.value)}>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>{s.year}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="standings-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Points</th>
              <th>Record</th>
              <th>Pick pts</th>
              <th>Bonus pts</th>
              <th>Preseason pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.player_id}>
                <td>{i + 1}</td>
                <td>{row.display_name}</td>
                <td>{row.total_points}</td>
                <td>{row.wins}-{row.losses}{row.ties ? `-${row.ties}` : ''}</td>
                <td>{row.pick_points}</td>
                <td>{row.bonus_points}</td>
                <td>{row.preseason_points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
