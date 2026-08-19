const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocket, WebSocketServer } = require('ws');

const root = __dirname;
const rooms = new Map();
const sessions = new Map();
const oauthStates = new Map();
const port = Number(process.env.PORT) || 3000;
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `localhost:${port}`}`);
  const requested = decodeURIComponent(requestUrl.pathname);
  if (requested === '/auth/discord') {
    if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) { response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); return response.end('Discord OAuth is not configured'); }
    const state = crypto.randomBytes(24).toString('hex');
    oauthStates.set(state, Date.now() + 10 * 60 * 1000);
    const redirectUri = process.env.DISCORD_REDIRECT_URI || 'https://americass.up.railway.app/auth/discord/callback';
    const authorizeUrl = new URL('https://discord.com/oauth2/authorize');
    authorizeUrl.search = new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, response_type: 'code', redirect_uri: redirectUri, scope: 'identify guilds connections', state }).toString();
    response.writeHead(302, { Location: authorizeUrl.toString() });
    return response.end();
  }
  if (requested === '/auth/discord/callback') {
    const stateExpiry = oauthStates.get(requestUrl.searchParams.get('state'));
    oauthStates.delete(requestUrl.searchParams.get('state'));
    if (!stateExpiry || stateExpiry < Date.now() || requestUrl.searchParams.has('error')) { response.writeHead(302, { Location: '/?discord=cancelled' }); return response.end(); }
    try {
      const redirectUri = process.env.DISCORD_REDIRECT_URI || 'https://americass.up.railway.app/auth/discord/callback';
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code: requestUrl.searchParams.get('code'), redirect_uri: redirectUri }) });
      if (!tokenResponse.ok) throw new Error('Discord token exchange failed');
      const token = await tokenResponse.json();
      const userResponse = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `${token.token_type} ${token.access_token}` } });
      if (!userResponse.ok) throw new Error('Discord profile request failed');
      const user = await userResponse.json();
      const sessionId = crypto.randomBytes(32).toString('hex');
      sessions.set(sessionId, { user, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
      const secureCookie = redirectUri.startsWith('https:') ? '; Secure' : '';
      response.writeHead(302, { Location: '/?discord=connected', 'Set-Cookie': `discord_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secureCookie}` });
      return response.end();
    } catch (error) { console.error(error); response.writeHead(302, { Location: '/?discord=error' }); return response.end(); }
  }
  if (requested === '/api/discord/me') {
    const sessionId = request.headers.cookie?.match(/(?:^|;\s*)discord_session=([^;]+)/)?.[1];
    const session = sessionId ? sessions.get(sessionId) : null;
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return response.end(JSON.stringify({ user: session && session.expiresAt > Date.now() ? session.user : null }));
  }
  if (requested === '/auth/discord/logout') {
    const sessionId = request.headers.cookie?.match(/(?:^|;\s*)discord_session=([^;]+)/)?.[1];
    if (sessionId) sessions.delete(sessionId);
    response.writeHead(302, { Location: '/', 'Set-Cookie': 'discord_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    return response.end();
  }
  const filePath = path.normalize(path.join(root, requested === '/' ? 'index.html' : requested));
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404);
    return response.end('Not found');
  }
  response.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
});

const wss = new WebSocketServer({ server });
const send = (client, message) => client.readyState === WebSocket.OPEN && client.send(JSON.stringify(message));
const roster = room => [...room.clients].map(client => ({ id: client.clientId, name: client.displayName, owner: client.isOwner, sharing: client.isSharing }));
const broadcastRoster = room => room.clients.forEach(client => send(client, { type: 'roster', members: roster(room) }));

wss.on('connection', socket => {
  socket.on('message', raw => {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (message.type === 'join') {
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(message.room)) return socket.close();
      let room = rooms.get(message.room);
      if (!room) { room = { clients: new Set(), ownerId: null }; rooms.set(message.room, room); }
      socket.clientId = Math.random().toString(36).slice(2, 10);
      socket.roomId = message.room;
      socket.displayName = String(message.name || 'Visitante').slice(0, 24);
      socket.isOwner = room.ownerId === null;
      socket.isSharing = false;
      if (socket.isOwner) room.ownerId = socket.clientId;
      room.clients.add(socket);
      send(socket, { type: 'welcome', id: socket.clientId, members: roster(room) });
      room.clients.forEach(client => { if (client !== socket) send(client, { type: 'user-joined', id: socket.clientId, name: socket.displayName, members: roster(room) }); });
      return;
    }
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    if (message.type === 'sharing-started') socket.isSharing = true;
    if (message.type === 'stop-sharing') socket.isSharing = false;
    if (message.to) {
      const target = [...room.clients].find(client => client.clientId === message.to);
      if (target) send(target, { ...message, from: socket.clientId });
    } else {
      room.clients.forEach(client => { if (client !== socket) send(client, { ...message, from: socket.clientId }); });
    }
    if (message.type === 'sharing-started' || message.type === 'stop-sharing') broadcastRoster(room);
  });
  socket.on('close', () => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    room.clients.delete(socket);
    if (room.ownerId === socket.clientId) {
      const nextOwner = room.clients.values().next().value;
      if (nextOwner) { room.ownerId = nextOwner.clientId; nextOwner.isOwner = true; }
    }
    room.clients.forEach(client => send(client, { type: 'user-left', id: socket.clientId, members: roster(room) }));
    if (room.clients.size) broadcastRoster(room);
    else rooms.delete(socket.roomId);
  });
});

server.listen(port, () => console.log(`America running at http://localhost:${port}`));
