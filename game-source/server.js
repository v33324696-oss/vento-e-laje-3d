import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { evaluateReloScore, getCrossingQuality, closestSegments3D } from './src/relo.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DIST = resolve(ROOT, 'dist');
const WS_ONLY = process.argv.includes('--ws-only');
const PORT = WS_ONLY ? Number(process.env.MULTIPLAYER_PORT || 8081) : Number(process.env.PORT || 10000);
const MAX_PLAYERS_PER_ROOM = 12;
const rooms = new Map();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2'
};

const makeCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const safeState = (state = {}) => {
  const numberArray = (value, length) => Array.isArray(value) && value.length === length
    ? value.map((n) => Number.isFinite(Number(n)) ? Math.max(-10000, Math.min(10000, Number(n))) : 0)
    : null;
  return {
    mapId: ['laje', 'praia', 'parque', 'campinho', 'morro'].includes(state.mapId) ? state.mapId : 'laje',
    position: numberArray(state.position, 3) || [0, 0, 0],
    rotation: Number.isFinite(Number(state.rotation)) ? Math.max(-Math.PI * 8, Math.min(Math.PI * 8, Number(state.rotation))) : 0,
    kitePosition: numberArray(state.kitePosition, 3) || [0, 20, -40],
    kiteQuaternion: numberArray(state.kiteQuaternion, 4) || [0, 0, 0, 1],
    kiteVelocity: numberArray(state.kiteVelocity, 3) || [0, 0, 0],
    linePoints: numberArray(state.linePoints, 24),
    lineLength: Number.isFinite(Number(state.lineLength)) ? Math.max(0, Math.min(250, Number(state.lineLength))) : 58,
    tension: Number.isFinite(Number(state.tension)) ? Math.max(0, Math.min(1, Number(state.tension))) : 0.5,
    reelSpeed: Number.isFinite(Number(state.reelSpeed)) ? Math.max(-40, Math.min(40, Number(state.reelSpeed))) : 0,
    socada: Number.isFinite(Number(state.socada)) ? Math.max(0, Math.min(1.5, Number(state.socada))) : 0,
    disque: Number.isFinite(Number(state.disque)) ? Math.max(0, Math.min(1.2, Number(state.disque))) : 0,
    disbicar: Number.isFinite(Number(state.disbicar)) ? Math.max(0, Math.min(1, Number(state.disbicar))) : 0,
    largadaActive: state.largadaActive === true,
    largadaTagActive: state.largadaTagActive === true,
    largadaQuality: Number.isFinite(Number(state.largadaQuality)) ? Math.max(0, Math.min(1, Number(state.largadaQuality))) : 0,
    linePower: Number.isFinite(Number(state.linePower)) ? Math.max(0.55, Math.min(1.2, Number(state.linePower))) : 0.8,
    lineIntegrity: Number.isFinite(Number(state.lineIntegrity)) ? Math.max(0, Math.min(1, Number(state.lineIntegrity))) : 1,
    lineDurability: Number.isFinite(Number(state.lineDurability)) ? Math.max(0.55, Math.min(1.35, Number(state.lineDurability))) : 1,
    lineRecovery: Number.isFinite(Number(state.lineRecovery)) ? Math.max(0.1, Math.min(1.2, Number(state.lineRecovery))) : 0.45,
    lineDischargeSafe: state.lineDischargeSafe === true,
    modelId: typeof state.modelId === 'string' ? state.modelId.slice(0, 24) : 'murcha',
    patternId: typeof state.patternId === 'string' ? state.patternId.slice(0, 32) : 'estrela_paulista',
    lineTypeId: typeof state.lineTypeId === 'string' ? state.lineTypeId.slice(0, 32) : 'branca_pura',
    active: state.active !== false
  };
};

function send(socket, payload) {
  if (socket.readyState === 1) socket.send(JSON.stringify(payload));
}

function roomRoster(room) {
  return [...room.players.values()].map(({ id, name, state }) => ({ id, name, state }));
}

function broadcast(room, payload, exceptId = null) {
  const packet = JSON.stringify(payload);
  for (const player of room.players.values()) {
    if (player.id !== exceptId && player.socket.readyState === 1) player.socket.send(packet);
  }
}

