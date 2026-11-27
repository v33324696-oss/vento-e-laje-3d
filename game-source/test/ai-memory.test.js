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


test('rival AI remembers being cut and prepares a rematch', async () => {
  const { RivalAIController } = await import('../src/ai.js');
  const kite = { active: false, visual: { setVisible() {} }, lineMesh: { visible: false } };
  const ai = new RivalAIController(kite, 'hunter');
  ai.onPlayerCut();
  assert.ok(ai.rivalryHeat > 0.8);
  assert.equal(ai.rivalryRememberedCuts, 1);
  ai.onCut(2);
  assert.ok(ai.rivalryHeat > 0.8);
});
