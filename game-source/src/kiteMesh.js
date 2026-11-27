import * as THREE from 'three';
import { getKitePatternTexture } from './textures.js';

export const KITE_MODELS = {
  murcha: { id: 'murcha', name: 'Murcha Paulista', desc: 'Modelo clássico equilibrado, bom para vento médio e manobras.', scale: 1.0, speedMult: 1.0, turnMult: 1.0, spinRate: 2.6, powerMult: 1.05, tailSegments: 26, ribbonColor: 0x111827, accentRibbonColor: 0xf43f5e },
  raia: { id: 'raia', name: 'Raia / Arraia', desc: 'Asa larga e ágil, feita para curvas rápidas e giros fechados.', scale: 0.96, speedMult: 1.16, turnMult: 1.28, spinRate: 3.45, powerMult: 0.95, tailSegments: 6, ribbonColor: 0xfacc15, accentRibbonColor: 0x06b6d4 },
  latao: { id: 'latao', name: 'Latão', desc: 'Estrutura maior e mais pesada, com resposta firme em vento forte.', scale: 1.24, speedMult: 0.92, turnMult: 0.86, spinRate: 2.05, powerMult: 1.28, tailSegments: 34, ribbonColor: 0x0f172a, accentRibbonColor: 0xfde047 },
  peixinho: { id: 'peixinho', name: 'Peixinho', desc: 'Formato estreito e leve, bom para voos mais soltos.', scale: 0.98, speedMult: 1.08, turnMult: 1.15, spinRate: 2.9, powerMult: 1.0, tailSegments: 20, ribbonColor: 0x1e293b, accentRibbonColor: 0x22c55e },
  papagaio: { id: 'papagaio', name: 'Papagaio / Losango', desc: 'Formato tradicional de quatro pontas, estável e versátil.', scale: 1.04, speedMult: 0.98, turnMult: 0.94, spinRate: 2.35, powerMult: 1.06, tailSegments: 28, ribbonColor: 0x7c2d12, accentRibbonColor: 0xfbbf24 },
  delta: { id: 'delta', name: 'Delta', desc: 'Asa triangular com boa sustentação e voo contínuo.', scale: 1.12, speedMult: 1.12, turnMult: 1.02, spinRate: 2.7, powerMult: 1.04, tailSegments: 18, ribbonColor: 0x1d4ed8, accentRibbonColor: 0x67e8f9 },
  estrela: { id: 'estrela', name: 'Estrela', desc: 'Pipa decorativa de várias pontas, com voo mais tranquilo.', scale: 1.08, speedMult: 0.91, turnMult: 0.82, spinRate: 1.9, powerMult: 0.9, tailSegments: 36, ribbonColor: 0x7e22ce, accentRibbonColor: 0xf0abfc },
  hexagonal: { id: 'hexagonal', name: 'Hexagonal', desc: 'Seis lados e área ampla de papel, indicada para vento constante.', scale: 1.12, speedMult: 0.94, turnMult: 0.88, spinRate: 2.1, powerMult: 1.12, tailSegments: 30, ribbonColor: 0x0f766e, accentRibbonColor: 0x5eead4 },
  peixao: { id: 'peixao', name: 'Peixão', desc: 'Modelo largo e comprido, com bastante presença no céu.', scale: 1.28, speedMult: 0.88, turnMult: 0.8, spinRate: 1.85, powerMult: 1.22, tailSegments: 40, ribbonColor: 0x9a3412, accentRibbonColor: 0xf97316 },
  capucheta: { id: 'capucheta', name: 'Capucheta', desc: 'Modelo simples de papel, leve e fácil de empinar.', scale: 0.88, speedMult: 1.2, turnMult: 1.1, spinRate: 3.0, powerMult: 0.82, tailSegments: 12, ribbonColor: 0x334155, accentRibbonColor: 0x38bdf8 },
  morcego: { id: 'morcego', name: 'Morcego', desc: 'Asas recortadas e pontas largas, com visual marcante.', scale: 1.05, speedMult: 1.04, turnMult: 1.08, spinRate: 2.8, powerMult: 1.0, tailSegments: 22, ribbonColor: 0x111827, accentRibbonColor: 0xa3e635 },
  quadrada: { id: 'quadrada', name: 'Quadrada', desc: 'Pipa de quatro lados, simples e estável para aprender.', scale: 0.98, speedMult: 0.96, turnMult: 0.9, spinRate: 2.2, powerMult: 0.98, tailSegments: 24, ribbonColor: 0x1e40af, accentRibbonColor: 0xfacc15 },
  rokkaku: { id: 'rokkaku', name: 'Rokkaku', desc: 'Pipa japonesa de seis lados alongados, com voo estável no simulador.', scale: 1.12, speedMult: 0.98, turnMult: 0.94, spinRate: 2.25, powerMult: 1.08, tailSegments: 22, ribbonColor: 0x9d174d, accentRibbonColor: 0xfda4af }
};

