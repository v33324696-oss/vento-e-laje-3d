import * as THREE from 'three';
import { SoundEngine } from './audio.js';
import { KITE_PATTERNS } from './textures.js';
import { KITE_MODELS, KiteVisual } from './kiteMesh.js';
import { MultiplayerClient } from './multiplayer.js';
import { Carretilha3D, LINE_TYPES } from './carretilha.js';
import { GameWorld, WEATHER_PRESETS } from './world.js';
import {
  KiteEntity,
  DriftingKite,
  SkyEffectsManager,
  closestPointsBetweenSegments,
  STRING_SEGMENTS
} from './physics.js';
import { RivalAIController } from './ai.js';
import { evaluateReloScore } from './relo.js';
import { ProgressionStore } from './progression.js';
import { getAIDifficulty, getCombatDamageMultipliers } from './difficulty.js';
import { findRabiolaCapture } from './capture.js';
import {
  createRabiolaLockState,
  getRabiolaLockReading,
  attemptRabiolaLock
} from './lockpick.js';

class Pipa3DGame {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.sound = new SoundEngine();
    this.progression = new ProgressionStore();

    // Game state
    this.started = false;
    this.gameMode = 'festival'; // 'festival' | 'torneio' | 'zen'
    this.matchDifficulty = 'normal';
    this.weatherOrder = ['tarde', 'pordosol', 'ventania'];
    this.weatherIdx = 0;

    this.cameraModes = [
      { id: 'laje', label: 'Câm: Laje' },
      { id: 'aerea', label: 'Câm: Aérea' },
      { id: 'duelo', label: 'Câm: Duelo' },
      { id: 'personagem', label: 'Câm: Pipeiro' },
      { id: 'primeira_pessoa', label: 'Câm: 1ª pessoa' }
    ];
    this.camModeIdx = 0;

    // Player customization
    this.playerConfig = {
      modelId: 'murcha',
      patternId: 'estrela_paulista',
      lineTypeId: 'rosa_chilena',
      tailStyle: 'padrao'
    };

    // Score & tournament progression
    this.score = 0;
    this.cuts = 0;
    this.catches = 0;
    this.combo = 1;
    this.tournamentWave = 1;

    // Input state
    this.keys = {};
    this.padSteer = 0;
    this.touchMove = new Set();
    this.touchSprint = false;
    this.uiHold = { pull: false, release: false, quickRelease: false };
    this.pointer = {
      down: false,
      rightDown: false,
      downTime: 0,
      startX: 0,
      currX: 0
    };
    this.characterMode = false;
    this.playerLaunched = false;
    this.playerKiteInHand = false;
    this.characterMoveSpeed = 0;
    this.selectedMap = 'laje';
    this.remotePlayers = new Map();
    this.lastNetSendMs = 0;
    this.onlineRoomCode = null;

    // Wind state
    this.windVec = new THREE.Vector3(0, 0.4, -9.5);
    this.zenWindOverride = 10.0;

    // Active entities
    this.rivals = [];
    this.driftingKites = [];
    this.bannerTimeout = null;
    this.lastCutTargetPos = null;
    this.lastReloDistance = Infinity;
    this.lastReloCrossingQuality = 0;
    this.previousReleaseHeld = false;
    this.rabiolaLock = null;
    this.rabiolaReelHeld = false;
    this.launchTapCount = 0;
    this.lastLaunchTapAt = -Infinity;
    this.launchTapQuality = 0;
    this.kiteWearPending = 0;
    this.replayBuffer = [];
    this.replayCaptureAccumulator = 0;
    this.replayPlayback = null;
    this.lastReplayFrames = null;
    this.replaySavedState = null;

    this._initThree();
    this._initEntities();
    this.multiplayer = new MultiplayerClient({
      onMessage: (message) => this._handleNetworkMessage(message),
      onStatus: (status) => this._setOnlineStatus(status)
    });
    this._initUI();
    this._bindInputs();
    this._renderCareerHub();

    this.lastFrameMs = performance.now();
    this.elapsedTime = 0;
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  _initThree() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.resolution = new THREE.Vector2(w, h);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(56, w / h, 0.15, 1200);
    this.camera.position.set(0, 11.48, 17.8);
    this.camLookTarget = new THREE.Vector3(0, 22, -38);
    this.camera.lookAt(this.camLookTarget);