function removePlayer(room, player) {
  if (!room || !player || !room.players.has(player.id)) return;
  room.players.delete(player.id);
  for (const key of [...room.fights.keys()]) if (key.split(':').includes(player.id)) room.fights.delete(key);
  for (const key of [...room.cooldowns.keys()]) if (key.split(':').includes(player.id)) room.cooldowns.delete(key);
  broadcast(room, { type: 'player-left', playerId: player.id, name: player.name });
  if (room.players.size === 0) rooms.delete(room.code);
}

function playerLine(player) {
  const state = player.state;
  if (Array.isArray(state.linePoints) && state.linePoints.length === 24) {
    const points = [];
    for (let i = 0; i < state.linePoints.length; i += 3) {
      points.push([state.linePoints[i], state.linePoints[i + 1], state.linePoints[i + 2]]);
    }
    return { points };
  }
  const anchor = [state.position[0], state.position[1] + 1.18, state.position[2]];
  return { points: [anchor, state.kitePosition] };
}

function closestPolylineContact(pointsA, pointsB) {
  let best = { distance: Infinity, s: 0, t: 0, crossingQuality: 0 };
  const segmentA = [0, 0, 0], segmentB = [0, 0, 0];
  for (let i = 0; i < pointsA.length - 1; i++) {
    for (let j = 0; j < pointsB.length - 1; j++) {
      const contact = closestSegments3D(pointsA[i], pointsA[i + 1], pointsB[j], pointsB[j + 1]);
      if (contact.distance >= best.distance) continue;
      for (let axis = 0; axis < 3; axis++) {
        segmentA[axis] = pointsA[i + 1][axis] - pointsA[i][axis];
        segmentB[axis] = pointsB[j + 1][axis] - pointsB[j][axis];
      }
      best = {
        distance: contact.distance,
        s: (i + contact.s) / (pointsA.length - 1),
        t: (j + contact.t) / (pointsB.length - 1),
        crossingQuality: getCrossingQuality(segmentA, segmentB)
      };
    }
  }
  return best;
}
function moveNameFor(player, ownU, targetU) {
  if (player.state.disbicar > 0.22) return 'no disbicar';
  if (player.state.largadaTagActive && player.state.largadaQuality >= 0.68) return 'largada';
  if (player.state.socada > 0.28) return 'socada';
  if (player.state.reelSpeed < -11) return 'puxada';
  if (player.state.reelSpeed > 11) return 'descarrego';
  if (targetU > 0.82 && ownU < 0.78) return 'no cabresto';
  return 'no cruzamento';
}

function rearAdvantage(attacker, defender) {
  const v = defender.state.kiteVelocity;
  let fx = v[0], fy = v[1], fz = v[2];
  let fl = Math.hypot(fx, fy, fz);
  if (fl < 0.8) {
    fx = defender.state.kitePosition[0] - defender.state.position[0];
    fy = defender.state.kitePosition[1] - defender.state.position[1];
    fz = defender.state.kitePosition[2] - defender.state.position[2];
    fl = Math.hypot(fx, fy, fz) || 1;
  }
  const rx = attacker.state.kitePosition[0] - defender.state.kitePosition[0];
  const ry = attacker.state.kitePosition[1] - defender.state.kitePosition[1];
  const rz = attacker.state.kitePosition[2] - defender.state.kitePosition[2];
  const rl = Math.hypot(rx, ry, rz) || 1;
  return (rx * fx + ry * fy + rz * fz) / (rl * fl) < -0.25 ? 1 : 0;
}

