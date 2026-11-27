import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_KEYS,
  loadProfiles,
  createProfile,
  normalizeSettings,
  STORAGE_KEYS,
} from './profiles.ts';
const storage = (values: Record<string, string>) => ({
  getItem: (key: string) => values[key] ?? null,
});
test('migrates the existing settings and personal best', () => {
  const [p] = loadProfiles(
    storage({
      'prism-settings': JSON.stringify({ name: 'Alex', palette: 'Candy', grid: false }),
      'prism-best': '4800',
    }),
  );
  assert.equal(p.settings.name, 'Alex');
  assert.equal(p.settings.palette, 'Candy');
  assert.equal(p.settings.grid, false);
  assert.equal(p.best, 4800);
});
test('loads separate saved settings and excludes guests', () => {
  const profiles = loadProfiles(
    storage({
      [STORAGE_KEYS.profiles]: JSON.stringify([
        { id: 'a', settings: { name: 'Alex', difficulty: 3 }, best: 100 },
        { id: 'b', settings: { name: 'Sam', difficulty: 8 }, best: 200 },
        { id: 'guest-1', settings: { name: 'Guest' }, best: 999 },
      ]),
    }),
  );
  assert.equal(profiles.length, 2);
  assert.equal(profiles[0].settings.difficulty, 3);
  assert.equal(profiles[1].settings.difficulty, 8);
  assert.equal(profiles[1].best, 200);
});
test('corrupt profile data falls back safely', () => {
  assert.equal(
    loadProfiles(storage({ [STORAGE_KEYS.profiles]: 'broken' }))[0].settings.name,
    'Player one',
  );
});
test('creating a profile validates names and keeps settings independent', () => {
  const a = createProfile('Alex', []),
    b = createProfile('Sam', [a]);
  b.settings.grid = false;
  assert.equal(a.settings.grid, true);
  assert.throws(() => createProfile(' alex ', [a]));
  assert.throws(() => createProfile('  ', []));
  assert.notEqual(a.id, b.id);
});
test('normalizing settings drops implausible key bindings', () => {
  const settings = normalizeSettings({
    keys: { left: 'a', right: 42, rotate: '', drop: 'x'.repeat(200) } as never,
  });
  assert.equal(settings.keys.left, 'a');
  assert.equal(settings.keys.right, DEFAULT_KEYS.right);
  assert.equal(settings.keys.rotate, DEFAULT_KEYS.rotate);
  assert.equal(settings.keys.drop, DEFAULT_KEYS.drop);
});
