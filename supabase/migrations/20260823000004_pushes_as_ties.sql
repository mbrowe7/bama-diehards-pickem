-- Pushes-as-ties: starting with the next season created after this
-- migration, a push grades as a tie (counts against nobody) instead of a
-- loss for everyone. Existing (historical) seasons keep the old behavior
-- so their recorded records stay exactly as migrated from the spreadsheet.

alter table public.seasons
  add column pushes_are_ties boolean not null default true;

-- Only seasons before 2026 predate this rule -- pin those to the old
-- behavior. The 2026 season (and beyond) keeps the column's true default.
update public.seasons set pushes_are_ties = false where year < 2026;

-- picks.is_correct (boolean) can't represent win/loss/push distinctly.
-- Replace it with a tri-state outcome column.
alter table public.picks add column outcome text check (outcome in ('win', 'loss', 'push'));

update public.picks
  set outcome = case is_correct when true then 'win' when false then 'loss' else null end;

alter table public.picks drop column is_correct;

create or replace function public.grade_picks_for_game()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  season_pushes_are_ties boolean;
begin
  if new.result is distinct from old.result then
    if new.result is null then
      update public.picks set outcome = null where game_id = new.id;
    elsif new.result = 'push' then
      select s.pushes_are_ties into season_pushes_are_ties
      from public.weeks w
      join public.seasons s on s.id = w.season_id
      where w.id = new.week_id;

      update public.picks
        set outcome = case when season_pushes_are_ties then 'push' else 'loss' end
        where game_id = new.id;
    else
      update public.picks
        set outcome = case
          when (new.result = 'favorite_covered' and team_id = new.favorite_team_id)
            or (new.result = 'underdog_covered' and team_id = new.underdog_team_id)
          then 'win' else 'loss'
        end
        where game_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

create or replace view public.standings
with (security_invoker = true) as
with pick_agg as (
  select
    w.season_id,
    p.player_id,
    sum(case when p.outcome = 'win' then sr.points else 0 end) as points,
    count(*) filter (where p.outcome = 'win') as wins,
    count(*) filter (where p.outcome = 'loss') as losses,
    count(*) filter (where p.outcome = 'push') as ties
  from public.picks p
  join public.games g on g.id = p.game_id
  join public.weeks w on w.id = g.week_id
  join public.scoring_rules sr
    on sr.season_id = w.season_id and sr.rule_key = 'correct_pick'
  group by w.season_id, p.player_id
),
bonus_agg as (
  select
    w.season_id,
    bp.player_id,
    sum(case when bp.is_correct then sr.points else 0 end) as points,
    count(*) filter (where bp.is_correct = true) as wins,
    count(*) filter (where bp.is_correct = false) as losses
  from public.bonus_picks bp
  join public.weeks w on w.id = bp.week_id
  join public.scoring_rules sr
    on sr.season_id = w.season_id and sr.rule_key = 'correct_bonus'
  group by w.season_id, bp.player_id
),
preseason_agg as (
  select
    pp.season_id,
    pp.player_id,
    sum(sr.points) as points
  from public.preseason_projections pp
  join public.scoring_rules sr
    on sr.season_id = pp.season_id
    and sr.rule_key = case pp.category
      when 'heisman_finalist' then 'correct_heisman_finalist'
      when 'heisman_winner' then 'correct_heisman_winner'
      when 'national_champion' then 'correct_national_champ'
      when 'at_large' then 'correct_at_large'
      else 'correct_conf_champ' -- acc_champ, big10_champ, big12_champ, sec_champ, g5_rep
    end
  where exists (
    select 1 from public.season_outcomes so
    where so.season_id = pp.season_id
      and so.category = pp.category
      and (
        (pp.team_id is not null and so.team_id = pp.team_id)
        or (
          pp.player_name is not null and so.player_name is not null
          and lower(so.player_name) = lower(pp.player_name)
        )
      )
  )
  group by pp.season_id, pp.player_id
)
select
  s.id as season_id,
  s.year as season_year,
  pl.id as player_id,
  pl.display_name,
  coalesce(pk.points, 0) + coalesce(bn.points, 0) + coalesce(ps.points, 0) as total_points,
  coalesce(pk.points, 0) as pick_points,
  coalesce(bn.points, 0) as bonus_points,
  coalesce(ps.points, 0) as preseason_points,
  coalesce(pk.wins, 0) + coalesce(bn.wins, 0) as wins,
  coalesce(pk.losses, 0) + coalesce(bn.losses, 0) as losses,
  coalesce(pk.ties, 0) as ties
from public.seasons s
cross join public.players pl
left join pick_agg pk on pk.season_id = s.id and pk.player_id = pl.id
left join bonus_agg bn on bn.season_id = s.id and bn.player_id = pl.id
left join preseason_agg ps on ps.season_id = s.id and ps.player_id = pl.id;

grant select on public.standings to authenticated;
