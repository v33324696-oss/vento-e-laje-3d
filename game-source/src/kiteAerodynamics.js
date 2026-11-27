// Simplified, physically-inspired kite aerodynamics in game-scale units.
// Airflow is measured relative to the kite: wind velocity minus kite velocity.
export const AIR_DENSITY = 1.225;
export const KITE_MODEL_IDS = Object.freeze([
  'murcha', 'raia', 'latao', 'peixinho', 'papagaio', 'delta',
  'estrela', 'hexagonal', 'peixao', 'capucheta', 'morcego', 'quadrada', 'rokkaku'
]);

// Relative wing area, mass, lift/drag and passive stability are model-specific.
// These are tuned simulation coefficients, not laboratory measurements.
export const KITE_AERO_PROFILES = Object.freeze({
  murcha:     { area: 1.00, mass: 1.00, lift: 1.00, drag: 0.72, tailDrag: 0.30, stability: 0.76 },
  raia:       { area: 1.08, mass: 0.84, lift: 0.96, drag: 0.76, tailDrag: 0.20, stability: 0.44 },
  latao:      { area: 1.24, mass: 1.30, lift: 1.06, drag: 0.86, tailDrag: 0.40, stability: 0.84 },
  peixinho:   { area: 0.84, mass: 0.78, lift: 0.94, drag: 0.68, tailDrag: 0.24, stability: 0.62 },
  papagaio:   { area: 1.00, mass: 0.96, lift: 1.02, drag: 0.74, tailDrag: 0.34, stability: 0.82 },
  delta:      { area: 1.28, mass: 1.02, lift: 1.18, drag: 0.60, tailDrag: 0.18, stability: 0.70 },
  estrela:    { area: 1.14, mass: 1.10, lift: 0.90, drag: 0.96, tailDrag: 0.48, stability: 0.56 },
  hexagonal:  { area: 1.20, mass: 1.14, lift: 1.06, drag: 0.84, tailDrag: 0.42, stability: 0.82 },
  peixao:     { area: 1.42, mass: 1.40, lift: 1.04, drag: 0.92, tailDrag: 0.54, stability: 0.78 },
  capucheta:  { area: 0.72, mass: 0.64, lift: 0.88, drag: 0.66, tailDrag: 0.18, stability: 0.42 },
  morcego:    { area: 1.06, mass: 1.00, lift: 0.98, drag: 0.82, tailDrag: 0.28, stability: 0.60 },
  quadrada:   { area: 0.98, mass: 0.96, lift: 0.98, drag: 0.78, tailDrag: 0.36, stability: 0.86 },
  rokkaku:    { area: 1.22, mass: 1.16, lift: 1.16, drag: 0.74, tailDrag: 0.28, stability: 0.92 }
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function getKiteAeroProfile(modelId) {
  return KITE_AERO_PROFILES[modelId] || KITE_AERO_PROFILES.murcha;
}

export function getWindPhase(id) {
  const value = String(id ?? 'kite');
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
}

// Adds small, smooth, position-dependent gusts so two kites do not experience
// perfectly identical air at different points in the sky.
export function sampleWindAt(baseWind, position, time, phase = 0, out = {}) {
  const x = position.x || 0;
  const z = position.z || 0;
  const gust = Math.sin(time * 0.72 + x * 0.035 + z * 0.018 + phase) * 0.52
    + Math.sin(time * 1.63 - z * 0.027 + phase * 1.71) * 0.24;
  const crossGust = Math.sin(time * 0.31 + x * 0.021 + phase * 2.3) * 0.34;

  out.x = baseWind.x + gust * 0.48 + crossGust * 0.36;
  out.y = baseWind.y + Math.sin(time * 0.87 + x * 0.02 + phase) * 0.11;
  out.z = baseWind.z + gust * 0.62;
  return out;
}

// Returns acceleration from lift and drag. spanDirection is the kite's local
// span axis; forwardDirection points from the tail toward the nose.
export function calculateAerodynamicForces({
  airVelocity,
  spanDirection,
  forwardDirection,
  modelId = 'murcha',
  tailRatio = 1
}) {
  const profile = getKiteAeroProfile(modelId);
  const ax = airVelocity.x || 0;
  const ay = airVelocity.y || 0;
  const az = airVelocity.z || 0;
  const airSpeed = Math.hypot(ax, ay, az);

  if (airSpeed < 0.0001) {
    return {
      fx: 0, fy: 0, fz: 0, lift: 0, drag: 0,
      airSpeed: 0, dynamicPressure: 0, alignment: 0
    };
  }

  let liftX = spanDirection.y * az - spanDirection.z * ay;
  let liftY = spanDirection.z * ax - spanDirection.x * az;
  let liftZ = spanDirection.x * ay - spanDirection.y * ax;
  const liftLength = Math.hypot(liftX, liftY, liftZ);

  let alignment = 0;
  if (liftLength > 0.0001) {
    liftX /= liftLength;
    liftY /= liftLength;
    liftZ /= liftLength;
    alignment = clamp(
      liftX * forwardDirection.x + liftY * forwardDirection.y + liftZ * forwardDirection.z,
      -0.8,
      1
    );
  } else {
    liftX = 0;
    liftY = 0;
    liftZ = 0;
  }

  const dynamicPressure = 0.5 * AIR_DENSITY * airSpeed * airSpeed;
  const areaPerMass = profile.area / profile.mass;
  const lift = dynamicPressure * areaPerMass * profile.lift * 0.065 * alignment;
  const effectiveTail = clamp(tailRatio, 0, 1);
  const dragCoefficient = profile.drag + profile.tailDrag * effectiveTail;
  const drag = dynamicPressure * areaPerMass * dragCoefficient * 0.020;

  const invSpeed = 1 / airSpeed;
  return {
    fx: ax * invSpeed * drag + liftX * lift,
    fy: ay * invSpeed * drag + liftY * lift,
    fz: az * invSpeed * drag + liftZ * lift,
    lift,
    drag,
    airSpeed,
    dynamicPressure,
    alignment
  };
}
