export const MATCH_DIFFICULTIES = Object.freeze({
  easy: 0.68,
  normal: 1,
  hard: 2.15
});

const COMBAT_MULTIPLIERS = Object.freeze({
  easy: Object.freeze({ playerAttack: 1.24, rivalAttack: 0.62 }),
  normal: Object.freeze({ playerAttack: 1.05, rivalAttack: 0.94 }),
  hard: Object.freeze({ playerAttack: 0.78, rivalAttack: 1.42 })
});

export function getAIDifficulty({
  matchDifficulty = 'normal',
  gameMode = 'festival',
  tournamentWave = 1
} = {}) {
  const base = MATCH_DIFFICULTIES[matchDifficulty] ?? MATCH_DIFFICULTIES.normal;
  const wave = gameMode === 'torneio'
    ? 0.9 + Math.max(1, Number(tournamentWave) || 1) * 0.16
    : 1;
  return Number((base * wave).toFixed(3));
}

export function getCombatDamageMultipliers(matchDifficulty = 'normal') {
  return COMBAT_MULTIPLIERS[matchDifficulty] || COMBAT_MULTIPLIERS.normal;
}
