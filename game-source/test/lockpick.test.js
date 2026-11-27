import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RABIOLA_LOCK_MAX_MISSES,
  RABIOLA_LOCK_PINS,
  attemptRabiolaLock,
  createRabiolaLockState,
  getRabiolaLockReading
} from '../src/lockpick.js';

test('rabiola recovery requires five manual lock pins', () => {
  const state = createRabiolaLockState('murcha', 4);
  assert.equal(state.stage, 0);
  assert.equal(RABIOLA_LOCK_PINS, 5);
  assert.equal(RABIOLA_LOCK_MAX_MISSES, 3);
});

test('lock timing becomes faster and narrower on later pins', () => {
  const state = createRabiolaLockState('raia', 0);
  const first = getRabiolaLockReading(state, 0);
  const later = getRabiolaLockReading({ ...state, stage: 4 }, 0);
  assert.ok(later.halfWindow < first.halfWindow);
  assert.ok(later.speed > first.speed);
});

test('a precise timing input advances one pin without mutating the old state', () => {
  const state = createRabiolaLockState('papagaio', 0);
  let success = null;
  for (let time = 0; time < 20; time += 0.001) {
    const result = attemptRabiolaLock(state, time);
    if (result.hit) { success = result; break; }
  }
  assert.ok(success, 'a valid timing window should be reachable');
  assert.equal(success.state.stage, 1);
  assert.equal(state.stage, 0);
});

test('three mistimed pulls make the loose kite escape', () => {
  let state = createRabiolaLockState('latao', 0);
  for (let miss = 0; miss < RABIOLA_LOCK_MAX_MISSES; miss++) {
    let failedAttempt = null;
    for (let time = miss * 20; time < (miss + 1) * 20; time += 0.01) {
      const result = attemptRabiolaLock(state, time);
      if (!result.hit) { failedAttempt = result; break; }
    }
    assert.ok(failedAttempt, 'a mistimed input should be available');
    state = failedAttempt.state;
  }
  const terminal = attemptRabiolaLock(state, 100);
  assert.equal(state.mistakes, RABIOLA_LOCK_MAX_MISSES);
  assert.equal(terminal.failed, true);
});
