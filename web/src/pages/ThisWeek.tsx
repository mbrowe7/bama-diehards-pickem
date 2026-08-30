import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCurrentSeason } from '../hooks/useCurrentSeason';
import { usePlayers } from '../hooks/usePlayers';
import { PillGroup } from '../components/PillGroup';
import { formatTime, formatShortDayTime, orderedMatchup, spreadText } from '../lib/format';
import type { Database } from '../types/database';

type PlayerLite = { id: string; display_name: string };
type WeekView = 'mine' | 'everyone';

type Week = Database['public']['Tables']['weeks']['Row'];
type Team = { id: string; name: string };
interface GameRow {
  id: string;
  week_id: string;
  spread: number;
  neutral_site: string | null;
  home_team_id: string | null;
  kickoff_at: string;
  favorite_score: number | null;
  underdog_score: number | null;
  result: string | null;
  favorite_team: Team;
  underdog_team: Team;
}
type Pick = Database['public']['Tables']['picks']['Row'];
type BonusPick = Database['public']['Tables']['bonus_picks']['Row'];

function formatDayLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long' });
}

function scoreOutcome(game: GameRow, pick: Pick | undefined) {
  if (!game.result) return { text: game.neutral_site ?? '', tone: 'neutral' as const };
  const scoreText = `${game.favorite_score}–${game.underdog_score}`;
  if (game.result === 'push') return { text: `${scoreText} · push`, tone: 'neutral' as const };
  const coveringTeamId = game.result === 'favorite_covered' ? game.favorite_team.id : game.underdog_team.id;
  if (pick) {
    const covered = pick.team_id === coveringTeamId;
    return { text: `${scoreText} · ${covered ? 'covered' : 'missed'}`, tone: covered ? 'good' as const : 'bad' as const };
  }
  const coveringTeamName = game.result === 'favorite_covered' ? game.favorite_team.name : game.underdog_team.name;
  return { text: `${scoreText} · ${coveringTeamName} covered`, tone: 'neutral' as const };
}

function pickGradeClass(game: GameRow, side: 'favorite' | 'underdog'): string | null {
  if (!game.result || game.result === 'push') return null;
  const covered = (side === 'favorite' && game.result === 'favorite_covered')
    || (side === 'underdog' && game.result === 'underdog_covered');
  return covered ? 'pick-covered' : 'pick-missed';
}

