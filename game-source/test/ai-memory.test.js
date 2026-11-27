import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpponentMemory, observeOpponentMemory } from '../src/ai.js';

test('rival memory learns repeated player turns and selects a counter-side', () => {
  const memory = createOpponentMemory();
  const leftPlayer = { active: true, noseAngle: -0.7, reelSpeed: -7 };
  for (let i = 0; i < 120; i++) observeOpponentMemory(memory, leftPlayer, 1 / 60);
  assert.ok(memory.left > memory.right);
  assert.equal(memory.preferredSide, -1);
  assert.ok(memory.confidence > 0);
});

test('rival memory decays when a player stops repeating a habit', () => {
  const memory = createOpponentMemory();
  observeOpponentMemory(memory, { active: true, noseAngle: 0.8, reelSpeed: 0 }, 1);
  const learned = memory.right;
  for (let i = 0; i < 120; i++) observeOpponentMemory(memory, { active: false }, 1 / 60);
  assert.ok(memory.right < learned);
});
