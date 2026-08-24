import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { PillGroup } from '../components/PillGroup';
import type { Database } from '../types/database';

type Season = Database['public']['Tables']['seasons']['Row'];
type FinalStandingsRow = Database['public']['Tables']['season_final_standings']['Row'];

type Row = {
  player_id: string;
  display_name: string;
  total_points: number;
  wins: number;
  losses: number;
  ties: number;
  pick_points: number | null;
  bonus_points: number | null;
  preseason_points: number | null;
};

function record(row: Row) {
  return `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}`;
}

export function History() {
  const { player } = useAuth();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [hasBreakdown, setHasBreakdown] = useState(true);
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
      .from('season_final_standings')
      .select('*, players(display_name)')
      .eq('season_id', seasonId)
      .order('rank', { ascending: true })
      .then(({ data }) => {
        const finalRows = (data ?? []) as (FinalStandingsRow & { players: { display_name: string } | null })[];
        if (finalRows.length) {
          setHasBreakdown(false);
          setRows(
            finalRows.map((r) => ({
              player_id: r.player_id,
              display_name: r.players?.display_name ?? '',
              total_points: r.total_points,
              wins: r.wins,
              losses: r.losses,
              ties: r.ties,
              pick_points: null,
              bonus_points: null,
              preseason_points: null,
            })),
          );
          setLoading(false);
          return;
        }

        supabase
          .from('standings')
          .select('*')
          .eq('season_id', seasonId)
          .order('total_points', { ascending: false })
          .then(({ data: liveRows }) => {
            setHasBreakdown(true);
            setRows(liveRows ?? []);
            setLoading(false);
          });
      });
  }, [seasonId]);

  const selectedSeason = seasons.find((s) => s.id === seasonId);

  return (
    <div className="page page-wide">
      <div className="page-head">
        <h1>History</h1>
        <PillGroup
          items={seasons.map((s) => ({ id: s.id, label: String(s.year) }))}
          activeId={seasonId ?? ''}
          onSelect={setSeasonId}
        />
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <div className="desktop-rows">
            <div className="history-grid-head">
              <span></span>
              <span>Player</span>
              <span>Points</span>
              <span>Record</span>
              {hasBreakdown && (
                <>
                  <span>Pick</span>
                  <span>Bonus</span>
                  <span>Preseason</span>
                </>
              )}
            </div>
            {rows.map((row, i) => (
              <div className="history-grid-row" key={row.player_id}>
                <span className="history-rank">{i + 1}</span>
                <span className={`history-name ${row.player_id === player?.id ? 'history-name-self' : ''}`}>{row.display_name}</span>
                <span className="history-points">{row.total_points}</span>
                <span className="history-num">{record(row)}</span>
                {hasBreakdown && (
                  <>
                    <span className="history-num">{row.pick_points}</span>
                    <span className="history-num">{row.bonus_points}</span>
                    <span className="history-num">{row.preseason_points}</span>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="mobile-cards">
            {rows.map((row, i) => (
              <div className="phone-history-card" key={row.player_id}>
                <div className="phone-history-top">
                  <span className="history-rank">{i + 1}</span>
                  <span className={`history-name ${row.player_id === player?.id ? 'history-name-self' : ''}`}>{row.display_name}</span>
                  <span className="history-record">{record(row)}</span>
                  <span className="history-points">{row.total_points}</span>
                </div>
                {hasBreakdown && (
                  <div className="phone-history-bottom">
                    <span>pick {row.pick_points}</span>
                    <span>bonus {row.bonus_points}</span>
                    <span>pre {row.preseason_points}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {!loading && rows.length === 0 && <p className="hint">No standings for {selectedSeason?.year ?? 'this season'} yet.</p>}
    </div>
  );
}
