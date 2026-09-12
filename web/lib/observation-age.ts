/** Human-readable display only. Execution freshness still uses the on-chain policy. */
export function observationAge(timestamp: number, now: number): string {
  if (!now) return 'Calculating age…';
  if (timestamp > now) return 'Future timestamp';
  const seconds = Math.floor(now - timestamp);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h${remainder ? ` ${remainder}m` : ''} ago`;
}
