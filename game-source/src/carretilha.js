import * as THREE from 'three';
import { createWoodSpoolTexture } from './textures.js';

export const LINE_TYPES = {
  rosa_chilena: {
    id: 'rosa_chilena', name: 'Linha esportiva rosa', color: 0xff2e93, hex: '#ff2e93',
    cutPower: 1.12, drag: 1.0, desc: 'Linha de competição representada de forma arcade no jogo.', durability: 0.78, recovery: 0.3
  },
  branca_pura: {
    id: 'branca_pura', name: 'Algodão nº 10', color: 0xf8fafc, hex: '#f8fafc',
    cutPower: 0.82, drag: 0.92, desc: 'Linha clássica de algodão, visual discreto e resposta suave.', durability: 1.05, recovery: 0.55
  },
  verde_neon: {
    id: 'verde_neon', name: 'Nylon multifilamento', color: 0xa3e635, hex: '#a3e635',
    cutPower: 0.92, drag: 0.88, desc: 'Fio sintético flexível com baixa resistência ao arrasto no jogo.', durability: 0.94, recovery: 0.48
  },
  azul_celeste: {
    id: 'azul_celeste', name: 'Poliéster trançado', color: 0x38bdf8, hex: '#38bdf8',
    cutPower: 0.86, drag: 0.96, desc: 'Trama estável, boa leitura visual e comportamento equilibrado.', durability: 1, recovery: 0.52
  },
  algodao_24: {
    id: 'algodao_24', name: 'Algodão nº 24', color: 0xf5deb3, hex: '#f5deb3',
    cutPower: 0.74, drag: 1.08, desc: 'Linha de algodão mais encorpada, com maior presença no vento.', durability: 1.12, recovery: 0.62
  },
  dacron: {
    id: 'dacron', name: 'Dacron / poliéster', color: 0xf97316, hex: '#f97316',
    cutPower: 0.68, drag: 0.82, desc: 'Linha resistente usada em aplicações de pipa e vela; controle estável.', durability: 1.22, recovery: 0.7
  },
  encerada: {
    id: 'encerada', name: 'Algodão encerado', color: 0xeab308, hex: '#eab308',
    cutPower: 0.9, drag: 0.94, desc: 'Acabamento encerado tradicional, representado sem receita ou instrução de preparo.', durability: 0.92, recovery: 0.44
  },
  aramida: {
    id: 'aramida', name: 'Fibra de aramida', color: 0xa78bfa, hex: '#a78bfa',
    cutPower: 0.98, drag: 0.78, desc: 'Fibra técnica de alta resistência, com comportamento fictício balanceado.', durability: 1.18, recovery: 0.58
  },
  nylon_monofilamento: {
    id: 'nylon_monofilamento', name: 'Nylon monofilamento', color: 0x67e8f9, hex: '#67e8f9',
    cutPower: 0.62, drag: 0.72, desc: 'Fio liso e pouco visível, com resposta mais elástica no simulador.', durability: 1.1, recovery: 0.42
  },
  poliester_fino: {
    id: 'poliester_fino', name: 'Poliéster fino', color: 0xfb7185, hex: '#fb7185',
    cutPower: 0.78, drag: 0.86, desc: 'Linha leve para voos tranquilos e manobras de precisão.', durability: 0.98, recovery: 0.5
  },
  linha_tradicional: {
    id: 'linha_tradicional', name: 'Linha tradicional de pipa', color: 0xffffff, hex: '#ffffff',
    cutPower: 0.8, drag: 1.0, desc: 'Configuração clássica e equilibrada para empinar no modo livre.', durability: 1, recovery: 0.5
  },
  dyneema: {
    id: 'dyneema', name: 'UHMWPE (Dyneema)', color: 0x22c55e, hex: '#22c55e',
    cutPower: 0.88, drag: 0.7, desc: 'Fibra sintética de alto desempenho usada em linhas técnicas; atributos apenas de jogo.', durability: 1.2, recovery: 0.64
  },
  linha_chilena_arcade: {
    id: 'linha_chilena_arcade', name: 'Linha chilena (arcade)', color: 0xf43f5e, hex: '#f43f5e',
    cutPower: 1.02, drag: 1.04, desc: 'Item fictício de competição dentro do jogo; não representa fabricação nem uso real.', durability: 0.8, recovery: 0.34
  }
};

