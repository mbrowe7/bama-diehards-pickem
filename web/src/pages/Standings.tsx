import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useCurrentSeason } from '../hooks/useCurrentSeason';
import { PillGroup } from '../components/PillGroup';
import type { Database } from '../types/database';

type SeasonRow = Database['public']['Views']['standings']['Row'];
type WeekRow = Database['public']['Views']['weekly_standings']['Row'];
type Week = Database['public']['Tables']['weeks']['Row'];
type PickOutcome = Database['public']['Tables']['picks']['Row']['outcome'];
type Mode = 'season' | 'week';

interface DisplayRow {
  player_id: string;
  display_name: string;
  total_points: number;
  wins: number;
  losses: number;
  ties: number;
  split: string;
}

function record(row: DisplayRow) {
  return `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}`;
}

function formSquareClass(outcome: PickOutcome) {
  if (outcome === 'win') return 'form-square form-good';
  if (outcome === 'push') return 'form-square form-push';
  return 'form-square';
}

function fromSeasonRow(row: SeasonRow): DisplayRow {
  return {
    player_id: row.player_id,
    display_name: row.display_name,
    total_points: row.total_points,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    split: `${row.pick_points} pick · ${row.bonus_points} bonus · ${row.preseason_points} preseason`,
  };
}

function fromWeekRow(row: WeekRow): DisplayRow {
  return {
    player_id: row.player_id,
    display_name: row.display_name,
    total_points: row.total_points,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    split: `${row.pick_points} pick · ${row.bonus_points} bonus`,
  };
}

