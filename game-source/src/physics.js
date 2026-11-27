import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { KiteVisual } from './kiteMesh.js';
import { LINE_TYPES } from './carretilha.js';
import { evaluateReloScore } from './relo.js';
import { bankSpanForSteering, calculateAerodynamicForces, getKiteAeroProfile, getWindPhase, sampleWindAt } from './kiteAerodynamics.js';
import { calculateCableResponse, calculateStructuralResponse, calculateWinchResponse } from './kiteStructure.js';

export const STRING_SEGMENTS = 28;

// Normal kites fly forward at a moderate line angle, not straight overhead.
const MAX_FLIGHT_ELEVATION_TAN = Math.tan(THREE.MathUtils.degToRad(56));

// Computes closest points between 3D line segments P1-Q1 and P2-Q2
export function closestPointsBetweenSegments(p1, q1, p2, q2, out1, out2) {
  _d1.subVectors(q1, p1);
  _d2.subVectors(q2, p2);
  _r.subVectors(p1, p2);

  const a = _d1.dot(_d1);
  const e = _d2.dot(_d2);
  const f = _d2.dot(_r);

  let s = 0;
  let t = 0;
  const EPS = 1e-6;

  if (a <= EPS && e <= EPS) {
    out1.copy(p1);
    out2.copy(p2);
    return out1.distanceTo(out2);
  }
  if (a <= EPS) {
    s = 0;
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = _d1.dot(_r);
    if (e <= EPS) {
      t = 0;
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = _d1.dot(_d2);
      const denom = a * e - b * b;
      if (denom !== 0) {
        s = THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1);
      } else {
        s = 0;
      }
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

  out1.copy(p1).addScaledVector(_d1, s);
  out2.copy(p2).addScaledVector(_d2, t);
  return out1.distanceTo(out2);
}

export class KiteEntity {
  constructor(scene, {
    id,
    name,
    isPlayer = false,
    anchorPos = new THREE.Vector3(0, 11, 14),
    modelId = 'murcha',
    patternId = 'estrela_paulista',
    lineTypeId = 'rosa_chilena',
    tailStyle = 'padrao',
    resolution = new THREE.Vector2(1280, 720)
  }) {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.isPlayer = isPlayer;

    this.anchorPos = anchorPos.clone();
    this.lineType = LINE_TYPES[lineTypeId] || LINE_TYPES.rosa_chilena;

    this.visual = new KiteVisual(scene, { modelId, patternId, tailStyle });

    // Flight state
    this.active = true;
    this.lineLength = isPlayer ? 58 : 54 + Math.random() * 22;
    this.minLine = 16;
    this.maxLine = 195;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.noseAngle = 0; // 0 = Up, + = Right, - = Left
    this.angularVel = 0;
    this.cableTension = 0;
    this.windPhase = getWindPhase(id || modelId);
    this.localWind = new THREE.Vector3();
    this.aeroDynamicPressure = 0;
    this.angleOfAttack = 0.26;
    this.bankAngle = 0;
    this.stalled = false;

    this.tension = 0.32;
    this.reelSpeed = 0; // + paying out, - reeling in
    this.socadaBoost = 0;
    this.disqueBoost = 0;
    this.disqueDir = 0;
    this.disqueCooldown = 0;
    this.disbicarBoost = 0;
    this.disbicarDir = 1;
    this.disbicarCooldown = 0;
    this.turnCooldown = 0;
    this.directionTarget = 0;
    this.retaoBoost = 0;
    this.retaoHeading = 0;
    this.retaoCooldown = 0;
    this.reloContactTime = 0;
    this.tailCutCooldown = 0;
    this.largadaBoost = 0;
    this.largadaQuality = 0;
    this.largadaCooldown = 0;
    this.largadaTagTimer = 0;

    // Combat integrity during relo
    this.lineIntegrity = 1.0;
    this.inRelo = false;

    // Build 3D Catenary String (Line2 for crisp anti-aliased thickness)
    this.stringNodes = [];
    this.stringPrevNodes = [];
    for (let i = 0; i <= STRING_SEGMENTS; i++) {
      this.stringNodes.push(new THREE.Vector3());
      this.stringPrevNodes.push(new THREE.Vector3());
    }
    this.stringRopeReady = false;
    this.stringFlatPos = new Float32Array((STRING_SEGMENTS + 1) * 3);
    this.stringColors = new Float32Array((STRING_SEGMENTS + 1) * 3);

    this.lineGeo = new LineGeometry();
    this.lineMat = new LineMaterial({
      color: 0xffffff,
      vertexColors: true,
      linewidth: isPlayer ? 2.5 : 1.75,
      transparent: true,
      opacity: isPlayer ? 0.96 : 0.82,
      resolution: resolution.clone()
    });
    this.lineMesh = new Line2(this.lineGeo, this.lineMat);
    this.lineMesh.frustumCulled = false;
    this.scene.add(this.lineMesh);

    this.spawnInSky();
  }

  setResolution(w, h) {
    this.lineMat.resolution.set(w, h);
  }

  setLineType(lineTypeId) {
    this.lineType = LINE_TYPES[lineTypeId] || LINE_TYPES.rosa_chilena;
  }

  spawnInSky(lowLaunch = false) {
    this.active = true;
    this.lineIntegrity = 1.0;
    this.inRelo = false;
    this.socadaBoost = 0;
    this.largadaBoost = 0;
    this.largadaQuality = 0;
    this.largadaCooldown = 0;
    this.largadaTagTimer = 0;
    this.disqueBoost = 0;
    this.disbicarBoost = 0;
    this.disbicarCooldown = 0;
    this.reloContactTime = 0;
    this.noseAngle = (Math.random() - 0.5) * 0.35;
    this.angularVel = 0;
    this.cableTension = 0;
    this.tension = 0.32;
    this.angleOfAttack = 0.26;
    this.bankAngle = 0;
    this.stalled = false;
    this.stringRopeReady = false;
    this.velocity.set(0, 0, 0);

    this.lineLength = lowLaunch ? 24 : (this.isPlayer ? 58 : 54 + Math.random() * 22);
    const elev = lowLaunch ? 0.36 : (0.32 + Math.random() * 0.14);
    const azim = this.isPlayer ? 0 : (Math.random() - 0.5) * 0.42;

    const horiz = Math.cos(elev) * this.lineLength;
    this.position.set(
      this.anchorPos.x + Math.sin(azim) * horiz,
      this.anchorPos.y + Math.sin(elev) * this.lineLength,
      this.anchorPos.z - Math.cos(azim) * horiz
    );

    this.visual.setVisible(true);
    this.lineMesh.visible = true;
    this.visual.resetTailAt(this.position);
    this._updateOrientation(new THREE.Vector3(0, 0, -9));
    this._updateStringCurve(new THREE.Vector3(0, 0, -9), -1, 0);
  }

  triggerSocada(strength = 1.0) {
    if (!this.active) return;
    this.socadaBoost = Math.min(1.35, this.socadaBoost + 0.95 * strength);
    this.tension = Math.min(1.0, this.tension + 0.45);
    this.tension = Math.min(1, this.tension + 0.12 * strength);
    // Lock spin immediately so kite shoots straight where its nose points!
    this.angularVel *= 0.15;
  }

  triggerLargada(quality = 0) {
    if (!this.active || this.largadaCooldown > 0) return false;
    this.largadaQuality = THREE.MathUtils.clamp(quality, 0, 1);
    this.largadaBoost = 0.52;
    this.largadaTagTimer = 1.8;
    this.largadaCooldown = 0.78;
    return true;
  }

  triggerDisque(dir = 1) {
    if (!this.active || this.disqueCooldown > 0) return;
    this.disqueDir = dir;
    this.disqueBoost = 1.0;
    this.disqueCooldown = 0.62;
    this.tension = 1.0;
  }

  triggerTurn(dir = 1) {
    if (!this.active || this.turnCooldown > 0 || this.retaoBoost > 0.05) return false;
    // Select a flight heading to the chosen side. This is a controlled turn,
    // not a continuous 360-degree spin of the kite.
    this.directionTarget = (Math.sign(dir) || 1) * 1.12;
    this.turnCooldown = 0.32;
    return true;
  }

  triggerRetao() {
    if (!this.active || this.retaoCooldown > 0 || this.retaoBoost > 0.05) return false;
    // Retão is a short, straight dive toward the flyer, not a forward sprint.
    this.retaoHeading = Math.PI;
    this.directionTarget = 0;
    this.retaoBoost = 0.95;
    this.retaoCooldown = 1.35;
    this.angularVel = 0;
    return true;
  }

  triggerDisbicar(dir = 1) {
    if (!this.active || this.disbicarCooldown > 0) return false;
    this.disbicarDir = Math.sign(dir) || 1;
    this.disbicarBoost = 1.0;
    this.disbicarCooldown = 0.48;
    this.tension = Math.min(1, this.tension + 0.38);
    this.lineLength = Math.max(this.minLine, this.lineLength - 0.12);
    this.angularVel += this.disbicarDir * 3.1;
    return true;
  }

  _computeTangentFrame(outRadial, outRight, outUp) {
    outRadial.subVectors(this.position, this.anchorPos);
    const dist = outRadial.length() || 1;
    outRadial.divideScalar(dist);

    if (Math.abs(outRadial.y) > 0.97) {
      outRight.set(1, 0, 0);
    } else {
      // r x WorldUp points to Player's Right when looking toward -Z
      outRight.crossVectors(outRadial, _worldUp).normalize();
    }
    outUp.crossVectors(outRight, outRadial).normalize();
    return dist;
  }

  _updateOrientation(windVec) {
    this._computeTangentFrame(_rad, _tRight, _tUp);

    // Nose vector in local tangent plane
    const cosA = Math.cos(this.noseAngle);
    const sinA = Math.sin(this.noseAngle);
    _noseDir.copy(_tUp).multiplyScalar(cosA).addScaledVector(_tRight, sinA).normalize();

    // Front (+Z of kite) faces generally toward anchor (-_rad), pitched back by angle of attack
    const aoa = THREE.MathUtils.clamp(this.angleOfAttack - this.tension * 0.035 - this.socadaBoost * 0.04, 0.08, 0.68);
    _kiteZ.copy(_rad).negate().addScaledVector(_noseDir, -aoa).normalize();
    _kiteX.crossVectors(_noseDir, _kiteZ).normalize();
    _kiteY.crossVectors(_kiteZ, _kiteX).normalize();

    _rotMat.makeBasis(_kiteX, _kiteY, _kiteZ);
    this.quaternion.setFromRotationMatrix(_rotMat);
    if (Math.abs(this.bankAngle) > 0.0001) {
      _bankQuat.setFromAxisAngle(_rad, this.bankAngle * 0.28);
      this.quaternion.multiply(_bankQuat);
    }
    void windVec;
  }

  _updateStringCurve(windVec, highlightU = -1, highlightStrength = 0, dt = 0.016) {
    const bridlePos = this.visual.getBridleWorldPosition(_bridleWorld);
    _ropeDelta.subVectors(bridlePos, this.anchorPos);
    const span = _ropeDelta.length();
    const direction = _ropeDelta.multiplyScalar(1 / Math.max(0.001, span));
    const slack = Math.max(0, this.lineLength - span);
    const tensionFactor = THREE.MathUtils.clamp((this.tension - 0.22) / 0.58, 0, 1);
    const sag = Math.min(2.4, Math.sqrt(Math.max(0, 2 * span * slack)) * 0.075)
      * (1 - tensionFactor * 0.78);
    _ropeSide.crossVectors(direction, _worldUp).normalize();
    if (_ropeSide.lengthSq() < 0.001) _ropeSide.set(1, 0, 0);
    const windSide = THREE.MathUtils.clamp(windVec.dot(_ropeSide), -8, 8);
    const windBow = THREE.MathUtils.clamp(windSide * slack * 0.0032 * this.lineType.drag, -0.8, 0.8);
    const vibration = (this.socadaBoost * 0.012 + highlightStrength * 0.01)
      * Math.min(1, Math.max(0, dt) * 60);
    const baseColor = _baseCol.setHex(this.lineType.color);
    const hotColor = _hotCol.setHex(0xffffff);

    for (let i = 0; i <= STRING_SEGMENTS; i++) {
      const u = i / STRING_SEGMENTS;
      const parabola = 4 * u * (1 - u);
      const node = this.stringNodes[i];
      node.lerpVectors(this.anchorPos, bridlePos, u);
      node.y -= parabola * sag;
      node.addScaledVector(_ropeSide, parabola * windBow);
      node.x += Math.sin(u * Math.PI * 5 + performance.now() * 0.006) * vibration * parabola;

      this.stringFlatPos[i * 3] = node.x;
      this.stringFlatPos[i * 3 + 1] = node.y;
      this.stringFlatPos[i * 3 + 2] = node.z;

      let glow = 0;
      if (highlightU >= 0 && highlightStrength > 0) {
        glow = Math.max(0, 1 - Math.abs(u - highlightU) * 5.5) * highlightStrength;
      }
      _vertCol.copy(baseColor).lerp(hotColor, glow);
      this.stringColors[i * 3] = _vertCol.r;
      this.stringColors[i * 3 + 1] = _vertCol.g;
      this.stringColors[i * 3 + 2] = _vertCol.b;
    }

    this.lineGeo.setPositions(this.stringFlatPos);
    this.lineGeo.setColors(this.stringColors);
  }

  update({
    controls = { pull: false, release: false, quickRelease: false, steer: 0 }, 
    windVec,
    sunDir,
    cameraPos,
    minGroundY = 3.0,
    reloHighlightU = -1,
    reloHighlightStrength = 0,
    dt = 0.016,
    time = 0
  }) {
    if (!this.active) return;

    const stepDt = Math.min(0.033, dt);
    const spec = this.visual.spec;
    const aeroProfile = getKiteAeroProfile(spec.id);
    const tailRatio = this.visual.getTailRatio();

    this.socadaBoost *= Math.pow(0.018, stepDt);
    this.disqueBoost *= Math.pow(0.012, stepDt);
    this.disbicarBoost *= Math.pow(0.035, stepDt);
    if (this.disqueCooldown > 0) this.disqueCooldown = Math.max(0, this.disqueCooldown - stepDt);
    if (this.disbicarCooldown > 0) this.disbicarCooldown = Math.max(0, this.disbicarCooldown - stepDt);
    if (this.turnCooldown > 0) this.turnCooldown = Math.max(0, this.turnCooldown - stepDt);
    if (this.retaoCooldown > 0) this.retaoCooldown = Math.max(0, this.retaoCooldown - stepDt);
    if (this.retaoBoost > 0) this.retaoBoost = Math.max(0, this.retaoBoost - stepDt);
    if (this.largadaCooldown > 0) this.largadaCooldown = Math.max(0, this.largadaCooldown - stepDt);
    if (this.largadaBoost > 0) this.largadaBoost = Math.max(0, this.largadaBoost - stepDt);
    if (this.largadaTagTimer > 0) this.largadaTagTimer = Math.max(0, this.largadaTagTimer - stepDt);
    if (this.tailCutCooldown > 0) this.tailCutCooldown = Math.max(0, this.tailCutCooldown - stepDt);

    // 1. Line Reel & Tension state
    let targetTension = 0.18;
    this.reelSpeed = 0;

    if (controls.pull) {
      this.reelSpeed = -12.5 * spec.speedMult;
      this.lineLength = Math.max(this.minLine, this.lineLength + this.reelSpeed * stepDt);
      targetTension = 0.66;
    } else if (controls.quickRelease) {
      this.reelSpeed = 15.5;
      this.lineLength = Math.min(this.maxLine, this.lineLength + this.reelSpeed * stepDt);
      targetTension = 0.10;
    } else if (controls.release) {
      this.reelSpeed = 5.2;
      this.lineLength = Math.min(this.maxLine, this.lineLength + this.reelSpeed * stepDt);
      targetTension = 0.16;
    }

    // Manual inputs alter the desired feel, while the tether constraint below
    // contributes the actual physical line tension.
    targetTension = Math.min(1.0, targetTension + this.socadaBoost * 0.55 + this.disqueBoost * 0.55 + this.disbicarBoost * 0.32);

    // 2. Nose Rotation ("Giro do bico" on slack vs Steering vs Rabiola Stabilization)
    const steer = THREE.MathUtils.clamp(controls.steer || 0, -1, 1);
    const rabicoWildness = 1.0 + (1.0 - tailRatio) * 1.15;

    // Steering is a heading target, not an endless angular-speed command.
    // Manual controls return the nose toward center when released; AI supplies
    // its own world-relative target so every kite uses the same stable servo.
    if (this.isPlayer && Math.abs(steer) > 0.02) {
      this.directionTarget = steer * 1.12;
    }
    let steerTarget = this.isPlayer
      ? this.directionTarget
      : THREE.MathUtils.clamp(
          Number.isFinite(controls.steerTarget) ? controls.steerTarget : steer * 0.78,
          -Math.PI,
          Math.PI
        );
    if (this.retaoBoost > 0.05) steerTarget = this.retaoHeading;
    let headingError = steerTarget - this.noseAngle;
    while (headingError > Math.PI) headingError -= Math.PI * 2;
    while (headingError < -Math.PI) headingError += Math.PI * 2;

    const targetAngularVelocity = THREE.MathUtils.clamp(
      headingError * (5.2 + spec.turnMult * 1.2),
      -4.6 * spec.turnMult,
      4.6 * spec.turnMult
    );
    const angularResponse = 1 - Math.exp(-stepDt * (13 + spec.turnMult * 3));
    this.angularVel += (targetAngularVelocity - this.angularVel) * angularResponse;

    // Untrimmed kites retain a little natural wobble, but it cannot overpower
    // the pilot's heading target.
    if (Math.abs(steer) < 0.02 && tailRatio < 0.45) {
      this.angularVel += (0.45 - tailRatio) * 0.42 * stepDt;
    }

    this.noseAngle += this.angularVel * stepDt;
    if (this.noseAngle > Math.PI) this.noseAngle -= Math.PI * 2;
    if (this.noseAngle < -Math.PI) this.noseAngle += Math.PI * 2;

    // 3. Aerodynamic forces from the air moving relative to this kite.
    // Each model has its own wing area, mass, lift, drag and passive stability.
    sampleWindAt(windVec, this.position, time, this.windPhase, this.localWind);
    this._computeTangentFrame(_rad, _tRight, _tUp);
    const cosA = Math.cos(this.noseAngle);
    const sinA = Math.sin(this.noseAngle);
    _noseDir.copy(_tUp).multiplyScalar(cosA).addScaledVector(_tRight, sinA).normalize();

    _airRelative.subVectors(this.localWind, this.velocity);
    const apparentSpeed = Math.max(0.001, _airRelative.length());
    const sideSlip = Math.abs(_airRelative.dot(_tRight)) / apparentSpeed;
    // Keep normal steering in the attached-flow range. Hard turns and
    // strong sideways airflow can still stall the kite, but ordinary pursuit
    // should not lose all lift just because the pilot is trying to climb.
    const maneuverLoad = Math.abs(steer) * 0.065 + Math.abs(this.angularVel) * 0.009;
    const targetAoA = THREE.MathUtils.clamp(
      0.22 + sideSlip * 0.25 + maneuverLoad + (1 - this.tension) * 0.025,
      0.09,
      0.60
    );
    this.angleOfAttack += (targetAoA - this.angleOfAttack) * Math.min(1, stepDt * 11.5);
    const bankLimit = tailRatio < 0.45 ? 0.48 : 0.72;
    const targetBank = THREE.MathUtils.clamp(
      steer * bankLimit + this.angularVel * 0.018
        + sideSlip * Math.sign(_airRelative.dot(_tRight)) * 0.035,
      -bankLimit,
      bankLimit
    );
    this.bankAngle += (targetBank - this.bankAngle) * Math.min(1, stepDt * 17);
    bankSpanForSteering(_tRight, _airRelative, this.bankAngle, _bankedSpan);

    const aero = calculateAerodynamicForces({
      airVelocity: _airRelative,
      spanDirection: _bankedSpan,
      forwardDirection: _noseDir,
      modelId: spec.id,
      tailRatio,
      angleOfAttack: this.angleOfAttack
    });
    this.aeroDynamicPressure = aero.dynamicPressure;
    this.stalled = aero.stalled;

    // Gravity is in game-scale units. Allow real aerodynamic lift to raise
    // the kite, but cap the net upward acceleration and damp existing climb
    // speed so steady wind cannot send it endlessly toward the sky.
    const gravity = 2.45;
    const maxVerticalLift = gravity + 1.0;
    const supportedVerticalAero = Math.min(aero.fy, maxVerticalLift);
    const upwardMotionDamping = Math.max(0, this.velocity.y) * 0.48;
    _DesiredVel.set(
      aero.fx,
      supportedVerticalAero - gravity - upwardMotionDamping,
      aero.fz
    );
    // Immediate pilot authority: steering adds a bounded lateral acceleration
    // while aerodynamic banking and nose rotation build underneath it.
    // Steering is applied as a closed-loop lateral velocity command after integration.

    // Hand inputs remain impulses layered on top of the aerodynamic flight.
    _DesiredVel.addScaledVector(_noseDir,
      this.socadaBoost * 8.0 + this.disbicarBoost * 4.0
      + this.retaoBoost * 11.0 + (controls.pull ? 0.3 : 0));
    if (this.disqueBoost > 0.01) {
      _DesiredVel.addScaledVector(_tRight, this.disqueDir * this.disqueBoost * 13.0 * spec.speedMult);
    }
    if (this.disbicarBoost > 0.01) {
      _DesiredVel.addScaledVector(_tRight, this.disbicarDir * this.disbicarBoost * 6.0 * spec.speedMult);
    }

    // Integrate acceleration. Aerodynamic drag naturally damps motion relative
    // to the changing air mass instead of steering toward an artificial velocity.
    this.velocity.addScaledVector(_DesiredVel, stepDt);
    this.velocity.multiplyScalar(Math.exp(-0.018 * stepDt));

    // Pilot flight authority: Phase 1 moved from a controlled velocity model
    // to pure aerodynamic acceleration. Keep the aerodynamic forces above, but
    // restore a responsive speed command along the kite's actual nose direction.
    // Because this runs in KiteEntity.update, every kite model and AI rival gets it.
    const steeringDemand = Math.abs(steer);
    const pullDemand = controls.pull ? 1 : 0;
    const selectedTurnDemand = this.isPlayer ? Math.abs(this.directionTarget) / 1.12 : steeringDemand;
    const maneuverDemand = Math.max(steeringDemand, pullDemand, selectedTurnDemand * 0.7, this.retaoBoost > 0.05 ? 1 : 0);
    if (maneuverDemand > 0.02) {
      const windFactor = THREE.MathUtils.clamp(this.localWind.length() / 9, 0.62, 1.42);
      const activeInput = pullDemand + steeringDemand * 0.65 + this.disbicarBoost * 0.35;
      const desiredForwardSpeed = THREE.MathUtils.clamp(
        (activeInput * 9.8 + selectedTurnDemand * 2.6 + this.socadaBoost * 5.0 + this.disbicarBoost * 4.0 + this.retaoBoost * 7.0)
          * spec.speedMult * windFactor,
        0,
        18
      );
      const currentForwardSpeed = this.velocity.dot(_noseDir);
      const driveResponse = 1 - Math.exp(-stepDt * (steeringDemand > 0.02 ? 10.5 : 8.0));
      this.velocity.addScaledVector(
        _noseDir,
        (desiredForwardSpeed - currentForwardSpeed) * driveResponse
      );
    }

    this.position.addScaledVector(this.velocity, stepDt);

    // A real kite flies in a forward window, not directly over the flyer.
    // Limit the line's elevation angle to 56 degrees above the horizon. This
    // is a shared constraint for the player and every AI kite, so rivals stay
    // in the same reachable airspace and can still be challenged from below.
    const horizontalX = this.position.x - this.anchorPos.x;
    const horizontalZ = this.position.z - this.anchorPos.z;
    const horizontalDistance = Math.hypot(horizontalX, horizontalZ);
    const verticalDistance = this.position.y - this.anchorPos.y;
    const maxVerticalDistance = horizontalDistance * MAX_FLIGHT_ELEVATION_TAN;
    if (verticalDistance > maxVerticalDistance) {
      this.position.y = this.anchorPos.y + maxVerticalDistance;
      _flightConeNormal.set(
        -MAX_FLIGHT_ELEVATION_TAN * horizontalX / Math.max(0.001, horizontalDistance),
        1,
        -MAX_FLIGHT_ELEVATION_TAN * horizontalZ / Math.max(0.001, horizontalDistance)
      ).normalize();

      // Remove only velocity that would push the kite farther outside the
      // flight window; tangential movement along the window remains free.
      const outwardClimb = this.velocity.dot(_flightConeNormal);
      if (outwardClimb > 0) {
        this.velocity.addScaledVector(_flightConeNormal, -outwardClimb);
      }
    }

    // 4. Keep kite in forward sky arena & enforce spherical tether constraint
    // Prevent flying behind the player's back (+Z)
    const maxZ = this.anchorPos.z - 8.5;
    if (this.position.z > maxZ) {
      this.position.z = maxZ;
      if (this.velocity.z > 0) this.velocity.z *= -0.25;
    }

    // Unilateral tether: it only pulls, never pushes. A winch shortens the
    // permitted radius and progressively removes outward radial velocity.
    _rad.subVectors(this.position, this.anchorPos);
    let currDist = _rad.length() || 1;
    let cableTensionTarget = this.reelSpeed < -0.1 ? 0.58 : 0.18;
    const extension = Math.max(0, currDist - this.lineLength);
    const nearTaut = currDist >= this.lineLength - (this.reelSpeed < -0.1 ? 0.8 : 0.18);

    if (extension > 0.001 || (this.reelSpeed < -0.1 && nearTaut)) {
      _rad.divideScalar(currDist);
      const radialVelocity = this.velocity.dot(_rad);
      const cable = calculateCableResponse(extension, Math.max(0, radialVelocity), this.lineType);
      cableTensionTarget = Math.max(cableTensionTarget, cable.tension);

      // Correct the geometric over-extension completely, so the line never
      // jitters outside its deployed length from a partially corrected spring.
      if (extension > 0.001) {
        this.position.addScaledVector(_rad, -extension);
        currDist = this.lineLength;
      }

      // While pulling, the reel physically hauls the kite inward. The response
      // is damped over several frames instead of teleporting its velocity.
      const winch = calculateWinchResponse(radialVelocity, this.reelSpeed, stepDt, this.lineType);
      if (winch.velocityChange < 0) {
        this.velocity.addScaledVector(_rad, winch.velocityChange);
      } else if (radialVelocity > Math.max(0, this.reelSpeed)) {
        this.velocity.addScaledVector(_rad, -Math.min(radialVelocity - Math.max(0, this.reelSpeed), cable.radialImpulse));
      }
    }

    this.cableTension += (cableTensionTarget - this.cableTension) * Math.min(1, stepDt * 7);
    const physicalTension = Math.max(targetTension, this.cableTension);
    this.tension += (physicalTension - this.tension) * Math.min(1, stepDt * 7);

    // Rooftop / Ground floor safety check
    if (this.position.y < minGroundY) {
      this.position.y = minGroundY;
      if (this.velocity.y < 0) this.velocity.y = Math.abs(this.velocity.y) * 0.35 + 2.5;
      // Gently nudge nose upward so kite climbs away from street/roof
      this.noseAngle *= 0.82;
    }

    // 5. Update 3D Kite Visual, Rabiola & Catenary String
    this._updateOrientation(this.localWind);
    const aeroLoad = Math.min(1.2, 0.16 + Math.min(0.68, this.aeroDynamicPressure * 0.007) + this.tension * 0.28 + this.socadaBoost * 0.4 - (this.stalled ? 0.10 : 0));
    const structural = calculateStructuralResponse(this.aeroDynamicPressure, spec.id, this.condition ?? 100);

    this.visual.update({
      position: this.position,
      quaternion: this.quaternion,
      aeroLoad,
      windVec: this.localWind,
      sunDir,
      cameraPos,
      structuralLoad: structural.strain,
      angleOfAttack: this.angleOfAttack,
      stalled: this.stalled,
      dt: stepDt
    });

    this._updateStringCurve(this.localWind, reloHighlightU, reloHighlightStrength, stepDt);
  }

  dispose() {
    this.visual.dispose();
    this.scene.remove(this.lineMesh);
    this.lineGeo.dispose();
    this.lineMat.dispose();
  }
}

// Unattached kite ("Pipa Avoada / Mandada") drifting on the wind with trailing severed string!
export class DriftingKite {
  constructor(scene, {
    modelId,
    patternId,
    startPos,
    startQuat,
    cutPoint
  }) {
    this.scene = scene;
    this.modelId = modelId;
    this.patternId = patternId;
    this.visual = new KiteVisual(scene, { modelId, patternId });
    this.visual.resetTailAt(startPos);

    this.position = startPos.clone();
    this.quaternion = startQuat.clone();
    this.velocity = new THREE.Vector3(0, 1.2, -5);
    this.tumblePhase = Math.random() * Math.PI * 2;
    this.age = 0;
    this.maxAge = 24;
    this.alive = true;
    this.snagged = false;
    this.recovering = false;
    this.recoveryPulling = false;
    this.recoveryProgress = 0;
    this.recoveryTarget = new THREE.Vector3();

    // Trailing severed string (~14m hanging from bridle so players can "aparar/laçar" it!)
    this.trailCount = 10;
    this.trailNodes = [];
    const bridle = this.position.clone();
    const dir = cutPoint ? _tmpSub.subVectors(cutPoint, bridle).normalize() : new THREE.Vector3(0, -0.7, 0.7);
    for (let i = 0; i < this.trailCount; i++) {
      this.trailNodes.push(bridle.clone().addScaledVector(dir, i * 1.45));
    }

    this.trailFlat = new Float32Array(this.trailCount * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.trailFlat, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.85
    });
    this.trailLine = new THREE.Line(geo, mat);
    this.trailLine.frustumCulled = false;
    this.scene.add(this.trailLine);
  }

  update(windVec, sunDir, cameraPos, dt) {
    if (!this.alive) return;
    this.age += dt;
    if (!this.snagged && !this.recovering && (this.age > this.maxAge || this.position.y < 1.5)) {
      this.alive = false;
      return;
    }

    // A caught rabiola holds the loose kite in place while the pipeiro works
    // the knot. It is not awarded or attached to the player's line here.
    if (this.snagged) return;

    this.tumblePhase += dt * (this.recovering ? 1.45 : 3.1);
    if (this.recovering && this.recoveryPulling) {
      // The kite is hauled down only while the player actively holds the reel control.
      _tmpSub.subVectors(this.recoveryTarget, this.position);
      this.velocity.copy(_tmpSub).multiplyScalar(1.7);
      this.position.addScaledVector(this.velocity, dt);
    } else if (this.recovering) {
      this.velocity.multiplyScalar(Math.max(0, 1 - dt * 4));
    } else {
      // Unattached kite floats downwind, bobbing & gliding laterally ("boiando no vento")
      this.velocity.x = windVec.x * 0.88 + Math.sin(this.tumblePhase) * 3.6;
      this.velocity.y = -1.65 + Math.cos(this.tumblePhase * 1.7) * 1.15;
      this.velocity.z = windVec.z * 0.88;
      this.position.addScaledVector(this.velocity, dt);
    }

    // Gentle fluttering pitch/bank as it floats away or is being recovered
    _euler.set(
      (this.recovering ? 0.42 : 0.85) + Math.sin(this.tumblePhase * 1.3) * (this.recovering ? 0.12 : 0.35),
      Math.sin(this.tumblePhase * 0.6) * (this.recovering ? 0.22 : 0.6),
      this.tumblePhase * (this.recovering ? 0.35 : 0.9)
    );
    this.quaternion.setFromEuler(_euler);

    this.visual.update({
      position: this.position,
      quaternion: this.quaternion,
      aeroLoad: this.recovering ? 0.28 : 0.15,
      windVec,
      sunDir,
      cameraPos,
      dt
    });

    // Update trailing severed string
    const bridle = this.visual.getBridleWorldPosition(_bridleWorld);
    this.trailNodes[0].copy(bridle);
    for (let i = 1; i < this.trailCount; i++) {
      const prev = this.trailNodes[i - 1];
      const curr = this.trailNodes[i];
      curr.x += windVec.x * 0.55 * dt;
      curr.y -= 2.8 * dt;
      curr.z += windVec.z * 0.55 * dt;
      _tmpSub.subVectors(curr, prev);
      const d = _tmpSub.length() || 0.01;
      if (d > 1.45) {
        curr.copy(prev).addScaledVector(_tmpSub, 1.45 / d);
      }
    }

    for (let i = 0; i < this.trailCount; i++) {
      this.trailFlat[i * 3] = this.trailNodes[i].x;
      this.trailFlat[i * 3 + 1] = this.trailNodes[i].y;
      this.trailFlat[i * 3 + 2] = this.trailNodes[i].z;
    }
    this.trailLine.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.visual.dispose();
    this.scene.remove(this.trailLine);
    this.trailLine.geometry.dispose();
    this.trailLine.material.dispose();
  }
}