export function ThisWeek() {
  const { player, isAdmin } = useAuth();
  const { season } = useCurrentSeason();
  const { players } = usePlayers();

  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [currentWeekId, setCurrentWeekId] = useState<string | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [picks, setPicks] = useState<Record<string, Pick>>({}); // game_id -> pick
  const [bonusPick, setBonusPick] = useState<BonusPick | null>(null);
  const [bonusText, setBonusText] = useState('');
  const [viewingPlayerId, setViewingPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingGameId, setSavingGameId] = useState<string | null>(null);

  const [view, setView] = useState<WeekView>('mine');
  // game_id -> player_id -> team_id, plus player_id -> bonus text
  const [allPicks, setAllPicks] = useState<Record<string, Record<string, string>>>({});
  const [allBonus, setAllBonus] = useState<Record<string, string>>({});
  const [everyoneLoading, setEveryoneLoading] = useState(false);

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
      const currentId = current ? current.id : weeks[weeks.length - 1].id;
      setCurrentWeekId(currentId);
      setSelectedWeekId((prev) => prev ?? currentId);
    })();
    return () => { cancelled = true; };
  }, [weeks]);

  const loadWeekData = useCallback(async () => {
    if (!selectedWeekId || !effectivePlayerId) return;
    setLoading(true);
    const { data: gameData } = await supabase
      .from('games')
      .select('id, week_id, spread, neutral_site, home_team_id, kickoff_at, favorite_score, underdog_score, result, favorite_team:teams!favorite_team_id(id,name), underdog_team:teams!underdog_team_id(id,name)')
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

  // "Everyone" view: pull every player's picks + bonus for the selected week.
  useEffect(() => {
    if (view !== 'everyone' || !selectedWeekId) return;
    let cancelled = false;
    (async () => {
      setEveryoneLoading(true);
      const gameIds = games.map((g) => g.id);
      const [picksRes, bonusRes] = await Promise.all([
        gameIds.length
          ? supabase.from('picks').select('game_id, player_id, team_id').in('game_id', gameIds)
          : Promise.resolve({ data: [] as { game_id: string; player_id: string; team_id: string }[] }),
        supabase
          .from('bonus_picks')
          .select('player_id, description, submitted_at')
          .eq('week_id', selectedWeekId)
          .order('submitted_at'),
      ]);
      if (cancelled) return;
      const pickMap: Record<string, Record<string, string>> = {};
      for (const p of picksRes.data ?? []) {
        (pickMap[p.game_id] ??= {})[p.player_id] = p.team_id;
      }
      const bonusMap: Record<string, string> = {};
      for (const b of bonusRes.data ?? []) bonusMap[b.player_id] = b.description; // most recent wins
      setAllPicks(pickMap);
      setAllBonus(bonusMap);
      setEveryoneLoading(false);
    })();
    return () => { cancelled = true; };
  }, [view, selectedWeekId, games]);

  async function makePick(game: GameRow, teamId: string) {
    if (!effectivePlayerId || !player) return;
    const existing = picks[game.id];
    setSavingGameId(game.id);
    if (existing?.team_id === teamId) {
      const { error } = await supabase.from('picks').delete().eq('id', existing.id);
      if (!error) {
        setPicks((prev) => {
          const next = { ...prev };
          delete next[game.id];
          return next;
        });
      }
      setSavingGameId(null);
      return;
    }
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
  const currentWeek = useMemo(() => weeks.find((w) => w.id === currentWeekId), [weeks, currentWeekId]);
  const bonusLockKickoff = useMemo(
    () => (games.length ? games.map((g) => g.kickoff_at).sort()[0] : null),
    [games],
  );
  const bonusLocked = bonusLockKickoff ? new Date(bonusLockKickoff).getTime() <= Date.now() : false;

  const dayGroups = useMemo(() => {
    const groups: { label: string; games: GameRow[] }[] = [];
    for (const game of games) {
      const label = formatDayLabel(game.kickoff_at);
      let group = groups.find((g) => g.label === label);
      if (!group) {
        group = { label, games: [] };
        groups.push(group);
      }
      group.games.push(game);
    }
    return groups;
  }, [games]);

  const pickedCount = Object.keys(picks).length;

  if (!season) return <p>Loading...</p>;

  return (
    <div className={`page ${view === 'everyone' ? 'page-full' : ''}`}>
        <div className="page-head">
          <div className="page-head-left">
            <h1>{selectedWeek?.label ?? 'This Week'}</h1>
            {games.length > 0 && (
              <span className="page-status">
                {view === 'mine' && `${pickedCount} of ${games.length} picked`}
                {view === 'mine' && bonusLockKickoff && ' · '}
                {bonusLockKickoff && `locks ${formatShortDayTime(bonusLockKickoff)}`}
              </span>
            )}
          </div>
          <div className="page-head-controls" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isAdmin && view === 'mine' && (
              <select
                value={viewingPlayerId ?? player?.id ?? ''}
                onChange={(e) => setViewingPlayerId(e.target.value)}
              >
                {players.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name}</option>
                ))}
              </select>
            )}
            <PillGroup
              items={[{ id: 'mine', label: 'Mine' }, { id: 'everyone', label: 'Everyone' }]}
              activeId={view}
              onSelect={(id) => setView(id as WeekView)}
            />
            <PillGroup
              items={weeks.map((w) => ({
                id: w.id,
                label: w.label,
                faint: !!currentWeek && w.sort_order > currentWeek.sort_order,
              }))}
              activeId={selectedWeekId ?? ''}
              onSelect={setSelectedWeekId}
            />
          </div>
        </div>

        {loading ? (
          <p>Loading games...</p>
        ) : games.length === 0 ? (
          <p>No games posted for {selectedWeek?.label} yet.</p>
        ) : view === 'everyone' ? (
          <EveryonePicks
            games={games}
            players={players}
            allPicks={allPicks}
            allBonus={allBonus}
            loading={everyoneLoading}
          />
        ) : (
          <>
            <div className="desktop-rows">
              {dayGroups.map((group) => (
                <div key={group.label}>
                  <div className="day-label">{group.label}</div>
                  <div className="day-group">
                    {group.games.map((game) => {
                      const locked = !isAdmin && new Date(game.kickoff_at).getTime() <= Date.now();
                      const pick = picks[game.id];
                      const dogSelected = pick?.team_id === game.underdog_team.id;
                      const favSelected = pick?.team_id === game.favorite_team.id;
                      const note = scoreOutcome(game, pick);
                      return (
                        <div className="game-row" key={game.id}>
                          <span className="game-time">{formatTime(game.kickoff_at)}</span>
                          <div className="game-picks">
                            <button
                              type="button"
                              className={[
                                'pick-btn',
                                dogSelected && `pick-selected ${pickGradeClass(game, 'underdog') ?? 'pick-pending'}`,
                                !dogSelected && locked && 'pick-locked',
                              ].filter(Boolean).join(' ')}
                              disabled={locked || savingGameId === game.id}
                              onClick={() => makePick(game, game.underdog_team.id)}
                            >
                              <span className="pick-team">
                                {game.underdog_team.name}
                                {game.home_team_id === game.underdog_team.id && <span className="pick-home-tag">home</span>}
                              </span>
                              <span className="pick-spread">{spreadText(game.spread, false)}</span>
                            </button>
                            <button
                              type="button"
                              className={[
                                'pick-btn',
                                favSelected && `pick-selected ${pickGradeClass(game, 'favorite') ?? 'pick-pending'}`,
                                !favSelected && locked && 'pick-locked',
                              ].filter(Boolean).join(' ')}
                              disabled={locked || savingGameId === game.id}
                              onClick={() => makePick(game, game.favorite_team.id)}
                            >
                              <span className="pick-team">
                                {game.favorite_team.name}
                                {game.home_team_id === game.favorite_team.id && <span className="pick-home-tag">home</span>}
                              </span>
                              <span className="pick-spread">{spreadText(game.spread, true)}</span>
                            </button>
                          </div>
                          <span className={`game-note ${note.tone === 'good' ? 'game-note-good' : note.tone === 'bad' ? 'game-note-bad' : ''}`}>
                            {note.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="bonus-row">
                <span className="bonus-label">Bonus</span>
                <input
                  type="text"
                  className="bonus-value"
                  placeholder='e.g. "Boise State −6.5"'
                  value={bonusText}
                  disabled={bonusLocked && !isAdmin}
                  onChange={(e) => setBonusText(e.target.value)}
                  onBlur={saveBonus}
                />
                {bonusPick && <span className="bonus-saved">saved</span>}
              </div>
            </div>

            <div className="mobile-cards">
              {games.map((game) => {
                const locked = !isAdmin && new Date(game.kickoff_at).getTime() <= Date.now();
                const pick = picks[game.id];
                const note = scoreOutcome(game, pick);
                if (locked) {
                  return (
                    <div className="phone-final-card" key={game.id}>
                      <div className="phone-final-top">
                        <span className="phone-game-time">{formatTime(game.kickoff_at)}</span>
                        <span className={note.tone === 'good' ? 'game-note-good' : note.tone === 'bad' ? 'game-note-bad' : 'phone-game-note'} style={{ fontSize: 11 }}>
                          {note.text}
                        </span>
                      </div>
                      <div className="phone-final-bottom">
                        <span className="phone-final-team">
                          {pick?.team_id === game.favorite_team.id ? game.favorite_team.name : game.underdog_team.name}
                          {' '}
                          <span className="phone-final-spread">
                            {pick?.team_id === game.favorite_team.id ? spreadText(game.spread, true) : spreadText(game.spread, false)}
                          </span>
                        </span>
                        {game.result && (
                          <span className="phone-final-score">{game.favorite_score}–{game.underdog_score}</span>
                        )}
                      </div>
                    </div>
                  );
                }
                const dogSelected = pick?.team_id === game.underdog_team.id;
                const favSelected = pick?.team_id === game.favorite_team.id;
                const thumbClass = dogSelected
                  ? `phone-thumb phone-thumb-dog ${pickGradeClass(game, 'underdog') === 'pick-covered' ? 'phone-thumb-covered' : pickGradeClass(game, 'underdog') === 'pick-missed' ? 'phone-thumb-missed' : ''}`
                  : favSelected
                    ? `phone-thumb phone-thumb-fav ${pickGradeClass(game, 'favorite') === 'pick-covered' ? 'phone-thumb-covered' : pickGradeClass(game, 'favorite') === 'pick-missed' ? 'phone-thumb-missed' : ''}`
                    : 'phone-thumb';
                return (
                  <div className="phone-game-card" key={game.id}>
                    <div className="phone-game-top">
                      <span className="phone-game-time">{formatTime(game.kickoff_at)}</span>
                      <span className="phone-game-note">{note.text}</span>
                    </div>
                    <div className="phone-track">
                      <div className={thumbClass} />
                      <button
                        type="button"
                        className="phone-side phone-side-dog"
                        disabled={savingGameId === game.id}
                        onClick={() => makePick(game, game.underdog_team.id)}
                      >
                        <span className="phone-team">
                          {game.underdog_team.name}
                          {game.home_team_id === game.underdog_team.id && <span className="pick-home-tag">home</span>}
                        </span>
                        <span className="phone-spread">{spreadText(game.spread, false)}</span>
                      </button>
                      <button
                        type="button"
                        className="phone-side phone-side-fav"
                        disabled={savingGameId === game.id}
                        onClick={() => makePick(game, game.favorite_team.id)}
                      >
                        <span className="phone-team">
                          {game.favorite_team.name}
                          {game.home_team_id === game.favorite_team.id && <span className="pick-home-tag">home</span>}
                        </span>
                        <span className="phone-spread">{spreadText(game.spread, true)}</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="phone-bonus-row">
                <span className="bonus-label">Bonus</span>
                <input
                  type="text"
                  className="phone-bonus-value"
                  placeholder="Add one extra pick…"
                  value={bonusText}
                  disabled={bonusLocked && !isAdmin}
                  onChange={(e) => setBonusText(e.target.value)}
                  onBlur={saveBonus}
                />
              </div>
            </div>
          </>
        )}
    </div>
  );
}

function EveryonePicks({ games, players, allPicks, allBonus, loading }: {
  games: GameRow[];
  players: PlayerLite[];
  allPicks: Record<string, Record<string, string>>;
  allBonus: Record<string, string>;
  loading: boolean;
}) {
  const pickedCount = (playerId: string) => games.filter((g) => allPicks[g.id]?.[playerId]).length;
  const incomplete = players.filter((p) => pickedCount(p.id) < games.length);

  if (loading) return <p>Loading picks…</p>;

  return (
    <div className="everyone">
      <div className={`everyone-flag ${incomplete.length ? '' : 'everyone-flag-clear'}`}>
        {incomplete.length ? (
          <>
            <span className="everyone-flag-label">Not in yet</span>
            {incomplete.map((p) => (
              <span key={p.id} className="everyone-chip">
                {p.display_name}
                <span className="everyone-chip-count">{pickedCount(p.id)}/{games.length}</span>
              </span>
            ))}
          </>
        ) : (
          <span className="everyone-flag-label">Everyone's picks are in.</span>
        )}
      </div>

      <div className="table-scroll">
        <table className="picks-grid">
          <thead>
            <tr>
              <th className="picks-grid-corner">Game</th>
              {players.map((p) => (
                <th key={p.id} className={pickedCount(p.id) < games.length ? 'picks-grid-th-missing' : ''}>
                  {p.display_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr key={game.id}>
                <td className="picks-grid-matchup">
                  {(() => {
                    const { sides, neutral } = orderedMatchup(game);
                    return (
                      <>
                        {sides[0].team.name} <span className="mono">{spreadText(game.spread, sides[0].isFavorite)}</span>{' '}
                        <span className="at">{neutral ? 'vs' : 'at'}</span>{' '}
                        {sides[1].team.name} <span className="mono">{spreadText(game.spread, sides[1].isFavorite)}</span>
                      </>
                    );
                  })()}
                </td>
                {players.map((p) => {
                  const teamId = allPicks[game.id]?.[p.id];
                  const side = teamId === game.favorite_team.id
                    ? 'favorite' as const
                    : teamId === game.underdog_team.id
                      ? 'underdog' as const
                      : null;
                  const grade = side ? pickGradeClass(game, side) : null;
                  const teamName = side === 'favorite'
                    ? game.favorite_team.name
                    : side === 'underdog' ? game.underdog_team.name : '';
                  return (
                    <td
                      key={p.id}
                      className={[
                        'picks-grid-cell',
                        grade === 'pick-covered' && 'picks-grid-covered',
                        grade === 'pick-missed' && 'picks-grid-missed',
                      ].filter(Boolean).join(' ')}
                    >
                      {side ? (
                        <>
                          <span className="picks-grid-arrow">{side === 'favorite' ? '▲' : '▼'}</span>
                          <span className="picks-grid-team">{teamName}</span>
                        </>
                      ) : (
                        <span className="picks-grid-empty">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="picks-grid-bonus">
              <td className="picks-grid-matchup">Bonus</td>
              {players.map((p) => (
                <td key={p.id} className="picks-grid-cell">
                  {allBonus[p.id]
                    ? <span className="picks-grid-team">{allBonus[p.id]}</span>
                    : <span className="picks-grid-empty">·</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
