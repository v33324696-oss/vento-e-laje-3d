import * as THREE from 'three';
import {
  createBrickTextures,
  createConcreteTextures,
  createCorrugatedRoofTexture
} from './textures.js';

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
    this.ambientPeople = [];
    this.ambientVehicles = [];
    this.ambientDogs = [];
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
    this.playerAvatar = this._createPipeiroCharacter(0xef4444, 0x1e293b);
    this.playerAvatar.position.set(0, 9.74, 13.9);
    this.scene.add(this.playerAvatar);
  }

  _createPipeiroCharacter(shirtHex = 0xfacc15, shortsHex = 0x1e3a8a) {
    const g = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xb47b56, roughness: 0.7 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.75 });
    const shortsMat = new THREE.MeshStandardMaterial({ color: shortsHex, roughness: 0.8 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 });

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.78, 8);
    const leftLeg = new THREE.Mesh(legGeo, shortsMat);
    leftLeg.position.set(-0.13, 0.39, 0);
    const rightLeg = new THREE.Mesh(legGeo, shortsMat);
    rightLeg.position.set(0.13, 0.39, 0);
    g.add(leftLeg, rightLeg);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.24), shirtMat);
    torso.position.set(0, 1.08, 0);
    torso.castShadow = true;
    g.add(torso);

    // Head + Cap tilted up looking at the sky
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skinMat);
    head.position.set(0, 1.54, 0);
    g.add(head);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.1, 12), capMat);
    cap.position.set(0, 1.61, 0);
    g.add(cap);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.18), capMat);
    visor.position.set(0, 1.59, -0.14);
    g.add(visor);

    // Raised arms holding line/carretilha
    const armGeo = new THREE.CylinderGeometry(0.055, 0.05, 0.56, 7);
    const leftArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.set(-0.26, 1.25, -0.18);
    leftArm.rotation.set(0.85, 0, -0.2);
    const rightArm = new THREE.Mesh(armGeo, skinMat);
    rightArm.position.set(0.26, 1.32, -0.22);
    rightArm.rotation.set(1.05, 0, 0.22);
    g.add(leftArm, rightArm);
    g.userData.walkParts = { leftLeg, rightLeg, leftArm, rightArm };

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
    const avatar = this._createPipeiroCharacter(shirtHex, 0x1e293b);
    avatar.scale.setScalar(0.86);
    const grouped = parent !== this.scene;
    const baseY = grouped ? -0.16 : this.getTerrainHeight(x, z);
    avatar.position.set(x, baseY, z);
    if (grouped) parent.add(avatar);
    else this.scene.add(avatar);
    this.ambientPeople.push({ avatar, x, z, baseY, phase, radius, speed, mapId, grouped });
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
      [39, -31, 0xe879f9], [2, -45, 0xfacc15]
    ];
    streetPeople.forEach(([x, z, shirt], index) => {
      this._addAmbientWalker(this.scene, x, z, shirt, index * 1.17, 1.15 + (index % 2) * 0.45, 0.48 + (index % 3) * 0.09, 'laje');
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
      this.playerAvatar.visible = showPlayerAvatar;
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
      const parts = person.avatar.userData.walkParts;
      if (parts) {
        parts.leftLeg.rotation.x = stride * 0.3;
        parts.rightLeg.rotation.x = -stride * 0.3;
        parts.leftArm.rotation.x = 0.85 - stride * 0.08;
        parts.rightArm.rotation.x = 1.05 + stride * 0.08;
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