// Spark & Cerol Dust Particle System + Severed Falling Rabiolas
export class SkyEffectsManager {
  constructor(scene) {
    this.scene = scene;
    this.maxParticles = 140;
    this.particles = [];

    const positions = new Float32Array(this.maxParticles * 3);
    const colors = new Float32Array(this.maxParticles * 3);
    this.partGeo = new THREE.BufferGeometry();
    this.partGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.partGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.partMat = new THREE.PointsMaterial({
      size: 0.65,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.pointsMesh = new THREE.Points(this.partGeo, this.partMat);
    this.pointsMesh.frustumCulled = false;
    this.scene.add(this.pointsMesh);

    this.fallingTails = [];
    this.caughtRabiolas = [];

    // 3D Proximity / Relo Depth Indicator Ring
    const ringGeo = new THREE.RingGeometry(0.45, 0.62, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthTest: false
    });
    this.proximityRing = new THREE.Mesh(ringGeo, ringMat);
    this.proximityRing.visible = false;
    this.scene.add(this.proximityRing);
  }

  emitSparks(worldPos, count = 8, isCutBurst = false) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) this.particles.shift();
      const speed = isCutBurst ? (4 + Math.random() * 11) : (1.5 + Math.random() * 5.5);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      this.particles.push({
        pos: worldPos.clone(),
        vel: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.cos(phi) * speed + 1.2,
          Math.sin(phi) * Math.sin(theta) * speed
        ),
        life: 0,
        maxLife: isCutBurst ? (0.45 + Math.random() * 0.35) : (0.18 + Math.random() * 0.18),
        color: isCutBurst
          ? (i % 2 === 0 ? new THREE.Color(0xfef08a) : new THREE.Color(0xf43f5e))
          : (i % 2 === 0 ? new THREE.Color(0xffffff) : new THREE.Color(0x38bdf8))
      });
    }
  }

  spawnSeveredTail(nodes) {
    if (!nodes || nodes.length < 2) return;
    const flat = new Float32Array(nodes.length * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(flat, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    this.scene.add(line);
    this.fallingTails.push({ nodes, flat, line, age: 0 });
  }

  spawnCaughtRabiola({
    ownerId,
    lineU,
    sourceNodes,
    capturePoint,
    primaryColor = 0xfacc15,
    accentColor = 0x38bdf8,
    scale = 1
  }) {
    if (!Array.isArray(sourceNodes) || sourceNodes.length < 5 || !capturePoint) return null;

    // Preserve the captured tail's actual shape, moving its root to the exact
    // point where the player's flying line touched it.
    while (this.caughtRabiolas.length >= 12) {
      this._disposeCaughtRabiola(this.caughtRabiolas.shift());
    }

    const origin = sourceNodes[0];
    const offset = new THREE.Vector3().subVectors(capturePoint, origin);
    const nodes = sourceNodes.map((node) => node.clone().add(offset));
    const previous = nodes.map((node) => node.clone());
    const segmentLengths = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      segmentLengths.push(Math.max(0.08, nodes[i].distanceTo(nodes[i + 1])));
    }

    const flat = new Float32Array(nodes.length * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(flat, 3));
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.92
    });
    const line = new THREE.Line(geometry, lineMaterial);
    line.frustumCulled = false;
    this.scene.add(line);

    const ribbonScale = THREE.MathUtils.clamp(scale, 0.65, 1.8);
    const ribbonGeometry = new THREE.PlaneGeometry(0.34 * ribbonScale, 0.09 * ribbonScale);
    const ribbonMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.58,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.96,
      depthWrite: false
    });
    const ribbons = new THREE.InstancedMesh(ribbonGeometry, ribbonMaterial, nodes.length);
    ribbons.frustumCulled = false;
    const mainColor = new THREE.Color(primaryColor);
    const detailColor = new THREE.Color(accentColor);
    for (let i = 0; i < nodes.length - 1; i++) {
      ribbons.setColorAt(i, i % 4 === 0 ? detailColor : mainColor);
    }
    if (ribbons.instanceColor) ribbons.instanceColor.needsUpdate = true;
    this.scene.add(ribbons);

    const captured = {
      ownerId,
      lineU: THREE.MathUtils.clamp(lineU, 0, 1),
      nodes,
      previous,
      segmentLengths,
      flat,
      line,
      ribbons,
      ribbonScale,
      phase: Math.random() * Math.PI * 2,
      detached: false,
      detachedAge: 0
    };
    this.caughtRabiolas.push(captured);
    return captured;
  }

  _disposeCaughtRabiola(captured) {
    if (!captured) return;
    this.scene.remove(captured.line);
    this.scene.remove(captured.ribbons);
    captured.line.geometry.dispose();
    captured.line.material.dispose();
    captured.ribbons.geometry.dispose();
    captured.ribbons.material.dispose();
  }

  updateProximityCue(cue, camera) {
    if (!cue || !cue.active) {
      this.proximityRing.visible = false;
      return;
    }
    this.proximityRing.visible = true;
    this.proximityRing.position.copy(cue.point);
    this.proximityRing.quaternion.copy(camera.quaternion);

    const s = 0.85 + Math.sin(performance.now() * 0.018) * 0.15;
    const distScale = Math.max(1.0, cue.point.distanceTo(camera.position) * 0.025);
    this.proximityRing.scale.setScalar(s * distScale);

    if (cue.inRelo) {
      this.proximityRing.material.color.setHex(0xf43f5e);
      this.proximityRing.material.opacity = 0.95;
    } else {
      this.proximityRing.material.color.setHex(cue.playerInFront ? 0x38bdf8 : 0xfacc15);
      this.proximityRing.material.opacity = THREE.MathUtils.clamp(1.0 - cue.distance / 9.0, 0.2, 0.85);
    }
  }

  update(windVec, dt, lineOwners = []) {
    const ownerById = new Map(lineOwners.map((owner) => [owner.id, owner]));

    // Update particles
    const posArr = this.partGeo.attributes.position.array;
    const colArr = this.partGeo.attributes.color.array;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 9.8 * dt;
      p.pos.addScaledVector(p.vel, dt);
    }

    for (let i = 0; i < this.maxParticles; i++) {
      if (i < this.particles.length) {
        const p = this.particles[i];
        const fade = 1 - p.life / p.maxLife;
        posArr[i * 3] = p.pos.x;
        posArr[i * 3 + 1] = p.pos.y;
        posArr[i * 3 + 2] = p.pos.z;
        colArr[i * 3] = p.color.r * fade;
        colArr[i * 3 + 1] = p.color.g * fade;
        colArr[i * 3 + 2] = p.color.b * fade;
      } else {
        posArr[i * 3] = 0;
        posArr[i * 3 + 1] = -999;
        posArr[i * 3 + 2] = 0;
      }
    }
    this.partGeo.attributes.position.needsUpdate = true;
    this.partGeo.attributes.color.needsUpdate = true;
    this.partGeo.setDrawRange(0, this.particles.length);

    // Update falling severed rabiola pieces
    for (let i = this.fallingTails.length - 1; i >= 0; i--) {
      const ft = this.fallingTails[i];
      ft.age += dt;
      if (ft.age > 8.0) {
        this.scene.remove(ft.line);
        ft.line.geometry.dispose();
        ft.line.material.dispose();
        this.fallingTails.splice(i, 1);
        continue;
      }
      for (let k = 0; k < ft.nodes.length; k++) {
        ft.nodes[k].x += (windVec.x * 0.65 + Math.sin(ft.age * 7 + k) * 1.4) * dt;
        ft.nodes[k].y -= 3.8 * dt;
        ft.nodes[k].z += windVec.z * 0.65 * dt;
        ft.flat[k * 3] = ft.nodes[k].x;
        ft.flat[k * 3 + 1] = ft.nodes[k].y;
        ft.flat[k * 3 + 2] = ft.nodes[k].z;
      }
      ft.line.geometry.attributes.position.needsUpdate = true;
      ft.line.material.opacity = Math.max(0, 0.85 * (1 - ft.age / 8.0));
    }

    // Captured rabiolas stay tied to the exact point of contact on their
    // owner's flying line, then detach and fall naturally if that kite is cut.
    for (let i = this.caughtRabiolas.length - 1; i >= 0; i--) {
      const captured = this.caughtRabiolas[i];
      const owner = ownerById.get(captured.ownerId);
      const attached = !captured.detached && owner?.active && owner.stringNodes?.length >= 2;
      if (attached) {
        const lineAt = captured.lineU * (owner.stringNodes.length - 1);
        const lineIndex = Math.min(owner.stringNodes.length - 2, Math.floor(lineAt));
        const localU = lineAt - lineIndex;
        _caughtAttach.lerpVectors(owner.stringNodes[lineIndex], owner.stringNodes[lineIndex + 1], localU);
        captured.nodes[0].copy(_caughtAttach);
        captured.previous[0].copy(_caughtAttach);
      } else {
        captured.detached = true;
        captured.detachedAge += dt;
        if (captured.detachedAge > 8) {
          this._disposeCaughtRabiola(captured);
          this.caughtRabiolas.splice(i, 1);
          continue;
        }
        const root = captured.nodes[0];
        const rootPrev = captured.previous[0];
        const rootVx = (root.x - rootPrev.x) * 0.94;
        const rootVy = (root.y - rootPrev.y) * 0.94;
        const rootVz = (root.z - rootPrev.z) * 0.94;
        rootPrev.copy(root);
        root.x += rootVx + windVec.x * 0.22 * dt;
        root.y += rootVy + (-3.8 + windVec.y * 0.15) * dt;
        root.z += rootVz + windVec.z * 0.22 * dt;
      }

      captured.phase += dt * (8.5 + windVec.length() * 0.18);
      const count = captured.nodes.length;
      for (let n = 1; n < count; n++) {
        const curr = captured.nodes[n];
        const prev = captured.previous[n];
        const vx = (curr.x - prev.x) * 0.925;
        const vy = (curr.y - prev.y) * 0.925;
        const vz = (curr.z - prev.z) * 0.925;
        prev.copy(curr);
        const flutter = Math.sin(captured.phase - n * 0.62) * 0.075;
        curr.x += vx + windVec.x * 0.20 * dt + flutter * dt;
        curr.y += vy + (-1.25 + windVec.y * 0.18) * dt;
        curr.z += vz + windVec.z * 0.20 * dt + Math.cos(captured.phase * 0.72 + n) * 0.035 * dt;
      }

      // Four constraint passes keep the captured thread continuous while
      // each little paper ribbon can still flutter independently.
      for (let pass = 0; pass < 4; pass++) {
        if (attached) {
          const lineAt = captured.lineU * (owner.stringNodes.length - 1);
          const lineIndex = Math.min(owner.stringNodes.length - 2, Math.floor(lineAt));
          _caughtAttach.lerpVectors(
            owner.stringNodes[lineIndex],
            owner.stringNodes[lineIndex + 1],
            lineAt - lineIndex
          );
          captured.nodes[0].copy(_caughtAttach);
        }
        for (let n = 0; n < count - 1; n++) {
          const a = captured.nodes[n];
          const b = captured.nodes[n + 1];
          _caughtDiff.subVectors(b, a);
          const distance = _caughtDiff.length() || 0.0001;
          const correction = (distance - captured.segmentLengths[n]) / distance;
          if (attached && n === 0) {
            b.addScaledVector(_caughtDiff, -correction);
          } else {
            a.addScaledVector(_caughtDiff, correction * 0.5);
            b.addScaledVector(_caughtDiff, -correction * 0.5);
          }
        }
      }

      for (let n = 0; n < count; n++) {
        const point = captured.nodes[n];
        captured.flat[n * 3] = point.x;
        captured.flat[n * 3 + 1] = point.y;
        captured.flat[n * 3 + 2] = point.z;
        if (n === 0) {
          _caughtMatrix.makeScale(0, 0, 0);
        } else {
          _caughtTangent.subVectors(captured.nodes[n - 1], point).normalize();
          _caughtQuat.setFromUnitVectors(_caughtUp, _caughtTangent);
          _caughtTwist.setFromAxisAngle(
            _caughtUp,
            n * 1.1 + Math.sin(captured.phase * 0.7 + n * 0.8) * 0.85
          );
          _caughtQuat.multiply(_caughtTwist);
          _caughtScale.setScalar(captured.ribbonScale);
          _caughtMatrix.compose(point, _caughtQuat, _caughtScale);
        }
        captured.ribbons.setMatrixAt(n, _caughtMatrix);
      }
      captured.line.geometry.attributes.position.needsUpdate = true;
      captured.line.geometry.setDrawRange(0, count);
      captured.ribbons.instanceMatrix.needsUpdate = true;
      if (captured.detached) {
        const fade = Math.max(0, 1 - captured.detachedAge / 8);
        captured.line.material.opacity = 0.92 * fade;
        captured.ribbons.material.opacity = 0.96 * fade;
      }
    }
  }
}

