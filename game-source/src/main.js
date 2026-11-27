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

class Pipa3DGame {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.sound = new SoundEngine();
    this.progression = new ProgressionStore();

    // Game state
    this.started = false;
    this.gameMode = 'festival'; // 'festival' | 'torneio' | 'zen'
    this.weatherOrder = ['tarde', 'pordosol', 'ventania'];
    this.weatherIdx = 0;

    this.cameraModes = [
      { id: 'laje', label: 'Câm: Laje' },
      { id: 'aerea', label: 'Câm: Aérea' },
      { id: 'duelo', label: 'Câm: Duelo' },
      { id: 'personagem', label: 'Câm: Pipeiro' }
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
    document.getElementById('btn-weather').addEventListener('click', () => this.cycleWeather());
    document.getElementById('btn-oficina').addEventListener('click', () => this.openOficina());
    document.getElementById('btn-explore').addEventListener('click', () => this.toggleCharacterMode());
    const openOnline = () => document.getElementById('online-modal').classList.remove('hidden');
    document.getElementById('btn-online').addEventListener('click', openOnline);
    document.getElementById('btn-open-online-start').addEventListener('click', openOnline);
    document.getElementById('btn-close-online').addEventListener('click', () => {
      document.getElementById('online-modal').classList.add('hidden');
    });
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

    // Populate Oficina options
    this._populateOficina();
  }

  _applyMapSelection(mapId) {
    const result = this.world.setMap(mapId);
    this.selectedMap = this.world.mapId;
    const spawn = result.spawn;
    this.world.playerAvatar.position.copy(spawn);
    this.world.playerAvatar.rotation.set(0, 0, 0);
    this.carretilha.baseWorldPos.copy(spawn).add(new THREE.Vector3(0, 1.12, 0));
    this.carretilha.root.position.copy(this.carretilha.baseWorldPos);
    this.carretilha.root.rotation.set(0, 0, 0);
    this.carretilha.getLineExitWorldPosition(this.playerKite.anchorPos);
    this.playerKite.spawnInSky(true);

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
    if (this.started) this.showBanner('NOVO CENÁRIO', `${labels[this.selectedMap]} selecionado. Explore e escolha seu ponto de voo.`, 'normal');
  }

  toggleCharacterMode() {
    if (!this.started) {
      this.startGame();
    }
    this.characterMode = !this.characterMode;
    document.body.classList.toggle('character-mode', this.characterMode);
    document.getElementById('touch-char-controls')?.classList.toggle('hidden', !this.characterMode);
    if (this.characterMode) {
      this.camModeIdx = this.cameraModes.findIndex((camera) => camera.id === 'personagem');
      this.world.playerAvatar.visible = true;
      document.getElementById('label-explore').textContent = 'Empinar';
      this.showBanner('MODO EXPLORAÇÃO', 'Use W A S D para andar. Pressione E para escolher este local e empinar.', 'normal');
    } else {
      document.getElementById('label-explore').textContent = 'Explorar';
      if (this.selectedMap === 'laje') this.camModeIdx = 0;
      else this.camModeIdx = 1;
      this.showBanner('MODO PIPA', 'Você voltou a controlar a pipa. Boa ventania!', 'normal');
    }
    document.getElementById('label-camera').textContent = this.cameraModes[this.camModeIdx].label;
  }

