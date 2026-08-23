import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCurrentSeason } from '../hooks/useCurrentSeason';
import { usePlayers } from '../hooks/usePlayers';
import { useTeams } from '../hooks/useTeams';
import type { Database } from '../types/database';

type Projection = Database['public']['Tables']['preseason_projections']['Row'];
type ProjectionCategory = Database['public']['Tables']['preseason_projections']['Row']['category'];

const TEAM_CATEGORIES: { key: ProjectionCategory; label: string }[] = [
  { key: 'acc_champ', label: 'ACC Champion' },
  { key: 'big10_champ', label: 'Big Ten Champion' },
  { key: 'big12_champ', label: 'Big 12 Champion' },
  { key: 'sec_champ', label: 'SEC Champion' },
  { key: 'g5_rep', label: 'Group of 5 Playoff Rep' },
];
const AT_LARGE_SLOTS = 7;
const HEISMAN_FINALIST_SLOTS = 3;

export function PreseasonProjections() {
  const { player, isAdmin } = useAuth();
  const { season } = useCurrentSeason();
  const { players } = usePlayers();
  const teams = useTeams();

  const [viewingPlayerId, setViewingPlayerId] = useState<string | null>(null);
  const [rows, setRows] = useState<Projection[]>([]);
  const [lockedAt, setLockedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const effectivePlayerId = viewingPlayerId ?? player?.id ?? null;
  const locked = !isAdmin && !!lockedAt && new Date(lockedAt).getTime() <= Date.now();

  useEffect(() => {
    if (!season) return;
    let cancelled = false;
    (async () => {
      // Lock time = earliest game kickoff in the season (i.e. Week 0's kickoff).
      const { data: weekRows } = await supabase.from('weeks').select('id').eq('season_id', season.id);
      const weekIds = (weekRows ?? []).map((w) => w.id);
      if (!weekIds.length) {
        if (!cancelled) setLockedAt(null);
        return;
      }
      const { data: gameRows } = await supabase
        .from('games').select('kickoff_at').in('week_id', weekIds)
        .order('kickoff_at').limit(1);
      if (!cancelled) setLockedAt(gameRows?.[0]?.kickoff_at ?? null);
    })();
    return () => { cancelled = true; };
  }, [season]);

  useEffect(() => {
    if (!season || !effectivePlayerId) return;
    setLoading(true);
    supabase
      .from('preseason_projections')
      .select('*')
      .eq('season_id', season.id)
      .eq('player_id', effectivePlayerId)
      .then(({ data }) => {
        setRows(data ?? []);
        setLoading(false);
      });
  }, [season, effectivePlayerId]);

  const byKey = useMemo(() => {
    const map = new Map<string, Projection>();
    for (const r of rows) map.set(`${r.category}:${r.slot}`, r);
    return map;
  }, [rows]);

  async function saveTeamPick(category: ProjectionCategory, slot: number, teamId: string) {
    if (!season || !effectivePlayerId || !lockedAt) return;
    const { data, error } = await supabase
      .from('preseason_projections')
      .upsert(
        { season_id: season.id, player_id: effectivePlayerId, category, slot, team_id: teamId, locked_at: lockedAt },
        { onConflict: 'season_id,player_id,category,slot' },
      )
      .select()
      .single();
    if (!error && data) {
      setRows((prev) => [...prev.filter((r) => !(r.category === category && r.slot === slot)), data]);
    }
  }

  async function saveNamePick(category: ProjectionCategory, slot: number, name: string) {
    if (!season || !effectivePlayerId || !lockedAt || !name.trim()) return;
    const { data, error } = await supabase
      .from('preseason_projections')
      .upsert(
        { season_id: season.id, player_id: effectivePlayerId, category, slot, player_name: name.trim(), locked_at: lockedAt },
        { onConflict: 'season_id,player_id,category,slot' },
      )
      .select()
      .single();
    if (!error && data) {
      setRows((prev) => [...prev.filter((r) => !(r.category === category && r.slot === slot)), data]);
    }
  }

  if (!season) return <p>Loading...</p>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Preseason Projections — {season.year}</h1>
        {isAdmin && (
          <select value={viewingPlayerId ?? player?.id ?? ''} onChange={(e) => setViewingPlayerId(e.target.value)}>
            {players.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        )}
      </div>

      {locked && <p className="tag tag-locked">Locked — Week 0 has kicked off</p>}
      {!lockedAt && <p className="hint">Projections unlock for editing once the admin posts Week 0 games; you can still fill them in now.</p>}

      {loading ? <p>Loading...</p> : (
        <div className="projection-form">
          <section>
            <h2>Conference Champions</h2>
            {TEAM_CATEGORIES.map(({ key, label }) => (
              <TeamField
                key={key}
                label={label}
                teams={teams}
                disabled={locked}
                value={byKey.get(`${key}:1`)?.team_id ?? ''}
                onChange={(teamId) => saveTeamPick(key, 1, teamId)}
              />
            ))}
          </section>

          <section>
            <h2>7 At-Large Bids</h2>
            {Array.from({ length: AT_LARGE_SLOTS }, (_, i) => i + 1).map((slot) => (
              <TeamField
                key={slot}
                label={`At-large #${slot}`}
                teams={teams}
                disabled={locked}
                value={byKey.get(`at_large:${slot}`)?.team_id ?? ''}
                onChange={(teamId) => saveTeamPick('at_large', slot, teamId)}
              />
            ))}
          </section>

          <section>
            <h2>National Champion</h2>
            <TeamField
              label="National Champion"
              teams={teams}
              disabled={locked}
              value={byKey.get('national_champion:1')?.team_id ?? ''}
              onChange={(teamId) => saveTeamPick('national_champion', 1, teamId)}
            />
          </section>

          <section>
            <h2>Heisman</h2>
            {Array.from({ length: HEISMAN_FINALIST_SLOTS }, (_, i) => i + 1).map((slot) => (
              <NameField
                key={slot}
                label={`Finalist #${slot}`}
                disabled={locked}
                defaultValue={byKey.get(`heisman_finalist:${slot}`)?.player_name ?? ''}
                onSave={(name) => saveNamePick('heisman_finalist', slot, name)}
              />
            ))}
            <NameField
              label="Winner"
              disabled={locked}
              defaultValue={byKey.get('heisman_winner:1')?.player_name ?? ''}
              onSave={(name) => saveNamePick('heisman_winner', 1, name)}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function TeamField({ label, teams, value, disabled, onChange }: {
  label: string;
  teams: { id: string; name: string }[];
  value: string;
  disabled: boolean;
  onChange: (teamId: string) => void;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => e.target.value && onChange(e.target.value)}>
        <option value="">— choose a team —</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  );
}

function NameField({ label, defaultValue, disabled, onSave }: {
  label: string;
  defaultValue: string;
  disabled: boolean;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  useEffect(() => setValue(defaultValue), [defaultValue]);
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onSave(value)}
      />
    </label>
  );
}