function updateRoomRelo(room, dt, now) {
  const players = [...room.players.values()].filter((player) => player.state?.active !== false);
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      const key = [a.id, b.id].sort().join(':');
      if ((room.cooldowns.get(key) || 0) > now) continue;

      const lineA = playerLine(a), lineB = playerLine(b);
      const contact = closestPolylineContact(lineA.points, lineB.points);
      const crossingQuality = contact.crossingQuality;
      const relativeSpeed = Math.hypot(
        a.state.kiteVelocity[0] - b.state.kiteVelocity[0],
        a.state.kiteVelocity[1] - b.state.kiteVelocity[1],
        a.state.kiteVelocity[2] - b.state.kiteVelocity[2]
      );
      const activeMotion = Math.max(relativeSpeed, Math.abs(a.state.reelSpeed), Math.abs(b.state.reelSpeed), a.state.socada * 8, b.state.socada * 8, a.state.disque * 8, b.state.disque * 8, a.state.disbicar * 8, b.state.disbicar * 8);

      if (contact.distance > 1.08 || crossingQuality < 0.19 || activeMotion < 1.25) {
        const existing = room.fights.get(key);
        if (existing && now - existing.lastTouch > 420) room.fights.delete(key);
        else if (existing) {
          existing.integrityA = Math.min(1, existing.integrityA + a.state.lineRecovery * dt);
          existing.integrityB = Math.min(1, existing.integrityB + b.state.lineRecovery * dt);
          a.state.lineIntegrity = existing.integrityA;
          b.state.lineIntegrity = existing.integrityB;
          if (now - existing.lastTouch > 100) existing.contactSince = now;
        }
        continue;
      }

      let fight = room.fights.get(key);
      if (!fight) {
        fight = { integrityA: a.state.lineIntegrity, integrityB: b.state.lineIntegrity, lastTouch: now, contactSince: now };
        room.fights.set(key, fight);
      }
      fight.lastTouch = now;

      const wrapQuality = Math.max(0, Math.min(1, (now - fight.contactSince) / 380));

      const scoreA = evaluateReloScore({
        crossingQuality, tension: a.state.tension, reelSpeed: a.state.reelSpeed,
        kiteSpeed: Math.hypot(...a.state.kiteVelocity), relativeSpeed,
        socada: a.state.socada, disque: a.state.disque, disbicar: a.state.disbicar,
        largadaActive: a.state.largadaActive, largadaQuality: a.state.largadaQuality,
        linePower: a.state.linePower, ownU: contact.s, targetU: contact.t, wrapQuality,
        rearAdvantage: rearAdvantage(a, b),
        defenderExposure: b.state.reelSpeed > 5 && !b.state.lineDischargeSafe ? Math.max(0, Math.min(1, (b.state.reelSpeed - 5) / 22)) : 0
      });
      const scoreB = evaluateReloScore({
        crossingQuality, tension: b.state.tension, reelSpeed: b.state.reelSpeed,
        kiteSpeed: Math.hypot(...b.state.kiteVelocity), relativeSpeed,
        socada: b.state.socada, disque: b.state.disque, disbicar: b.state.disbicar,
        largadaActive: b.state.largadaActive, largadaQuality: b.state.largadaQuality,
        linePower: b.state.linePower, ownU: contact.t, targetU: contact.s, wrapQuality,
        rearAdvantage: rearAdvantage(b, a),
        defenderExposure: a.state.reelSpeed > 5 && !a.state.lineDischargeSafe ? Math.max(0, Math.min(1, (a.state.reelSpeed - 5) / 22)) : 0
      });

      const frictionFactor = 0.38 + crossingQuality * 0.18;
      fight.integrityB -= scoreA * dt * frictionFactor / Math.max(0.55, b.state.lineDurability);
      fight.integrityA -= scoreB * dt * frictionFactor / Math.max(0.55, a.state.lineDurability);
      a.state.lineIntegrity = Math.max(0, fight.integrityA);
      b.state.lineIntegrity = Math.max(0, fight.integrityB);

      if (fight.integrityA <= 0 || fight.integrityB <= 0) {
        const aWins = fight.integrityB <= 0 && (fight.integrityA > 0 || scoreA >= scoreB);
        const winner = aWins ? a : b;
        const loser = aWins ? b : a;
        const ownU = aWins ? contact.s : contact.t;
        const targetU = aWins ? contact.t : contact.s;
        loser.state.active = false;
        loser.state.lineIntegrity = 0;
        winner.state.lineIntegrity = 1;
        const result = {
          type: 'relo-result', winnerId: winner.id, loserId: loser.id,
          winnerName: winner.name, loserName: loser.name,
          moveName: moveNameFor(winner, ownU, targetU),
          players: roomRoster(room)
        };
        room.fights.delete(key);
        room.cooldowns.set(key, now + 2800);
        broadcast(room, result);
      }
    }
  }
  for (const [key, until] of room.cooldowns) if (until <= now) room.cooldowns.delete(key);
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, service: 'vento-e-laje', rooms: rooms.size }));
    return;
  }
  if (WS_ONLY) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Vento & Laje WebSocket development server');
    return;
  }
  if (!existsSync(DIST)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Build não encontrado. Execute npm run build antes de iniciar o servidor.');
    return;
  }

  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch {
    res.writeHead(400); res.end('Bad request'); return;
  }
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let file = resolve(DIST, requested);
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    // SPA fallback only for navigation requests; missing assets remain 404.
    if (req.headers.accept?.includes('text/html')) file = resolve(DIST, 'index.html');
    else { res.writeHead(404); res.end('Not found'); return; }
  }
  const ext = extname(file).toLowerCase();
  const immutable = /\/assets\/.*-[\w-]+\./.test(file);
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
    'x-content-type-options': 'nosniff'
  });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
