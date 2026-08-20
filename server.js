const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocket, WebSocketServer } = require('ws');

const root = __dirname;
const rooms = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

const WEBHOOK_ROOM_CREATED = 'https://discord.com/api/webhooks/1539825502444064805/oeshAlACZ4gun6km5bPGwxX6_GHTTBvgSs31xh-eeC2boIfmo3GpTpiwS0ulSUnaa2sS';
const WEBHOOK_USER_JOINED = 'https://discord.com/api/webhooks/1539825674423111690/kxtJeMmEPTiiM1Lb8wUOkSlSUc1gV8I8a9bXqrSLpTcs85Ytr78lTB84g8-qNfUBO1_D';
const WEBHOOK_USER_LEFT = 'https://discord.com/api/webhooks/1539825778181799986/KnHyQXieMfQ_IJ3rNQao4RGfjfj_TN9hCBThPU6Bbux-YJ997hlEUp0viv3Mhwywh9vu';
const WEBHOOK_KICKED = 'https://discord.com/api/webhooks/1539825862268944496/wjkUq0wsmgsQuZiMW4Utdikd2zsTVjmisLP6rrKEowXz7DSs1DHaflgfKjuDscBaIauD';
const WEBHOOK_SCREEN_SHARE = 'https://discord.com/api/webhooks/1539826012827684864/HkXke7rWKqtLis1XGUq8LcfCSLWSqgxYRMk-KHLNn4YbOgBls5EkPGxjdq2gHTEOkcv0';
const WEBHOOK_CHAT_MESSAGE = 'https://discord.com/api/webhooks/1539826152129040416/PWzCNRaL7BhoeAhXnh2_pMEhTZKmtHtRdkMBbKmWB_K7mgaowTVjx8vTz6j96n3u3akg';

function sendDiscordWebhook(url, title, color, fields) {
  const embed = {
    title,
    color,
    fields,
    timestamp: new Date().toISOString()
  };
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] })
  }).catch(error => console.error('Discord webhook failed:', error.message));
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const requested = decodeURIComponent(requestUrl.pathname);
  const filePath = path.normalize(path.join(root, requested === '/' ? 'index.html' : requested));
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) { response.writeHead(404); return response.end('Not found'); }
  response.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
});

const wss = new WebSocketServer({ server });
const send = (client, message) => client.readyState === WebSocket.OPEN && client.send(JSON.stringify(message));
const roster = room => [...room.clients].map(client => ({ id: client.clientId, name: client.displayName, owner: client.isOwner, sharing: client.isSharing }));
const broadcastRoster = room => room.clients.forEach(client => send(client, { type: 'roster', members: roster(room) }));

wss.on('connection', socket => {
  socket.on('message', raw => {
    let message; try { message = JSON.parse(raw); } catch { return; }
    if (message.type === 'join') {
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(message.room)) return socket.close();
      let room = rooms.get(message.room);
      const isNewRoom = !room;
      if (!room) { room = { clients: new Set(), ownerId: null }; rooms.set(message.room, room); }
      socket.clientId = Math.random().toString(36).slice(2, 10); socket.roomId = message.room; socket.displayName = String(message.name || 'Visitante').slice(0, 24); socket.isOwner = room.ownerId === null; socket.isSharing = false;
      if (socket.isOwner) room.ownerId = socket.clientId;
      room.clients.add(socket);
      send(socket, { type: 'welcome', id: socket.clientId, members: roster(room) });
      room.clients.forEach(client => { if (client !== socket) send(client, { type: 'user-joined', id: socket.clientId, name: socket.displayName, members: roster(room) }); });
      if (isNewRoom) sendDiscordWebhook(WEBHOOK_ROOM_CREATED, '📢 Sala criada', 0x00ff00, [
        { name: '🏷️ Código', value: `\`${message.room}\``, inline: true },
        { name: '👑 Dono', value: socket.displayName, inline: true }
      ]);
      sendDiscordWebhook(WEBHOOK_USER_JOINED, '✅ Usuário entrou na sala', 0x3498db, [
        { name: '🏷️ Sala', value: `\`${socket.roomId}\``, inline: true },
        { name: '👤 Usuário', value: socket.displayName, inline: true }
      ]);
      return;
    }
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId); if (!room) return;
    if (message.type === 'sharing-started') {
      socket.isSharing = true;
      sendDiscordWebhook(WEBHOOK_SCREEN_SHARE, '🖥️ Compartilhamento de tela', 0x9b59b6, [
        { name: '🏷️ Sala', value: `\`${socket.roomId}\``, inline: true },
        { name: '👤 Usuário', value: socket.displayName, inline: true }
      ]);
    }
    if (message.type === 'stop-sharing') socket.isSharing = false;
    if (message.type === 'chat-message') {
      const text = String(message.text || '').trim().slice(0, 500);
      if (!text) return;
      room.clients.forEach(client => send(client, { type: 'chat-message', from: socket.clientId, name: socket.displayName, text, timestamp: Date.now() }));
      sendDiscordWebhook(WEBHOOK_CHAT_MESSAGE, '💬 Mensagem no chat', 0xf1c40f, [
        { name: '🏷️ Sala', value: `\`${socket.roomId}\``, inline: true },
        { name: '👤 Usuário', value: socket.displayName, inline: true },
        { name: '📝 Mensagem', value: text }
      ]);
      return;
    }
    if (message.type === 'kick') {
      if (!socket.isOwner) return;
      const target = [...room.clients].find(client => client.clientId === message.targetId);
      if (!target || target === socket) return;
      send(target, { type: 'kicked', by: socket.clientId, name: socket.displayName });
      sendDiscordWebhook(WEBHOOK_KICKED, '🚫 Usuário expulso', 0xe74c3c, [
        { name: '🏷️ Sala', value: `\`${socket.roomId}\``, inline: true },
        { name: '👮 Expulso por', value: socket.displayName, inline: true },
        { name: '👤 Expulso', value: target.displayName, inline: true }
      ]);
      target.close();
      return;
    }
    if (message.to) { const target = [...room.clients].find(client => client.clientId === message.to); if (target) send(target, { ...message, from: socket.clientId }); }
    else room.clients.forEach(client => { if (client !== socket) send(client, { ...message, from: socket.clientId }); });
    if (message.type === 'sharing-started' || message.type === 'stop-sharing') broadcastRoster(room);
  });
  socket.on('close', () => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId); if (!room) return;
    room.clients.delete(socket);
    if (room.ownerId === socket.clientId) { const nextOwner = room.clients.values().next().value; if (nextOwner) { room.ownerId = nextOwner.clientId; nextOwner.isOwner = true; } }
    room.clients.forEach(client => send(client, { type: 'user-left', id: socket.clientId, members: roster(room) }));
    if (room.clients.size) broadcastRoster(room); else rooms.delete(socket.roomId);
    sendDiscordWebhook(WEBHOOK_USER_LEFT, '👋 Usuário saiu da sala', 0x95a5a6, [
      { name: '🏷️ Sala', value: `\`${socket.roomId}\``, inline: true },
      { name: '👤 Usuário', value: socket.displayName, inline: true }
    ]);
  });
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`America running at http://localhost:${port}`));