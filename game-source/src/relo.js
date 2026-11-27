/**
 * RELO arcade model inspired by documented kite-duel controls:
 * line angle/entry, tension, pull/release, quick movement, wrap and timing.
 * All attributes are game balance values, not real cutting-material guidance.
 */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
const unit = (v) => clamp(v, 0, 1);

export function evaluateReloScore({
  crossingQuality = 0, tension = 0.5, reelSpeed = 0, kiteSpeed = 0,
  relativeSpeed = 0, socada = 0, disque = 0, largadaActive = false,
  largadaQuality = 0, linePower = 1, ownU = 0.5, targetU = 0.5,
  wrapQuality = 0, windAlignment = 0.75, disbicar = 0,
  rearAdvantage = 0, defenderExposure = 0
} = {}) {
  const cross = unit(crossingQuality);
  const tight = unit(tension);
  const wrap = unit(wrapQuality);
  const timing = unit(largadaQuality);

  // A clean crossing beats a parallel rub; a wrapped line is required for a strong attack.
  const angle = 0.42 + cross * 0.78;
  const wrapFactor = 0.62 + wrap * 0.58;
  const tensionFactor = 0.68 + 0.32 * unit(1 - Math.abs(tight - 0.70) / 0.70);
  const motion = 0.76 + Math.min(0.42,
    (Math.abs(reelSpeed) * 0.34 + kiteSpeed * 0.16 + relativeSpeed * 0.24) / 38);
  const maneuver = 1 + Math.min(0.46,
    Math.max(0, socada) * 0.13 + Math.max(0, disque) * 0.13 + unit(disbicar) * 0.18);
  const wind = 0.78 + unit(windAlignment) * 0.30;
  const position = 1 + unit(rearAdvantage) * 0.18;
  const exposure = 1 + unit(defenderExposure) * 0.58;

  // Contact near the kite-end is a vulnerable game zone; a poor entry is punished.
  let entry = 1;
  if (targetU > 0.82 && ownU < 0.78) entry = 1.25;
  else if (ownU > 0.82 && targetU < 0.68) entry = 0.58;
  else if (ownU > 0.76 && targetU < 0.76) entry = 0.80;

  // Largada is only effective after a short wrap/contact setup and within the timing window.
  let release = 1;
  if (largadaActive) {
    if (wrap < 0.28) release = 0.52;
    else if (timing >= 0.82) release = 1.55;
    else if (timing >= 0.62) release = 1.22;
    else if (timing >= 0.38) release = 0.88;
    else release = 0.58;
  }

  return clamp(clamp(linePower, 0.5, 1.35) * angle * wrapFactor *
    tensionFactor * motion * maneuver * wind * position * exposure * entry * release, 0.08, 3.2);
}

export function getCrossingQuality(a, b) {
  const la = Math.hypot(...a), lb = Math.hypot(...b);
  if (la < 1e-6 || lb < 1e-6) return 0;
  const dot = clamp((a[0]*b[0] + a[1]*b[1] + a[2]*b[2]) / (la*lb), -1, 1);
  return Math.sqrt(Math.max(0, 1 - dot*dot));
}

export function closestSegments3D(a0, a1, b0, b1) {
  const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const u=sub(a1,a0), v=sub(b1,b0), w=sub(a0,b0);
  const aa=dot(u,u), bb=dot(u,v), cc=dot(v,v), dd=dot(u,w), ee=dot(v,w);
  const den=aa*cc-bb*bb;
  let sn, sd=den, tn, td=den;
  if (aa<1e-8 && cc<1e-8) return {distance:Math.hypot(...w),s:0,t:0};
  if (aa<1e-8) {sn=0;sd=1;tn=ee;td=cc;}
  else if (cc<1e-8) {tn=0;td=1;sn=-dd;sd=aa;}
  else {
    if (den<1e-8) {sn=0;sd=1;tn=ee;td=cc;}
    else {sn=bb*ee-cc*dd;tn=aa*ee-bb*dd;}
    if (sn<0) {sn=0;tn=ee;td=cc;}
    else if (sn>sd) {sn=sd;tn=ee+bb;td=cc;}
  }
  if (tn<0) {tn=0;if(-dd<0)sn=0;else if(-dd>aa)sn=sd;else{sn=-dd;sd=aa;}}
  else if (tn>td) {tn=td;if(-dd+bb<0)sn=0;else if(-dd+bb>aa)sn=sd;else{sn=-dd+bb;sd=aa;}}
  const s=Math.abs(sn)<1e-8?0:sn/sd, t=Math.abs(tn)<1e-8?0:tn/td;
  const delta=[w[0]+s*u[0]-t*v[0],w[1]+s*u[1]-t*v[1],w[2]+s*u[2]-t*v[2]];
  return {distance:Math.hypot(...delta),s,t};
}
