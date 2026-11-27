import { spawn } from 'node:child_process';

const processes = [
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', '5173'], { stdio: 'inherit' }),
  spawn(process.execPath, ['server.js', '--ws-only'], { stdio: 'inherit', env: { ...process.env, MULTIPLAYER_PORT: process.env.MULTIPLAYER_PORT || '8081' } })
];

let shuttingDown = false;
function stopAll(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) if (!child.killed) child.kill('SIGTERM');
  process.exit(code);
}
for (const child of processes) {
  child.on('error', (error) => {
    console.error('Não foi possível iniciar um dos serviços:', error.message);
    stopAll(1);
  });
  child.on('exit', (code) => {
    if (!shuttingDown && code !== 0) stopAll(code || 1);
  });
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
console.log('Jogo: http://localhost:5173  |  WebSocket local: ws://localhost:8081/ws');
