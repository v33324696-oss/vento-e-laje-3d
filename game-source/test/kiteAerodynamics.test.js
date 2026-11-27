import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KITE_MODEL_IDS,
  KITE_AERO_PROFILES,
  bankSpanForSteering,
  calculateAerodynamicForces,
  calculateLiftCoefficient,
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

test('angle of attack increases lift up to the peak angle', () => {
  const low = calculateLiftCoefficient(0.08, 0.48);
  const peak = calculateLiftCoefficient(0.30, 0.48);
  assert.ok(peak > low);
  assert.ok(peak <= 1);
});

test('excessive angle of attack causes stall and reduces lift', () => {
  const attached = calculateAerodynamicForces({
    airVelocity: air, spanDirection: span, forwardDirection: forward,
    modelId: 'murcha', angleOfAttack: 0.30
  });
  const stalled = calculateAerodynamicForces({
    airVelocity: air, spanDirection: span, forwardDirection: forward,
    modelId: 'murcha', angleOfAttack: 0.78
  });
  assert.equal(attached.stalled, false);
  assert.equal(stalled.stalled, true);
  assert.ok(stalled.lift < attached.lift);
  assert.ok(stalled.drag > attached.drag);
});

test('kite models have different stall thresholds', () => {
  assert.notEqual(KITE_AERO_PROFILES.raia.stallAngle, KITE_AERO_PROFILES.rokkaku.stallAngle);
  assert.notEqual(KITE_AERO_PROFILES.delta.stallAngle, KITE_AERO_PROFILES.capucheta.stallAngle);
});

test('steering bank redirects aerodynamic lift toward the commanded side', () => {
  const span = { x: 1, y: 0, z: 0 };
  const flow = { x: 0, y: 0.4, z: -9 };
  const forward = { x: 0, y: 1, z: 0 };
  const neutralSpan = bankSpanForSteering(span, flow, 0, {});
  const rightSpan = bankSpanForSteering(span, flow, 0.58, {});
  const leftSpan = bankSpanForSteering(span, flow, -0.58, {});
  const neutral = calculateAerodynamicForces({
    airVelocity: flow, spanDirection: neutralSpan, forwardDirection: forward, angleOfAttack: 0.28
  });
  const right = calculateAerodynamicForces({
    airVelocity: flow, spanDirection: rightSpan, forwardDirection: forward, angleOfAttack: 0.28
  });
  const left = calculateAerodynamicForces({
    airVelocity: flow, spanDirection: leftSpan, forwardDirection: forward, angleOfAttack: 0.28
  });
  assert.ok(Math.abs(neutral.fx) < 0.02);
  assert.ok(right.fx > 0.1);
  assert.ok(left.fx < -0.1);
  assert.ok(right.fy > 0 && left.fy > 0);
});

test('banked span stays normalized during strong steering input', () => {
  const banked = bankSpanForSteering(
    { x: 1, y: 0, z: 0 },
    { x: 0.4, y: 0.2, z: -8 },
    2.0,
    {}
  );
  const length = Math.hypot(banked.x, banked.y, banked.z);
  assert.ok(Math.abs(length - 1) < 1e-9);
});