httpServer.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname !== '/ws') { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (socket) => {
  let currentRoom = null;
  let currentPlayer = null;
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });

  socket.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'join') {
      if (currentRoom) return;
      let code = String(message.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      if (message.create || !code) {
        do { code = makeCode(); } while (rooms.has(code));
      }
      let room = rooms.get(code);
      if (!room && !message.create && message.room) {
        send(socket, { type: 'error', message: 'Sala não encontrada. Confira o código ou crie uma nova sala.' });
        socket.close(1008, 'Sala não encontrada');
        return;
      }
      if (!room) {
        room = { code, mapId: ['laje', 'praia', 'parque', 'campinho', 'morro'].includes(message.mapId) ? message.mapId : 'laje', players: new Map(), fights: new Map(), cooldowns: new Map() };
        rooms.set(code, room);
      }
      if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
        send(socket, { type: 'error', message: 'Essa sala já atingiu o limite de 12 pipeiros.' });
        socket.close(1008, 'Sala cheia');
        return;
      }
      currentRoom = room;
      currentPlayer = {
        id: randomUUID(),
        name: String(message.name || 'Pipeiro').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 18) || 'Pipeiro',
        socket,
        state: safeState({ mapId: room.mapId })
      };
      room.players.set(currentPlayer.id, currentPlayer);
      send(socket, {
        type: 'joined', playerId: currentPlayer.id, roomCode: room.code,
        mapId: room.mapId, players: roomRoster(room), maxPlayers: MAX_PLAYERS_PER_ROOM
      });
      broadcast(room, { type: 'roster', players: roomRoster(room) }, currentPlayer.id);
      return;
    }

    if (message.type === 'state' && currentRoom && currentPlayer) {
      const nextState = safeState(message.state);
      // The server owns combat HP; regular movement snapshots must not refill a damaged line.
      nextState.lineIntegrity = currentPlayer.state.active === false && nextState.active
        ? nextState.lineIntegrity
        : currentPlayer.state.lineIntegrity;
      currentPlayer.state = nextState;
      broadcast(currentRoom, {
        type: 'player-state',
        player: { id: currentPlayer.id, name: currentPlayer.name, state: currentPlayer.state }
      }, currentPlayer.id);
    }
  });

  socket.on('close', () => removePlayer(currentRoom, currentPlayer));
  socket.on('error', () => removePlayer(currentRoom, currentPlayer));
});

const combatTicker = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) updateRoomRelo(room, 0.05, now);
}, 50);
combatTicker.unref();

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) { socket.terminate(); continue; }
    socket.isAlive = false;
    socket.ping();
  }
}, 25000);
heartbeat.unref();

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(WS_ONLY
    ? `Servidor WebSocket de desenvolvimento em ws://0.0.0.0:${PORT}/ws`
    : `Vento & Laje disponível na porta ${PORT} (HTTP + WebSocket /ws)`);
});

function shutdown() {
  clearInterval(heartbeat);
  clearInterval(combatTicker);
  for (const socket of wss.clients) socket.close(1001, 'Servidor encerrando');
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
