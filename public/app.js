const socket = io();

const lobbyForm = document.getElementById('lobbyForm');
const lobbyPanel = document.getElementById('lobbyPanel');
const appShell = document.querySelector('.app-shell');
const userNameInput = document.getElementById('userName');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinRoomField = document.getElementById('joinRoomField');
const roomState = document.getElementById('roomState');
const roomCodeLabel = document.getElementById('roomCodeLabel');
const userStatus = document.getElementById('userStatus');
const roomTitle = document.getElementById('roomTitle');
const shareScreenBtn = document.getElementById('shareScreenBtn');
const stopShareBtn = document.getElementById('stopShareBtn');
const fullScreenBtn = document.getElementById('fullScreenBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const leaveRoomBtnSecondary = document.getElementById('leaveRoomBtnSecondary');
const screenPlaceholder = document.getElementById('screenPlaceholder');
const screenMessage = document.getElementById('screenMessage');
const screenVideo = document.getElementById('screenVideo');
const onlineUsersPanel = document.getElementById('onlineUsersPanel');
const onlineUsersList = document.getElementById('onlineUsersList');
const onlineUsersCount = document.getElementById('onlineUsersCount');
const themeSettingsBtn = document.getElementById('themeSettingsBtn');
const themeMenu = document.getElementById('themeMenu');
const themeOptions = document.querySelectorAll('.theme-option');
const roleButtons = document.querySelectorAll('.role-btn');

const appState = {
  roomCode: '',
  role: 'host',
  userName: '',
  stream: null,
  myPeerConnections: {},
  remoteVideoPeers: {},
  hostId: null,
  hostLive: false
};

function setTheme(themeName) {
  document.body.dataset.theme = themeName;
  themeOptions.forEach((option) => {
    option.classList.toggle('active', option.dataset.theme === themeName);
  });
}

function setMode(nextMode) {
  appState.role = nextMode;
  roleButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.role === nextMode);
  });
  joinRoomField.classList.toggle('hidden', nextMode !== 'viewer');
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function renderUsers(members) {
  if (!members || !members.length) {
    onlineUsersCount.textContent = '0';
    onlineUsersList.innerHTML = '';
    return;
  }

  onlineUsersCount.textContent = String(members.length);
  onlineUsersList.innerHTML = members.map((member) => {
    const initials = member.name
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    return `
      <li class="online-item">
        <div class="user-meta">
          <span class="avatar">${initials || 'U'}</span>
          <span class="user-name">${member.name}</span>
        </div>
        <span class="user-role ${member.role}">${member.role === 'host' ? 'Host' : 'Viewer'}</span>
      </li>
    `;
  }).join('');
}

function updateTransmissionControls() {
  const isHost = appState.role === 'host';
  const isLive = Boolean(appState.stream);

  shareScreenBtn.classList.toggle('hidden', !isHost);
  stopShareBtn.classList.toggle('hidden', !isHost || !isLive);
  fullScreenBtn.classList.toggle('hidden', isHost || !isLive);
}

function activateRoom(mode, roomCode) {
  appState.role = mode;
  appState.roomCode = roomCode;
  appState.userName = userNameInput.value.trim() || 'Visitante';

  appShell.classList.add('room-active');
  lobbyPanel.classList.add('hidden');
  roomState.classList.remove('hidden');
  onlineUsersPanel.classList.remove('hidden');

  roomCodeLabel.textContent = roomCode;
  userStatus.textContent = mode === 'host' ? 'Host' : 'Cliente';
  roomTitle.textContent = mode === 'host' ? `Sala de ${appState.userName}` : `Acompanhando ${roomCode}`;

  screenPlaceholder.classList.remove('hidden');
  screenMessage.textContent = mode === 'host'
    ? 'Aguardando compartilhamento da tela...'
    : 'A sala está pronta para receber a transmissão.';

  screenVideo.style.display = 'none';
  screenVideo.srcObject = null;
  updateTransmissionControls();
}

function resetRoom() {
  if (appState.roomCode) {
    socket.emit('leave-room', { roomCode: appState.roomCode });
  }

  if (appState.stream) {
    appState.stream.getTracks().forEach((track) => track.stop());
    appState.stream = null;
  }

  Object.values(appState.myPeerConnections).forEach((pc) => pc.close());
  appState.myPeerConnections = {};
  appState.remoteVideoPeers = {};

  appState.roomCode = '';
  appState.hostId = null;
  appState.hostLive = false;

  appShell.classList.remove('room-active');
  lobbyPanel.classList.remove('hidden');
  roomState.classList.add('hidden');
  onlineUsersPanel.classList.add('hidden');
  screenVideo.style.display = 'none';
  screenVideo.srcObject = null;
  screenPlaceholder.classList.remove('hidden');
  screenMessage.textContent = 'Aguardando compartilhamento da tela...';
  updateTransmissionControls();
}

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  appState.myPeerConnections[peerId] = pc;

  if (appState.stream) {
    appState.stream.getTracks().forEach((track) => pc.addTrack(track, appState.stream));
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        roomCode: appState.roomCode,
        receiverId: peerId,
        candidate: event.candidate
      });
    }
  };

  pc.onnegotiationneeded = async () => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', {
        roomCode: appState.roomCode,
        offer,
        receiverId: peerId
      });
    } catch (error) {
      console.error('Erro no offer:', error);
    }
  };

  return pc;
}

