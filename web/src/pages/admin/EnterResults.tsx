import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useCurrentSeason } from '../../hooks/useCurrentSeason';
import type { Database } from '../../types/database';

type Week = Database['public']['Tables']['weeks']['Row'];
type Team = { id: string; name: string };
interface GameRow {
  id: string;
  spread: number;
  favorite_score: number | null;
  underdog_score: number | null;
  result: string | null;
  favorite_team: Team;
  underdog_team: Team;
}

export function EnterResults() {
  const { season, loading: seasonLoading } = useCurrentSeason();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [scores, setScores] = useState<Record<string, { favorite: string; underdog: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!season) return;
    supabase.from('weeks').select('*').eq('season_id', season.id).order('sort_order').then(({ data }) => {
      const list = data ?? [];
      setWeeks(list);
      if (list.length && !selectedWeekId) setSelectedWeekId(list[list.length - 1].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season]);

  async function loadGames() {
    if (!selectedWeekId) { setGames([]); return; }
    const { data } = await supabase
      .from('games')
      .select('id, spread, favorite_score, underdog_score, result, favorite_team:teams!favorite_team_id(id,name), underdog_team:teams!underdog_team_id(id,name)')
      .eq('week_id', selectedWeekId)
      .order('kickoff_at');
    const rows = (data ?? []) as unknown as GameRow[];
    setGames(rows);
    setScores(Object.fromEntries(rows.map((g) => [
      g.id,
      { favorite: g.favorite_score?.toString() ?? '', underdog: g.underdog_score?.toString() ?? '' },
    ])));
  }

  useEffect(() => { loadGames(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedWeekId]);

  async function saveScore(gameId: string) {
    const entry = scores[gameId];
    if (!entry || entry.favorite === '' || entry.underdog === '') return;
    setSavingId(gameId);
    await supabase
      .from('games')
      .update({ favorite_score: Number(entry.favorite), underdog_score: Number(entry.underdog) })
      .eq('id', gameId);
    setSavingId(null);
    loadGames();
  }

  if (seasonLoading || !season) return <p>Loading...</p>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Enter Results — {season.year}</h1>
        <select value={selectedWeekId ?? ''} onChange={(e) => setSelectedWeekId(e.target.value)}>
          {weeks.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
      </div>

      <div className="results-list">
        {games.map((g) => (
          <div className="results-row" key={g.id}>
            <span className="results-matchup">
              {g.underdog_team.name} (+{g.spread}) at {g.favorite_team.name} (-{g.spread})
            </span>
            <input
              type="number" placeholder="Underdog score"
              value={scores[g.id]?.underdog ?? ''}
              onChange={(e) => setScores((prev) => ({ ...prev, [g.id]: { ...prev[g.id], underdog: e.target.value } }))}
            />
            <input
              type="number" placeholder="Favorite score"
              value={scores[g.id]?.favorite ?? ''}
              onChange={(e) => setScores((prev) => ({ ...prev, [g.id]: { ...prev[g.id], favorite: e.target.value } }))}
            />
            <button type="button" disabled={savingId === g.id} onClick={() => saveScore(g.id)}>
              {savingId === g.id ? 'Saving...' : 'Save'}
            </button>
            {g.result && <span className={`tag tag-result-${g.result}`}>{g.result.replace('_', ' ')}</span>}
          </div>
        ))}
        {games.length === 0 && <p className="hint">No games in this week.</p>}
      </div>
    </div>
  );
}
