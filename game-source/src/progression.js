const STORAGE_KEY = 'vento-laje-profile-v1';

const KITE_IDS = [
  'murcha', 'raia', 'latao', 'peixinho', 'papagaio', 'delta',
  'estrela', 'hexagonal', 'peixao', 'capucheta', 'morcego', 'quadrada', 'rokkaku'
];
const NEIGHBORHOOD_IDS = ['laje', 'praia', 'parque', 'campinho', 'morro'];
const PAPER_TYPES = ['seda', 'leve', 'resistente'];
const FRAME_TYPES = ['bambu', 'fibra', 'reforcada'];
const TAIL_TYPES = ['padrao', 'longa', 'curta', 'sem'];

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

const HOUSE_DECORATIONS = [
  { id: 'bandeirolas', title: 'Bandeirolas da laje', description: 'Deixe seu canto com a cara do bairro.', icon: '🎏', cost: 250, houseLevel: 1 },
  { id: 'trofeu_copa', title: 'Troféu do bairro', description: 'Um troféu para marcar suas primeiras conquistas.', icon: '🏆', cost: 650, houseLevel: 2 },
  { id: 'prateleira', title: 'Prateleira de pipas', description: 'Exiba os modelos que você já conquistou.', icon: '🪁', cost: 900, houseLevel: 2 },
  { id: 'placa_lenda', title: 'Placa Lenda da Laje', description: 'Uma homenagem para quem chegou ao topo.', icon: '⭐', cost: 1800, houseLevel: 3 }
];

