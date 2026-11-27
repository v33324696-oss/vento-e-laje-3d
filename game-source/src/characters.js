export const PLAYER_PIPEIRO_APPEARANCE = Object.freeze({
  ageGroup: 'young',
  skinColor: 0x9b684f,
  shirtColor: 0x101010,
  shortsColor: 0x25272a,
  pantsColor: 0x25272a,
  shoeColor: 0x111318,
  soleColor: 0xf8fafc,
  sockColor: 0xf8fafc,
  sockStripe: false,
  hairColor: 0x11100f,
  hairStyle: 'curlyFade',
  shirtStyle: 'oversized',
  pantsStyle: 'cargoShorts',
  shortsPattern: 'urbanCamo',
  bodyType: 'athletic',
  heightScale: 1.02,
  beardStyle: 'none',
  accessory: 'chainCross',
  earrings: true,
  watch: true,
  tattoo: true,
  tattooColor: 0x37323a,
  metalColor: 0xd1d5db,
  detailColor: 0xd1d5db,
  name: 'Pipeiro'
});

const SKIN_TONES = [0xf0c6a5, 0xdba982, 0xc58c68, 0x9b684f, 0x754936, 0x513326];
const SHIRT_COLORS = [0x101010, 0xf8fafc, 0x1d4ed8, 0x0f766e, 0x991b1b, 0x7c3aed, 0x334155, 0xf97316, 0x15803d, 0xeab308, 0x7f1d1d, 0x64748b];
const SHORTS_COLORS = [0x17191d, 0x30343b, 0x1e3a8a, 0x3f4142, 0x4b5563, 0x78350f, 0x14532d, 0x27272a];
const PANTS_COLORS = [0x17191d, 0x30343b, 0x1e293b, 0x334155, 0x44403c, 0x292524];
const SHOE_COLORS = [0x111318, 0xf8fafc, 0x334155, 0x7f1d1d, 0x1e3a8a, 0x57534e];
const HAIR_STYLES = ['curlyFade', 'waves', 'afro', 'buzz', 'cap', 'bald'];
const HAIR_COLORS = [0x171311, 0x29211e, 0x100f0e, 0x41332c, 0x777777, 0xb8b2a6];
const ACCESSORIES = ['none', 'chain', 'chainCross', 'watch', 'shoulderBag', 'glasses'];
const SHIRT_STYLES = ['oversized', 'sports', 'polo', 'hoodie'];
const PANTS_STYLES = ['cargoShorts', 'denimShorts', 'jeans', 'trackPants'];
const BODY_TYPES = ['slim', 'athletic', 'stocky'];

function pick(list, random) {
  const value = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  return list[Math.floor(value * list.length)];
}