export function Standings() {
  const { season } = useCurrentSeason();
  const [mode, setMode] = useState<Mode>('season');

  const [seasonRows, setSeasonRows] = useState<SeasonRow[]>([]);
  const [seasonLoading, setSeasonLoading] = useState(true);
  const [throughWeek, setThroughWeek] = useState<string | null>(null);

  const [weeks, setWeeks] = useState<Week[]>([]);
  const [currentWeekId, setCurrentWeekId] = useState<string | null>(null);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [weekRows, setWeekRows] = useState<WeekRow[]>([]);
  const [weekLoading, setWeekLoading] = useState(true);

  const [form, setForm] = useState<Record<string, PickOutcome[]>>({});

  useEffect(() => {
    if (!season) return;
    setSeasonLoading(true);
    supabase
      .from('standings')
      .select('*')
      .eq('season_id', season.id)
      .order('total_points', { ascending: false })
      .then(({ data }) => {
        setSeasonRows(data ?? []);
        setSeasonLoading(false);
      });
  }, [season]);

  // Load weeks for the season, default-select the most "current" one.
  useEffect(() => {
    if (!season) return;
    supabase
      .from('weeks')
      .select('*')
      .eq('season_id', season.id)
      .order('sort_order')
      .then(({ data }) => setWeeks(data ?? []));
  }, [season]);

  useEffect(() => {
    if (!weeks.length) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('games')
        .select('week_id, kickoff_at')
        .in('week_id', weeks.map((w) => w.id));
      if (cancelled || !data) return;
      const now = Date.now();
      const upcomingWeekIds = new Set(
        data.filter((g) => new Date(g.kickoff_at).getTime() > now).map((g) => g.week_id),
      );
      const current = weeks.find((w) => upcomingWeekIds.has(w.id));
      const currentId = current ? current.id : weeks[weeks.length - 1].id;
      setCurrentWeekId(currentId);
      setSelectedWeekId((prev) => prev ?? currentId);
    })();
    return () => { cancelled = true; };
  }, [weeks]);

  useEffect(() => {
    if (!selectedWeekId) return;
    setWeekLoading(true);
    supabase
      .from('weekly_standings')
      .select('*')
      .eq('week_id', selectedWeekId)
      .order('total_points', { ascending: false })
      .then(({ data }) => {
        setWeekRows(data ?? []);
        setWeekLoading(false);
      });
  }, [selectedWeekId]);

  // Form squares: each player's last five graded picks (within the current
  // scope -- the whole season, or just the selected week), oldest -> newest.
  useEffect(() => {
    if (!season) return;
    let cancelled = false;
    (async () => {
      const weekIds = mode === 'season'
        ? (await supabase.from('weeks').select('id').eq('season_id', season.id).then(({ data }) => data ?? [])).map((w) => w.id)
        : (selectedWeekId ? [selectedWeekId] : []);
      if (cancelled) return;
      if (!weekIds.length) { setForm({}); if (mode === 'season') setThroughWeek(null); return; }
      const { data: gameRows } = await supabase.from('games').select('id, week_id, kickoff_at, result').in('week_id', weekIds);
      if (cancelled) return;
      const gameIds = (gameRows ?? []).map((g) => g.id);
      const kickoffByGame = new Map((gameRows ?? []).map((g) => [g.id, g.kickoff_at]));

      if (mode === 'season') {
        const { data: weekRowsForThrough } = await supabase.from('weeks').select('id, label, sort_order').eq('season_id', season.id);
        const gradedWeeks = (weekRowsForThrough ?? []).filter((w) =>
          (gameRows ?? []).some((g) => g.week_id === w.id && g.result !== null),
        );
        const latestGraded = gradedWeeks.sort((a, b) => b.sort_order - a.sort_order)[0];
        if (!cancelled) setThroughWeek(latestGraded?.label ?? null);
      }

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
  }, [season, mode, selectedWeekId]);

  const currentWeek = useMemo(() => weeks.find((w) => w.id === currentWeekId), [weeks, currentWeekId]);
  const selectedWeek = useMemo(() => weeks.find((w) => w.id === selectedWeekId), [weeks, selectedWeekId]);

  const rows: DisplayRow[] = mode === 'season'
    ? seasonRows.map(fromSeasonRow)
    : weekRows.map(fromWeekRow);
  const loading = mode === 'season' ? seasonLoading : weekLoading;

  if (!season) return <p>Loading...</p>;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1>Standings</h1>
          <span className="page-status-mono">
            {mode === 'season'
              ? `${season.year}${throughWeek ? ` · through ${throughWeek}` : ''}`
              : (selectedWeek?.label ?? season.year)}
          </span>
        </div>
        <div className="page-head-controls" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {mode === 'week' && weeks.length > 0 && (
            <PillGroup
              items={weeks.map((w) => ({
                id: w.id,
                label: w.label,
                faint: !!currentWeek && w.sort_order > currentWeek.sort_order,
              }))}
              activeId={selectedWeekId ?? ''}
              onSelect={setSelectedWeekId}
            />
          )}
          <PillGroup
            items={[{ id: 'season', label: 'Season' }, { id: 'week', label: 'Week' }]}
            activeId={mode}
            onSelect={(id) => setMode(id as Mode)}
          />
        </div>
      </div>
      <div className="page-subhead">
        {mode === 'season' ? 'Form shows the last five picks, newest right.' : "Form shows this week's picks, in kickoff order."}
      </div>

      {loading ? (
        <p>Loading standings...</p>
      ) : mode === 'week' && weeks.length === 0 ? (
        <p className="hint">No weeks posted yet.</p>
      ) : (
        <>
          <div className="desktop-rows">
            {rows.map((row, i) => {
              const decided = row.wins + row.losses;
              const correctPct = decided > 0 ? (row.wins / decided) * 100 : 0;
              const rowForm = form[row.player_id] ?? [];
              return (
                <div className="standings-row" key={row.player_id}>
                  <span className="standings-rank">{i + 1}</span>
                  <div className="standings-mid">
                    <div className="standings-name-row">
                      <span className="standings-name">{row.display_name}</span>
                      <span className="standings-split">{row.split}</span>
                    </div>
                    <div className="bar-track">
                      {decided > 0 ? (
                        <>
                          <div className="bar-fill bar-fill-correct" style={{ width: `${correctPct}%` }} />
                          <div className="bar-fill bar-fill-incorrect" style={{ width: `${100 - correctPct}%` }} />
                        </>
                      ) : (
                        <div className="bar-fill" style={{ width: '100%' }} />
                      )}
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
              const decided = row.wins + row.losses;
              const correctPct = decided > 0 ? (row.wins / decided) * 100 : 0;
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
                      {decided > 0 ? (
                        <>
                          <div className="bar-fill bar-fill-correct" style={{ width: `${correctPct}%` }} />
                          <div className="bar-fill bar-fill-incorrect" style={{ width: `${100 - correctPct}%` }} />
                        </>
                      ) : (
                        <div className="bar-fill" style={{ width: '100%' }} />
                      )}
                    </div>
                    <span className="standings-record">{record(row)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {rows.length === 0 && (
            <p className="hint">
              {mode === 'week' ? `No picks graded for ${selectedWeek?.label ?? 'this week'} yet.` : 'No standings yet.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
