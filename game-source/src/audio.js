// Procedural Realistic Web Audio Engine for Pipa 3D.
// Licensed CC0 foley references add real-world paper, reel and line details.
// Each kite gets its own procedural paper/frame signature. These are synthesized
// from the model's shape and frame feel, not falsely presented as field recordings.
const KITE_SOUND_PROFILES = Object.freeze({
  murcha:    { rate: 1.00, volume: 0.98, tapTone: 220, tapFilter: 1420, tapDuration: 0.078, airTone: 1.00 },
  raia:      { rate: 1.13, volume: 0.86, tapTone: 286, tapFilter: 1900, tapDuration: 0.061, airTone: 1.15 },
  latao:     { rate: 0.84, volume: 1.18, tapTone: 148, tapFilter: 940,  tapDuration: 0.108, airTone: 0.86 },
  peixinho:  { rate: 1.07, volume: 0.91, tapTone: 248, tapFilter: 1650, tapDuration: 0.067, airTone: 1.09 },
  papagaio:  { rate: 0.95, volume: 0.98, tapTone: 211, tapFilter: 1380, tapDuration: 0.083, airTone: 0.97 },
  delta:     { rate: 1.09, volume: 0.94, tapTone: 264, tapFilter: 1810, tapDuration: 0.071, airTone: 1.12 },
  estrela:   { rate: 0.88, volume: 1.08, tapTone: 181, tapFilter: 1160, tapDuration: 0.096, airTone: 0.91 },
  hexagonal: { rate: 0.90, volume: 1.13, tapTone: 172, tapFilter: 1080, tapDuration: 0.092, airTone: 0.92 },
  peixao:    { rate: 0.82, volume: 1.22, tapTone: 136, tapFilter: 860,  tapDuration: 0.114, airTone: 0.82 },
  capucheta: { rate: 1.19, volume: 0.79, tapTone: 314, tapFilter: 2140, tapDuration: 0.056, airTone: 1.22 },
  morcego:   { rate: 1.05, volume: 0.96, tapTone: 238, tapFilter: 1540, tapDuration: 0.076, airTone: 1.07 },
  quadrada:  { rate: 0.93, volume: 0.95, tapTone: 198, tapFilter: 1260, tapDuration: 0.087, airTone: 0.95 },
  rokkaku:   { rate: 0.89, volume: 1.06, tapTone: 207, tapFilter: 1320, tapDuration: 0.082, airTone: 0.93 }
});

