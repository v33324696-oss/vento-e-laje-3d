export const NEIGHBORHOOD_EVENT_PROFILES = Object.freeze([
  Object.freeze({ id: 'wind_gust', title: 'RAJADA NA LAJE!', description: 'Uma rajada atravessou o bairro. Controle a tensão e aproveite o vento extra.', duration: 18, windMultiplier: 1.16, crosswind: 0.018, aiMultiplier: 1.04, rewardMultiplier: 1.12 }),
  Object.freeze({ id: 'calm_wind', title: 'VENTO MAIS CALMO', description: 'O vento deu uma trégua. Ajuste a linha e trabalhe melhor o posicionamento.', duration: 20, windMultiplier: 0.86, crosswind: -0.012, aiMultiplier: 0.96, rewardMultiplier: 1.08 }),
  Object.freeze({ id: 'neighborhood_challenge', title: 'DESAFIO DA LAJE!', description: 'Os pipeiros estão disputando espaço. Rivais mais atentos e recompensa maior nos cortes.', duration: 24, windMultiplier: 1.02, crosswind: 0.008, aiMultiplier: 1.13, rewardMultiplier: 1.22 }),
  Object.freeze({ id: 'busy_sky', title: 'CÉU MOVIMENTADO!', description: 'O céu encheu de pipas. Fique atento aos cruzamentos e às rabiolas avoadas.', duration: 22, windMultiplier: 1.06, crosswind: -0.016, aiMultiplier: 1.08, rewardMultiplier: 1.15 })
]);

export class NeighborhoodEventDirector {
  constructor(random = Math.random) {
    this.random = random;
    this.currentEvent = null;
    this.remaining = 0;
    this.nextEventIn = 34;
    this.lastEventId = null;
  }

  update(dt, enabled = true) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    let started = null;
    let ended = null;
    if (!enabled) {
      if (this.currentEvent) ended = this.currentEvent;
      this.currentEvent = null;
      this.remaining = 0;
      this.nextEventIn = 34;
      return { started, ended, current: null };
    }
    if (this.currentEvent) {
      this.remaining = Math.max(0, this.remaining - step);
      if (this.remaining === 0) {
        ended = this.currentEvent;
        this.currentEvent = null;
        this.nextEventIn = 42 + this.random() * 24;
      }
    } else {
      this.nextEventIn -= step;
      if (this.nextEventIn <= 0) {
        const options = NEIGHBORHOOD_EVENT_PROFILES.filter((event) => event.id !== this.lastEventId);
        const pool = options.length ? options : NEIGHBORHOOD_EVENT_PROFILES;
        this.currentEvent = pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))];
        this.lastEventId = this.currentEvent.id;
        this.remaining = this.currentEvent.duration;
        started = this.currentEvent;
      }
    }
    return { started, ended, current: this.currentEvent };
  }
}
