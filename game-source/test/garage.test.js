import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressionStore } from '../src/progression.js';

function storageWith(raw = null) {
  let value = raw;
  return {
    getItem() { return value; },
    setItem(key, next) { value = next; },
    dump() { return value; }
  };
}

test('legacy career data keeps coins and levels while creating a garage', () => {
  const storage = storageWith(JSON.stringify({
    level: 6, xp: 40, coins: 1200,
    stats: { cuts: 8, catches: 2, tailCuts: 1, bestCombo: 3, games: 4 },
    missions: []
  }));
  const store = new ProgressionStore(storage);
  assert.equal(store.profile.level, 6);
  assert.equal(store.profile.coins, 1200);
  assert.equal(store.getKiteCondition('murcha'), 100);
  assert.ok(store.profile.house.ownedKites.includes('murcha'));
});

test('kite damage is saved and repair restores condition', () => {
  const storage = storageWith();
  const store = new ProgressionStore(storage);
  store.profile.coins = 500;
  const condition = store.damageKite('raia', 5);
  assert.equal(condition, 95);
  const repair = store.repairKite('raia');
  assert.equal(repair.ok, true);
  assert.equal(store.getKiteCondition('raia'), 100);
  assert.equal(store.profile.stats.repairs, 1);
  const restored = new ProgressionStore(storage);
  assert.equal(restored.getKiteCondition('raia'), 100);
});

test('house upgrade requires career level and coins, then adds garage slots', () => {
  const store = new ProgressionStore(storageWith());
  store.profile.level = 5;
  store.profile.coins = 1000;
  const result = store.upgradeHouse();
  assert.equal(result.ok, true);
  assert.equal(store.profile.house.level, 2);
  assert.equal(store.profile.house.garageSlots, 5);
});
