-- Bama Diehards Pick 'Em: core schema
-- Bonus picks are modeled separately from games/picks: each player enters their
-- own free-text team+spread for the weekly bonus rather than picking a side of
-- a shared line (confirmed against the historical spreadsheet data).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------
create table public.players (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role text not null default 'player' check (role in ('player', 'admin')),
  created_at timestamptz not null default now()
);

-- Auto-provision a players row whenever someone signs up via Supabase Auth.
-- display_name defaults to the email local-part; admin renames it afterward.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.players (id, display_name, role)
  values (new.id, split_part(new.email, '@', 1), 'player');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- ---------------------------------------------------------------------------
-- seasons / weeks
-- ---------------------------------------------------------------------------
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  year int not null unique
);

create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  label text not null,
  sort_order int not null,
  unique (season_id, label)
);

-- ---------------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks (id) on delete cascade,
  favorite_team_id uuid not null references public.teams (id),
  underdog_team_id uuid not null references public.teams (id),
  spread numeric not null check (spread >= 0),
  neutral_site text,
  kickoff_at timestamptz not null,
  favorite_score int check (favorite_score is null or favorite_score >= 0),
  underdog_score int check (underdog_score is null or underdog_score >= 0),
  result text check (result in ('favorite_covered', 'underdog_covered', 'push')),
  check (favorite_team_id <> underdog_team_id)
);

create index games_week_id_idx on public.games (week_id);

-- Compute `result` from the scores + spread whenever both scores are present.
-- A push (margin exactly equals the spread) is stored distinctly for
-- record-keeping even though it always grades as a loss for every pick.
create function public.compute_game_result()
returns trigger
language plpgsql
as $$
declare
  margin numeric;
begin
  if new.favorite_score is not null and new.underdog_score is not null then
    margin := new.favorite_score - new.underdog_score;
    if margin > new.spread then
      new.result := 'favorite_covered';
    elsif margin < new.spread then
      new.result := 'underdog_covered';
    else
      new.result := 'push';
    end if;
  else
    new.result := null;
  end if;
  return new;
end;
$$;

create trigger games_compute_result
  before insert or update on public.games
  for each row execute function public.compute_game_result();

-- Grade every pick on a game automatically once its result is known.
-- Pushes score as a loss for everyone, per the group's rule.
create function public.grade_picks_for_game()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.result is distinct from old.result then
    if new.result is null then
      update public.picks set is_correct = null where game_id = new.id;
    elsif new.result = 'push' then
      update public.picks set is_correct = false where game_id = new.id;
    else
      update public.picks
        set is_correct = (
          (new.result = 'favorite_covered' and team_id = new.favorite_team_id)
          or (new.result = 'underdog_covered' and team_id = new.underdog_team_id)
        )
        where game_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger games_grade_picks
  after update on public.games
  for each row execute function public.grade_picks_for_game();

-- ---------------------------------------------------------------------------
-- picks (against the spread, per regular game)
-- ---------------------------------------------------------------------------
create table public.picks (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  team_id uuid not null references public.teams (id),
  submitted_at timestamptz not null default now(),
  submitted_by uuid not null references public.players (id),
  is_correct boolean,
  unique (game_id, player_id)
);

create index picks_player_id_idx on public.picks (player_id);

-- A pick's team must actually be one of the two teams in its game.
create function public.validate_pick_team()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  fav uuid;
  dog uuid;
begin
  select favorite_team_id, underdog_team_id into fav, dog
  from public.games where id = new.game_id;

  if new.team_id <> fav and new.team_id <> dog then
    raise exception 'picked team must be one of the two teams in the game';
  end if;
  return new;
end;
$$;

create trigger picks_validate_team
  before insert or update on public.picks
  for each row execute function public.validate_pick_team();

-- ---------------------------------------------------------------------------
-- bonus_picks (free-form: player names their own team+spread each week)
-- ---------------------------------------------------------------------------
-- No unique(week_id, player_id): the historical Bowls/Playoffs "week" turned
-- out to actually bundle several bonus rounds under one label, so a player
-- can have more than one bonus pick in the same week. The app's normal
-- weekly flow should still only ever create one, via upsert -- this is a
-- migration-fidelity accommodation, not an intended multi-bonus feature.
create table public.bonus_picks (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  description text not null,
  submitted_at timestamptz not null default now(),
  submitted_by uuid not null references public.players (id),
  is_correct boolean
);

create index bonus_picks_player_id_idx on public.bonus_picks (player_id);

-- ---------------------------------------------------------------------------
-- scoring_rules
-- ---------------------------------------------------------------------------
create table public.scoring_rules (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  rule_key text not null check (rule_key in (
    'correct_pick',
    'correct_bonus',
    'correct_conf_champ',
    'correct_at_large',
    'correct_heisman_finalist',
    'correct_heisman_winner',
    'correct_national_champ'
  )),
  points numeric not null,
  unique (season_id, rule_key)
);

-- ---------------------------------------------------------------------------
-- preseason_projections (locked at Week 0 kickoff)
-- ---------------------------------------------------------------------------
create table public.preseason_projections (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  category text not null check (category in (
    'acc_champ', 'big10_champ', 'big12_champ', 'sec_champ',
    'g5_rep', 'at_large', 'heisman_finalist', 'heisman_winner', 'national_champion'
  )),
  -- slot distinguishes the multi-value categories: at_large (1-7), heisman_finalist (1-3).
  -- single-value categories always use slot 1.
  slot int not null default 1,
  team_id uuid references public.teams (id),
  player_name text,
  locked_at timestamptz not null,
  unique (season_id, player_id, category, slot),
  check (
    (category in ('acc_champ', 'big10_champ', 'big12_champ', 'sec_champ', 'g5_rep', 'at_large')
      and team_id is not null and player_name is null)
    or
    (category in ('heisman_finalist', 'heisman_winner')
      and player_name is not null and team_id is null)
    or
    (category = 'national_champion' and team_id is not null and player_name is null)
  )
);

-- ---------------------------------------------------------------------------
-- season_outcomes (admin-entered actual results, graded against projections)
-- ---------------------------------------------------------------------------
create table public.season_outcomes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  category text not null check (category in (
    'acc_champ', 'big10_champ', 'big12_champ', 'sec_champ',
    'g5_rep', 'at_large', 'heisman_finalist', 'heisman_winner', 'national_champion'
  )),
  slot int not null default 1,
  team_id uuid references public.teams (id),
  player_name text,
  unique (season_id, category, slot)
);
