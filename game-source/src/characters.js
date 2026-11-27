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