const _caughtUp = new THREE.Vector3(0, 1, 0);
const _caughtAttach = new THREE.Vector3();
const _caughtDiff = new THREE.Vector3();
const _caughtTangent = new THREE.Vector3();
const _caughtQuat = new THREE.Quaternion();
const _caughtTwist = new THREE.Quaternion();
const _caughtScale = new THREE.Vector3(1, 1, 1);
const _caughtMatrix = new THREE.Matrix4();

const _worldUp = new THREE.Vector3(0, 1, 0);
const _flightConeNormal = new THREE.Vector3();
const _rad = new THREE.Vector3();
const _tRight = new THREE.Vector3();
const _tUp = new THREE.Vector3();
const _noseDir = new THREE.Vector3();
const _kiteX = new THREE.Vector3();
const _kiteY = new THREE.Vector3();
const _kiteZ = new THREE.Vector3();
const _rotMat = new THREE.Matrix4();
const _bankQuat = new THREE.Quaternion();
const _bridleWorld = new THREE.Vector3();
const _windNorm = new THREE.Vector3();
const _baseCol = new THREE.Color();
const _hotCol = new THREE.Color();
const _vertCol = new THREE.Color();
const _DesiredVel = new THREE.Vector3();
const _airRelative = new THREE.Vector3();
const _bankedSpan = new THREE.Vector3();
const _ropeVelocity = new THREE.Vector3();
const _ropeDelta = new THREE.Vector3();
const _ropeSide = new THREE.Vector3();
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _r = new THREE.Vector3();
const _tmpSub = new THREE.Vector3();
const _euler = new THREE.Euler();
