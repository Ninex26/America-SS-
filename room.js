const params = new URLSearchParams(location.search);
const roomId = (params.get('room') || '').toUpperCase();
const namedEntry = params.get('named') === '1';
const roomPattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const nicknameKey = 'ssred-nickname';
const $ = selector => document.querySelector(selector);
const logoUrl = 'https://cdn.discordapp.com/attachments/1534787259558006816/1539476577493061713/image-removebg-preview_4.png?ex=6a8674ca&is=6a85234a&hm=cb086ed167e08139d49e393a114b2b7d75746e3a0bd6f93332288ecfde1d0b8e&';
document.title = 'America | Sala';
document.querySelectorAll('.brand strong').forEach(element => { element.textContent = 'America'; });
document.querySelectorAll('.brand').forEach(element => element.setAttribute('aria-label', 'America início'));
document.querySelectorAll('.logo-mark img').forEach(element => { element.src = logoUrl; element.alt = 'Logo America'; });
const state = { socket: null, clientId: null, peers: new Map(), stream: null, streamSources: new Map(), streamNames: new Map(), mutedStreams: new Set() };
function initials(value) { return value.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'; }
function toast(text) { const element = document.createElement('div'); element.className = 'toast'; element.textContent = text; $('#toast-region').append(element); setTimeout(() => element.remove(), 2800); }
function escapeHtml(value) { return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function send(message) { if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify(message)); }
function setConnectionState(label, connected) { const element = $('#connection-state'); element.innerHTML = `<i></i> ${label}`; element.classList.toggle('connecting', !connected); }
function updateMembers(members) { const transmitting = members.filter(member => member.sharing); const connected = members.filter(member => !member.sharing); $('#user-count').textContent = members.length; $('#member-count').textContent = members.length; const renderMember = member => `<div class="member ${member.sharing ? 'is-sharing' : ''}"><div class="avatar member-avatar">${initials(member.name)}</div><div class="member-info"><strong>${escapeHtml(member.name)} ${member.owner ? '<span class="owner-crown" title="Dono da sala" aria-label="Dono da sala"><svg viewBox="0 0 24 24"><path d="m3 7 4 4 5-7 5 7 4-4-2 12H5L3 7Z"/><path d="M5 19h14"/></svg></span>' : ''} ${member.id === state.clientId ? '<span class="you-badge">VOCÊ</span>' : ''}</strong><small>${member.sharing ? 'Compartilhando tela' : member.id === state.clientId ? 'Você' : 'Conectado'}</small></div><i class="member-status"></i></div>`; $('#members').innerHTML = `<section class="member-group transmitting-group"><div class="members-title">TRANSMITINDO — <span>${transmitting.length}</span></div>${transmitting.map(renderMember).join('') || '<p class="members-empty">Ninguém transmitindo</p>'}</section><section class="member-group connected-group"><div class="members-title">NA SALA — <span>${connected.length}</span></div>${connected.map(renderMember).join('')}</section>`; }
function getSwitcher() { let element = $('#stream-switcher'); if (!element) { const dock = document.createElement('div'); dock.id = 'stream-dock'; dock.className = 'stream-dock'; const toggle = document.createElement('button'); toggle.id = 'stream-dock-toggle'; toggle.className = 'stream-dock-toggle'; toggle.type = 'button'; toggle.title = 'Ocultar telas'; toggle.setAttribute('aria-label', 'Ocultar telas'); toggle.setAttribute('aria-expanded', 'true'); toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>'; toggle.onclick = () => { const collapsed = dock.classList.toggle('collapsed'); toggle.setAttribute('aria-expanded', String(!collapsed)); toggle.title = collapsed ? 'Mostrar telas' : 'Ocultar telas'; toggle.setAttribute('aria-label', toggle.title); }; element = document.createElement('div'); element.id = 'stream-switcher'; element.className = 'stream-switcher'; dock.append(toggle, element); $('.video-stage').append(dock); } return element; }
function updateAudioButtons() { getSwitcher().querySelectorAll('.stream-audio-toggle').forEach(button => { const muted = state.mutedStreams.has(button.dataset.source); button.classList.toggle('muted', muted); button.title = muted ? 'Ativar som' : 'Silenciar som'; button.setAttribute('aria-label', button.title); button.innerHTML = muted ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M9 9v6l4 2V7M17 9.5a5 5 0 0 1 0 5"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h4l5 4V6l-5 4H5ZM18 9a5 5 0 0 1 0 6"/></svg>'; }); }
function toggleStreamAudio(sourceId, event) { event.stopPropagation(); if (state.mutedStreams.has(sourceId)) state.mutedStreams.delete(sourceId); else state.mutedStreams.add(sourceId); if ($('#remote-video')?.srcObject === state.streamSources.get(sourceId)?.stream) $('#remote-video').muted = state.mutedStreams.has(sourceId); updateAudioButtons(); }
function selectStream(sourceId) { const source = state.streamSources.get(sourceId); const video = $('#remote-video'); if (!source || !video) return; video.srcObject = source.stream; video.muted = state.mutedStreams.has(sourceId); video.play().catch(() => {}); const label = $('#video-label'); if (label) label.textContent = `Tela de ${source.name}`; $('#video-stage').classList.add('active'); $('#empty-state').style.display = 'none'; getSwitcher().querySelectorAll('.stream-preview').forEach(button => button.classList.toggle('active', button.dataset.source === sourceId)); updateAudioButtons(); }
function renderStreams() { const switcher = getSwitcher(); switcher.innerHTML = ''; state.streamSources.forEach((source, id) => { const card = document.createElement('div'); card.className = 'stream-card'; const previewButton = document.createElement('button'); previewButton.className = 'stream-preview'; previewButton.dataset.source = id; previewButton.type = 'button'; previewButton.title = `Ver a tela de ${source.name}`; previewButton.setAttribute('aria-label', `Selecionar tela de ${source.name}`); const preview = document.createElement('video'); preview.autoplay = true; preview.muted = true; preview.playsInline = true; preview.srcObject = source.stream; const caption = document.createElement('span'); caption.textContent = source.name; previewButton.append(preview, caption); previewButton.onclick = () => selectStream(id); const audioButton = document.createElement('button'); audioButton.className = 'stream-audio-toggle'; audioButton.dataset.source = id; audioButton.type = 'button'; audioButton.disabled = !source.stream.getAudioTracks().length; audioButton.onclick = event => toggleStreamAudio(id, event); card.append(previewButton, audioButton); switcher.append(card); }); if (state.streamSources.size) { const current = [...state.streamSources.keys()].find(id => $('#remote-video')?.srcObject === state.streamSources.get(id).stream); selectStream(current || state.streamSources.keys().next().value); } else { const video = $('#remote-video'); if (video) video.srcObject = null; $('#video-stage').classList.remove('active'); $('#empty-state').style.display = ''; } }
function addSource(id, stream, name) { if (!stream) return; state.streamSources.set(id, { stream, name: name || state.streamNames.get(id) || state.streamSources.get(id)?.name || `Participante ${id.slice(0, 4)}` }); renderStreams(); }
function configureScreenSender(sender) { const parameters = sender.getParameters(); if (!parameters.encodings?.length) return; parameters.encodings[0].maxBitrate = 8000000; parameters.encodings[0].maxFramerate = 30; parameters.degradationPreference = 'maintain-resolution'; sender.setParameters(parameters).catch(() => {}); }
function addScreenToPeer(peer, stream) { stream.getTracks().forEach(track => { if (track.kind === 'video') track.contentHint = 'detail'; const sender = peer.pc.addTrack(track, stream); if (track.kind === 'video') configureScreenSender(sender); }); }
function createPeer(id) {
  if (state.peers.has(id)) return state.peers.get(id);
  const peer = { pc: new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] }), polite: String(state.clientId) > String(id), makingOffer: false, ignoreOffer: false, remoteDescriptionSet: false, pendingCandidates: [], remoteStream: new MediaStream() };
  state.peers.set(id, peer);
  peer.pc.onicecandidate = event => { if (event.candidate) send({ type: 'candidate', to: id, candidate: event.candidate }); };
  peer.pc.onnegotiationneeded = async () => { try { peer.makingOffer = true; await peer.pc.setLocalDescription(); send({ type: 'description', to: id, description: peer.pc.localDescription }); } catch (error) { console.error('WebRTC negotiation failed', error); } finally { peer.makingOffer = false; } };
  peer.pc.ontrack = event => {
    const stream = event.streams[0] || peer.remoteStream;
    if (!event.streams[0] && !stream.getTracks().includes(event.track)) stream.addTrack(event.track);
    stream.onaddtrack = () => addSource(id, stream, state.streamSources.get(id)?.name);
    addSource(id, stream, state.streamSources.get(id)?.name);
    const video = $('#remote-video');
    if (video.srcObject === stream) video.play().catch(() => {});
  };
  peer.pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(peer.pc.connectionState)) removePeer(id); };
  if (state.stream) addScreenToPeer(peer, state.stream);
  return peer;
}
function removePeer(id) { state.peers.get(id)?.pc.close(); state.peers.delete(id); state.streamSources.delete(id); renderStreams(); }
async function handleDescription(message) { const peer = createPeer(message.from); const description = message.description; const offerCollision = description.type === 'offer' && (peer.makingOffer || peer.pc.signalingState !== 'stable'); peer.ignoreOffer = !peer.polite && offerCollision; if (peer.ignoreOffer) return; try { await peer.pc.setRemoteDescription(description); peer.remoteDescriptionSet = true; for (const candidate of peer.pendingCandidates.splice(0)) await peer.pc.addIceCandidate(candidate); if (description.type === 'offer') { await peer.pc.setLocalDescription(); send({ type: 'description', to: message.from, description: peer.pc.localDescription }); } } catch (error) { console.error('WebRTC description failed', error); } }
async function handleMessage(message) {
  if (message.type === 'welcome') { state.clientId = message.id; updateMembers(message.members); setConnectionState('Conectado', true); $('#loading-state').style.display = 'none'; toast('Conectado à sala.'); message.members.filter(member => member.id !== state.clientId).forEach(member => createPeer(member.id)); }
  else if (message.type === 'user-joined') { updateMembers(message.members); createPeer(message.id); }
  else if (message.type === 'user-left') { removePeer(message.id); updateMembers(message.members); }
  else if (message.type === 'roster') updateMembers(message.members);
  else if (message.type === 'description') await handleDescription(message);
  else if (message.type === 'candidate') { const peer = createPeer(message.from); if (peer.remoteDescriptionSet) await peer.pc.addIceCandidate(message.candidate); else peer.pendingCandidates.push(message.candidate); }
  else if (message.type === 'sharing-started') { state.streamNames.set(message.from, message.name); const source = state.streamSources.get(message.from); if (source) source.name = message.name; renderStreams(); }
  else if (message.type === 'stop-sharing') { state.streamNames.delete(message.from); state.streamSources.delete(message.from); renderStreams(); }
}
function startSharing() { return navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always', frameRate: { ideal: 30, max: 30 }, width: { ideal: 2560, max: 3840 }, height: { ideal: 1440, max: 2160 } }, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(stream => { state.stream = stream; const track = stream.getVideoTracks()[0]; track.contentHint = 'detail'; track.onended = stopSharing; addSource(state.clientId, stream, nickname); $('#control-stop').disabled = false; send({ type: 'sharing-started', name: nickname }); toast('Compartilhamento iniciado em alta qualidade.'); state.peers.forEach(peer => addScreenToPeer(peer, stream)); }).catch(error => { if (error.name !== 'NotAllowedError') toast('Não foi possível iniciar o compartilhamento.'); }); }
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
  input.value = localStorage.getItem(nicknameKey)?.trim().slice(0, 24) || '';
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
if (namedEntry && savedNickname) { nickname = savedNickname.slice(0, 24); initializeRoom(); } else requestNickname();
