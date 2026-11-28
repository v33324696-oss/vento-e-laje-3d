import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VerletStringSimulation } from '../src/ropeSimulation.js';

const point = (x, y, z) => new THREE.Vector3(x, y, z);

function simulate(rope, options, frames = 120) {
  for (let i = 0; i < frames; i++) {
    rope.update({ ...options, dt: 1 / 60 });
  }
}

test('Verlet string keeps its end points attached to the reel and bridle', () => {
  const rope = new VerletStringSimulation(28);
  const start = point(0, 10, 0);
  const end = point(0, 20, -18);
  simulate(rope, { start, end, restLength: 24, wind: point(0, 0.2, -8) }, 90);
  assert.ok(rope.nodes[0].distanceTo(start) < 1e-8);
  assert.ok(rope.nodes[28].distanceTo(end) < 1e-8);
});

test('a slack line develops a visible sag', () => {
  const rope = new VerletStringSimulation(28);
  const start = point(0, 10, 0);
  const end = point(0, 10, -10);
  simulate(rope, { start, end, restLength: 17, wind: point(0, 0, 0) }, 150);
  const lowest = Math.min(...rope.nodes.slice(1, -1).map(node => node.y));
  assert.ok(lowest < 9.7, `expected slack line to sag below 9.7, got ${lowest}`);
});

test('a taut line sags less than a slack line', () => {
  const start = point(0, 10, 0);
  const end = point(0, 10, -10);
  const taut = new VerletStringSimulation(28);
  const slack = new VerletStringSimulation(28);
  simulate(taut, { start, end, restLength: 10.2, wind: point(0, 0, 0) }, 150);
  simulate(slack, { start, end, restLength: 17, wind: point(0, 0, 0) }, 150);
  const tautLowest = Math.min(...taut.nodes.slice(1, -1).map(node => node.y));
  const slackLowest = Math.min(...slack.nodes.slice(1, -1).map(node => node.y));
  assert.ok(tautLowest > slackLowest + 0.05);
});

test('line nodes are projected outside a rooftop obstacle and register a snag', () => {
  const rope = new VerletStringSimulation(28);
  const start = point(0, 0, 0);
  const end = point(0, 0, -10);
  const obstacle = {
    type: 'box',
    min: { x: -1.2, y: -1.0, z: -6.0 },
    max: { x: 1.2, y: 1.0, z: -4.0 }
  };
  simulate(rope, { start, end, restLength: 10.2, wind: point(0, 0, 0), obstacles: [obstacle] }, 90);
  for (const node of rope.nodes.slice(1, -1)) {
    const inside = node.x >= -1.235 && node.x <= 1.235
      && node.y >= -1.035 && node.y <= 1.035
      && node.z >= -6.035 && node.z <= -3.965;
    assert.equal(inside, false, 'a rope node remained inside the obstacle');
  }
  assert.ok(rope.snagAmount > 0);
});

test('snag pressure relaxes after the line clears the obstacle', () => {
  const rope = new VerletStringSimulation(28);
  const start = point(0, 0, 0);
  const end = point(0, 0, -10);
  const obstacle = {
    type: 'box',
    min: { x: -1.2, y: -1.0, z: -6.0 },
    max: { x: 1.2, y: 1.0, z: -4.0 }
  };
  simulate(rope, { start, end, restLength: 10.2, wind: point(0, 0, 0), obstacles: [obstacle] }, 90);
  const snagged = rope.snagAmount;
  simulate(rope, { start, end, restLength: 10.2, wind: point(0, 0, 0), obstacles: [] }, 240);
  assert.ok(rope.snagAmount < snagged);
});
