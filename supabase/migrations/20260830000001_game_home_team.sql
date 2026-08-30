-- Distinguish which team hosts a game. Previously every matchup was rendered
-- "underdog at favorite", implicitly treating the favorite as the home team.
-- home_team_id NULL means a neutral-site game (paired with the neutral_site label).

alter table public.games
  add column home_team_id uuid references public.teams (id);

alter table public.games
  add constraint games_home_team_valid
  check (home_team_id is null or home_team_id in (favorite_team_id, underdog_team_id));

-- Preserve today's display for existing non-neutral games: favorite was home.
update public.games set home_team_id = favorite_team_id where neutral_site is null;
