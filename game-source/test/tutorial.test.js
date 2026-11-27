import test from 'node:test';
import assert from 'node:assert/strict';
import { TUTORIAL_STEPS, getTutorialStep } from '../src/tutorial.js';

test('tutorial covers the full first-flight, combat and recovery path', () => {
  assert.equal(TUTORIAL_STEPS.length, 6);
  const content = TUTORIAL_STEPS.map((step) => [
    step.title, step.description, step.hint
  ].join(' ')).join(' ').toLowerCase();
  for (const term of ['shift', 'três tapas', 'relo', 'rabiola', 'oficina', 'online']) {
    assert.ok(content.includes(term), `o tutorial deve explicar: ${term}`);
  }
});

test('step lookup returns null outside the tutorial range', () => {
  assert.equal(getTutorialStep(-1), null);
  assert.equal(getTutorialStep(TUTORIAL_STEPS.length), null);
  assert.equal(getTutorialStep(1), TUTORIAL_STEPS[1]);
});
