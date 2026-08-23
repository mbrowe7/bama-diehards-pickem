-- Canonical FBS team list (2025-season conference alignment, matching the
-- era of the historical 2024/2025 data being migrated). Conference labels
-- are informational only (not stored) -- this just documents groupings.
--
-- NOTE: spot-check this against the current season before relying on it.
-- Conference realignment (e.g. the Pac-12 rebuild taking effect in 2026)
-- means some teams' conferences have already changed, though that doesn't
-- affect this list since `teams` has no conference column. If a team is
-- missing, add it any time via `insert into teams (name) values (...)`  --
-- admins can do this from the Supabase dashboard or (once built) the
-- Build Week page's "add team" affordance.

insert into public.teams (name) values
  -- ACC
  ('Boston College'), ('California'), ('Clemson'), ('Duke'), ('Florida State'),
  ('Georgia Tech'), ('Louisville'), ('Miami'), ('NC State'), ('North Carolina'),
  ('Pittsburgh'), ('SMU'), ('Stanford'), ('Syracuse'), ('Virginia'),
  ('Virginia Tech'), ('Wake Forest'),
  -- Big Ten
  ('Illinois'), ('Indiana'), ('Iowa'), ('Maryland'), ('Michigan'),
  ('Michigan State'), ('Minnesota'), ('Nebraska'), ('Northwestern'), ('Ohio State'),
  ('Oregon'), ('Penn State'), ('Purdue'), ('Rutgers'), ('UCLA'),
  ('USC'), ('Washington'), ('Wisconsin'),
  -- Big 12
  ('Arizona'), ('Arizona State'), ('Baylor'), ('BYU'), ('Cincinnati'),
  ('Colorado'), ('Houston'), ('Iowa State'), ('Kansas'), ('Kansas State'),
  ('Oklahoma State'), ('TCU'), ('Texas Tech'), ('UCF'), ('Utah'), ('West Virginia'),
  -- SEC
  ('Alabama'), ('Arkansas'), ('Auburn'), ('Florida'), ('Georgia'),
  ('Kentucky'), ('LSU'), ('Mississippi State'), ('Missouri'), ('Oklahoma'),
  ('Ole Miss'), ('South Carolina'), ('Tennessee'), ('Texas'), ('Texas A&M'), ('Vanderbilt'),
  -- Independents
  ('Notre Dame'), ('UConn'), ('UMass'),
  -- American Athletic Conference
  ('Army'), ('Charlotte'), ('East Carolina'), ('Florida Atlantic'), ('Memphis'),
  ('Navy'), ('North Texas'), ('Rice'), ('South Florida'), ('Temple'),
  ('Tulane'), ('Tulsa'), ('UAB'), ('UTSA'),
  -- Conference USA
  ('Delaware'), ('FIU'), ('Jacksonville State'), ('Kennesaw State'), ('Liberty'),
  ('Louisiana Tech'), ('Middle Tennessee'), ('Missouri State'), ('New Mexico State'),
  ('Sam Houston'), ('UTEP'), ('Western Kentucky'),
  -- MAC
  ('Akron'), ('Ball State'), ('Bowling Green'), ('Buffalo'), ('Central Michigan'),
  ('Eastern Michigan'), ('Kent State'), ('Miami (OH)'), ('Northern Illinois'),
  ('Ohio'), ('Toledo'), ('Western Michigan'),
  -- Mountain West
  ('Air Force'), ('Boise State'), ('Colorado State'), ('Fresno State'), ('Hawai''i'),
  ('Nevada'), ('New Mexico'), ('San Diego State'), ('San Jose State'), ('UNLV'),
  ('Utah State'), ('Wyoming'),
  -- Pac-12 (2025: rebuilding around two legacy members)
  ('Oregon State'), ('Washington State'),
  -- Sun Belt
  ('Appalachian State'), ('Arkansas State'), ('Coastal Carolina'), ('Georgia Southern'),
  ('Georgia State'), ('James Madison'), ('Louisiana'), ('Louisiana-Monroe'), ('Marshall'),
  ('Old Dominion'), ('South Alabama'), ('Southern Miss'), ('Texas State'), ('Troy'),
  -- FCS teams that show up occasionally as G5/FBS opponents in this league's schedule
  ('Montana State'), ('North Dakota State'), ('Sacramento State'),
  ('Mercer'), ('Eastern Illinois')
on conflict (name) do nothing;
