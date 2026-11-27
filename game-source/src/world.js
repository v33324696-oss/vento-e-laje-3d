import * as THREE from 'three';
import {
  createBrickTextures,
  createConcreteTextures,
  createCorrugatedRoofTexture
} from './textures.js';
import { createNpcAppearance, PLAYER_PIPEIRO_APPEARANCE, PLAYER_ARA_CHARACTER, createNpcAraCharacter } from './characters.js';

export const WEATHER_PRESETS = {
  tarde: {
    id: 'tarde',
    name: 'Tarde de Sol (15h30)',
    zenithColor: 0x0369a1,
    midSkyColor: 0x38bdf8,
    horizonColor: 0xbae6fd,
    sunGlowColor: 0xfffbeb,
    elevation: 36,
    azimuth: 122,
    sunColor: 0xfff5e0,
    sunIntensity: 2.3,
    hemiSky: 0x7dd3fc,
    hemiGround: 0x9a5b25,
    hemiIntensity: 1.05,
    fogColor: 0xbae6fd,
    fogDensity: 0.0011,
    baseWind: 9.2,
    gustStrength: 3.2
  },
  pordosol: {
    id: 'pordosol',
    name: 'Pôr do Sol na Laje (17h45)',
    zenithColor: 0x1e1b4b,
    midSkyColor: 0xc026d3,
    horizonColor: 0xfb923c,
    sunGlowColor: 0xfde047,
    elevation: 9.5,
    azimuth: 146,
    sunColor: 0xffa94d,
    sunIntensity: 2.1,
    hemiSky: 0xfdba74,
    hemiGround: 0x451a03,
    hemiIntensity: 0.92,
    fogColor: 0xfdba74,
    fogDensity: 0.0014,
    baseWind: 7.8,
    gustStrength: 2.5
  },
  ventania: {
    id: 'ventania',
    name: 'Manhã de Ventania (09h30)',
    zenithColor: 0x0284c7,
    midSkyColor: 0x60a5fa,
    horizonColor: 0xe0f2fe,
    sunGlowColor: 0xffffff,
    elevation: 46,
    azimuth: 108,
    sunColor: 0xffffff,
    sunIntensity: 2.5,
    hemiSky: 0x93c5fd,
    hemiGround: 0x64748b,
    hemiIntensity: 1.15,
    fogColor: 0xdbeafe,
    fogDensity: 0.0009,
    baseWind: 12.6,
    gustStrength: 5.4,
    cloudOpacity: 0.76,
    cloudDrift: 1.15
  },
  nublado: {
    id: 'nublado',
    name: 'Céu Nublado',
    zenithColor: 0x334155,
    midSkyColor: 0x64748b,
    horizonColor: 0xcbd5e1,
    sunGlowColor: 0xe2e8f0,
    elevation: 25,
    azimuth: 132,
    sunColor: 0xe2e8f0,
    sunIntensity: 1.2,
    hemiSky: 0x94a3b8,
    hemiGround: 0x57534e,
    hemiIntensity: 0.82,
    fogColor: 0x94a3b8,
    fogDensity: 0.00135,
    baseWind: 8.5,
    gustStrength: 2.1,
    cloudOpacity: 0.98,
    cloudDrift: 0.62,
    cloudiness: 0.78
  },
  chuva: {
    id: 'chuva', name: 'Chuva fraca',
    zenithColor: 0x1e293b, midSkyColor: 0x475569, horizonColor: 0x94a3b8,
    sunGlowColor: 0xcbd5e1, elevation: 18, azimuth: 132, sunColor: 0xcbd5e1,
    sunIntensity: 0.72, hemiSky: 0x64748b, hemiGround: 0x334155, hemiIntensity: 0.62,
    fogColor: 0x64748b, fogDensity: 0.0018, baseWind: 7.2, gustStrength: 2.8,
    cloudOpacity: 1, cloudDrift: 0.82, cloudiness: 1
  }
};

export class GameWorld {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.sunDir = new THREE.Vector3(0, 0.5, -0.86).normalize();
    this.rivalSpots = [];
    this.clouds = [];
    this.birds = [];
    this.swayingTrees = [];
    // The rooftop wind streamer is built immediately in _buildPlayerLaje().
    this.windRibbonNodes = [];
    this.ambientPeople = [];
    this.ambientVehicles = [];
    this.ambientDogs = [];
    this.usedNpcAppearanceSignatures = new Set();
    this.araNpcSerial = 0;
    this.araCharacterQueue = [];
    this.araCharacterLoads = 0;
    this.araCharacterConcurrency = 2;
    this.playerMoveSpeed = 0;
    this.cloudMaterial = null;
    this.rainPoints = null;
    this.rainPositions = null;
    this.timeOfDay = 15.5;
    this.timeRate = 0.004;
    this.currentPreset = WEATHER_PRESETS.tarde;
    this.mapId = 'laje';

    this._initLightingAndSky();
    this._buildTerrainAndStreets();
    this._buildPlayerLaje();
    this._buildNeighborhood();
    this._buildCloudsAndBirds();

