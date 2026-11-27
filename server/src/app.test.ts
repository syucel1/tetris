/**
 * API tests against a real PostgreSQL database. Set TEST_DATABASE_URL to an empty, disposable
 * database to run them (its tables are dropped first); they are skipped otherwise.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.ts';
import { Store } from './store.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
const skip = databaseUrl ? false : 'set TEST_DATABASE_URL to run the API tests';

let store: Store;
let server: Server;
let base = '';

before(async () => {
  if (!databaseUrl) return;
  store = new Store(databaseUrl);
  await store.pool.query(
    'DROP TABLE IF EXISTS profiles, sessions, accounts, schema_migrations CASCADE',
  );
  await store.migrate();
  await store.migrate(); // Running again is a no-op.
  const config = {
    port: 0,
    databaseUrl,
    cookieSecure: false,
    sessionDays: 30,
    trustProxy: false,
  };
  server = createServer(createApp(store, config, { attemptLimit: 3, addressLimit: 100 }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (!databaseUrl) return;
  await new Promise((resolve) => server.close(resolve));
  await store.close();
});

/** A browser: keeps its own session cookie. */
function client() {
  let cookie = '';
  return {
    get cookie() {
      return cookie;
    },
    async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
      const res = await fetch(base + path, {
        method,
        headers: {
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...(cookie && { Cookie: cookie }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      const text = await res.text();
      return { status: res.status, headers: res.headers, data: text ? JSON.parse(text) : null };
    },
  };
}

test('sign up creates an account, a profile and an HttpOnly session', { skip }, async () => {
  const ana = client();
  const res = await ana.call('POST', '/api/auth/signup', {
    username: 'Ana',
    password: 'correct horse',
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.account.username, 'Ana');
  assert.equal(res.data.account.role, 'player');
  assert.equal(res.data.profile.settings.name, 'Ana');
  assert.equal(res.data.profile.best, 0);
  assert.match(res.data.recoveryCode, /^[A-Z0-9]{5}(-[A-Z0-9]{5}){3}$/);
  const setCookie = res.headers.get('set-cookie') ?? '';
  for (const part of ['HttpOnly', 'SameSite=Strict', 'Path=/api'])
    assert.ok(setCookie.includes(part));
  assert.equal((await ana.call('GET', '/api/auth/me')).data.account.username, 'Ana');

  const dup = await client().call('POST', '/api/auth/signup', {
    username: 'ANA',
    password: 'another password',
  });
  assert.equal(dup.status, 409);
  const bad = await client().call('POST', '/api/auth/signup', { username: 'a b', password: 'x' });
  assert.equal(bad.status, 400);
  const weak = await client().call('POST', '/api/auth/signup', {
    username: 'bob',
    password: 'short',
  });
  assert.equal(weak.status, 400);
});

test('profiles save per account; the best score never goes down', { skip }, async () => {
  const ana = client();
  await ana.call('POST', '/api/auth/login', { username: 'ana', password: 'correct horse' });
  const saved = await ana.call('PUT', '/api/profile', {
    settings: { name: 'Ana B', palette: 'NotAPalette', difficulty: 99, keys: { left: 'a' } },
    best: 500,
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.profile.settings.name, 'Ana B');
  assert.equal(saved.data.profile.settings.difficulty, 10);
  assert.equal(saved.data.profile.settings.keys.left, 'a');
  await ana.call('PUT', '/api/profile', { settings: saved.data.profile.settings, best: 100 });
  assert.equal((await ana.call('GET', '/api/profile')).data.profile.best, 500);
  for (const best of [-1, 1.5, '9', null])
    assert.equal(
      (await ana.call('PUT', '/api/profile', { settings: {}, best })).status,
      400,
      String(best),
    );

  // Another player can only ever reach their own profile.
  const ben = client();
  await ben.call('POST', '/api/auth/signup', { username: 'ben', password: 'ben password' });
  await ben.call('PUT', '/api/profile', { settings: { name: 'Ben' }, best: 9999 });
  const anaAgain = await ana.call('GET', '/api/profile');
  assert.equal(anaAgain.data.profile.settings.name, 'Ana B');
  assert.equal(anaAgain.data.profile.best, 500);

  // Signed out, nothing is readable.
  assert.equal((await client().call('GET', '/api/profile')).status, 401);
  assert.equal((await client().call('PUT', '/api/profile', { settings: {}, best: 1 })).status, 401);
});

test('signing in on another machine retrieves the same profile', { skip }, async () => {
  const otherMachine = client();
  const res = await otherMachine.call('POST', '/api/auth/login', {
    username: 'ANA',
    password: 'correct horse',
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.profile.settings.name, 'Ana B');
  assert.equal(res.data.profile.best, 500);
});

test('wrong credentials get the same answer whether or not the user exists', { skip }, async () => {
  const wrongPassword = await client().call('POST', '/api/auth/login', {
    username: 'ben',
    password: 'not his password',
  });
  const noSuchUser = await client().call('POST', '/api/auth/login', {
    username: 'nobody',
    password: 'whatever pw',
  });
  assert.equal(wrongPassword.status, 401);
  assert.equal(noSuchUser.status, 401);
  assert.deepEqual(wrongPassword.data, noSuchUser.data);
});

test('signing out ends the session for good', { skip }, async () => {
  const ana = client();
  await ana.call('POST', '/api/auth/login', { username: 'ana', password: 'correct horse' });
  const stolen = ana.cookie;
  assert.equal((await ana.call('POST', '/api/auth/logout', {})).status, 204);
  assert.equal(ana.cookie, '');
  const replay = await client().call('GET', '/api/auth/me', undefined, { Cookie: stolen });
  assert.equal(replay.status, 401);
});

test(
  'a recovery code resets the password, replaces itself and signs out other devices',
  { skip },
  async () => {
    const signup = await client().call('POST', '/api/auth/signup', {
      username: 'cara',
      password: 'first password',
    });
    const code: string = signup.data.recoveryCode;
    const laptop = client();
    await laptop.call('POST', '/api/auth/login', { username: 'cara', password: 'first password' });

    const wrong = await client().call('POST', '/api/auth/recover', {
      username: 'cara',
      recoveryCode: 'AAAAA-AAAAA-AAAAA-AAAAA',
      newPassword: 'second password',
    });
    assert.equal(wrong.status, 401);

    const phone = client();
    const recovered = await phone.call('POST', '/api/auth/recover', {
      username: 'Cara',
      recoveryCode: code.toLowerCase().replace(/-/g, ' '),
      newPassword: 'second password',
    });
    assert.equal(recovered.status, 200);
    assert.notEqual(recovered.data.recoveryCode, code);
    assert.equal((await phone.call('GET', '/api/auth/me')).status, 200);
    assert.equal((await laptop.call('GET', '/api/auth/me')).status, 401);
    const oldPassword = await client().call('POST', '/api/auth/login', {
      username: 'cara',
      password: 'first password',
    });
    assert.equal(oldPassword.status, 401);
    const reused = await client().call('POST', '/api/auth/recover', {
      username: 'cara',
      recoveryCode: code,
      newPassword: 'third password',
    });
    assert.equal(reused.status, 401);
  },
);

test('changing the password keeps this device and signs out the others', { skip }, async () => {
  const desk = client();
  const couch = client();
  await desk.call('POST', '/api/auth/login', { username: 'ben', password: 'ben password' });
  await couch.call('POST', '/api/auth/login', { username: 'ben', password: 'ben password' });
  const wrong = await desk.call('POST', '/api/auth/password', {
    currentPassword: 'nope nope',
    newPassword: 'ben new password',
  });
  assert.equal(wrong.status, 401);
  const changed = await desk.call('POST', '/api/auth/password', {
    currentPassword: 'ben password',
    newPassword: 'ben new password',
  });
  assert.equal(changed.status, 204);
  assert.equal((await desk.call('GET', '/api/auth/me')).status, 200);
  assert.equal((await couch.call('GET', '/api/auth/me')).status, 401);
});

test('repeated failed sign-ins are throttled', { skip }, async () => {
  await client().call('POST', '/api/auth/signup', { username: 'dan', password: 'dan password' });
  const statuses = [];
  for (let i = 0; i < 4; i++)
    statuses.push(
      (await client().call('POST', '/api/auth/login', { username: 'dan', password: 'guess ' + i }))
        .status,
    );
  assert.deepEqual(statuses, [401, 401, 401, 429]);
  // A different username from the same address is not blocked.
  const other = await client().call('POST', '/api/auth/login', {
    username: 'ben',
    password: 'ben new password',
  });
  assert.equal(other.status, 200);
  const blocked = await client().call('POST', '/api/auth/login', {
    username: 'dan',
    password: 'dan password',
  });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
});

test('cross-site and non-JSON writes are refused', { skip }, async () => {
  const form = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=ana&password=correct+horse',
  });
  assert.equal(form.status, 415);
  const crossSite = await client().call(
    'POST',
    '/api/auth/login',
    { username: 'ana', password: 'correct horse' },
    { Origin: 'https://evil.example' },
  );
  assert.equal(crossSite.status, 403);
  assert.equal((await client().call('GET', '/api/nothing')).status, 404);
  assert.equal((await client().call('DELETE', '/api/profile')).status, 405);
});

test('administrators can list, disable, re-enable and support accounts', { skip }, async () => {
  const ana = client();
  await ana.call('POST', '/api/auth/login', { username: 'ana', password: 'correct horse' });
  assert.equal((await ana.call('GET', '/api/admin/accounts')).status, 403);
  assert.equal(await store.setRole('ana', 'admin'), true);

  const list = await ana.call('GET', '/api/admin/accounts');
  assert.equal(list.status, 200);
  const cara = list.data.accounts.find((a: { username: string }) => a.username === 'cara');
  assert.ok(cara && !cara.disabled);
  assert.ok(!('passwordHash' in cara) && !('recoveryHash' in cara));

  const caraDevice = client();
  await caraDevice.call('POST', '/api/auth/login', {
    username: 'cara',
    password: 'second password',
  });
  const disabled = await ana.call('POST', `/api/admin/accounts/${cara.id}/disable`, {});
  assert.equal(disabled.status, 200);
  assert.equal((await caraDevice.call('GET', '/api/auth/me')).status, 401);
  const refused = await client().call('POST', '/api/auth/login', {
    username: 'cara',
    password: 'second password',
  });
  assert.equal(refused.status, 403);

  await ana.call('POST', `/api/admin/accounts/${cara.id}/enable`, {});
  const issued = await ana.call('POST', `/api/admin/accounts/${cara.id}/recovery-code`, {});
  assert.equal(issued.status, 200);
  const recovered = await client().call('POST', '/api/auth/recover', {
    username: 'cara',
    recoveryCode: issued.data.recoveryCode,
    newPassword: 'support reset pw',
  });
  assert.equal(recovered.status, 200);

  const self = list.data.accounts.find((a: { username: string }) => a.username === 'Ana');
  assert.equal((await ana.call('POST', `/api/admin/accounts/${self.id}/disable`, {})).status, 400);
  assert.equal((await ana.call('POST', '/api/admin/accounts/not-a-uuid/disable', {})).status, 404);
});
