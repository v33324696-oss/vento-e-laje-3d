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
  murcha:     { area: 1.00, mass: 1.00, lift: 1.00, drag: 0.72, tailDrag: 0.30, stability: 0.76, stallAngle: 0.48, flexibility: 0.62, frameStrength: 0.92, paperWeight: 1.00, tailMass: 0.96, flutterRate: 1.00 },
  raia:       { area: 1.08, mass: 0.84, lift: 0.96, drag: 0.76, tailDrag: 0.20, stability: 0.44, stallAngle: 0.43, flexibility: 0.78, frameStrength: 0.76, paperWeight: 0.78, tailMass: 0.62, flutterRate: 1.28 },
  latao:      { area: 1.24, mass: 1.30, lift: 1.06, drag: 0.86, tailDrag: 0.40, stability: 0.84, stallAngle: 0.52, flexibility: 0.42, frameStrength: 1.34, paperWeight: 1.28, tailMass: 1.18, flutterRate: 0.78 },
  peixinho:   { area: 0.84, mass: 0.78, lift: 0.94, drag: 0.68, tailDrag: 0.24, stability: 0.62, stallAngle: 0.46, flexibility: 0.72, frameStrength: 0.80, paperWeight: 0.76, tailMass: 0.86, flutterRate: 1.12 },
  papagaio:   { area: 1.00, mass: 0.96, lift: 1.02, drag: 0.74, tailDrag: 0.34, stability: 0.82, stallAngle: 0.50, flexibility: 0.58, frameStrength: 1.02, paperWeight: 0.96, tailMass: 1.02, flutterRate: 0.92 },
  delta:      { area: 1.28, mass: 1.02, lift: 1.18, drag: 0.60, tailDrag: 0.18, stability: 0.70, stallAngle: 0.53, flexibility: 0.46, frameStrength: 1.12, paperWeight: 0.98, tailMass: 0.72, flutterRate: 1.08 },
  estrela:    { area: 1.14, mass: 1.10, lift: 0.90, drag: 0.96, tailDrag: 0.48, stability: 0.56, stallAngle: 0.44, flexibility: 0.74, frameStrength: 0.72, paperWeight: 1.08, tailMass: 1.28, flutterRate: 1.18 },
  hexagonal:  { area: 1.20, mass: 1.14, lift: 1.06, drag: 0.84, tailDrag: 0.42, stability: 0.82, stallAngle: 0.50, flexibility: 0.50, frameStrength: 1.10, paperWeight: 1.12, tailMass: 1.12, flutterRate: 0.86 },
  peixao:     { area: 1.42, mass: 1.40, lift: 1.04, drag: 0.92, tailDrag: 0.54, stability: 0.78, stallAngle: 0.51, flexibility: 0.44, frameStrength: 1.30, paperWeight: 1.34, tailMass: 1.36, flutterRate: 0.76 },
  capucheta:  { area: 0.72, mass: 0.64, lift: 0.88, drag: 0.66, tailDrag: 0.18, stability: 0.42, stallAngle: 0.42, flexibility: 0.88, frameStrength: 0.64, paperWeight: 0.60, tailMass: 0.72, flutterRate: 1.36 },
  morcego:    { area: 1.06, mass: 1.00, lift: 0.98, drag: 0.82, tailDrag: 0.28, stability: 0.60, stallAngle: 0.46, flexibility: 0.70, frameStrength: 0.88, paperWeight: 0.96, tailMass: 0.90, flutterRate: 1.14 },
  quadrada:   { area: 0.98, mass: 0.96, lift: 0.98, drag: 0.78, tailDrag: 0.36, stability: 0.86, stallAngle: 0.51, flexibility: 0.48, frameStrength: 1.08, paperWeight: 0.94, tailMass: 0.96, flutterRate: 0.84 },
  rokkaku:    { area: 1.22, mass: 1.16, lift: 1.16, drag: 0.74, tailDrag: 0.28, stability: 0.92, stallAngle: 0.54, flexibility: 0.42, frameStrength: 1.22, paperWeight: 1.12, tailMass: 0.88, flutterRate: 0.88 }
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Lift rises with effective angle of attack, then falls after the wing stalls.
export function calculateLiftCoefficient(angleOfAttack, stallAngle = 0.48) {
  const alpha = Math.max(0, angleOfAttack);
  const peakAngle = Math.min(0.30, stallAngle * 0.68);
  const attachedLift = Math.min(1, alpha / Math.max(0.08, peakAngle));
  const separation = Math.max(0.28, 1 - Math.max(0, alpha - stallAngle) * 2.8);
  return attachedLift * separation;
}

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

  // A coherent regional wind field: nearby kites experience the same broad
  // gust, with only a small position-dependent difference. Kite identity is
  // deliberately a tiny detail instead of a separate, unrelated wind stream.
  const regionalGust = Math.sin(time * 0.20 + x * 0.012 + z * 0.009) * 0.28
    + Math.sin(time * 0.43 - z * 0.014 + x * 0.005 + 0.6) * 0.12;
  const crossGust = Math.sin(time * 0.15 + x * 0.009 + phase * 0.16) * 0.08;

  out.x = baseWind.x + regionalGust * 0.22 + crossGust * 0.14;
  out.y = baseWind.y + Math.sin(time * 0.18 + x * 0.008 + phase * 0.08) * 0.035;
  out.z = baseWind.z + regionalGust * 0.34;
  return out;
}