function createDefaultProfile() {
  return {
    version: 3,
    nickname: 'Pipeiro',
    level: 1,
    xp: 0,
    coins: 250,
    ownedLines: [],
    stats: { cuts: 0, catches: 0, tailCuts: 0, bestCombo: 1, games: 0, repairs: 0, flightSeconds: 0, combatWins: 0, bestCutStreak: 1, craftedKites: 0, tournamentWins: 0 },
    house: { level: 1, garageSlots: 3, visits: 0, ownedKites: ['murcha'], recoveredKites: [], decorations: [], kiteCondition: Object.fromEntries(KITE_IDS.map((id) => [id, 100])) },
    cutHistory: [],
    craftLog: [],
    rivalries: [],
    reputation: Object.fromEntries(NEIGHBORHOOD_IDS.map((id) => [id, 0])),
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
      flightSeconds: n(value.stats?.flightSeconds, 0),
      combatWins: n(value.stats?.combatWins, 0),
      bestCutStreak: Math.max(1, n(value.stats?.bestCutStreak, 1, 999)),
      craftedKites: n(value.stats?.craftedKites, 0),
      tournamentWins: n(value.stats?.tournamentWins, 0)
    },
    house: {
      level: Math.max(1, Math.min(3, n(value.house?.level, 1, 3))),
      garageSlots: Math.max(3, Math.min(7, n(value.house?.garageSlots, 3, 7))),
      visits: n(value.house?.visits, 0),
      ownedKites: [...new Set(['murcha', ...(Array.isArray(value.house?.ownedKites) ? value.house.ownedKites.filter((id) => KITE_IDS.includes(id)) : [])])],
      recoveredKites: [...new Set(Array.isArray(value.house?.recoveredKites) ? value.house.recoveredKites.filter((id) => KITE_IDS.includes(id)) : [])],
      decorations: [...new Set(Array.isArray(value.house?.decorations) ? value.house.decorations.filter((id) => HOUSE_DECORATIONS.some((item) => item.id === id)) : [])],
      kiteCondition: Object.fromEntries(KITE_IDS.map((id) => [id, Math.max(0, Math.min(100, Number.isFinite(Number(value.house?.kiteCondition?.[id])) ? Number(value.house.kiteCondition[id]) : 100))]))
    },
    cutHistory: (Array.isArray(value.cutHistory) ? value.cutHistory : []).slice(0, 8).map((entry) => ({
      opponent: String(entry?.opponent || 'Pipeiro').replace(/[<>]/g, '').slice(0, 32),
      technique: String(entry?.technique || 'no relo').replace(/[<>]/g, '').slice(0, 32),
      points: n(entry?.points, 0, 100000),
      combo: Math.max(1, n(entry?.combo, 1, 999)),
      at: n(entry?.at, Date.now())
    })),
    craftLog: (Array.isArray(value.craftLog) ? value.craftLog : []).slice(0, 20).map((entry) => ({
      modelId: KITE_IDS.includes(entry?.modelId) ? entry.modelId : 'murcha',
      paper: PAPER_TYPES.includes(entry?.paper) ? entry.paper : 'seda',
      frame: FRAME_TYPES.includes(entry?.frame) ? entry.frame : 'bambu',
      tail: TAIL_TYPES.includes(entry?.tail) ? entry.tail : 'padrao',
      quality: n(entry?.quality, 55, 100), at: n(entry?.at, Date.now())
    })),
    rivalries: (Array.isArray(value.rivalries) ? value.rivalries : []).slice(0, 20).map((entry) => ({
      name: String(entry?.name || 'Pipeiro').replace(/[<>]/g, '').slice(0, 32),
      playerCuts: n(entry?.playerCuts, 0, 999), playerLosses: n(entry?.playerLosses, 0, 999),
      heat: Math.max(0, Math.min(10, Number(entry?.heat) || 0))
    })),
    reputation: Object.fromEntries(NEIGHBORHOOD_IDS.map((id) => [id, n(value.reputation?.[id], 0, 100000)])),
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

  recordRecovery(modelId) {
    if (!KITE_IDS.includes(modelId)) return false;
    this.discoverKite(modelId);
    if (!this.profile.house.recoveredKites.includes(modelId)) {
      this.profile.house.recoveredKites.push(modelId);
    }
    this.save();
    return true;
  }

  recordReputation(mapId, amount = 5) {
    if (!NEIGHBORHOOD_IDS.includes(mapId)) return 0;
    const points = Math.max(0, Math.min(250, Math.floor(Number(amount) || 0)));
    this.profile.reputation[mapId] = Math.min(100000, (this.profile.reputation[mapId] || 0) + points);
    this.save();
    return this.profile.reputation[mapId];
  }

  getNeighborhoodRank(mapId) {
    const points = this.profile.reputation[mapId] || 0;
    if (points >= 1200) return { title: 'Lenda do bairro', next: 1200, progress: 100 };
    if (points >= 600) return { title: 'Conhecido na quebrada', next: 1200, progress: (points - 600) / 600 * 100 };
    if (points >= 250) return { title: 'Pipeiro respeitado', next: 600, progress: (points - 250) / 350 * 100 };
    if (points >= 75) return { title: 'Nome conhecido', next: 250, progress: (points - 75) / 175 * 100 };
    return { title: 'Chegando agora', next: 75, progress: points / 75 * 100 };
  }

  getNeighborhoods() {
    const names = { laje: 'Laje do Bairro', praia: 'Praia', parque: 'Parque', campinho: 'Campinho', morro: 'Mirante do Morro' };
    return NEIGHBORHOOD_IDS.map((id) => ({ id, name: names[id], points: this.profile.reputation[id] || 0, ...this.getNeighborhoodRank(id) }));
  }

  recordTournamentRound(mapId) {
    this.profile.stats.tournamentWins += 1;
    this.recordReputation(mapId, 24);
    const xpEarned = 90, baseCoins = 150;
    this.profile.xp += xpEarned;
    this.profile.coins += baseCoins;
    let levelsGained = 0;
    while (this.profile.xp >= this.xpForNextLevel && this.profile.level < 999) {
      this.profile.xp -= this.xpForNextLevel;
      this.profile.level += 1;
      levelsGained += 1;
      this.profile.coins += 75;
    }
    this.save();
    return { xpEarned, coinsEarned: baseCoins + levelsGained * 75, levelsGained, wins: this.profile.stats.tournamentWins };
  }

  recordRivalry(name, outcome = 'win') {
    const cleanName = String(name || 'Pipeiro').replace(/[<>]/g, '').trim().slice(0, 32) || 'Pipeiro';
    let entry = this.profile.rivalries.find((item) => item.name === cleanName);
    if (!entry) {
      entry = { name: cleanName, playerCuts: 0, playerLosses: 0, heat: 0 };
      this.profile.rivalries.unshift(entry);
    }
    if (outcome === 'loss') entry.playerLosses += 1;
    else entry.playerCuts += 1;
    entry.heat = Math.min(10, entry.heat + 1);
    this.profile.rivalries = this.profile.rivalries.slice(0, 20);
    this.save();
    return { ...entry };
  }

  getRivalry(name) {
    const entry = this.profile.rivalries.find((item) => item.name === String(name || '').slice(0, 32));
    return entry ? { ...entry } : { name: String(name || 'Pipeiro'), playerCuts: 0, playerLosses: 0, heat: 0 };
  }

  craftKite({ modelId, paper = 'seda', frame = 'bambu', tail = 'padrao' } = {}) {
    if (!KITE_IDS.includes(modelId)) return { ok: false, reason: 'Escolha um modelo válido para fabricar.' };
    if (!PAPER_TYPES.includes(paper) || !FRAME_TYPES.includes(frame) || !TAIL_TYPES.includes(tail)) return { ok: false, reason: 'Confira os materiais escolhidos.' };
    const cost = 140 + ({ seda: 0, leve: 35, resistente: 55 }[paper]) + ({ bambu: 0, fibra: 45, reforcada: 70 }[frame]) + ({ padrao: 0, longa: 12, curta: 12, sem: 0 }[tail]);
    if (this.profile.coins < cost) return { ok: false, reason: `Faltam ${cost - this.profile.coins} moedas para comprar os materiais.` };
    const quality = Math.min(100, 58 + ({ seda: 8, leve: 11, resistente: 15 }[paper]) + ({ bambu: 8, fibra: 14, reforcada: 18 }[frame]) + (tail === 'padrao' ? 4 : tail === 'longa' ? 2 : 0));
    this.profile.coins -= cost;
    this.profile.stats.craftedKites += 1;
    this.profile.house.kiteCondition[modelId] = 100;
    this.discoverKite(modelId);
    this.profile.craftLog.unshift({ modelId, paper, frame, tail, quality, at: Date.now() });
    this.profile.craftLog = this.profile.craftLog.slice(0, 20);
    this.profile.xp += 35;
    let levelsGained = 0;
    while (this.profile.xp >= this.xpForNextLevel && this.profile.level < 999) {
      this.profile.xp -= this.xpForNextLevel; this.profile.level += 1; levelsGained += 1; this.profile.coins += 75;
    }
    this.save();
    return { ok: true, cost, quality, levelsGained, modelId, paper, frame, tail };
  }

  recordCombat({ opponent, technique, points = 0, combo = 1 } = {}) {
    const clean = (value, fallback) => String(value || fallback).replace(/[<>]/g, '').trim().slice(0, 32) || fallback;
    const streak = Math.max(1, Math.min(999, Math.floor(Number(combo) || 1)));
    this.profile.stats.combatWins += 1;
    this.profile.stats.bestCutStreak = Math.max(this.profile.stats.bestCutStreak, streak);
    this.profile.cutHistory.unshift({
      opponent: clean(opponent, 'Pipeiro'),
      technique: clean(technique, 'no relo'),
      points: Math.max(0, Math.min(100000, Math.floor(Number(points) || 0))),
      combo: streak,
      at: Date.now()
    });
    this.profile.cutHistory = this.profile.cutHistory.slice(0, 8);
    this.save();
    return this.profile.cutHistory[0];
  }

  getAchievements() {
    const stats = this.profile.stats;
    const house = this.profile.house;
    return [
      { id: 'first_cut', title: 'Primeiro corte', description: 'Faça seu primeiro corte.', icon: '✂️', unlocked: stats.cuts >= 1 },
      { id: 'five_cuts', title: 'Dono do céu', description: 'Consiga 5 cortes.', icon: '🪁', unlocked: stats.cuts >= 5 },
      { id: 'first_catch', title: 'Mão de aparador', description: 'Resgate uma pipa avoada.', icon: '🧤', unlocked: stats.catches >= 1 },
      { id: 'collector', title: 'Colecionador', description: 'Guarde 5 modelos diferentes.', icon: '🎨', unlocked: house.ownedKites.length >= 5 },
      { id: 'rabico', title: 'Corta-rabiola', description: 'Corte 5 rabiolas.', icon: '〰️', unlocked: stats.tailCuts >= 5 },
      { id: 'combo', title: 'Sequência braba', description: 'Alcance um combo de 5.', icon: '🔥', unlocked: stats.bestCombo >= 5 },
      { id: 'home', title: 'Minha quebrada', description: 'Amplie sua casa pela primeira vez.', icon: '🏠', unlocked: house.level >= 2 },
      { id: 'champion', title: 'Lenda da laje', description: 'Consiga 25 cortes.', icon: '🏆', unlocked: stats.cuts >= 25 },
      { id: 'craft', title: 'Mestre artesão', description: 'Fabrique 3 pipas na oficina.', icon: '🛠️', unlocked: stats.craftedKites >= 3 },
      { id: 'tournament', title: 'Campeão de rodadas', description: 'Vença 3 rodadas de campeonato.', icon: '🥇', unlocked: stats.tournamentWins >= 3 },
      { id: 'rival', title: 'Rivalidade histórica', description: 'Enfrente um rival pelo menos 5 vezes.', icon: '⚔️', unlocked: this.profile.rivalries.some((item) => item.playerCuts + item.playerLosses >= 5) }
    ];
  }

  getDecorations() {
    return HOUSE_DECORATIONS.map((item) => ({
      ...item,
      owned: this.profile.house.decorations.includes(item.id),
      available: this.profile.house.level >= item.houseLevel
    }));
  }

  buyDecoration(id) {
    const item = HOUSE_DECORATIONS.find((entry) => entry.id === id);
    if (!item) return { ok: false, reason: 'Decoração indisponível.' };
    if (this.profile.house.decorations.includes(id)) return { ok: true, alreadyOwned: true, item };
    if (this.profile.house.level < item.houseLevel) {
      return { ok: false, reason: `Amplie a casa para o nível ${item.houseLevel} para instalar essa decoração.` };
    }
    if (this.profile.coins < item.cost) {
      return { ok: false, reason: `Faltam ${item.cost - this.profile.coins} moedas.` };
    }
    this.profile.coins -= item.cost;
    this.profile.house.decorations.push(id);
    this.save();
    return { ok: true, item, cost: item.cost };
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