const FOLEY_URLS = Object.freeze({
  kiteFlap: 'https://sfxmint.com/dl/paper-fabric-fabric-39.mp3',
  reelWinding: 'https://sfxmint.com/dl/fishing-reel-02.mp3',
  lineSqueal: 'https://sfxmint.com/dl/fishing-reel-04.mp3',
  lineSnap: 'https://sfxmint.com/dl/fishing-reel-03.mp3'
});

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.initialized = false;
    this.masterGain = null;

    // Continuous nodes
    this.windGain = null;
    this.windFilter = null;
    this.reloGain = null;
    this.reloFilter = null;
    this.reloOsc = null;
    this.reloOscGain = null;
    this.spoolGain = null;
    this.spoolFilter = null;

    this.lastTickTime = 0;
    this.spoolPhase = 0;
    this.referenceAudio = null;
    this.externalFlapTimer = 0.7;
    this.externalSpoolTimer = 0.3;
    this.reloWasActive = false;
  }

  init() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.enabled ? 0.75 : 0.0;
      this.masterGain.connect(this.ctx.destination);

      // Create reusable 3-second pink/brown noise buffer
      const sampleRate = this.ctx.sampleRate;
      const length = sampleRate * 3;
      this.noiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
        b6 = white * 0.115926;
      }

      // 1. Continuous Wind Layer
      const windSource = this.ctx.createBufferSource();
      windSource.buffer = this.noiseBuffer;
      windSource.loop = true;

      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 340;
      this.windFilter.Q.value = 0.65;

      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.12;

      windSource.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.masterGain);
      windSource.start();

      // 2. Continuous Relo (Line Friction Sizzle) Layer
      const reloNoise = this.ctx.createBufferSource();
      reloNoise.buffer = this.noiseBuffer;
      reloNoise.loop = true;

      this.reloFilter = this.ctx.createBiquadFilter();
      this.reloFilter.type = 'bandpass';
      this.reloFilter.frequency.value = 3400;
      this.reloFilter.Q.value = 4.2;

      this.reloGain = this.ctx.createGain();
      this.reloGain.gain.value = 0.0;

      reloNoise.connect(this.reloFilter);
      this.reloFilter.connect(this.reloGain);
      this.reloGain.connect(this.masterGain);
      reloNoise.start();

      this.reloOsc = this.ctx.createOscillator();
      this.reloOsc.type = 'sawtooth';
      this.reloOsc.frequency.value = 1850;
      this.reloOscGain = this.ctx.createGain();
      this.reloOscGain.gain.value = 0.0;
      const reloOscFilter = this.ctx.createBiquadFilter();
      reloOscFilter.type = 'bandpass';
      reloOscFilter.frequency.value = 2600;
      reloOscFilter.Q.value = 6.0;

      this.reloOsc.connect(reloOscFilter);
      reloOscFilter.connect(this.reloOscGain);
      this.reloOscGain.connect(this.masterGain);
      this.reloOsc.start();

      // 3. Continuous Carretilha Bearing Hum
      const spoolNoise = this.ctx.createBufferSource();
      spoolNoise.buffer = this.noiseBuffer;
      spoolNoise.loop = true;

      this.spoolFilter = this.ctx.createBiquadFilter();
      this.spoolFilter.type = 'bandpass';
      this.spoolFilter.frequency.value = 950;
      this.spoolFilter.Q.value = 2.8;

      this.spoolGain = this.ctx.createGain();
      this.spoolGain.gain.value = 0.0;

      spoolNoise.connect(this.spoolFilter);
      this.spoolFilter.connect(this.spoolGain);
      this.spoolGain.connect(this.masterGain);
      spoolNoise.start();

      // Natural paper flutter layer: filtered tissue-paper noise, modulated by wind and kite speed.
      const paperNoise = this.ctx.createBufferSource();
      paperNoise.buffer = this.noiseBuffer;
      paperNoise.loop = true;
      this.flutterFilter = this.ctx.createBiquadFilter();
      this.flutterFilter.type = 'bandpass';
      this.flutterFilter.frequency.value = 1180;
      this.flutterFilter.Q.value = 1.15;
      this.flutterGain = this.ctx.createGain();
      this.flutterGain.gain.value = 0;
      paperNoise.connect(this.flutterFilter);
      this.flutterFilter.connect(this.flutterGain);
      this.flutterGain.connect(this.masterGain);
      paperNoise.start();

      this._initReferenceAudio();
      this.initialized = true;
    } catch (e) {
      // Ignore audio errors in headless environments
    }
  }

  _initReferenceAudio() {
    if (this.referenceAudio || typeof window === 'undefined' || typeof window.Audio !== 'function') return;
    const create = (url) => {
      const audio = new window.Audio(url);
      audio.preload = 'auto';
      audio.volume = 0;
      audio.loop = false;
      return audio;
    };
    this.referenceAudio = {
      kiteFlap: create(FOLEY_URLS.kiteFlap),
      reelWinding: create(FOLEY_URLS.reelWinding),
      lineSqueal: create(FOLEY_URLS.lineSqueal),
      lineSnap: create(FOLEY_URLS.lineSnap)
    };
  }

  _playReference(name, volume = 0.35, playbackRate = 1) {
    const audio = this.referenceAudio?.[name];
    if (!this.enabled || !audio || !audio.paused) return false;
    try {
      audio.currentTime = 0;
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.playbackRate = Math.max(0.65, Math.min(1.45, playbackRate));
      const promise = audio.play();
      if (promise?.catch) promise.catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  _pauseReferenceAudio() {
    if (!this.referenceAudio) return;
    for (const audio of Object.values(this.referenceAudio)) {
      audio.pause();
      try { audio.currentTime = 0; } catch {}
    }
  }

  toggleMute() {
    this.enabled = !this.enabled;
    if (!this.initialized) this.init();
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.enabled ? 0.75 : 0.0, this.ctx.currentTime, 0.04);
    }
    if (!this.enabled) this._pauseReferenceAudio();
    return this.enabled;
  }

  updateContinuous({
    windSpeed = 8,
    kiteSpeed = 5,
    spoolSpeed = 0,
    reloIntensity = 0,
    reloSpeed = 10,
    kiteModelId = 'murcha',
    kiteActive = true,
    airborneKites = [],
    lineTension = 0.5,
    dt = 0.016
  }) {
    if (!this.initialized || !this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;

    // Wind modulation
    const windNorm = Math.min(1.6, (windSpeed * 0.07) + (kiteSpeed * 0.025));
    this.windFilter.frequency.setTargetAtTime(240 + windNorm * 440, now, 0.08);
    this.windGain.gain.setTargetAtTime(0.08 + windNorm * 0.16, now, 0.08);

    // Carretilha bearing spin + subtle wood clicks
    const absSpool = Math.abs(spoolSpeed);
    const spoolNorm = Math.min(1, absSpool / 28);
    this.spoolFilter.frequency.setTargetAtTime(700 + spoolNorm * 950, now, 0.05);
    this.spoolGain.gain.setTargetAtTime(spoolNorm * 0.09, now, 0.05);

    this.spoolPhase += absSpool * dt;
    if (absSpool > 3.5 && this.spoolPhase > 1.85 && now - this.lastTickTime > 0.045) {
      this.spoolPhase = 0;
      this.lastTickTime = now;
      this.playWoodTick(0.03 + spoolNorm * 0.05);
    }

    // Kite-specific paper flutter. Every model has its own pitch and loudness
    // profile, while the sound source remains the same physical paper-in-wind foley.
    const activeProfiles = Array.isArray(airborneKites)
      ? airborneKites.filter((kite) => kite && KITE_SOUND_PROFILES[kite.modelId])
        .map((kite) => KITE_SOUND_PROFILES[kite.modelId])
      : [];
    const kiteProfile = activeProfiles.length
      ? activeProfiles.reduce((mix, profile) => ({
        rate: mix.rate + profile.rate / activeProfiles.length,
        volume: mix.volume + profile.volume / activeProfiles.length,
        tapTone: mix.tapTone + profile.tapTone / activeProfiles.length,
        tapFilter: mix.tapFilter + profile.tapFilter / activeProfiles.length,
        tapDuration: mix.tapDuration + profile.tapDuration / activeProfiles.length,
        airTone: mix.airTone + profile.airTone / activeProfiles.length
      }), { rate: 0, volume: 0, tapTone: 0, tapFilter: 0, tapDuration: 0, airTone: 0 })
      : (KITE_SOUND_PROFILES[kiteModelId] || KITE_SOUND_PROFILES.murcha);
    const hasAirborneKites = kiteActive || activeProfiles.length > 0;
    const flapStrength = Math.max(0, Math.min(1.5, windSpeed / 18 * 0.55 + kiteSpeed / 28 * 0.45));
    if (this.flutterFilter && this.flutterGain) {
      const flutterLevel = hasAirborneKites
        ? Math.min(0.16, (0.009 + windSpeed * 0.0011 + kiteSpeed * 0.0025) * kiteProfile.volume)
        : 0.006;
      this.flutterFilter.frequency.setTargetAtTime(
        (760 + Math.min(1450, kiteSpeed * 38) * kiteProfile.rate) * kiteProfile.airTone,
        now,
        0.12
      );
      this.flutterGain.gain.setTargetAtTime(flutterLevel, now, 0.16);
    }

    // CC0 canvas/paper foley plays in short bursts instead of a harsh constant loop.
    this.externalFlapTimer -= dt;
    if (hasAirborneKites && flapStrength > 0.12 && this.externalFlapTimer <= 0) {
      const played = this._playReference(
        'kiteFlap',
        Math.min(0.72, (0.38 + flapStrength * 0.18) * kiteProfile.volume),
        kiteProfile.rate * (0.9 + Math.min(0.35, windSpeed / 55))
      );
      this.externalFlapTimer = played
        ? 3.1 + Math.random() * 1.4
        : 0.65;
    } else if (!kiteActive) {
      this.externalFlapTimer = Math.min(this.externalFlapTimer, 0.7);
    }

    // Real winding-reel clicks accompany sustained line movement.
    this.externalSpoolTimer -= dt;
    if (spoolNorm > 0.16 && this.externalSpoolTimer <= 0) {
      const played = this._playReference('reelWinding', 0.28 + spoolNorm * 0.24, 0.88 + spoolNorm * 0.2);
      this.externalSpoolTimer = played ? 2.25 : 0.55;
    } else if (spoolNorm <= 0.16) {
      this.externalSpoolTimer = Math.min(this.externalSpoolTimer, 0.3);
    }

    // The squealing-line sample accents the start of each RELO; the procedural
    // friction layer below sustains the sound while lines remain crossed.
    const reloActive = reloIntensity > 0.12;
    if (reloActive && !this.reloWasActive) {
      this._playReference('lineSqueal', 0.3 + Math.min(0.22, reloIntensity * 0.16), 0.92 + Math.min(0.28, reloSpeed / 70));
    }
    this.reloWasActive = reloActive;

    // Relo sizzle
    if (reloIntensity > 0.01) {
      const pitchShift = Math.min(1.5, reloSpeed / 18);
      this.reloFilter.frequency.setTargetAtTime(2800 + pitchShift * 1800, now, 0.03);
      this.reloGain.gain.setTargetAtTime(Math.min(0.36, reloIntensity * 0.34), now, 0.02);
      this.reloOsc.frequency.setTargetAtTime(1450 + pitchShift * 1100 + Math.sin(now * 48) * 90, now, 0.02);
      this.reloOscGain.gain.setTargetAtTime(Math.min(0.08, reloIntensity * 0.07), now, 0.02);
    } else {
      this.reloGain.gain.setTargetAtTime(0.0, now, 0.04);
      this.reloOscGain.gain.setTargetAtTime(0.0, now, 0.04);
    }
  }

  playWoodTick(volume = 0.05) {
    if (!this.initialized || !this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520 + Math.random() * 140, now);
    osc.frequency.exponentialRampToValueAtTime(190, now + 0.022);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.024);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.026);
  }

  // A hand flick: model-specific paper slap plus a short bamboo-frame resonance.
  playLaunchTap(kiteModelId = 'murcha', runSpeed = 0, stage = 1) {
    if (!this.initialized) this.init();
    if (!this.initialized || !this.ctx || !this.enabled || !this.noiseBuffer) return;

    const profile = KITE_SOUND_PROFILES[kiteModelId] || KITE_SOUND_PROFILES.murcha;
    const now = this.ctx.currentTime;
    const runBoost = Math.min(1, Math.max(0, runSpeed / 8.2));
    const tapStrength = Math.min(1.25, 0.78 + runBoost * 0.34 + stage * 0.035);
    const duration = profile.tapDuration;

    const paper = this.ctx.createBufferSource();
    paper.buffer = this.noiseBuffer;
    paper.playbackRate.value = 0.92 + profile.rate * 0.08 + stage * 0.025;
    const paperFilter = this.ctx.createBiquadFilter();
    paperFilter.type = 'bandpass';
    paperFilter.frequency.setValueAtTime(profile.tapFilter * (0.96 + stage * 0.035), now);
    paperFilter.frequency.exponentialRampToValueAtTime(profile.tapFilter * 0.48, now + duration);
    paperFilter.Q.value = 1.35 + profile.rate * 0.25;
    const paperGain = this.ctx.createGain();
    paperGain.gain.setValueAtTime(0.001, now);
    paperGain.gain.linearRampToValueAtTime(0.26 * tapStrength * profile.volume, now + 0.006);
    paperGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    paper.connect(paperFilter);
    paperFilter.connect(paperGain);
    paperGain.connect(this.masterGain);
    paper.start(now, Math.random() * 2.6, duration);

    const frame = this.ctx.createOscillator();
    const frameGain = this.ctx.createGain();
    frame.type = 'triangle';
    frame.frequency.setValueAtTime(profile.tapTone * (1 + stage * 0.045), now);
    frame.frequency.exponentialRampToValueAtTime(profile.tapTone * 0.52, now + duration * 1.12);
    frameGain.gain.setValueAtTime(0.001, now);
    frameGain.gain.linearRampToValueAtTime(0.13 * tapStrength, now + 0.004);
    frameGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.16);
    frame.connect(frameGain);
    frameGain.connect(this.masterGain);
    frame.start(now);
    frame.stop(now + duration * 1.2);
  }

  // Final release: a rising paper rush with a light frame overtone.
  playLaunchRelease(kiteModelId = 'murcha', quality = 0.7) {
    if (!this.initialized) this.init();
    if (!this.initialized || !this.ctx || !this.enabled) return;
    const profile = KITE_SOUND_PROFILES[kiteModelId] || KITE_SOUND_PROFILES.murcha;
    const now = this.ctx.currentTime;
    const power = Math.min(1, Math.max(0.25, quality));

    this._playReference('kiteFlap', 0.24 + power * 0.18 * profile.volume, profile.rate * 1.06);
    if (!this.noiseBuffer) return;

    const rush = this.ctx.createBufferSource();
    rush.buffer = this.noiseBuffer;
    rush.playbackRate.value = 0.72 + power * 0.3;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(profile.tapFilter * 0.72, now);
    filter.frequency.exponentialRampToValueAtTime(profile.tapFilter * 1.65, now + 0.2);
    filter.Q.value = 0.9;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.15 * profile.volume, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    rush.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    rush.start(now, Math.random() * 2.4, 0.25);

    const frame = this.ctx.createOscillator();
    const frameGain = this.ctx.createGain();
    frame.type = 'sine';
    frame.frequency.setValueAtTime(profile.tapTone * 1.55, now);
    frame.frequency.exponentialRampToValueAtTime(profile.tapTone * 2.25, now + 0.16);
    frameGain.gain.setValueAtTime(0.001, now);
    frameGain.gain.linearRampToValueAtTime(0.075 * power, now + 0.035);
    frameGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    frame.connect(frameGain);
    frameGain.connect(this.masterGain);
    frame.start(now);
    frame.stop(now + 0.21);
  }

  // Crisp silk-paper snap when player jerks the line ("Socar / Dibicar")
  playSocada(intensity = 1.0) {
    if (!this.initialized) this.init();
    if (!this.initialized || !this.ctx || !this.enabled) return;

    const now = this.ctx.currentTime;
    const vol = Math.min(1.2, Math.max(0.3, intensity));

    // Paper snap burst
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const offset = Math.random() * 1.8;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1750 + Math.random() * 350, now);
    filter.frequency.exponentialRampToValueAtTime(620, now + 0.075);
    filter.Q.value = 1.3;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.38 * vol, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now, offset, 0.1);

    // Bamboo spar flex thump + string twang
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(230 + vol * 50, now);
    osc.frequency.exponentialRampToValueAtTime(88, now + 0.07);
    oscGain.gain.setValueAtTime(0.18 * vol, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  // String cut snap + celebratory rooftop whistle if player won the cut
  playCut(playerWon = true) {
    if (!this.initialized) this.init();
    if (!this.initialized || !this.ctx || !this.enabled) return;

    const now = this.ctx.currentTime;
    this._playReference('lineSnap', 0.62, 0.96);

    // Sharp taut string snap
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1650, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);

    // Crack noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.35, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    noise.connect(hp);
    hp.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now, 0.2, 0.06);

    if (playerWon) {
      // Classic Brazilian rooftop whistle ("Fiu-fiuuu! Mandou!")
      const w1 = this.ctx.createOscillator();
      const wg1 = this.ctx.createGain();
      w1.type = 'sine';
      w1.frequency.setValueAtTime(1320, now + 0.12);
      w1.frequency.exponentialRampToValueAtTime(1960, now + 0.24);
      wg1.gain.setValueAtTime(0.001, now + 0.12);
      wg1.gain.linearRampToValueAtTime(0.12, now + 0.15);
      wg1.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      w1.connect(wg1);
      wg1.connect(this.masterGain);
      w1.start(now + 0.12);
      w1.stop(now + 0.27);

      const w2 = this.ctx.createOscillator();
      const wg2 = this.ctx.createGain();
      w2.type = 'sine';
      w2.frequency.setValueAtTime(1760, now + 0.30);
      w2.frequency.exponentialRampToValueAtTime(2350, now + 0.42);
      w2.frequency.exponentialRampToValueAtTime(1480, now + 0.62);
      wg2.gain.setValueAtTime(0.001, now + 0.30);
      wg2.gain.linearRampToValueAtTime(0.14, now + 0.34);
      wg2.gain.exponentialRampToValueAtTime(0.001, now + 0.64);
      w2.connect(wg2);
      wg2.connect(this.masterGain);
      w2.start(now + 0.30);
      w2.stop(now + 0.65);
    } else {
      // Sad downward twang when player's line snaps
      const sad = this.ctx.createOscillator();
      const sGain = this.ctx.createGain();
      sad.type = 'triangle';
      sad.frequency.setValueAtTime(420, now + 0.08);
      sad.frequency.exponentialRampToValueAtTime(130, now + 0.48);
      sGain.gain.setValueAtTime(0.18, now + 0.08);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      sad.connect(sGain);
      sGain.connect(this.masterGain);
      sad.start(now + 0.08);
      sad.stop(now + 0.52);
    }
  }

  // Catching a drifting kite ("Aparou no alto!")
  playCatch() {
    if (!this.initialized) this.init();
    if (!this.initialized || !this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const notes = [587.33, 880, 1174.66];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + idx * 0.075;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }
}
