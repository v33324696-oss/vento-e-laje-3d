import { getKiteAeroProfile } from './kiteAerodynamics.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Converts dynamic pressure into a bounded visual/structural strain value.
// Coefficients are game-tuned because exact frame dimensions and materials
// are not measured for every kite in the catalogue.
export function calculateStructuralResponse(dynamicPressure, modelId = 'murcha', conditionPercent = 100) {
  const profile = getKiteAeroProfile(modelId);
  const pressure = Math.max(0, Number(dynamicPressure) || 0);
  const condition = clamp(Number(conditionPercent) || 0, 0, 100);
  const damageFactor = 1 + (100 - condition) * 0.008;
  const rawStrain = pressure * profile.area / Math.max(0.35, profile.frameStrength) * 0.0036 * damageFactor;
  const strain = clamp(rawStrain, 0, 1.35);
  return {
    strain,
    paperBend: clamp(strain * profile.flexibility, 0, 1.2),
    frameBend: clamp(strain * profile.flexibility * 0.52, 0, 0.72),
    overload: clamp((strain - 0.88) / 0.47, 0, 1),
    condition,
    damageFactor,
    flutterRate: profile.flutterRate
  };
}

// Elastic tether response: the line can stretch a little and damps a sudden
// pull instead of snapping the kite to a perfect sphere every frame.
export function calculateWinchResponse(radialVelocity, reelSpeed, dt, lineType = {}) {
  const step = clamp(Number(dt) || 0.016, 0.001, 0.04);
  const responseRate = clamp(lineType.pullResponse ?? 10.5, 7.5, 13.5);
  const targetRadialSpeed = reelSpeed < 0
    ? Math.max(-13.5, reelSpeed * 0.96)
    : 0;
  const blend = 1 - Math.exp(-responseRate * step);
  const velocityChange = radialVelocity > targetRadialSpeed
    ? (targetRadialSpeed - radialVelocity) * blend
    : 0;
  return { targetRadialSpeed, velocityChange, blend };
}

export function calculateCableResponse(extension, radialVelocity, lineType = {}) {
  const stretch = Math.max(0, Number(extension) || 0);
  const outwardSpeed = Math.max(0, Number(radialVelocity) || 0);
  const elasticity = clamp(lineType.elasticity ?? 0.03, 0.005, 0.09);
  const damping = clamp(lineType.damping ?? 0.82, 0.35, 1.2);
  const stiffness = 38 + (0.09 - elasticity) * 310;
  const maxStretch = 0.025 + elasticity * 0.8;
  const positionCorrection = Math.max(0, stretch - maxStretch);
  const radialImpulse = clamp(
    stretch * stiffness * 0.012 + outwardSpeed * damping * 0.24,
    0,
    2.4
  );
  const tension = clamp(stretch * (1.8 + stiffness * 0.018) + outwardSpeed * 0.075, 0, 1);
  return { elasticity, stiffness, maxStretch, positionCorrection, radialImpulse, tension };
}

// Tail mass changes how quickly the rabiola follows the kite and how much
// transverse wind can bend it. Shortened tails contribute less stabilizing force.
export function getTailDynamics(modelId = 'murcha', tailRatio = 1, windSpeed = 0) {
  const profile = getKiteAeroProfile(modelId);
  const remaining = clamp(tailRatio, 0, 1);
  const speed = Math.max(0, Number(windSpeed) || 0);
  return {
    remaining,
    inertia: profile.tailMass * (0.45 + remaining * 0.55),
    windCoupling: clamp((1.15 - profile.tailMass * 0.32) * (0.55 + speed * 0.018), 0.35, 1.45),
    gravity: 4.2 * profile.tailMass,
    damping: clamp(0.968 - profile.tailMass * 0.018, 0.91, 0.97),
    flutter: (0.022 + speed * 0.0014) * profile.flutterRate * (0.5 + remaining * 0.5)
  };
}
