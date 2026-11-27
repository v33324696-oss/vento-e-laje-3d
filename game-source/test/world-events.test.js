import test from 'node:test';
import assert from 'node:assert/strict';
import { NeighborhoodEventDirector, NEIGHBORHOOD_EVENT_PROFILES } from '../src/worldEvents.js';

test('neighborhood events start, remain active, end and schedule another event', () => {
  const director = new NeighborhoodEventDirector(() => 0.2);
  const started = director.update(34);
  assert.ok(started.started);
  assert.equal(started.current.id, started.started.id);
  const active = director.update(0.1);
  assert.equal(active.current.id, started.started.id);
  const ended = director.update(started.started.duration);
  assert.equal(ended.ended.id, started.started.id);
  assert.equal(ended.current, null);
});

test('disabled modes clear an active neighborhood event', () => {
  const director = new NeighborhoodEventDirector(() => 0.1);
  director.update(34);
  const disabled = director.update(0.1, false);
  assert.equal(disabled.current, null);
  assert.equal(disabled.ended.id, director.lastEventId);
  assert.equal(NEIGHBORHOOD_EVENT_PROFILES.length, 4);
});
