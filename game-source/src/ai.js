import * as THREE from 'three';

export class RivalAIController {
  constructor(kiteEntity, personality = 'balanced') {
    this.kite = kiteEntity;
    this.personality = personality; // 'hunter' | 'slasher' | 'trickster' | 'balanced'
    this.targetPoint = new THREE.Vector3(
      (Math.random() - 0.5) * 44,
      32 + Math.random() * 24,
      -34 - Math.random() * 28
    );
    this.retargetTimer = 1.5 + Math.random() * 2.5;
    this.socadaTimer = 0.4 + Math.random() * 0.9;
    this.disbicarTimer = 0.8 + Math.random() * 1.2;
    this.disqueTimer = 1.2 + Math.random() * 1.4;
    this.respawnTimer = 0;
  }

  update({
    playerKite,
    allRivals,
    driftingKites,
    gameMode = 'festival',
    difficulty = 1.0,
    dt = 0.016
  }) {
    const skill = THREE.MathUtils.clamp((difficulty - 0.68) / 1.47, 0, 1);
    if (!this.kite.active) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.kite.spawnInSky(true);
      return { pull: false, release: false, quickRelease: false, steer: 0 };
    }

    this.retargetTimer -= dt;
    this.socadaTimer -= dt;
    this.disbicarTimer -= dt;
    this.disqueTimer -= dt;

    // Skilled rivals make decisions faster and waste less time cruising.
    if (this.retargetTimer <= 0) {
      this.retargetTimer = (1.45 + Math.random() * 2.1) / Math.sqrt(Math.max(0.68, difficulty));

      if (gameMode === 'zen') {
        this.targetPoint.set(
          this.kite.anchorPos.x * 0.55 + (Math.random() - 0.5) * 34,
          30 + Math.random() * 28,
          -32 - Math.random() * 34
        );
      } else {
        let chasedDrift = null;
        for (const dk of driftingKites) {
          if (dk.alive && dk.position.y > 16 && dk.position.distanceTo(this.kite.position) < 28) {
            chasedDrift = dk;
            break;
          }
        }

        if (chasedDrift) {
          this.targetPoint.copy(chasedDrift.position);
        } else {
          const playerActive = playerKite && playerKite.active;
          const engagePlayerChance = Math.min(
            0.98,
            (this.personality === 'hunter' ? 0.64 : 0.46) * difficulty
          );

          if (playerActive && Math.random() < engagePlayerChance) {
            const idx = Math.floor(playerKite.stringNodes.length * (0.68 + Math.random() * 0.25));
            const stringPt = playerKite.stringNodes[idx] || playerKite.position;
            const leadTime = 0.18 + skill * 0.42;
            const spread = Math.max(1.8, 10 / (0.85 + difficulty * 0.72));
            this.targetPoint.copy(playerKite.position)
              .addScaledVector(playerKite.velocity, leadTime)
              .lerp(stringPt, 0.62)
              .add(_offset.set(
                (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * spread * 0.72,
                (Math.random() - 0.5) * spread * 0.68
              ));
          } else if (allRivals.length > 1 && Math.random() < 0.38) {
            const others = allRivals.filter((r) => r.kite !== this.kite && r.kite.active);
            if (others.length > 0) {
              const pick = others[Math.floor(Math.random() * others.length)].kite;
              this.targetPoint.copy(pick.position).add(
                _offset.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8)
              );
            }
          } else {
            this.targetPoint.set(
              (Math.random() - 0.5) * 52,
              28 + Math.random() * 30,
              -28 - Math.random() * 38
            );
          }
        }
      }

      this.targetPoint.y = THREE.MathUtils.clamp(this.targetPoint.y, 19, 46);
      this.targetPoint.z = THREE.MathUtils.clamp(this.targetPoint.z, -76, -22);
    }

    if (this.kite.position.y < 16) {
      this.targetPoint.set(this.kite.position.x * 0.8, 32, Math.min(-28, this.kite.position.z - 8));
    }