export function createNpcAppearance({
  random = Math.random,
  usedSignatures = new Set(),
  preferredShirt = null,
  preferredShorts = null
} = {}) {
  for (let attempt = 0; attempt < 96; attempt++) {
    const ageGroup = pick(['young', 'young', 'adult', 'adult', 'older'], random);
    const hairStyle = ageGroup === 'older' && random() < 0.58
      ? pick(['buzz', 'bald', 'cap'], random)
      : pick(HAIR_STYLES, random);
    const hairColor = ageGroup === 'older' && random() < 0.7
      ? pick([0x777777, 0xb8b2a6, 0x41332c], random)
      : pick(HAIR_COLORS.slice(0, 4), random);
    const beardStyle = ageGroup === 'older'
      ? pick(['gray', 'gray', 'none', 'short'], random)
      : ageGroup === 'adult' && random() < 0.52
        ? pick(['short', 'full', 'none'], random)
        : 'none';
    const look = {
      ageGroup,
      skinColor: pick(SKIN_TONES, random),
      shirtColor: preferredShirt ?? pick(SHIRT_COLORS, random),
      shortsColor: preferredShorts ?? pick(SHORTS_COLORS, random),
      pantsColor: pick(PANTS_COLORS, random),
      shoeColor: pick(SHOE_COLORS, random),
      soleColor: pick([0xf8fafc, 0xe5e7eb, 0x17191d], random),
      sockColor: pick([0xf8fafc, 0x1f2937, 0x111827, 0x9ca3af], random),
      sockStripe: random() < 0.32,
      hairColor,
      hairStyle,
      shirtStyle: pick(SHIRT_STYLES, random),
      pantsStyle: ageGroup === 'older' ? pick(['jeans', 'trackPants', 'denimShorts'], random) : pick(PANTS_STYLES, random),
      bodyType: pick(BODY_TYPES, random),
      heightScale: ageGroup === 'older' ? 0.92 + random() * 0.055 : ageGroup === 'young' ? 0.94 + random() * 0.08 : 0.97 + random() * 0.08,
      beardStyle,
      accessory: pick(ACCESSORIES, random),
      earrings: random() < 0.38,
      watch: random() < 0.3,
      tattoo: ageGroup !== 'older' && random() < 0.28,
      tattooColor: 0x37323a,
      metalColor: pick([0xd1d5db, 0xfacc15, 0xb8c2cc], random),
      detailColor: pick([0xd1d5db, 0xf8fafc, 0xfacc15, 0x94a3b8], random),
      shortsPattern: pick(['plain', 'urbanCamo', 'plain'], random),
      name: pick(['Juninho', 'Biel', 'Rafa', 'Gui', 'Léo', 'Dudu', 'Nando', 'Cauã', 'Marcos', 'Seu Zé', 'Valdir', 'Jorge'], random)
    };
    const signature = [
      look.ageGroup, look.skinColor, look.shirtColor, look.shortsColor, look.pantsColor,
      look.shoeColor, look.hairColor, look.hairStyle, look.shirtStyle, look.pantsStyle,
      look.bodyType, look.beardStyle, look.accessory, look.earrings, look.watch, look.tattoo
    ].join('-');
    if (!usedSignatures.has(signature)) {
      usedSignatures.add(signature);
      look.signature = signature;
      return look;
    }
  }

  // A deterministic fallback keeps every resident distinguishable even if a
  // caller supplies a deliberately repetitive random function in a test.
  const serial = usedSignatures.size + 1;
  const fallback = {
    ageGroup: ['young', 'adult', 'older'][serial % 3],
    skinColor: SKIN_TONES[serial % SKIN_TONES.length],
    shirtColor: preferredShirt ?? SHIRT_COLORS[serial % SHIRT_COLORS.length],
    shortsColor: preferredShorts ?? SHORTS_COLORS[serial % SHORTS_COLORS.length],
    pantsColor: PANTS_COLORS[serial % PANTS_COLORS.length],
    shoeColor: SHOE_COLORS[serial % SHOE_COLORS.length],
    soleColor: 0xf8fafc,
    sockColor: 0xf8fafc,
    sockStripe: serial % 2 === 0,
    hairColor: HAIR_COLORS[serial % HAIR_COLORS.length],
    hairStyle: HAIR_STYLES[serial % HAIR_STYLES.length],
    shirtStyle: SHIRT_STYLES[serial % SHIRT_STYLES.length],
    pantsStyle: PANTS_STYLES[serial % PANTS_STYLES.length],
    bodyType: BODY_TYPES[serial % BODY_TYPES.length],
    heightScale: 0.94 + (serial % 8) * 0.015,
    beardStyle: serial % 3 === 0 ? 'gray' : 'none',
    accessory: ACCESSORIES[serial % ACCESSORIES.length],
    earrings: serial % 2 === 0,
    watch: serial % 4 === 0,
    tattoo: serial % 5 === 0,
    tattooColor: 0x37323a,
    metalColor: 0xd1d5db,
    detailColor: 0x94a3b8,
    shortsPattern: serial % 2 === 0 ? 'urbanCamo' : 'plain',
    name: ['Juninho', 'Biel', 'Rafa', 'Seu Zé', 'Valdir'][serial % 5]
  };
  fallback.signature = 'fallback-' + serial + '-' + [
    fallback.ageGroup, fallback.skinColor, fallback.shirtColor, fallback.hairStyle,
    fallback.hairColor, fallback.pantsStyle, fallback.accessory
  ].join('-');
  usedSignatures.add(fallback.signature);
  return fallback;
}


