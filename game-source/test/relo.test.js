import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReloScore, getCrossingQuality, closestSegments3D } from '../src/relo.js';

test('crossing quality distinguishes perpendicular lines from parallel lines', () => {
  assert.equal(getCrossingQuality([1, 0, 0], [1, 0, 0]), 0);
  assert.equal(getCrossingQuality([1, 0, 0], [0, 1, 0]), 1);
});

test('closest 3D segments returns the crossing point and distance', () => {
  const result = closestSegments3D([-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0]);
  assert.ok(result.distance < 1e-8);
  assert.ok(Math.abs(result.s - 0.5) < 1e-8);
  assert.ok(Math.abs(result.t - 0.5) < 1e-8);
});

test('a well-timed largada scores better than a mistimed largada', () => {
  const base = { crossingQuality: 0.9, tension: 0.72, reelSpeed: 16, kiteSpeed: 8, relativeSpeed: 10, linePower: 0.85, ownU: 0.25, targetU: 0.9 };
  const good = evaluateReloScore({ ...base, largadaActive: true, largadaQuality: 0.92 });
  const bad = evaluateReloScore({ ...base, largadaActive: true, largadaQuality: 0.08 });
  assert.ok(good > bad * 1.8);
});

test('entering from the wrong part of the lines is disadvantaged', () => {
  const base = { crossingQuality: 0.9, tension: 0.72, reelSpeed: 8, kiteSpeed: 8, relativeSpeed: 8, linePower: 0.85 };
  const clean = evaluateReloScore({ ...base, ownU: 0.25, targetU: 0.9 });
  const wrong = evaluateReloScore({ ...base, ownU: 0.92, targetU: 0.25 });
  assert.ok(clean > wrong * 1.7);
});
