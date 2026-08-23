import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useCurrentSeason } from '../hooks/useCurrentSeason';
import type { Database } from '../types/database';

type StandingsRow = Database['public']['Views']['standings']['Row'];
type PickOutcome = Database['public']['Tables']['picks']['Row']['outcome'];

function record(row: StandingsRow) {
  return `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}`;
}

function split(row: StandingsRow) {
  return `${row.pick_points} pick · ${row.bonus_points} bonus · ${row.preseason_points} preseason`;
}

function formSquareClass(outcome: PickOutcome) {
  if (outcome === 'win') return 'form-square form-good';
  if (outcome === 'push') return 'form-square form-push';
  return 'form-square';
}

export function Standings() {
  const { season } = useCurrentSeason();
  const [rows, setRows] = useState<StandingsRow[]>([]);
  const [form, setForm] = useState<Record<string, PickOutcome[]>>({});
  const [throughWeek, setThroughWeek] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Form squares: each player's last five graded picks, oldest -> newest.
  useEffect(() => {
    if (!season) return;
    let cancelled = false;
    (async () => {
      const { data: weekRows } = await supabase.from('weeks').select('id, label, sort_order').eq('season_id', season.id);
      const weekIds = (weekRows ?? []).map((w) => w.id);
      if (!weekIds.length) { if (!cancelled) { setForm({}); setThroughWeek(null); } return; }
      const { data: gameRows } = await supabase.from('games').select('id, week_id, kickoff_at, result').in('week_id', weekIds);
      const gameIds = (gameRows ?? []).map((g) => g.id);
      const kickoffByGame = new Map((gameRows ?? []).map((g) => [g.id, g.kickoff_at]));

      const gradedWeeks = (weekRows ?? []).filter((w) =>
        (gameRows ?? []).some((g) => g.week_id === w.id && g.result !== null),
      );
      const latestGraded = gradedWeeks.sort((a, b) => b.sort_order - a.sort_order)[0];
      if (!cancelled) setThroughWeek(latestGraded?.label ?? null);

      if (!gameIds.length) { if (!cancelled) setForm({}); return; }
      const { data: pickRows } = await supabase
        .from('picks')
        .select('player_id, game_id, outcome')
        .in('game_id', gameIds)
        .not('outcome', 'is', null);
      if (cancelled) return;
      const byPlayer = new Map<string, { outcome: PickOutcome; kickoff: string }[]>();
      for (const p of pickRows ?? []) {
        if (!p.outcome) continue;
        const list = byPlayer.get(p.player_id) ?? [];
        list.push({ outcome: p.outcome, kickoff: kickoffByGame.get(p.game_id) ?? '' });
        byPlayer.set(p.player_id, list);
      }
      const formMap: Record<string, PickOutcome[]> = {};
      for (const [playerId, list] of byPlayer) {
        list.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
        formMap[playerId] = list.slice(-5).map((x) => x.outcome);
      }
      setForm(formMap);
    })();
    return () => { cancelled = true; };
  }, [season]);

  const leaderPoints = useMemo(() => rows[0]?.total_points ?? 0, [rows]);

  if (!season) return <p>Loading...</p>;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Standings</h1>
        <span className="page-status-mono">{season.year}{throughWeek ? ` · through ${throughWeek}` : ''}</span>
      </div>
      <div className="page-subhead">Form shows the last five picks, newest right.</div>

      {loading ? (
        <p>Loading standings...</p>
      ) : (
        <>
          <div className="desktop-rows">
            {rows.map((row, i) => {
              const barWidth = leaderPoints ? Math.max(0, (row.total_points / leaderPoints) * 100) : 0;
              const rowForm = form[row.player_id] ?? [];
              return (
                <div className="standings-row" key={row.player_id}>
                  <span className="standings-rank">{i + 1}</span>
                  <div className="standings-mid">
                    <div className="standings-name-row">
                      <span className="standings-name">{row.display_name}</span>
                      <span className="standings-split">{split(row)}</span>
                    </div>
                    <div className="bar-track">
                      <div className={`bar-fill ${i === 0 ? 'bar-fill-leader' : ''}`} style={{ width: `${barWidth}%` }} />
                    </div>
                  </div>
                  <div className="form-squares">
                    {rowForm.map((outcome, idx) => (
                      <span key={idx} className={formSquareClass(outcome)} />
                    ))}
                  </div>
                  <div className="standings-points-col">
                    <span className="standings-points">{row.total_points}</span>
                    <span className="standings-record">{record(row)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mobile-cards">
            {rows.map((row, i) => {
              const barWidth = leaderPoints ? Math.max(0, (row.total_points / leaderPoints) * 100) : 0;
              const rowForm = form[row.player_id] ?? [];
              return (
                <div className={`phone-standings-card ${i === 0 ? 'phone-standings-leader' : ''}`} key={row.player_id}>
                  <div className="phone-standings-top">
                    <span className="standings-rank">{i + 1}</span>
                    <span className="standings-name">{row.display_name}</span>
                    <div className="form-squares">
                      {rowForm.map((outcome, idx) => (
                        <span key={idx} className={formSquareClass(outcome)} />
                      ))}
                    </div>
                    <span className="phone-standings-points">{row.total_points}</span>
                  </div>
                  <div className="phone-standings-bottom">
                    <div className="bar-track">
                      <div className={`bar-fill ${i === 0 ? 'bar-fill-leader' : ''}`} style={{ width: `${barWidth}%` }} />
                    </div>
                    <span className="standings-record">{record(row)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
