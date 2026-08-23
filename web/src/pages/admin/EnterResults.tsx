import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useCurrentSeason } from '../../hooks/useCurrentSeason';
import { PillGroup } from '../../components/PillGroup';
import { spreadText } from '../../lib/format';
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

function resultText(game: GameRow) {
  if (!game.result) return { text: 'not scored', tone: 'faint' as const };
  if (game.result === 'push') return { text: 'push', tone: 'dim' as const };
  const coveringTeam = game.result === 'favorite_covered' ? game.favorite_team : game.underdog_team;
  return { text: `${coveringTeam.name} covered`, tone: 'good' as const };
}

export function EnterResults() {
  const { season, loading: seasonLoading } = useCurrentSeason();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [scores, setScores] = useState<Record<string, { favorite: string; underdog: string }>>({});
  const [savingAll, setSavingAll] = useState(false);

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

  async function saveWeek() {
    const changed = games.filter((g) => {
      const entry = scores[g.id];
      if (!entry || entry.favorite === '' || entry.underdog === '') return false;
      return Number(entry.favorite) !== g.favorite_score || Number(entry.underdog) !== g.underdog_score;
    });
    if (!changed.length) return;
    setSavingAll(true);
    await Promise.all(changed.map((g) => supabase
      .from('games')
      .update({ favorite_score: Number(scores[g.id].favorite), underdog_score: Number(scores[g.id].underdog) })
      .eq('id', g.id)));
    setSavingAll(false);
    loadGames();
  }

  const selectedWeek = weeks.find((w) => w.id === selectedWeekId);
  const scoredCount = games.filter((g) => g.result !== null).length;

  if (seasonLoading || !season) return <p>Loading...</p>;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1>Enter Results</h1>
          <span className="page-status">{selectedWeek?.label ?? ''} · {scoredCount} of {games.length} scored</span>
        </div>
        <PillGroup
          items={weeks.map((w) => ({ id: w.id, label: w.label }))}
          activeId={selectedWeekId ?? ''}
          onSelect={setSelectedWeekId}
        />
      </div>

      <div className="results-grid-head">
        <span>Matchup</span>
        <span>Dog</span>
        <span>Fav</span>
        <span>Result</span>
      </div>
      {games.map((g) => {
        const result = resultText(g);
        return (
          <div className="results-grid-row" key={g.id}>
            <span className="results-matchup-cell">
              {g.underdog_team.name} <span className="mono">{spreadText(g.spread, false)}</span>{' '}
              <span className="at">at</span> {g.favorite_team.name}
            </span>
            <input
              type="number"
              className="score-input"
              placeholder="—"
              value={scores[g.id]?.underdog ?? ''}
              onChange={(e) => setScores((prev) => ({ ...prev, [g.id]: { ...prev[g.id], underdog: e.target.value } }))}
            />
            <input
              type="number"
              className="score-input"
              placeholder="—"
              value={scores[g.id]?.favorite ?? ''}
              onChange={(e) => setScores((prev) => ({ ...prev, [g.id]: { ...prev[g.id], favorite: e.target.value } }))}
            />
            <span className={`result-text ${result.tone === 'good' ? 'result-good' : result.tone === 'dim' ? 'result-push' : ''}`}>
              {result.text}
            </span>
          </div>
        );
      })}
      {games.length === 0 && <p className="hint">No games in this week.</p>}

      {games.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" disabled={savingAll} onClick={saveWeek}>
            {savingAll ? 'Saving…' : 'Save week'}
          </button>
        </div>
      )}
    </div>
  );
}