export class Carretilha3D {
  constructor(scene, baseWorldPos = new THREE.Vector3(0, 10.75, 13.8)) {
    this.scene = scene;
    this.baseWorldPos = baseWorldPos.clone();

    this.root = new THREE.Group();
    this.root.position.copy(this.baseWorldPos);
    this.scene.add(this.root);

    this.spoolPivot = new THREE.Group();
    this.root.add(this.spoolPivot);

    this.spinAngle = 0;
    this.angularVel = 0;
    this.jerkImpulse = 0;
    this.swayOffset = new THREE.Vector2(0, 0);

    this._buildMesh();
  }

  _buildMesh() {
    const woodTex = createWoodSpoolTexture();
    const woodMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: 0.34,
      metalness: 0.06
    });

    const darkWoodMat = new THREE.MeshStandardMaterial({
      color: 0x451a03,
      roughness: 0.55
    });

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.22,
      metalness: 0.88
    });

    // Build faceplate shape with 6 classic finger holes ("furos da carretilha")
    const outerRadius = 0.24;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);

    // Center bearing hole
    const centerHole = new THREE.Path();
    centerHole.absarc(0, 0, 0.036, 0, Math.PI * 2, true);
    shape.holes.push(centerHole);

    // 6 finger holes around perimeter
    const holeCount = 6;
    for (let i = 0; i < holeCount; i++) {
      const a = (i * Math.PI * 2) / holeCount;
      const hx = Math.cos(a) * 0.135;
      const hy = Math.sin(a) * 0.135;
      const fHole = new THREE.Path();
      fHole.absarc(hx, hy, 0.042, 0, Math.PI * 2, true);
      shape.holes.push(fHole);
    }

    const extrudeSettings = {
      depth: 0.016,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.004,
      bevelThickness: 0.004
    };

    const plateGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Normalize planar UVs to [0..1] for wood texture
    const pos = plateGeo.attributes.position;
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uvs[i * 2] = 0.5 + pos.getX(i) / (outerRadius * 2.05);
      uvs[i * 2 + 1] = 0.5 + pos.getY(i) / (outerRadius * 2.05);
    }
    plateGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    const leftPlate = new THREE.Mesh(plateGeo, woodMat);
    leftPlate.position.z = -0.058;
    leftPlate.castShadow = true;

    const rightPlate = new THREE.Mesh(plateGeo, woodMat);
    rightPlate.position.z = 0.042;
    rightPlate.castShadow = true;

    // Rotating assembly (axis along Z, turned sideways slightly so user sees holes & wrapped string!)
    this.wheelGroup = new THREE.Group();
    this.wheelGroup.add(leftPlate);
    this.wheelGroup.add(rightPlate);

    // Inner wooden spacer dowels
    const dowelGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.10, 6);
    dowelGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      const dowel = new THREE.Mesh(dowelGeo, darkWoodMat);
      dowel.position.set(Math.cos(a) * 0.175, Math.sin(a) * 0.175, 0);
      this.wheelGroup.add(dowel);
    }

    // Wrapped line drum ("miolo de linha enrolada")
    const drumGeo = new THREE.CylinderGeometry(0.182, 0.182, 0.088, 24);
    drumGeo.rotateX(Math.PI / 2);
    this.lineDrumMat = new THREE.MeshStandardMaterial({
      color: 0xff2e93,
      roughness: 0.48,
      metalness: 0.05
    });
    this.lineDrum = new THREE.Mesh(drumGeo, this.lineDrumMat);
    this.wheelGroup.add(this.lineDrum);

    // Steel ball-bearing hub & internal hand grip handle
    const bearingGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.13, 16);
    bearingGeo.rotateX(Math.PI / 2);
    const bearing = new THREE.Mesh(bearingGeo, steelMat);
    this.spoolPivot.add(bearing);

    const handleGeo = new THREE.CylinderGeometry(0.022, 0.026, 0.24, 12);
    handleGeo.rotateX(Math.PI / 2);
    const handle = new THREE.Mesh(handleGeo, darkWoodMat);
    handle.position.z = -0.14;
    this.spoolPivot.add(handle);

    this.spoolPivot.add(this.wheelGroup);

    // Angle the carretilha naturally like a pipeiro holding it with right/left hand
    this.spoolPivot.rotation.set(0.18, -1.18, 0.12);

    // Exit guide point at upper rim of the spool
    this.exitAnchor = new THREE.Object3D();
    this.exitAnchor.position.set(0.0, 0.19, 0.0);
    this.spoolPivot.add(this.exitAnchor);
  }

  setLineColor(hexColor) {
    this.lineDrumMat.color.set(hexColor);
  }

  triggerSocada(strength = 1.0) {
    this.jerkImpulse = Math.min(1.5, this.jerkImpulse + 0.9 * strength);
    this.angularVel -= 14 * strength;
  }

  update({
    reelDelta = 0, // > 0 paying out line, < 0 reeling in
    steerInput = 0,
    camera,
    cameraMode = 'laje',
    dt = 0.016
  }) {
    // Spin wheel according to line speed
    const targetVel = reelDelta * 26;
    this.angularVel += (targetVel - this.angularVel) * Math.min(1, dt * 12);
    this.angularVel *= Math.pow(0.25, dt);
    this.spinAngle += this.angularVel * dt;
    this.wheelGroup.rotation.z = this.spinAngle;

    // Decay jerk recoil
    this.jerkImpulse *= Math.pow(0.008, dt);

    // Smooth lateral hand sway with steering
    this.swayOffset.x += (steerInput * 0.34 - this.swayOffset.x) * Math.min(1, dt * 10);
    this.swayOffset.y += (this.jerkImpulse * 0.22 - this.swayOffset.y) * Math.min(1, dt * 18);

    if (cameraMode === 'laje' && camera) {
      // Position carretilha comfortably in lower-right foreground of pipeiro's view!
      camera.updateMatrixWorld();
      _camForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      _camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      _camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);

      this.root.scale.setScalar(0.74);
      this.root.position
        .copy(camera.position)
        .addScaledVector(_camForward, 1.26 - this.jerkImpulse * 0.14)
        .addScaledVector(_camRight, 0.54 + this.swayOffset.x * 0.35)
        .addScaledVector(_camUp, -0.34 + this.swayOffset.y * 0.3);

      this.root.quaternion.copy(camera.quaternion);
      this.spoolPivot.rotation.set(
        0.16 + this.jerkImpulse * 0.38,
        -1.15 - this.swayOffset.x * 0.35,
        0.10
      );
    } else {
      // Fixed on player's rooftop spot when using chase/duel sky cameras
      this.root.scale.setScalar(1.0);
      this.root.position.set(
        this.baseWorldPos.x + this.swayOffset.x * 0.8,
        this.baseWorldPos.y + this.swayOffset.y * 0.6,
        this.baseWorldPos.z + this.jerkImpulse * 0.3
      );
      this.root.rotation.set(0, 0, 0);
      this.spoolPivot.rotation.set(0.2 + this.jerkImpulse * 0.35, -1.2, 0.1);
    }
  }

  getLineExitWorldPosition(outVec) {
    this.root.updateMatrixWorld(true);
    return outVec.setFromMatrixPosition(this.exitAnchor.matrixWorld);
  }
}

const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
