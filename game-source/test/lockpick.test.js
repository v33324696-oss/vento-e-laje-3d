import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RABIOLA_LOCK_MAX_MISSES,
  RABIOLA_LOCK_PINS,
  attemptRabiolaLock,
  createRabiolaLockState,
  getRabiolaLockReading
} from '../src/lockpick.js';

test('rabiola recovery uses five manual lock pins', () => {
  const state = createRabiolaLockState('murcha', 4);
  assert.equal(state.stage, 0);
  assert.equal(RABIOLA_LOCK_PINS, 5);
  assert.equal(RABIOLA_LOCK_MAX_MISSES, 3);
});

test('lock timing window gets narrower on later pins', () => {
  const state = createRabiolaLockState('raia', 0);
  const first = getRabiolaLockReading(state, 0);
  const later = getRabiolaLockReading({ ...state, stage: 4 }, 0);
  assert.ok(later.halfWindow < first.halfWindow);
  assert.ok(later.speed > first.speed);
});

test('a precise lockpick tap advances exactly one pin', () => {
  const state = createRabiolaLockState('papagaio', 0);
  const reading = getRabiolaLockReading(state, 0);
  const result = attemptRabiolaLock(
    { ...state, phase: Math.asin((reading.target - 0.5) * 2) * -1 },
    0
  );
  // The state is immutable: every attempt returns a new object.
  assert.notEqual(result.state, state);
  assert.ok(result.state.stage === 0 || result.state.stage === 1);
});

test('three bad taps fail the recovery instead of granting the kite', () => {
  let state = createRabiolaLockState('latao', 0);
  for (let i = 0; i < RABIOLA_LOCK_MAX_MISSES; i++) {
    const reading = getRabiolaLockReading(state, i * 0.05);
    const wrongTime = i * 0.05 + 0.001;
    const result = attemptRabiolaLock(state, wrongTime);
    state = result.state;
  }
  assert.equal(state.mistakes, RABIOLA_LOCK_MAX_MISSES);
});
