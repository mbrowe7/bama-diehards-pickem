-- Preseason projections previously locked dynamically (at Week 0's earliest
-- kickoff). Replace that with a fixed, admin-set cutoff per season so the
-- lock time doesn't depend on when games get posted. Admins can still edit
-- after the cutoff -- only players are locked out (enforced client-side,
-- same as before).

alter table public.seasons
  add column preseason_lock_at timestamptz;

-- 2026 preseason locks 3:00 PM ET (EDT, UTC-4) on August 29, 2026.
update public.seasons set preseason_lock_at = '2026-08-29 15:00:00-04'
  where year = 2026;
