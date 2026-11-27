import test from 'node:test';
import assert from 'node:assert/strict';
import { getKiteMaterialProfile } from '../src/kiteMaterials.js';

test('default materials preserve the familiar flight baseline', () => {
  assert.deepEqual(getKiteMaterialProfile(), {
    liftMultiplier: 1, speedMultiplier: 1, steeringMultiplier: 1,
    stabilityMultiplier: 1, durabilityMultiplier: 1, dragMultiplier: 1
  });
});

test('light paper and short tail are quicker but less stable and durable', () => {
  const profile = getKiteMaterialProfile({ paper: 'leve', frame: 'bambu', tail: 'curta' });
  assert.ok(profile.speedMultiplier > 1);
  assert.ok(profile.steeringMultiplier > 1);
  assert.ok(profile.stabilityMultiplier < 1);
  assert.ok(profile.durabilityMultiplier < 1);
});

test('reinforced frame and long tail trade speed for stability and durability', () => {
  const profile = getKiteMaterialProfile({ paper: 'resistente', frame: 'reforcada', tail: 'longa' });
  assert.ok(profile.speedMultiplier < 1);
  assert.ok(profile.stabilityMultiplier > 1);
  assert.ok(profile.durabilityMultiplier > 1);
  assert.ok(profile.dragMultiplier > 1);
});

test('unknown recipes fall back safely and multipliers remain finite', () => {
  assert.deepEqual(getKiteMaterialProfile({ paper: '?', frame: '?', tail: '?' }), getKiteMaterialProfile());
  for (const value of Object.values(getKiteMaterialProfile({ paper: 'leve', frame: 'reforcada', tail: 'sem' }))) {
    assert.ok(Number.isFinite(value));
  }
});