    this.mapId = 'laje';
    this._baseMapChildren = this.scene.children.slice();
    this._lajeRivalSpots = this.rivalSpots.map((spot) => ({ name: spot.name, anchor: spot.anchor.clone() }));
    this.mapGroups = {};
    this._buildAlternativeMaps();
    this._buildHomeInterior();
    this.playerSpawn = this.getPlayerSpawn();
    this.applyWeather('tarde');
  }

  _initLightingAndSky() {
    // Rich Atmospheric Gradient + Solar Aureole Sky Dome Shader
    const skyGeo = new THREE.SphereGeometry(950, 32, 24);
    this.skyUniforms = {
      uZenith: { value: new THREE.Color(0x0369a1) },
      uMidSky: { value: new THREE.Color(0x38bdf8) },
      uHorizon: { value: new THREE.Color(0xbae6fd) },
      uSunGlow: { value: new THREE.Color(0xfffbeb) },
      uSunDir: { value: new THREE.Vector3(0, 0.5, -0.86) }
    };

    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uZenith;
        uniform vec3 uMidSky;
        uniform vec3 uHorizon;
        uniform vec3 uSunGlow;
        uniform vec3 uSunDir;
        varying vec3 vWorldDir;
        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uMidSky, smoothstep(0.0, 0.28, h));
          col = mix(col, uZenith, smoothstep(0.22, 0.85, h));

          float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
          float halo = pow(sunDot, 10.0) * 0.38;
          float disc = smoothstep(0.9982, 0.9995, sunDot) * 1.15;
          col += uSunGlow * (halo + disc);

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.sky);

    this.hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x92400e, 1.05);
    this.scene.add(this.hemiLight);

    // Warm concrete-bounce fill light from behind/above the laje so foreground carretilha & brick mureta read richly
    this.bounceLight = new THREE.DirectionalLight(0xfff2df, 0.85);
    this.bounceLight.position.set(12, 18, 28);
    this.scene.add(this.bounceLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 2.3);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 260;
    const d = 85;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    this.scene.fog = new THREE.FogExp2(0xbae6fd, 0.0011);
  }

  applyWeather(presetId) {
    const p = WEATHER_PRESETS[presetId] || WEATHER_PRESETS.tarde;
    this.currentPreset = p;

    const phi = THREE.MathUtils.degToRad(90 - p.elevation);
    const theta = THREE.MathUtils.degToRad(p.azimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta).normalize();

    this.skyUniforms.uZenith.value.setHex(p.zenithColor);
    this.skyUniforms.uMidSky.value.setHex(p.midSkyColor);
    this.skyUniforms.uHorizon.value.setHex(p.horizonColor);
    this.skyUniforms.uSunGlow.value.setHex(p.sunGlowColor);
    this.skyUniforms.uSunDir.value.copy(this.sunDir);

    this.sunLight.position.copy(this.sunDir).multiplyScalar(135);
    this.sunLight.color.setHex(p.sunColor);
    this.sunLight.intensity = p.sunIntensity;

    this.hemiLight.color.setHex(p.hemiSky);
    this.hemiLight.groundColor.setHex(p.hemiGround);
    this.hemiLight.intensity = p.hemiIntensity;

    this.scene.fog.color.setHex(p.fogColor);
    this.scene.fog.density = p.fogDensity;
    if (this.cloudMaterial) this.cloudMaterial.opacity = p.cloudOpacity ?? 0.9;
    if (this.rainPoints) this.rainPoints.visible = p.id === 'chuva';
  }

  getClockLabel() {
    const hour = Math.floor(this.timeOfDay) % 24;
    const minute = Math.floor((this.timeOfDay - Math.floor(this.timeOfDay)) * 60);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  cycleTimeSpeed() {
    const rates = [0.004, 0.012, 0];
    const labels = ['1×', '3×', 'Pausado'];
    let index = rates.findIndex((rate) => Math.abs(rate - this.timeRate) < 0.00001);
    index = (index + 1) % rates.length;
    this.timeRate = rates[index];
    return labels[index];
  }

  _updateDynamicDayCycle(dt) {
    this.timeOfDay = (this.timeOfDay + Math.max(0, dt) * this.timeRate) % 24;
    const keys = [
      { h: 0, zen: 0x020617, mid: 0x0f172a, horizon: 0x1e293b, glow: 0x64748b, light: 0.10, elevation: -12 },
      { h: 5, zen: 0x172554, mid: 0x334155, horizon: 0x64748b, glow: 0xf59e0b, light: 0.22, elevation: -2 },
      { h: 7, zen: 0x075985, mid: 0x38bdf8, horizon: 0xfde68a, glow: 0xfff7d6, light: 1.35, elevation: 18 },
      { h: 12, zen: 0x0369a1, mid: 0x38bdf8, horizon: 0xbae6fd, glow: 0xfffbeb, light: 2.15, elevation: 62 },
      { h: 17, zen: 0x7c2d12, mid: 0xfb923c, horizon: 0xfed7aa, glow: 0xfef3c7, light: 1.55, elevation: 12 },
      { h: 20, zen: 0x1e1b4b, mid: 0x312e81, horizon: 0x475569, glow: 0xf97316, light: 0.28, elevation: -6 },
      { h: 24, zen: 0x020617, mid: 0x0f172a, horizon: 0x1e293b, glow: 0x64748b, light: 0.10, elevation: -12 }
    ];
    const hour = this.timeOfDay;
    let next = 1;
    while (next < keys.length - 1 && hour > keys[next].h) next += 1;
    const a = keys[next - 1], b = keys[next];
    const t = THREE.MathUtils.clamp((hour - a.h) / Math.max(0.001, b.h - a.h), 0, 1);
    const smooth = t * t * (3 - 2 * t);
    const color = (hexA, hexB, target) => target.lerpColors(_colorA.setHex(hexA), _colorB.setHex(hexB), smooth);
    const cloudiness = this.currentPreset.cloudiness ?? 0.12;
    color(a.zen, b.zen, this.skyUniforms.uZenith.value);
    color(a.mid, b.mid, this.skyUniforms.uMidSky.value);
    color(a.horizon, b.horizon, this.skyUniforms.uHorizon.value);
    color(a.glow, b.glow, this.skyUniforms.uSunGlow.value);
    const elevation = THREE.MathUtils.lerp(a.elevation, b.elevation, smooth);
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    this.sunDir.setFromSphericalCoords(1, phi, THREE.MathUtils.degToRad(132)).normalize();
    this.skyUniforms.uSunDir.value.copy(this.sunDir);
    this.sunLight.position.copy(this.sunDir).multiplyScalar(135);
    this.sunLight.intensity = THREE.MathUtils.lerp(a.light, b.light, smooth) * (1 - cloudiness * 0.48) * (this.currentPreset.id === 'chuva' ? 0.78 : 1);
    this.sunLight.color.copy(_colorC.setHex(this.currentPreset.sunColor));
    this.hemiLight.color.copy(this.skyUniforms.uMidSky.value);
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.42, 1.1, Math.max(0, this.sunLight.intensity / 2.2));
    this.scene.fog.color.copy(this.skyUniforms.uHorizon.value);
    this.scene.fog.density = (this.currentPreset.fogDensity || 0.0011) * (hour < 6 || hour > 19 ? 1.16 : 1);
  }

  getTerrainHeight(x, z) {
    if (this.mapId !== 'laje') return 0;
    // Gentle valley in front (-Z), rising into lush hills far in the background
    let h = 0;
    if (z < -95) {
      const t = Math.min(1, (-z - 95) / 160);
      h += t * t * 34 + Math.sin(x * 0.035) * 6 * t;
    } else {
      h += Math.sin(x * 0.025) * 1.1 + Math.cos(z * 0.03) * 0.8;
    }
    // Flatten immediate area around player's street
    const distOrigin = Math.hypot(x, z - 14);
    if (distOrigin < 22) {
      h *= Math.max(0, (distOrigin - 10) / 12);
    }
    return h;
  }

  _buildTerrainAndStreets() {
    const terrainGeo = new THREE.PlaneGeometry(640, 640, 72, 72);
    terrainGeo.rotateX(-Math.PI / 2);
    const pos = terrainGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color(0x4d7c2b);
    const cEarth = new THREE.Color(0x7c5836);
    const cHill = new THREE.Color(0x365314);
    const tmpC = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.getTerrainHeight(x, z);
      pos.setY(i, y);

      if (y > 10) {
        tmpC.copy(cHill).lerp(cGrass, Math.sin(x * 0.05) * 0.5 + 0.5);
      } else {
        const urbanMix = Math.min(1, Math.hypot(x, z + 30) / 140);
        tmpC.copy(cEarth).lerp(cGrass, urbanMix * 0.75 + 0.15);
      }
      colors[i * 3] = tmpC.r;
      colors[i * 3 + 1] = tmpC.g;
      colors[i * 3 + 2] = tmpC.b;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.0
    });
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.receiveShadow = true;
    this.scene.add(terrain);

    // Main asphalt streets crossing the neighborhood
    const streetMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.88
    });
    const street1 = new THREE.Mesh(new THREE.PlaneGeometry(240, 9.5), streetMat);
    street1.rotation.x = -Math.PI / 2;
    street1.position.set(0, 0.25, 2.5);
    street1.receiveShadow = true;
    this.scene.add(street1);

    const street2 = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 165), streetMat);
    street2.rotation.x = -Math.PI / 2;
    street2.position.set(-22, 0.28, -42);
    street2.receiveShadow = true;
    this.scene.add(street2);

    const street3 = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 165), streetMat);
    street3.rotation.x = -Math.PI / 2;
    street3.position.set(24, 0.28, -42);
    street3.receiveShadow = true;
    this.scene.add(street3);
  }

  _buildPlayerLaje() {
    // Player's 3-story house at (0, 0, 15) with detailed rooftop laje at Y = 9.6m
    const brick = createBrickTextures();
    const brickMat = new THREE.MeshStandardMaterial({
      map: brick.map.clone(),
      bumpMap: brick.bumpMap,
      bumpScale: 0.04,
      roughness: 0.86
    });
    brickMat.map.repeat.set(3, 3);
    brickMat.map.needsUpdate = true;

    const concrete = createConcreteTextures();
    const concreteMat = new THREE.MeshStandardMaterial({
      map: concrete.map.clone(),
      bumpMap: concrete.bumpMap,
      bumpScale: 0.03,
      roughness: 0.85
    });
    concreteMat.map.repeat.set(3, 3);
    concreteMat.map.needsUpdate = true;

    const lajeGroup = new THREE.Group();
    lajeGroup.position.set(0, 0, 15);
    this.scene.add(lajeGroup);

    // House main body up to Y=9.6
    const body = new THREE.Mesh(new THREE.BoxGeometry(10.8, 9.6, 8.8), brickMat);
    body.position.y = 4.8;
    body.castShadow = true;
    body.receiveShadow = true;
    lajeGroup.add(body);

    // Overhanging concrete slab ("laje batida")
    const slab = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.28, 9.4), concreteMat);
    slab.position.y = 9.6;
    slab.receiveShadow = true;
    slab.castShadow = true;
    lajeGroup.add(slab);

    // Brick parapet walls ("mureta da laje")
    const parapetTex = brick.map.clone();
    parapetTex.repeat.set(7.5, 1.15);
    parapetTex.needsUpdate = true;
    const parapetMat = new THREE.MeshStandardMaterial({
      map: parapetTex,
      bumpMap: brick.bumpMap,
      bumpScale: 0.035,
      roughness: 0.85
    });
    const wallH = 0.96;
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(11.2, wallH, 0.22), parapetMat);
    frontWall.position.set(0, 9.74 + wallH / 2, -4.55);
    frontWall.castShadow = true;
    frontWall.receiveShadow = true;
    lajeGroup.add(frontWall);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(11.2, wallH, 0.22), parapetMat);
    backWall.position.set(0, 9.74 + wallH / 2, 4.55);
    lajeGroup.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.22, wallH, 9.1), parapetMat);
    leftWall.position.set(-5.5, 9.74 + wallH / 2, 0);
    leftWall.castShadow = true;
    lajeGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.22, wallH, 9.1), parapetMat);
    rightWall.position.set(5.5, 9.74 + wallH / 2, 0);
    rightWall.castShadow = true;
    lajeGroup.add(rightWall);

    // Concrete coping cap along front wall
    const cap = new THREE.Mesh(new THREE.BoxGeometry(11.35, 0.08, 0.30), concreteMat);
    cap.position.set(0, 9.74 + wallH + 0.04, -4.55);
    lajeGroup.add(cap);

    // Iconic Brazilian laje corner concrete columns + exposed steel rebar ("ferragem de espera")
    const rebarMat = new THREE.MeshStandardMaterial({ color: 0x573b26, roughness: 0.7, metalness: 0.6 });
    [
      [-5.45, -4.5],
      [5.45, -4.5],
      [-5.45, 4.5],
      [5.45, 4.5]
    ].forEach(([cx, cz]) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.35, 0.32), concreteMat);
      col.position.set(cx, 9.74 + 0.67, cz);
      col.castShadow = true;
      lajeGroup.add(col);

      for (let rx = -1; rx <= 1; rx += 2) {
        for (let rz = -1; rz <= 1; rz += 2) {
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 5), rebarMat);
          bar.position.set(cx + rx * 0.08, 9.74 + 1.35 + 0.25, cz + rz * 0.08);
          lajeGroup.add(bar);
        }
      }
    });

    // Classic Blue 1000L Water Tank ("Caixa d'água azul") on back-left stand
    const stand = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.4, 2.1), concreteMat);
    stand.position.set(-3.8, 9.74 + 0.7, 2.8);
    stand.castShadow = true;
    lajeGroup.add(stand);

    const tankMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.38,
      metalness: 0.05
    });
    const tankBody = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.82, 1.15, 16), tankMat);
    tankBody.position.set(-3.8, 9.74 + 1.4 + 0.57, 2.8);
    tankBody.castShadow = true;
    lajeGroup.add(tankBody);

    const tankLid = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.0, 0.12, 16), tankMat);
    tankLid.position.set(-3.8, 9.74 + 1.4 + 1.18, 2.8);
    lajeGroup.add(tankLid);

    // Wind indicator pole & ribbon ("Biruta de fitinha na mureta") at front-left of player's view
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xc89248, roughness: 0.6 });
    const windPole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.65, 7), poleMat);
    windPole.position.set(-3.2, 9.74 + wallH + 0.8, -4.55);
    lajeGroup.add(windPole);

    this.windPoleTip = new THREE.Vector3(-3.2, 9.74 + wallH + 1.60, 15 - 4.55);
    const ribbonSegs = 10;
    this.windRibbonPos = new Float32Array(ribbonSegs * 3);
    for (let i = 0; i < ribbonSegs; i++) {
      this.windRibbonNodes.push(
        new THREE.Vector3(this.windPoleTip.x, this.windPoleTip.y, this.windPoleTip.z - i * 0.14)
      );
    }
    const wrGeo = new THREE.BufferGeometry();
    wrGeo.setAttribute('position', new THREE.BufferAttribute(this.windRibbonPos, 3));
    const wrMat = new THREE.LineBasicMaterial({ color: 0xfacc15 });
    this.windRibbonLine = new THREE.Line(wrGeo, wrMat);
    this.windRibbonLine.frustumCulled = false;
    this.scene.add(this.windRibbonLine);

    // Player Pipeiro avatar (shown when camera is in aerial chase mode)
    this.playerAvatar = this._createPipeiroCharacter(null, null, { player: true, pose: 'player' });
    this.playerAvatar.position.set(0, 9.74, 13.9);
    this.scene.add(this.playerAvatar);
    this._queueAraCharacter(this.playerAvatar, PLAYER_ARA_CHARACTER, {
      detail: 'high',
      targetHeight: 1.78,
      player: true
    });
  }

  _queueAraCharacter(avatar, profile, options = {}) {
    if (!avatar || !profile) return;
    avatar.userData.araLoading = true;
    avatar.userData.araReady = false;
    avatar.visible = false;
    this.araCharacterQueue.push({ avatar, profile, options });
    this._drainAraCharacterQueue();
  }

  _drainAraCharacterQueue() {
    while (this.araCharacterLoads < this.araCharacterConcurrency && this.araCharacterQueue.length) {
      const job = this.araCharacterQueue.shift();
      this.araCharacterLoads += 1;
      this._loadAraCharacter(job)
        .catch((error) => {
          job.avatar.userData.araLoading = false;
          job.avatar.userData.araFailed = true;
          job.avatar.visible = true;
          console.warn('[Vento & Laje] não foi possível carregar o modelo humano; mantendo o personagem reserva:', error);
        })
        .finally(() => {
          this.araCharacterLoads = Math.max(0, this.araCharacterLoads - 1);
          this._drainAraCharacterQueue();
        });
    }
  }

  async _loadAraCharacter({ avatar, profile, options }) {
    // Keep the main game bundle light; the human generator is downloaded only when the avatar is needed.
    const { createCharacter } = await import('ara3d');
    const character = await createCharacter(profile, {
      detail: options.detail || 'low',
      animations: ['idle', 'walk', 'run'],
      rootMotion: false
    });
    const human = character.scene;
    const bounds = new THREE.Box3().setFromObject(human);
    const measuredHeight = Math.max(0.1, bounds.getSize(new THREE.Vector3()).y || character.height || 1.75);
    const groupScale = Math.max(0.01, Math.abs(avatar.scale.y || 1));
    const targetHeight = options.targetHeight || 1.68;
    human.scale.setScalar(targetHeight / (measuredHeight * groupScale));
    const groundedBounds = new THREE.Box3().setFromObject(human);
    human.position.y -= groundedBounds.min.y;
    human.updateMatrixWorld(true);

    // Drop the primitive placeholder only after the real rigged human is ready.
    const geometries = new Set();
    const materials = new Set();
    for (const child of [...avatar.children]) {
      child.traverse((object) => {
        if (object.geometry && !geometries.has(object.geometry)) {
          geometries.add(object.geometry);
          object.geometry.dispose();
        }
        if (object.material) {
          const list = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of list) materials.add(material);
        }
      });
      avatar.remove(child);
    }
    for (const material of materials) material.dispose();

    human.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    avatar.add(human);
    const mixer = new THREE.AnimationMixer(human);
    const locomotion = character.locomotion(mixer);
    locomotion.speed = 0;
    avatar.userData.walkParts = null;
    avatar.userData.araHuman = { character, mixer, locomotion };
    avatar.userData.araLoading = false;
    avatar.userData.araReady = true;
    avatar.userData.araFailed = false;
    avatar.visible = true;
  }

  _createPipeiroCharacter(shirtHex = null, shortsHex = null, options = {}) {
    const pose = options.pose || (options.player ? 'player' : 'kite');
    const appearance = options.appearance || (options.player
      ? PLAYER_PIPEIRO_APPEARANCE
      : createNpcAppearance({
          usedSignatures: this.usedNpcAppearanceSignatures,
          preferredShirt: shirtHex,
          preferredShorts: shortsHex
        }));
    const look = {
      ...appearance,
      shirtColor: shirtHex ?? appearance.shirtColor,
      shortsColor: shortsHex ?? appearance.shortsColor
    };

    const g = new THREE.Group();
    const material = (color, roughness = 0.76, metalness = 0) => new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness
    });
    const skinMat = material(look.skinColor, 0.82);
    const shirtMat = material(look.shirtColor, 0.8);
    const shortsMat = material(look.shortsColor, 0.84);
    const pantsMat = material(look.pantsColor || look.shortsColor, 0.9);
    const hairMat = material(look.hairColor, 0.92);
    const shoeMat = material(look.shoeColor, 0.58);
    const soleMat = material(look.soleColor || 0xf1f5f9, 0.78);
    const darkMat = material(0x171717, 0.82);
    const detailMat = material(look.detailColor || 0xd1d5db, 0.5, 0.18);
    const metalMat = material(look.metalColor || 0xd1d5db, 0.28, 0.72);
    const whiteMat = material(0xf8fafc, 0.55);
    const irisMat = material(0x5b3823, 0.45);
    const mouthMat = material(0x592f2c, 0.9);
    const inkMat = material(look.tattooColor || 0x34303a, 0.95);
    const sphereGeo = new THREE.SphereGeometry(1, 20, 16);

    const mesh = (geometry, mat, parent = g, position = [0, 0, 0]) => {
      const item = new THREE.Mesh(geometry, mat);
      item.position.set(position[0], position[1], position[2]);
      item.castShadow = true;
      item.receiveShadow = true;
      parent.add(item);
      return item;
    };
    const ellipsoid = (parent, mat, position, scale) => {
      const item = mesh(sphereGeo, mat, parent, position);
      item.scale.set(scale[0], scale[1], scale[2]);
      return item;
    };
    const capsule = (parent, mat, radius, length, position) => {
      return mesh(new THREE.CapsuleGeometry(radius, length, 5, 12), mat, parent, position);
    };
    const box = (w, h, d, mat, parent, pos, rot = null) => {
      const item = mesh(new THREE.BoxGeometry(w, h, d), mat, parent, pos);
      if (rot) item.rotation.set(rot[0], rot[1], rot[2]);
      return item;
    };
    const tube = (parent, mat, points, radius = 0.005) => {
      const curve = new THREE.CatmullRomCurve3(points.map((point) =>
        new THREE.Vector3(point[0], point[1], point[2])
      ));
      return mesh(new THREE.TubeGeometry(curve, 12, radius, 6, false), mat, parent);
    };

    const bodyWidth = look.bodyType === 'stocky' ? 1.08 : look.bodyType === 'slim' ? 0.92 : 1;
    const oversized = look.shirtStyle === 'oversized';
    const isShorts = look.pantsStyle === 'cargoShorts' || look.pantsStyle === 'denimShorts';

    // Anatomical torso: a smooth lathed silhouette, wider at the chest and
    // shoulders, gently narrowing at the waist instead of a rectangular box.
    const torsoProfile = [
      new THREE.Vector2(0.105, -0.35),
      new THREE.Vector2(0.155, -0.34),
      new THREE.Vector2(0.18, -0.27),
      new THREE.Vector2(0.175, -0.16),
      new THREE.Vector2(0.18, -0.03),
      new THREE.Vector2(0.205, 0.08),
      new THREE.Vector2(0.245, 0.19),
      new THREE.Vector2(0.238, 0.265),
      new THREE.Vector2(0.19, 0.325),
      new THREE.Vector2(0.095, 0.35),
      new THREE.Vector2(0, 0.35)
    ];
    const torso = mesh(new THREE.LatheGeometry(torsoProfile, 32), shirtMat, g, [0, 1.12, 0]);
    torso.scale.set(bodyWidth * (oversized ? 1.055 : 1), oversized ? 1.04 : 0.98, 0.76);

    // A soft hem and shoulder contours blend the torso into the sleeves.
    const hem = mesh(new THREE.TorusGeometry(0.164 * bodyWidth, 0.014, 7, 28), shirtMat, g, [0, 0.79, 0]);
    hem.rotation.x = Math.PI / 2;
    hem.scale.z = 0.76;
    for (const side of [-1, 1]) {
      const shoulder = ellipsoid(g, shirtMat, [side * 0.225 * bodyWidth, 1.315, 0], [0.105, 0.105, 0.105]);
      shoulder.rotation.z = side * -0.1;
    }

    // Pelvis and waist follow the body instead of forming a square block.
    const pelvis = ellipsoid(g, isShorts ? shortsMat : pantsMat, [0, 0.755, 0], [0.225 * bodyWidth, 0.135, 0.165]);
    pelvis.rotation.z = 0;
    const waistBand = mesh(new THREE.TorusGeometry(0.19 * bodyWidth, 0.012, 6, 28), detailMat, g, [0, 0.855, 0]);
    waistBand.rotation.x = Math.PI / 2;
    waistBand.scale.z = 0.78;

    // Neck, jaw and softly sculpted head.
    capsule(g, skinMat, 0.064, 0.115, [0, 1.49, 0]);
    const head = ellipsoid(g, skinMat, [0, 1.665, 0], [0.151, look.ageGroup === 'older' ? 0.194 : 0.184, 0.137]);
    head.rotation.x = -0.025;
    ellipsoid(g, skinMat, [0, 1.555, -0.027], [0.119, 0.101, 0.12]);
    ellipsoid(g, skinMat, [0, 1.527, -0.072], [0.075, 0.052, 0.082]);

    // Ears, eyes, nose, lips and brows are built into the face.
    for (const side of [-1, 1]) {
      ellipsoid(g, skinMat, [side * 0.149, 1.66, -0.002], [0.034, 0.052, 0.031]);
      ellipsoid(g, skinMat, [side * 0.151, 1.658, -0.025], [0.014, 0.025, 0.012]);
      ellipsoid(g, darkMat, [side * 0.057, 1.688, -0.126], [0.027, 0.018, 0.012]);
      ellipsoid(g, whiteMat, [side * 0.057, 1.686, -0.137], [0.018, 0.0115, 0.009]);
      ellipsoid(g, irisMat, [side * 0.057, 1.686, -0.145], [0.0085, 0.009, 0.0045]);
      ellipsoid(g, darkMat, [side * 0.057, 1.686, -0.149], [0.0048, 0.006, 0.003]);
      ellipsoid(g, whiteMat, [side * 0.06 - 0.003, 1.69, -0.152], [0.0028, 0.0028, 0.0015]);
      tube(g, hairMat, [
        [side * 0.091, 1.716, -0.137],
        [side * 0.058, 1.724, -0.145],
        [side * 0.025, 1.716, -0.14]
      ], 0.006);
    }
    ellipsoid(g, skinMat, [0, 1.657, -0.151], [0.022, 0.046, 0.027]);
    ellipsoid(g, skinMat, [0, 1.625, -0.17], [0.032, 0.022, 0.026]);
    ellipsoid(g, skinMat, [-0.023, 1.624, -0.155], [0.017, 0.013, 0.015]);
    ellipsoid(g, skinMat, [0.023, 1.624, -0.155], [0.017, 0.013, 0.015]);
    tube(g, mouthMat, [
      [-0.031, 1.572, -0.172],
      [-0.015, 1.568, -0.178],
      [0, 1.567, -0.18],
      [0.015, 1.568, -0.178],
      [0.031, 1.572, -0.172]
    ], 0.0045);

    if (look.ageGroup === 'older') {
      const wrinkleMat = material(0x916b58, 0.95);
      for (const side of [-1, 1]) {
        tube(g, wrinkleMat, [
          [side * 0.08, 1.646, -0.139],
          [side * 0.11, 1.641, -0.126],
          [side * 0.125, 1.635, -0.116]
        ], 0.0025);
      }
    }

    // Hair cap follows the skull; curls and fades are individually sculpted.
    if (look.hairStyle === 'afro') {
      ellipsoid(g, hairMat, [0, 1.785, 0.006], [0.194, 0.156, 0.17]);
      const curls = [
        [-0.15,1.79,-0.035],[-0.11,1.88,-0.025],[-0.055,1.91,-0.015],
        [0.01,1.925,-0.012],[0.08,1.9,0],[0.145,1.84,0.015],
        [-0.13,1.84,0.09],[-0.065,1.9,0.11],[0.035,1.91,0.12],[0.12,1.86,0.105]
      ];
      curls.forEach((point) => ellipsoid(g, hairMat, point, [0.04, 0.041, 0.04]));
    } else if (look.hairStyle === 'cap') {
      ellipsoid(g, hairMat, [0, 1.765, 0.006], [0.158, 0.095, 0.145]);
      const capCrown = mesh(new THREE.SphereGeometry(0.16, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), hairMat, g, [0, 1.77, 0.005]);
      capCrown.scale.set(1, 0.88, 0.94);
      ellipsoid(g, hairMat, [0, 1.755, -0.142], [0.13, 0.018, 0.09]);
    } else if (look.hairStyle !== 'bald') {
      ellipsoid(g, hairMat, [0, 1.777, 0.01], [0.158, 0.115, 0.145]);
      if (look.hairStyle === 'curlyFade' || look.hairStyle === 'waves') {
        const curls = look.hairStyle === 'curlyFade'
          ? [[-0.12,1.81,-0.035],[-0.075,1.86,-0.045],[-0.02,1.875,-0.045],[0.04,1.87,-0.04],[0.095,1.84,-0.025],[0.135,1.80,0.005],[-0.08,1.86,0.07],[0.0,1.89,0.075],[0.085,1.86,0.075]]
          : [[-0.12,1.82,-0.025],[-0.06,1.85,-0.04],[0.01,1.865,-0.04],[0.08,1.85,-0.025],[0.13,1.82,0.02]];
        curls.forEach((point) => ellipsoid(g, hairMat, point, [0.034, 0.035, 0.034]));
      }
      if (look.hairStyle === 'buzz') {
        ellipsoid(g, hairMat, [0, 1.77, 0.01], [0.16, 0.08, 0.146]);
      }
      if (look.hairStyle === 'curlyFade') {
        // Clean low fade at both temples.
        for (const side of [-1, 1]) {
          ellipsoid(g, hairMat, [side * 0.132, 1.714, 0.012], [0.018, 0.047, 0.085]);
        }
      }
    }

    if (look.beardStyle && look.beardStyle !== 'none') {
      const beardColor = look.beardStyle === 'gray' ? 0x929292 : look.hairColor;
      const beardMat = material(beardColor, 0.95);
      ellipsoid(g, beardMat, [0, 1.55, -0.105], [0.092, 0.071, 0.045]);
      ellipsoid(g, beardMat, [0, 1.525, -0.08], [0.068, 0.05, 0.04]);
      for (const side of [-1, 1]) {
        ellipsoid(g, beardMat, [side * 0.085, 1.57, -0.075], [0.028, 0.045, 0.026]);
      }
    }

    if (look.accessory === 'glasses') {
      for (const side of [-1, 1]) {
        const lens = mesh(new THREE.TorusGeometry(0.037, 0.0045, 5, 16), darkMat, g, [side * 0.057, 1.685, -0.143]);
        lens.scale.y = 0.82;
      }
      tube(g, darkMat, [[-0.02,1.685,-0.145],[0,1.688,-0.15],[0.02,1.685,-0.145]], 0.004);
    }

    // Clothing folds and seams follow the rounded shirt surface.
    const seamMat = material(0x252525, 0.88);
    tube(g, seamMat, [[-0.16,0.99,-0.139],[0,0.975,-0.151],[0.16,0.99,-0.139]], 0.0028);
    if (look.shirtStyle === 'sports') {
      for (const side of [-1, 1]) {
        tube(g, detailMat, [[side * 0.17,1.35,-0.095],[side * 0.19,1.15,-0.13],[side * 0.17,0.96,-0.125]], 0.012);
      }
    } else if (look.shirtStyle === 'polo') {
      ellipsoid(g, detailMat, [0, 1.375, -0.16], [0.028, 0.065, 0.009]);
      box(0.012, 0.012, 0.006, metalMat, g, [0.012, 1.36, -0.174]);
    } else if (look.shirtStyle === 'hoodie') {
      ellipsoid(g, shirtMat, [0, 1.43, 0.075], [0.12, 0.11, 0.08]);
      tube(g, detailMat, [[-0.035,1.37,-0.158],[-0.03,1.18,-0.17],[-0.028,1.08,-0.16]], 0.0035);
      tube(g, detailMat, [[0.035,1.37,-0.158],[0.03,1.18,-0.17],[0.028,1.08,-0.16]], 0.0035);
    }

    // Cargo shorts and jeans are rounded around each thigh, never a cuboid.
    const legs = [];
    const arms = [];
    const calves = [];
    const sockMat = material(look.sockColor || 0x1f2937, 0.88);
    const pantMaterial = isShorts ? skinMat : pantsMat;
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.135, 0.735, 0);
      g.add(leg);

      capsule(leg, pantMaterial, 0.069, 0.22, [0, -0.145, 0]);
      ellipsoid(leg, pantMaterial, [0, -0.305, 0], [0.063, 0.067, 0.064]);

      if (isShorts) {
        const shortLeg = capsule(leg, shortsMat, 0.088, 0.12, [side * 0.004, -0.105, 0]);
        shortLeg.scale.set(1.02, 1.0, 1.05);
        if (look.pantsStyle === 'cargoShorts') {
          ellipsoid(leg, detailMat, [side * 0.075, -0.115, -0.052], [0.018, 0.064, 0.014]);
          ellipsoid(leg, shortsMat, [side * 0.075, -0.115, -0.065], [0.012, 0.044, 0.008]);
        }
        if (look.shortsPattern === 'urbanCamo') {
          const patchColors = [0x3f4142, 0x66686a, 0x17191b, 0x858585];
          patchColors.forEach((color, index) => {
            ellipsoid(leg, material(color, 0.95),
              [side * (0.02 + (index % 2) * 0.032), -0.08 - Math.floor(index / 2) * 0.065, -0.083],
              [0.034, 0.027, 0.006]);
          });
        }
      } else if (look.pantsStyle === 'trackPants') {
        tube(leg, detailMat, [[side * 0.045,-0.02,-0.052],[side * 0.045,-0.16,-0.058],[side * 0.045,-0.28,-0.05]], 0.007);
      }

      const calf = new THREE.Group();
      calf.position.set(0, -0.31, 0);
      leg.add(calf);
      capsule(calf, pantMaterial, 0.052, 0.18, [0, -0.15, 0]);
      ellipsoid(calf, pantMaterial, [0, -0.275, 0], [0.049, 0.048, 0.052]);
      capsule(calf, sockMat, 0.056, 0.08, [0, -0.247, 0]);
      if (look.sockStripe) {
        tube(calf, detailMat, [[-0.045,-0.23,-0.031],[0,-0.23,-0.055],[0.045,-0.23,-0.031]], 0.004);
      }

      // Soft sneaker upper, toe cap, midsole and curved outsole.
      ellipsoid(calf, soleMat, [0, -0.365, -0.055], [0.115, 0.035, 0.19]);
      ellipsoid(calf, shoeMat, [0, -0.333, -0.057], [0.108, 0.069, 0.176]);
      ellipsoid(calf, detailMat, [0, -0.325, -0.17], [0.074, 0.043, 0.057]);
      tube(calf, whiteMat, [[-0.062,-0.298,-0.095],[-0.032,-0.29,-0.12],[0,-0.292,-0.125],[0.032,-0.29,-0.12],[0.062,-0.298,-0.095]], 0.004);
      for (let lace = 0; lace < 3; lace++) {
        tube(calf, soleMat, [
          [-0.034,-0.277,-0.12 + lace * 0.026],
          [0,-0.27,-0.11 + lace * 0.026],
          [0.034,-0.277,-0.12 + lace * 0.026]
        ], 0.0025);
      }

      calves.push(calf);
      legs.push(leg);
    }

    // Articulated shoulder, upper arm, elbow, forearm and hand.
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.252 * bodyWidth, 1.325, 0);
      g.add(arm);
      ellipsoid(arm, shirtMat, [0, -0.045, 0], [0.085, 0.105, 0.095]);
      capsule(arm, shirtMat, 0.071, 0.16, [0, -0.16, 0]);
      ellipsoid(arm, skinMat, [0, -0.285, 0], [0.052, 0.057, 0.052]);
      capsule(arm, skinMat, 0.046, 0.21, [0, -0.43, -0.006]);
      ellipsoid(arm, skinMat, [0, -0.56, -0.018], [0.048, 0.064, 0.038]);
      ellipsoid(arm, skinMat, [side * 0.041, -0.545, -0.035], [0.026, 0.048, 0.027]);

      if (look.tattoo && side === -1) {
        tube(arm, inkMat, [[-0.032,-0.34,-0.043],[0.018,-0.38,-0.048],[-0.025,-0.425,-0.046]], 0.005);
        tube(arm, inkMat, [[0.03,-0.42,-0.04],[-0.012,-0.47,-0.046],[0.02,-0.51,-0.04]], 0.004);
      }
      arms.push(arm);
    }

    // Signature chain, pendant, earrings and watch sit on the body's surface.
    if (look.accessory === 'chainCross' || look.accessory === 'chain' || options.player) {
      const chain = mesh(new THREE.TorusGeometry(0.12, 0.007, 5, 28), metalMat, g, [0, 1.415, -0.11]);
      chain.rotation.x = Math.PI / 2;
      chain.scale.set(1, 0.78, 1);
      if (look.accessory === 'chainCross' || options.player) {
        box(0.018, 0.09, 0.012, metalMat, g, [0, 1.292, -0.166]);
        box(0.058, 0.016, 0.012, metalMat, g, [0, 1.315, -0.166]);
      }
    }
    if (look.earrings) {
      for (const side of [-1, 1]) {
        ellipsoid(g, metalMat, [side * 0.17, 1.63, -0.018], [0.012, 0.016, 0.01]);
      }
    }
    if (look.watch) {
      const watchArm = arms[1];
      const watch = mesh(new THREE.TorusGeometry(0.045, 0.01, 5, 14), metalMat, watchArm, [0, -0.51, -0.008]);
      watch.scale.set(0.9, 0.75, 1);
      ellipsoid(watchArm, darkMat, [0, -0.51, -0.012], [0.027, 0.017, 0.012]);
    }
    if (look.accessory === 'shoulderBag') {
      tube(g, darkMat, [[-0.19,1.4,-0.12],[-0.16,1.15,-0.18],[-0.12,0.9,-0.14]], 0.017);
      ellipsoid(g, darkMat, [0.15, 0.91, -0.145], [0.105, 0.13, 0.055]);
    }

    const height = look.heightScale || 1;
    g.scale.setScalar(height);
    g.userData.appearance = look;
    g.userData.walkParts = {
      leftLeg: legs[0],
      rightLeg: legs[1],
      leftCalf: calves[0],
      rightCalf: calves[1],
      leftArm: arms[0],
      rightArm: arms[1],
      armBaseLeft: pose === 'street' ? 0.02 : pose === 'player' ? 0.42 : 0.82,
      armBaseRight: pose === 'street' ? -0.02 : pose === 'player' ? 0.52 : 1.02
    };
    return g;
  }

  createPipeiroCharacter(shirtHex = 0x38bdf8, shortsHex = 0x1e293b) {
    return this._createPipeiroCharacter(shirtHex, shortsHex);
  }

  getPlayerSpawn() {
    if (this.mapId === 'laje') return new THREE.Vector3(0, 9.74, 13.9);
    if (this.mapId === 'casa') return new THREE.Vector3(-3.2, 0.02, 6.5);
    return new THREE.Vector3(0, this.getTerrainHeight(0, 10), 10);
  }

  setMap(mapId) {
    const valid = ['laje', 'praia', 'parque', 'campinho', 'morro', 'casa'];
    this.mapId = valid.includes(mapId) ? mapId : 'laje';
    const alwaysVisible = new Set([this.sky, this.hemiLight, this.bounceLight, this.sunLight, this.playerAvatar, this.rainPoints]);
    for (const child of this._baseMapChildren) {
      child.visible = this.mapId === 'laje' || alwaysVisible.has(child);
    }
    for (const [id, group] of Object.entries(this.mapGroups)) group.visible = id === this.mapId;

    if (this.mapId === 'laje') {
      this.rivalSpots = this._lajeRivalSpots.map((spot) => ({ name: spot.name, anchor: spot.anchor.clone() }));
    } else if (this.mapId === 'casa') {
      this.rivalSpots = [];
    } else {
      const anchorY = this.getTerrainHeight(0, 0) + 1.55;
      const positions = [[-24,-18],[24,-18],[-30,4],[30,4],[-18,24],[18,24]];
      this.rivalSpots = positions.map(([x,z], i) => ({
        name: ['Juninho','Biel','Rafa','Gui','Léo','Dudu'][i],
        anchor: new THREE.Vector3(x, anchorY, z)
      }));
    }
    this.playerSpawn = this.getPlayerSpawn();
    this.playerAvatar.position.copy(this.playerSpawn);
    this.playerAvatar.visible = true;
    return { spawn: this.playerSpawn.clone(), rivalSpots: this.rivalSpots };
  }

  _addAmbientWalker(parent, x, z, shirtHex, phase = 0, radius = 1.2, speed = 0.65, mapId = 'laje') {
    const avatar = this._createPipeiroCharacter(shirtHex, null, { pose: 'street' });
    avatar.scale.multiplyScalar(0.88);
    const grouped = parent !== this.scene;
    const baseY = grouped ? -0.16 : this.getTerrainHeight(x, z);
    avatar.position.set(x, baseY, z);
    if (grouped) parent.add(avatar);
    else this.scene.add(avatar);
    this.ambientPeople.push({ avatar, x, z, baseY, phase, radius, speed, mapId, grouped });
    const npcProfile = createNpcAraCharacter(this.araNpcSerial++);
    this._queueAraCharacter(avatar, npcProfile, {
      detail: 'low',
      targetHeight: 1.64
    });
  }

  _buildAlternativeMaps() {
    const mat = (color, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });
    const groundPlane = (group, color, size = 220) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat(color));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -0.18;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    const addTree = (group, x, z, scale = 1, foliage = 0x23804c) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.22*scale,.34*scale,3.4*scale,8), mat(0x76513a));
      trunk.position.set(x,1.7*scale,z); trunk.castShadow = true; group.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.35*scale,12,10), mat(foliage));
      crown.position.set(x,3.7*scale,z); crown.castShadow = true; group.add(crown);
      const crown2 = new THREE.Mesh(new THREE.SphereGeometry(.92*scale,10,8), mat(foliage));
      crown2.position.set(x+.72*scale,3.65*scale,z+.28*scale); group.add(crown2);
    };
    const addBench = (group, x, z) => {
      const wood = mat(0x8b5e34), metal = mat(0x334155,.55);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2,.12,.48), wood);
      seat.position.set(x,.62,z); group.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.2,.72,.12), wood);
      back.position.set(x,.98,z+.2); group.add(back);
      for (const dx of [-.82,.82]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(.12,.62,.12), metal);
        leg.position.set(x+dx,.31,z); group.add(leg);
      }
    };

    // Praia: areia, faixa de mar, coqueiros, quiosque e guarda-sóis.
    {
      const g = new THREE.Group();
      groundPlane(g, 0xe7c98e, 260);
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(260,82), mat(0x1386ad,.32));
      sea.rotation.x = -Math.PI/2; sea.position.set(0,-.10,-91); g.add(sea);
      const foamMat = new THREE.MeshBasicMaterial({ color: 0xb6eef2 });
      for (let i=0;i<12;i++) {
        const foam = new THREE.Mesh(new THREE.BoxGeometry(250,.025,.12), foamMat);
        foam.position.set(0,-.055,-55-i*5.6); foam.rotation.y = (i%2?-.025:.025); g.add(foam);
      }
      for (const [x,z] of [[-26,18],[-33,-8],[28,18],[35,-15],[-45,-32],[48,-35]]) addTree(g,x,z,1.35,0x26734b);
      const kiosk = new THREE.Group();
      const walls = new THREE.Mesh(new THREE.BoxGeometry(7,3.2,5),mat(0xf1e6d1)); walls.position.y=1.6; kiosk.add(walls);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(5.2,2.2,4),mat(0xb45309)); roof.position.y=4.2; roof.rotation.y=Math.PI/4; kiosk.add(roof);
      kiosk.position.set(-14,0,-6); g.add(kiosk);
      const umbrellaColors=[0xef4444,0x2563eb,0xfacc15,0x16a34a];
      for (let i=0;i<4;i++) {
        const x=-18+i*12, z=17+(i%2)*7;
        const pole=new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,2.3,8),mat(0x64748b)); pole.position.set(x,1.15,z); g.add(pole);
        const canopy=new THREE.Mesh(new THREE.ConeGeometry(2.1,.7,10),mat(umbrellaColors[i])); canopy.position.set(x,2.35,z); g.add(canopy);
      }
      this._addAmbientWalker(g, -7, 9, 0x0ea5e9, 0.4, 1.4, 0.7, 'praia');
      this._addAmbientWalker(g, 19, -2, 0xf97316, 2.1, 1.1, 0.58, 'praia');
      this.mapGroups.praia=g; this.scene.add(g);
    }

    // Parque: gramado, caminhos, bancos, árvores e fonte central.
    {
      const g = new THREE.Group(); groundPlane(g,0x4d8b4b,240);
      const pathMat=mat(0xc9b99b);
      const path1=new THREE.Mesh(new THREE.PlaneGeometry(13,220),pathMat); path1.rotation.x=-Math.PI/2; path1.position.y=-.06; g.add(path1);
      const path2=new THREE.Mesh(new THREE.PlaneGeometry(220,11),pathMat); path2.rotation.x=-Math.PI/2; path2.position.y=-.055; g.add(path2);
      for (let i=0;i<15;i++) {
        const x=-52+(i%5)*26, z=-48+Math.floor(i/5)*43;
        addTree(g,x,z,1.05+(i%3)*.12,[0x237548,0x32865a,0x4b8b43][i%3]);
      }
      for (const [x,z] of [[-15,13],[16,13],[-15,-18],[16,-18]]) addBench(g,x,z);
      const basin=new THREE.Mesh(new THREE.CylinderGeometry(4.1,4.4,.55,24),mat(0xb7c4c9)); basin.position.set(0,.12,-5); g.add(basin);
      const water=new THREE.Mesh(new THREE.CylinderGeometry(3.65,3.65,.08,24),mat(0x38bdf8,.25)); water.position.set(0,.43,-5); g.add(water);
      const jet=new THREE.Mesh(new THREE.CylinderGeometry(.08,.16,2.1,10),mat(0x93c5fd)); jet.position.set(0,1.5,-5); g.add(jet);
      this._addAmbientWalker(g, -11, 14, 0x22c55e, 1.0, 1.8, 0.62, 'parque');
      this._addAmbientWalker(g, 13, -15, 0xe879f9, 3.2, 1.5, 0.72, 'parque');
      this.mapGroups.parque=g; this.scene.add(g);
    }

    // Campinho: campo society com linhas, gols, arquibancada e refletores.
    {
      const g=new THREE.Group(); groundPlane(g,0x397b42,220);
      const field=new THREE.Mesh(new THREE.PlaneGeometry(74,46),mat(0x2e8b45)); field.rotation.x=-Math.PI/2; field.position.y=-.05; g.add(field);
      const lineMat=new THREE.MeshBasicMaterial({color:0xe5f5e7});
      const addLine=(w,d,x,z)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),lineMat);m.rotation.x=-Math.PI/2;m.position.set(x,.012,z);g.add(m);};
      addLine(74,.16,0,-23); addLine(74,.16,0,23); addLine(.16,46,-37,0); addLine(.16,46,37,0); addLine(.16,46,0,0);
      const circle=new THREE.Mesh(new THREE.TorusGeometry(6,.09,6,48),lineMat); circle.rotation.x=Math.PI/2; circle.position.y=.02; g.add(circle);
      const goalMat=mat(0xe2e8f0,.55);
      for(const x of [-1,1]) { const goal=new THREE.Group();
        for(const dx of [-1,1]) {const post=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,3.1,8),goalMat);post.position.set(dx*3.1,1.55,0);goal.add(post);}
        const bar=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,6.2,8),goalMat);bar.rotation.z=Math.PI/2;bar.position.y=3.1;goal.add(bar);goal.position.set(0,0,x*23);g.add(goal);
      }
      for(let i=0;i<4;i++){const stand=new THREE.Mesh(new THREE.BoxGeometry(30,.7,2.2),mat(i%2?0x2563eb:0xef4444));stand.position.set(0,.35,-38-i*2.5);g.add(stand);}
      for(const x of [-48,48]){const pole=new THREE.Mesh(new THREE.CylinderGeometry(.14,.2,12,8),mat(0x475569));pole.position.set(x,6,-20);g.add(pole);const lamp=new THREE.Mesh(new THREE.BoxGeometry(2,.35,.7),mat(0xfef3c7));lamp.position.set(x,12,-20);g.add(lamp);}
      this._addAmbientWalker(g, -42, 11, 0x38bdf8, 0.8, 1.7, 0.68, 'campinho');
      this._addAmbientWalker(g, 43, 9, 0xfacc15, 2.6, 1.4, 0.56, 'campinho');
      this.mapGroups.campinho=g; this.scene.add(g);
    }

    // Mirante do morro: terreno elevado, rochas, casas coloridas e vegetação.
    {
      const g=new THREE.Group(); groundPlane(g,0x8f9a69,240);
      const hillMat=mat(0x7c875d);
      for(const [x,z,s] of [[-32,-22,1],[30,-34,1.2],[-42,30,1.1],[42,28,.9]]){
        const mound=new THREE.Mesh(new THREE.SphereGeometry(24,18,12),hillMat);mound.scale.set(1,.34,.9);mound.position.set(x,1.2,z);g.add(mound);
      }
      const colors=[0xf59e0b,0x60a5fa,0xfca5a5,0x34d399,0xc084fc,0xf1f5f9];
      for(let i=0;i<12;i++){
        const x=-42+(i%4)*28, z=-36+Math.floor(i/4)*30;
        const h=4+(i%3)*1.2, house=new THREE.Mesh(new THREE.BoxGeometry(8,h,7),mat(colors[i%colors.length]));house.position.set(x,h/2,z);g.add(house);
        const roof=new THREE.Mesh(new THREE.ConeGeometry(6,2.5,4),mat(0x7f1d1d));roof.position.set(x,h+1,z);roof.rotation.y=Math.PI/4;g.add(roof);
      }
      for(let i=0;i<18;i++){const x=(i%6-2.5)*15,z=(Math.floor(i/6)-1)*26;addTree(g,x,z,.7+(i%3)*.1,0x3d7046);}
      this._addAmbientWalker(g, -18, 14, 0xf97316, 1.4, 1.6, 0.58, 'morro');
      this._addAmbientWalker(g, 24, -12, 0x60a5fa, 3.8, 1.3, 0.64, 'morro');
      this.mapGroups.morro=g; this.scene.add(g);
    }
    for (const group of Object.values(this.mapGroups)) group.visible = false;
  }

  _buildNeighborhood() {
    const roofClayTex = createCorrugatedRoofTexture(true);
    const roofZincTex = createCorrugatedRoofTexture(false);
    const brick = createBrickTextures();
    const concrete = createConcreteTextures();

    const roofClayMat = new THREE.MeshStandardMaterial({ map: roofClayTex, roughness: 0.78 });
    const roofZincMat = new THREE.MeshStandardMaterial({ map: roofZincTex, roughness: 0.55, metalness: 0.25 });
    const slabMat = new THREE.MeshStandardMaterial({ map: concrete.map, roughness: 0.88 });
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.25, metalness: 0.4 });

    const wallColors = [
      0xeab308, // Ochre yellow
      0xea580c, // Terracotta orange
      0x38bdf8, // Vila blue
      0x86efac, // Pastel green
      0xfda4af, // Faded coral
      0xf1f5f9, // Whitewash
      0xc26d48, // Raw brick tone
      0xfde047  // Warm sun yellow
    ];

    const wallMats = wallColors.map(
      (col, idx) =>
        new THREE.MeshStandardMaterial({
          color: col,
          map: idx === 6 ? brick.map : null,
          roughness: 0.86
        })
    );

    // Deterministic pseudo-random layout so neighborhood is balanced & streets stay clear
    let seed = 4219;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    // Define 6 curated rival pipeiro laje coordinates around the shared aerial arena
    const rivalCoords = [
      { x: -15, z: 12, stories: 3, name: 'Juninho da Laje', shirt: 0x22c55e },
      { x: 15, z: 12, stories: 3, name: 'Bia Veloster', shirt: 0xec4899 },
      { x: -33, z: -8, stories: 2, name: 'Zé do Latão', shirt: 0xfacc15 },
      { x: 34, z: -9, stories: 2, name: 'Kauã da Vila', shirt: 0x06b6d4 },
      { x: -13, z: -15, stories: 2, name: 'Mestre Tonhão', shirt: 0xf97316 },
      { x: 14, z: -16, stories: 2, name: 'Dudu Raia', shirt: 0xa855f7 }
    ];

    const addHouse = (hx, hz, w, d, stories, hasFlatLaje, rivalInfo = null) => {
      const groundY = this.getTerrainHeight(hx, hz);
      const h = stories * 3.1;
      const mat = wallMats[Math.floor(rand() * wallMats.length)];

      const house = new THREE.Group();
      house.position.set(hx, groundY, hz);

      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      box.position.y = h / 2;
      box.castShadow = true;
      box.receiveShadow = true;
      house.add(box);

      // Front windows
      const winGeo = new THREE.PlaneGeometry(1.1, 0.95);
      for (let s = 0; s < stories; s++) {
        const wy = s * 3.1 + 1.75;
        const w1 = new THREE.Mesh(winGeo, windowMat);
        w1.position.set(-w * 0.24, wy, d / 2 + 0.02);
        const w2 = new THREE.Mesh(winGeo, windowMat);
        w2.position.set(w * 0.24, wy, d / 2 + 0.02);
        house.add(w1, w2);
      }

      if (hasFlatLaje) {
        const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.22, d + 0.4), slabMat);
        roofSlab.position.y = h + 0.11;
        roofSlab.receiveShadow = true;
        house.add(roofSlab);

        // Low parapet
        const pWall = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.75, 0.18), mat);
        pWall.position.set(0, h + 0.55, -d / 2);
        house.add(pWall);

        // Water tank
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.6, 0.85, 10), tankMat);
        tank.position.set(-w * 0.28, h + 0.62, d * 0.25);
        house.add(tank);

        if (rivalInfo) {
          const pipeiro = this._createPipeiroCharacter(rivalInfo.shirt, 0x0f172a);
          pipeiro.position.set(0, h + 0.22, -0.4);
          house.add(pipeiro);
          this._queueAraCharacter(pipeiro, createNpcAraCharacter(this.araNpcSerial++), {
            detail: 'low',
            targetHeight: 1.68
          });

          this.rivalSpots.push({
            name: rivalInfo.name,
            anchor: new THREE.Vector3(hx, groundY + h + 1.55, hz - 0.55)
          });
        }
      } else {
        // Sloped corrugated or clay roof
        const rMat = rand() > 0.45 ? roofClayMat : roofZincMat;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.16, d + 0.8), rMat);
        roof.position.y = h + 0.42;
        roof.rotation.x = 0.14;
        roof.castShadow = true;
        roof.receiveShadow = true;
        house.add(roof);
      }

      this.scene.add(house);
    };

    // Spawn the 6 rival pipeiro houses first
    rivalCoords.forEach((rc) => {
      addHouse(rc.x, rc.z, 7.8, 7.2, rc.stories, true, rc);
    });

    // Populate surrounding neighborhood blocks avoiding streets & rival footprints
    const gridX = [-68, -52, -36, -13, 0, 13, 36, 52, 68];
    const gridZ = [15, -12, -26, -40, -56, -74, -92];

    for (const gx of gridX) {
      for (const gz of gridZ) {
        // Skip player house slot
        if (Math.abs(gx) < 8 && Math.abs(gz - 15) < 8) continue;
        // Skip streets
        if (Math.abs(gx + 22) < 6 || Math.abs(gx - 24) < 6 || Math.abs(gz - 2.5) < 6) continue;
        // Skip existing rival houses
        const nearRival = rivalCoords.some((r) => Math.hypot(r.x - gx, r.z - gz) < 9.5);
        if (nearRival) continue;

        const jx = gx + (rand() - 0.5) * 3.2;
        const jz = gz + (rand() - 0.5) * 3.2;
        const stories = gz < -50 ? (rand() > 0.5 ? 2 : 1) : (rand() > 0.35 ? 2 : 1);
        const w = 6.4 + rand() * 2.8;
        const d = 6.2 + rand() * 2.6;
        addHouse(jx, jz, w, d, stories, rand() > 0.48, null);
      }
    }

    // Add Concrete Street Poles ("Postes da rua") & Tropical/Ipê Trees
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 });
    const poleGeo = new THREE.CylinderGeometry(0.11, 0.16, 7.6, 8);
    for (let px = -75; px <= 75; px += 25) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      const py = this.getTerrainHeight(px, -1.8);
      pole.position.set(px, py + 3.8, -1.8);
      pole.castShadow = true;
      this.scene.add(pole);

      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), poleMat);
      crossbar.position.set(0, 3.5, 0);
      pole.add(crossbar);
    }

    // Lush Brazilian Trees (Green + Golden Ipê Amarelo + Purple Quaresmeira)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const foliageColors = [0x2d6a4f, 0x40916c, 0xeab308, 0xa855f7];
    const foliageMats = foliageColors.map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })
    );

    for (let i = 0; i < 38; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = 26 + rand() * 115;
      const tx = Math.cos(angle) * radius;
      const tz = -35 + Math.sin(angle) * radius * 0.8;
      if (Math.abs(tx + 22) < 5.5 || Math.abs(tx - 24) < 5.5 || Math.abs(tz - 2.5) < 5.5) continue;
      if (Math.hypot(tx, tz - 15) < 16) continue;

      const nearHouse = rivalCoords.some((r) => Math.hypot(r.x - tx, r.z - tz) < 7);
      if (nearHouse) continue;

      const ty = this.getTerrainHeight(tx, tz);
      const tree = new THREE.Group();
      tree.position.set(tx, ty, tz);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 3.4, 7), trunkMat);
      trunk.position.y = 1.7;
      tree.add(trunk);

      const fMat = foliageMats[i % 7 === 0 ? 2 : i % 11 === 0 ? 3 : i % 2];
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.9 + rand() * 1.1, 1), fMat);
      crown.position.y = 3.8 + rand() * 0.6;
      crown.scale.y = 0.78;
      crown.castShadow = true;
      tree.add(crown);

      this.scene.add(tree);
      this.swayingTrees.push({ crown, phase: rand() * 10 });
    }

    // Moradores circulam pela rua e deixam a vizinhança menos estática.
    const streetPeople = [
      [-17, 4, 0x22c55e], [19, 6, 0xf97316], [-40, -25, 0x38bdf8],
      [39, -31, 0xe879f9], [2, -45, 0xfacc15], [-21, -24, 0x0f766e],
      [24, -34, 0xf8fafc], [-21, -57, 0x7c3aed], [24, -68, 0xdc2626],
      [-21, -84, 0x0e7490], [24, -96, 0x854d0e], [7, -12, 0x475569]
    ];
    streetPeople.forEach(([x, z, shirt], index) => {
      this._addAmbientWalker(
        this.scene, x, z, shirt,
        index * 1.17,
        1.05 + (index % 3) * 0.28,
        0.42 + (index % 4) * 0.075,
        'laje'
      );
    });

    const makeCar = (paintHex, startX, speed, roadZ) => {
      const group = new THREE.Group();
      const paint = new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.56, metalness: 0.12 });
      const glass = new THREE.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.25, metalness: 0.22 });
      const tire = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.95 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.72, 1.55), paint); body.position.y = 0.7; group.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.72, 1.32), glass); cabin.position.set(-0.15, 1.34, 0); group.add(cabin);
      for (const x of [-1.1, 1.1]) for (const zSide of [-0.78, 0.78]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.18, 12), tire);
        wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.36, zSide); group.add(wheel);
      }
      group.position.set(startX, this.getTerrainHeight(startX, roadZ) + 0.02, roadZ); this.scene.add(group);
      this.ambientVehicles.push({ group, speed, roadZ });
    };
    makeCar(0xef4444, -58, 5.2, 2.5);
    makeCar(0x2563eb, 42, -4.4, -4.8);

    const makeDog = (x, z, coatHex, phase) => {
      const group = new THREE.Group();
      const coat = new THREE.MeshStandardMaterial({ color: coatHex, roughness: 0.92 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.9 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.42, 0.34), coat); body.position.y = 0.47; group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), coat); head.position.set(0.48, 0.64, 0); group.add(head);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.38, 6), coat); tail.position.set(-0.52, 0.68, 0); tail.rotation.z = -0.8; group.add(tail);
      const legs = [];
      for (const xLeg of [-0.28, 0.28]) for (const zLeg of [-0.12, 0.12]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.34, 6), dark); leg.position.set(xLeg, 0.22, zLeg); group.add(leg); legs.push(leg);
      }
      group.position.set(x, this.getTerrainHeight(x, z), z); this.scene.add(group);
      this.ambientDogs.push({ group, x, z, phase, legs });
    };
    makeDog(-26, 7.5, 0xd6b48a, 0.2);
    makeDog(34, -18, 0x8b7355, 1.7);
  }

  _buildCloudsAndBirds() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xe2e8f0,
      emissiveIntensity: 0.22,
      roughness: 0.95,
      transparent: true,
      opacity: 0.9
    });
    this.cloudMaterial = cloudMat;
    const puffGeo = new THREE.DodecahedronGeometry(1, 2);

    for (let i = 0; i < 18; i++) {
      const cloud = new THREE.Group();
      const puffs = 4 + (i % 4);
      for (let p = 0; p < puffs; p++) {
        const m = new THREE.Mesh(puffGeo, cloudMat);
        const sx = 8 + Math.random() * 10;
        const sy = 4 + Math.random() * 4.5;
        const sz = 7 + Math.random() * 8;
        m.scale.set(sx, sy, sz);
        m.position.set((p - puffs / 2) * 7.5, Math.random() * 2.5, (Math.random() - 0.5) * 6);
        cloud.add(m);
      }
      cloud.position.set(
        (Math.random() - 0.5) * 440,
        105 + Math.random() * 65,
        -40 - Math.random() * 320
      );
      this.scene.add(cloud);
      this.clouds.push({ group: cloud, speedFactor: 0.35 + Math.random() * 0.35 });
    }

    // Circling tropical swallows / hawks ("andorinhas / carcarás")
    const birdGeo = new THREE.BufferGeometry();
    const bVerts = new Float32Array([
      0, 0, 0.25, -0.55, 0.08, -0.1, 0, 0, -0.15,
      0, 0, 0.25, 0, 0, -0.15, 0.55, 0.08, -0.1
    ]);
    birdGeo.setAttribute('position', new THREE.BufferAttribute(bVerts, 3));
    birdGeo.computeVertexNormals();
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x1e293b, side: THREE.DoubleSide });

    for (let i = 0; i < 10; i++) {
      const bird = new THREE.Mesh(birdGeo, birdMat);
      this.scene.add(bird);
      this.birds.push({
        mesh: bird,
        cx: (Math.random() - 0.5) * 90,
        cy: 48 + Math.random() * 42,
        cz: -35 - Math.random() * 85,
        radius: 14 + Math.random() * 18,
        angle: Math.random() * Math.PI * 2,
        speed: 0.32 + Math.random() * 0.25
      });
    }
    const rainCount = 420;
    this.rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * 150;
      this.rainPositions[i * 3 + 1] = Math.random() * 65;
      this.rainPositions[i * 3 + 2] = -50 + (Math.random() - 0.5) * 150;
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    const rainMaterial = new THREE.PointsMaterial({ color: 0xcbd5e1, size: 0.075, transparent: true, opacity: 0.72, depthWrite: false });
    this.rainPoints = new THREE.Points(rainGeometry, rainMaterial);
    this.rainPoints.visible = false;
    this.scene.add(this.rainPoints);
  }

  _buildHomeInterior() {
    const group = new THREE.Group();
    const wall = new THREE.MeshStandardMaterial({ color: 0xe7d8bd, roughness: 0.94 });
    const floor = new THREE.MeshStandardMaterial({ color: 0x8b8174, roughness: 0.96 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x765037, roughness: 0.88 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x402b20, roughness: 0.9 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.45, roughness: 0.6 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.8 });
    const tile = new THREE.Mesh(new THREE.BoxGeometry(28, 0.22, 20), floor); tile.position.y = -0.12; group.add(tile);
    const addWall = (width, height, depth, x, y, z) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wall); mesh.position.set(x, y, z); mesh.castShadow = true; group.add(mesh); };
    addWall(28, 3.5, 0.35, 0, 1.65, -10); addWall(0.35, 3.5, 20, -14, 1.65, 0); addWall(0.35, 3.5, 20, 14, 1.65, 0);
    addWall(9, 3.5, 0.35, -9.5, 1.65, 10); addWall(9, 3.5, 0.35, 9.5, 1.65, 10); addWall(0.2, 3.5, 11, 2, 1.65, -4.5);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.92, 1.2), wood); counter.position.set(-8.2, 0.46, -7.9); group.add(counter);
    const table = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.18, 1.8), wood); table.position.set(-7, 0.95, -1.8); group.add(table);
    for (const x of [-8.3, -5.7]) for (const z of [-2.4, -1.2]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.88, 0.14), darkWood); leg.position.set(x, 0.48, z); group.add(leg); }
    const sofa = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.8, 1.45), blue); sofa.position.set(7.7, 0.55, 4.7); group.add(sofa);
    const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.1, 0.35), blue); sofaBack.position.set(7.7, 1.15, 5.3); group.add(sofaBack);
    const tv = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.45, 0.18), metal); tv.position.set(7.6, 1.7, -8.8); group.add(tv);
    const tvStand = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.65, 0.8), darkWood); tvStand.position.set(7.6, 0.38, -8.4); group.add(tvStand);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.22, 1.25), wood); bench.position.set(-7.8, 1.1, 5.1); group.add(bench);
    for (const x of [-10.2, -5.4]) for (const z of [4.7, 5.5]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.15, 0.16), metal); leg.position.set(x, 0.55, z); group.add(leg); }
    const shelf = new THREE.Group();
    for (const y of [1.0, 2.05, 3.1]) { const plank = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.13, 0.5), wood); plank.position.y = y; shelf.add(plank); }
    shelf.position.set(-11.8, 0, -4.2); group.add(shelf);
    for (let i = 0; i < 4; i++) { const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.42, 12), metal); spool.rotation.z = Math.PI / 2; spool.position.set(-9.7 + i * 0.68, 1.42, 4.7); group.add(spool); }
    this.homeDecorationGroup = new THREE.Group(); group.add(this.homeDecorationGroup);
    this.homeBaseMaterials = { wood, metal };
    group.visible = false; this.mapGroups.casa = group; this.scene.add(group);
  }

  setHomeDecorations(ids = []) {
    if (!this.homeDecorationGroup) return;
    this.homeDecorationGroup.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material && material !== this.homeBaseMaterials.wood && material !== this.homeBaseMaterials.metal) {
          material.dispose();
        }
      }
    });
    this.homeDecorationGroup.clear();
    const add = (geometry, material, x, y, z, rotation = 0) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.rotation.y = rotation; mesh.castShadow = true; this.homeDecorationGroup.add(mesh); };
    if (ids.includes('bandeirolas')) [0xef4444, 0xfacc15, 0x22c55e, 0x3b82f6, 0xa855f7].forEach((color, i) => add(new THREE.ConeGeometry(0.34, 0.72, 3), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }), -5.4 + i * 1.1, 3.05 - Math.abs(i - 2) * 0.08, -9.45, Math.PI));
    if (ids.includes('trofeu_copa')) { add(new THREE.CylinderGeometry(0.18, 0.22, 0.22, 12), this.homeBaseMaterials.metal, -7.8, 1.34, 5.1); add(new THREE.CylinderGeometry(0.25, 0.12, 0.62, 12), new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.72, roughness: 0.25 }), -7.8, 1.73, 5.1); }
    if (ids.includes('prateleira')) [0x38bdf8, 0xef4444, 0x22c55e].forEach((color, i) => add(new THREE.ConeGeometry(0.42, 1.0, 3), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }), -11.8, 1.45 + i * 0.85, -4.18, Math.PI));
    if (ids.includes('placa_lenda')) add(new THREE.BoxGeometry(3.2, 0.8, 0.12), this.homeBaseMaterials.wood, 8.2, 2.35, -9.72);
  }

  update(windVec, time, dt, showPlayerAvatar = false) {
    if (this.playerAvatar) {
      this.playerAvatar.visible = showPlayerAvatar && (this.playerAvatar.userData.araReady || this.playerAvatar.userData.araFailed);
      const human = this.playerAvatar.userData.araHuman;
      if (human) {
        human.locomotion.speed = this.playerMoveSpeed > 6 ? 3.4 : this.playerMoveSpeed > 0 ? 1.55 : 0;
        human.mixer.update(dt);
        human.character.update(dt);
      }
    }
    this._updateDynamicDayCycle(dt);

    // Drift clouds with wind; overcast weather moves them more slowly.
    const cloudDrift = this.currentPreset.cloudDrift ?? 1;
    for (const c of this.clouds) {
      c.group.position.x += windVec.x * c.speedFactor * cloudDrift * dt;
      c.group.position.z += windVec.z * c.speedFactor * cloudDrift * dt;
      if (c.group.position.z < -390) c.group.position.z = 90;
      if (c.group.position.z > 100) c.group.position.z = -380;
      if (c.group.position.x < -250) c.group.position.x = 250;
      if (c.group.position.x > 250) c.group.position.x = -250;
    }

    // Animate circling birds
    for (const b of this.birds) {
      b.angle += b.speed * dt;
      const nx = b.cx + Math.cos(b.angle) * b.radius;
      const nz = b.cz + Math.sin(b.angle) * b.radius;
      const ny = b.cy + Math.sin(b.angle * 2 + time) * 1.5;
      b.mesh.position.set(nx, ny, nz);
      b.mesh.rotation.y = -b.angle;
      b.mesh.rotation.z = 0.28 + Math.sin(time * 6 + b.angle) * 0.14;
    }

    // Subtle tree sway with wind gusts
    const windMag = windVec.length();
    for (const t of this.swayingTrees) {
      t.crown.rotation.z = Math.sin(time * 2.2 + t.phase) * 0.03 * (windMag / 9);
      t.crown.rotation.x = -0.025 * (windMag / 9);
    }

    for (const vehicle of this.ambientVehicles) {
      vehicle.group.position.x += vehicle.speed * dt;
      if (vehicle.group.position.x > 90) vehicle.group.position.x = -90;
      if (vehicle.group.position.x < -90) vehicle.group.position.x = 90;
      vehicle.group.position.y = this.getTerrainHeight(vehicle.group.position.x, vehicle.roadZ) + 0.02;
    }
    for (const dog of this.ambientDogs) {
      const phase = time * 0.62 + dog.phase;
      dog.group.position.x = dog.x + Math.sin(phase) * 2.4;
      dog.group.position.z = dog.z + Math.cos(phase * 0.7) * 1.2;
      dog.group.rotation.y = Math.cos(phase) > 0 ? 0 : Math.PI;
      dog.group.position.y = this.getTerrainHeight(dog.group.position.x, dog.group.position.z);
      dog.legs.forEach((leg, index) => { leg.rotation.x = Math.sin(phase * 5 + (index % 2) * Math.PI) * 0.26; });
    }

    // Animate the neighborhood residents with a restrained walking cycle.
    for (const person of this.ambientPeople) {
      const phase = time * person.speed + person.phase;
      const stride = Math.sin(phase * 3.2);
      person.avatar.position.x = person.x + Math.sin(phase) * person.radius;
      person.avatar.position.y = person.baseY + Math.abs(stride) * 0.025;
      person.avatar.position.z = person.z + Math.cos(phase * 0.72) * person.radius * 0.34;
      person.avatar.rotation.y = Math.atan2(Math.cos(phase) * person.radius, -Math.sin(phase * 0.72) * person.radius * 0.34);
      const human = person.avatar.userData.araHuman;
      if (human) {
        const speedX = Math.cos(phase) * person.speed * person.radius;
        const speedZ = -Math.sin(phase * 0.72) * person.speed * person.radius * 0.72 * 0.34;
        human.locomotion.speed = Math.min(1.65, Math.max(0.55, Math.hypot(speedX, speedZ) * 1.8));
        human.mixer.update(dt);
        human.character.update(dt);
      } else {
        const parts = person.avatar.userData.walkParts;
        if (parts) {
          parts.leftLeg.rotation.x = stride * 0.3;
          parts.rightLeg.rotation.x = -stride * 0.3;
          if (parts.leftCalf) parts.leftCalf.rotation.x = Math.max(0, -stride) * 0.34;
          if (parts.rightCalf) parts.rightCalf.rotation.x = Math.max(0, stride) * 0.34;
          parts.leftArm.rotation.x = (parts.armBaseLeft ?? 0) - stride * 0.15;
          parts.rightArm.rotation.x = (parts.armBaseRight ?? 0) + stride * 0.15;
        }
      }
    }

    // Update rooftop wind streamer ("biruta de fitinha")
    const dir = _wDir.copy(windVec).normalize();
    for (let i = 0; i < this.windRibbonNodes.length; i++) {
      const f = i * 0.14;
      const flutter = Math.sin(time * 16 - i * 0.8) * 0.04 * (i / 10);
      this.windRibbonPos[i * 3] = this.windPoleTip.x + dir.x * f + flutter;
      this.windRibbonPos[i * 3 + 1] = this.windPoleTip.y + dir.y * f - (i * 0.022) / Math.max(0.5, windMag / 8);
      this.windRibbonPos[i * 3 + 2] = this.windPoleTip.z + dir.z * f;
    }
    this.windRibbonLine.geometry.attributes.position.needsUpdate = true;
    if (this.rainPoints?.visible && this.rainPositions) {
      const rain = this.rainPoints.geometry.attributes.position;
      for (let i = 0; i < this.rainPositions.length; i += 3) {
        this.rainPositions[i] += windVec.x * dt * 0.42;
        this.rainPositions[i + 1] -= 33 * dt;
        this.rainPositions[i + 2] += windVec.z * dt * 0.2;
        if (this.rainPositions[i + 1] < 0) {
          this.rainPositions[i + 1] = 48 + Math.random() * 30;
          this.rainPositions[i] = (Math.random() - 0.5) * 150;
          this.rainPositions[i + 2] = -50 + (Math.random() - 0.5) * 150;
        }
      }
      rain.needsUpdate = true;
    }
  }
}

const _wDir = new THREE.Vector3();
const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _colorC = new THREE.Color();
