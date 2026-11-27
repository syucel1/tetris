/** One JSON line per event on stdout/stderr. Never pass passwords, codes or tokens. */
type Level = 'INFO' | 'WARN' | 'ERROR';

export function log(level: Level, event: string, details: Record<string, unknown> = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...details });
  if (level === 'INFO') console.log(line);
  else console.error(line);
}
