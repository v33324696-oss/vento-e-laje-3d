import test from 'node:test';
import assert from 'node:assert/strict';
import { RIVAL_PERSONALITY_PROFILES } from '../src/ai.js';

test('rival personalities have distinct aggression, target and risk profiles', () => {
  const profiles = RIVAL_PERSONALITY_PROFILES;
  assert.deepEqual(Object.keys(profiles).sort(), ['balanced', 'hunter', 'slasher', 'trickster']);
  assert.ok(profiles.hunter.aggression > profiles.balanced.aggression);
  assert.ok(profiles.slasher.segmentBias > profiles.trickster.segmentBias);
  assert.ok(profiles.trickster.evasion > profiles.hunter.evasion);
  assert.ok(profiles.trickster.feintEvery > 0);
});
