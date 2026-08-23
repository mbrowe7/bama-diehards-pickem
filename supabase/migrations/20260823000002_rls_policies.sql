-- Row Level Security policies

create function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.players where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- players: everyone can read (needed for display names across the app);
-- a player may update their own row (e.g. display_name) but not their role;
-- only admins may change roles or insert/delete players.
-- ---------------------------------------------------------------------------
alter table public.players enable row level security;

create policy "players_select_all" on public.players
  for select to authenticated using (true);

create policy "players_update_self" on public.players
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "players_admin_write" on public.players
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- RLS with-check can't compare against the pre-update value of the same row
-- (a subquery in WITH CHECK already sees the new value), so role-escalation
-- protection has to be a trigger instead. Triggers aren't skipped by the
-- service role the way RLS policies are, so this must also allow the
-- service-role/direct-Postgres case (auth.uid() is null there) -- otherwise
-- even legitimate admin tooling run with the service key gets blocked.
create function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role <> old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'only admins can change player roles';
  end if;
  return new;
end;
$$;

create trigger players_role_change_guard
  before update on public.players
  for each row execute function public.prevent_role_self_escalation();

-- ---------------------------------------------------------------------------
-- teams, seasons, weeks, scoring_rules: read-only for players, admin-writable
-- ---------------------------------------------------------------------------
alter table public.teams enable row level security;
create policy "teams_select_all" on public.teams for select to authenticated using (true);
create policy "teams_admin_write" on public.teams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.seasons enable row level security;
create policy "seasons_select_all" on public.seasons for select to authenticated using (true);
create policy "seasons_admin_write" on public.seasons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.weeks enable row level security;
create policy "weeks_select_all" on public.weeks for select to authenticated using (true);
create policy "weeks_admin_write" on public.weeks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.scoring_rules enable row level security;
create policy "scoring_rules_select_all" on public.scoring_rules for select to authenticated using (true);
create policy "scoring_rules_admin_write" on public.scoring_rules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- games: read-only for players, admin-writable
-- ---------------------------------------------------------------------------
alter table public.games enable row level security;
create policy "games_select_all" on public.games for select to authenticated using (true);
create policy "games_admin_write" on public.games for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- picks: a player may insert/update their own pick while the game hasn't
-- kicked off; admin may write any player's pick at any time (for corrections,
-- and for entering picks on behalf of players who text/call them in).
-- Everyone can read all picks (no hidden-picks mechanic in this group).
-- ---------------------------------------------------------------------------
alter table public.picks enable row level security;

create policy "picks_select_all" on public.picks for select to authenticated using (true);

create policy "picks_player_write" on public.picks
  for insert to authenticated
  with check (
    player_id = auth.uid()
    and submitted_by = auth.uid()
    and exists (select 1 from public.games g where g.id = game_id and g.kickoff_at > now())
  );

create policy "picks_player_update" on public.picks
  for update to authenticated
  using (
    player_id = auth.uid()
    and exists (select 1 from public.games g where g.id = game_id and g.kickoff_at > now())
  )
  with check (
    player_id = auth.uid()
    and submitted_by = auth.uid()
    and exists (select 1 from public.games g where g.id = game_id and g.kickoff_at > now())
  );

create policy "picks_admin_write" on public.picks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- bonus_picks: same shape as picks, but there's no single game to check the
-- kickoff of. Lock point is the earliest kickoff among that week's games.
-- ---------------------------------------------------------------------------
alter table public.bonus_picks enable row level security;

create policy "bonus_picks_select_all" on public.bonus_picks for select to authenticated using (true);

create policy "bonus_picks_player_write" on public.bonus_picks
  for insert to authenticated
  with check (
    player_id = auth.uid()
    and submitted_by = auth.uid()
    and now() < coalesce((select min(g.kickoff_at) from public.games g where g.week_id = bonus_picks.week_id), 'infinity')
  );

create policy "bonus_picks_player_update" on public.bonus_picks
  for update to authenticated
  using (
    player_id = auth.uid()
    and now() < coalesce((select min(g.kickoff_at) from public.games g where g.week_id = bonus_picks.week_id), 'infinity')
  )
  with check (
    player_id = auth.uid()
    and submitted_by = auth.uid()
    and now() < coalesce((select min(g.kickoff_at) from public.games g where g.week_id = bonus_picks.week_id), 'infinity')
  );

create policy "bonus_picks_admin_write" on public.bonus_picks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- preseason_projections: player may insert/update their own rows before
-- locked_at; admin may write anytime.
-- ---------------------------------------------------------------------------
alter table public.preseason_projections enable row level security;

create policy "preseason_projections_select_all" on public.preseason_projections
  for select to authenticated using (true);

create policy "preseason_projections_player_write" on public.preseason_projections
  for insert to authenticated
  with check (player_id = auth.uid() and now() < locked_at);

create policy "preseason_projections_player_update" on public.preseason_projections
  for update to authenticated
  using (player_id = auth.uid() and now() < locked_at)
  with check (player_id = auth.uid());

create policy "preseason_projections_admin_write" on public.preseason_projections
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- season_outcomes: admin only writes actual results; everyone reads them
-- ---------------------------------------------------------------------------
alter table public.season_outcomes enable row level security;

create policy "season_outcomes_select_all" on public.season_outcomes
  for select to authenticated using (true);

create policy "season_outcomes_admin_write" on public.season_outcomes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
