import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { PillGroup } from '../components/PillGroup';
import type { Database, SeasonRecordCategory } from '../types/database';

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

type CategoryRow = {
  season_id: string;
  player_id: string;
  display_name: string;
  category: SeasonRecordCategory;
  wins: number;
  losses: number;
  ties: number;
};

const ALL_TIME_ID = 'all-time';

const MAIN_CATEGORIES: { key: SeasonRecordCategory; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  { key: 'regular_season', label: 'Regular Season' },
  { key: 'bowl', label: 'Bowl' },
  { key: 'overall_bonus', label: 'Overall Bonus' },
  { key: 'regular_season_bonus', label: 'Reg. Season Bonus' },
];

const AWARD_CATEGORIES: { key: SeasonRecordCategory; label: string }[] = [
  { key: 'conf_champs', label: 'Conf. Champs' },
  { key: 'playoff_picks', label: 'Playoff Picks' },
  { key: 'national_champion', label: "Nat'l Champion" },
  { key: 'heisman_finalists', label: 'Heisman Finalists' },
  { key: 'heisman_winner', label: 'Heisman Winner' },
];

function record(row: { wins: number; losses: number; ties: number }) {
  return `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}`;
}

function winPct(row: { wins: number; losses: number; ties: number } | undefined) {
  if (!row) return 0;
  const total = row.wins + row.losses + row.ties;
  return total ? (row.wins + row.ties * 0.5) / total : 0;
}

type PlayerCategoryRecords = {
  player_id: string;
  display_name: string;
  byCategory: Map<SeasonRecordCategory, { wins: number; losses: number; ties: number }>;
};

function buildPlayerRecords(rows: CategoryRow[]): PlayerCategoryRecords[] {
  const byPlayer = new Map<string, PlayerCategoryRecords>();
  for (const r of rows) {
    let entry = byPlayer.get(r.player_id);
    if (!entry) {
      entry = { player_id: r.player_id, display_name: r.display_name, byCategory: new Map() };
      byPlayer.set(r.player_id, entry);
    }
    const existing = entry.byCategory.get(r.category);
    if (existing) {
      existing.wins += r.wins;
      existing.losses += r.losses;
      existing.ties += r.ties;
    } else {
      entry.byCategory.set(r.category, { wins: r.wins, losses: r.losses, ties: r.ties });
    }
  }
  return [...byPlayer.values()].sort(
    (a, b) => winPct(b.byCategory.get('overall')) - winPct(a.byCategory.get('overall')),
  );
}

export function History() {
  const { player } = useAuth();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [hasBreakdown, setHasBreakdown] = useState(true);
  const [loading, setLoading] = useState(true);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);

  useEffect(() => {
    supabase.from('seasons').select('*').order('year', { ascending: false }).then(({ data }) => {
      const list = data ?? [];
      setSeasons(list);
      if (list.length) setSeasonId(list[0].id);
    });

    supabase
      .from('season_category_records')
      .select('*, players(display_name)')
      .then(({ data }) => {
        const raw = (data ?? []) as (Database['public']['Tables']['season_category_records']['Row'] & {
          players: { display_name: string } | null;
        })[];
        setCategoryRows(
          raw.map((r) => ({
            season_id: r.season_id,
            player_id: r.player_id,
            display_name: r.players?.display_name ?? '',
            category: r.category,
            wins: r.wins,
            losses: r.losses,
            ties: r.ties,
          })),
        );
      });
  }, []);

  useEffect(() => {
    if (!seasonId || seasonId === ALL_TIME_ID) {
      setLoading(false);
      setRows([]);
      return;
    }
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

  const yearPills = useMemo(
    () => [...seasons.map((s) => ({ id: s.id, label: String(s.year) })), { id: ALL_TIME_ID, label: 'All-Time' }],
    [seasons],
  );

  const categoryPlayers = useMemo(() => {
    if (!seasonId) return [];
    const rowsForSelection =
      seasonId === ALL_TIME_ID ? categoryRows : categoryRows.filter((r) => r.season_id === seasonId);
    return buildPlayerRecords(rowsForSelection);
  }, [seasonId, categoryRows]);

  const showCategoryTables = categoryPlayers.length > 0;
  const showPointsTable = seasonId !== ALL_TIME_ID;

  return (
    <div className="page page-wide">
      <div className="page-head">
        <h1>History</h1>
        <PillGroup items={yearPills} activeId={seasonId ?? ''} onSelect={setSeasonId} maxPills={8} />
      </div>

      {showPointsTable && loading && <p>Loading...</p>}

      {showPointsTable && !loading && (
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
      {showPointsTable && !loading && rows.length === 0 && (
        <p className="hint">No standings for {selectedSeason?.year ?? 'this season'} yet.</p>
      )}

      {showCategoryTables && (
        <div className="records-section">
          <h2 className="records-section-title">
            {seasonId === ALL_TIME_ID ? 'All-Time Record' : `${selectedSeason?.year ?? ''} Season Record`}
          </h2>
          <div className="table-scroll">
            <table className="records-table">
              <thead>
                <tr>
                  <th className="records-th-rank">#</th>
                  <th className="records-th-player">Player</th>
                  {MAIN_CATEGORIES.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categoryPlayers.map((p, i) => (
                  <tr key={p.player_id}>
                    <td className="records-td-rank">{i + 1}</td>
                    <td className={`records-td-player ${p.player_id === player?.id ? 'history-name-self' : ''}`}>
                      {p.display_name}
                    </td>
                    {MAIN_CATEGORIES.map((c, idx) => {
                      const rec = p.byCategory.get(c.key);
                      return (
                        <td key={c.key} className={idx === 0 ? 'records-td-overall' : undefined}>
                          {rec ? record(rec) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="records-section-title records-section-title-spaced">Preseason Picks/Awards</h2>
          <div className="table-scroll">
            <table className="records-table">
              <thead>
                <tr>
                  <th className="records-th-rank">#</th>
                  <th className="records-th-player">Player</th>
                  {AWARD_CATEGORIES.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categoryPlayers.map((p, i) => (
                  <tr key={p.player_id}>
                    <td className="records-td-rank">{i + 1}</td>
                    <td className={`records-td-player ${p.player_id === player?.id ? 'history-name-self' : ''}`}>
                      {p.display_name}
                    </td>
                    {AWARD_CATEGORIES.map((c) => {
                      const rec = p.byCategory.get(c.key);
                      return <td key={c.key}>{rec ? record(rec) : '—'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