    this.isMobileLayout = window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isMobileLayout,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isMobileLayout ? 1.35 : 1.8));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.container.appendChild(this.renderer.domElement);

    this.world = new GameWorld(this.scene, this.renderer);
    this.effects = new SkyEffectsManager(this.scene);

    window.addEventListener('resize', () => this._onResize());
  }

  _initEntities() {
    // Face the open sky by default so a stationary manual launch points away from the roof.
    this.world.playerAvatar.rotation.y = Math.PI;

    // Player 3D Carretilha & Kite
    this.carretilha = new Carretilha3D(this.scene, new THREE.Vector3(0, 10.85, 13.85));
    this.carretilha.setLineColor(LINE_TYPES[this.playerConfig.lineTypeId].hex);

    const playerAnchor = this.carretilha.getLineExitWorldPosition(new THREE.Vector3());
    this.playerKite = new KiteEntity(this.scene, {
      id: 'player',
      name: 'Você',
      isPlayer: true,
      anchorPos: playerAnchor,
      modelId: this.playerConfig.modelId,
      patternId: this.playerConfig.patternId,
      lineTypeId: this.playerConfig.lineTypeId,
      tailStyle: this.playerConfig.tailStyle,
      resolution: this.resolution
    });

    // Spawn 6 Rival Pipeiros on neighboring rooftops
    const modelKeys = Object.keys(KITE_MODELS);
    const lineKeys = Object.keys(LINE_TYPES);
    const personalities = ['hunter', 'slasher', 'trickster', 'balanced', 'hunter', 'slasher'];

    this.world.rivalSpots.forEach((spot, idx) => {
      const mId = modelKeys[(idx + 1) % modelKeys.length];
      const pId = KITE_PATTERNS[(idx + 1) % KITE_PATTERNS.length].id;
      const lId = lineKeys[(idx + 1) % lineKeys.length];

      const rivalKite = new KiteEntity(this.scene, {
        id: `rival_${idx}`,
        name: spot.name,
        isPlayer: false,
        anchorPos: spot.anchor,
        modelId: mId,
        patternId: pId,
        lineTypeId: lId,
        tailStyle: 'padrao',
        resolution: this.resolution
      });

      const ai = new RivalAIController(rivalKite, personalities[idx % personalities.length]);
      this.rivals.push({ kite: rivalKite, ai, previousReleaseHeld: false });
    });
    this.playerKite.condition = this.progression.getKiteCondition(this.playerConfig.modelId);
    this._preparePlayerKiteInHand();
  }

  _preparePlayerKiteInHand() {
    this.playerLaunched = false;
    this.playerKiteInHand = true;
    this.launchTapCount = 0;
    this.lastLaunchTapAt = -Infinity;
    this.launchTapQuality = 0;
    this.rabiolaReelHeld = false;
    this.playerKite.active = false;
    this.playerKite.velocity.set(0, 0, 0);
    this.playerKite.reelSpeed = 0;
    this.playerKite.lineLength = 18;
    this.playerKite.tension = 0.18;
    this.playerKite.stringRopeReady = false;
    this.playerKite.cableTension = 0;
    this.playerKite.lineIntegrity = 1;
    this.playerKite.inRelo = false;
    this.playerKite.reloContactTime = 0;
    this.playerKite.socadaBoost = 0;
    this.playerKite.disqueBoost = 0;
    this.playerKite.disbicarBoost = 0;
    this.playerKite.lineMesh.visible = false;
    this.playerKite.visual.setVisible(true);
    this._updateHeldPlayerKite(0.016);
  }

  _updateHeldPlayerKite(dt = 0.016) {
    if (!this.playerKiteInHand) return;
    const avatar = this.world.playerAvatar;
    this.carretilha.baseWorldPos.set(avatar.position.x, avatar.position.y + 1.12, avatar.position.z);
    this.carretilha.root.position.copy(this.carretilha.baseWorldPos);
    this.carretilha.root.rotation.set(0, avatar.rotation.y, 0);
    this.carretilha.getLineExitWorldPosition(this.playerKite.anchorPos);
    this.playerKite.position.copy(_heldKiteLocal).applyEuler(avatar.rotation).add(avatar.position);
    this.playerKite.position.y += this.launchTapCount * 0.14;
    this.playerKite.quaternion.setFromEuler(_heldKiteEuler.set(0, avatar.rotation.y, 0));
    this.playerKite.visual.update({
      position: this.playerKite.position,
      quaternion: this.playerKite.quaternion,
      aeroLoad: 0.12,
      windVec: this.windVec,
      sunDir: this.world.sunDir,
      cameraPos: this.camera.position,
      dt: Math.max(0.001, dt)
    });
    this.playerKite.visual.setVisible(true);
    this.playerKite.lineMesh.visible = false;
  }

  _enterPreLaunchMode() {
    this.characterMode = true;
    this.world.playerAvatar.visible = true;
    document.body.classList.add('character-mode');
    document.getElementById('touch-char-controls')?.classList.remove('hidden');
    document.getElementById('hud-bottom')?.classList.add('hud-hidden');
    this.camModeIdx = this.cameraModes.findIndex((camera) => camera.id === 'personagem');
    document.getElementById('label-camera').textContent = this.cameraModes[this.camModeIdx].label;
    document.getElementById('label-explore').textContent = 'Preparar pipa';
    this._syncLaunchButton();
  }

  _syncLaunchButton() {
    const button = document.getElementById('touch-launch');
    if (button) button.textContent = `🪁 DAR TAPA (${this.launchTapCount}/3)`;
  }

  _tapPlayerKite() {
    if (!this.started || !this.characterMode || !this.playerKiteInHand || this.rabiolaLock) return false;

    const now = this.elapsedTime;
    let gap = now - this.lastLaunchTapAt;
    if (this.launchTapCount > 0 && gap > 2.2) {
      this.launchTapCount = 0;
      this.launchTapQuality = 0;
      gap = Infinity;
    }
    if (this.launchTapCount > 0 && gap < 0.26) return false;

    const intervalQuality = this.launchTapCount === 0
      ? 0.72
      : THREE.MathUtils.clamp(1 - Math.abs(gap - 0.58) / 0.7, 0.28, 1);
    const runBonus = THREE.MathUtils.clamp(this.characterMoveSpeed / 8.2, 0, 1);
    const tapQuality = THREE.MathUtils.clamp(intervalQuality * 0.72 + runBonus * 0.28, 0.25, 1);
    this.launchTapQuality = (this.launchTapQuality * this.launchTapCount + tapQuality) / (this.launchTapCount + 1);
    this.launchTapCount += 1;
    this.lastLaunchTapAt = now;

    this.sound.playLaunchTap(this.playerConfig.modelId, this.characterMoveSpeed, this.launchTapCount);
    this.carretilha.triggerSocada(0.18 + runBonus * 0.12);
    this._syncLaunchButton();

    if (this.launchTapCount >= 3) {
      this._launchPlayerKite(this.launchTapQuality);
      return true;
    }

    const remaining = 3 - this.launchTapCount;
    this.showBanner(`TAPA ${this.launchTapCount}/3`, remaining === 1
      ? 'Mais um tapa no tempo certo para colocar a pipa no alto.'
      : `Boa! Faltam ${remaining} tapas. Correr antes ajuda a ganhar altura.`, 'normal');
    this._updateHeldPlayerKite(0.016);
    return true;
  }

  _launchPlayerKite(launchQuality = this.launchTapQuality) {
    if (!this.started || !this.playerKiteInHand || this.launchTapCount < 3) return false;
    const avatar = this.world.playerAvatar;
    const runSpeed = THREE.MathUtils.clamp(this.characterMoveSpeed, 0, 8.2);
    const forward = _launchForward.set(0, 0, 1).applyQuaternion(avatar.quaternion).normalize();

    this.carretilha.baseWorldPos.set(avatar.position.x, avatar.position.y + 1.12, avatar.position.z);
    this.carretilha.root.position.copy(this.carretilha.baseWorldPos);
    this.carretilha.root.rotation.set(0, avatar.rotation.y, 0);
    this.carretilha.getLineExitWorldPosition(this.playerKite.anchorPos);

    this.playerKite.active = true;
    this.playerKiteInHand = false;
    this.playerLaunched = true;
    this.playerKite.lineIntegrity = 1;
    this.playerKite.lineLength = THREE.MathUtils.clamp(17 + runSpeed * 0.72, 16, 25);
    this.playerKite.tension = 0.24;
    this.playerKite.noseAngle = 0;
    this.playerKite.angularVel = 0;
    const launchPower = THREE.MathUtils.clamp(launchQuality, 0.25, 1);
    this.playerKite.socadaBoost = 0.08 + launchPower * 0.12;
    this.playerKite.disqueBoost = 0;
    this.playerKite.disbicarBoost = 0;
    this.playerKite.position.addScaledVector(forward, 0.9 + launchPower * 0.35);
    this.playerKite.position.y += 0.18 + launchPower * 0.3;
    this.playerKite.velocity.copy(forward).multiplyScalar(1.9 + runSpeed * 0.76 + launchPower * 0.45);
    this.playerKite.velocity.y += 0.72 + runSpeed * 0.28 + launchPower * 0.55;
    this.playerKite.velocity.addScaledVector(this.windVec, 0.16);
    this.playerKite._updateOrientation(this.windVec);
    this.playerKite.visual.update({
      position: this.playerKite.position,
      quaternion: this.playerKite.quaternion,
      aeroLoad: 0.3,
      windVec: this.windVec,
      sunDir: this.world.sunDir,
      cameraPos: this.camera.position,
      dt: 0.016
    });
    this.playerKite.visual.resetTailAt(this.playerKite.position);
    this.playerKite.stringRopeReady = false;
    this.playerKite._updateStringCurve(this.windVec, -1, 0, 0.016);
    this.playerKite.visual.setVisible(true);
    this.playerKite.lineMesh.visible = true;

    this.characterMode = false;
    document.body.classList.remove('character-mode');
    document.getElementById('touch-char-controls')?.classList.add('hidden');
    document.getElementById('hud-bottom')?.classList.remove('hud-hidden');
    this.touchMove.clear();
    this.touchSprint = false;
    this.characterMoveSpeed = 0;
    this.camModeIdx = this.cameraModes.findIndex((camera) => camera.id === (this.selectedMap === 'laje' ? 'laje' : 'aerea'));
    document.getElementById('label-camera').textContent = this.cameraModes[this.camModeIdx].label;
    document.getElementById('label-explore').textContent = 'Explorar';
    this.sound.playLaunchRelease(this.playerConfig.modelId, launchPower);
    this.launchTapCount = 0;
    this.launchTapQuality = 0;
    this._syncLaunchButton();
    this.showBanner('PIPA NO ALTO!', runSpeed >= 6
      ? 'Boa corrida e bons tapas! Agora controle a linha para ganhar altura.'
      : 'A pipa está no ar. Puxe a linha e use socadas para ganhar altura.', 'normal');
    return true;
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.resolution.set(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.isMobileLayout = window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isMobileLayout ? 1.35 : 1.8));

    this.playerKite.setResolution(w, h);
    for (const r of this.rivals) {
      r.kite.setResolution(w, h);
    }
  }

  _initUI() {
    // Welcome modal mode cards
    const modeCards = document.querySelectorAll('.mode-card');
    modeCards.forEach((card) => {
      card.addEventListener('click', () => {
        modeCards.forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        this.setGameMode(card.dataset.mode);
      });
    });

    document.getElementById('btn-start-game').addEventListener('click', () => {
      this.startGame();
    });

    // Select one of the playable 3D maps.
    document.querySelectorAll('.map-option').forEach((button) => {
      button.addEventListener('click', () => this._applyMapSelection(button.dataset.map));
    });

    document.getElementById('btn-open-oficina-start').addEventListener('click', () => {
      this.openOficina();
    });

    // Top HUD buttons
    document.getElementById('btn-camera').addEventListener('click', () => this.cycleCamera());
    document.getElementById('btn-garage')?.addEventListener('click', () => this.openGarage());
    document.getElementById('btn-open-garage-start')?.addEventListener('click', () => this.openGarage());
    document.getElementById('btn-close-garage')?.addEventListener('click', () => document.getElementById('garage-modal')?.classList.add('hidden'));
    document.getElementById('btn-upgrade-house')?.addEventListener('click', () => this._upgradeHouse());
    document.getElementById('btn-replay')?.addEventListener('click', () => this._toggleReplay());
    document.getElementById('btn-weather').addEventListener('click', () => this.cycleWeather());
    document.getElementById('btn-oficina').addEventListener('click', () => this.openOficina());
    document.getElementById('btn-explore').addEventListener('click', () => this.toggleCharacterMode());
    const openOnline = () => {
      if (!this.multiplayer.connected) {
        document.getElementById('online-room-map').value = this.selectedMap;
        document.getElementById('online-room-difficulty').value = this.matchDifficulty;
        this._showOnlineSection('home');
      } else {
        this._showOnlineSection('lobby');
      }
      document.getElementById('online-modal').classList.remove('hidden');
    };
    document.getElementById('btn-online').addEventListener('click', openOnline);
    document.getElementById('btn-open-online-start').addEventListener('click', openOnline);
    document.getElementById('btn-close-online').addEventListener('click', () => {
      document.getElementById('online-modal').classList.add('hidden');
    });
    document.getElementById('btn-menu-create-room').addEventListener('click', () => this._showOnlineSection('create'));
    document.getElementById('btn-menu-join-room').addEventListener('click', () => this._showOnlineSection('join'));
    document.getElementById('btn-online-back-create').addEventListener('click', () => this._showOnlineSection('home'));
    document.getElementById('btn-online-back-join').addEventListener('click', () => this._showOnlineSection('home'));
    document.getElementById('btn-create-room').addEventListener('click', () => this._connectOnline(true));
    document.getElementById('btn-join-room').addEventListener('click', () => this._connectOnline(false));
    document.getElementById('btn-copy-room').addEventListener('click', async () => {
      const code = this.onlineRoomCode || '';
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        this._setOnlineStatus('Código da sala copiado! Envie para seu amigo.');
      } catch {
        this._setOnlineStatus(`Código da sala: ${code}`);
      }
    });
    document.getElementById('btn-mode').addEventListener('click', () => {
      document.getElementById('welcome-modal').classList.remove('hidden');
    });
    document.getElementById('btn-sound').addEventListener('click', () => {
      const on = this.sound.toggleMute();
      document.getElementById('icon-sound').textContent = on ? '🔊' : '🔇';
    });
    document.getElementById('btn-help').addEventListener('click', () => {
      document.getElementById('controls-guide').classList.toggle('hidden');
    });

    document.getElementById('btn-relaunch').addEventListener('click', () => {
      this.relaunchPlayerKite();
    });
    document.getElementById('btn-rabiola-lockpick')?.addEventListener('click', () => {
      this._attemptRabiolaLockpick();
    });

    // Zen wind slider
    const zenSlider = document.getElementById('slider-zen-wind');
    zenSlider.addEventListener('input', (e) => {
      this.zenWindOverride = parseFloat(e.target.value);
      document.getElementById('val-zen-wind').textContent = this.zenWindOverride.toFixed(1);
    });

    // Profile nickname is saved locally and reused as the online display name.
    const profileName = document.getElementById('profile-nickname');
    profileName.value = this.progression.profile.nickname;
    profileName.addEventListener('change', () => {
      const nickname = this.progression.setNickname(profileName.value);
      profileName.value = nickname;
      document.getElementById('online-name').value = nickname;
    });

    const difficultySelect = document.getElementById('match-difficulty');
    const onlineDifficultySelect = document.getElementById('online-room-difficulty');
    this.matchDifficulty = difficultySelect.value || 'normal';
    difficultySelect.addEventListener('change', () => {
      this.matchDifficulty = difficultySelect.value;
      onlineDifficultySelect.value = this.matchDifficulty;
    });
    onlineDifficultySelect.addEventListener('change', () => {
      this.matchDifficulty = onlineDifficultySelect.value;
      difficultySelect.value = this.matchDifficulty;
    });

    // Graphics profile adapts render scale and shadows to the device.
    const qualitySelect = document.getElementById('graphics-quality');
    let savedQuality = 'balanced';
    try { savedQuality = localStorage.getItem('vento-laje-graphics') || savedQuality; } catch {}
    if (!['performance', 'balanced', 'high'].includes(savedQuality)) savedQuality = 'balanced';
    qualitySelect.value = savedQuality;
    this._applyGraphicsQuality(savedQuality, false);
    qualitySelect.addEventListener('change', () => this._applyGraphicsQuality(qualitySelect.value));

    // Populate Oficina options
    this._populateOficina();
  }

  _applyMapSelection(mapId) {
    const result = this.world.setMap(mapId);
    this.selectedMap = this.world.mapId;
    const spawn = result.spawn;
    this.world.playerAvatar.position.copy(spawn);
    this.world.playerAvatar.rotation.set(0, Math.PI, 0);
    this.carretilha.baseWorldPos.copy(spawn).add(new THREE.Vector3(0, 1.12, 0));
    this.carretilha.root.position.copy(this.carretilha.baseWorldPos);
    this.carretilha.root.rotation.set(0, 0, 0);
    this.carretilha.getLineExitWorldPosition(this.playerKite.anchorPos);
    this._preparePlayerKiteInHand();

    this.rivals.forEach((rival, index) => {
      const spot = result.rivalSpots[index % result.rivalSpots.length];
      rival.kite.anchorPos.copy(spot.anchor);
      rival.kite.spawnInSky();
    });

    this.characterMode = false;
    this.world.playerAvatar.visible = true;
    const preferredCamera = this.selectedMap === 'laje' ? 'laje' : 'personagem';
    this.camModeIdx = this.cameraModes.findIndex((camera) => camera.id === preferredCamera);
    document.getElementById('label-camera').textContent = this.cameraModes[this.camModeIdx].label;
    document.getElementById('label-explore').textContent = 'Explorar';
    const labels = {
      laje: 'Laje do Bairro', praia: 'Praia', parque: 'Parque',
      campinho: 'Campinho', morro: 'Mirante do Morro'
    };
    document.getElementById('selected-map-label').textContent = labels[this.selectedMap] || labels.laje;
    document.querySelectorAll('.map-option').forEach((button) => {
      button.classList.toggle('selected', button.dataset.map === this.selectedMap);
    });
    if (this.started) {
      this._enterPreLaunchMode();
      this.showBanner('NOVO CENÁRIO', `${labels[this.selectedMap]} selecionado. Corra e solte a pipa quando estiver pronto.`, 'normal');
    }
  }

  toggleCharacterMode() {
    if (!this.started) {
      this.startGame();
      return;
    }
    if (this.rabiolaLock) return;
    if (this.playerKiteInHand) {
      this.showBanner('PIPA NA MÃO', 'Caminhe ou corra e dê três tapas com ESPAÇO ou E para colocar a pipa no alto.', 'normal');
      return;
    }
    this._preparePlayerKiteInHand();
    this._enterPreLaunchMode();
    this.showBanner('ESCOLHA O PONTO', 'Agora você está com a pipa na mão. Posicione-se e dê três tapas para lançar.', 'normal');
  }

  _updateCharacterMovement(dt) {
    if (!this.characterMode || this.rabiolaLock) return;
    const avatar = this.world.playerAvatar;
    const direction = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp'] || this.touchMove.has('up')) direction.z -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'] || this.touchMove.has('down')) direction.z += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'] || this.touchMove.has('left')) direction.x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight'] || this.touchMove.has('right')) direction.x += 1;
    const moving = direction.lengthSq() > 0;
    this.characterMoveSpeed = 0;
    if (moving) {
      direction.normalize();
      const moveSpeed = this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.touchSprint ? 8.2 : 4.8;
      this.characterMoveSpeed = moveSpeed;
      avatar.position.addScaledVector(direction, moveSpeed * dt);
      if (this.selectedMap === 'laje') {
        avatar.position.x = THREE.MathUtils.clamp(avatar.position.x, -4.6, 4.6);
        avatar.position.z = THREE.MathUtils.clamp(avatar.position.z, 10.7, 19.2);
        avatar.position.y = 9.74;
      } else {
        avatar.position.x = THREE.MathUtils.clamp(avatar.position.x, -52, 52);
        avatar.position.z = THREE.MathUtils.clamp(avatar.position.z, -52, 52);
        avatar.position.y = this.world.getTerrainHeight(avatar.position.x, avatar.position.z);
      }
      avatar.rotation.y = Math.atan2(direction.x, direction.z);
    }
    const parts = avatar.userData.walkParts;
    if (parts) {
      const swing = moving ? Math.sin(this.elapsedTime * 11) * 0.55 : 0;
      parts.leftLeg.rotation.x = swing;
      parts.rightLeg.rotation.x = -swing;
      parts.leftArm.rotation.x = 0.85 - swing * 0.32;
      parts.rightArm.rotation.x = 1.05 + swing * 0.32;
      const tapAge = this.elapsedTime - this.lastLaunchTapAt;
      if (this.playerKiteInHand && tapAge >= 0 && tapAge < 0.28) {
        parts.rightArm.rotation.x = 0.1 + Math.sin((tapAge / 0.28) * Math.PI) * 1.25;
      }
    }
    this.carretilha.baseWorldPos.set(avatar.position.x, avatar.position.y + 1.12, avatar.position.z);
  }

  _setOnlineStatus(message) {
    const status = document.getElementById('online-status');
    if (status) status.textContent = message;
  }

  _showOnlineSection(section = 'home') {
    const sections = {
      home: 'online-home',
      create: 'online-create-panel',
      join: 'online-join-panel',
      lobby: 'online-room-created'
    };
    for (const [key, id] of Object.entries(sections)) {
      document.getElementById(id)?.classList.toggle('hidden', key !== section);
    }
  }

  _updateOnlineLobby(players = []) {
    const list = document.getElementById('online-player-list');
    if (!list) return;
    const names = players.map((player) => player.name || 'Pipeiro');
    list.textContent = `${players.length}/12 jogadores na sala: ${names.join(' • ') || 'aguardando pipeiros'}`;
  }

  async _connectOnline(create) {
    const name = document.getElementById('online-name').value.trim() || 'Pipeiro';
    const room = document.getElementById('online-room').value.trim();
    const serverUrl = document.getElementById('online-server').value.trim();
    const mapId = create ? document.getElementById('online-room-map').value : this.selectedMap;
    const difficulty = document.getElementById('online-room-difficulty').value || this.matchDifficulty;
    if (!create && !room) {
      this._setOnlineStatus('Digite o código da sala que seu amigo enviou.');
      return;
    }
    document.getElementById('btn-create-room').disabled = true;
    document.getElementById('btn-join-room').disabled = true;
    this._setOnlineStatus(create ? 'Criando sua sala privada…' : 'Procurando a sala…');
    try {
      await this.multiplayer.connect({ name, room, create, serverUrl, mapId, difficulty });
    } catch (error) {
      this._setOnlineStatus(error.message || 'Falha ao conectar.');
    } finally {
      document.getElementById('btn-create-room').disabled = false;
      document.getElementById('btn-join-room').disabled = false;
    }
  }

  _handleNetworkMessage(message) {
    if (message.type === 'joined') {
      this.onlineRoomCode = message.roomCode;
      document.getElementById('online-room-code').textContent = message.roomCode;
      document.getElementById('online-room').value = message.roomCode;
      this.matchDifficulty = message.difficulty || this.matchDifficulty;
      document.getElementById('match-difficulty').value = this.matchDifficulty;
      document.getElementById('online-room-difficulty').value = this.matchDifficulty;
      const mapNames = { laje: 'Laje do Bairro', praia: 'Praia', parque: 'Parque', campinho: 'Campinho', morro: 'Mirante do Morro' };
      const difficultyNames = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };
      document.getElementById('online-room-meta').textContent = `${mapNames[message.mapId] || 'Laje do Bairro'} • ${difficultyNames[this.matchDifficulty] || 'Normal'} • até ${message.maxPlayers || 12} jogadores`;
      this._applyMapSelection(message.mapId || this.selectedMap);
      this.setGameMode('online');
      this.startGame();
      this._showOnlineSection('lobby');
      document.getElementById('online-modal').classList.remove('hidden');
      this._syncRemoteRoster(message.players || []);
      this._setOnlineStatus(`Sala ${message.roomCode} conectada. Copie o código e convide seus amigos.`);
    } else if (message.type === 'roster') {
      this._syncRemoteRoster(message.players || []);
    } else if (message.type === 'player-state') {
      this._upsertRemotePlayer(message.player);
    } else if (message.type === 'player-left') {
      this._removeRemotePlayer(message.playerId);
    } else if (message.type === 'relo-result') {
      this._handleOnlineReloResult(message);
    } else if (message.type === 'disconnected') {
      for (const id of [...this.remotePlayers.keys()]) this._removeRemotePlayer(id);
      this._showOnlineSection('home');
    }
  }

  _handleOnlineReloResult(message) {
    const localId = this.multiplayer.playerId;
    const winnerName = message.winnerName || 'Pipeiro';
    const loserName = message.loserName || 'Pipeiro';

    if (message.loserId === localId) {
      this.playerKite.active = false;
      this.playerLaunched = false;
      this.playerKiteInHand = false;
      this.playerKite.visual.setVisible(false);
      this.playerKite.lineMesh.visible = false;
      this.playerKite.lineIntegrity = 0;
      this.combo = 1;
      this.sound.playCut(false);
      this.showBanner('FOI CORTADO!', `${winnerName} levou sua pipa no ${message.moveName || 'relo'}!`, 'danger');
      document.getElementById('relaunch-reason').textContent = `${winnerName} levou sua pipa no ${message.moveName || 'relo'}! Suba outra para voltar à disputa.`;
      document.getElementById('relaunch-overlay').classList.remove('hidden');
    } else if (message.winnerId === localId) {
      this.cuts++;
      this._recordProgress('cut');
      const pts = 150 * this.combo;
      this.score += pts;
      this.combo = Math.min(8, this.combo + 1);
      this.sound.playCut(true);
      this.showBanner('RELO ONLINE!', `Você cortou ${loserName} ${message.moveName || 'no cruzamento'}! +${pts} pts`, 'normal');
    } else {
      const loser = this.remotePlayers.get(message.loserId);
      if (loser) {
        loser.state = { ...(loser.state || {}), active: false, lineIntegrity: 0 };
        loser.avatar.visible = false;
        loser.visual.setVisible(false);
        loser.tether.visible = false;
      }
      this.showBanner('RELO NO CÉU!', `${winnerName} cortou ${loserName} ${message.moveName || 'no cruzamento'}!`, 'normal');
    }

    if (Array.isArray(message.players)) this._syncRemoteRoster(message.players);
  }

  _syncRemoteRoster(players) {
    this._updateOnlineLobby(players);
    const keep = new Set(players.filter((player) => player.id !== this.multiplayer.playerId).map((player) => player.id));
    for (const id of [...this.remotePlayers.keys()]) if (!keep.has(id)) this._removeRemotePlayer(id);
    for (const player of players) if (player.id !== this.multiplayer.playerId) this._upsertRemotePlayer(player);
  }

  _upsertRemotePlayer(player) {
    if (!player?.id) return;
    let remote = this.remotePlayers.get(player.id);
    if (!remote) {
      const avatar = this.world.createPipeiroCharacter(0x38bdf8, 0x1e293b);
      this.scene.add(avatar);
      const visual = new KiteVisual(this.scene, { modelId: 'murcha', patternId: 'brasil_ouro', tailStyle: 'padrao' });
      const tetherGeometry = new THREE.BufferGeometry();
      tetherGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3));
      const tetherMaterial = new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.78 });
      const tether = new THREE.Line(tetherGeometry, tetherMaterial);
      tether.frustumCulled = false;
      this.scene.add(tether);
      remote = { id: player.id, name: player.name || 'Pipeiro', avatar, visual, tether, tetherMaterial, state: null, targetPosition: new THREE.Vector3(), targetKitePosition: new THREE.Vector3(0, 22, -30), targetQuaternion: new THREE.Quaternion(), targetLinePoints: new Float32Array(24) };
      this.remotePlayers.set(player.id, remote);
    }
    remote.name = player.name || remote.name;
    if (player.state) {
      if (player.state.mapId && player.state.mapId !== this.world.mapId) {
        this._applyMapSelection(player.state.mapId);
      }
      remote.state = player.state;
      if (player.state.position) remote.targetPosition.fromArray(player.state.position);
      if (player.state.kitePosition) remote.targetKitePosition.fromArray(player.state.kitePosition);
      if (player.state.kiteQuaternion) remote.targetQuaternion.fromArray(player.state.kiteQuaternion);
      if (Array.isArray(player.state.linePoints) && player.state.linePoints.length === 24) {
        remote.targetLinePoints.set(player.state.linePoints);
      } else {
        const start = [remote.targetPosition.x, remote.targetPosition.y + 1.18, remote.targetPosition.z];
        const end = remote.targetKitePosition;
        for (let point = 0; point < 8; point++) {
          const t = point / 7;
          remote.targetLinePoints[point * 3] = start[0] + (end.x - start[0]) * t;
          remote.targetLinePoints[point * 3 + 1] = start[1] + (end.y - start[1]) * t;
          remote.targetLinePoints[point * 3 + 2] = start[2] + (end.z - start[2]) * t;
        }
      }
      const remoteLine = LINE_TYPES[player.state.lineTypeId];
      if (remoteLine) remote.tetherMaterial.color.set(remoteLine.hex);
      if (player.state.modelId !== remote.visual.modelId || player.state.patternId !== remote.visual.patternId) {
        remote.visual.rebuild({ modelId: player.state.modelId, patternId: player.state.patternId, tailStyle: 'padrao' });
      }
      remote.avatar.visible = player.state.active !== false;
      remote.visual.setVisible(player.state.active !== false);
      remote.tether.visible = player.state.active !== false;
    }
  }

  _removeRemotePlayer(id) {
    const remote = this.remotePlayers.get(id);
    if (!remote) return;
    this.scene.remove(remote.avatar, remote.tether);
    this.scene.remove(remote.visual.group, remote.visual.tailLine, remote.visual.ribbonInstanced);
    remote.tether.geometry.dispose();
    remote.tether.material.dispose();
    remote.visual.group.traverse((object) => { if (object.geometry) object.geometry.dispose(); });
    this.remotePlayers.delete(id);
  }

  _updateRemotePlayers(dt) {
    for (const remote of this.remotePlayers.values()) {
      remote.avatar.position.lerp(remote.targetPosition, Math.min(1, dt * 12));
      if (remote.state) remote.avatar.rotation.y += (remote.state.rotation - remote.avatar.rotation.y) * Math.min(1, dt * 12);
      const kitePosition = remote.visual.group.position.lerp(remote.targetKitePosition, Math.min(1, dt * 9));
      remote.visual.update({
        position: kitePosition,
        quaternion: remote.targetQuaternion,
        aeroLoad: 0.5,
        windVec: this.windVec,
        sunDir: this.world.sunDir,
        cameraPos: this.camera.position,
        dt
      });
      const tetherPositions = remote.tether.geometry.attributes.position;
      const tetherArray = tetherPositions.array;
      for (let i = 0; i < tetherArray.length; i++) {
        const target = remote.targetLinePoints[i];
        if (Number.isFinite(target)) tetherArray[i] += (target - tetherArray[i]) * Math.min(1, dt * 12);
      }
      tetherPositions.needsUpdate = true;
      remote.tether.geometry.computeBoundingSphere();
    }
  }

  _sendNetworkState(nowMs) {
    if (!this.multiplayer?.connected || nowMs - this.lastNetSendMs < 100) return;
    this.lastNetSendMs = nowMs;
    const avatar = this.world.playerAvatar;
    this.multiplayer.sendState({
      mapId: this.world.mapId,
      position: avatar.position.toArray(),
      rotation: avatar.rotation.y,
      kitePosition: this.playerKite.position.toArray(),
      kiteQuaternion: this.playerKite.quaternion.toArray(),
      modelId: this.playerConfig.modelId,
      patternId: this.playerConfig.patternId,
      lineTypeId: this.playerConfig.lineTypeId,
      active: this.playerKite.active,
      kiteVelocity: this.playerKite.velocity.toArray(),
      linePoints: [0, 4, 8, 12, 16, 20, 24, 28].flatMap((index) => this.playerKite.stringNodes[index].toArray()),
      lineLength: this.playerKite.lineLength,
      tension: this.playerKite.tension,
      reelSpeed: this.playerKite.reelSpeed,
      socada: this.playerKite.socadaBoost,
      disque: this.playerKite.disqueBoost,
      disbicar: this.playerKite.disbicarBoost,
      largadaActive: this.playerKite.largadaBoost > 0,
      largadaTagActive: this.playerKite.largadaTagTimer > 0,
      largadaQuality: this.playerKite.largadaQuality,
      linePower: this.playerKite.lineType.cutPower * this.playerKite.visual.spec.powerMult,
      lineDurability: this.playerKite.lineType.durability || 1,
      lineRecovery: this.playerKite.lineType.recovery || 0.45,
      lineDischargeSafe: this.playerKite.lineType.dischargeSafe === true,
      windAlignment: this._getWindAlignment(this.playerKite),
      lineIntegrity: this.playerKite.lineIntegrity
    });
  }

  _populateOficina() {
    const modelsBox = document.getElementById('opt-models');
    const descEl = document.getElementById('model-desc-text');

    const renderModels = () => {
      modelsBox.innerHTML = '';
      Object.values(KITE_MODELS).forEach((m) => {
        const btn = document.createElement('button');
        btn.className = `opt-chip ${this.playerConfig.modelId === m.id ? 'active' : ''}`;
        btn.textContent = m.name;
        btn.addEventListener('click', () => {
          this.playerConfig.modelId = m.id;
          descEl.textContent = m.desc;
          this.applyPlayerCustomization();
          renderModels();
        });
        modelsBox.appendChild(btn);
      });
      descEl.textContent = KITE_MODELS[this.playerConfig.modelId].desc;
    };
    renderModels();

    const patternsBox = document.getElementById('opt-patterns');
    const renderPatterns = () => {
      patternsBox.innerHTML = '';
      KITE_PATTERNS.forEach((p) => {
        const btn = document.createElement('button');
        btn.className = `opt-chip ${this.playerConfig.patternId === p.id ? 'active' : ''}`;
        const dots = p.colors
          .slice(0, 3)
          .map((c) => `<span class="swatch-dot" style="background:${c}"></span>`)
          .join('');
        btn.innerHTML = `<span class="swatch-dots">${dots}</span><span>${p.name}</span>`;
        btn.addEventListener('click', () => {
          this.playerConfig.patternId = p.id;
          this.applyPlayerCustomization();
          renderPatterns();
        });
        patternsBox.appendChild(btn);
      });
    };
    renderPatterns();

    const linesBox = document.getElementById('opt-lines');
    const lineDesc = document.getElementById('line-desc-text');
    const renderLines = () => {
      linesBox.innerHTML = '';
      Object.values(LINE_TYPES).forEach((lt) => {
        const owned = this.progression.ownsLine(lt.id);
        const btn = document.createElement('button');
        btn.className = `opt-chip ${this.playerConfig.lineTypeId === lt.id ? 'active' : ''} ${owned ? '' : 'locked'}`;
        btn.innerHTML = `<span class="swatch-dot" style="background:${lt.hex}"></span><span>${owned ? lt.name : `🔒 ${lt.name} • 900 moedas`}</span>`;
        btn.addEventListener('click', () => {
          if (!owned) {
            const result = this.progression.buyLine(lt.id);
            if (result.ok) {
              this._renderCareerHub();
              this.showBanner('LINHA DESBLOQUEADA!', 'A linha de descarga entrou no seu inventário.', 'catch');
            } else {
              this.showBanner('LINHA BLOQUEADA', result.reason, 'danger');
            }
            renderLines();
            return;
          }
          this.playerConfig.lineTypeId = lt.id;
          this.applyPlayerCustomization();
          renderLines();
        });
        linesBox.appendChild(btn);
      });
      const selected = LINE_TYPES[this.playerConfig.lineTypeId] || LINE_TYPES.branca_pura;
      const dischargeNote = selected.dischargeSafe ? ' • PROTEGIDA AO DESCARREGAR' : '';
      lineDesc.textContent = `${selected.desc} • ATAQUE ${Math.round(selected.cutPower * 100)} • HP ${Math.round(selected.durability * 100)} • RECUPERAÇÃO ${Math.round(selected.recovery * 100)}${dischargeNote}${this.progression.profile.level < 4 ? ' • LINHA ESPECIAL: NÍVEL 4 + 900 MOEDAS' : ' • LINHA ESPECIAL: 900 MOEDAS'}`;
    };
    renderLines();

    // Tail style chips
    const tailBtns = document.querySelectorAll('#opt-tails .opt-chip');
    tailBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        tailBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.playerConfig.tailStyle = btn.dataset.tail;
        this.applyPlayerCustomization();
      });
    });

    // Weather chips inside Oficina
    const weatherBtns = document.querySelectorAll('#opt-weather .opt-chip');
    weatherBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        weatherBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const wId = btn.dataset.weather;
        this.weatherIdx = this.weatherOrder.indexOf(wId);
        this.world.applyWeather(wId);
        this._syncWeatherLabel();
      });
    });

    const closeOficina = () => {
      document.getElementById('oficina-modal').classList.add('hidden');
    };
    document.getElementById('btn-close-oficina').addEventListener('click', closeOficina);
    document.getElementById('btn-apply-oficina').addEventListener('click', () => {
      closeOficina();
      if (!this.started) this.startGame();
    });
  }

  openOficina() {
    this.sound.init();
    document.getElementById('oficina-modal').classList.remove('hidden');
  }

  applyPlayerCustomization() {
    this.playerKite.visual.rebuild({
      modelId: this.playerConfig.modelId,
      patternId: this.playerConfig.patternId,
      tailStyle: this.playerConfig.tailStyle
    });
    this.playerKite.setLineType(this.playerConfig.lineTypeId);
    this.progression.discoverKite(this.playerConfig.modelId);
    this.playerKite.condition = this.progression.getKiteCondition(this.playerConfig.modelId);
    this.carretilha.setLineColor(LINE_TYPES[this.playerConfig.lineTypeId].hex);
    this.sound.playSocada(0.6);
  }

  _applyGraphicsQuality(level = 'balanced', persist = true) {
    const presets = {
      performance: { desktopRatio: 1.05, mobileRatio: 0.9, shadows: false },
      balanced: { desktopRatio: 1.55, mobileRatio: 1.2, shadows: true },
      high: { desktopRatio: 2.0, mobileRatio: 1.5, shadows: true }
    };
    const preset = presets[level] || presets.balanced;
    const maxRatio = this.isMobileLayout ? preset.mobileRatio : preset.desktopRatio;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.playerKite.setResolution(window.innerWidth, window.innerHeight);
    for (const rival of this.rivals) rival.kite.setResolution(window.innerWidth, window.innerHeight);
    this.graphicsQuality = level;
    if (persist) {
      try { localStorage.setItem('vento-laje-graphics', level); } catch {}
    }
  }

  _getActiveRivals() {
    if (this.gameMode === 'online') return [];
    return this.gameMode === 'duelo' ? this.rivals.slice(0, 1) : this.rivals;
  }

  openGarage() {
    this.progression.visitGarage();
    this._renderGarage();
    document.getElementById('garage-modal')?.classList.remove('hidden');
  }

  _renderGarage() {
    const house = this.progression.profile.house;
    const set = (id, value) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value;
    };
    set('garage-house-level', house.level);
    set('garage-slot-count', `${house.ownedKites.length}/${house.garageSlots} espaços`);
    set('garage-coin-count', this.progression.profile.coins.toLocaleString('pt-BR'));
    set('garage-repair-count', this.progression.profile.stats.repairs.toLocaleString('pt-BR'));
    const upgrade = document.getElementById('btn-upgrade-house');
    if (upgrade) {
      upgrade.disabled = house.level >= 3;
      upgrade.textContent = house.level >= 3 ? 'CASA NO NÍVEL MÁXIMO' : `AMPLIAR CASA · ${house.level === 1 ? '850' : '1.800'} 🪙`;
    }

    const list = document.getElementById('garage-kite-list');
    if (!list) return;
    const ids = house.ownedKites.slice(0, house.garageSlots);
    list.innerHTML = ids.map((id) => {
      const model = KITE_MODELS[id];
      const condition = this.progression.getKiteCondition(id);
      const label = condition >= 80 ? 'Boa condição' : condition >= 45 ? 'Precisa de revisão' : 'Muito desgastada';
      const color = condition >= 80 ? '#34d399' : condition >= 45 ? '#facc15' : '#fb7185';
      return `<article class="garage-kite-card">
        <div class="garage-kite-head"><strong>${model?.name || id}</strong><span>${Math.round(condition)}%</span></div>
        <div class="garage-condition"><i style="width:${condition}%;background:${color}"></i></div>
        <small>${label}</small>
        <button type="button" class="secondary-cta garage-repair" data-repair-kite="${id}" ${condition >= 99.9 ? 'disabled' : ''}>
          ${condition >= 99.9 ? 'EM DIA' : `REPARAR · ${Math.ceil((100-condition)*2.4)} 🪙`}
        </button>
      </article>`;
    }).join('') || '<p class="garage-empty">Empine novos modelos para começar sua coleção.</p>';

    list.querySelectorAll('[data-repair-kite]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.repairKite;
        const result = this.progression.repairKite(id);
        if (result.ok && result.repaired) {
          if (this.playerConfig.modelId === id) this.playerKite.condition = 100;
          this._renderGarage();
          this._renderCareerHub();
          this.showBanner('PIPA CONSERTADA!', `${KITE_MODELS[id].name} voltou a 100% de conservação. -${result.cost} moedas`, 'catch');
        } else if (!result.ok) {
          this.showBanner('NÃO FOI POSSÍVEL CONSERTAR', result.reason, 'danger');
        }
      });
    });
  }

  _upgradeHouse() {
    const result = this.progression.upgradeHouse();
    if (!result.ok) {
      this.showBanner('AMPLIAÇÃO BLOQUEADA', result.reason, 'danger');
      return;
    }
    this._renderGarage();
    this._renderCareerHub();
    this.showBanner('CASA AMPLIADA!', `Garagem nível ${result.level}: mais espaço para suas pipas.`, 'catch');
  }

  _updateKiteWear(dt) {
    if (!this.playerKite.active || this.gameMode === 'online') return;
    const pressure = this.playerKite.aeroDynamicPressure || 0;
    const stressRate = 0.006 + pressure * 0.00048
      + (this.playerKite.stalled ? 0.018 : 0)
      + this.playerKite.socadaBoost * 0.004;
    this.kiteWearPending += Math.max(0, dt) * stressRate;
    if (this.kiteWearPending < 0.55) return;
    const amount = this.kiteWearPending;
    this.kiteWearPending = 0;
    const condition = this.progression.damageKite(this.playerConfig.modelId, amount);
    this.playerKite.condition = condition;
    if (condition < 25 && condition + amount >= 25) {
      this.showBanner('PIPA DESGASTADA!', 'A estrutura está fraca. Vá à Casa/Garagem para fazer a manutenção.', 'danger');
    }
  }

  _renderCareerHub() {
    const profile = this.progression.profile;
    const nextXp = this.progression.xpForNextLevel;
    const set = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    set('profile-level', profile.level);
    set('profile-rank-title', this.progression.rankTitle);
    set('profile-xp-label', `${profile.xp.toLocaleString('pt-BR')} / ${nextXp.toLocaleString('pt-BR')} XP`);
    set('profile-coins', profile.coins.toLocaleString('pt-BR'));
    set('profile-total-cuts', profile.stats.cuts.toLocaleString('pt-BR'));
    set('profile-total-catches', profile.stats.catches.toLocaleString('pt-BR'));
    const onlineName = document.getElementById('online-name');
    if (onlineName && !onlineName.matches(':focus')) onlineName.value = profile.nickname;
    const xpFill = document.getElementById('profile-xp-fill');
    if (xpFill) xpFill.style.width = `${Math.min(100, profile.xp / nextXp * 100)}%`;
    const list = document.getElementById('mission-list');
    if (list) {
      list.innerHTML = this.progression.getMissions().map((mission) => {
        const pct = Math.min(100, mission.progress / mission.target * 100);
        const status = mission.claimed ? 'CONCLUÍDA' : `${mission.progress}/${mission.target}`;
        return `<article class="mission-item ${mission.claimed ? 'done' : ''}">
          <div class="mission-top"><strong>${mission.title}</strong><span class="mission-reward">+${mission.coins} 🪙</span></div>
          <p>${mission.description}</p>
          <div class="mission-progress-row"><span>${status}</span><span>+${mission.xp} XP</span></div>
          <div class="mission-progress-track"><div class="mission-progress-fill" style="width:${pct}%"></div></div>
        </article>`;
      }).join('');
    }
  }

  _recordProgress(event, amount = 1) {
    const result = this.progression.record(event, amount);
    this._renderCareerHub();
    if (result.levelsGained > 0) {
      this.showBanner('SUBIU DE NÍVEL!', `Nível ${this.progression.profile.level} • +${result.coinsEarned} moedas`, 'catch');
    } else if (result.completedMissions.length) {
      this.showBanner('MISSÃO CONCLUÍDA!', `${result.completedMissions.join(', ')} • +${result.coinsEarned} moedas`, 'catch');
    }
    return result;
  }

  setGameMode(mode) {
    const previousMode = this.gameMode;
    this.gameMode = mode;
    if (mode === 'online') {
      this.rivals.forEach((rival) => {
        rival.kite.active = false;
        rival.kite.visual.setVisible(false);
        rival.kite.lineMesh.visible = false;
        rival.ai.respawnTimer = 1e9;
      });
    } else if (mode === 'duelo') {
      this.rivals.forEach((rival, index) => {
        if (index === 0) {
          if (!rival.kite.active) rival.kite.spawnInSky(true);
          rival.ai.respawnTimer = 0;
        } else {
          rival.kite.active = false;
          rival.kite.visual.setVisible(false);
          rival.kite.lineMesh.visible = false;
          rival.ai.respawnTimer = 1e9;
        }
      });
    } else if (previousMode === 'duelo' || previousMode === 'online') {
      this.rivals.forEach((rival) => {
        if (!rival.kite.active) rival.kite.spawnInSky(true);
        rival.ai.respawnTimer = 0;
      });
    }
    const badge = document.getElementById('hud-mode-badge');
    const zenBox = document.getElementById('zen-wind-box');

    if (mode === 'festival') {
      badge.textContent = 'FESTIVAL LIVRE • QUEBRADA';
      zenBox.classList.add('hidden');
    } else if (mode === 'torneio') {
      this.tournamentWave = 1;
      badge.textContent = `TORNEIO REI DA LAJE • RODADA ${this.tournamentWave}`;
      zenBox.classList.add('hidden');
    } else if (mode === 'online') {
      badge.textContent = 'SALA ONLINE • MULTIPLAYER';
      zenBox.classList.add('hidden');
    } else if (mode === 'duelo') {
      badge.textContent = 'ARENA 1 CONTRA 1';
      zenBox.classList.add('hidden');
    } else {
      badge.textContent = 'VOO LIVRE ZEN • SEM CORTES';
      zenBox.classList.remove('hidden');
    }
  }

  startGame() {
    this.sound.init();
    this.started = true;
    document.getElementById('welcome-modal').classList.add('hidden');
    document.getElementById('hud-top').classList.remove('hud-hidden');
    document.getElementById('controls-guide').classList.remove('hud-hidden');
    if (!this.playerKiteInHand) this._preparePlayerKiteInHand();
    this._enterPreLaunchMode();
    this.showBanner('PIPA NA MÃO', 'Caminhe ou corra e dê três tapas com ESPAÇO ou E para colocar a pipa no alto.', 'normal');
  }

  cycleCamera() {
    this.camModeIdx = (this.camModeIdx + 1) % this.cameraModes.length;
    document.getElementById('label-camera').textContent = this.cameraModes[this.camModeIdx].label;
  }

  cycleWeather() {
    this.weatherIdx = (this.weatherIdx + 1) % this.weatherOrder.length;
    const wId = this.weatherOrder[this.weatherIdx];
    this.world.applyWeather(wId);
    this._syncWeatherLabel();

    const weatherBtns = document.querySelectorAll('#opt-weather .opt-chip');
    weatherBtns.forEach((b) => b.classList.toggle('active', b.dataset.weather === wId));
  }

  _syncWeatherLabel() {
    const wId = this.weatherOrder[this.weatherIdx];
    const shortNames = { tarde: 'Tarde', pordosol: 'Pôr do Sol', ventania: 'Ventania' };
    document.getElementById('label-weather').textContent = shortNames[wId] || 'Tarde';
  }

  triggerPlayerSocada(strength = 1.0) {
    if (!this.playerKite.active || this.playerKiteInHand) return false;
    this.playerKite.triggerSocada(strength);
    this.carretilha.triggerSocada(strength);
    this.sound.playSocada(strength);
    this._flashDeckBtn('act-socar');
  }

  relaunchPlayerKite() {
    document.getElementById('relaunch-overlay').classList.add('hidden');
    this.lastCutTargetPos = null;
    this._preparePlayerKiteInHand();
    this._enterPreLaunchMode();
    this.showBanner('NOVA PIPA NA MÃO', 'Escolha onde ficar, corra e pressione E para soltá-la.', 'normal');
  }

  _flashDeckBtn(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 110);
  }

  _bindInputs() {
    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        // Avoid scrolling page
        if (document.activeElement?.tagName !== 'INPUT') e.preventDefault();
      }

      const wasPressed = this.keys[code];
      this.keys[code] = true;

      if (!this.started && (code === 'Enter' || code === 'Space')) {
        const oficinaOpen = !document.getElementById('oficina-modal').classList.contains('hidden');
        if (!oficinaOpen) {
          this.startGame();
          return;
        }
      }

      if (!wasPressed && this.started && this.rabiolaLock?.phase === 'lockpick'
          && (code === 'Space' || code === 'Enter')) {
        this._attemptRabiolaLockpick();
        return;
      }

      if (!wasPressed && this.started) {
        if (code === 'Space') {
          if (this.characterMode && this.playerKiteInHand) this._tapPlayerKite();
          else this.triggerPlayerSocada(1.0);
        } else if (code === 'KeyQ') {
          this.playerKite.triggerDisque(-1);
          this.sound.playSocada(0.85);
          this._flashDeckBtn('act-disque-l');
        } else if (code === 'KeyE' && !this.characterMode) {
          this.playerKite.triggerDisque(1);
          this.sound.playSocada(0.85);
          this._flashDeckBtn('act-disque-r');
        } else if (code === 'KeyB' && !this.characterMode) {
          const direction = Math.abs(this.padSteer) > 0.2 ? this.padSteer : (Math.sign(this.playerKite.noseAngle) || 1);
          if (this.playerKite.triggerDisbicar(direction)) {
            this.sound.playSocada(0.75);
            this._flashDeckBtn('act-disbicar');
          }
        } else if (code === 'KeyC') {
          this.cycleCamera();
        } else if (code === 'KeyV') {
          this.toggleCharacterMode();
        } else if (code === 'KeyE' && this.characterMode) {
          this._tapPlayerKite();
        } else if (code === 'KeyO') {
          const modal = document.getElementById('oficina-modal');
          if (modal.classList.contains('hidden')) this.openOficina();
          else modal.classList.add('hidden');
        } else if (code === 'KeyH') {
          document.getElementById('controls-guide').classList.toggle('hidden');
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Mouse / Touch directly on 3D Canvas
    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
      this.sound.init();
      if (e.button === 2) {
        this.pointer.rightDown = true;
        return;
      }
      this.pointer.down = true;
      this.pointer.downTime = performance.now();
      this.pointer.startX = e.clientX;
      this.pointer.currX = e.clientX;
    });

    window.addEventListener('pointermove', (e) => {
      if (this.pointer.down) {
        this.pointer.currX = e.clientX;
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) {
        this.pointer.rightDown = false;
        return;
      }
      if (this.pointer.down) {
        const heldMs = performance.now() - this.pointer.downTime;
        const movedX = Math.abs(this.pointer.currX - this.pointer.startX);
        this.pointer.down = false;
        // Quick tap on canvas triggers crisp Socada!
        if (heldMs < 210 && movedX < 24 && this.started && !this.characterMode) {
          this.triggerPlayerSocada(1.0);
        }
      }
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.started || !this.playerKite.active) return;
        if (e.deltaY > 0) {
          // Scroll down = Dar linha
          this.playerKite.lineLength = Math.min(this.playerKite.maxLine, this.playerKite.lineLength + 2.4);
          this.playerKite.tension = Math.max(0.15, this.playerKite.tension - 0.15);
        } else if (e.deltaY < 0) {
          // Scroll up = Recolher rápido
          this.playerKite.lineLength = Math.max(this.playerKite.minLine, this.playerKite.lineLength - 2.4);
          this.triggerPlayerSocada(0.55);
        }
      },
      { passive: true }
    );

    // On-screen tactile buttons
    const bindHoldBtn = (id, onDown, onUp) => {
      const btn = document.getElementById(id);
      const start = (e) => {
        e.preventDefault();
        this.sound.init();
        btn.classList.add('pressed');
        onDown();
      };
      const end = () => {
        btn.classList.remove('pressed');
        onUp();
      };
      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointerleave', end);
      btn.addEventListener('pointercancel', end);
    };

    bindHoldBtn('pad-left', () => { this.padSteer = -1; }, () => { if (this.padSteer < 0) this.padSteer = 0; });
    bindHoldBtn('pad-right', () => { this.padSteer = 1; }, () => { if (this.padSteer > 0) this.padSteer = 0; });
    bindHoldBtn('act-pull', () => { this.uiHold.pull = true; }, () => { this.uiHold.pull = false; });
    bindHoldBtn('act-release', () => { this.uiHold.release = true; }, () => { this.uiHold.release = false; });
    bindHoldBtn('act-release-fast', () => { this.uiHold.quickRelease = true; }, () => { this.uiHold.quickRelease = false; });
    document.getElementById('act-disbicar').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.sound.init();
      const direction = Math.abs(this.padSteer) > 0.2 ? this.padSteer : (Math.sign(this.playerKite.noseAngle) || 1);
      if (this.playerKite.triggerDisbicar(direction)) {
        this.sound.playSocada(0.75);
        this._flashDeckBtn('act-disbicar');
      }
    });

    document.getElementById('act-socar').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.sound.init();
      this.triggerPlayerSocada(1.05);
    });
    document.getElementById('act-disque-l').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.sound.init();
      this.playerKite.triggerDisque(-1);
      this.sound.playSocada(0.85);
      this._flashDeckBtn('act-disque-l');
    });
    document.getElementById('act-disque-r').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.sound.init();
      this.playerKite.triggerDisque(1);
      this.sound.playSocada(0.85);
      this._flashDeckBtn('act-disque-r');
    });

    // Mobile character movement pad: independent touch pointers allow diagonals.
    document.querySelectorAll('[data-move]').forEach((button) => {
      const direction = button.dataset.move;
      const startMove = (e) => {
        e.preventDefault();
        button.setPointerCapture?.(e.pointerId);
        this.touchMove.add(direction);
        button.classList.add('pressed');
      };
      const stopMove = (e) => {
        if (e) e.preventDefault();
        this.touchMove.delete(direction);
        button.classList.remove('pressed');
      };
      button.addEventListener('pointerdown', startMove);
      button.addEventListener('pointerup', stopMove);
      button.addEventListener('pointercancel', stopMove);
      button.addEventListener('lostpointercapture', stopMove);
    });

    const sprintButton = document.getElementById('touch-sprint');
    sprintButton?.addEventListener('pointerdown', (e) => {
      e.preventDefault(); this.touchSprint = true; sprintButton.classList.add('pressed');
    });
    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      sprintButton?.addEventListener(eventName, () => {
        this.touchSprint = false; sprintButton.classList.remove('pressed');
      });
    }
    document.getElementById('touch-launch')?.addEventListener('click', () => {
      if (this.characterMode) this._tapPlayerKite();
    });

    const reelButton = document.getElementById('btn-rabiola-reel');
    if (reelButton) {
      const startReel = (event) => {
        event.preventDefault();
        this.rabiolaReelHeld = true;
        reelButton.classList.add('pressed');
      };
      const stopReel = () => {
        this.rabiolaReelHeld = false;
        reelButton.classList.remove('pressed');
      };
      reelButton.addEventListener('pointerdown', startReel);
      reelButton.addEventListener('pointerup', stopReel);
      reelButton.addEventListener('pointerleave', stopReel);
      reelButton.addEventListener('pointercancel', stopReel);
      window.addEventListener('pointerup', stopReel);
    }
  }

  _gatherPlayerControls() {
    if (this.rabiolaLock) {
      this.previousReleaseHeld = false;
      return { pull: false, release: false, quickRelease: false, steer: 0, largada: false };
    }
    if (this.characterMode) { this.previousReleaseHeld = false; return { pull: false, release: false, quickRelease: false, steer: 0, largada: false }; }
    if (!this.started) {
      // Gentle scenic autopilot on title screen!
      const t = performance.now() * 0.001;
      this.previousReleaseHeld = false;
      return {
        pull: false,
        release: false,
        quickRelease: false,
        largada: false,
        steer: Math.sin(t * 0.85) * 0.32,
        steerTarget: Math.sin(t * 0.85) * 0.25
      };
    }

    const pullKey = !!(this.keys['KeyW'] || this.keys['ArrowUp']);
    const relKey = !!(this.keys['KeyS'] || this.keys['ArrowDown']);
    const leftKey = !!(this.keys['KeyA'] || this.keys['ArrowLeft']);
    const rightKey = !!(this.keys['KeyD'] || this.keys['ArrowRight']);

    const pointerHeldPull =
      this.pointer.down && performance.now() - this.pointer.downTime > 55;

    let steer = 0;
    if (leftKey) steer -= 1;
    if (rightKey) steer += 1;
    if (this.padSteer !== 0) steer = this.padSteer;

    // Smooth drag steering when holding pointer on canvas
    if (this.pointer.down) {
      const dx = (this.pointer.currX - this.pointer.startX) / 110;
      if (Math.abs(dx) > 0.08) {
        steer = THREE.MathUtils.clamp(dx, -1, 1);
      }
    }

    const pull = pullKey || this.uiHold.pull || pointerHeldPull;
    const quickRelease = !pull && (!!this.keys['KeyR'] || this.uiHold.quickRelease);
    const release = !pull && !quickRelease && (relKey || this.uiHold.release || this.pointer.rightDown);
    const dischargeHeld = release || quickRelease;
    const largada = dischargeHeld && !this.previousReleaseHeld;
    this.previousReleaseHeld = dischargeHeld;

    // Highlight HUD buttons to mirror keyboard actions
    document.getElementById('act-pull')?.classList.toggle('pressed', pull);
    document.getElementById('act-release')?.classList.toggle('pressed', release);
    document.getElementById('act-release-fast')?.classList.toggle('pressed', quickRelease);
    document.getElementById('pad-left')?.classList.toggle('pressed', steer < -0.2);
    document.getElementById('pad-right')?.classList.toggle('pressed', steer > 0.2);

    return { pull, release, quickRelease, largada, steer, steerTarget: steer * 0.78 };
  }

  _openRabiolaLock(driftingKite) {
    this.rabiolaLock = {
      kite: driftingKite,
      phase: 'lockpick',
      lock: createRabiolaLockState(driftingKite.modelId, this.elapsedTime),
      reelProgress: 0
    };
    document.getElementById('rabiola-lock-title').textContent = `Desembarace a ${KITE_MODELS[driftingKite.modelId]?.name || 'pipa'}`;
    document.getElementById('rabiola-lock-help').textContent =
      'A rabiola prendeu na sua linha. Acerte a faixa verde para soltar cada volta sem deixar o nó apertar.';
    document.getElementById('rabiola-lock-overlay').classList.remove('hidden');
    document.getElementById('rabiola-lock-pick-phase').classList.remove('hidden');
    document.getElementById('rabiola-lock-reel-phase').classList.add('hidden');
    document.getElementById('rabiola-lock-status').textContent = 'Trava 1 de 5 · aperte quando a agulha passar no verde';
    this._renderRabiolaLockPins();
  }

  _renderRabiolaLockPins() {
    const session = this.rabiolaLock;
    const pins = document.getElementById('rabiola-lock-pins');
    if (!session || !pins) return;
    pins.innerHTML = Array.from({ length: 5 }, (_, index) =>
      `<span class="rabiola-lock-pin ${index < session.lock.stage ? 'done' : ''}"></span>`
    ).join('');
  }

  _attemptRabiolaLockpick() {
    const session = this.rabiolaLock;
    if (!session || session.phase !== 'lockpick') return false;
    const result = attemptRabiolaLock(session.lock, this.elapsedTime);
    session.lock = result.state;
    this.sound.playWoodTick(result.hit ? 0.13 : 0.075);

    if (result.hit) {
      document.getElementById('rabiola-lock-status').textContent = result.complete
        ? 'NÓ DESFEITO! Agora puxe a pipa até você.'
        : `Volta solta! Trava ${result.state.stage + 1} de 5.`;
    } else {
      document.getElementById('rabiola-lock-status').textContent =
        `Puxão fora do ponto · erro ${result.state.mistakes}/3. Espere a próxima passagem verde.`;
    }
    this._renderRabiolaLockPins();

    if (result.failed) {
      this._failRabiolaRecovery();
    } else if (result.complete) {
      this._beginRabiolaReel();
    }
    return result.hit;
  }

  _beginRabiolaReel() {
    const session = this.rabiolaLock;
    if (!session) return;
    session.phase = 'reel';
    session.reelProgress = 0;
    session.kite.snagged = false;
    session.kite.recovering = true;
    document.getElementById('rabiola-lock-pick-phase').classList.add('hidden');
    document.getElementById('rabiola-lock-reel-phase').classList.remove('hidden');
    document.getElementById('rabiola-lock-title').textContent = 'Agora recolha a pipa';
    document.getElementById('rabiola-lock-help').textContent =
      'A rabiola está desembolada. A pipa continua no alto: segure W ou o botão para trazer ela até o pipeiro.';
    document.getElementById('rabiola-reel-status').textContent =
      `${KITE_MODELS[session.kite.modelId]?.name || 'Pipa'} solta da linha. Puxe aos poucos para não perder o controle.`;
    this.sound.playWoodTick(0.16);
  }

  _updateRabiolaRecovery(dt) {
    const session = this.rabiolaLock;
    if (!session) return;

    if (session.phase === 'lockpick') {
      const reading = getRabiolaLockReading(session.lock, this.elapsedTime);
      const zone = document.getElementById('rabiola-lock-zone');
      const needle = document.getElementById('rabiola-lock-needle');
      zone.style.left = `${(reading.target - reading.halfWindow) * 100}%`;
      zone.style.width = `${reading.halfWindow * 200}%`;
      needle.style.left = `${reading.cursor * 100}%`;
      return;
    }

    const pulling = !!(
      this.keys['KeyW'] || this.keys['ArrowUp'] || this.rabiolaReelHeld
    );
    if (pulling) {
      session.reelProgress = Math.min(1, session.reelProgress + dt * 0.34);
    }
    session.kite.recoveryProgress = session.reelProgress;
    session.kite.recoveryPulling = pulling;
    _recoveryTarget.set(0.48, 1.54, -0.62)
      .applyEuler(this.world.playerAvatar.rotation)
      .add(this.world.playerAvatar.position);
    session.kite.recoveryTarget.copy(_recoveryTarget);
    document.getElementById('rabiola-reel-fill').style.width = `${session.reelProgress * 100}%`;
    document.getElementById('rabiola-reel-status').textContent = pulling
      ? 'Puxando a linha... continue segurando até a pipa chegar.'
      : 'A pipa está parada no vento. Segure W ou o botão para recolher.';
    if (session.reelProgress >= 1) this._completeRabiolaRecovery();
  }

  _failRabiolaRecovery() {
    const session = this.rabiolaLock;
    if (!session) return;
    session.kite.snagged = false;
    session.kite.recovering = false;
    session.kite.velocity.copy(this.windVec).multiplyScalar(0.62);
    session.kite.velocity.y -= 0.65;
    this.rabiolaLock = null;
    this.rabiolaReelHeld = false;
    document.getElementById('rabiola-lock-overlay').classList.add('hidden');
    this.sound.playSocada(0.42);
    this.showBanner('A PIPA ESCAPOU!', 'O nó apertou e ela voltou a boiar no vento. Tente laçar a rabiola novamente.', 'danger');
  }

  _completeRabiolaRecovery() {
    const session = this.rabiolaLock;
    if (!session) return;
    const recovered = session.kite;
    const modelName = KITE_MODELS[recovered.modelId]?.name || 'pipa avoada';
    recovered.alive = false;
    this.rabiolaLock = null;
    this.rabiolaReelHeld = false;
    document.getElementById('rabiola-lock-overlay').classList.add('hidden');

    // The recovered kite becomes the one in the pipeiro's hands. Nothing stays
    // wrapped around the flying line, and it still needs three manual launch taps.
    this.playerConfig.modelId = recovered.modelId;
    this.playerConfig.patternId = recovered.patternId || this.playerConfig.patternId;
    this.applyPlayerCustomization();
    this._preparePlayerKiteInHand();
    this._enterPreLaunchMode();

    this.catches++;
    this._recordProgress('catch');
    const points = 250 * this.combo;
    this.score += points;
    this.combo = Math.min(8, this.combo + 1);
    this.sound.playCatch();
    this.effects.emitSparks(this.playerKite.position, 16, true);
    this.showBanner(
      'PIPA RESGATADA!',
      `Você trouxe a ${modelName} até o pipeiro. Ela está na sua mão; dê três tapas para empinar. +${points} pts`,
      'catch'
    );
  }

  showBanner(tag, text, style = 'normal') {
    const banner = document.getElementById('event-banner');
    const tagEl = document.getElementById('event-tag');
    const txtEl = document.getElementById('event-text');

    tagEl.textContent = tag;
    tagEl.className = 'event-tag';
    if (style === 'danger') tagEl.classList.add('danger');
    else if (style === 'catch') tagEl.classList.add('catch');

    txtEl.textContent = text;
    banner.classList.remove('hidden');

    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => {
      banner.classList.add('hidden');
    }, 3400);
  }

  _updateWind(time, dt = 0.016) {
    const preset = this.world.currentPreset;

    // The previous gust curve changed both wind speed and direction too much.
    // Keep long, readable gust cycles and reserve strong variation for the
    // dedicated Ventania weather preset rather than every normal flight.
    let speed = preset.baseWind
      + Math.sin(time * 0.17) * preset.gustStrength * 0.32
      + Math.sin(time * 0.39 + 0.8) * preset.gustStrength * 0.12;

    if (this.gameMode === 'torneio') {
      speed += (this.tournamentWave - 1) * 0.5;
    } else if (this.gameMode === 'zen') {
      speed = this.zenWindOverride + Math.sin(time * 0.2) * 0.35;
    }

    // Wind mostly follows the same corridor; crosswind changes are gradual
    // and limited so a kite never gets a sudden sideways shove.
    const lateralAngle = Math.sin(time * 0.075) * 0.105
      + Math.cos(time * 0.16) * 0.04;
    _windTarget.set(
      Math.sin(lateralAngle) * speed,
      0.22 + Math.sin(time * 0.18) * 0.035,
      -Math.cos(lateralAngle) * speed
    );

    // Smooth weather changes and frame-to-frame gust transitions.
    const blend = 1 - Math.exp(-Math.max(0.001, dt) * 1.65);
    this.windVec.lerp(_windTarget, blend);
  }

  _processCombatAndCollisions(dt) {
    // Reset relo flags
    this.playerKite.inRelo = false;
    const activeRivals = this._getActiveRivals();
    for (const r of activeRivals) r.kite.inRelo = false;

    const activeKites = [];
    if (this.playerKite.active) activeKites.push(this.playerKite);
    for (const r of activeRivals) {
      if (r.kite.active) activeKites.push(r.kite);
    }

    let closestPlayerDist = Infinity;
    let closestPlayerPt = new THREE.Vector3();
    let closestRivalPt = new THREE.Vector3();
    let closestPlayerU = -1;
    let closestPlayerCrossingQuality = 0;
    let closestPlayerOpponentIntegrity = 1;
    let playerReloIntensity = 0;
    let playerReloSpeed = 0;

    // A physical rabiola contact only starts the rescue challenge. The kite is
    // not granted and no trophy-rabiola is attached to the player's line.
    if (!this.rabiolaLock) {
      for (const dk of this.driftingKites) {
        if (!dk.alive || dk.snagged || dk.recovering || dk.age < 0.75) continue;
        const tailCount = dk.visual?.activeTailNodes || 0;
        if (tailCount < 5) continue;
        const rabiolaNodes = dk.visual.tailNodes.slice(0, tailCount);

        for (const k of activeKites) {
          if (!k.isPlayer || !k.active || !Array.isArray(k.stringNodes)) continue;
          const capture = findRabiolaCapture(k.stringNodes, rabiolaNodes, 0.22, 2);
          if (!capture) continue;

          dk.snagged = true;
          this.effects.emitSparks(capture.point, 10, true);
          this._openRabiolaLock(dk);
          this.sound.playWoodTick(0.12);
          this.showBanner(
            'RABIOLA ENROLADA!',
            'A pipa ainda está avoada. Desembarace as voltas para começar a recolher.',
            'normal'
          );
          break;
        }
        if (this.rabiolaLock) break;
      }
    }

    if (!this.started || this.gameMode === 'zen') {
      this.lastReloDistance = Infinity;
      this.lastReloCrossingQuality = 0;
      this._updateProximityHUD(null);
      return { reloIntensity: 0, reloSpeed: 0, playerHighlightU: -1 };
    }

    // 2. Pairwise 3D String Collision ("Relo") & Tail Cutting ("Rabicó")
    for (let a = 0; a < activeKites.length; a++) {
      for (let b = a + 1; b < activeKites.length; b++) {
        const kA = activeKites[a];
        const kB = activeKites[b];
        if (!kA.active || !kB.active) continue;

        let minDist = Infinity;
        let bestI = 14;
        let bestJ = 14;

        // Check upper 82% of strings (above rooftop parapets)
        for (let i = 5; i < STRING_SEGMENTS; i++) {
          const p1 = kA.stringNodes[i];
          const q1 = kA.stringNodes[i + 1];
          for (let j = 5; j < STRING_SEGMENTS; j++) {
            const p2 = kB.stringNodes[j];
            const q2 = kB.stringNodes[j + 1];
            // Fast coarse midpoint filter before exact 3D segment distance
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const dz = p1.z - p2.z;
            if (dx * dx + dy * dy + dz * dz > 260) continue;

            const d = closestPointsBetweenSegments(p1, q1, p2, q2, _ptA, _ptB);
            if (d < minDist) {
              minDist = d;
              bestI = i;
              bestJ = j;
              _bestPtA.copy(_ptA);
              _bestPtB.copy(_ptB);
            }
          }
        }

        const involvesPlayer = kA.isPlayer || kB.isPlayer;
        if (involvesPlayer && minDist < closestPlayerDist) {
          closestPlayerDist = minDist;
          if (kA.isPlayer) {
            closestPlayerPt.copy(_bestPtA);
            closestRivalPt.copy(_bestPtB);
            closestPlayerU = bestI / STRING_SEGMENTS;
            closestPlayerOpponentIntegrity = kB.lineIntegrity;
          } else {
            closestPlayerPt.copy(_bestPtB);
            closestRivalPt.copy(_bestPtA);
            closestPlayerU = bestJ / STRING_SEGMENTS;
            closestPlayerOpponentIntegrity = kA.lineIntegrity;
          }
        }

        _segmentDirA.subVectors(kA.stringNodes[bestI + 1], kA.stringNodes[bestI]).normalize();
        _segmentDirB.subVectors(kB.stringNodes[bestJ + 1], kB.stringNodes[bestJ]).normalize();
        const directionDot = THREE.MathUtils.clamp(Math.abs(_segmentDirA.dot(_segmentDirB)), 0, 1);
        const crossingQuality = Math.sqrt(Math.max(0, 1 - directionDot * directionDot));
        if (involvesPlayer && minDist < closestPlayerDist + 0.0001) {
          closestPlayerCrossingQuality = crossingQuality;
        }

        // Check if string slices opponent's Rabiola ("Cortar Rabiola / Deixar Rabicó")
        if (minDist >= 1.45) {
          this._checkRabiolaSlash(kA, kB);
          this._checkRabiolaSlash(kB, kA);
        }

        // Active RELO Contact!
        const reloThreshold = 1.8;
        if (minDist < reloThreshold && crossingQuality > 0.09) {
          kA.inRelo = true;
          kB.inRelo = true;

          _midPt.addVectors(_bestPtA, _bestPtB).multiplyScalar(0.5);
          this.effects.emitSparks(_midPt, 4, false);

          const uA = bestI / STRING_SEGMENTS;
          const uB = bestJ / STRING_SEGMENTS;

          const relativeSpeed = kA.velocity.distanceTo(kB.velocity);
          kA.reloContactTime = Math.min(0.9, kA.reloContactTime + dt);
          kB.reloContactTime = Math.min(0.9, kB.reloContactTime + dt);
          const powerA = this._computeCutAttackPower(kA, uA, uB, crossingQuality, relativeSpeed, kB);
          const powerB = this._computeCutAttackPower(kB, uB, uA, crossingQuality, relativeSpeed, kA);

          // Correct angle, entry height and timing decide who loses line integrity.
          const combatDamage = this.gameMode === 'online'
            ? { playerAttack: 1, rivalAttack: 1 }
            : getCombatDamageMultipliers(this.matchDifficulty);
          const damageA = kA.isPlayer ? combatDamage.playerAttack : combatDamage.rivalAttack;
          const damageB = kB.isPlayer ? combatDamage.playerAttack : combatDamage.rivalAttack;
          kB.lineIntegrity -= powerA * dt * damageA / (kB.lineType.durability || 1);
          kA.lineIntegrity -= powerB * dt * damageB / (kA.lineType.durability || 1);

          if (involvesPlayer) {
            playerReloIntensity = 1.0;
            playerReloSpeed = kA.velocity.length() + kB.velocity.length() + Math.abs(kA.reelSpeed);
          }

          if (kA.lineIntegrity <= 0 || kB.lineIntegrity <= 0) {
            // Determine winner if simultaneous
            const aWins = kB.lineIntegrity <= kA.lineIntegrity;
            const winner = aWins ? kA : kB;
            const loser = aWins ? kB : kA;
            const loserU = aWins ? uB : uA;
            this._executeLineCut(winner, loser, _midPt, loserU);
          }
        }
      }
    }

    // Recover line HP once per kite, independent of how many rivals are nearby.
    for (const kite of activeKites) {
      if (!kite.inRelo) {
        kite.lineIntegrity = Math.min(1.0, kite.lineIntegrity + dt * (kite.lineType.recovery || 0.45));
        kite.reloContactTime = Math.max(0, kite.reloContactTime - dt * 2.4);
      }
    }

    this.lastReloDistance = closestPlayerDist;
    this.lastReloCrossingQuality = closestPlayerCrossingQuality;

    // Update 3D Proximity Ring & HUD
    if (this.playerKite.active && closestPlayerDist < 8.5) {
      const camDistP = closestPlayerPt.distanceTo(this.camera.position);
      const camDistR = closestRivalPt.distanceTo(this.camera.position);
      const playerInFront = camDistP < camDistR;

      const cue = {
        active: true,
        distance: closestPlayerDist,
        point: closestPlayerPt,
        playerInFront,
        inRelo: this.playerKite.inRelo,
        integrity: this.playerKite.lineIntegrity,
        opponentIntegrity: closestPlayerOpponentIntegrity,
        crossingQuality: closestPlayerCrossingQuality
      };
      this.effects.updateProximityCue(cue, this.camera);
      this._updateProximityHUD(cue);
    } else {
      this.effects.updateProximityCue(null, this.camera);
      this._updateProximityHUD(null);
    }

    return {
      reloIntensity: playerReloIntensity,
      reloSpeed: playerReloSpeed,
      playerHighlightU: closestPlayerDist < 5.5 ? closestPlayerU : -1
    };
  }

  _getRearAdvantage(attacker, defender) {
    let fx = defender.velocity.x, fy = defender.velocity.y, fz = defender.velocity.z;
    let fl = Math.hypot(fx, fy, fz);
    if (fl < 0.8) {
      fx = defender.position.x - defender.anchorPos.x;
      fy = defender.position.y - defender.anchorPos.y;
      fz = defender.position.z - defender.anchorPos.z;
      fl = Math.hypot(fx, fy, fz) || 1;
    }
    const rx = attacker.position.x - defender.position.x;
    const ry = attacker.position.y - defender.position.y;
    const rz = attacker.position.z - defender.position.z;
    const rl = Math.hypot(rx, ry, rz) || 1;
    const alignment = (rx * fx + ry * fy + rz * fz) / (rl * fl);
    return alignment < -0.25 ? 1 : 0;
  }

  _getWindAlignment(kite) {
    const speed = Math.hypot(kite.velocity.x, kite.velocity.y, kite.velocity.z);
    const windSpeed = this.windVec.length();
    if (speed < 0.25 || windSpeed < 0.25) return 0.5;
    const dot = (kite.velocity.x * this.windVec.x + kite.velocity.y * this.windVec.y + kite.velocity.z * this.windVec.z) / (speed * windSpeed);
    return THREE.MathUtils.clamp((dot + 1) * 0.5, 0, 1);
  }

  _computeCutAttackPower(attacker, uSelf, uEnemy, crossingQuality = 0, relativeSpeed = 0, defender = null) {
    const defenderExposure = defender && defender.reelSpeed > 5 && !defender.lineType.dischargeSafe
      ? THREE.MathUtils.clamp((defender.reelSpeed - 5) / 22, 0, 1)
      : 0;
    return evaluateReloScore({
      crossingQuality,
      tension: attacker.tension,
      reelSpeed: attacker.reelSpeed,
      kiteSpeed: attacker.velocity.length(),
      relativeSpeed,
      socada: attacker.socadaBoost,
      disque: attacker.disqueBoost,
      disbicar: attacker.disbicarBoost,
      largadaActive: attacker.largadaBoost > 0,
      largadaQuality: attacker.largadaQuality,
      linePower: attacker.lineType.cutPower * attacker.visual.spec.powerMult,
      windAlignment: this._getWindAlignment(attacker),
      wrapQuality: THREE.MathUtils.clamp(attacker.reloContactTime / 0.42, 0, 1),
      rearAdvantage: defender ? this._getRearAdvantage(attacker, defender) : 0,
      defenderExposure,
      ownU: uSelf,
      targetU: uEnemy
    });
  }

  _checkRabiolaSlash(attacker, defender) {
    if (defender.tailCutCooldown > 0 || defender.visual.activeTailNodes <= 6) return;
    if (attacker.tension < 0.68 && attacker.socadaBoost < 0.25) return;

    const tailNodes = defender.visual.tailNodes;
    const count = defender.visual.activeTailNodes;

    for (let s = 16; s < STRING_SEGMENTS; s += 2) {
      const sp = attacker.stringNodes[s];
      for (let t = 4; t < count; t += 2) {
        if (sp.distanceToSquared(tailNodes[t]) < 0.95) {
          const severed = defender.visual.cutTailAt(t);
          if (severed) {
            defender.tailCutCooldown = 4.0;
            this.effects.spawnSeveredTail(severed);
            this.effects.emitSparks(tailNodes[t], 8, false);
            if (attacker.isPlayer) {
              this.score += 60;
              this._recordProgress('tailCut');
              this.sound.playSocada(0.9);
              this.showBanner('RASPÃO!', `Cortou a rabiola de ${defender.name} — Ficou Rabicó! +60`, 'normal');
            } else if (defender.isPlayer) {
              this.sound.playSocada(0.9);
              this.showBanner('FICOU RABICÓ!', `${attacker.name} podou sua rabiola! Cuidado com o giro!`, 'danger');
            }
            return;
          }
        }
      }
    }
  }

  _executeLineCut(winner, loser, cutPoint, loserU) {
    if (this.replayBuffer.length >= 2) {
      this.lastReplayFrames = this.replayBuffer.slice();
      document.getElementById('btn-replay')?.classList.remove('hidden');
    }
    this.effects.emitSparks(cutPoint, 26, true);
    winner.lineIntegrity = 1.0;

    // Spawn Drifting Unattached Kite ("Pipa Avoada") at loser's exact pose!
    const drifting = new DriftingKite(this.scene, {
      modelId: loser.visual.modelId,
      patternId: loser.visual.patternId,
      startPos: loser.position,
      startQuat: loser.quaternion,
      cutPoint
    });
    this.driftingKites.push(drifting);

    // Describe authentic Brazilian cut technique
    let moveName = 'no relo';
    if (winner.disqueBoost > 0.2) moveName = 'no disque';
    else if (winner.disbicarBoost > 0.2) moveName = 'no disbicar';
    else if (winner.socadaBoost > 0.25) moveName = 'na socada';
    else if (winner.largadaTagTimer > 0 && winner.largadaQuality >= 0.68) moveName = 'na largada';
    else if (winner.reelSpeed < -9) moveName = 'na puxada';
    else if (winner.reelSpeed > 9) moveName = 'no descarrego';
    else if (loserU > 0.82) moveName = 'no cabresto';
    else if (winner.tension > 0.78) moveName = 'na puxada';

    if (loser.isPlayer) {
      // Player was cut!
      this.playerLaunched = false;
      this.playerKiteInHand = false;
      loser.active = false;
      loser.visual.setVisible(false);
      loser.lineMesh.visible = false;
      this.combo = 1;
      this.lastCutTargetPos = drifting.position;
      this.sound.playCut(false);
      this.showBanner('FOI CORTADO!', `${winner.name} te cortou ${moveName}!`, 'danger');

      document.getElementById('relaunch-reason').textContent =
        `${winner.name} levou sua pipa ${moveName}! Suba outra da laje para dar o troco.`;
      document.getElementById('relaunch-overlay').classList.remove('hidden');
    } else {
      // Rival was cut!
      const rivalEntry = this.rivals.find((r) => r.kite === loser);
      if (rivalEntry) {
        const respawnDelay = this.matchDifficulty === 'hard' ? 2.8 : this.matchDifficulty === 'easy' ? 5.2 : 4.2;
        rivalEntry.ai.onCut(respawnDelay);
      }

      if (winner.isPlayer) {
        this.cuts++;
        this._recordProgress('cut');
        const basePts = 150 * this.combo;
        const weakLineBonus = loser.lineType.cutPower > winner.lineType.cutPower ? 100 : 0;
        const pts = basePts + weakLineBonus;
        this.score += pts;
        const comboLabel = this.combo >= 6 ? 'HEXA' : this.combo === 5 ? 'PENTA' : this.combo === 4 ? 'QUADRA' : this.combo === 3 ? 'TRIPLO' : this.combo === 2 ? 'DUPLO' : '';
        this.combo = Math.min(8, this.combo + 1);
        this.progression.updateCombo(this.combo);
        this.sound.playCut(true);
        const bonusText = `${comboLabel ? ` • ${comboLabel}` : ''}${weakLineBonus ? ' • BÔNUS LINHA FRACA' : ''}`;
        this.showBanner('MANDOU!', `Cortou ${loser.name} ${moveName}! +${pts} pts${bonusText}`, 'normal');

        // Advance wave in Torneio mode every 3 cuts!
        if (this.gameMode === 'torneio' && this.cuts % 3 === 0) {
          this.tournamentWave++;
          this.score += 300;
          document.getElementById('hud-mode-badge').textContent =
            `TORNEIO REI DA LAJE • RODADA ${this.tournamentWave}`;
          setTimeout(() => {
            this.showBanner('NOVA RODADA!', `Rodada ${this.tournamentWave} — O vento apertou! +300 Bônus`, 'catch');
          }, 1400);
        }
      } else {
        // Rival cut another rival in the background!
        this.showBanner('RELO NO CÉU!', `${winner.name} mandou ${loser.name} — Corre pra aparar!`, 'normal');
      }
    }
  }

  _updateProximityHUD(cue) {
    const card = document.getElementById('proximity-hud');
    if (!cue) {
      card.classList.add('hidden');
      card.classList.remove('in-relo');
      return;
    }

    card.classList.remove('hidden');
    const titleEl = document.getElementById('prox-title');
    const distEl = document.getElementById('prox-dist');
    const hintEl = document.getElementById('prox-hint');
    const playerMeter = document.getElementById('relo-meter-player');
    const rivalMeter = document.getElementById('relo-meter-rival');
    const playerHp = Math.max(0, Math.round(cue.integrity * 100));
    const rivalHp = Math.max(0, Math.round((cue.opponentIntegrity ?? 1) * 100));
    playerMeter.style.width = `${playerHp}%`;
    rivalMeter.style.width = `${rivalHp}%`;
    document.getElementById('prox-player-hp').textContent = `${playerHp}%`;
    document.getElementById('prox-rival-hp').textContent = `${rivalHp}%`;

    if (cue.inRelo) {
      card.classList.add('in-relo');
      titleEl.textContent = '🔥 RELO! LINHAS CRUZANDO!';
      distEl.textContent = 'ATRITO!';
      if (cue.crossingQuality >= 0.34) hintEl.textContent = 'RELO ATIVO — segure W (PUXAR) e toque ESPAÇO (SOCAR). Q/E ajudam no giro.';
      else hintEl.textContent = 'LINHAS EM CONTATO — ajuste com A/D e use W + ESPAÇO para aumentar o corte.';
    } else {
      card.classList.remove('in-relo');
      titleEl.textContent = cue.playerInFront ? 'LINHA PELA FRENTE' : 'LINHA POR TRÁS';
      distEl.textContent = `${cue.distance.toFixed(1)}m`;
      const approachHint = cue.crossingQuality >= 0.72
        ? 'Ângulo bom — aguarde o contato e faça a largada.'
        : cue.crossingQuality >= 0.34
          ? 'Ângulo médio — ajuste a entrada antes do contato.'
          : 'Entrada quase paralela — reposicione para não ficar em desvantagem.';
      hintEl.textContent = `${cue.playerInFront ? 'Sua linha está mais rasa. ' : 'Sua linha está mais funda. '}${approachHint} Quando encostar e aparecer RELO, segure W e toque ESPAÇO.`;
    }
  }

  _updateCamera(dt) {
    const mode = this.cameraModes[this.camModeIdx].id;
    const focusPos = this.playerKite.active
      ? this.playerKite.position
      : (this.lastCutTargetPos || new THREE.Vector3(0, 28, -40));

    if (mode === 'laje') {
      // Realistic 1st-person Pipeiro view on the Laje framing mureta + rooftops + sky
      const eyePos = _camDesiredPos.set(0, 11.48, 17.8);
      this.camera.position.lerp(eyePos, Math.min(1, dt * 10));

      // Blend gaze slightly below raw kite height when kite is lower/mid so the laje & neighborhood anchor the view,
      // while still tracking high climbs smoothly!
      _lookAhead.set(
        focusPos.x * 0.78,
        THREE.MathUtils.clamp(focusPos.y * 0.74, 15.5, 42),
        focusPos.z
      );
      this.camLookTarget.lerp(_lookAhead, Math.min(1, dt * 8));
      this.camera.lookAt(this.camLookTarget);

      const dist = this.camera.position.distanceTo(focusPos);
      const targetFov = THREE.MathUtils.clamp(60 - (dist - 55) * 0.16, 42, 60);
      if (Math.abs(this.camera.fov - targetFov) > 0.05) {
        this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5);
        this.camera.updateProjectionMatrix();
      }
    } else if (mode === 'aerea') {
      // Elevated Aerial Chase Camera above & behind the kite looking out over the kite + 3D neighborhood below!
      _camDesiredPos.set(
        focusPos.x * 0.88,
        Math.max(18, focusPos.y + 5.8),
        focusPos.z + 16.5
      );

      this.camera.position.lerp(_camDesiredPos, Math.min(1, dt * 6.5));
      _lookAhead.set(focusPos.x * 0.92, focusPos.y - 3.4, focusPos.z - 18);
      this.camLookTarget.lerp(_lookAhead, Math.min(1, dt * 9));
      this.camera.lookAt(this.camLookTarget);

      if (Math.abs(this.camera.fov - 58) > 0.1) {
        this.camera.fov += (58 - this.camera.fov) * Math.min(1, dt * 6);
        this.camera.updateProjectionMatrix();
      }
    } else if (mode === 'primeira_pessoa') {
      const avatar = this.world.playerAvatar;
      _launchForward.set(0, 0, 1).applyEuler(avatar.rotation).normalize();
      _camDesiredPos.set(avatar.position.x, avatar.position.y + 1.62, avatar.position.z);
      this.camera.position.lerp(_camDesiredPos, Math.min(1, dt * 12));
      if (this.playerKiteInHand) {
        _lookAhead.copy(avatar.position).addScaledVector(_launchForward, 22);
        _lookAhead.y += 1.1;
      } else {
        _lookAhead.copy(focusPos);
        _lookAhead.y += 0.6;
      }
      this.camLookTarget.lerp(_lookAhead, Math.min(1, dt * 12));
      this.camera.lookAt(this.camLookTarget);
      if (Math.abs(this.camera.fov - 66) > 0.1) {
        this.camera.fov += (66 - this.camera.fov) * Math.min(1, dt * 7);
        this.camera.updateProjectionMatrix();
      }
    } else if (mode === 'personagem') {
      const avatar = this.world.playerAvatar.position;
      _camDesiredPos.set(avatar.x, avatar.y + 3.7, avatar.z + 7.8);
      this.camera.position.lerp(_camDesiredPos, Math.min(1, dt * 7.5));
      _lookAhead.set(avatar.x, avatar.y + 1.9, avatar.z - 5.5);
      if (!this.characterMode && this.playerKite.active) {
        _lookAhead.lerp(this.playerKite.position, 0.22);
      }
      this.camLookTarget.lerp(_lookAhead, Math.min(1, dt * 8));
      this.camera.lookAt(this.camLookTarget);
      if (Math.abs(this.camera.fov - 58) > 0.1) {
        this.camera.fov += (58 - this.camera.fov) * Math.min(1, dt * 6);
        this.camera.updateProjectionMatrix();
      }
    } else {
      // Duelo Camera: frames midpoint between player's kite and nearest active rival
      let nearest = null;
      let minD = Infinity;
      for (const r of this.rivals) {
        if (!r.kite.active) continue;
        const d = r.kite.position.distanceTo(focusPos);
        if (d < minD) {
          minD = d;
          nearest = r.kite.position;
        }
      }

      const mid = nearest
        ? _lookAhead.addVectors(focusPos, nearest).multiplyScalar(0.5)
        : _lookAhead.copy(focusPos);

      const spread = nearest ? Math.max(18, Math.min(52, minD * 0.85)) : 22;
      _camDesiredPos.set(mid.x * 0.45, Math.max(18, mid.y + 3.5), mid.z + spread);
      this.camera.position.lerp(_camDesiredPos, Math.min(1, dt * 5));
      this.camLookTarget.lerp(mid, Math.min(1, dt * 8));
      this.camera.lookAt(this.camLookTarget);

      if (Math.abs(this.camera.fov - 52) > 0.1) {
        this.camera.fov += (52 - this.camera.fov) * Math.min(1, dt * 6);
        this.camera.updateProjectionMatrix();
      }
    }
  }

  _updateHUD() {
    document.getElementById('stat-score').textContent = this.score.toLocaleString('pt-BR');
    document.getElementById('stat-cuts').textContent = this.cuts;
    document.getElementById('stat-catches').textContent = this.catches;
    document.getElementById('stat-combo').textContent = `x${this.combo}`;

    const windKmh = Math.round(this.windVec.length() * 3.6);
    document.getElementById('val-wind').textContent = windKmh;
    const windDeg = THREE.MathUtils.radToDeg(Math.atan2(this.windVec.x, -this.windVec.z));
    document.getElementById('wind-arrow').style.transform = `rotate(${windDeg.toFixed(1)}deg)`;

    document.getElementById('val-line').textContent = Math.round(this.playerKite.lineLength);
    const tailPct = Math.round(this.playerKite.visual.getTailRatio() * 100);
    const tailEl = document.getElementById('val-tail');
    tailEl.textContent = tailPct < 55 ? `Rabicó (${tailPct}%)` : `${tailPct}%`;
    tailEl.style.color = tailPct < 55 ? '#fb7185' : '#f8fafc';

    const t = this.playerKite.tension;
    document.getElementById('bar-tension').style.width = `${Math.round(t * 100)}%`;
    const stateEl = document.getElementById('val-tension-state');
    if (this.playerKite.stalled) {
      stateEl.textContent = 'Estolando — descarregue';
      stateEl.style.color = '#fb7185';
    } else if (t < 0.28) {
      stateEl.textContent = 'Bamba (Giro)';
      stateEl.style.color = '#f8fafc';
    } else if (t > 0.78) {
      stateEl.textContent = 'Esticada (Corte!)';
      stateEl.style.color = '#facc15';
    } else {
      stateEl.textContent = 'Firme';
      stateEl.style.color = '#f8fafc';
    }
  }

  _captureReplayKite(kite) {
    return {
      active: kite.active,
      visible: kite.visual.group.visible,
      lineVisible: kite.lineMesh.visible,
      position: kite.position.toArray(),
      quaternion: kite.quaternion.toArray(),
      linePoints: Float32Array.from(kite.stringNodes.flatMap((node) => node.toArray()))
    };
  }

  _captureReplayFrame() {
    return {
      time: this.elapsedTime,
      player: this._captureReplayKite(this.playerKite),
      rivals: this.rivals.map((entry) => this._captureReplayKite(entry.kite))
    };
  }

  _recordReplayFrame(dt) {
    if (!this.started || this.replayPlayback) return;
    this.replayCaptureAccumulator += dt;
    if (this.replayCaptureAccumulator < 0.09) return;
    this.replayCaptureAccumulator = 0;
    this.replayBuffer.push(this._captureReplayFrame());
    if (this.replayBuffer.length > 72) this.replayBuffer.shift();
  }

  _applyReplayKite(kite, first, second = null, alpha = 0) {
    if (!first) return;
    _replayPosition.fromArray(first.position);
    if (second) _replayPosition.lerp(_replayNextPosition.fromArray(second.position), alpha);
    _replayQuaternion.fromArray(first.quaternion);
    if (second) _replayQuaternion.slerp(_replayNextQuaternion.fromArray(second.quaternion), alpha);
    kite.active = first.active;
    kite.position.copy(_replayPosition);
    kite.quaternion.copy(_replayQuaternion);
    kite.visual.group.position.copy(_replayPosition);
    kite.visual.group.quaternion.copy(_replayQuaternion);
    kite.visual.setVisible(first.visible);
    kite.lineMesh.visible = first.lineVisible;
    if (first.linePoints?.length === (STRING_SEGMENTS + 1) * 3) {
      for (let i = 0; i <= STRING_SEGMENTS; i++) {
        const offset = i * 3;
        const x = first.linePoints[offset];
        const y = first.linePoints[offset + 1];
        const z = first.linePoints[offset + 2];
        if (second?.linePoints?.length === first.linePoints.length) {
          kite.stringNodes[i].set(
            x + (second.linePoints[offset] - x) * alpha,
            y + (second.linePoints[offset + 1] - y) * alpha,
            z + (second.linePoints[offset + 2] - z) * alpha
          );
        } else {
          kite.stringNodes[i].set(x, y, z);
        }
      }
      kite.lineGeo.setPositions(kite.stringNodes.flatMap((node) => node.toArray()));
    }
  }

  _toggleReplay() {
    if (this.replayPlayback) {
      this._finishReplay();
      return;
    }
    if (!this.lastReplayFrames || this.lastReplayFrames.length < 2) return;
    this._startReplay();
  }

  _startReplay() {
    const button = document.getElementById('btn-replay');
    if (!this.lastReplayFrames || this.lastReplayFrames.length < 2) return;
    this.replaySavedState = {
      player: this._captureReplayKite(this.playerKite),
      rivals: this.rivals.map((entry) => this._captureReplayKite(entry.kite)),
      cameraPosition: this.camera.position.clone(),
      cameraQuaternion: this.camera.quaternion.clone(),
      cameraFov: this.camera.fov,
      camModeIdx: this.camModeIdx
    };
    this.replayPlayback = { frames: this.lastReplayFrames, elapsed: 0 };
    if (button) {
      button.dataset.replaying = 'true';
      button.querySelector('span:last-child').textContent = 'Sair replay';
    }
    this.showBanner('REPLAY CINEMATOGRÁFICO', 'Revendo os últimos instantes do confronto.', 'catch');
  }

  _updateReplayPlayback(dt) {
    const playback = this.replayPlayback;
    if (!playback) return;
    const frames = playback.frames;
    playback.elapsed += dt * 0.72;
    const framePosition = playback.elapsed / 0.09;
    const index = Math.min(frames.length - 1, Math.floor(framePosition));
    const alpha = Math.min(1, framePosition - index);
    const first = frames[index];
    const second = frames[Math.min(frames.length - 1, index + 1)];
    this._applyReplayKite(this.playerKite, first.player, second.player, alpha);

    const midpoint = _replayMidpoint.copy(this.playerKite.position);
    let rivalCount = 0;
    for (let i = 0; i < this.rivals.length; i++) {
      const a = first.rivals[i];
      const b = second.rivals[i];
      if (!a) continue;
      const kite = this.rivals[i].kite;
      this._applyReplayKite(kite, a, b, alpha);
      if (a.active) {
        midpoint.add(kite.position);
        rivalCount++;
      }
    }
    midpoint.divideScalar(rivalCount + 1);

    const orbit = playback.elapsed * 0.72;
    this.camera.position.set(
      midpoint.x + Math.sin(orbit) * 19,
      midpoint.y + 8 + Math.sin(orbit * 0.6) * 2.5,
      midpoint.z + 24 + Math.cos(orbit) * 7
    );
    this.camera.lookAt(midpoint);
    this.renderer.render(this.scene, this.camera);
    if (index >= frames.length - 1) this._finishReplay();
  }

  _finishReplay() {
    if (!this.replayPlayback || !this.replaySavedState) return;
    const saved = this.replaySavedState;
    this._applyReplayKite(this.playerKite, saved.player);
    for (let i = 0; i < this.rivals.length; i++) {
      if (saved.rivals[i]) this._applyReplayKite(this.rivals[i].kite, saved.rivals[i]);
    }
    this.camera.position.copy(saved.cameraPosition);
    this.camera.quaternion.copy(saved.cameraQuaternion);
    this.camera.fov = saved.cameraFov;
    this.camera.updateProjectionMatrix();
    this.camModeIdx = saved.camModeIdx;
    document.getElementById('label-camera').textContent = this.cameraModes[this.camModeIdx].label;
    const button = document.getElementById('btn-replay');
    if (button) {
      delete button.dataset.replaying;
      button.querySelector('span:last-child').textContent = 'Replay';
    }
    this.replayPlayback = null;
    this.replaySavedState = null;
  }

  _animate() {
    requestAnimationFrame(this._animate);
    if (this.paused) {
      this.lastFrameMs = performance.now();
      return;
    }

    const nowMs = performance.now();
    const rawDt = (nowMs - this.lastFrameMs) * 0.001;
    this.lastFrameMs = nowMs;
    const dt = Math.min(0.04, Math.max(0.001, rawDt));
    if (this.replayPlayback) {
      this._updateReplayPlayback(dt);
      return;
    }
    this.elapsedTime += dt;
    const elapsed = this.elapsedTime;

    try {
      this._updateRabiolaRecovery(dt);

    // 1. Update wind, scene and character exploration.
    this._updateWind(elapsed, dt);
    this._updateCharacterMovement(dt);
    this._updateHeldPlayerKite(dt);
    const camModeId = this.cameraModes[this.camModeIdx].id;
    this.world.update(this.windVec, elapsed, dt, (camModeId !== 'laje' && camModeId !== 'primeira_pessoa') || (this.characterMode && camModeId !== 'primeira_pessoa'));

    // 2. Gather player input & update camera + 3D carretilha
    const playerControls = this._gatherPlayerControls();
    if (playerControls.largada && this.playerKite.active) {
      const near = Number.isFinite(this.lastReloDistance) ? Math.max(0, 1 - this.lastReloDistance / 4.8) : 0;
      const quality = THREE.MathUtils.clamp(near * 0.52 + this.lastReloCrossingQuality * 0.34 + (1 - Math.min(1, Math.abs(this.playerKite.tension - 0.7))) * 0.14, 0, 1);
      if (this.playerKite.triggerLargada(quality) && this.lastReloDistance < 6.5) {
        this.showBanner(quality >= 0.68 ? 'LARGADA NO TEMPO!' : 'LARGADA FORA DO TEMPO', quality >= 0.68 ? 'Boa entrada no cruzamento!' : 'Você soltou fora da janela — cuidado com a linha!', quality >= 0.68 ? 'catch' : 'danger');
      }
    }
    this._updateCamera(dt);

    if (camModeId !== 'laje') {
      this.carretilha.baseWorldPos.set(
        this.world.playerAvatar.position.x,
        this.world.playerAvatar.position.y + 1.12,
        this.world.playerAvatar.position.z
      );
    }
    this.carretilha.update({
      reelDelta: this.playerKite.reelSpeed * 0.08,
      steerInput: playerControls.steer,
      camera: this.camera,
      cameraMode: camModeId,
      dt
    });

    // Anchor player's string directly to rotating 3D carretilha rim!
    this.carretilha.getLineExitWorldPosition(this.playerKite.anchorPos);

    // 3. Combat & Proximity check from current geometry
    const combatInfo = this._processCombatAndCollisions(dt);

    // 4. Update Player Kite Physics
    const playerGroundY = Math.max(
      this.world.getTerrainHeight(this.playerKite.position.x, this.playerKite.position.z) + 1.4,
      this.playerKite.anchorPos.y + 0.25
    );

    this.playerKite.condition = this.progression.getKiteCondition(this.playerConfig.modelId);
    this.playerKite.update({
      controls: playerControls,
      windVec: this.windVec,
      sunDir: this.world.sunDir,
      cameraPos: this.camera.position,
      minGroundY: playerGroundY,
      reloHighlightU: combatInfo.playerHighlightU,
      reloHighlightStrength: combatInfo.reloIntensity > 0 ? 1.0 : 0.45,
      dt,
      time: elapsed
    });

    this._updateKiteWear(dt);

    // 5. Update Rival AI Kites
    const difficulty = getAIDifficulty({
      matchDifficulty: this.matchDifficulty,
      gameMode: this.gameMode,
      tournamentWave: this.tournamentWave
    });
    for (const r of this._getActiveRivals()) {
      const aiControls = r.ai.update({
        playerKite: this.playerKite,
        allRivals: this.rivals,
        driftingKites: this.driftingKites,
        gameMode: this.gameMode,
        difficulty,
        dt
      });

      const aiDischargeHeld = !!(aiControls.release || aiControls.quickRelease);
      if (aiDischargeHeld && !r.previousReleaseHeld) {
        r.kite.triggerLargada(r.kite.inRelo ? 0.82 : 0.12);
      }
      r.previousReleaseHeld = aiDischargeHeld;

      const gY = this.world.getTerrainHeight(r.kite.position.x, r.kite.position.z) + 5.5;
      r.kite.update({
        controls: aiControls,
        windVec: this.windVec,
        sunDir: this.world.sunDir,
        cameraPos: this.camera.position,
        minGroundY: gY,
        reloHighlightU: r.kite.inRelo ? 0.7 : -1,
        reloHighlightStrength: r.kite.inRelo ? 0.9 : 0,
        dt,
        time: elapsed
      });
    }

    // 6. Update Drifting Cut Kites & Sky Particle Effects
    for (let i = this.driftingKites.length - 1; i >= 0; i--) {
      const dk = this.driftingKites[i];
      dk.update(this.windVec, this.world.sunDir, this.camera.position, dt);
      if (!dk.alive) {
        dk.dispose();
        this.driftingKites.splice(i, 1);
      }
    }

    this.effects.update(this.windVec, dt, [
      ...(this.playerKite.active ? [this.playerKite] : []),
      ...this._getActiveRivals().filter((r) => r.kite.active).map((r) => r.kite)
    ]);
    this._updateRemotePlayers(dt);
    this._sendNetworkState(nowMs);

    // 7. Continuous Procedural Audio & HUD Telemetry
    this.sound.updateContinuous({
      windSpeed: this.windVec.length(),
      kiteSpeed: this.playerKite.active ? this.playerKite.velocity.length() : 0,
      spoolSpeed: this.playerKite.active ? this.playerKite.reelSpeed : 0,
      reloIntensity: combatInfo.reloIntensity,
      reloSpeed: combatInfo.reloSpeed,
      kiteModelId: this.playerConfig.modelId,
      kiteActive: this.playerKite.active,
      airborneKites: [
        ...(this.playerKite.active
          ? [{ modelId: this.playerConfig.modelId }]
          : []),
        ...this._getActiveRivals()
          .filter((rival) => rival.kite.active)
          .map((rival) => ({ modelId: rival.kite.visual?.spec?.id || 'murcha' }))
      ],
      lineTension: this.playerKite.tension,
      dt
    });

    if (this.started) {
      this._updateHUD();
    }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.lastRuntimeError !== message) {
        this.lastRuntimeError = message;
        console.error('[Vento & Laje] erro na simulação; mantendo a cena 3D visível:', error);
      }
    }

    // Keep drawing the world even if a gameplay subsystem throws. This makes a
    // physics bug diagnosable without turning the entire play area into a blank screen.
    this._recordReplayFrame(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.pipaGame = new Pipa3DGame();
  if ('serviceWorker' in navigator && !import.meta.env.DEV) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}), { once: true });
  }
});

const _ptA = new THREE.Vector3();
const _ptB = new THREE.Vector3();
const _bestPtA = new THREE.Vector3();
const _bestPtB = new THREE.Vector3();
const _segmentDirA = new THREE.Vector3();
const _segmentDirB = new THREE.Vector3();
const _midPt = new THREE.Vector3();
const _camDesiredPos = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _upOffset = new THREE.Vector3();
const _lookAhead = new THREE.Vector3();
const _heldKiteLocal = new THREE.Vector3(0.48, 1.54, -0.62);
const _heldKiteEuler = new THREE.Euler();
const _launchForward = new THREE.Vector3();
const _recoveryTarget = new THREE.Vector3();

const _replayMidpoint = new THREE.Vector3();
const _replayPosition = new THREE.Vector3();
const _replayNextPosition = new THREE.Vector3();
const _replayQuaternion = new THREE.Quaternion();
const _replayNextQuaternion = new THREE.Quaternion();
const _windTarget = new THREE.Vector3();
