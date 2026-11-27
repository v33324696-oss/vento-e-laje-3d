const PAPER = {
  seda: { lift: 1, speed: 1, steering: 1, stability: 1, durability: 1, drag: 1 },
  leve: { lift: 1.04, speed: 1.035, steering: 1.02, stability: 0.94, durability: 0.78, drag: 0.94 },
  resistente: { lift: 0.97, speed: 0.96, steering: 0.96, stability: 1.07, durability: 1.22, drag: 1.06 }
};
const FRAME = {
  bambu: { lift: 1, speed: 1, steering: 1, stability: 1, durability: 1, drag: 1 },
  fibra: { lift: 1, speed: 1.02, steering: 1.09, stability: 0.96, durability: 0.95, drag: 0.98 },
  reforcada: { lift: 1, speed: 0.95, steering: 0.93, stability: 1.12, durability: 1.25, drag: 1.04 }
};
const TAIL = {
  padrao: { lift: 1, speed: 1, steering: 1, stability: 1, durability: 1, drag: 1 },
  longa: { lift: 0.99, speed: 0.95, steering: 0.89, stability: 1.16, durability: 1.03, drag: 1.08 },
  curta: { lift: 1.01, speed: 1.02, steering: 1.12, stability: 0.90, durability: 0.97, drag: 0.97 },
  sem: { lift: 1, speed: 1.05, steering: 1.18, stability: 0.72, durability: 0.80, drag: 0.93 }
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function getKiteMaterialProfile(setup = {}) {
  const paper = PAPER[setup.paper] || PAPER.seda;
  const frame = FRAME[setup.frame] || FRAME.bambu;
  const tail = TAIL[setup.tail] || TAIL.padrao;
  const combine = (key, min, max) => clamp(paper[key] * frame[key] * tail[key], min, max);
  return Object.freeze({
    liftMultiplier: combine('lift', 0.88, 1.14),
    speedMultiplier: combine('speed', 0.84, 1.16),
    steeringMultiplier: combine('steering', 0.82, 1.22),
    stabilityMultiplier: combine('stability', 0.68, 1.24),
    durabilityMultiplier: combine('durability', 0.62, 1.45),
    dragMultiplier: combine('drag', 0.86, 1.18)
  });
}
