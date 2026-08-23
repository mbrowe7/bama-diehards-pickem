-- Standings: computed live from picks + bonus_picks + preseason_projections,
-- never stored. One row per (season, player).
--
-- Preseason grading matches by category + team_id/player_name against
-- season_outcomes, ignoring `slot` — at_large and heisman_finalist are sets
-- (any of your 7/3 picks appearing in the actual outcomes counts), not
-- ordered pairings.

create view public.standings
with (security_invoker = true) as
with pick_agg as (
  select
    w.season_id,
    p.player_id,
    sum(case when p.is_correct then sr.points else 0 end) as points,
    count(*) filter (where p.is_correct = true) as wins,
    count(*) filter (where p.is_correct = false) as losses
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
  coalesce(pk.losses, 0) + coalesce(bn.losses, 0) as losses
from public.seasons s
cross join public.players pl
left join pick_agg pk on pk.season_id = s.id and pk.player_id = pl.id
left join bonus_agg bn on bn.season_id = s.id and bn.player_id = pl.id
left join preseason_agg ps on ps.season_id = s.id and ps.player_id = pl.id;

grant select on public.standings to authenticated;
