import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const worldSource = readFileSync(new URL('../src/world.js', import.meta.url), 'utf8');

test('mobile devices get a separate performance-first graphics preference', () => {
  assert.match(mainSource, /vento-laje-graphics-mobile-v2/);
  assert.match(mainSource, /let savedQuality = 'performance'/);
  assert.match(mainSource, /mobileRatio: 0\.82/);
  assert.match(mainSource, /this\.isMobileLayout \? false : preset\.shadows/);
  assert.match(mainSource, /antialias: false/);
  assert.match(mainSource, /this\.frameInterval = 1000 \/ 60/);
  assert.match(mainSource, /if \(document\.hidden\)/);
  assert.match(mainSource, /this\._combatBounds = new Float32Array\(7 \* 6\)/);
  assert.match(mainSource, /bounds\[offsetA \+ 3\] \+ reach < bounds\[offsetB\]/);
  assert.match(mainSource, /this\.started \? this\._getActiveRivals\(\) : \[\]/);
  assert.match(mainSource, /patternId: 'estrela_paulista'/);
  assert.match(worldSource, /detail: this\.isMobilePerformance \? 'low' : 'high'/);
  assert.match(worldSource, /this\.araCharacterConcurrency = 1/);
  assert.match(worldSource, /this\.araCharacterDetailBudget = this\.isMobilePerformance \? 0 : 2/);
  assert.match(worldSource, /this\.araDetailedNpcCount >= this\.araCharacterDetailBudget/);
});

test('resizing preserves the selected graphics profile', () => {
  assert.match(mainSource, /this\._applyGraphicsQuality\(this\.graphicsQuality \|\| 'performance', false\)/);
});

test('mobile scene keeps the full player but skips low-detail background rigs', () => {
  assert.match(mainSource, /mobilePerformance: this\.isMobileLayout/);
  assert.match(worldSource, /this\.isMobilePerformance && options\.detail === 'low' && !options\.player/);
  assert.match(worldSource, /avatar\.userData\.araSkippedForMobile = true/);
});

test('mobile scene lowers environment geometry, density and particle counts', () => {
  assert.match(worldSource, /this\.isMobilePerformance \? 36 : 72/);
  assert.match(worldSource, /this\.isMobilePerformance \? 5 : 10/);
  assert.match(worldSource, /this\.isMobilePerformance \? 3 : 6/);
  assert.match(worldSource, /this\.isMobilePerformance \? 150 : 420/);
});

test('mobile environment animation is throttled without changing kite simulation timing', () => {
  assert.match(worldSource, /this\.environmentUpdateAccumulator < 1 \/ 24/);
  assert.match(mainSource, /this\.hudUpdateAccumulator >= 0\.1/);
  assert.match(mainSource, /this\.playerKite\.update\(/);
});
