-- Final standings override: for completed seasons, the league's own
-- "Standings" tab in the source spreadsheet is the record of truth (it may
-- diverge slightly from what a naive re-grade of individual picks produces,
-- e.g. mid-season manual corrections that weren't reflected in every
-- underlying pick). When a season has rows here, the History page displays
-- these instead of recomputing from picks/bonus_picks/preseason_projections.
-- Seasons without rows here (e.g. the current in-progress season) keep using
-- the live public.standings view.

create table public.season_final_standings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  rank int not null,
  total_points int not null,
  wins int not null,
  losses int not null,
  ties int not null default 0,
  unique (season_id, player_id),
  unique (season_id, rank)
);

alter table public.season_final_standings enable row level security;

create policy "season_final_standings_select" on public.season_final_standings
  for select to authenticated using (true);

grant select on public.season_final_standings to authenticated;