// Full-body human characters generated by ara3d (rigged mesh, textured skin,
// clothing, hair and animation skeleton). The old procedural body stays only
// as a fallback if the character-data CDN cannot be reached.
export const PLAYER_ARA_CHARACTER = {
  kind: 'ara-character',
  version: 1,
  preset: 'The Gamer',
  params: {
    name: 'Pipeiro',
    seed: 271127,
    gender: 1,
    age: 0.47,
    muscle: 0.62,
    weight: 0.46,
    height: 0.58,
    proportions: 0.72,
    african: 0.82,
    asian: 0.03,
    caucasian: 0.15,
    eyes: 'darkbrown',
    eyebrows: 'eyebrow001',
    eyelashes: 'eyelashes01',
    hair: 'afro01',
    hairTint: '#17110e',
    hairColor: '#17110e',
    facialHair: 'none',
    beardColor: '#17110e',
    tattoos: ['sleeve_r'],
    tattooInk: '#242126',
    earrings: 'studs',
    earringMetal: 'silver',
    outfit: 'none',
    top: 'oversized_tee',
    jacket: 'none',
    bottom: 'cargo_shorts',
    shoes: 'sneakers',
    hat: 'none',
    accessories: ['cuban_chain', 'silver_cross', 'watch_silver', 'sport_socks'],
    garmentStyles: {
      oversized_tee: { pattern: 'jersey', color: '#090a0c', color2: '#f4f4f2' },
      cargo_shorts: { pattern: 'camo', color: '#242629', color2: '#696b6e' },
      sneakers: { pattern: 'workwear', color: '#111317', color2: '#f4f4f2' },
      sport_socks: { pattern: 'rib', color: '#f4f4f2', color2: '#d4d5d6' },
      cuban_chain: { pattern: 'solid', color: '#c8ccd0', color2: '#e7e9eb' },
      silver_cross: { pattern: 'solid', color: '#c8ccd0', color2: '#e7e9eb' },
      watch_silver: { pattern: 'solid', color: '#c8ccd0', color2: '#17191d' }
    },
    expression: 'determined',
    rig: 'game',
    faceBones: true,
    restPose: 'A',
    animations: true,
    faceShapes: true,
    speechShapes: false
  }
};

const NPC_AGES = [
  { group: 'young', age: 0.26, preset: 'The Schoolboy' },
  { group: 'young', age: 0.34, preset: 'The Gamer' },
  { group: 'adult', age: 0.46, preset: 'The Gamer' },
  { group: 'adult', age: 0.62, preset: 'The Gangster' },
  { group: 'older', age: 0.91, preset: 'Elder' }
];
const NPC_HAIR = ['short02', 'short03', 'short04', 'afro01', 'buzz', 'cornrows', 'box_braids'];
const NPC_SKIN = [
  [0.92, 0.01, 0.07],
  [0.78, 0.04, 0.18],
  [0.62, 0.08, 0.30],
  [0.42, 0.08, 0.50],
  [0.18, 0.12, 0.70],
  [0.05, 0.2, 0.75]
];
const NPC_SHIRTS = ['#101114', '#e8e8e5', '#1d4f91', '#8c2836', '#176b59', '#6b4e8a', '#b46b24', '#39414a'];
const NPC_BOTTOMS = ['cargo_shorts', 'baggy_jeans', 'cargo_pants', 'resort_shorts'];
const NPC_BOTTOM_COLORS = ['#222529', '#343a44', '#1d3150', '#514b40', '#3d403c', '#292725'];
const NPC_NAMES = ['Juninho', 'Biel', 'Rafa', 'Gui', 'Léo', 'Dudu', 'Nando', 'Cauã', 'Marcos', 'Seu Zé', 'Valdir', 'Jorge', 'Tião', 'Paulinho', 'Douglas', 'Renato'];

