import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useCurrentSeason } from '../../hooks/useCurrentSeason';
import { useTeams } from '../../hooks/useTeams';
import type { Database } from '../../types/database';

type Week = Database['public']['Tables']['weeks']['Row'];
type Team = { id: string; name: string };
interface GameRow {
  id: string;
  spread: number;
  neutral_site: string | null;
  kickoff_at: string;
  favorite_team: Team;
  underdog_team: Team;
}

export function BuildWeek() {
  const { season, loading: seasonLoading } = useCurrentSeason();
  const teams = useTeams();

  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [newWeekLabel, setNewWeekLabel] = useState('');
  const [newWeekSort, setNewWeekSort] = useState('');

  const [favoriteId, setFavoriteId] = useState('');
  const [underdogId, setUnderdogId] = useState('');
  const [spread, setSpread] = useState('');
  const [kickoff, setKickoff] = useState('');
  const [neutralSite, setNeutralSite] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function loadWeeks() {
    if (!season) return;
    const { data } = await supabase.from('weeks').select('*').eq('season_id', season.id).order('sort_order');
    setWeeks(data ?? []);
    if (data?.length && !selectedWeekId) setSelectedWeekId(data[data.length - 1].id);
  }

  useEffect(() => { loadWeeks(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [season]);

  async function loadGames() {
    if (!selectedWeekId) { setGames([]); return; }
    const { data } = await supabase
      .from('games')
      .select('id, spread, neutral_site, kickoff_at, favorite_team:teams!favorite_team_id(id,name), underdog_team:teams!underdog_team_id(id,name)')
      .eq('week_id', selectedWeekId)
      .order('kickoff_at');
    setGames((data ?? []) as unknown as GameRow[]);
  }

  useEffect(() => { loadGames(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedWeekId]);

  async function createWeek(e: FormEvent) {
    e.preventDefault();
    if (!season || !newWeekLabel.trim() || !newWeekSort) return;
    const { data, error } = await supabase
      .from('weeks')
      .insert({ season_id: season.id, label: newWeekLabel.trim(), sort_order: Number(newWeekSort) })
      .select()
      .single();
    if (!error && data) {
      setNewWeekLabel('');
      setNewWeekSort('');
      await loadWeeks();
      setSelectedWeekId(data.id);
    }
  }

  async function createGame(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!selectedWeekId || !favoriteId || !underdogId || !spread || !kickoff) {
      setFormError('Fill in favorite, underdog, spread, and kickoff time.');
      return;
    }
    if (favoriteId === underdogId) {
      setFormError('Favorite and underdog must be different teams.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('games').insert({
      week_id: selectedWeekId,
      favorite_team_id: favoriteId,
      underdog_team_id: underdogId,
      spread: Number(spread),
      kickoff_at: new Date(kickoff).toISOString(),
      neutral_site: neutralSite.trim() || null,
    });
    setSaving(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setFavoriteId(''); setUnderdogId(''); setSpread(''); setKickoff(''); setNeutralSite('');
    loadGames();
  }

  async function deleteGame(id: string) {
    await supabase.from('games').delete().eq('id', id);
    loadGames();
  }

  if (seasonLoading || !season) return <p>Loading...</p>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Build Week — {season.year}</h1>
        <select value={selectedWeekId ?? ''} onChange={(e) => setSelectedWeekId(e.target.value)}>
          {weeks.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
      </div>

      <form className="inline-form" onSubmit={createWeek}>
        <input
          type="text" placeholder="Week label (e.g. Week 3)"
          value={newWeekLabel} onChange={(e) => setNewWeekLabel(e.target.value)}
        />
        <input
          type="number" placeholder="Sort order" style={{ width: '7rem' }}
          value={newWeekSort} onChange={(e) => setNewWeekSort(e.target.value)}
        />
        <button type="submit">+ New Week</button>
      </form>

      {selectedWeekId && (
        <>
          <h2>Games</h2>
          <ul className="admin-game-list">
            {games.map((g) => (
              <li key={g.id}>
                <span>
                  {g.underdog_team.name} (+{g.spread}) at {g.favorite_team.name} (-{g.spread})
                  {g.neutral_site && ` — ${g.neutral_site}`} — {new Date(g.kickoff_at).toLocaleString()}
                </span>
                <button type="button" className="link-button danger" onClick={() => deleteGame(g.id)}>Delete</button>
              </li>
            ))}
            {games.length === 0 && <li className="hint">No games yet.</li>}
          </ul>

          <h2>Add Game</h2>
          <form className="game-form" onSubmit={createGame}>
            <label>
              Favorite
              <select value={favoriteId} onChange={(e) => setFavoriteId(e.target.value)}>
                <option value="">—</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label>
              Underdog
              <select value={underdogId} onChange={(e) => setUnderdogId(e.target.value)}>
                <option value="">—</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label>
              Spread
              <input type="number" step="0.5" min="0" value={spread} onChange={(e) => setSpread(e.target.value)} />
            </label>
            <label>
              Kickoff
              <input type="datetime-local" value={kickoff} onChange={(e) => setKickoff(e.target.value)} />
            </label>
            <label>
              Neutral site (optional)
              <input type="text" value={neutralSite} onChange={(e) => setNeutralSite(e.target.value)} />
            </label>
            {formError && <p className="error-text">{formError}</p>}
            <button type="submit" disabled={saving}>{saving ? 'Adding...' : 'Add Game'}</button>
          </form>
        </>
      )}
    </div>
  );
}
