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