// Builds custom kite paper BufferGeometry with deformable wing vertices
function createKitePaperGeometry(modelId) {
  const geo = new THREE.BufferGeometry();

  // Control vertices in kite local XY plane (+Y nose, -Y tail, +Z front facing player)
  // Layout uses center hub + outer perimeter triangles so wings flex smoothly along Z
  const outlines = {
    raia: [[0,.84],[.52,.56],[.94,.10],[.56,-.40],[0,-.88],[-.56,-.40],[-.94,.10],[-.52,.56]],
    peixinho: [[0,.90],[.42,.54],[.78,.18],[.40,-.36],[0,-.90],[-.40,-.36],[-.78,.18],[-.42,.54]],
    latao: [[0,.94],[.48,.68],[.86,.38],[.66,-.30],[0,-.94],[-.66,-.30],[-.86,.38],[-.48,.68]],
    papagaio: [[0,.98],[.72,.12],[0,-.96],[-.72,.12]],
    delta: [[0,.94],[.98,-.62],[.62,-.70],[0,-.48],[-.62,-.70],[-.98,-.62]],
    estrela: [[0,.98],[.20,.36],[.78,.62],[.38,.08],[.94,-.28],[.28,-.32],[0,-.98],[-.28,-.32],[-.94,-.28],[-.38,.08],[-.78,.62],[-.20,.36]],
    hexagonal: [[0,.98],[.78,.54],[.78,-.40],[0,-.92],[-.78,-.40],[-.78,.54]],
    peixao: [[0,.98],[.52,.58],[.92,.20],[.72,-.35],[.36,-.62],[0,-.98],[-.36,-.62],[-.72,-.35],[-.92,.20],[-.52,.58]],
    capucheta: [[-.88,.72],[.88,.72],[0,-.94]],
    morcego: [[0,.72],[.30,.24],[.98,.10],[.52,-.20],[.72,-.72],[0,-.46],[-.72,-.72],[-.52,-.20],[-.98,.10],[-.30,.24]],
    quadrada: [[-.78,.78],[.78,.78],[.78,-.78],[-.78,-.78]],
    rokkaku: [[0,.98],[.68,.54],[.78,0],[.68,-.54],[0,-.98],[-.68,-.54],[-.78,0],[-.68,.54]]
  };
  const outline = outlines[modelId] || [[0,.92],[.44,.65],[.80,.35],[.55,-.32],[0,-.92],[-.55,-.32],[-.80,.35],[-.44,.65]];

  const positions = [];
  const uvs = [];
  const flexWeights = []; // How much each vertex bends toward -Z under aerodynamic load

  const center = [0.0, 0.06, 0.02];
  const toUV = (x, y) => [0.5 + x * 0.52, 0.5 + y * 0.52];

  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const p1 = outline[i];
    const p2 = outline[(i + 1) % n];

    // Center vertex
    positions.push(center[0], center[1], center[2]);
    uvs.push(...toUV(center[0], center[1]));
    flexWeights.push(0.0);

    // Vertex 1
    const w1 = Math.pow(Math.abs(p1[0]) / 0.85, 1.45);
    positions.push(p1[0], p1[1], -w1 * 0.06);
    uvs.push(...toUV(p1[0], p1[1]));
    flexWeights.push(w1);

    // Vertex 2
    const w2 = Math.pow(Math.abs(p2[0]) / 0.85, 1.45);
    positions.push(p2[0], p2[1], -w2 * 0.06);
    uvs.push(...toUV(p2[0], p2[1]));
    flexWeights.push(w2);
  }

  const posAttr = new THREE.Float32BufferAttribute(positions, 3);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.userData.basePositions = new Float32Array(positions);
  geo.userData.flexWeights = new Float32Array(flexWeights);
  geo.computeVertexNormals();

  return geo;
}

