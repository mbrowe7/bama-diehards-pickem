import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useCurrentSeason } from '../../hooks/useCurrentSeason';
import { useTeams } from '../../hooks/useTeams';
import { PillGroup } from '../../components/PillGroup';
import { formatShortDayDate, orderedMatchup, spreadText } from '../../lib/format';
import type { Database } from '../../types/database';

type Week = Database['public']['Tables']['weeks']['Row'];
type Team = { id: string; name: string };
interface GameRow {
  id: string;
  spread: number;
  neutral_site: string | null;
  home_team_id: string | null;
  kickoff_at: string;
  favorite_team: Team;
  underdog_team: Team;
}

type HomeChoice = 'favorite' | 'underdog' | 'neutral';

interface GameDraft {
  favoriteId: string;
  underdogId: string;
  spread: string;
  kickoff: string;
  home: HomeChoice;
  neutralSite: string;
}

const EMPTY_DRAFT: GameDraft = {
  favoriteId: '', underdogId: '', spread: '', kickoff: '', home: 'favorite', neutralSite: '',
};

// <input type="datetime-local"> wants a local-time "YYYY-MM-DDTHH:mm" string.
function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function validateDraft(d: GameDraft): string | null {
  if (!d.favoriteId || !d.underdogId || !d.spread || !d.kickoff) {
    return 'Fill in favorite, underdog, spread, and kickoff time.';
  }
  if (d.favoriteId === d.underdogId) return 'Favorite and underdog must be different teams.';
  return null;
}

function draftToRow(d: GameDraft) {
  const neutral = d.home === 'neutral';
  return {
    favorite_team_id: d.favoriteId,
    underdog_team_id: d.underdogId,
    home_team_id: d.home === 'favorite' ? d.favoriteId : d.home === 'underdog' ? d.underdogId : null,
    spread: Number(d.spread),
    kickoff_at: new Date(d.kickoff).toISOString(),
    neutral_site: neutral ? (d.neutralSite.trim() || null) : null,
  };
}

function GameFields({ draft, teams, onChange, trailing }: {
  draft: GameDraft;
  teams: Team[];
  onChange: (next: GameDraft) => void;
  trailing: ReactNode;
}) {
  return (
    <>
      <div className="add-game-grid">
        <label className="field-group">
          Favorite
          <select value={draft.favoriteId} onChange={(e) => onChange({ ...draft, favoriteId: e.target.value })}>
            <option value="">Choose…</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="field-group">
          Underdog
          <select value={draft.underdogId} onChange={(e) => onChange({ ...draft, underdogId: e.target.value })}>
            <option value="">Choose…</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="field-group">
          Spread
          <input
            className="mono" type="number" step="0.5" min="0"
            value={draft.spread} onChange={(e) => onChange({ ...draft, spread: e.target.value })}
          />
        </label>
        <label className="field-group">
          Kickoff
          <input
            className="mono" type="datetime-local"
            value={draft.kickoff} onChange={(e) => onChange({ ...draft, kickoff: e.target.value })}
          />
        </label>
      </div>
      <div className="add-game-row2">
        <label className="field-group">
          Home team
          <select value={draft.home} onChange={(e) => onChange({ ...draft, home: e.target.value as HomeChoice })}>
            <option value="favorite">Favorite</option>
            <option value="underdog">Underdog</option>
            <option value="neutral">Neutral site</option>
          </select>
        </label>
        {draft.home === 'neutral' && (
          <label className="field-group">
            Neutral site (optional)
            <input
              type="text"
              value={draft.neutralSite} onChange={(e) => onChange({ ...draft, neutralSite: e.target.value })}
            />
          </label>
        )}
        {trailing}
      </div>
    </>
  );
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

  const [addDraft, setAddDraft] = useState<GameDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<GameDraft>(EMPTY_DRAFT);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

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
      .select('id, spread, neutral_site, home_team_id, kickoff_at, favorite_team:teams!favorite_team_id(id,name), underdog_team:teams!underdog_team_id(id,name)')
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

  useEffect(() => {
    setEditingId(null);
    loadGames();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [selectedWeekId]);

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
    if (!selectedWeekId) return;
    const problem = validateDraft(addDraft);
    if (problem) { setFormError(problem); return; }
    setSaving(true);
    const { error } = await supabase.from('games').insert({
      week_id: selectedWeekId,
      ...draftToRow(addDraft),
    });
    setSaving(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setAddDraft(EMPTY_DRAFT);
    loadGames();
  }

  function startEdit(g: GameRow) {
    setEditError('');
    setEditingId(g.id);
    setEditDraft({
      favoriteId: g.favorite_team.id,
      underdogId: g.underdog_team.id,
      spread: String(g.spread),
      kickoff: toDatetimeLocal(g.kickoff_at),
      home: g.home_team_id === g.underdog_team.id ? 'underdog' : g.home_team_id ? 'favorite' : 'neutral',
      neutralSite: g.neutral_site ?? '',
    });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditError('');
    const problem = validateDraft(editDraft);
    if (problem) { setEditError(problem); return; }
    setEditSaving(true);
    const { error } = await supabase.from('games').update(draftToRow(editDraft)).eq('id', editingId);
    setEditSaving(false);
    if (error) { setEditError(error.message); return; }
    setEditingId(null);
    loadGames();
  }

  async function deleteGame(id: string) {
    await supabase.from('games').delete().eq('id', id);
    if (editingId === id) setEditingId(null);
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
              editingId === g.id ? (
                <form className="add-game-panel build-edit-panel" key={g.id} onSubmit={saveEdit}>
                  <div className="add-game-label">Edit game</div>
                  <GameFields
                    draft={editDraft}
                    teams={teams}
                    onChange={setEditDraft}
                    trailing={
                      <div className="build-edit-actions">
                        <button type="button" className="link-button" onClick={() => setEditingId(null)}>Cancel</button>
                        <button type="submit" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save game'}</button>
                      </div>
                    }
                  />
                  {editError && <p className="error-text">{editError}</p>}
                </form>
              ) : (
                <div className="build-row" key={g.id}>
                  <span className="build-when">{formatShortDayDate(g.kickoff_at)}</span>
                  <span className="build-matchup">
                    {(() => {
                      const { sides, neutral } = orderedMatchup(g);
                      return (
                        <>
                          {sides[0].team.name} <span className="mono">{spreadText(g.spread, sides[0].isFavorite)}</span>{' '}
                          <span className="at">{neutral ? 'vs' : 'at'}</span>{' '}
                          {sides[1].team.name} <span className="mono">{spreadText(g.spread, sides[1].isFavorite)}</span>
                        </>
                      );
                    })()}
                  </span>
                  <span className="build-site">{g.neutral_site ?? ''}</span>
                  <button type="button" className="build-remove-btn" onClick={() => startEdit(g)}>Edit</button>
                  <button type="button" className="build-remove-btn" onClick={() => deleteGame(g.id)}>Remove</button>
                </div>
              )
            ))}
            {games.length === 0 && <p className="hint">No games yet.</p>}
          </div>

          <div className="add-game-panel">
            <div className="add-game-label">Add game</div>
            <form onSubmit={createGame}>
              <GameFields
                draft={addDraft}
                teams={teams}
                onChange={setAddDraft}
                trailing={<button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add game'}</button>}
              />
              {formError && <p className="error-text">{formError}</p>}
            </form>
          </div>
        </>
      )}
    </div>
  );
}
