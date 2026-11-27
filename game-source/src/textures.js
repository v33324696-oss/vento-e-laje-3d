import * as THREE from 'three';

export const KITE_PATTERNS = [
  {
    id: 'estrela_paulista',
    name: 'Estrela Paulista',
    colors: ['#e11d48', '#ffffff', '#111827', '#facc15']
  },
  {
    id: 'brasil_ouro',
    name: 'Canarinho Real',
    colors: ['#16a34a', '#facc15', '#1d4ed8', '#ffffff']
  },
  {
    id: 'raio_neon',
    name: 'Raio da Quebrada',
    colors: ['#06b6d4', '#ec4899', '#fde047', '#0f172a']
  },
  {
    id: 'rubro_negra',
    name: 'Chama Rubro-Negra',
    colors: ['#dc2626', '#18181b', '#ffffff', '#f97316']
  },
  {
    id: 'sol_favela',
    name: 'Pôr do Sol na Laje',
    colors: ['#f97316', '#fde047', '#7c2d12', '#db2777']
  },
  {
    id: 'xadrez_laje',
    name: 'Taqueado Turquesa',
    colors: ['#0d9488', '#f8fafc', '#f43f5e', '#1e293b']
  },
  {
    id: 'camuflada_urbana',
    name: 'Geometria Verde-Limão',
    colors: ['#84cc16', '#0f766e', '#0f172a', '#38bdf8']
  },
  { id: 'azul_celeste', name: 'Azul Celeste', colors: ['#0284c7', '#e0f2fe', '#1d4ed8', '#facc15'] },
  { id: 'tropical', name: 'Tropical', colors: ['#16a34a', '#f97316', '#facc15', '#dc2626'] },
  { id: 'roxo_neon', name: 'Roxo Neon', colors: ['#7e22ce', '#e879f9', '#111827', '#67e8f9'] },
  { id: 'prata_fogo', name: 'Prata e Fogo', colors: ['#cbd5e1', '#475569', '#f97316', '#fef3c7'] },
  { id: 'oceano', name: 'Oceano', colors: ['#0e7490', '#06b6d4', '#cffafe', '#1e3a8a'] },
  { id: 'arco_iris', name: 'Arco-íris', colors: ['#ef4444', '#facc15', '#22c55e', '#3b82f6'] },
  { id: 'hello_kitty', name: 'Hello Kitty 🎀', colors: ['#ffd6e7', '#fffafd', '#ed4a91', '#392735'] }
];

const textureCache = new Map();

function addSilkPaperGrain(ctx, size) {
  // Subtle tissue-paper fiber & crinkle grain
  ctx.save();
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 6 + Math.random() * 18;
    const ang = Math.random() * Math.PI;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.035)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  // Folded glue hem ("bainha") shadow around outer edge
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.34, size / 2, size / 2, size * 0.52);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
}

