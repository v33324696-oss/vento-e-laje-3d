const STORAGE_KEY = 'vento-laje-profile-v2';

const KITE_IDS = [
  'murcha', 'raia', 'latao', 'peixinho', 'papagaio', 'delta',
  'estrela', 'hexagonal', 'peixao', 'capucheta', 'morcego', 'quadrada', 'rokkaku'
];

const MISSION_TEMPLATES = [
  { id: 'first_cuts', title: 'Dono do céu', description: 'Faça 5 cortes', event: 'cut', target: 5, xp: 180, coins: 120 },
  { id: 'sky_catcher', title: 'Mão de aparador', description: 'Apare 3 pipas avoadas', event: 'catch', target: 3, xp: 140, coins: 100 },
  { id: 'tail_hunter', title: 'Corta-rabiola', description: 'Corte 2 rabiolas', event: 'tailCut', target: 2, xp: 120, coins: 90 }
];

const EVENT_REWARDS = {
  cut: { xp: 55, coins: 22, stat: 'cuts' },
  catch: { xp: 35, coins: 16, stat: 'catches' },
  tailCut: { xp: 25, coins: 12, stat: 'tailCuts' }
};

function createDefaultProfile() {
  return {
    version: 2,
    nickname: 'Pipeiro',
    level: 1,
    xp: 0,
    coins: 250,
    ownedLines: [],
    stats: { cuts: 0, catches: 0, tailCuts: 0, bestCombo: 1, games: 0, repairs: 0, flightSeconds: 0 },
    house: { level: 1, garageSlots: 3, visits: 0, ownedKites: ['murcha'], kiteCondition: Object.fromEntries(KITE_IDS.map((id) => [id, 100])) },
    missions: MISSION_TEMPLATES.map((mission) => ({ id: mission.id, progress: 0, claimed: false }))
  };
}

function normalizeProfile(value) {
  const base = createDefaultProfile();
  if (!value || typeof value !== 'object') return base;
  const n = (v, fallback, max = 1_000_000) => Number.isFinite(Number(v))
    ? Math.max(0, Math.min(max, Math.floor(Number(v)))) : fallback;
  const savedMissions = new Map(Array.isArray(value.missions) ? value.missions.map((m) => [m.id, m]) : []);
  return {
    ...base,
    nickname: typeof value.nickname === 'string' ? value.nickname.trim().slice(0, 18) || 'Pipeiro' : base.nickname,
    level: Math.max(1, n(value.level, 1, 999)),
    xp: n(value.xp, 0),
    coins: n(value.coins, 250),
    ownedLines: Array.isArray(value.ownedLines) ? value.ownedLines.filter((id) => id === 'linha_descarga') : [],
    stats: {
      cuts: n(value.stats?.cuts, 0),
      catches: n(value.stats?.catches, 0),
      tailCuts: n(value.stats?.tailCuts, 0),
      bestCombo: Math.max(1, n(value.stats?.bestCombo, 1, 999)),
      games: n(value.stats?.games, 0),
      repairs: n(value.stats?.repairs, 0),
      flightSeconds: n(value.stats?.flightSeconds, 0)
    },
    house: {
      level: Math.max(1, Math.min(3, n(value.house?.level, 1, 3))),
      garageSlots: Math.max(3, Math.min(7, n(value.house?.garageSlots, 3, 7))),
      visits: n(value.house?.visits, 0),
      ownedKites: [...new Set(['murcha', ...(Array.isArray(value.house?.ownedKites) ? value.house.ownedKites.filter((id) => KITE_IDS.includes(id)) : [])])],
      kiteCondition: Object.fromEntries(KITE_IDS.map((id) => [id, Math.max(0, Math.min(100, Number.isFinite(Number(value.house?.kiteCondition?.[id])) ? Number(value.house.kiteCondition[id]) : 100))]))
    },
    missions: MISSION_TEMPLATES.map((mission) => {
      const saved = savedMissions.get(mission.id) || {};
      return {
        id: mission.id,
        progress: n(saved.progress, 0, mission.target),
        claimed: saved.claimed === true
      };
    })
  };
}

