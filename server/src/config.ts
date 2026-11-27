/** Server settings from environment variables, with safe local defaults. */
export type Config = {
  port: number;
  databaseUrl: string;
  /** Mark the session cookie Secure. Turn on whenever the site is served over HTTPS. */
  cookieSecure: boolean;
  sessionDays: number;
  /** Trust the first X-Forwarded-For address (set when running behind the Nginx proxy). */
  trustProxy: boolean;
};

const flag = (value: string | undefined) => value === 'true' || value === '1';

export function readConfig(env: Record<string, string | undefined> = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error('DATABASE_URL is required, e.g. postgres://user:pass@db/tetris');
  const port = Number(env.PORT ?? 3000);
  const sessionDays = Number(env.SESSION_DAYS ?? 30);
  if (!Number.isInteger(port) || port <= 0) throw new Error('PORT must be a positive integer');
  if (!(sessionDays > 0)) throw new Error('SESSION_DAYS must be positive');
  return {
    port,
    databaseUrl,
    cookieSecure: flag(env.COOKIE_SECURE),
    sessionDays,
    trustProxy: flag(env.TRUST_PROXY),
  };
}