export function getKitePatternTexture(patternId) {
  if (textureCache.has(`kite_${patternId}`)) {
    return textureCache.get(`kite_${patternId}`);
  }

  const pattern = KITE_PATTERNS.find((p) => p.id === patternId) || KITE_PATTERNS[0];
  const [c1, c2, c3, c4] = pattern.colors;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;

  ctx.fillStyle = c1;
  ctx.fillRect(0, 0, size, size);

  ctx.lineJoin = 'round';

  if (pattern.id === 'estrela_paulista') {
    // Classic 8-point star recorte with glued seam lines
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((i * Math.PI) / 4);
      ctx.fillStyle = i % 2 === 0 ? c1 : c2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-140, -size);
      ctx.lineTo(140, -size);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }
    // Inner star
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = c3;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? 155 : 68;
      const a = (i * Math.PI) / 8 - Math.PI / 2;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = c4;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
  } else if (pattern.id === 'brasil_ouro') {
    // Green base, yellow diamond, blue circle & whitechevron bands
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, size, size);

    // Outer white chevrons
    ctx.strokeStyle = c4;
    ctx.lineWidth = 24;
    ctx.strokeRect(42, 42, size - 84, size - 84);

    // Yellow diamond
    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.moveTo(cx, 54);
    ctx.lineTo(size - 48, cy);
    ctx.lineTo(cx, size - 54);
    ctx.lineTo(48, cy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Blue center circle + white arc
    ctx.fillStyle = c3;
    ctx.beginPath();
    ctx.arc(cx, cy, 94, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 94, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = c4;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(cx - 25, cy + 125, 165, -Math.PI * 0.75, -Math.PI * 0.15);
    ctx.stroke();
    ctx.restore();
  } else if (pattern.id === 'raio_neon') {
    // Diagonal split + jagged lightning slash
    ctx.fillStyle = c4;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = c1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size * 0.65, 0);
    ctx.lineTo(size * 0.35, size);
    ctx.lineTo(0, size);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(size * 0.72, 0);
    ctx.lineTo(size * 0.42, size);
    ctx.lineTo(size, size);
    ctx.closePath();
    ctx.fill();

    // Central yellow lightning bolt
    ctx.fillStyle = c3;
    ctx.beginPath();
    ctx.moveTo(cx + 45, 10);
    ctx.lineTo(cx - 65, cy + 12);
    ctx.lineTo(cx + 8, cy + 12);
    ctx.lineTo(cx - 52, size - 10);
    ctx.lineTo(cx + 78, cy - 28);
    ctx.lineTo(cx + 5, cy - 28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.stroke();
  } else if (pattern.id === 'rubro_negra') {
    // Bold horizontal/chevron stripes + center crest
    const stripes = 7;
    const h = size / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? c1 : c2;
      ctx.fillRect(0, i * h, size, h + 1);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, i * h, size, 4);
    }
    // Central white & orange diamond star
    ctx.fillStyle = c3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 115);
    ctx.lineTo(cx + 115, cy);
    ctx.lineTo(cx, cy + 115);
    ctx.lineTo(cx - 115, cy);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = c4;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 68);
    ctx.lineTo(cx + 68, cy);
    ctx.lineTo(cx, cy + 68);
    ctx.lineTo(cx - 68, cy);
    ctx.closePath();
    ctx.fill();
  } else if (pattern.id === 'sol_favela') {
    // Radial sunburst rays from lower-center
    const sunY = size * 0.62;
    const rays = 14;
    for (let i = 0; i < rays; i++) {
      ctx.save();
      ctx.translate(cx, sunY);
      ctx.rotate((i * Math.PI * 2) / rays);
      ctx.fillStyle = i % 2 === 0 ? c1 : i % 4 === 1 ? c2 : c4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-95, -size);
      ctx.lineTo(95, -size);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.16)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.arc(cx, sunY, 82, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c3;
    ctx.lineWidth = 8;
    ctx.stroke();
  } else if (pattern.id === 'xadrez_laje') {
    // Classic diagonal taqueado (checkerboard recorte)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    const cell = 74;
    for (let gx = -6; gx <= 6; gx++) {
      for (let gy = -6; gy <= 6; gy++) {
        const mod = Math.abs(gx + gy) % 3;
        ctx.fillStyle = mod === 0 ? c1 : mod === 1 ? c2 : c3;
        ctx.fillRect(gx * cell, gy * cell, cell, cell);
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 3.5;
        ctx.strokeRect(gx * cell, gy * cell, cell, cell);
      }
    }
    ctx.restore();
  } else if (pattern.id === 'hello_kitty') {
    // Pink tissue-paper background with a hand-cut Hello Kitty face and bow.
    const pinkWash = ctx.createLinearGradient(0, 0, size, size);
    pinkWash.addColorStop(0, '#ffe7f0');
    pinkWash.addColorStop(0.52, '#ffc5dc');
    pinkWash.addColorStop(1, '#fff0f6');
    ctx.fillStyle = pinkWash;
    ctx.fillRect(0, 0, size, size);

    // Small hearts and diagonal pink silk strips around the face.
    ctx.save();
    ctx.strokeStyle = 'rgba(226, 72, 137, 0.23)';
    ctx.lineWidth = 12;
    for (let x = -size; x < size * 2; x += 74) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - size * 0.42, size);
      ctx.stroke();
    }
    const drawHeart = (x, y, scale) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = '#f28ab7';
      ctx.beginPath();
      ctx.moveTo(0, 15);
      ctx.bezierCurveTo(-48, -12, -25, -42, 0, -20);
      ctx.bezierCurveTo(25, -42, 48, -12, 0, 15);
      ctx.fill();
      ctx.restore();
    };
    drawHeart(86, 100, 0.62);
    drawHeart(423, 92, 0.58);
    drawHeart(82, 405, 0.54);
    drawHeart(432, 410, 0.66);
    ctx.restore();

    // Kitty ears and rounded white face, outlined like a sewn paper applique.
    ctx.save();
    ctx.fillStyle = '#fffafd';
    ctx.strokeStyle = '#392735';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(cx - 91, cy - 29);
    ctx.lineTo(cx - 123, cy - 145);
    ctx.quadraticCurveTo(cx - 128, cy - 166, cx - 105, cy - 157);
    ctx.lineTo(cx - 38, cy - 109);
    ctx.quadraticCurveTo(cx, cy - 124, cx + 38, cy - 109);
    ctx.lineTo(cx + 105, cy - 157);
    ctx.quadraticCurveTo(cx + 128, cy - 166, cx + 123, cy - 145);
    ctx.lineTo(cx + 91, cy - 29);
    ctx.bezierCurveTo(cx + 133, cy + 13, cx + 118, cy + 112, cx + 43, cy + 132);
    ctx.quadraticCurveTo(cx, cy + 148, cx - 43, cy + 132);
    ctx.bezierCurveTo(cx - 118, cy + 112, cx - 133, cy + 13, cx - 91, cy - 29);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Pink inner ears.
    ctx.fillStyle = '#f7a7c8';
    ctx.beginPath();
    ctx.moveTo(cx - 103, cy - 124);
    ctx.lineTo(cx - 67, cy - 99);
    ctx.lineTo(cx - 93, cy - 70);
    ctx.closePath();
    ctx.moveTo(cx + 103, cy - 124);
    ctx.lineTo(cx + 67, cy - 99);
    ctx.lineTo(cx + 93, cy - 70);
    ctx.closePath();
    ctx.fill();

    // Bow on the upper-right ear.
    ctx.fillStyle = '#ed3f88';
    ctx.strokeStyle = '#9f2458';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(cx + 68, cy - 91);
    ctx.bezierCurveTo(cx + 34, cy - 147, cx + 77, cy - 177, cx + 119, cy - 147);
    ctx.bezierCurveTo(cx + 145, cy - 126, cx + 112, cy - 98, cx + 91, cy - 90);
    ctx.bezierCurveTo(cx + 135, cy - 80, cx + 157, cy - 46, cx + 124, cy - 30);
    ctx.bezierCurveTo(cx + 96, cy - 17, cx + 76, cy - 52, cx + 68, cy - 91);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffb2d0';
    ctx.beginPath();
    ctx.ellipse(cx + 82, cy - 87, 15, 18, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eyes, yellow nose, blush and the six signature whiskers.
    ctx.fillStyle = '#241d27';
    ctx.beginPath();
    ctx.ellipse(cx - 43, cy + 13, 8, 15, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 43, cy + 13, 8, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f7c94b';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 38, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c28c23';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = 'rgba(244, 139, 180, 0.55)';
    ctx.beginPath();
    ctx.ellipse(cx - 76, cy + 49, 18, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 76, cy + 49, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#392735';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    const whiskers = [
      [-73, 22, -122, 8], [-76, 39, -129, 39], [-72, 56, -120, 72],
      [73, 22, 122, 8], [76, 39, 129, 39], [72, 56, 120, 72]
    ];
    for (const [x1, y1, x2, y2] of whiskers) {
      ctx.beginPath();
      ctx.moveTo(cx + x1, cy + y1);
      ctx.lineTo(cx + x2, cy + y2);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    // Geometria Verde-Limão: concentric V-chevrons ("Peixinho listrado")
    const bands = [c3, c2, c1, c4, c3, c1, c2, c4];
    bands.forEach((col, idx) => {
      const inset = idx * 34;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx, inset);
      ctx.lineTo(size - inset, cy);
      ctx.lineTo(cx, size - inset);
      ctx.lineTo(inset, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 4;
      ctx.stroke();
    });
  }

  addSilkPaperGrain(ctx, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  textureCache.set(`kite_${patternId}`, tex);
  return tex;
}

export function createBrickTextures() {
  if (textureCache.has('brick_set')) return textureCache.get('brick_set');

  const w = 512;
  const h = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = w;
  colorCanvas.height = h;
  const ctx = colorCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const bctx = bumpCanvas.getContext('2d');

  // Mortar background
  ctx.fillStyle = '#8b857c';
  ctx.fillRect(0, 0, w, h);
  bctx.fillStyle = '#383838';
  bctx.fillRect(0, 0, w, h);

  const rows = 8;
  const cols = 4;
  const bh = h / rows;
  const bw = w / cols;
  const mortar = 6;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * bw + offset + mortar * 0.5;
      const y = r * bh + mortar * 0.5;
      const rw = bw - mortar;
      const rh = bh - mortar;

      const shade = (Math.random() - 0.5) * 22;
      const red = Math.min(230, Math.max(150, 188 + shade));
      const green = Math.min(130, Math.max(70, 96 + shade * 0.6));
      const blue = Math.min(95, Math.max(45, 62 + shade * 0.4));

      ctx.fillStyle = `rgb(${red | 0}, ${green | 0}, ${blue | 0})`;
      ctx.fillRect(x, y, rw, rh);

      // Subtle ceramic grooves on Brazilian tijolo baiano
      ctx.fillStyle = 'rgba(0,0,0,0.09)';
      ctx.fillRect(x, y + rh * 0.28, rw, 3);
      ctx.fillRect(x, y + rh * 0.68, rw, 3);

      bctx.fillStyle = '#d4d4d4';
      bctx.fillRect(x, y, rw, rh);
      bctx.fillStyle = '#9e9e9e';
      bctx.fillRect(x, y + rh * 0.28, rw, 3);
      bctx.fillRect(x, y + rh * 0.68, rw, 3);
    }
  }

  // Weathering noise
  for (let i = 0; i < 3500; i++) {
    const nx = Math.random() * w;
    const ny = Math.random() * h;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(nx, ny, 3, 3);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;

  const set = { map, bumpMap };
  textureCache.set('brick_set', set);
  return set;
}

export function createConcreteTextures() {
  if (textureCache.has('concrete_set')) return textureCache.get('concrete_set');

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#9ca3af';
  ctx.fillRect(0, 0, size, size);

  // Slab patches & sun-bleached concrete stains
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 25 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    const dark = Math.random() > 0.45;
    g.addColorStop(0, dark ? 'rgba(55,60,68,0.11)' : 'rgba(235,238,242,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Slab grid expansion lines
  ctx.strokeStyle = 'rgba(40,44,52,0.28)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.stroke();

  // Aggregate speckles
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(30,30,35,0.08)' : 'rgba(255,255,255,0.07)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(canvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;

  const set = { map, bumpMap };
  textureCache.set('concrete_set', set);
  return set;
}

export function createCorrugatedRoofTexture(isTerracotta = false) {
  const key = isTerracotta ? 'roof_clay' : 'roof_zinc';
  if (textureCache.has(key)) return textureCache.get(key);

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const ridges = 12;
  const rw = size / ridges;
  for (let i = 0; i < ridges; i++) {
    const grad = ctx.createLinearGradient(i * rw, 0, (i + 1) * rw, 0);
    if (isTerracotta) {
      grad.addColorStop(0, '#7c2d12');
      grad.addColorStop(0.45, '#c2410c');
      grad.addColorStop(0.75, '#9a3412');
      grad.addColorStop(1, '#6c240c');
    } else {
      grad.addColorStop(0, '#64748b');
      grad.addColorStop(0.5, '#cbd5e1');
      grad.addColorStop(1, '#475569');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(i * rw, 0, rw + 1, size);
  }

  // Horizontal tile overlap shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, size * 0.5, size, 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  textureCache.set(key, tex);
  return tex;
}

export function createWoodSpoolTexture() {
  if (textureCache.has('wood_spool')) return textureCache.get('wood_spool');

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;

  // Rich Brazilian cedar / imbuia wood base
  const radGrad = ctx.createRadialGradient(cx, cy, 12, cx, cy, size * 0.5);
  radGrad.addColorStop(0, '#78350f');
  radGrad.addColorStop(0.55, '#b45309');
  radGrad.addColorStop(0.82, '#92400e');
  radGrad.addColorStop(1, '#451a03');
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, size, size);

  // Wood grain streaks + turned lathe rings
  for (let i = 0; i < 120; i++) {
    const y = (i / 120) * size;
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(45,15,2,0.18)' : 'rgba(253,224,71,0.06)';
    ctx.lineWidth = 1 + Math.random() * 2.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.33, y + Math.sin(i) * 8, size * 0.66, y - Math.cos(i) * 8, size, y);
    ctx.stroke();
  }

  // Decorative marquetry inlay rings on Brazilian carretilha chilena
  const ringColors = ['#fde047', '#111827', '#ef4444', '#ffffff'];
  ringColors.forEach((col, i) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = i === 1 ? 5 : 3;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.42 + i * 5, 0, Math.PI * 2);
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set('wood_spool', tex);
  return tex;
}
