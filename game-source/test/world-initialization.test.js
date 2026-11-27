import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worldSource = readFileSync(new URL('../src/world.js', import.meta.url), 'utf8');
const constructorStart = worldSource.indexOf('export class GameWorld');
const constructorEnd = worldSource.indexOf('  _initLightingAndSky()', constructorStart);
const constructorSource = worldSource.slice(constructorStart, constructorEnd);

test('GameWorld initializes the rooftop wind ribbon nodes before building the laje', () => {
  const initializeAt = constructorSource.indexOf('this.windRibbonNodes = [];');
  const buildAt = constructorSource.indexOf('this._buildPlayerLaje()');

  assert.notEqual(initializeAt, -1, 'windRibbonNodes must start as an array');
  assert.notEqual(buildAt, -1, 'the laje build step must exist');
  assert.ok(initializeAt < buildAt, 'windRibbonNodes must be initialized before _buildPlayerLaje');
  assert.match(worldSource, /this\.windRibbonNodes\.push\(/, 'the wind ribbon builder must use the initialized list');
});
