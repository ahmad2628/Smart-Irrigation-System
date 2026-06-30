// MySQL returns DATETIME/TIMESTAMP columns as strings like '2026-05-13 08:28:57'
// (UTC, no timezone marker). JS interprets bare strings as local time, which
// silently breaks duration math. Always pass DB timestamps through here.
export function parseDbTimestamp(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  return new Date(s.replace(' ', 'T') + 'Z');
}

export function secondsSince(dbTimestamp) {
  const d = parseDbTimestamp(dbTimestamp);
  if (!d) return 0;
  return Math.floor((Date.now() - d.getTime()) / 1000);
}
