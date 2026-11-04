import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayClock, formatDuration, piecesPerMinute, compareBest } from './metrics.ts';
test('clock counts active play and excludes pause and waiting time', () => {
  let now = 0;
  const clock = createPlayClock(() => now);
  now = 5000;
  assert.equal(clock.elapsed(), 0);
  clock.setRunning(true);
  now = 15000;
  clock.setRunning(true);
  assert.equal(clock.elapsed(), 10000);
  clock.setRunning(false);
  now = 65000;
  assert.equal(clock.elapsed(), 10000);
  clock.setRunning(true);
  now = 70000;
  clock.setRunning(false);
  assert.equal(clock.elapsed(), 15000);
  clock.reset();
  assert.equal(clock.elapsed(), 0);
  now = 90000;
  assert.equal(clock.elapsed(), 0);
});
test('duration and rate handle the first frame and minutes correctly', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(125999), '02:05');
  assert.equal(piecesPerMinute(0, 0), 0);
  assert.equal(piecesPerMinute(20, 30000), 40);
  assert.equal(piecesPerMinute(7, 60000), 7);
});
test('summary compares against the best at the start of the round', () => {
  assert.equal(compareBest(900, 800), 'New personal best');
  assert.equal(compareBest(800, 800), 'Personal best matched');
  assert.equal(compareBest(500, 800), '300 to personal best');
  assert.equal(compareBest(0, 0), '0 to personal best');
});
test('restored clock remains paused until resumed', () => {
  let now = 100;
  const clock = createPlayClock(() => now);
  clock.reset(12000);
  now = 50100;
  assert.equal(clock.elapsed(), 12000);
  clock.setRunning(true);
  now = 51100;
  assert.equal(clock.elapsed(), 13000);
});
