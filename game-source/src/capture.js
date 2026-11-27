import * as THREE from 'three';

// A catch is valid only when the flying line physically intersects the loose
// kite's actual rabiola. The kite body and its cut-off flying line are ignored.
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _r = new THREE.Vector3();
const _linePoint = new THREE.Vector3();
const _tailPoint = new THREE.Vector3();
const _bestLinePoint = new THREE.Vector3();
const _bestTailPoint = new THREE.Vector3();
const _midPoint = new THREE.Vector3();
const _projection = new THREE.Vector3();

function closestSegmentPoints(p1, q1, p2, q2, outLine, outTail) {
  _d1.subVectors(q1, p1);
  _d2.subVectors(q2, p2);
  _r.subVectors(p1, p2);

  const a = _d1.dot(_d1);
  const e = _d2.dot(_d2);
  const f = _d2.dot(_r);
  let s = 0;
  let t = 0;
  const eps = 1e-7;

  if (a <= eps && e <= eps) {
    outLine.copy(p1);
    outTail.copy(p2);
    return outLine.distanceTo(outTail);
  }
  if (a <= eps) {
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = _d1.dot(_r);
    if (e <= eps) {
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = _d1.dot(_d2);
      const denom = a * e - b * b;
      if (Math.abs(denom) > eps) s = THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1);
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }

  outLine.copy(p1).addScaledVector(_d1, s);
  outTail.copy(p2).addScaledVector(_d2, t);
  return outLine.distanceTo(outTail);
}

/**
 * Finds a real line-to-rabiola contact.
 * lineNodes: the catching kite's flying line, from reel to bridle.
 * rabiolaNodes: the cut kite's animated tail nodes (not the kite body or cut string).
 * firstRabiolaSegment skips the first short attachment area next to the kite.
 */
export function findRabiolaCapture(
  lineNodes,
  rabiolaNodes,
  maxDistance = 0.22,
  firstRabiolaSegment = 2
) {
  if (!Array.isArray(lineNodes) || lineNodes.length < 2
      || !Array.isArray(rabiolaNodes) || rabiolaNodes.length < firstRabiolaSegment + 2) {
    return null;
  }

  let bestDistance = Infinity;
  let bestLineSegment = -1;
  let bestTailSegment = -1;

  for (let lineIndex = 0; lineIndex < lineNodes.length - 1; lineIndex++) {
    const lp = lineNodes[lineIndex];
    const lq = lineNodes[lineIndex + 1];
    for (let tailIndex = firstRabiolaSegment; tailIndex < rabiolaNodes.length - 1; tailIndex++) {
      const tp = rabiolaNodes[tailIndex];
      const tq = rabiolaNodes[tailIndex + 1];
      const distance = closestSegmentPoints(lp, lq, tp, tq, _linePoint, _tailPoint);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestLineSegment = lineIndex;
        bestTailSegment = tailIndex;
        _bestLinePoint.copy(_linePoint);
        _bestTailPoint.copy(_tailPoint);
      }
    }
  }

  if (bestDistance > maxDistance || bestLineSegment < 0) return null;

  const lineStart = lineNodes[bestLineSegment];
  const lineEnd = lineNodes[bestLineSegment + 1];
  _projection.subVectors(lineEnd, lineStart);
  const lengthSq = _projection.lengthSq();
  const localU = lengthSq > 1e-8
    ? THREE.MathUtils.clamp(
      _midPoint.subVectors(_bestLinePoint, lineStart).dot(_projection) / lengthSq,
      0,
      1
    )
    : 0;

  return {
    distance: bestDistance,
    lineU: (bestLineSegment + localU) / (lineNodes.length - 1),
    lineSegmentIndex: bestLineSegment,
    tailSegmentIndex: bestTailSegment,
    linePoint: _bestLinePoint.clone(),
    tailPoint: _bestTailPoint.clone(),
    point: _midPoint.addVectors(_bestLinePoint, _bestTailPoint).multiplyScalar(0.5).clone()
  };
}
