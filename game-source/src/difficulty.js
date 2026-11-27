export const MATCH_DIFFICULTIES = Object.freeze({
  easy: 0.7,
  normal: 1,
  hard: 1.35
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
