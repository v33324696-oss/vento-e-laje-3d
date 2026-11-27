import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { findRabiolaCapture } from '../src/capture.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

test('aparar only succeeds when the flying line touches the loose rabiola', () => {
  const line = [v(-2, 0, 0), v(2, 0, 0)];
  const tail = [
    v(5, 4, 0), v(5, 3, 0), v(5, 2, 0),
    v(-0.5, 0.1, 0), v(0.5, 0.1, 0), v(1, -0.2, 0)
  ];
  const result = findRabiolaCapture(line, tail, 0.22, 2);
  assert.ok(result);
  assert.ok(result.distance <= 0.22);
  assert.ok(result.lineU >= 0 && result.lineU <= 1);
  assert.equal(result.tailSegmentIndex, 2);
});

test('a near miss does not count as a catch', () => {
  const line = [v(-2, 0, 0), v(2, 0, 0)];
  const tail = [
    v(5, 4, 0), v(5, 3, 0), v(5, 2, 0),
    v(-0.5, 0.55, 0), v(0.5, 0.55, 0), v(1, 0.8, 0)
  ];
  assert.equal(findRabiolaCapture(line, tail, 0.22, 2), null);
});

test('touching the kite-side base of the tail does not count as grabbing its loose end', () => {
  const line = [v(-2, 0, 0), v(2, 0, 0)];
  const tail = [
    v(-0.5, 0.02, 0), v(0.5, 0.02, 0), v(2, 2, 0),
    v(3, 3, 0), v(4, 4, 0)
  ];
  assert.equal(findRabiolaCapture(line, tail, 0.22, 2), null);
});

test('crossing near the kite body alone cannot trigger a catch', () => {
  const line = [v(-1, 0, 0), v(1, 0, 0)];
  const rabiolaFarAway = [
    v(0, 8, 0), v(0, 7, 0), v(0, 6, 0),
    v(0, 5, 0), v(0, 4, 0), v(0, 3, 0)
  ];
  assert.equal(findRabiolaCapture(line, rabiolaFarAway, 0.22, 2), null);
});
