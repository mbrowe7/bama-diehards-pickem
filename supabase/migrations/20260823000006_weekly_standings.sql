-- Weekly standings: same shape as public.standings, but scoped to a single
-- week instead of a whole season. Powers the Standings page's week toggle.
-- No preseason points here -- those are season-level only.

create view public.weekly_standings
with (security_invoker = true) as
with pick_agg as (
  select
    g.week_id,
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
  group by g.week_id, p.player_id
),
bonus_agg as (
  select
    bp.week_id,
    bp.player_id,
    sum(case when bp.is_correct then sr.points else 0 end) as points,
    count(*) filter (where bp.is_correct = true) as wins,
    count(*) filter (where bp.is_correct = false) as losses
  from public.bonus_picks bp
  join public.weeks w on w.id = bp.week_id
  join public.scoring_rules sr
    on sr.season_id = w.season_id and sr.rule_key = 'correct_bonus'
  group by bp.week_id, bp.player_id
)
select
  w.id as week_id,
  w.season_id,
  w.label as week_label,
  w.sort_order,
  pl.id as player_id,
  pl.display_name,
  coalesce(pk.points, 0) + coalesce(bn.points, 0) as total_points,
  coalesce(pk.points, 0) as pick_points,
  coalesce(bn.points, 0) as bonus_points,
  coalesce(pk.wins, 0) + coalesce(bn.wins, 0) as wins,
  coalesce(pk.losses, 0) + coalesce(bn.losses, 0) as losses,
  coalesce(pk.ties, 0) as ties
from public.weeks w
cross join public.players pl
left join pick_agg pk on pk.week_id = w.id and pk.player_id = pl.id
left join bonus_agg bn on bn.week_id = w.id and bn.player_id = pl.id;

grant select on public.weekly_standings to authenticated;
