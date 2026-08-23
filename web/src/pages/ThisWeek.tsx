import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCurrentSeason } from '../hooks/useCurrentSeason';
import { usePlayers } from '../hooks/usePlayers';
import type { Database } from '../types/database';

type Week = Database['public']['Tables']['weeks']['Row'];
type Team = { id: string; name: string };
interface GameRow {
  id: string;
  week_id: string;
  spread: number;
  neutral_site: string | null;
  kickoff_at: string;
  favorite_score: number | null;
  underdog_score: number | null;
  result: string | null;
  favorite_team: Team;
  underdog_team: Team;
}
type Pick = Database['public']['Tables']['picks']['Row'];
type BonusPick = Database['public']['Tables']['bonus_picks']['Row'];

function formatKickoff(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function ThisWeek() {
  const { player, isAdmin } = useAuth();
  const { season } = useCurrentSeason();
  const { players } = usePlayers();

  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [picks, setPicks] = useState<Record<string, Pick>>({}); // game_id -> pick
  const [bonusPick, setBonusPick] = useState<BonusPick | null>(null);
  const [bonusText, setBonusText] = useState('');
  const [viewingPlayerId, setViewingPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingGameId, setSavingGameId] = useState<string | null>(null);

  const effectivePlayerId = viewingPlayerId ?? player?.id ?? null;

  // Load weeks for the current season, default-select the most "current" one.
  useEffect(() => {
    if (!season) return;
    supabase
      .from('weeks')
      .select('*')
      .eq('season_id', season.id)
      .order('sort_order')
      .then(({ data }) => {
        const list = data ?? [];
        setWeeks(list);
        if (list.length && !selectedWeekId) {
          setSelectedWeekId(list[list.length - 1].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season]);

  // Once we know the weeks, pick the earliest one that hasn't fully kicked
  // off yet -- falls back to the last week if the season's over.
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
      setSelectedWeekId(current ? current.id : weeks[weeks.length - 1].id);
    })();
    return () => { cancelled = true; };
  }, [weeks]);

  const loadWeekData = useCallback(async () => {
    if (!selectedWeekId || !effectivePlayerId) return;
    setLoading(true);
    const { data: gameData } = await supabase
      .from('games')
      .select('id, week_id, spread, neutral_site, kickoff_at, favorite_score, underdog_score, result, favorite_team:teams!favorite_team_id(id,name), underdog_team:teams!underdog_team_id(id,name)')
      .eq('week_id', selectedWeekId)
      .order('kickoff_at');
    const gameRows = (gameData ?? []) as unknown as GameRow[];
    setGames(gameRows);

    if (gameRows.length) {
      const { data: pickData } = await supabase
        .from('picks')
        .select('*')
        .eq('player_id', effectivePlayerId)
        .in('game_id', gameRows.map((g) => g.id));
      const byGame: Record<string, Pick> = {};
      for (const p of pickData ?? []) byGame[p.game_id] = p;
      setPicks(byGame);
    } else {
      setPicks({});
    }

    const { data: bonusData } = await supabase
      .from('bonus_picks')
      .select('*')
      .eq('week_id', selectedWeekId)
      .eq('player_id', effectivePlayerId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setBonusPick(bonusData);
    setBonusText(bonusData?.description ?? '');
    setLoading(false);
  }, [selectedWeekId, effectivePlayerId]);

  useEffect(() => {
    loadWeekData();
  }, [loadWeekData]);

  async function makePick(game: GameRow, teamId: string) {
    if (!effectivePlayerId || !player) return;
    setSavingGameId(game.id);
    const { data, error } = await supabase
      .from('picks')
      .upsert(
        { game_id: game.id, player_id: effectivePlayerId, team_id: teamId, submitted_by: player.id },
        { onConflict: 'game_id,player_id' },
      )
      .select()
      .single();
    if (!error && data) {
      setPicks((prev) => ({ ...prev, [game.id]: data }));
    }
    setSavingGameId(null);
  }

  async function saveBonus() {
    if (!effectivePlayerId || !player || !selectedWeekId) return;
    if (!bonusText.trim()) return;
    if (bonusPick) {
      const { data } = await supabase
        .from('bonus_picks')
        .update({ description: bonusText.trim() })
        .eq('id', bonusPick.id)
        .select()
        .single();
      if (data) setBonusPick(data);
    } else {
      const { data } = await supabase
        .from('bonus_picks')
        .insert({
          week_id: selectedWeekId, player_id: effectivePlayerId,
          description: bonusText.trim(), submitted_by: player.id,
        })
        .select()
        .single();
      if (data) setBonusPick(data);
    }
  }

  const selectedWeek = useMemo(() => weeks.find((w) => w.id === selectedWeekId), [weeks, selectedWeekId]);
  const bonusLockKickoff = useMemo(
    () => (games.length ? games.map((g) => g.kickoff_at).sort()[0] : null),
    [games],
  );
  const bonusLocked = bonusLockKickoff ? new Date(bonusLockKickoff).getTime() <= Date.now() : false;

  if (!season) return <p>Loading...</p>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>This Week</h1>
        <div className="page-header-controls">
          <select
            value={selectedWeekId ?? ''}
            onChange={(e) => setSelectedWeekId(e.target.value)}
          >
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>{w.label}</option>
            ))}
          </select>
          {isAdmin && (
            <select
              value={viewingPlayerId ?? player?.id ?? ''}
              onChange={(e) => setViewingPlayerId(e.target.value)}
            >
              {players.map((p) => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <p>Loading games...</p>
      ) : games.length === 0 ? (
        <p>No games posted for {selectedWeek?.label} yet.</p>
      ) : (
        <div className="game-list">
          {games.map((game) => {
            const locked = !isAdmin && new Date(game.kickoff_at).getTime() <= Date.now();
            const pick = picks[game.id];
            return (
              <div className="game-card" key={game.id}>
                <div className="game-meta">
                  <span>{formatKickoff(game.kickoff_at)}</span>
                  {game.neutral_site && <span className="tag">at {game.neutral_site}</span>}
                  {locked && <span className="tag tag-locked">Locked</span>}
                  {game.result && <span className={`tag tag-result-${game.result}`}>{describeResult(game)}</span>}
                </div>
                <div className="game-teams">
                  <button
                    type="button"
                    className={`team-button ${pick?.team_id === game.underdog_team.id ? 'selected' : ''}`}
                    disabled={locked || savingGameId === game.id}
                    onClick={() => makePick(game, game.underdog_team.id)}
                  >
                    {game.underdog_team.name} <span className="spread">+{game.spread}</span>
                  </button>
                  <button
                    type="button"
                    className={`team-button ${pick?.team_id === game.favorite_team.id ? 'selected' : ''}`}
                    disabled={locked || savingGameId === game.id}
                    onClick={() => makePick(game, game.favorite_team.id)}
                  >
                    {game.favorite_team.name} <span className="spread">-{game.spread}</span>
                  </button>
                </div>
              </div>
            );
          })}

          <div className="game-card bonus-card">
            <div className="game-meta">
              <span className="tag tag-bonus">Bonus</span>
              {bonusLocked && !isAdmin && <span className="tag tag-locked">Locked</span>}
            </div>
            <div className="bonus-input-row">
              <input
                type="text"
                placeholder='e.g. "Boise State -6.5"'
                value={bonusText}
                disabled={bonusLocked && !isAdmin}
                onChange={(e) => setBonusText(e.target.value)}
                onBlur={saveBonus}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function describeResult(game: GameRow) {
  if (game.result === 'push') return 'Push';
  if (game.result === 'favorite_covered') return `${game.favorite_team.name} covered`;
  if (game.result === 'underdog_covered') return `${game.underdog_team.name} covered`;
  return '';
}
