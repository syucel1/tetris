/** Starts the account API: migrates the database, then serves HTTP until stopped. */
import { createServer } from 'node:http';
import { createApp } from './app.ts';
import { readConfig } from './config.ts';
import { log } from './log.ts';
import { Store } from './store.ts';

const SESSION_CLEANUP_MS = 60 * 60 * 1000;

const config = readConfig();
const store = new Store(config.databaseUrl);

// The database container may still be starting: retry for about a minute.
for (let attempt = 1; ; attempt++) {
  try {
    await store.migrate();
    break;
  } catch (error) {
    if (attempt >= 30) throw error;
    log('WARN', 'database_unavailable', { attempt });
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

const server = createServer(createApp(store, config));
server.requestTimeout = 15_000;
server.listen(config.port, () => log('INFO', 'server_started', { port: config.port }));

const cleanup = setInterval(
  () =>
    store
      .deleteExpiredSessions()
      .catch((error) => log('WARN', 'session_cleanup_failed', { error: String(error) })),
  SESSION_CLEANUP_MS,
);

function shutdown() {
  log('INFO', 'server_stopping');
  clearInterval(cleanup);
  server.close(() => store.close().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
