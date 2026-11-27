import test from 'node:test';
import assert from 'node:assert/strict';
import { NeighborhoodEventDirector, NEIGHBORHOOD_EVENT_PROFILES } from '../src/worldEvents.js';

function advanceUntil(director, predicate, maxTicks = 2000, enabled = true) {
  for (let tick = 0; tick < maxTicks; tick++) {
    const result = director.update(0.1, enabled);
    if (predicate(result)) return result;
  }
  return null;
}

test('neighborhood events start, remain active and end on their own timer', () => {
  const director = new NeighborhoodEventDirector(() => 0.2);
  const started = advanceUntil(director, (result) => Boolean(result.started));
  assert.ok(started?.started);
  assert.equal(started.current.id, started.started.id);
  assert.ok(started.current.duration > 0);

  const active = director.update(0.1);
  assert.equal(active.current.id, started.started.id);

  const ended = advanceUntil(director, (result) => Boolean(result.ended));
  assert.equal(ended?.ended.id, started.started.id);
  assert.equal(ended.current, null);
});

test('disabled modes clear an active neighborhood event', () => {
  const director = new NeighborhoodEventDirector(() => 0.1);
  const started = advanceUntil(director, (result) => Boolean(result.started));
  assert.ok(started?.started);

  const disabled = director.update(0.1, false);
  assert.equal(disabled.current, null);
  assert.equal(disabled.ended.id, director.lastEventId);
  assert.equal(NEIGHBORHOOD_EVENT_PROFILES.length, 4);
});