  _placeKiteAtCharacter() {
    const avatar = this.world.playerAvatar;
    const floorY = this.selectedMap === 'laje' ? 9.74 : this.world.getTerrainHeight(avatar.position.x, avatar.position.z);
    avatar.position.y = floorY;
    this.carretilha.baseWorldPos.set(avatar.position.x, floorY + 1.12, avatar.position.z);
    this.carretilha.root.position.copy(this.carretilha.baseWorldPos);
    this.carretilha.root.rotation.set(0, avatar.rotation.y, 0);
    this.carretilha.getLineExitWorldPosition(this.playerKite.anchorPos);
    this.playerKite.spawnInSky(true);
    this.playerKite.triggerSocada(0.8);
    this.characterMode = false;
    document.body.classList.remove('character-mode');
    document.getElementById('touch-char-controls')?.classList.add('hidden');
    this.touchMove.clear();
    this.touchSprint = false;
    document.getElementById('label-explore').textContent = 'Explorar';
    this.camModeIdx = this.cameraModes.findIndex((camera) => camera.id === 'personagem');
    document.getElementById('label-camera').textContent = this.cameraModes[this.camModeIdx].label;
    this.sound.playSocada(0.9);
    this.showBanner('LOCAL ESCOLHIDO', 'Pipa lançada deste ponto. Agora é só controlar o voo!', 'normal');
  }

