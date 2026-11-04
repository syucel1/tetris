import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameLifecycleLogger,
  resolveLogLevel,
  installApplicationLogging,
  setLogLevel,
  logEvent,
  sessionId,
  errorDetails,
  type Emit,
} from './logging.ts';
test('logs lifecycle transitions once, with player and game identifiers', () => {
  const records: { level: string; event: string; context: unknown }[] = [];
  const emit: Emit = (level, event, context) => records.push({ level, event, context });
  const observe = createGameLifecycleLogger({ playerId: 'player-a', mode: 'solo' }, emit);
  let state = {
    id: 'game-a',
    status: 'ready' as 'ready' | 'playing' | 'paused' | 'over',
    score: 0,
    lines: 0,
  };
  observe(state);
  observe(state);
  state = { ...state, status: 'playing' };
  observe(state);
  for (let n = 0; n < 100; n++) observe({ ...state, score: n });
  observe({ ...state, status: 'paused' });
  observe({ ...state, status: 'paused' });
  observe(state);
  observe({ ...state, status: 'over', score: 200, lines: 2 });
  observe({ ...state, status: 'over' });
  assert.deepEqual(
    records.map((r) => r.event),
    ['game_created', 'game_started', 'game_paused', 'game_resumed', 'game_over'],
  );
  assert.deepEqual(records.at(-1)?.context, {
    playerId: 'player-a',
    mode: 'solo',
    gameId: 'game-a',
    score: 200,
    lines: 2,
  });
  observe({ ...state, id: 'game-b' });
  assert.deepEqual(
    records.slice(-2).map((r) => r.event),
    ['game_created', 'game_started'],
  );
});
test('all supported levels and invalid configuration', () => {
  for (const level of ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const)
    assert.equal(resolveLogLevel(level.toLowerCase()), level);
  assert.equal(resolveLogLevel('trace'), 'INFO');
  assert.equal(resolveLogLevel(null), 'INFO');
});
test('configured level filters output and records include the session identifier', () => {
  const original = console.info;
  const records: unknown[] = [];
  console.info = (...args) => records.push(args[0]);
  try {
    setLogLevel('ERROR');
    logEvent('INFO', 'filtered');
    assert.equal(records.length, 0);
    setLogLevel('INFO');
    logEvent('INFO', 'visible', { playerId: 'a' });
    assert.equal((records[0] as { sessionId: string }).sessionId, sessionId);
  } finally {
    console.info = original;
    setLogLevel('INFO');
  }
});
test('global error handlers are registered and removable', () => {
  const handlers = new Map<string, EventListenerOrEventListenerObject>();
  const target = {
    addEventListener: (type: string, handler: EventListenerOrEventListenerObject) =>
      handlers.set(type, handler),
    removeEventListener: (type: string) => handlers.delete(type),
  };
  const cleanup = installApplicationLogging(target as unknown as Window);
  assert.ok(handlers.has('error'));
  assert.ok(handlers.has('unhandledrejection'));
  cleanup();
  assert.equal(handlers.size, 0);
  assert.equal(errorDetails(new Error('failure')).message, 'failure');
});
test('unexpected errors and promise failures carry structured details', () => {
  const original = console.error;
  const records: Record<string, unknown>[] = [];
  console.error = (record) => records.push(record);
  setLogLevel('ERROR');
  const handlers = new Map<string, (event: unknown) => void>();
  const target = {
    addEventListener: (type: string, handler: (event: unknown) => void) =>
      handlers.set(type, handler),
    removeEventListener: (type: string) => handlers.delete(type),
  };
  const cleanup = installApplicationLogging(target as unknown as Window);
  try {
    handlers.get('error')!({ error: new Error('render failure'), filename: 'game.ts', lineno: 12 });
    handlers.get('unhandledrejection')!({ reason: new Error('async failure') });
    assert.deepEqual(
      records.map((r) => r.event),
      ['unexpected_error', 'unhandled_rejection'],
    );
    for (const r of records) {
      assert.equal(r.sessionId, sessionId);
      assert.equal(r.level, 'ERROR');
      assert.ok((r.error as { message: string }).message);
    }
  } finally {
    cleanup();
    console.error = original;
    setLogLevel('INFO');
  }
});
