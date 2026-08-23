import { Fragment, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useCurrentSeason } from '../hooks/useCurrentSeason';
import type { Database } from '../types/database';

type StandingsRow = Database['public']['Views']['standings']['Row'];

export function Standings() {
  const { season } = useCurrentSeason();
  const [rows, setRows] = useState<StandingsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!season) return;
    setLoading(true);
    supabase
      .from('standings')
      .select('*')
      .eq('season_id', season.id)
      .order('total_points', { ascending: false })
      .then(({ data }) => {
        setRows(data ?? []);
        setLoading(false);
      });
  }, [season]);

  if (!season) return <p>Loading...</p>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Standings — {season.year}</h1>
      </div>
      {loading ? (
        <p>Loading standings...</p>
      ) : (
        <table className="standings-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Points</th>
              <th>Record</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <Fragment key={row.player_id}>
                <tr
                  className="standings-row"
                  onClick={() => setExpanded(expanded === row.player_id ? null : row.player_id)}
                >
                  <td>{i + 1}</td>
                  <td>{row.display_name}</td>
                  <td>{row.total_points}</td>
                  <td>{row.wins}-{row.losses}{row.ties ? `-${row.ties}` : ''}</td>
                </tr>
                {expanded === row.player_id && (
                  <tr className="standings-detail-row">
                    <td colSpan={4}>
                      <div className="standings-detail">
                        <span>Pick points: <strong>{row.pick_points}</strong></span>
                        <span>Bonus points: <strong>{row.bonus_points}</strong></span>
                        <span>Preseason points: <strong>{row.preseason_points}</strong></span>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