  _updateCharacterMovement(dt) {
    if (!this.characterMode) return;
    const avatar = this.world.playerAvatar;
    const direction = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp'] || this.touchMove.has('up')) direction.z -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'] || this.touchMove.has('down')) direction.z += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'] || this.touchMove.has('left')) direction.x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight'] || this.touchMove.has('right')) direction.x += 1;
    const moving = direction.lengthSq() > 0;
    if (moving) {
      direction.normalize();
      const speed = (this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.touchSprint ? 8.2 : 4.8) * dt;
      avatar.position.addScaledVector(direction, speed);
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
    }
    this.carretilha.baseWorldPos.set(avatar.position.x, avatar.position.y + 1.12, avatar.position.z);
  }

  _setOnlineStatus(message) {
    const status = document.getElementById('online-status');
    if (status) status.textContent = message;
  }

  async _connectOnline(create) {
    const name = document.getElementById('online-name').value.trim() || 'Pipeiro';
    const room = document.getElementById('online-room').value.trim();
    const serverUrl = document.getElementById('online-server').value.trim();
    if (!create && !room) {
      this._setOnlineStatus('Digite o código da sala que seu amigo enviou.');
      return;
    }
    document.getElementById('btn-create-room').disabled = true;
    document.getElementById('btn-join-room').disabled = true;
    try {
      await this.multiplayer.connect({
        name, room, create, serverUrl, mapId: this.selectedMap
      });
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
      document.getElementById('online-room-created').classList.remove('hidden');
      document.getElementById('online-room').value = message.roomCode;
      this._applyMapSelection(message.mapId || this.selectedMap);
      this.setGameMode('online');
      this.startGame();
      document.getElementById('online-modal').classList.add('hidden');
      this._syncRemoteRoster(message.players || []);
      this._setOnlineStatus(`Conectado! Compartilhe o código ${message.roomCode} com seus amigos.`);
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
    }
  }

  _handleOnlineReloResult(message) {
    const localId = this.multiplayer.playerId;
    const winnerName = message.winnerName || 'Pipeiro';
    const loserName = message.loserName || 'Pipeiro';

    if (message.loserId === localId) {
      this.playerKite.active = false;
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
        const btn = document.createElement('button');
        btn.className = `opt-chip ${this.playerConfig.lineTypeId === lt.id ? 'active' : ''}`;
        btn.innerHTML = `<span class="swatch-dot" style="background:${lt.hex}"></span><span>${lt.name}</span>`;
        btn.addEventListener('click', () => {
          this.playerConfig.lineTypeId = lt.id;
          this.applyPlayerCustomization();
          renderLines();
        });
        linesBox.appendChild(btn);
      });
      const selected = LINE_TYPES[this.playerConfig.lineTypeId] || LINE_TYPES.branca_pura;
      const dischargeNote = selected.dischargeSafe ? ' • PROTEGIDA AO DESCARREGAR' : '';
      lineDesc.textContent = `${selected.desc} • ATAQUE ${Math.round(selected.cutPower * 100)} • HP ${Math.round(selected.durability * 100)} • RECUPERAÇÃO ${Math.round(selected.recovery * 100)}${dischargeNote}`;
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
    this.carretilha.setLineColor(LINE_TYPES[this.playerConfig.lineTypeId].hex);
    this.sound.playSocada(0.6);
  }

  _getActiveRivals() {
    return this.gameMode === 'duelo' ? this.rivals.slice(0, 1) : this.rivals;
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
    if (mode === 'duelo') {
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
    } else if (previousMode === 'duelo') {
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
    document.getElementById('hud-bottom').classList.remove('hud-hidden');
    document.getElementById('controls-guide').classList.remove('hud-hidden');

    if (!this.playerKite.active) {
      this.relaunchPlayerKite();
    } else {
      this.triggerPlayerSocada(0.85);
    }
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
    if (!this.playerKite.active) {
      this.relaunchPlayerKite();
      return;
    }
    this.playerKite.triggerSocada(strength);
    this.carretilha.triggerSocada(strength);
    this.sound.playSocada(strength);
    this._flashDeckBtn('act-socar');
  }

  relaunchPlayerKite() {
    document.getElementById('relaunch-overlay').classList.add('hidden');
    this.lastCutTargetPos = null;
    this.playerKite.spawnInSky(true); // Launches low right above your laje so you climb it up!
    this.triggerPlayerSocada(1.0);
    this.showBanner('NA MÃO!', 'Nova pipa subindo da laje — Soca e dá linha!', 'normal');
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

      if (!wasPressed && this.started) {
        if (code === 'Space') {
          this.triggerPlayerSocada(1.0);
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
          this._placeKiteAtCharacter();
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
      if (this.characterMode) this._placeKiteAtCharacter();
    });
  }

  _gatherPlayerControls() {
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
        steer: Math.sin(t * 0.85) * 0.32
      };
    }

    const pullKey = !!(this.keys['KeyW'] || this.keys['ArrowUp']);
    const relKey = !!(this.keys['KeyS'] || this.keys['ArrowDown']);
    const leftKey = !!(this.keys['KeyA'] || this.keys['ArrowLeft']);
    const rightKey = !!(this.keys['KeyD'] || this.keys['ArrowRight']);

    const pointerHeldPull =
      this.pointer.down && performance.now() - this.pointer.downTime > 190;

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

    return { pull, release, quickRelease, largada, steer };
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

  _updateWind(time) {
    const preset = this.world.currentPreset;
    let speed = preset.baseWind +
      Math.sin(time * 0.42) * preset.gustStrength * 0.65 +
      Math.sin(time * 1.15) * preset.gustStrength * 0.35;

    if (this.gameMode === 'torneio') {
      speed += (this.tournamentWave - 1) * 0.85;
    } else if (this.gameMode === 'zen') {
      speed = this.zenWindOverride + Math.sin(time * 0.5) * 0.8;
    }

    // Gentle wind directionshifts (-Z primary corridor with realistic lateral breeze)
    const lateralAngle = Math.sin(time * 0.23) * 0.24 + Math.cos(time * 0.51) * 0.09;
    this.windVec.set(
      Math.sin(lateralAngle) * speed,
      0.45 + Math.sin(time * 0.7) * 0.25,
      -Math.cos(lateralAngle) * speed
    );
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

    // 1. Check Drifting Kites ("Aparar Pipa no Alto")
    for (const dk of this.driftingKites) {
      if (!dk.alive || dk.age < 0.75) continue;
      for (const k of activeKites) {
        // Check kite body or upper string catching drifting kite or its trailing line
        let caught = k.position.distanceTo(dk.position) < 3.1;
        if (!caught) {
          for (let s = 14; s < STRING_SEGMENTS; s += 2) {
            const sn = k.stringNodes[s];
            for (let t = 0; t < dk.trailNodes.length; t += 2) {
              if (sn.distanceToSquared(dk.trailNodes[t]) < 5.2) {
                caught = true;
                break;
              }
            }
            if (caught) break;
          }
        }

        if (caught) {
          dk.alive = false;
          this.effects.emitSparks(dk.position, 14, true);
          if (k.isPlayer) {
            this.catches++;
            this._recordProgress('catch');
            const pts = 250 * this.combo;
            this.score += pts;
            this.combo = Math.min(8, this.combo + 1);
            this.sound.playCatch();
            this.showBanner('APAROU NO ALTO!', `Laçou a pipa avoada! +${pts} pts`, 'catch');
          } else {
            this.showBanner('XEPA AÉREA', `${k.name} aparou uma pipa no alto!`, 'normal');
          }
          break;
        }
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
        const reloThreshold = 1.42;
        if (minDist < reloThreshold && crossingQuality > 0.16) {
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
          kB.lineIntegrity -= powerA * dt * 0.92 / (kB.lineType.durability || 1);
          kA.lineIntegrity -= powerB * dt * 0.92 / (kA.lineType.durability || 1);

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
      if (rivalEntry) rivalEntry.ai.onCut(4.5);

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
      if (cue.crossingQuality >= 0.72) hintEl.textContent = 'CRUZAMENTO LIMPO — toque em DAR LINHA no tempo certo para a largada!';
      else if (cue.crossingQuality >= 0.34) hintEl.textContent = 'ÂNGULO MÉDIO — ajuste a posição antes de descarregar a linha.';
      else hintEl.textContent = 'ENTRADA RUIM — linhas quase paralelas; reposicione ou você pode perder.';
    } else {
      card.classList.remove('in-relo');
      titleEl.textContent = cue.playerInFront ? 'LINHA PELA FRENTE' : 'LINHA POR TRÁS';
      distEl.textContent = `${cue.distance.toFixed(1)}m`;
      const approachHint = cue.crossingQuality >= 0.72
        ? 'Ângulo bom — aguarde o contato e faça a largada.'
        : cue.crossingQuality >= 0.34
          ? 'Ângulo médio — ajuste a entrada antes do contato.'
          : 'Entrada quase paralela — reposicione para não ficar em desvantagem.';
      hintEl.textContent = `${cue.playerInFront ? 'Sua linha está mais rasa. ' : 'Sua linha está mais funda. '}${approachHint}`;
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
    if (t < 0.28) stateEl.textContent = 'Bamba (Giro)';
    else if (t > 0.78) stateEl.textContent = 'Esticada (Corte!)';
    else stateEl.textContent = 'Firme';
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
    this.elapsedTime += dt;
    const elapsed = this.elapsedTime;

    // 1. Update wind, scene and character exploration.
    this._updateWind(elapsed);
    this._updateCharacterMovement(dt);
    const camModeId = this.cameraModes[this.camModeIdx].id;
    this.world.update(this.windVec, elapsed, dt, camModeId !== 'laje' || this.characterMode);

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
    const playerGroundY =
      this.world.getTerrainHeight(this.playerKite.position.x, this.playerKite.position.z) + 4.5;

    this.playerKite.update({
      controls: playerControls,
      windVec: this.windVec,
      sunDir: this.world.sunDir,
      cameraPos: this.camera.position,
      minGroundY: playerGroundY,
      reloHighlightU: combatInfo.playerHighlightU,
      reloHighlightStrength: combatInfo.reloIntensity > 0 ? 1.0 : 0.45,
      dt
    });

    // 5. Update Rival AI Kites
    const difficulty = this.gameMode === 'torneio' ? 0.9 + this.tournamentWave * 0.16 : 1.0;
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
        dt
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

    this.effects.update(this.windVec, dt);
    this._updateRemotePlayers(dt);
    this._sendNetworkState(nowMs);

    // 7. Continuous Procedural Audio & HUD Telemetry
    this.sound.updateContinuous({
      windSpeed: this.windVec.length(),
      kiteSpeed: this.playerKite.active ? this.playerKite.velocity.length() : 2,
      spoolSpeed: this.playerKite.active ? this.playerKite.reelSpeed : 0,
      reloIntensity: combatInfo.reloIntensity,
      reloSpeed: combatInfo.reloSpeed,
      dt
    });

    if (this.started) {
      this._updateHUD();
    }

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
