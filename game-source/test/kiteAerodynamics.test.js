import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KITE_MODEL_IDS,
  KITE_AERO_PROFILES,
  calculateAerodynamicForces,
  getKiteAeroProfile,
  getWindPhase,
  sampleWindAt
} from '../src/kiteAerodynamics.js';

const air = { x: 0, y: 0.45, z: -9 };
const span = { x: 1, y: 0, z: 0 };
const forward = { x: 0, y: 1, z: 0 };

test('all 13 kite models have individual aerodynamic profiles', () => {
  assert.equal(KITE_MODEL_IDS.length, 13);
  assert.equal(new Set(KITE_MODEL_IDS.map((id) => getKiteAeroProfile(id))).size, 13);
  for (const id of KITE_MODEL_IDS) {
    const p = KITE_AERO_PROFILES[id];
    assert.ok(p.area > 0 && p.mass > 0 && p.lift > 0 && p.drag > 0);
  }
});

test('relative airflow produces both lift and drag', () => {
  const result = calculateAerodynamicForces({
    airVelocity: air,
    spanDirection: span,
    forwardDirection: forward,
    modelId: 'murcha'
  });
  assert.ok(result.lift > 0);
  assert.ok(result.drag > 0);
  assert.ok(result.fy > 0);
  assert.ok(result.fz < 0);
});

test('stronger airflow increases aerodynamic loading', () => {
  const slow = calculateAerodynamicForces({
    airVelocity: { x: 0, y: 0.2, z: -5 },
    spanDirection: span,
    forwardDirection: forward,
    modelId: 'murcha'
  });
  const fast = calculateAerodynamicForces({
    airVelocity: { x: 0, y: 0.45, z: -10 },
    spanDirection: span,
    forwardDirection: forward,
    modelId: 'murcha'
  });
  assert.ok(fast.dynamicPressure > slow.dynamicPressure);
  assert.ok(fast.drag > slow.drag);
  assert.ok(fast.lift > slow.lift);
});

test('longer rabiola increases drag without inventing extra lift', () => {
  const shortTail = calculateAerodynamicForces({
    airVelocity: air, spanDirection: span, forwardDirection: forward,
    modelId: 'murcha', tailRatio: 0
  });
  const longTail = calculateAerodynamicForces({
    airVelocity: air, spanDirection: span, forwardDirection: forward,
    modelId: 'murcha', tailRatio: 1
  });
  assert.ok(longTail.drag > shortTail.drag);
  assert.equal(longTail.lift, shortTail.lift);
});

test('wind gusts are deterministic but vary with time and position', () => {
  const base = { x: 0, y: 0.4, z: -9 };
  const pos = { x: 10, y: 20, z: -30 };
  const phase = getWindPhase('player');
  const first = sampleWindAt(base, pos, 4, phase, {});
  const same = sampleWindAt(base, pos, 4, phase, {});
  const later = sampleWindAt(base, pos, 8, phase, {});
  const elsewhere = sampleWindAt(base, { ...pos, x: 42 }, 4, phase, {});
  assert.deepEqual(first, same);
  assert.notDeepEqual(first, later);
  assert.notDeepEqual(first, elsewhere);
});
