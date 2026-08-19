const params = new URLSearchParams(location.search);
const roomId = (params.get('room') || '').toUpperCase();
const roomPattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const nicknameKey = 'ssred-nickname';
const $ = selector => document.querySelector(selector);
const state = { socket: null, clientId: null, peers: new Map(), stream: null, streamSources: new Map(), streamNames: new Map() };
function initials(value) { return value.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'; }
function toast(text) { const element = document.createElement('div'); element.className = 'toast'; element.textContent = text; $('#toast-region').append(element); setTimeout(() => element.remove(), 2800); }
function escapeHtml(value) { return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function send(message) { if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify(message)); }
function setConnectionState(label, connected) { const element = $('#connection-state'); element.innerHTML = `<i></i> ${label}`; element.classList.toggle('connecting', !connected); }
function updateMembers(members) { $('#user-count').textContent = members.length; $('#member-count').textContent = members.length; $('#members').innerHTML = members.map(member => `<div class="member"><div class="avatar member-avatar">${initials(member.name)}</div><div class="member-info"><strong>${escapeHtml(member.name)} ${member.id === state.clientId ? '<span class="you-badge">VOCÊ</span>' : ''}</strong>${member.id === state.clientId ? '<small>Você</small>' : ''}</div><i class="member-status"></i></div>`).join(''); }
function getSwitcher() { let element = $('#stream-switcher'); if (!element) { element = document.createElement('div'); element.id = 'stream-switcher'; element.className = 'stream-switcher'; $('.video-stage').append(element); } return element; }
function selectStream(sourceId) { const source = state.streamSources.get(sourceId); if (!source) return; $('#remote-video').srcObject = source.stream; $('#video-label').textContent = `Tela de ${source.name}`; $('#video-stage').classList.add('active'); $('#empty-state').style.display = 'none'; getSwitcher().querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.source === sourceId)); }
function renderStreams() { const switcher = getSwitcher(); switcher.innerHTML = ''; state.streamSources.forEach((source, id) => { const button = document.createElement('button'); button.dataset.source = id; button.textContent = source.name; button.onclick = () => selectStream(id); switcher.append(button); }); if (state.streamSources.size) { const current = [...state.streamSources.keys()].find(id => $('#remote-video').srcObject === state.streamSources.get(id).stream); selectStream(current || state.streamSources.keys().next().value); } }
function addSource(id, stream, name) { if (!stream) return; state.streamSources.set(id, { stream, name: name || state.streamNames.get(id) || state.streamSources.get(id)?.name || `Participante ${id.slice(0, 4)}` }); renderStreams(); }
function createPeer(id) {
  if (state.peers.has(id)) return state.peers.get(id);
  const peer = { pc: new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }), polite: String(state.clientId) > String(id), makingOffer: false, ignoreOffer: false, remoteDescriptionSet: false, pendingCandidates: [] };
  state.peers.set(id, peer);
  peer.pc.onicecandidate = event => { if (event.candidate) send({ type: 'candidate', to: id, candidate: event.candidate }); };
  peer.pc.onnegotiationneeded = async () => { try { peer.makingOffer = true; await peer.pc.setLocalDescription(); send({ type: 'description', to: id, description: peer.pc.localDescription }); } catch (error) { console.error('WebRTC negotiation failed', error); } finally { peer.makingOffer = false; } };
  peer.pc.ontrack = event => addSource(id, event.streams[0], state.streamSources.get(id)?.name);
  peer.pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(peer.pc.connectionState)) removePeer(id); };
  if (state.stream) state.stream.getTracks().forEach(track => peer.pc.addTrack(track, state.stream));
  return peer;
}
function removePeer(id) { state.peers.get(id)?.pc.close(); state.peers.delete(id); state.streamSources.delete(id); renderStreams(); }
async function handleDescription(message) { const peer = createPeer(message.from); const description = message.description; const offerCollision = description.type === 'offer' && (peer.makingOffer || peer.pc.signalingState !== 'stable'); peer.ignoreOffer = !peer.polite && offerCollision; if (peer.ignoreOffer) return; try { await peer.pc.setRemoteDescription(description); peer.remoteDescriptionSet = true; for (const candidate of peer.pendingCandidates.splice(0)) await peer.pc.addIceCandidate(candidate); if (description.type === 'offer') { await peer.pc.setLocalDescription(); send({ type: 'description', to: message.from, description: peer.pc.localDescription }); } } catch (error) { console.error('WebRTC description failed', error); } }
async function handleMessage(message) {
  if (message.type === 'welcome') { state.clientId = message.id; updateMembers(message.members); setConnectionState('Conectado', true); $('#loading-state').style.display = 'none'; toast('Conectado à sala.'); message.members.filter(member => member.id !== state.clientId).forEach(member => createPeer(member.id)); }
  else if (message.type === 'user-joined') { updateMembers(message.members); createPeer(message.id); }
  else if (message.type === 'user-left') { removePeer(message.id); updateMembers(message.members); }
  else if (message.type === 'description') await handleDescription(message);
  else if (message.type === 'candidate') { const peer = createPeer(message.from); if (peer.remoteDescriptionSet) await peer.pc.addIceCandidate(message.candidate); else peer.pendingCandidates.push(message.candidate); }
  else if (message.type === 'sharing-started') { state.streamNames.set(message.from, message.name); const source = state.streamSources.get(message.from); if (source) source.name = message.name; renderStreams(); }
  else if (message.type === 'stop-sharing') { state.streamNames.delete(message.from); state.streamSources.delete(message.from); renderStreams(); }
}
function startSharing() { return navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }).then(stream => { state.stream = stream; stream.getVideoTracks()[0].onended = stopSharing; addSource(state.clientId, stream, nickname); $('#control-stop').disabled = false; send({ type: 'sharing-started', name: nickname }); toast('Compartilhamento iniciado.'); state.peers.forEach(peer => stream.getTracks().forEach(track => peer.pc.addTrack(track, stream))); }).catch(error => { if (error.name !== 'NotAllowedError') toast('Não foi possível iniciar o compartilhamento.'); }); }
function stopSharing() { if (!state.stream) return; state.stream.getTracks().forEach(track => track.stop()); state.stream = null; state.streamSources.delete(state.clientId); renderStreams(); $('#control-stop').disabled = true; send({ type: 'stop-sharing' }); }
function copy(value, message) { navigator.clipboard?.writeText(value).then(() => toast(message)).catch(() => toast('Não foi possível copiar.')); }
let nickname = '';
function requestNickname() {
  const gate = document.createElement('div');
  gate.className = 'nickname-gate';
  gate.innerHTML = '<form class="nickname-card"><span class="card-kicker">ENTRAR NA SALA</span><h1>Como devemos chamar você?</h1><p>Escolha um nome para aparecer na lista de participantes.</p><label for="room-nickname">NICKNAME</label><input id="room-nickname" maxlength="24" autocomplete="nickname" placeholder="Seu nickname" required><p class="field-error" id="room-nickname-error"></p><button class="primary-button" type="submit">Entrar na sala <span>→</span></button></form>';
  document.body.append(gate);
  const form = gate.querySelector('form');
  const input = gate.querySelector('#room-nickname');
  input.focus();
  form.addEventListener('submit', event => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) { gate.querySelector('#room-nickname-error').textContent = 'Digite um nome para continuar.'; return; }
    nickname = value.slice(0, 24);
    localStorage.setItem(nicknameKey, nickname);
    gate.remove();
    initializeRoom();
  });
}
function initializeRoom() {
$('#room-code-label').textContent = roomId; $('#sidebar-code').textContent = roomId; $('#footer-name').textContent = nickname; $('#members').innerHTML = `<div class="member"><div class="avatar member-avatar">${initials(nickname)}</div><div class="member-info"><strong>${escapeHtml(nickname)} <span class="you-badge">VOCÊ</span></strong><small>Você</small></div><i class="member-status"></i></div>`;
if (!roomPattern.test(roomId)) { $('#loading-state').style.display = 'none'; $('#empty-state').style.display = 'none'; $('#not-found').hidden = false; } else { const protocol = location.protocol === 'https:' ? 'wss' : 'ws'; state.socket = new WebSocket(`${protocol}://${location.host}`); state.socket.onopen = () => send({ type: 'join', room: roomId, name: nickname }); state.socket.onmessage = event => handleMessage(JSON.parse(event.data)); state.socket.onclose = () => setConnectionState('Reconectando...', false); }
$('#share-screen').onclick = startSharing; $('#control-share').onclick = startSharing; $('#control-stop').onclick = stopSharing; $('#copy-link').onclick = () => copy(location.href, 'Link copiado!'); $('#empty-copy-link').onclick = () => copy(location.href, 'Link copiado!'); $('#control-copy').onclick = () => copy(location.href, 'Link copiado!'); $('#copy-code').onclick = () => copy(roomId, 'Código copiado!'); $('#control-fullscreen').onclick = () => document.documentElement.requestFullscreen?.(); $('#control-leave').onclick = () => { state.socket?.close(); location.href = 'index.html'; }; $('#menu-toggle').onclick = () => $('#sidebar').classList.toggle('open'); document.addEventListener('keydown', event => { if (event.key === 'Escape') $('#sidebar').classList.remove('open'); });
}
const savedNickname = localStorage.getItem(nicknameKey)?.trim();
if (savedNickname) { nickname = savedNickname.slice(0, 24); initializeRoom(); } else requestNickname();
