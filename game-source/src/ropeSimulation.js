import * as THREE from 'three';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

/**
 * Lightweight Verlet rope for kite strings.
 *
 * The solver is deliberately independent from the kite flight model:
 * existing combat code can continue reading the same THREE.Vector3 nodes,
 * while the rope keeps inertia, slack, wind response and obstacle contacts.
 * All gameplay material values remain fictional tuning coefficients.
 */
export class VerletStringSimulation {
  constructor(segments = 28) {
    this.segments = Math.max(6, Math.floor(segments));
    this.nodes = Array.from({ length: this.segments + 1 }, () => new THREE.Vector3());
    this.previous = Array.from({ length: this.segments + 1 }, () => new THREE.Vector3());
    this.initialized = false;
    this.snagAmount = 0;
    this.lastContactCount = 0;
    this.fixedStep = 1 / 60;
    this.accumulator = 0;
    this.damping = 0.996;
    this.lineRadius = 0.035;
    this.gravity = -1.15;
    this._up = new THREE.Vector3(0, 1, 0);
    this._side = new THREE.Vector3();
  }

  reset(start, end, restLength, wind = null) {
    const span = start.distanceTo(end);
    const slack = Math.max(0, finite(restLength, span) - span);
    const sag = Math.min(3.0, Math.sqrt(Math.max(0, 2 * span * slack)) * 0.075);
    this._side.subVectors(end, start).cross(this._up);
    if (this._side.lengthSq() < 0.0001) this._side.set(1, 0, 0);
    else this._side.normalize();
    const windSide = wind ? clamp(wind.dot(this._side), -8, 8) : 0;
    const bow = clamp(windSide * slack * 0.0025, -0.65, 0.65);

    for (let i = 0; i <= this.segments; i++) {
      const u = i / this.segments;
      const parabola = 4 * u * (1 - u);
      const node = this.nodes[i];
      node.lerpVectors(start, end, u);
      node.y -= parabola * sag;
      node.addScaledVector(this._side, parabola * bow);
      this.previous[i].copy(node);
    }

    this.nodes[0].copy(start);
    this.nodes[this.segments].copy(end);
    this.previous[0].copy(start);
    this.previous[this.segments].copy(end);
    this.accumulator = 0;
    this.initialized = true;
    this.snagAmount = 0;
    this.lastContactCount = 0;
  }

