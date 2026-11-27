import test from 'node:test';
import assert from 'node:assert/strict';
import { getAIDifficulty } from '../src/difficulty.js';

test('easy difficulty scales rivals below the normal setting', () => {
  assert.ok(getAIDifficulty({ matchDifficulty: 'easy' }) < getAIDifficulty({ matchDifficulty: 'normal' }));
});

test('hard difficulty makes rivals more aggressive than normal', () => {
  assert.ok(getAIDifficulty({ matchDifficulty: 'hard' }) > getAIDifficulty({ matchDifficulty: 'normal' }));
});

test('tournament rounds increase the selected difficulty over time', () => {
  const first = getAIDifficulty({ matchDifficulty: 'normal', gameMode: 'torneio', tournamentWave: 1 });
  const later = getAIDifficulty({ matchDifficulty: 'normal', gameMode: 'torneio', tournamentWave: 4 });
  assert.ok(later > first);
});

test('unknown difficulty safely falls back to normal', () => {
  assert.equal(getAIDifficulty({ matchDifficulty: 'unknown' }), 1);
});
