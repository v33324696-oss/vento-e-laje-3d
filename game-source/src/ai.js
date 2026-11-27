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
    if (!this.kite.active) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.kite.spawnInSky(true); // Launch fresh kite from rival's laje!
      }
      return { pull: false, release: false, steer: 0 };
    }

    this.retargetTimer -= dt;
    this.socadaTimer -= dt;
    this.disbicarTimer -= dt;

    // Pick new tactical target periodically
    if (this.retargetTimer <= 0) {
      this.retargetTimer = 1.6 + Math.random() * 2.2;

      if (gameMode === 'zen') {
        // Peaceful scenic sky cruising
        this.targetPoint.set(
          this.kite.anchorPos.x * 0.55 + (Math.random() - 0.5) * 34,
          30 + Math.random() * 28,
          -32 - Math.random() * 34
        );
      } else {
        // Priority 1: Chase nearby drifting kite ("aparar no alto")
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
          // Priority 2: Engage player or rival kite, or reposition in prime sky zone
          const engagePlayerChance = Math.min(0.9, (this.personality === 'hunter' ? 0.58 : 0.36) * difficulty);
          if (playerKite && playerKite.active && Math.random() < engagePlayerChance) {
            // Aim slightly across player's string (75% up player's line) to provoke a real relo!
            const idx = Math.floor(playerKite.stringNodes.length * (0.68 + Math.random() * 0.25));
            const stringPt = playerKite.stringNodes[idx] || playerKite.position;
            this.targetPoint.copy(stringPt).add(
              _offset.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 6)
            );
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

      // Clamp target to safe aerial arena
      this.targetPoint.y = THREE.MathUtils.clamp(this.targetPoint.y, 19, 46);
      this.targetPoint.z = THREE.MathUtils.clamp(this.targetPoint.z, -76, -22);
    }

    // Emergency climb if kite gets low near rooftops
    if (this.kite.position.y < 16) {
      this.targetPoint.set(this.kite.position.x * 0.8, 32, Math.min(-28, this.kite.position.z - 8));
    }

    // Compute tangent basis at AI kite
    _rad.subVectors(this.kite.position, this.kite.anchorPos).normalize();
    if (Math.abs(_rad.y) > 0.97) _right.set(1, 0, 0);
    else _right.crossVectors(_rad, _up).normalize();
    _tUp.crossVectors(_right, _rad).normalize();

    _toTarget.subVectors(this.targetPoint, this.kite.position);
    const upComp = _toTarget.dot(_tUp);
    const rightComp = _toTarget.dot(_right);
    const desiredAngle = Math.atan2(rightComp, upComp);

    // Shortest angular difference
    let angleDiff = desiredAngle - this.kite.noseAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const steer = THREE.MathUtils.clamp(angleDiff * 1.65, -1, 1);

    // Line length management toward target radius from AI's rooftop anchor
    const desiredRadius = THREE.MathUtils.clamp(
      this.kite.anchorPos.distanceTo(this.targetPoint),
      38,
      105
    );
    const lenDiff = desiredRadius - this.kite.lineLength;

    let pull = false;
    let release = false;
    let quickRelease = false;

    if (this.kite.inRelo && gameMode !== 'zen') {
      // Tactical relo response!
      if (this.personality === 'trickster') {
        release = true;
        quickRelease = this.kite.reloContactTime > 0.18 && this.kite.tension > 0.45 && Math.random() < 0.24;
      } else {
        pull = true;
        if (this.socadaTimer <= 0) {
          this.kite.triggerSocada(0.95 * difficulty);
          this.socadaTimer = 0.22 + Math.random() * 0.25;
        }
        if (this.disbicarTimer <= 0 && (this.personality === 'hunter' || this.personality === 'slasher')) {
          this.kite.triggerDisbicar(Math.sign(steer) || (Math.random() > 0.5 ? 1 : -1));
          this.disbicarTimer = 1.15 + Math.random() * 1.1;
        }
        if (this.personality === 'slasher' && Math.random() < 0.08 * difficulty) {
          this.kite.triggerDisque(Math.random() > 0.5 ? 1 : -1);
        }
      }
    } else {
      if (lenDiff > 4.5) {
        release = Math.abs(angleDiff) < 0.85;
      } else if (lenDiff < -4.5) {
        pull = true;
      }

      // Authentic periodic socadas when nose is aligned with target!
      if (this.socadaTimer <= 0 && Math.abs(angleDiff) < 0.55) {
        this.kite.triggerSocada(0.75 + Math.random() * 0.35);
        this.socadaTimer = (0.55 + Math.random() * 0.85) / Math.max(0.7, difficulty);
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
