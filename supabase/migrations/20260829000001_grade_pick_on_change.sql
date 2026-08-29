-- Grade a pick the moment it is inserted or changed.
--
-- Until now `picks.outcome` was only ever written by `grade_picks_for_game`,
-- which fires when a game's `result` changes. If an admin scored a game first
-- and a player then edited their pick (e.g. switched sides in This Week after
-- results were entered), the pick kept the stale `outcome` computed against
-- the old team -- so a now-correct pick could still show as a loss.
--
-- Fix: a BEFORE INSERT OR UPDATE trigger on `picks` that recomputes `outcome`
-- from the game's current result every time the row is written. This mirrors
-- the per-result logic in `grade_picks_for_game` (including pushes-as-ties)
-- but for a single pick. The two triggers stay in agreement; keeping both
-- means grading is correct whichever side changes.

create function public.grade_one_pick()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  g record;
  season_pushes_are_ties boolean;
begin
  select gm.result, gm.favorite_team_id, gm.underdog_team_id, gm.week_id
    into g
  from public.games gm
  where gm.id = new.game_id;

  if g.result is null then
    new.outcome := null;
  elsif g.result = 'push' then
    select s.pushes_are_ties into season_pushes_are_ties
    from public.weeks w
    join public.seasons s on s.id = w.season_id
    where w.id = g.week_id;

    new.outcome := case when season_pushes_are_ties then 'push' else 'loss' end;
  else
    new.outcome := case
      when (g.result = 'favorite_covered' and new.team_id = g.favorite_team_id)
        or (g.result = 'underdog_covered' and new.team_id = g.underdog_team_id)
      then 'win' else 'loss'
    end;
  end if;

  return new;
end;
$$;

create trigger picks_grade_on_change
  before insert or update on public.picks
  for each row execute function public.grade_one_pick();

-- Backfill: fix any picks whose stored outcome disagrees with a re-grade
-- (a no-op UPDATE fires the new trigger).
update public.picks set team_id = team_id;
