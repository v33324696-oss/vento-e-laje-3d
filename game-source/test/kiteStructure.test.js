import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCableResponse,
  calculateWinchResponse,
  calculateStructuralResponse,
  getTailDynamics
} from '../src/kiteStructure.js';
import { KITE_MODEL_IDS, getKiteAeroProfile } from '../src/kiteAerodynamics.js';

test('all kite models define distinct structure and tail characteristics', () => {
  const structures = KITE_MODEL_IDS.map((id) => getKiteAeroProfile(id));
  assert.equal(new Set(structures.map((p) => p.frameStrength)).size, 13);
  for (const profile of structures) {
    assert.ok(profile.flexibility > 0 && profile.flexibility <= 1);
    assert.ok(profile.frameStrength > 0);
    assert.ok(profile.paperWeight > 0);
    assert.ok(profile.tailMass > 0);
    assert.ok(profile.flutterRate > 0);
  }
});

test('structural bend increases with wind pressure and model flexibility', () => {
  const calm = calculateStructuralResponse(12, 'murcha');
  const gust = calculateStructuralResponse(72, 'murcha');
  const flexible = calculateStructuralResponse(72, 'capucheta');
  const rigid = calculateStructuralResponse(72, 'latao');
  assert.ok(gust.strain > calm.strain);
  assert.ok(flexible.paperBend > rigid.paperBend);
  assert.ok(gust.frameBend > 0);
});

test('elastic line profiles allow a different stretch and damping response', () => {
  const firm = calculateCableResponse(0.5, 1.2, { elasticity: 0.015, damping: 0.94 });
  const soft = calculateCableResponse(0.5, 1.2, { elasticity: 0.07, damping: 0.68 });
  assert.ok(firm.stiffness > soft.stiffness);
  assert.ok(firm.maxStretch < soft.maxStretch);
  assert.ok(firm.positionCorrection > soft.positionCorrection);
  assert.ok(firm.tension > 0);
});

test('faster outward line motion increases cable tension', () => {
  const still = calculateCableResponse(0.2, 0, { elasticity: 0.03, damping: 0.82 });
  const moving = calculateCableResponse(0.2, 2.5, { elasticity: 0.03, damping: 0.82 });
  assert.ok(moving.tension > still.tension);
  assert.ok(moving.radialImpulse > still.radialImpulse);
});

test('rabiola mass and airflow change its motion profile', () => {
  const lightTail = getTailDynamics('raia', 1, 12);
  const heavyTail = getTailDynamics('peixao', 1, 12);
  const cutTail = getTailDynamics('murcha', 0.25, 12);
  assert.ok(lightTail.inertia < heavyTail.inertia);
  assert.ok(lightTail.windCoupling > heavyTail.windCoupling);
  assert.ok(cutTail.inertia < getTailDynamics('murcha', 1, 12).inertia);
});

test('holding the reel progressively pulls a kite toward its anchor', () => {
  const firstFrame = calculateWinchResponse(0, -7.2, 1 / 60, { pullResponse: 4.8 });
  const settled = calculateWinchResponse(-6.8, -7.2, 1 / 60, { pullResponse: 4.8 });
  assert.ok(firstFrame.velocityChange < 0);
  assert.ok(settled.velocityChange < 0);
  assert.ok(Math.abs(settled.velocityChange) < Math.abs(firstFrame.velocityChange));
});

test('releasing the line does not actively push the kite outward', () => {
  const response = calculateWinchResponse(-2, 5.2, 1 / 60, { pullResponse: 4.8 });
  assert.equal(response.velocityChange, 0);
});

test('poorly maintained kites bend more under the same wind load', () => {
  const maintained = calculateStructuralResponse(60, 'murcha', 100);
  const worn = calculateStructuralResponse(60, 'murcha', 35);
  assert.ok(worn.strain > maintained.strain);
  assert.ok(worn.damageFactor > maintained.damageFactor);
});
