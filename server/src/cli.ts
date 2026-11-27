/**
 * Administrator setup, run where the server runs:
 *   node server/src/cli.ts make-admin <username>
 *   node server/src/cli.ts remove-admin <username>
 */
import { usernameKey } from '../../src/accounts/rules.ts';
import { readConfig } from './config.ts';
import { Store } from './store.ts';

const [command, username] = process.argv.slice(2);
const roles: Record<string, 'admin' | 'player'> = {
  'make-admin': 'admin',
  'remove-admin': 'player',
};

if (!roles[command] || !username) {
  console.error('Usage: node server/src/cli.ts make-admin|remove-admin <username>');
  process.exit(2);
}

const store = new Store(readConfig().databaseUrl);
try {
  await store.migrate();
  const changed = await store.setRole(usernameKey(username), roles[command]);
  console.log(
    changed
      ? `${username} is now ${roles[command] === 'admin' ? 'an administrator' : 'a player'}.`
      : `No account named ${username}.`,
  );
  process.exitCode = changed ? 0 : 1;
} finally {
  await store.close();
}
