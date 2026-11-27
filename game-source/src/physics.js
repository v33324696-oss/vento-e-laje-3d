import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { KiteVisual } from './kiteMesh.js';
import { LINE_TYPES } from './carretilha.js';
import { evaluateReloScore } from './relo.js';
import { getKiteAeroProfile, getWindPhase, sampleWindAt } from './kiteAerodynamics.js';
import { getKiteMaterialProfile } from './kiteMaterials.js';

export const STRING_SEGMENTS = 28;

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
    this.windPhase = getWindPhase(id || name);
    this.localWind = new THREE.Vector3();

    this.anchorPos = anchorPos.clone();
    this.lineType = LINE_TYPES[lineTypeId] || LINE_TYPES.rosa_chilena;
    this.materialProfile = getKiteMaterialProfile();

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
    this.localWind = new THREE.Vector3();
    this.aeroDynamicPressure = 0;
    this.stalled = false;

    this.tension = 0.5;
    this.reelSpeed = 0; // + paying out, - reeling in
    this.socadaBoost = 0;
    this.disqueBoost = 0;
    this.disqueDir = 0;
    this.disqueCooldown = 0;
    this.disbicarBoost = 0;
    this.disbicarDir = 1;
    this.disbicarCooldown = 0;
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

  setMaterialSetup(setup = {}) {
    this.materialProfile = getKiteMaterialProfile(setup);
    return this.materialProfile;
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
    this.tension = 0.5;
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
    this.lineLength = Math.max(this.minLine, this.lineLength - 0.38 * strength);
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

  triggerDisbicar(dir = 1) {
    if (!this.active || this.disbicarCooldown > 0) return false;
    this.disbicarDir = Math.sign(dir) || 1;
    this.disbicarBoost = 1.0;
    this.disbicarCooldown = 0.48;
    this.tension = Math.min(1, this.tension + 0.38);
    this.lineLength = Math.max(this.minLine, this.lineLength - 0.85);
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
    const aoa = 0.36 - this.tension * 0.14 - this.socadaBoost * 0.08;
    _kiteZ.copy(_rad).negate().addScaledVector(_noseDir, -aoa).normalize();
    _kiteX.crossVectors(_noseDir, _kiteZ).normalize();
    _kiteY.crossVectors(_kiteZ, _kiteX).normalize();

    _rotMat.makeBasis(_kiteX, _kiteY, _kiteZ);
    this.quaternion.setFromRotationMatrix(_rotMat);
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
    dt = 0.016
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
    if (this.largadaCooldown > 0) this.largadaCooldown = Math.max(0, this.largadaCooldown - stepDt);
    if (this.largadaBoost > 0) this.largadaBoost = Math.max(0, this.largadaBoost - stepDt);
    if (this.largadaTagTimer > 0) this.largadaTagTimer = Math.max(0, this.largadaTagTimer - stepDt);
    if (this.tailCutCooldown > 0) this.tailCutCooldown = Math.max(0, this.tailCutCooldown - stepDt);

    // 1. Original winch, tension and kite response.
    let targetTension = 0.44;
    this.reelSpeed = 0;

    if (controls.pull) {
      this.reelSpeed = -15.5 * spec.speedMult;
      this.lineLength = Math.max(this.minLine, this.lineLength + this.reelSpeed * stepDt);
      targetTension = 0.90;
    } else if (controls.quickRelease) {
      this.reelSpeed = 29.0;
      this.lineLength = Math.min(this.maxLine, this.lineLength + this.reelSpeed * stepDt);
      targetTension = 0.055;
    } else if (controls.release) {
      this.reelSpeed = 8.2;
      this.lineLength = Math.min(this.maxLine, this.lineLength + this.reelSpeed * stepDt);
      targetTension = 0.24;
    }

    targetTension = Math.min(1.0,
      targetTension + this.socadaBoost * 0.55
        + this.disqueBoost * 0.55
        + this.disbicarBoost * 0.32
    );
    this.tension += (targetTension - this.tension) * Math.min(1, stepDt * 10);

    // 2. Classic nose rotation: direct steering with natural rabiola recovery.
    const steer = THREE.MathUtils.clamp(controls.steer || 0, -1, 1);
    const material = this.materialProfile || getKiteMaterialProfile();
    const rabicoWildness = (1.0 + (1.0 - tailRatio) * 1.15)
      * (1.04 - aeroProfile.stability * 0.04)
      * (1.15 - material.stabilityMultiplier * 0.15);

    if (Math.abs(steer) > 0.04) {
      const turnRate = 3.65 * spec.turnMult * material.steeringMultiplier * rabicoWildness;
      this.angularVel += (steer * turnRate - this.angularVel) * Math.min(1, stepDt * 14);
    } else if ((controls.release || controls.quickRelease) && this.socadaBoost < 0.15) {
      const spinTarget = spec.spinRate * material.steeringMultiplier * rabicoWildness * (controls.quickRelease ? 1.42 : 0.82);
      this.angularVel += (spinTarget - this.angularVel)
        * Math.min(1, stepDt * (controls.quickRelease ? 10 : 7));
    } else {
      const pendulumRestore = -Math.sin(this.noseAngle) * 2.15 * tailRatio;
      const rabicoSpin = tailRatio < 0.45 ? (0.45 - tailRatio) * 3.8 : 0;
      this.angularVel += (pendulumRestore + rabicoSpin - this.angularVel) * Math.min(1, stepDt * 6);
    }

    this.noseAngle += this.angularVel * stepDt;
    if (this.noseAngle > Math.PI) this.noseAngle -= Math.PI * 2;
    if (this.noseAngle < -Math.PI) this.noseAngle += Math.PI * 2;

    // 3. Original target-velocity flight model.
    sampleWindAt(windVec, this.position, time, this.windPhase, this.localWind);
    const flightWind = this.localWind;
    const windSpeed = flightWind.length();
    this.aeroDynamicPressure = 0.5 * windSpeed * windSpeed;
    this.stalled = false;

    this._computeTangentFrame(_rad, _tRight, _tUp);
    const cosA = Math.cos(this.noseAngle);
    const sinA = Math.sin(this.noseAngle);
    _noseDir.copy(_tUp).multiplyScalar(cosA).addScaledVector(_tRight, sinA).normalize();

    const activeInput = (controls.pull ? 1.0 : 0.0)
      + Math.abs(steer) * 0.65
      + this.disbicarBoost * 0.75;
    const forwardDrive =
      (1.35 + activeInput * 9.8 + this.socadaBoost * 25.5 + this.disbicarBoost * 8.5)
      * spec.speedMult
      * material.speedMultiplier
      * (windSpeed / 9.0);

    _DesiredVel.copy(_noseDir).multiplyScalar(forwardDrive);

    if (this.disqueBoost > 0.05) {
      _DesiredVel.addScaledVector(_tRight, this.disqueDir * this.disqueBoost * 25.0 * spec.speedMult);
    }
    if (this.disbicarBoost > 0.05) {
      _DesiredVel.addScaledVector(_tRight, this.disbicarDir * this.disbicarBoost * 13.5 * spec.speedMult);
      _DesiredVel.addScaledVector(_noseDir, this.disbicarBoost * 7.0 * spec.speedMult);
    }

    const slack = 1.0 - this.tension;
    _DesiredVel.addScaledVector(flightWind, 0.36 + slack * 0.68);
    const highAngleDrag = Math.max(0, _rad.y - (0.43 + aeroProfile.stallAngle * 0.06))
      * 9.5 * material.dragMultiplier;
    const modelLift = THREE.MathUtils.clamp(
      (1 + (aeroProfile.lift / aeroProfile.mass - 1) * 0.16) * material.liftMultiplier,
      0.90,
      1.12
    );
    const netVertical =
      (windSpeed * 0.30 * (0.48 + this.tension * 0.52) * modelLift)
      - (2.45 + slack * 2.6 + highAngleDrag);
    _DesiredVel.y += netVertical;

    // Match the original kite's smooth, readable acceleration response.
    this.velocity.lerp(_DesiredVel, Math.min(1, stepDt * 7.5));
    this.position.addScaledVector(this.velocity, stepDt);

    // 4. Original forward-airspace and soft tether constraint.
    const maxZ = this.anchorPos.z - 8.5;
    if (this.position.z > maxZ) {
      this.position.z = maxZ;
      if (this.velocity.z > 0) this.velocity.z *= -0.25;
    }

    _rad.subVectors(this.position, this.anchorPos);
    const currDist = _rad.length() || 1;
    if (currDist > this.lineLength || this.tension > 0.35) {
      const targetR = THREE.MathUtils.lerp(
        currDist,
        this.lineLength,
        this.tension > 0.5 ? 0.85 : 0.45
      );
      _rad.multiplyScalar(targetR / currDist);
      this.position.copy(this.anchorPos).add(_rad);

      _rad.normalize();
      const radialVelocity = this.velocity.dot(_rad);
      if (radialVelocity > Math.max(0, this.reelSpeed)) {
        this.velocity.addScaledVector(
          _rad,
          -(radialVelocity - Math.max(0, this.reelSpeed))
        );
      }
    }

    // 5. Keep the old ground recovery without adding a new flight ceiling.
    if (this.position.y < minGroundY) {
      this.position.y = minGroundY;
      if (this.velocity.y < 0) this.velocity.y = Math.abs(this.velocity.y) * 0.35 + 2.5;
      this.noseAngle *= 0.82;
    }

    // Preserve condition wear, RELO highlighting and the current physical string.
    const aeroLoad = Math.min(1.2, 0.22 + this.tension * 0.38 + this.socadaBoost * 0.65);
    this._updateOrientation(flightWind);

    this.visual.update({
      position: this.position,
      quaternion: this.quaternion,
      aeroLoad,
      windVec: flightWind,
      sunDir,
      cameraPos,
      dt: stepDt
    });

    this._updateStringCurve(flightWind, reloHighlightU, reloHighlightStrength, stepDt);
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
