export class MultiplayerClient {
  constructor({ onMessage = () => {}, onStatus = () => {} } = {}) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.socket = null;
    this.connected = false;
    this.playerId = null;
    this.roomCode = null;
  }

  buildUrl(customUrl = '') {
    const secure = window.location.protocol === 'https:';
    if (customUrl.trim()) {
      let value = customUrl.trim();
      if (!/^wss?:\/\//i.test(value)) {
        if (/^https?:\/\//i.test(value)) value = value.replace(/^http/i, 'ws');
        else value = `${secure ? 'wss' : 'ws'}://${value}`;
      }
      const parsed = new URL(value);
      if (parsed.protocol === 'https:') parsed.protocol = 'wss:';
      if (parsed.protocol === 'http:') parsed.protocol = 'ws:';
      if (parsed.pathname === '/' || !parsed.pathname) parsed.pathname = '/ws';
      return parsed.toString();
    }
    if (import.meta.env.DEV) {
      return `${secure ? 'wss:' : 'ws:'}//${window.location.hostname}:8081/ws`;
    }
    return `${secure ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
  }

  connect({ name, room = '', create = false, serverUrl = '', mapId = 'laje', difficulty = 'normal' }) {
    return new Promise((resolve, reject) => {
      this.disconnect(false);
      const url = this.buildUrl(serverUrl);
      this.onStatus('Conectando ao servidor…');
      let socket;
      try {
        socket = new WebSocket(url);
      } catch (error) {
        reject(error);
        return;
      }
      this.socket = socket;
      let settled = false;

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({
          type: 'join', name: (name || 'Pipeiro').slice(0, 18),
          room: room.trim().toUpperCase(), create: !!create, mapId, difficulty
        }));
      });

      socket.addEventListener('message', (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        if (data.type === 'pong') {
          const sentAt = Number(data.sentAt);
          data.latencyMs = Number.isFinite(sentAt) ? Math.max(0, performance.now() - sentAt) : null;
        }
        if (data.type === 'joined') {
          this.connected = true;
          this.playerId = data.playerId;
          this.roomCode = data.roomCode;
          this.onStatus(`Conectado à sala ${data.roomCode}`);
          if (!settled) { settled = true; resolve(data); }
        } else if (data.type === 'error') {
          this.onStatus(data.message || 'Não foi possível entrar na sala.');
          if (!settled) { settled = true; reject(new Error(data.message || 'Falha ao entrar na sala.')); }
        }
        this.onMessage(data);
      });

      socket.addEventListener('error', () => {
        this.onStatus('Não foi possível conectar. Verifique se o servidor online está ligado.');
        if (!settled) { settled = true; reject(new Error('Falha de conexão com o servidor online.')); }
      });

      socket.addEventListener('close', () => {
        const wasConnected = this.connected;
        this.connected = false;
        this.playerId = null;
        if (wasConnected) this.onStatus('Conexão encerrada.');
        this.onMessage({ type: 'disconnected' });
      });
    });
  }

  sendState(state) {
    if (!this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: 'state', state }));
  }

  sendPing() {
    if (!this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: 'ping', sentAt: performance.now() }));
    return true;
  }

  sendChat(text) {
    if (!this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    const message = String(text || '').trim().slice(0, 140);
    if (!message) return false;
    this.socket.send(JSON.stringify({ type: 'chat', text: message }));
    return true;
  }

  sendEmote(emote) {
    if (!this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    const value = String(emote || '').slice(0, 8);
    if (!value) return false;
    this.socket.send(JSON.stringify({ type: 'emote', emote: value }));
    return true;
  }

  disconnect(updateStatus = true) {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
    this.playerId = null;
    this.roomCode = null;
    if (updateStatus) this.onStatus('Desconectado.');
  }
}
