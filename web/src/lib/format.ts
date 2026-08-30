export function formatTime(iso: string) {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const suffix = h >= 12 ? 'p' : 'a';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, '0')}${suffix}`;
}

export function formatShortDayDate(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  return `${day} ${d.getMonth() + 1}/${d.getDate()} ${formatTime(iso)}`;
}

export function formatShortDayTime(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  return `${day} ${formatTime(iso)}`;
}

export function spreadText(spread: number, negative: boolean) {
  return `${negative ? '−' : '+'}${spread}`;
}

type MatchupTeam = { id: string; name: string };
type MatchupGame = {
  home_team_id: string | null;
  favorite_team: MatchupTeam;
  underdog_team: MatchupTeam;
};

// Away team first, home team second. Neutral-site games and the common
// "favorite is home" case keep the existing underdog→favorite order; only an
// underdog-hosted game flips it. `isFavorite` drives the spread sign, which
// stays with the team regardless of position.
export function orderedMatchup(g: MatchupGame) {
  const fav = { team: g.favorite_team, isFavorite: true };
  const dog = { team: g.underdog_team, isFavorite: false };
  const sides = g.home_team_id === g.underdog_team.id ? [fav, dog] : [dog, fav];
  return { sides, neutral: g.home_team_id == null };
}
