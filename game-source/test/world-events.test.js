import test from 'node:test';
import assert from 'node:assert/strict';
import { NeighborhoodEventDirector, NEIGHBORHOOD_EVENT_PROFILES } from '../src/worldEvents.js';

function advance(director, seconds, enabled = true) {
  let result = { started: null, ended: null, current: director.currentEvent };
  const ticks = Math.ceil(seconds * 10);
  for (let i = 0; i < ticks; i++) result = director.update(0.1, enabled);
  return result;
}

test('neighborhood events start, remain active and end on their own timer', () => {
  const director = new NeighborhoodEventDirector(() => 0.2);
  const started = advance(director, 34);
  assert.ok(started.started);
  assert.equal(started.current.id, started.started.id);
  assert.ok(started.current.duration > 0);
  const active = director.update(0.1);
  assert.equal(active.current.id, started.started.id);
  const ended = advance(director, started.started.duration + 0.1);
  assert.equal(ended.ended.id, started.started.id);
  assert.equal(ended.current, null);
});

test('disabled modes clear an active neighborhood event', () => {
  const director = new NeighborhoodEventDirector(() => 0.1);
  advance(director, 34);
  const disabled = director.update(0.1, false);
  assert.equal(disabled.current, null);
  assert.equal(disabled.ended.id, director.lastEventId);
  assert.equal(NEIGHBORHOOD_EVENT_PROFILES.length, 4);
});
