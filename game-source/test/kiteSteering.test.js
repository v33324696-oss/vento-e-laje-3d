import test from 'node:test';
import assert from 'node:assert/strict';
import { stepKiteSteering } from '../src/kiteSteering.js';

test('holding right steering settles into a stable right-hand arc', () => {
  let state = { noseAngle: 0, angularVelocity: 0 };
  for (let i = 0; i < 150; i++) {
    state = stepKiteSteering({ ...state, steer: 1, dt: 1 / 60 });
  }
  assert.ok(state.noseAngle > 0.65 && state.noseAngle < 1.0);
  assert.ok(Math.abs(state.angularVelocity) < 0.08);
});

test('releasing the steering recentres the kite without oscillating away', () => {
  let state = { noseAngle: 0.82, angularVelocity: 0.1 };
  for (let i = 0; i < 120; i++) {
    state = stepKiteSteering({ ...state, steer: 0, dt: 1 / 60 });
  }
  assert.ok(Math.abs(state.noseAngle) < 0.02);
  assert.ok(Math.abs(state.angularVelocity) < 0.02);
});

test('switching from right to left produces a controlled counter-steer', () => {
  let state = { noseAngle: 0.72, angularVelocity: 0 };
  for (let i = 0; i < 60; i++) {
    state = stepKiteSteering({ ...state, steer: -1, dt: 1 / 60 });
  }
  assert.ok(state.noseAngle < -0.55);
  assert.ok(state.noseAngle > -1.0);
});

test('a short steering pulse never creates a full uncontrolled spin', () => {
  let state = { noseAngle: 0, angularVelocity: 0 };
  for (let i = 0; i < 25; i++) {
    state = stepKiteSteering({ ...state, steer: 1, dt: 1 / 60 });
  }
  for (let i = 0; i < 40; i++) {
    state = stepKiteSteering({ ...state, steer: 0, dt: 1 / 60 });
  }
  assert.ok(Math.abs(state.noseAngle) < 0.08);
  assert.ok(Math.abs(state.noseAngle) < Math.PI / 2);
});
