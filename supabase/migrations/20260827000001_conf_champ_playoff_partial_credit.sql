-- Conference-champ picks that miss the title but still make the playoff:
-- partial credit.
--
-- Rule clarification from the group: if you pick a team to win its
-- conference and it does NOT win that conference but still reaches the
-- 12-team playoff field (as an at-large team, another conference's champ,
-- or the Group-of-5 rep), you earn the at-large value (correct_at_large)
-- instead of the full conference-champ value (correct_conf_champ) -- and
-- nothing at all if the team misses the field entirely.
--
-- Only public.standings needs to change: preseason points are season-level,
-- so weekly_standings is unaffected. Everything else in the view is copied
-- verbatim from 20260823000004_pushes_as_ties.sql.

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
    sum(coalesce(earned.points, 0)) as points
  from public.preseason_projections pp
  left join lateral (
    -- Direct hit: the projection matches an actual outcome in its own category.
    -- (at_large / heisman_finalist are graded as sets -- any slot counts.)
    select sr.points
    from public.scoring_rules sr
    where sr.season_id = pp.season_id
      and sr.rule_key = case pp.category
        when 'heisman_finalist' then 'correct_heisman_finalist'
        when 'heisman_winner' then 'correct_heisman_winner'
        when 'national_champion' then 'correct_national_champ'
        when 'at_large' then 'correct_at_large'
        else 'correct_conf_champ' -- acc_champ, big10_champ, big12_champ, sec_champ, g5_rep
      end
      and exists (
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

    union all

    -- Partial credit: a conference-champ pick whose team missed that
    -- conference title but still reached the 12-team field scores the
    -- at-large value. Mutually exclusive with the branch above (that one
    -- requires the same-category match; this one requires its absence).
    select sr.points
    from public.scoring_rules sr
    where sr.season_id = pp.season_id
      and sr.rule_key = 'correct_at_large'
      and pp.category in ('acc_champ', 'big10_champ', 'big12_champ', 'sec_champ', 'g5_rep')
      and pp.team_id is not null
      and not exists (
        select 1 from public.season_outcomes so
        where so.season_id = pp.season_id
          and so.category = pp.category
          and so.team_id = pp.team_id
      )
      and exists (
        select 1 from public.season_outcomes so
        where so.season_id = pp.season_id
          and so.category in (
            'acc_champ', 'big10_champ', 'big12_champ', 'sec_champ', 'g5_rep', 'at_large'
          )
          and so.team_id = pp.team_id
      )
  ) earned on true
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