export class KiteVisual {
  constructor(scene, {
    modelId = 'murcha',
    patternId = 'estrela_paulista',
    tailStyle = 'padrao'
  } = {}) {
    this.scene = scene;
    this.modelId = KITE_MODELS[modelId] ? modelId : 'murcha';
    this.patternId = patternId;
    this.tailStyle = tailStyle;
    this.spec = KITE_MODELS[this.modelId];

    this.group = new THREE.Group();
    this.kiteBody = new THREE.Group();
    this.group.add(this.kiteBody);
    this.scene.add(this.group);

    this.aeroFlex = 0.2;
    this.flutterPhase = Math.random() * Math.PI * 2;

    this._buildKiteBody();
    this._initTail();
  }

  _buildKiteBody() {
    // Clear previous children if rebuilding in Oficina
    while (this.kiteBody.children.length > 0) {
      const ch = this.kiteBody.children.pop();
      if (ch.geometry) ch.geometry.dispose();
    }

    const spec = KITE_MODELS[this.modelId];
    this.spec = spec;
    const tex = getKitePatternTexture(this.patternId);

    this.paperGeo = createKitePaperGeometry(this.modelId);
    this.paperMat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.30,
      roughness: 0.56,
      metalness: 0.02,
      side: THREE.DoubleSide
    });

    this.paperMesh = new THREE.Mesh(this.paperGeo, this.paperMat);
    this.paperMesh.castShadow = true;
    this.kiteBody.add(this.paperMesh);

    // Bamboo central spine ("vareta central de bambu")
    const bambooMat = new THREE.MeshStandardMaterial({
      color: 0xd9a05b,
      roughness: 0.65,
      metalness: 0.05
    });
    const spineLen = this.modelId === 'raia' ? 1.82 : (this.modelId === 'capucheta' ? 1.45 : 1.96);
    const spineGeo = new THREE.CylinderGeometry(0.014, 0.018, spineLen, 7);
    const spineMesh = new THREE.Mesh(spineGeo, bambooMat);
    spineMesh.position.set(0, 0, -0.012);
    this.kiteBody.add(spineMesh);

    // Fiberglass / Bamboo curved upper spar ("vareta de cima envergada")
    const fiberMat = new THREE.MeshStandardMaterial({
      color: this.modelId === 'raia' ? 0xf8fafc : 0xc89248,
      roughness: 0.45
    });

    const upperCurvePts = this.modelId === 'raia'
      ? [
          new THREE.Vector3(-0.94, 0.10, -0.09),
          new THREE.Vector3(-0.52, 0.56, -0.03),
          new THREE.Vector3(0.0, 0.84, 0.0),
          new THREE.Vector3(0.52, 0.56, -0.03),
          new THREE.Vector3(0.94, 0.10, -0.09)
        ]
      : [
          new THREE.Vector3(-0.80, 0.35, -0.08),
          new THREE.Vector3(-0.44, 0.64, -0.03),
          new THREE.Vector3(0.0, 0.72, -0.01),
          new THREE.Vector3(0.44, 0.64, -0.03),
          new THREE.Vector3(0.80, 0.35, -0.08)
        ];

    const upperCurve = new THREE.CatmullRomCurve3(upperCurvePts);
    const upperSparGeo = new THREE.TubeGeometry(upperCurve, 18, 0.011, 6, false);
    const upperSpar = new THREE.Mesh(upperSparGeo, fiberMat);
    this.kiteBody.add(upperSpar);

    // Lower spar ("vareta de baixo") for traditional kites
    if (!['raia', 'capucheta', 'delta', 'estrela', 'morcego'].includes(this.modelId)) {
      const lowW = this.modelId === 'latao' ? 1.32 : this.modelId === 'peixinho' ? 0.82 : 1.10;
      const lowY = this.modelId === 'peixinho' ? -0.34 : -0.32;
      const lowGeo = new THREE.CylinderGeometry(0.01, 0.01, lowW, 6);
      lowGeo.rotateZ(Math.PI / 2);
      const lowSpar = new THREE.Mesh(lowGeo, fiberMat);
      lowSpar.position.set(0, lowY, -0.035);
      this.kiteBody.add(lowSpar);
    }

    // 3-point Bridle ("Cabresto de 3 pontas") on front (+Z) side
    this.bridleLocalKnot = new THREE.Vector3(0, 0.16, 0.62);
    const bridlePts = [
      new THREE.Vector3(0, 0.62, 0.01),
      this.bridleLocalKnot,
      new THREE.Vector3(0, -0.34, 0.01),
      this.bridleLocalKnot,
      new THREE.Vector3(-0.26, 0.42, 0.0),
      this.bridleLocalKnot,
      new THREE.Vector3(0.26, 0.42, 0.0),
      this.bridleLocalKnot
    ];
    const bridleGeo = new THREE.BufferGeometry().setFromPoints(bridlePts);
    const bridleMat = new THREE.LineBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.75
    });
    const bridleLines = new THREE.LineSegments(bridleGeo, bridleMat);
    this.kiteBody.add(bridleLines);

    // Apply model base scale
    this.kiteBody.scale.setScalar(spec.scale * 1.38);
  }

  _initTail() {
    // Dispose old tail objects if rebuilding
    if (this.tailLine) {
      this.scene.remove(this.tailLine);
      this.tailLine.geometry.dispose();
      this.tailLine.material.dispose();
    }
    if (this.ribbonInstanced) {
      this.scene.remove(this.ribbonInstanced);
      this.ribbonInstanced.geometry.dispose();
      this.ribbonInstanced.material.dispose();
    }

    const baseCount = this.spec.tailSegments;
    const noTail = this.tailStyle === 'sem';
    const styleMult = this.tailStyle === 'longa' ? 1.35 : this.tailStyle === 'curta' ? 0.55 : 1.0;
    this.maxTailNodes = noTail ? 2 : Math.max(2, Math.round(baseCount * styleMult));
    this.activeTailNodes = noTail ? 0 : this.maxTailNodes;
    this.segLength = 0.25 * this.spec.scale;

    this.tailNodes = [];
    this.tailPrev = [];
    for (let i = 0; i < this.maxTailNodes; i++) {
      this.tailNodes.push(new THREE.Vector3(0, 15 - i * this.segLength, 0));
      this.tailPrev.push(new THREE.Vector3(0, 15 - i * this.segLength, 0));
    }

    // Central thread of the rabiola
    this.tailPositions = new Float32Array(this.maxTailNodes * 3);
    const tailGeo = new THREE.BufferGeometry();
    tailGeo.setAttribute('position', new THREE.BufferAttribute(this.tailPositions, 3));
    const tailMat = new THREE.LineBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.72
    });
    this.tailLine = new THREE.Line(tailGeo, tailMat);
    this.tailLine.frustumCulled = false;
    this.scene.add(this.tailLine);

    // Individual plastic ribbon bows ("fitinhas da rabiola")
    const bowGeo = new THREE.PlaneGeometry(0.36 * this.spec.scale, 0.085 * this.spec.scale);
    const bowMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.42,
      side: THREE.DoubleSide
    });
    this.ribbonInstanced = new THREE.InstancedMesh(bowGeo, bowMat, this.maxTailNodes);
    this.ribbonInstanced.frustumCulled = false;

    const cPrimary = new THREE.Color(this.spec.ribbonColor);
    const cAccent = new THREE.Color(this.spec.accentRibbonColor);
    for (let i = 0; i < this.maxTailNodes; i++) {
      this.ribbonInstanced.setColorAt(i, i % 4 === 0 ? cAccent : cPrimary);
    }
    if (this.ribbonInstanced.instanceColor) {
      this.ribbonInstanced.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.ribbonInstanced);
    this.tailLine.visible = !noTail;
    this.ribbonInstanced.visible = !noTail;
  }

  rebuild({ modelId, patternId, tailStyle }) {
    if (modelId && KITE_MODELS[modelId]) this.modelId = modelId;
    if (patternId) this.patternId = patternId;
    if (tailStyle) this.tailStyle = tailStyle;
    this._buildKiteBody();
    this._initTail();
    // Snap tail to current kite position
    this.resetTailAt(this.group.position);
  }

  resetTailAt(worldPos) {
    for (let i = 0; i < this.maxTailNodes; i++) {
      this.tailNodes[i].set(worldPos.x, worldPos.y - 0.8 - i * this.segLength, worldPos.z);
      this.tailPrev[i].copy(this.tailNodes[i]);
    }
    this.activeTailNodes = this.tailStyle === 'sem' ? 0 : this.maxTailNodes;
    this.tailLine.geometry.setDrawRange(0, this.activeTailNodes);
  }

  // Cuts rabiola at nodeIdx ("Ficou rabicó!"), returning severed nodes for falling effect
  cutTailAt(nodeIdx) {
    const clamped = Math.max(3, Math.min(this.activeTailNodes - 3, nodeIdx));
    if (clamped >= this.activeTailNodes - 2) return null;

    const severed = [];
    for (let i = clamped; i < this.activeTailNodes; i++) {
      severed.push(this.tailNodes[i].clone());
    }
    this.activeTailNodes = clamped;
    this.tailLine.geometry.setDrawRange(0, this.activeTailNodes);
    return severed;
  }

  getTailRatio() {
    return this.tailStyle === 'sem' ? 0 : this.activeTailNodes / Math.max(1, this.maxTailNodes);
  }

  getBridleWorldPosition(outVec) {
    this.group.updateMatrixWorld(true);
    return outVec.copy(this.bridleLocalKnot).applyMatrix4(this.kiteBody.matrixWorld);
  }

  getTailAttachWorldPosition(outVec) {
    const tailY = this.modelId === 'raia' ? -0.88 : -0.92;
    this.group.updateMatrixWorld(true);
    return outVec.set(0, tailY, 0).applyMatrix4(this.kiteBody.matrixWorld);
  }

  update({
    position,
    quaternion,
    aeroLoad = 0.35,
    windVec,
    sunDir,
    cameraPos,
    dt = 0.016
  }) {
    this.group.position.copy(position);
    this.group.quaternion.copy(quaternion);

    // Subtle perceptual distance scaling so kites at 80m-140m remain readable & crisp
    const distToCam = cameraPos ? position.distanceTo(cameraPos) : 45;
    const perceptualScale = 1.0 + Math.min(0.65, Math.max(0, (distToCam - 38) * 0.0065));
    this.group.scale.setScalar(perceptualScale);

    // Dynamic wing flex & paper flutter
    this.flutterPhase += dt * (14 + aeroLoad * 24);
    this.aeroFlex += (aeroLoad - this.aeroFlex) * Math.min(1, dt * 14);

    const posAttr = this.paperGeo.attributes.position;
    const base = this.paperGeo.userData.basePositions;
    const weights = this.paperGeo.userData.flexWeights;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i];
      if (w > 0.001) {
        const bx = base[i * 3];
        const flutter = Math.sin(this.flutterPhase + bx * 4.5) * 0.014 * w * (0.4 + this.aeroFlex);
        posAttr.array[i * 3 + 2] = base[i * 3 + 2] - w * this.aeroFlex * 0.22 + flutter;
      }
    }
    posAttr.needsUpdate = true;

    // Backlit silk-paper translucency boost when looking toward sun
    if (sunDir && cameraPos) {
      const viewDir = _tmpV1.subVectors(position, cameraPos).normalize();
      const sunAlign = Math.max(0, viewDir.dot(sunDir));
      this.paperMat.emissiveIntensity = 0.42 + sunAlign * 0.45;
    }

    // Update Verlet physics for Rabiola
    const attach = this.getTailAttachWorldPosition(_tmpAttach);
    this.tailNodes[0].copy(attach);
    this.tailPrev[0].copy(attach);

    const stepDt = Math.min(0.033, dt);
    const drag = 0.945;
    const count = this.activeTailNodes;

    // Kite side vector for Karman vortex tail wave
    _tmpSide.set(1, 0, 0).applyQuaternion(quaternion);

    for (let i = 1; i < count; i++) {
      const curr = this.tailNodes[i];
      const prev = this.tailPrev[i];

      const vx = (curr.x - prev.x) * drag;
      const vy = (curr.y - prev.y) * drag;
      const vz = (curr.z - prev.z) * drag;

      prev.copy(curr);

      const wave = Math.sin(this.flutterPhase * 0.85 - i * 0.58) * (0.042 + this.aeroFlex * 0.055);
      curr.x += vx + (windVec.x * 0.52) * stepDt + _tmpSide.x * wave;
      curr.y += vy + (-5.6 + windVec.y * 0.4) * stepDt + _tmpSide.y * wave;
      curr.z += vz + (windVec.z * 0.52) * stepDt + _tmpSide.z * wave;
    }

    const targetSegLen = this.segLength * perceptualScale;
    for (let iter = 0; iter < 4; iter++) {
      this.tailNodes[0].copy(attach);
      for (let i = 0; i < count - 1; i++) {
        const a = this.tailNodes[i];
        const b = this.tailNodes[i + 1];
        _tmpDiff.subVectors(b, a);
        const d = _tmpDiff.length() || 0.0001;
        const corr = (d - targetSegLen) / d;
        if (i === 0) {
          b.addScaledVector(_tmpDiff, -corr);
        } else {
          a.addScaledVector(_tmpDiff, corr * 0.45);
          b.addScaledVector(_tmpDiff, -corr * 0.55);
        }
      }
    }

    // Write tail line vertices and instanced ribbon transforms
    for (let i = 0; i < this.maxTailNodes; i++) {
      if (i < count) {
        const p = this.tailNodes[i];
        this.tailPositions[i * 3] = p.x;
        this.tailPositions[i * 3 + 1] = p.y;
        this.tailPositions[i * 3 + 2] = p.z;

        if (i === 0) {
          _tmpMatrix.makeScale(0, 0, 0);
        } else {
          const prevNode = this.tailNodes[i - 1];
          _tmpTangent.subVectors(prevNode, p).normalize();
          _tmpQuat.setFromUnitVectors(_upVec, _tmpTangent);
          // Twist each ribbon bow ("fitinha") dynamically in the wind
          const twist = i * 1.15 + Math.sin(this.flutterPhase * 0.7 + i * 0.8) * 0.75;
          _tmpTwist.setFromAxisAngle(_upVec, twist);
          _tmpQuat.multiply(_tmpTwist);
          _tmpScale.setScalar(perceptualScale);
          _tmpMatrix.compose(p, _tmpQuat, _tmpScale);
        }
        this.ribbonInstanced.setMatrixAt(i, _tmpMatrix);
      } else {
        _tmpMatrix.makeScale(0, 0, 0);
        this.ribbonInstanced.setMatrixAt(i, _tmpMatrix);
      }
    }

    this.tailLine.geometry.attributes.position.needsUpdate = true;
    this.tailLine.geometry.setDrawRange(0, count);
    this.ribbonInstanced.instanceMatrix.needsUpdate = true;
  }

  setVisible(vis) {
    this.group.visible = vis;
    const hasTail = this.tailStyle !== 'sem' && this.activeTailNodes > 1;
    this.tailLine.visible = vis && hasTail;
    this.ribbonInstanced.visible = vis && hasTail;
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.tailLine);
    this.scene.remove(this.ribbonInstanced);
    this.paperGeo.dispose();
    this.paperMat.dispose();
    this.tailLine.geometry.dispose();
    this.tailLine.material.dispose();
    this.ribbonInstanced.geometry.dispose();
    this.ribbonInstanced.material.dispose();
  }
}

const _tmpV1 = new THREE.Vector3();
const _tmpAttach = new THREE.Vector3();
const _tmpSide = new THREE.Vector3();
const _tmpDiff = new THREE.Vector3();
const _tmpTangent = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpTwist = new THREE.Quaternion();
const _tmpScale = new THREE.Vector3(1, 1, 1);
const _tmpMatrix = new THREE.Matrix4();
const _upVec = new THREE.Vector3(0, 1, 0);
