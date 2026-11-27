import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcAppearance, PLAYER_PIPEIRO_APPEARANCE } from '../src/characters.js';

function seededRandom(seed = 23) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

test('the player has a consistent signature streetwear look', () => {
  assert.equal(PLAYER_PIPEIRO_APPEARANCE.hairStyle, 'curlyFade');
  assert.equal(PLAYER_PIPEIRO_APPEARANCE.shirtColor, 0x101010);
  assert.equal(PLAYER_PIPEIRO_APPEARANCE.pantsStyle, 'cargoShorts');
  assert.equal(PLAYER_PIPEIRO_APPEARANCE.shortsPattern, 'urbanCamo');
  assert.equal(PLAYER_PIPEIRO_APPEARANCE.accessory, 'chainCross');
});

test('street residents receive different identities instead of repeated clones', () => {
  const usedSignatures = new Set();
  const random = seededRandom();
  const residents = Array.from({ length: 36 }, () => createNpcAppearance({
    random,
    usedSignatures
  }));
  assert.equal(new Set(residents.map((resident) => resident.signature)).size, residents.length);
  assert.equal(usedSignatures.size, residents.length);
});

test('resident generation includes young people, adults and older men', () => {
  const random = seededRandom(97);
  const usedSignatures = new Set();
  const ages = new Set(Array.from({ length: 60 }, () =>
    createNpcAppearance({ random, usedSignatures }).ageGroup
  ));
  assert.deepEqual([...ages].sort(), ['adult', 'older', 'young']);
});

test('preferred street colors do not make the rest of a resident a duplicate', () => {
  const random = seededRandom(312);
  const usedSignatures = new Set();
  const residents = Array.from({ length: 18 }, () => createNpcAppearance({
    random,
    usedSignatures,
    preferredShirt: 0x111111,
    preferredShorts: 0x1e293b
  }));
  assert.ok(residents.every((resident) => resident.shirtColor === 0x111111));
  assert.equal(new Set(residents.map((resident) => resident.signature)).size, residents.length);
});


test('humanoid character construction uses rounded anatomical geometry', async () => {
  const { readFileSync } = await import('node:fs');
  const worldSource = readFileSync(new URL('../src/world.js', import.meta.url), 'utf8');
  const builderStart = worldSource.indexOf('  _createPipeiroCharacter(');
  const builderEnd = worldSource.indexOf('  createPipeiroCharacter(', builderStart + 1);
  const characterBuilder = worldSource.slice(builderStart, builderEnd);
  assert.match(characterBuilder, /THREE\.LatheGeometry/, 'torso should have a smooth human silhouette');
  assert.match(characterBuilder, /THREE\.CapsuleGeometry/, 'arms and legs should use rounded limb geometry');
  assert.match(characterBuilder, /leftCalf:\s*calves\[0\]/, 'legs should have articulated lower-leg joints');
  assert.match(characterBuilder, /new THREE\.TubeGeometry/, 'facial features and clothing seams should use curved geometry');
  assert.doesNotMatch(characterBuilder, /new THREE\.BoxGeometry\(0\.51/, 'the torso must not be a rectangular box');
});