export class ProgressionStore {
  constructor(storage = null) {
    try { this.storage = storage || globalThis.localStorage; } catch { this.storage = null; }
    this.profile = createDefaultProfile();
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (raw) this.profile = normalizeProfile(JSON.parse(raw));
    } catch {
      this.profile = createDefaultProfile();
    }
  }

  get xpForNextLevel() {
    return 220 + (this.profile.level - 1) * 95;
  }

  get rankTitle() {
    const level = this.profile.level;
    if (level >= 40) return 'Lenda das Lajes';
    if (level >= 25) return 'Mestre do Vento';
    if (level >= 15) return 'Rei da Laje';
    if (level >= 8) return 'Pipeiro Experiente';
    if (level >= 3) return 'Pipeiro de Respeito';
    return 'Pipeiro Iniciante';
  }

  save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {
      // Progress stays available for the current session when storage is blocked.
    }
  }

  setNickname(name) {
    const value = String(name || '').trim().slice(0, 18);
    if (value) this.profile.nickname = value;
    this.save();
    return this.profile.nickname;
  }

  updateCombo(combo) {
    this.profile.stats.bestCombo = Math.max(this.profile.stats.bestCombo, Math.max(1, Math.floor(combo || 1)));
    this.save();
  }

  record(event, amount = 1) {
    const reward = EVENT_REWARDS[event];
    if (!reward) return { xpEarned: 0, coinsEarned: 0, levelsGained: 0, completedMissions: [] };
    const count = Math.max(1, Math.min(20, Math.floor(amount || 1)));
    let xpEarned = reward.xp * count;
    let coinsEarned = reward.coins * count;
    this.profile.stats[reward.stat] += count;

    const completedMissions = [];
    for (const mission of MISSION_TEMPLATES.filter((item) => item.event === event)) {
      const progress = this.profile.missions.find((item) => item.id === mission.id);
      if (!progress || progress.claimed) continue;
      progress.progress = Math.min(mission.target, progress.progress + count);
      if (progress.progress >= mission.target) {
        progress.claimed = true;
        xpEarned += mission.xp;
        coinsEarned += mission.coins;
        completedMissions.push(mission.title);
      }
    }

    this.profile.xp += xpEarned;
    this.profile.coins += coinsEarned;
    let levelsGained = 0;
    while (this.profile.xp >= this.xpForNextLevel && this.profile.level < 999) {
      this.profile.xp -= this.xpForNextLevel;
      this.profile.level += 1;
      levelsGained += 1;
      this.profile.coins += 75;
      coinsEarned += 75;
    }
    this.save();
    return { xpEarned, coinsEarned, levelsGained, completedMissions };
  }

  getKiteCondition(modelId) {
    return Math.max(0, Math.min(100, this.profile.house.kiteCondition[modelId] ?? 100));
  }

  discoverKite(modelId) {
    if (!KITE_IDS.includes(modelId)) return;
    if (!this.profile.house.ownedKites.includes(modelId)) {
      this.profile.house.ownedKites.push(modelId);
      this.save();
    }
  }

  damageKite(modelId, amount = 0.1) {
    if (!KITE_IDS.includes(modelId)) return this.getKiteCondition(modelId);
    this.discoverKite(modelId);
    const wear = Math.max(0, Math.min(5, Number(amount) || 0));
    this.profile.house.kiteCondition[modelId] = Math.max(0, this.getKiteCondition(modelId) - wear);
    this.save();
    return this.profile.house.kiteCondition[modelId];
  }

  repairKite(modelId) {
    if (!KITE_IDS.includes(modelId)) return { ok: false, reason: 'Pipa não encontrada na garagem.' };
    const condition = this.getKiteCondition(modelId);
    if (condition >= 99.9) return { ok: true, repaired: false, cost: 0 };
    const cost = Math.max(1, Math.ceil((100 - condition) * 2.4));
    if (this.profile.coins < cost) return { ok: false, reason: `Faltam ${cost - this.profile.coins} moedas para o conserto.` };
    this.profile.coins -= cost;
    this.profile.house.kiteCondition[modelId] = 100;
    this.profile.stats.repairs += 1;
    this.save();
    return { ok: true, repaired: true, cost };
  }

  visitGarage() {
    this.profile.house.visits += 1;
    this.save();
  }

  upgradeHouse() {
    const level = this.profile.house.level;
    if (level >= 3) return { ok: false, reason: 'Sua casa já está no nível máximo.' };
    const requiredLevel = level === 1 ? 5 : 12;
    const cost = level === 1 ? 850 : 1800;
    if (this.profile.level < requiredLevel) return { ok: false, reason: `Alcance o nível ${requiredLevel} da carreira para ampliar a casa.` };
    if (this.profile.coins < cost) return { ok: false, reason: `Faltam ${cost - this.profile.coins} moedas.` };
    this.profile.coins -= cost;
    this.profile.house.level += 1;
    this.profile.house.garageSlots = Math.min(7, this.profile.house.garageSlots + 2);
    this.save();
    return { ok: true, cost, level: this.profile.house.level };
  }

  ownsLine(id) {
    return id !== 'linha_descarga' || this.profile.ownedLines.includes(id);
  }

  buyLine(id) {
    if (this.ownsLine(id)) return { ok: true, alreadyOwned: true };
    if (id !== 'linha_descarga') return { ok: false, reason: 'Item indisponível.' };
    if (this.profile.level < 4) return { ok: false, reason: 'Desbloqueia no nível 4.' };
    const price = 900;
    if (this.profile.coins < price) return { ok: false, reason: `Faltam ${price - this.profile.coins} moedas.` };
    this.profile.coins -= price;
    this.profile.ownedLines.push(id);
    this.save();
    return { ok: true, price };
  }

  getMissions() {
    return MISSION_TEMPLATES.map((mission) => {
      const progress = this.profile.missions.find((item) => item.id === mission.id) || { progress: 0, claimed: false };
      return { ...mission, progress: progress.progress, claimed: progress.claimed };
    });
  }
}