async function startScreenShare() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true
    });

    appState.stream = stream;
    screenVideo.srcObject = stream;
    screenVideo.style.display = 'block';
    screenPlaceholder.classList.add('hidden');

    socket.emit('host-screen-state', {
      roomCode: appState.roomCode,
      isLive: true
    });

    appState.hostLive = true;
    updateTransmissionControls();

    if (appState.role === 'host') {
      const currentMembers = socket.data?.members || [];
      currentMembers
        .filter((member) => member.role === 'viewer')
        .forEach((member) => {
          if (!appState.myPeerConnections[member.id]) {
            createPeerConnection(member.id);
          }
        });
    }

    stream.getVideoTracks()[0].addEventListener('ended', () => {
      stopShare();
    });
  } catch (error) {
    console.error('Erro ao compartilhar tela:', error);
    screenMessage.textContent = 'Permita o acesso à sua tela para continuar.';
  }
}

function stopShare() {
  if (!appState.stream) return;

  appState.stream.getTracks().forEach((track) => track.stop());
  appState.stream = null;
  screenVideo.srcObject = null;
  screenVideo.style.display = 'none';
  screenPlaceholder.classList.remove('hidden');
  screenMessage.textContent = 'Transmissão interrompida.';

  socket.emit('host-screen-state', {
    roomCode: appState.roomCode,
    isLive: false
  });

  appState.hostLive = false;
  updateTransmissionControls();
}

function toggleFullScreenVideo() {
  if (!screenVideo.srcObject) return;

  if (!document.fullscreenElement) {
    screenVideo.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

socket.on('room-state', ({ roomCode, members, hostName }) => {
  if (roomCode !== appState.roomCode) return;

  renderUsers(members);

  if (appState.role === 'host') {
    const viewers = members.filter((member) => member.role === 'viewer' && member.id !== socket.id);
    viewers.forEach((viewer) => {
      if (!appState.myPeerConnections[viewer.id]) {
        createPeerConnection(viewer.id);
      }
    });
  }
});

socket.on('room-joined', ({ roomCode, role, members, hostId }) => {
  appState.roomCode = roomCode;
  appState.role = role;
  appState.hostId = hostId || null;
  activateRoom(role, roomCode);
  renderUsers(members);
  updateTransmissionControls();
});

socket.on('room-error', ({ message }) => {
  alert(message);
});

socket.on('room-closed', () => {
  alert('A sala foi encerrada pelo host.');
  resetRoom();
});

socket.on('offer', async ({ offer, senderId }) => {
  if (appState.role !== 'viewer') return;

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  appState.remoteVideoPeers[senderId] = pc;

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        roomCode: appState.roomCode,
        receiverId: senderId,
        candidate: event.candidate
      });
    }
  };

  pc.ontrack = (event) => {
    const stream = event.streams[0];
    if (stream) {
      screenVideo.srcObject = stream;
      screenVideo.style.display = 'block';
      screenPlaceholder.classList.add('hidden');
      screenMessage.textContent = 'Assistindo em tempo real.';
    }
  };

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit('answer', {
    roomCode: appState.roomCode,
    answer,
    receiverId: senderId
  });
});

socket.on('answer', async ({ answer, senderId }) => {
  if (appState.role !== 'host') return;
  const pc = appState.myPeerConnections[senderId];
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('ice-candidate', async ({ candidate, senderId }) => {
  const pc = appState.role === 'host'
    ? appState.myPeerConnections[senderId]
    : appState.remoteVideoPeers[senderId];

  if (!pc || !candidate) return;
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.error('Erro ao adicionar ICE candidate:', error);
  }
});

socket.on('host-screen-state', ({ isLive }) => {
  if (!isLive) {
    screenVideo.style.display = 'none';
    screenPlaceholder.classList.remove('hidden');
    screenMessage.textContent = 'A sala está pronta para receber a transmissão.';
    return;
  }

  screenPlaceholder.classList.add('hidden');
  screenMessage.textContent = 'Assistindo em tempo real.';
});

lobbyForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const userName = userNameInput.value.trim();
  if (!userName) {
    userNameInput.focus();
    return;
  }

  const roomCode = appState.role === 'host'
    ? generateRoomCode()
    : roomCodeInput.value.trim().toUpperCase();

  if (appState.role === 'viewer' && !roomCode) {
    roomCodeInput.focus();
    roomCodeInput.placeholder = 'Informe o código da sala';
    return;
  }

  socket.emit('join-room', {
    roomCode,
    userName,
    role: appState.role
  });
});

roleButtons.forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.role));
});

shareScreenBtn.addEventListener('click', startScreenShare);
stopShareBtn.addEventListener('click', stopShare);
fullScreenBtn.addEventListener('click', toggleFullScreenVideo);
leaveRoomBtn.addEventListener('click', resetRoom);
leaveRoomBtnSecondary.addEventListener('click', resetRoom);

themeSettingsBtn.addEventListener('click', () => {
  themeMenu.classList.toggle('hidden');
});

themeOptions.forEach((option) => {
  option.addEventListener('click', () => {
    setTheme(option.dataset.theme);
    themeMenu.classList.add('hidden');
  });
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && screenVideo && screenVideo.classList) {
    screenVideo.classList.remove('fullscreen-video');
  }
});

setTheme('dark');
setMode('host');
updateTransmissionControls();
