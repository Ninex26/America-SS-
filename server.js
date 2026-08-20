const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocket, WebSocketServer } = require('ws');

const root = __dirname;
const rooms = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

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
      if (!room) { room = { clients: new Set(), ownerId: null }; rooms.set(message.room, room); }
      socket.clientId = Math.random().toString(36).slice(2, 10); socket.roomId = message.room; socket.displayName = String(message.name || 'Visitante').slice(0, 24); socket.isOwner = room.ownerId === null; socket.isSharing = false;
      if (socket.isOwner) room.ownerId = socket.clientId;
      room.clients.add(socket);
      send(socket, { type: 'welcome', id: socket.clientId, members: roster(room) });
      room.clients.forEach(client => { if (client !== socket) send(client, { type: 'user-joined', id: socket.clientId, name: socket.displayName, members: roster(room) }); });
      return;
    }
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId); if (!room) return;
    if (message.type === 'sharing-started') socket.isSharing = true;
    if (message.type === 'stop-sharing') socket.isSharing = false;
    if (message.type === 'chat-message') {
      const text = String(message.text || '').trim().slice(0, 500);
      if (!text) return;
      room.clients.forEach(client => send(client, { type: 'chat-message', from: socket.clientId, name: socket.displayName, text, timestamp: Date.now() }));
      return;
    }
    if (message.type === 'kick') {
      if (!socket.isOwner) return;
      const target = [...room.clients].find(client => client.clientId === message.targetId);
      if (!target || target === socket) return;
      send(target, { type: 'kicked', by: socket.clientId, name: socket.displayName });
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
  });
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`America running at http://localhost:${port}`));