// Returns acceleration from lift and drag. spanDirection is the kite's local
// span axis; forwardDirection points from the tail toward the nose.

export function bankSpanForSteering(spanDirection, airVelocity, bankAngle, out = {}) {
  const airLength = Math.hypot(airVelocity.x || 0, airVelocity.y || 0, airVelocity.z || 0);
  if (airLength < 0.0001) {
    out.x = spanDirection.x;
    out.y = spanDirection.y;
    out.z = spanDirection.z;
    return out;
  }

  const ax = airVelocity.x / airLength;
  const ay = airVelocity.y / airLength;
  const az = airVelocity.z / airLength;
  const angle = clamp(bankAngle, -0.82, 0.82);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dot = ax * spanDirection.x + ay * spanDirection.y + az * spanDirection.z;
  const crossX = ay * spanDirection.z - az * spanDirection.y;
  const crossY = az * spanDirection.x - ax * spanDirection.z;
  const crossZ = ax * spanDirection.y - ay * spanDirection.x;
  out.x = spanDirection.x * cosine + crossX * sine + ax * dot * (1 - cosine);
  out.y = spanDirection.y * cosine + crossY * sine + ay * dot * (1 - cosine);
  out.z = spanDirection.z * cosine + crossZ * sine + az * dot * (1 - cosine);
  const length = Math.hypot(out.x, out.y, out.z) || 1;
  out.x /= length;
  out.y /= length;
  out.z /= length;
  return out;
}

export function calculateAerodynamicForces({
  airVelocity,
  spanDirection,
  forwardDirection,
  modelId = 'murcha',
  tailRatio = 1,
  angleOfAttack = 0.28
}) {
  const profile = getKiteAeroProfile(modelId);
  const ax = airVelocity.x || 0;
  const ay = airVelocity.y || 0;
  const az = airVelocity.z || 0;
  const airSpeed = Math.hypot(ax, ay, az);

  if (airSpeed < 0.0001) {
    return {
      fx: 0, fy: 0, fz: 0, lift: 0, drag: 0,
      liftCoefficient: 0, angleOfAttack, stalled: false,
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
  const liftCoefficient = calculateLiftCoefficient(angleOfAttack, profile.stallAngle);
  const stalled = angleOfAttack > profile.stallAngle;
  const lift = dynamicPressure * areaPerMass * profile.lift * 0.065 * alignment * liftCoefficient;
  const effectiveTail = clamp(tailRatio, 0, 1);
  const stallDrag = Math.max(0, angleOfAttack - profile.stallAngle) * 0.9;
  const dragCoefficient = profile.drag + profile.tailDrag * effectiveTail + stallDrag;
  const drag = dynamicPressure * areaPerMass * dragCoefficient * 0.020;

  const invSpeed = 1 / airSpeed;
  return {
    fx: ax * invSpeed * drag + liftX * lift,
    fy: ay * invSpeed * drag + liftY * lift,
    fz: az * invSpeed * drag + liftZ * lift,
    lift,
    drag,
    liftCoefficient,
    angleOfAttack,
    stalled,
    airSpeed,
    dynamicPressure,
    alignment
  };
}
