import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressionStore } from '../src/progression.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('profile starts with a usable level and starter coins', () => {
  const store = new ProgressionStore(new MemoryStorage());
  assert.equal(store.profile.level, 1);
  assert.equal(store.profile.coins, 250);
  assert.equal(store.xpForNextLevel, 220);
});

test('five cuts complete the first mission and pay its reward', () => {
  const store = new ProgressionStore(new MemoryStorage());
  const result = store.record('cut', 5);
  const mission = store.getMissions().find((item) => item.id === 'first_cuts');
  assert.equal(mission.claimed, true);
  assert.deepEqual(result.completedMissions, ['Dono do céu']);
  assert.equal(store.profile.stats.cuts, 5);
  assert.ok(store.profile.coins > 250);
});

test('profile and mission progress persist between sessions', () => {
  const storage = new MemoryStorage();
  const first = new ProgressionStore(storage);
  first.setNickname('Vento');
  first.record('catch', 1);
  const second = new ProgressionStore(storage);
  assert.equal(second.profile.nickname, 'Vento');
  assert.equal(second.profile.stats.catches, 1);
  assert.equal(second.getMissions().find((item) => item.id === 'sky_catcher').progress, 1);
});

test('special discharge line requires level and coins before purchase', () => {
  const store = new ProgressionStore(new MemoryStorage());
  assert.equal(store.buyLine('linha_descarga').reason, 'Desbloqueia no nível 4.');
  store.profile.level = 4;
  assert.match(store.buyLine('linha_descarga').reason, /Faltam/);
  store.profile.coins = 1000;
  const purchased = store.buyLine('linha_descarga');
  assert.equal(purchased.ok, true);
  assert.equal(store.ownsLine('linha_descarga'), true);
  assert.equal(store.profile.coins, 100);
});

test('best combo is saved and never decreases', () => {
  const store = new ProgressionStore(new MemoryStorage());
  store.updateCombo(6);
  store.updateCombo(3);
  assert.equal(store.profile.stats.bestCombo, 6);
});


test('rescued kites join the saved collection and unlock the recovery achievement', () => {
  const store = new ProgressionStore(new MemoryStorage());
  assert.equal(store.recordRecovery('raia'), true);
  assert.ok(store.profile.house.ownedKites.includes('raia'));
  assert.ok(store.profile.house.recoveredKites.includes('raia'));
  assert.equal(store.getAchievements().find((item) => item.id === 'first_recovery')?.unlocked, undefined);
  assert.equal(store.getAchievements().find((item) => item.id === 'first_catch')?.unlocked, false);
  store.record('catch', 1);
  assert.equal(store.getAchievements().find((item) => item.id === 'first_catch').unlocked, true);
});

test('combat history is bounded, persisted and records the technique used', () => {
  const storage = new MemoryStorage();
  const store = new ProgressionStore(storage);
  store.recordCombat({ opponent: 'Juninho da Laje', technique: 'no disque', points: 450, combo: 3 });
  const loaded = new ProgressionStore(storage);
  assert.equal(loaded.profile.stats.combatWins, 1);
  assert.equal(loaded.profile.stats.bestCutStreak, 3);
  assert.equal(loaded.profile.cutHistory[0].opponent, 'Juninho da Laje');
  assert.equal(loaded.profile.cutHistory[0].technique, 'no disque');
  assert.equal(loaded.profile.cutHistory[0].points, 450);
});

test('house decorations respect level and coin requirements', () => {
  const store = new ProgressionStore(new MemoryStorage());
  assert.match(store.buyDecoration('trofeu_copa').reason, /nível 2/);
  const first = store.buyDecoration('bandeirolas');
  assert.equal(first.ok, true);
  assert.equal(store.profile.coins, 0);
  assert.equal(store.buyDecoration('bandeirolas').alreadyOwned, true);
  store.profile.house.level = 2;
  store.profile.coins = 700;
  assert.equal(store.buyDecoration('trofeu_copa').ok, true);
  assert.ok(store.profile.house.decorations.includes('trofeu_copa'));
});
