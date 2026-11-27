export const RABIOLA_LOCK_PINS = 5;
export const RABIOLA_LOCK_MAX_MISSES = 3;

function modelSeed(modelId = 'murcha') {
  let hash = 2166136261;
  for (const char of String(modelId)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRabiolaLockState(modelId, startedAt = 0) {
  const seed = modelSeed(modelId);
  return {
    modelId,
    startedAt,
    stage: 0,
    mistakes: 0,
    phase: (seed % 6283) / 1000,
    seed
  };
}

export function getRabiolaLockReading(state, elapsedTime) {
  const stage = Math.min(RABIOLA_LOCK_PINS - 1, Math.max(0, state.stage));
  const elapsed = Math.max(0, elapsedTime - state.startedAt);
  const speed = 2.65 + stage * 0.58;
  const cursor = 0.5 + 0.5 * Math.sin(elapsed * speed + state.phase + stage * 1.27);
  const target = 0.18 + (((state.seed % 997) / 997 + stage * 0.173) % 0.64);
  const halfWindow = Math.max(0.024, 0.073 - stage * 0.008);
  return { cursor, target, halfWindow, speed };
}

export function attemptRabiolaLock(state, elapsedTime) {
  if (state.stage >= RABIOLA_LOCK_PINS || state.mistakes >= RABIOLA_LOCK_MAX_MISSES) {
    return {
      state,
      reading: getRabiolaLockReading(state, elapsedTime),
      hit: false,
      complete: state.stage >= RABIOLA_LOCK_PINS,
      failed: state.mistakes >= RABIOLA_LOCK_MAX_MISSES
    };
  }

  const reading = getRabiolaLockReading(state, elapsedTime);
  const hit = Math.abs(reading.cursor - reading.target) <= reading.halfWindow;
  const nextState = {
    ...state,
    stage: state.stage + (hit ? 1 : 0),
    mistakes: state.mistakes + (hit ? 0 : 1)
  };

  return {
    state: nextState,
    reading,
    hit,
    complete: nextState.stage >= RABIOLA_LOCK_PINS,
    failed: nextState.mistakes >= RABIOLA_LOCK_MAX_MISSES
  };
}
