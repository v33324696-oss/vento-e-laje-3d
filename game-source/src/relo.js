/**
 * Shared, gameplay-only scoring for a virtual kite-line crossing.
 * This deliberately models timing, geometry and line handling as game stats;
 * it does not model real cutting materials or provide real-world instructions.
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const unit = (value) => clamp(value, 0, 1);

export function evaluateReloScore({
  crossingQuality = 0,
  tension = 0.5,
  reelSpeed = 0,
  kiteSpeed = 0,
  relativeSpeed = 0,
  socada = 0,
  disque = 0,
  largadaActive = false,
  largadaQuality = 0,
  linePower = 1,
  ownU = 0.5,
  targetU = 0.5
} = {}) {
  const crossing = unit(crossingQuality);
  const tensionValue = unit(tension);
  const timing = unit(largadaQuality);

  // A crossing that is almost parallel is a weak entry; a clean cross scores better.
  const angleFactor = 0.34 + crossing * 0.88;

  // A firm, controlled line is more useful than either a loose or over-forced one.
  const tensionFactor = 0.64 + 0.36 * unit(1 - Math.abs(tensionValue - 0.72) / 0.72);

  // Momentum and deliberate line movement matter, but do not dominate the result.
  const motionFactor = 0.72 + Math.min(0.52, (Math.abs(reelSpeed) * 0.42 + kiteSpeed * 0.18 + relativeSpeed * 0.32) / 34);
  const maneuverFactor = 1 + Math.min(0.36, Math.max(0, socada) * 0.17 + Math.max(0, disque) * 0.15);

  // Favor entering from the lower part of your own line toward the opponent's upper line.
  let entryFactor = 1;
  if (targetU > 0.82 && ownU < 0.78) entryFactor = 1.28;
  else if (ownU > 0.82 && targetU < 0.68) entryFactor = 0.58;
  else if (ownU > 0.76 && targetU < 0.76) entryFactor = 0.82;

  // Largada is a short timing window. A late/early tap is a disadvantage, not a free bonus.
  let largadaFactor = 1;
  if (largadaActive) {
    if (timing >= 0.68) largadaFactor = 1.48 + timing * 0.18;
    else if (timing >= 0.38) largadaFactor = 0.92 + timing * 0.18;
    else largadaFactor = 0.58;
  }

  const power = clamp(linePower, 0.55, 1.2);
  return clamp(power * angleFactor * tensionFactor * motionFactor * maneuverFactor * entryFactor * largadaFactor, 0.12, 2.4);
}

export function getCrossingQuality(directionA, directionB) {
  const lenA = Math.hypot(...directionA);
  const lenB = Math.hypot(...directionB);
  if (lenA < 1e-6 || lenB < 1e-6) return 0;
  const dot = clamp(
    (directionA[0] * directionB[0] + directionA[1] * directionB[1] + directionA[2] * directionB[2]) / (lenA * lenB),
    -1,
    1
  );
  return Math.sqrt(Math.max(0, 1 - dot * dot));
}

export function closestSegments3D(a0, a1, b0, b1) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const u = sub(a1, a0), v = sub(b1, b0), w = sub(a0, b0);
  const aa = dot(u, u), bb = dot(u, v), cc = dot(v, v), dd = dot(u, w), ee = dot(v, w);
  const den = aa * cc - bb * bb;
  let sn, sd = den, tn, td = den;
  if (aa < 1e-8 && cc < 1e-8) return { distance: Math.hypot(...w), s: 0, t: 0 };
  if (aa < 1e-8) { sn = 0; sd = 1; tn = ee; td = cc; }
  else if (cc < 1e-8) { tn = 0; td = 1; sn = -dd; sd = aa; }
  else {
    if (den < 1e-8) { sn = 0; sd = 1; tn = ee; td = cc; }
    else { sn = bb * ee - cc * dd; tn = aa * ee - bb * dd; }
    if (sn < 0) { sn = 0; tn = ee; td = cc; }
    else if (sn > sd) { sn = sd; tn = ee + bb; td = cc; }
  }
  if (tn < 0) {
    tn = 0;
    if (-dd < 0) sn = 0;
    else if (-dd > aa) sn = sd;
    else { sn = -dd; sd = aa; }
  } else if (tn > td) {
    tn = td;
    if (-dd + bb < 0) sn = 0;
    else if (-dd + bb > aa) sn = sd;
    else { sn = -dd + bb; sd = aa; }
  }
  const s = Math.abs(sn) < 1e-8 ? 0 : sn / sd;
  const t = Math.abs(tn) < 1e-8 ? 0 : tn / td;
  const delta = [w[0] + s * u[0] - t * v[0], w[1] + s * u[1] - t * v[1], w[2] + s * u[2] - t * v[2]];
  return { distance: Math.hypot(...delta), s, t };
}