  update({ start, end, restLength, wind = null, dt = 1 / 60, obstacles = [], tension = 0.45 } = {}) {
    if (!start?.isVector3 || !end?.isVector3) {
      throw new TypeError('VerletStringSimulation.update requires THREE.Vector3 start and end points.');
    }

    const span = start.distanceTo(end);
    const requestedLength = Math.max(0.05, finite(restLength, span));
    const effectiveLength = Math.max(requestedLength, span * 1.001);
    if (!this.initialized) this.reset(start, end, effectiveLength, wind);

    const stepDt = clamp(finite(dt, this.fixedStep), 0, 0.05);
    this.accumulator += stepDt;
    const steps = Math.min(3, Math.floor(this.accumulator / this.fixedStep));
    let contactsThisFrame = 0;

    if (steps > 0) {
      this.accumulator -= steps * this.fixedStep;
      const segmentLength = effectiveLength / this.segments;
      const windX = finite(wind?.x) * 0.012;
      const windY = finite(wind?.y) * 0.012;
      const windZ = finite(wind?.z) * 0.012;
      const contacted = new Set();

      for (let step = 0; step < steps; step++) {
        // End points are attached to the reel and the kite's bridle.
        this.nodes[0].copy(start);
        this.nodes[this.segments].copy(end);

        for (let i = 1; i < this.segments; i++) {
          const node = this.nodes[i];
          const previous = this.previous[i];
          const vx = (node.x - previous.x) * this.damping;
          const vy = (node.y - previous.y) * this.damping;
          const vz = (node.z - previous.z) * this.damping;
          previous.copy(node);
          node.x += vx + windX * this.fixedStep * this.fixedStep;
          node.y += vy + (this.gravity + windY) * this.fixedStep * this.fixedStep;
          node.z += vz + windZ * this.fixedStep * this.fixedStep;
        }

        // Distance constraints keep the line from stretching uncontrollably.
        // Repeating a few inexpensive passes is stable at 30–60 FPS.
        for (let iteration = 0; iteration < 7; iteration++) {
          this.nodes[0].copy(start);
          this.nodes[this.segments].copy(end);

          for (let i = 0; i < this.segments; i++) {
            const a = this.nodes[i];
            const b = this.nodes[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dz = b.z - a.z;
            const distance = Math.hypot(dx, dy, dz) || 0.000001;
            const correction = (distance - segmentLength) / distance;

            if (i === 0) {
              b.x -= dx * correction;
              b.y -= dy * correction;
              b.z -= dz * correction;
            } else if (i + 1 === this.segments) {
              a.x += dx * correction;
              a.y += dy * correction;
              a.z += dz * correction;
            } else {
              const half = correction * 0.5;
              a.x += dx * half;
              a.y += dy * half;
              a.z += dz * half;
              b.x -= dx * half;
              b.y -= dy * half;
              b.z -= dz * half;
            }
          }

          // Collision projection happens between constraint passes so the
          // string slides around roof edges instead of tunnelling through them.
          for (let i = 1; i < this.segments; i++) {
            const node = this.nodes[i];
            let touched = false;
            for (const obstacle of obstacles || []) {
              if (this._projectOut(node, obstacle)) touched = true;
            }
            if (touched) {
              contacted.add(i);
              this.previous[i].lerp(node, 0.42);
            }
          }
        }
      }

      this.nodes[0].copy(start);
      this.nodes[this.segments].copy(end);
      contactsThisFrame = contacted.size;
    } else {
      // At refresh rates above 60 FPS keep the attachments exact while the
      // fixed-step solver catches up on the next render frame.
      this.nodes[0].copy(start);
      this.nodes[this.segments].copy(end);
    }

    const contactRatio = contactsThisFrame / Math.max(1, this.segments - 1);
    const buildRate = contactRatio * 1.8;
    const releaseRate = contactsThisFrame > 0 ? 0 : 0.075;
    this.snagAmount = clamp(
      this.snagAmount + (buildRate - releaseRate) * stepDt,
      0,
      1
    );
    this.lastContactCount = contactsThisFrame;

    return {
      snagAmount: this.snagAmount,
      contactCount: contactsThisFrame,
      tension: clamp(finite(tension, 0.45), 0, 1)
    };
  }

  _projectOut(node, obstacle) {
    if (!obstacle || typeof obstacle !== 'object') return false;
    const radius = this.lineRadius;

    if (obstacle.type === 'box' && obstacle.min && obstacle.max) {
      const minX = finite(obstacle.min.x) - radius;
      const minY = finite(obstacle.min.y) - radius;
      const minZ = finite(obstacle.min.z) - radius;
      const maxX = finite(obstacle.max.x) + radius;
      const maxY = finite(obstacle.max.y) + radius;
      const maxZ = finite(obstacle.max.z) + radius;
      if (node.x < minX || node.x > maxX || node.y < minY || node.y > maxY || node.z < minZ || node.z > maxZ) {
        return false;
      }

      const choices = [
        [node.x - minX, 'x', minX - 0.002],
        [maxX - node.x, 'x', maxX + 0.002],
        [node.y - minY, 'y', minY - 0.002],
        [maxY - node.y, 'y', maxY + 0.002],
        [node.z - minZ, 'z', minZ - 0.002],
        [maxZ - node.z, 'z', maxZ + 0.002]
      ];
      choices.sort((a, b) => a[0] - b[0]);
      node[choices[0][1]] = choices[0][2];
      return true;
    }

    if (obstacle.type === 'cylinder') {
      const centerX = finite(obstacle.x);
      const centerZ = finite(obstacle.z);
      const minY = finite(obstacle.minY) - radius;
      const maxY = finite(obstacle.maxY) + radius;
      const safeRadius = Math.max(0, finite(obstacle.radius)) + radius;
      if (node.y < minY || node.y > maxY) return false;

      let dx = node.x - centerX;
      let dz = node.z - centerZ;
      let distance = Math.hypot(dx, dz);
      if (distance >= safeRadius) return false;
      if (distance < 0.0001) {
        dx = 1;
        dz = 0;
        distance = 1;
      }
      const scale = (safeRadius + 0.002) / distance;
      node.x = centerX + dx * scale;
      node.z = centerZ + dz * scale;
      return true;
    }

    return false;
  }
}