    _rad.subVectors(this.kite.position, this.kite.anchorPos).normalize();
    if (Math.abs(_rad.y) > 0.97) _right.set(1, 0, 0);
    else _right.crossVectors(_rad, _up).normalize();
    _tUp.crossVectors(_right, _rad).normalize();

    _toTarget.subVectors(this.targetPoint, this.kite.position);
    const upComp = _toTarget.dot(_tUp);
    const rightComp = _toTarget.dot(_right);
    const desiredAngle = Math.atan2(rightComp, upComp);

    let angleDiff = desiredAngle - this.kite.noseAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Hard rivals correct their nose more precisely and more quickly.
    const steerGain = 1.65 + skill * 0.92;
    const steer = THREE.MathUtils.clamp(angleDiff * steerGain, -1, 1);

    const desiredRadius = THREE.MathUtils.clamp(
      this.kite.anchorPos.distanceTo(this.targetPoint),
      38,
      105
    );
    const lenDiff = desiredRadius - this.kite.lineLength;
    const lineControlWindow = Math.max(1.65, 4.5 / Math.pow(Math.max(0.68, difficulty), 0.62));

    let pull = false;
    let release = false;
    let quickRelease = false;

    if (this.kite.inRelo && gameMode !== 'zen') {
      // Tricksters try to escape and re-enter; harder settings turn that into
      // a timed largada instead of an endless passive release.
      const evasiveChance = this.personality === 'trickster' ? 0.42 - skill * 0.22 : 0.035;
      if (Math.random() < evasiveChance) {
        release = true;
        quickRelease = this.kite.reloContactTime > 0.14 && this.kite.tension > 0.38
          && Math.random() < 0.22 + skill * 0.34;
      } else {
        pull = true;
        if (this.socadaTimer <= 0) {
          this.kite.triggerSocada(0.82 + skill * 0.34);
          this.socadaTimer = (0.30 + Math.random() * 0.20) / Math.sqrt(Math.max(0.68, difficulty));
        }
        if (this.disbicarTimer <= 0 && (
          this.personality === 'hunter' || this.personality === 'slasher' || skill > 0.48
        )) {
          this.kite.triggerDisbicar(Math.sign(steer) || (Math.random() > 0.5 ? 1 : -1));
          this.disbicarTimer = (0.9 + Math.random() * 0.5) / Math.sqrt(Math.max(0.68, difficulty));
        }
        if (this.disqueTimer <= 0 && (
          this.personality === 'slasher' || skill > 0.62
        )) {
          this.kite.triggerDisque(Math.sign(steer) || (Math.random() > 0.5 ? 1 : -1));
          this.disqueTimer = (1.15 + Math.random() * 0.65) / Math.sqrt(Math.max(0.68, difficulty));
        }
      }
    } else {
      if (lenDiff > lineControlWindow) {
        release = Math.abs(angleDiff) < 0.85;
      } else if (lenDiff < -lineControlWindow) {
        pull = true;
      }

      const alignTolerance = 0.48 + skill * 0.16;
      if (this.socadaTimer <= 0 && Math.abs(angleDiff) < alignTolerance) {
        this.kite.triggerSocada(0.75 + Math.random() * 0.35 + skill * 0.12);
        this.socadaTimer = (0.52 + Math.random() * 0.55) / Math.sqrt(Math.max(0.68, difficulty));
      }

      // At high skill, rivals prepare their attack before touching the player's line.
      if (skill > 0.62 && playerKite?.active && this.disbicarTimer <= 0
        && this.kite.position.distanceTo(playerKite.position) < 30
        && Math.abs(angleDiff) < 0.34) {
        this.kite.triggerDisbicar(Math.sign(steer) || 1);
        this.disbicarTimer = 1.05 + Math.random() * 0.45;
      }
    }

    return { pull, release, quickRelease, steer };
  }

  onCut(respawnDelay = 4.2) {
    this.kite.active = false;
    this.kite.visual.setVisible(false);
    this.kite.lineMesh.visible = false;
    this.respawnTimer = respawnDelay;
  }
}

const _up = new THREE.Vector3(0, 1, 0);
const _rad = new THREE.Vector3();
const _right = new THREE.Vector3();
const _tUp = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _offset = new THREE.Vector3();
