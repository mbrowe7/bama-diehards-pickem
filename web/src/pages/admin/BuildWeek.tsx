import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useCurrentSeason } from '../../hooks/useCurrentSeason';
import { useTeams } from '../../hooks/useTeams';
import { PillGroup } from '../../components/PillGroup';
import { formatShortDayDate, spreadText } from '../../lib/format';
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
  const [pickedPlayerCount, setPickedPlayerCount] = useState(0);
  const [creatingWeek, setCreatingWeek] = useState(false);
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
    if (!selectedWeekId) { setGames([]); setPickedPlayerCount(0); return; }
    const { data } = await supabase
      .from('games')
      .select('id, spread, neutral_site, kickoff_at, favorite_team:teams!favorite_team_id(id,name), underdog_team:teams!underdog_team_id(id,name)')
      .eq('week_id', selectedWeekId)
      .order('kickoff_at');
    const rows = (data ?? []) as unknown as GameRow[];
    setGames(rows);
    if (rows.length) {
      const { data: pickRows } = await supabase
        .from('picks')
        .select('player_id')
        .in('game_id', rows.map((g) => g.id));
      setPickedPlayerCount(new Set((pickRows ?? []).map((p) => p.player_id)).size);
    } else {
      setPickedPlayerCount(0);
    }
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
      setCreatingWeek(false);
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

  const selectedWeek = weeks.find((w) => w.id === selectedWeekId);

  if (seasonLoading || !season) return <p>Loading...</p>;

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div className="page-head-left">
          <h1>Build Week</h1>
          <span className="page-status">
            {games.length} games in {selectedWeek?.label ?? 'this week'} · {pickedPlayerCount} players have picked
          </span>
        </div>
        <PillGroup
          items={weeks.map((w) => ({ id: w.id, label: w.label }))}
          activeId={selectedWeekId ?? ''}
          onSelect={setSelectedWeekId}
          trailing={{ label: '+ New', onClick: () => setCreatingWeek((c) => !c) }}
        />
      </div>

      {creatingWeek && (
        <form className="inline-form" onSubmit={createWeek}>
          <input
            type="text" placeholder="Week label (e.g. Week 3)"
            value={newWeekLabel} onChange={(e) => setNewWeekLabel(e.target.value)}
          />
          <input
            type="number" placeholder="Sort order" style={{ width: '7rem' }}
            value={newWeekSort} onChange={(e) => setNewWeekSort(e.target.value)}
          />
          <button type="submit">Create week</button>
        </form>
      )}

      {selectedWeekId && (
        <>
          <div style={{ marginBottom: 28 }}>
            {games.map((g) => (
              <div className="build-row" key={g.id}>
                <span className="build-when">{formatShortDayDate(g.kickoff_at)}</span>
                <span className="build-matchup">
                  {g.underdog_team.name} <span className="mono">{spreadText(g.spread, false)}</span>{' '}
                  <span className="at">at</span>{' '}
                  {g.favorite_team.name} <span className="mono">{spreadText(g.spread, true)}</span>
                </span>
                <span className="build-site">{g.neutral_site ?? ''}</span>
                <button type="button" className="build-remove-btn" onClick={() => deleteGame(g.id)}>Remove</button>
              </div>
            ))}
            {games.length === 0 && <p className="hint">No games yet.</p>}
          </div>

          <div className="add-game-panel">
            <div className="add-game-label">Add game</div>
            <form onSubmit={createGame}>
              <div className="add-game-grid">
                <label className="field-group">
                  Favorite
                  <select value={favoriteId} onChange={(e) => setFavoriteId(e.target.value)}>
                    <option value="">Choose…</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="field-group">
                  Underdog
                  <select value={underdogId} onChange={(e) => setUnderdogId(e.target.value)}>
                    <option value="">Choose…</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="field-group">
                  Spread
                  <input className="mono" type="number" step="0.5" min="0" value={spread} onChange={(e) => setSpread(e.target.value)} />
                </label>
                <label className="field-group">
                  Kickoff
                  <input className="mono" type="datetime-local" value={kickoff} onChange={(e) => setKickoff(e.target.value)} />
                </label>
              </div>
              <div className="add-game-row2">
                <label className="field-group">
                  Neutral site (optional)
                  <input type="text" value={neutralSite} onChange={(e) => setNeutralSite(e.target.value)} />
                </label>
                <button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add game'}</button>
              </div>
              {formError && <p className="error-text">{formError}</p>}
            </form>
          </div>
        </>
      )}
    </div>
  );
}