export function createNpcAraCharacter(index = 0) {
  const id = Math.max(0, Math.floor(Number(index) || 0));
  const age = NPC_AGES[id % NPC_AGES.length];
  const older = age.group === 'older';
  const young = age.group === 'young';
  const skin = NPC_SKIN[id % NPC_SKIN.length];
  const hair = older ? ['short02', 'short04', 'buzz'][id % 3] : NPC_HAIR[id % NPC_HAIR.length];
  const shirt = NPC_SHIRTS[id % NPC_SHIRTS.length];
  const bottom = NPC_BOTTOMS[(id * 3 + 1) % NPC_BOTTOMS.length];
  const bottomColor = NPC_BOTTOM_COLORS[(id * 5 + 2) % NPC_BOTTOM_COLORS.length];
  const accessories = older
    ? (id % 2 ? ['watch_silver', 'silver_cross'] : ['watch_silver'])
    : young
      ? (id % 2 ? ['sport_socks'] : [])
      : (id % 3 === 0 ? ['cuban_chain', 'watch_silver', 'sport_socks'] : ['watch_silver', 'sport_socks']);
  const facialHair = older
    ? (id % 2 ? 'mustache' : 'full_beard')
    : !young && id % 3 === 0 ? 'stubble' : 'none';
  const shirtStyle = id % 4 === 0 ? 'tank_top' : id % 4 === 1 ? 'singlet' : id % 4 === 2 ? 'tropical_short_shirt' : 'oversized_tee';
  const shirtPattern = shirtStyle === 'oversized_tee' ? 'jersey' : shirtStyle === 'tropical_short_shirt' ? 'resort_geo' : 'solid';
  const bottomPattern = bottom === 'baggy_jeans' ? 'denim' : bottom === 'cargo_shorts' || bottom === 'cargo_pants' ? 'camo' : 'solid';
  const hairTint = older ? '#9b9994' : ['#17110e', '#241911', '#100e0d', '#3c2b20'][id % 4];
  const tattoos = !young && id % 3 === 1 ? ['forearm_l'] : [];
  const name = NPC_NAMES[id % NPC_NAMES.length];

  return {
    kind: 'ara-character',
    version: 1,
    preset: age.preset,
    params: {
      name,
      seed: 61000 + id * 37,
      gender: 1,
      age: age.age,
      muscle: [0.42, 0.54, 0.66, 0.75][id % 4],
      weight: [0.38, 0.46, 0.54, 0.62][(id + 1) % 4],
      height: [0.45, 0.52, 0.59, 0.66][id % 4],
      proportions: [0.62, 0.7, 0.78][id % 3],
      african: skin[0],
      asian: skin[1],
      caucasian: skin[2],
      eyes: 'darkbrown',
      eyebrows: 'eyebrow001',
      eyelashes: 'eyelashes01',
      hair,
      hairTint,
      hairColor: hairTint,
      facialHair,
      beardColor: older ? '#888783' : '#211810',
      tattoos,
      tattooInk: '#28232a',
      earrings: id % 4 === 0 ? 'studs' : 'none',
      earringMetal: 'silver',
      outfit: 'none',
      top: shirtStyle,
      jacket: 'none',
      bottom,
      shoes: 'sneakers',
      hat: 'none',
      accessories,
      garmentStyles: {
        [shirtStyle]: { pattern: shirtPattern, color: shirt, color2: '#ececeb' },
        [bottom]: { pattern: bottomPattern, color: bottomColor, color2: '#777979' },
        sneakers: {
          pattern: 'workwear',
          color: id % 2 ? '#17191d' : '#e8e8e5',
          color2: id % 2 ? '#e8e8e5' : '#17191d'
        },
        ...(accessories.includes('cuban_chain') ? {
          cuban_chain: { pattern: 'solid', color: '#c5c9ce', color2: '#e5e7eb' }
        } : {}),
        ...(accessories.includes('watch_silver') ? {
          watch_silver: { pattern: 'solid', color: '#c5c9ce', color2: '#17191d' }
        } : {})
      },
      expression: 'neutral',
      rig: 'game_lite',
      faceBones: false,
      restPose: 'A',
      animations: true,
      faceShapes: false,
      speechShapes: false
    }
  };
}
