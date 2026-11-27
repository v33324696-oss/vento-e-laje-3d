const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Converts steering into a bounded, damped nose angle.
 * Holding a direction holds a stable arc instead of continuously spinning
 * the kite; releasing the control recentres the nose smoothly.
 */
export function stepKiteSteering({
  noseAngle = 0,
  angularVelocity = 0,
  steer = 0,
  dt = 1 / 60,
  maxAngle = 0.76,
  spinRate = 0
} = {}) {
  const step = clamp(Number(dt) || 0, 0, 0.033);
  const input = clamp(Number(steer) || 0, -1, 1);
  const limit = clamp(maxAngle, 0.45, 1.0);

  if (Math.abs(input) > 0.04) {
    const targetAngle = input * limit;
    const acceleration = (targetAngle - noseAngle) * 34 - angularVelocity * 11.5;
    angularVelocity = clamp(angularVelocity + acceleration * step, -4.2, 4.2);
    noseAngle += angularVelocity * step;

    const hardLimit = limit * 1.18;
    if (noseAngle > hardLimit) {
      noseAngle = hardLimit;
      if (angularVelocity > 0) angularVelocity = 0;
    } else if (noseAngle < -hardLimit) {
      noseAngle = -hardLimit;
      if (angularVelocity < 0) angularVelocity = 0;
    }
  } else if (Math.abs(spinRate) > 0.01) {
    angularVelocity += (spinRate - angularVelocity) * Math.min(1, step * 7);
    noseAngle += angularVelocity * step;
    if (noseAngle > Math.PI) noseAngle -= Math.PI * 2;
    if (noseAngle < -Math.PI) noseAngle += Math.PI * 2;
  } else {
    const acceleration = -noseAngle * 24 - angularVelocity * 10;
    angularVelocity = clamp(angularVelocity + acceleration * step, -4.2, 4.2);
    noseAngle += angularVelocity * step;
    noseAngle = clamp(noseAngle, -1.05, 1.05);
    if (Math.abs(noseAngle) < 0.002 && Math.abs(angularVelocity) < 0.012) {
      noseAngle = 0;
      angularVelocity = 0;
    }
  }

  return { noseAngle, angularVelocity };
}

/**
 * The line's direction above the pilot is not an angle-of-attack measurement.
 * Only the kite's own nose angle should contribute stall drag.
 */
export function calculateHighAngleDrag(noseAngle, stallAngle = 0.48, dragMultiplier = 1) {
  const excessAngle = Math.max(0, Math.abs(Number(noseAngle) || 0) - Math.max(0.1, stallAngle));
  return clamp(excessAngle * 1.45 * Math.max(0.1, dragMultiplier), 0, 1.2);
}
