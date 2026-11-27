import test from 'node:test';
import assert from 'node:assert/strict';
import { getAIDifficulty, getCombatDamageMultipliers } from '../src/difficulty.js';

test('easy difficulty scales rivals below the normal setting', () => {
  assert.ok(getAIDifficulty({ matchDifficulty: 'easy' }) < getAIDifficulty({ matchDifficulty: 'normal' }));
});

test('hard difficulty makes rivals substantially more aggressive than normal', () => {
  assert.ok(getAIDifficulty({ matchDifficulty: 'hard' }) >= 2);
  assert.ok(getAIDifficulty({ matchDifficulty: 'hard' }) > getAIDifficulty({ matchDifficulty: 'normal' }) * 2);
});

test('tournament rounds increase the selected difficulty over time', () => {
  const first = getAIDifficulty({ matchDifficulty: 'normal', gameMode: 'torneio', tournamentWave: 1 });
  const later = getAIDifficulty({ matchDifficulty: 'normal', gameMode: 'torneio', tournamentWave: 4 });
  assert.ok(later > first);
});

test('unknown difficulty safely falls back to normal', () => {
  assert.equal(getAIDifficulty({ matchDifficulty: 'unknown' }), 1);
});

test('easy mode strongly favors the player', () => {
  const damage = getCombatDamageMultipliers('easy');
  assert.ok(damage.playerAttack > damage.rivalAttack);
});

test('hard mode favors rival attacks and reduces player attack strength', () => {
  const damage = getCombatDamageMultipliers('hard');
  assert.ok(damage.rivalAttack > 1.3);
  assert.ok(damage.playerAttack < 0.85);
  assert.ok(damage.rivalAttack > damage.playerAttack * 1.7);
});

test('normal mode remains close to balanced', () => {
  const damage = getCombatDamageMultipliers('normal');
  assert.ok(Math.abs(damage.playerAttack - damage.rivalAttack) < 0.2);
});
