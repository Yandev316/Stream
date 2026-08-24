const lobbyForm = document.getElementById("lobbyForm");
const lobbyPanel = document.getElementById("lobbyPanel");
const appShell = document.querySelector(".app-shell");
const userNameInput = document.getElementById("userName");
const roomCodeInput = document.getElementById("roomCodeInput");
const joinRoomField = document.getElementById("joinRoomField");
const roomState = document.getElementById("roomState");
const roomCodeLabel = document.getElementById("roomCodeLabel");
const userStatus = document.getElementById("userStatus");
const roomTitle = document.getElementById("roomTitle");
const shareScreenBtn = document.getElementById("shareScreenBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");
const screenPlaceholder = document.getElementById("screenPlaceholder");
const screenMessage = document.getElementById("screenMessage");
const screenVideo = document.getElementById("screenVideo");
const shareStage = document.querySelector(".share-stage");
const onlineUsersPanel = document.getElementById("onlineUsersPanel");
const onlineUsersList = document.getElementById("onlineUsersList");
const onlineUsersCount = document.getElementById("onlineUsersCount");
const stopShareBtn = document.getElementById("stopShareBtn");
const fullScreenBtn = document.getElementById("fullScreenBtn");
const miniFullScreenBtn = document.getElementById("miniFullScreenBtn");
const copyRoomCodeBtn = document.getElementById("copyRoomCodeBtn");
const themeSettingsBtn = document.getElementById("themeSettingsBtn");
const themeMenu = document.getElementById("themeMenu");
const themeOptions = document.querySelectorAll(".theme-option");
const roleButtons = document.querySelectorAll(".role-btn");
const toastContainer = document.getElementById("toastContainer");

const liveChannel = new BroadcastChannel("live-room-channel");
const ROOM_STORAGE_KEY = "live-room-members";
const appState = {
  mode: "host",
  roomCode: "",
  userName: "",
  stream: null,
  viewerWindow: null,
  sessionId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
};

function getRoomMembers(roomCode) {
  try {
    const data = JSON.parse(localStorage.getItem(ROOM_STORAGE_KEY) || "{}");
    if (!roomCode) {
      return [];
    }

    const members = Array.isArray(data[roomCode]) ? data[roomCode] : [];
    return members.filter((member) => member && member.name);
  } catch (error) {
    return [];
  }
}

function setRoomMembers(roomCode, members) {
  try {
    const data = JSON.parse(localStorage.getItem(ROOM_STORAGE_KEY) || "{}");
    data[roomCode] = members;
    localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Erro ao salvar participantes da sala:", error);
  }
}

function syncRoomMembers() {
  if (!appState.roomCode) {
    return;
  }

  const members = getRoomMembers(appState.roomCode);
  const currentMember = {
    id: appState.sessionId,
    name: appState.userName || "Visitante",
    role: appState.mode === "host" ? "host" : "viewer",
  };

  const wasAlreadyPresent = members.some((member) => member.id === appState.sessionId);
  const updatedMembers = members.filter((member) => member.id !== appState.sessionId);
  updatedMembers.push(currentMember);
  setRoomMembers(appState.roomCode, updatedMembers);

  if (!wasAlreadyPresent) {
    notifyPresenceChange(currentMember.name, "join");
    liveChannel.postMessage({
      type: "presence-update",
      roomCode: appState.roomCode,
      action: "join",
      userName: currentMember.name,
      sessionId: appState.sessionId,
    });
  }

  liveChannel.postMessage({
    type: "participants-update",
    roomCode: appState.roomCode,
    members: updatedMembers,
  });
  renderOnlineUsers();
}

function leaveRoomMembers() {
  if (!appState.roomCode) {
    return;
  }

  const members = getRoomMembers(appState.roomCode);
  const currentMember = members.find((member) => member.id === appState.sessionId) || {
    id: appState.sessionId,
    name: appState.userName || "Visitante",
    role: appState.mode === "host" ? "host" : "viewer",
  };

  const remainingMembers = members.filter((member) => member.id !== appState.sessionId);
  setRoomMembers(appState.roomCode, remainingMembers);

  notifyPresenceChange(currentMember.name, "leave");
  liveChannel.postMessage({
    type: "presence-update",
    roomCode: appState.roomCode,
    action: "leave",
    userName: currentMember.name,
    sessionId: appState.sessionId,
  });
  liveChannel.postMessage({
    type: "participants-update",
    roomCode: appState.roomCode,
    members: remainingMembers,
  });
}

function showToast(message, type = "info") {
  if (!toastContainer) {
    return;
  }

  const toast = document.createElement("div");
  const iconMap = {
    success: "✓",
    info: "i",
    warning: "−",
  };

  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${iconMap[type] || "i"}</div>
    <div class="toast-copy">
      <strong>${type === "success" ? "Entrada" : type === "warning" ? "Saída" : "Aviso"}</strong>
      <span>${message}</span>
    </div>
  `;

  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 220);
  }, 3200);
}

function notifyPresenceChange(userName, action) {
  const displayName = userName || "Usuário";
  const actionText = action === "join" ? "entrou na sala" : "saiu da sala";
  showToast(`${displayName} ${actionText}`, action === "join" ? "success" : "warning");
}

function renderOnlineUsers() {
  const roomMembers = appState.roomCode ? getRoomMembers(appState.roomCode) : [];

  if (!roomMembers.length) {
    const fallbackMember = {
      id: appState.sessionId,
      name: appState.userName || "Visitante",
      role: appState.mode === "host" ? "host" : "viewer",
    };
    onlineUsersCount.textContent = "1";
    onlineUsersList.innerHTML = `
      <li class="online-item">
        <div class="user-meta">
          <span class="avatar">${fallbackMember.name.charAt(0).toUpperCase()}</span>
          <span class="user-name">${fallbackMember.name}</span>
        </div>
        <span class="user-role ${fallbackMember.role}">${fallbackMember.role === "host" ? "Host" : "Viewer"}</span>
      </li>
    `;
    return;
  }

  onlineUsersCount.textContent = String(roomMembers.length);
  onlineUsersList.innerHTML = roomMembers
    .map((user, index) => {
      const initials = user.name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

      return `
        <li class="online-item">
          <div class="user-meta">
            <span class="avatar">${initials || index + 1}</span>
            <span class="user-name">${user.name}</span>
          </div>
          <span class="user-role ${user.role}">${user.role === "host" ? "Host" : "Viewer"}</span>
        </li>
      `;
    })
    .join("");
}

function setMode(nextMode) {
  appState.mode = nextMode;

  roleButtons.forEach((button) => {
    const isActive = button.dataset.role === nextMode;
    button.classList.toggle("active", isActive);
  });

  const shouldShowJoinField = nextMode === "viewer";
  joinRoomField.classList.toggle("hidden", !shouldShowJoinField);
}

function setTheme(themeName) {
  document.body.dataset.theme = themeName;

  themeOptions.forEach((option) => {
    option.classList.toggle("active", option.dataset.theme === themeName);
  });
}

async function copyRoomCode() {
  if (!appState.roomCode) {
    showToast("Crie ou entre em uma sala antes de copiar o código.", "info");
    return;
  }

  try {
    await navigator.clipboard.writeText(appState.roomCode);
    copyRoomCodeBtn.textContent = "Código copiado";
    showToast(`Código da sala copiado: ${appState.roomCode}`, "success");

    setTimeout(() => {
      copyRoomCodeBtn.textContent = "Copiar código";
    }, 1800);
  } catch (error) {
    console.error("Erro ao copiar código da sala:", error);
    showToast("Não foi possível copiar o código. Tente novamente.", "warning");
  }
}

function updateTransmissionControls() {
  const isHost = appState.mode === "host";
  const hasActiveStream = Boolean(appState.stream);

  shareScreenBtn.classList.toggle("hidden", !isHost);
  fullScreenBtn.classList.toggle("hidden", isHost || !hasActiveStream);
  miniFullScreenBtn.classList.toggle("hidden", !hasActiveStream);
  stopShareBtn.classList.toggle("hidden", !isHost || !hasActiveStream);
}

function generateRoomCode() {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  return code.padEnd(6, "X").slice(0, 6);
}

function activateRoom(mode, roomCode) {
  appState.mode = mode;
  appState.roomCode = roomCode;
  appState.userName = userNameInput.value.trim() || "Visitante";

  appShell.classList.add("room-active");
  lobbyPanel.classList.add("hidden");

  roomCodeLabel.textContent = roomCode;
  userStatus.textContent = mode === "host" ? "Host" : "Cliente";
  roomTitle.textContent = mode === "host" ? `Sala de ${appState.userName}` : `Acompanhando ${roomCode}`;

  screenPlaceholder.classList.remove("hidden");
  screenMessage.textContent =
    mode === "host"
      ? "Aguardando compartilhamento da tela..."
      : "A sala está pronta para receber a transmissão.";

  if (screenVideo.srcObject) {
    screenVideo.srcObject.getTracks().forEach((track) => track.stop());
    screenVideo.srcObject = null;
  }

  screenVideo.style.display = "none";
  roomState.classList.remove("hidden");
  onlineUsersPanel.classList.remove("hidden");
  syncRoomMembers();
  renderOnlineUsers();
  updateTransmissionControls();
}

function resetRoom() {
  leaveRoomMembers();
  appState.roomCode = "";
  appState.stream = null;
  appState.viewerWindow = null;

  appShell.classList.remove("room-active");
  lobbyPanel.classList.remove("hidden");

  if (screenVideo.srcObject) {
    screenVideo.srcObject.getTracks().forEach((track) => track.stop());
    screenVideo.srcObject = null;
  }

  screenVideo.style.display = "none";
  screenVideo.classList.remove("fullscreen-video");
  shareStage.classList.remove("fullscreen-mode");
  document.body.classList.remove("fullscreen-lock");
  screenPlaceholder.classList.remove("hidden");
  screenMessage.textContent = "Aguardando compartilhamento da tela...";
  roomState.classList.add("hidden");
  onlineUsersPanel.classList.add("hidden");
  shareScreenBtn.classList.remove("hidden");
  stopShareBtn.classList.add("hidden");
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  }
  lobbyForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function stopShare() {
  if (!appState.stream) {
    return;
  }

  appState.stream.getTracks().forEach((track) => track.stop());
  appState.stream = null;
  screenVideo.srcObject = null;
  screenVideo.style.display = "none";
  screenVideo.classList.remove("fullscreen-video");
  shareStage.classList.remove("fullscreen-mode");
  document.body.classList.remove("fullscreen-lock");
  screenPlaceholder.classList.remove("hidden");
  screenMessage.textContent = "Transmissão interrompida.";
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  }
  liveChannel.postMessage({
    type: "stream-stop",
    roomCode: appState.roomCode,
  });
  updateTransmissionControls();
}

function setStageFullScreen(isFullScreen) {
  if (!shareStage) {
    return;
  }

  if (isFullScreen && document.fullscreenElement !== shareStage) {
    shareStage.requestFullscreen?.();
    return;
  }

  if (!isFullScreen && document.fullscreenElement === shareStage) {
    document.exitFullscreen?.();
  }
}

function toggleFullScreenVideo() {
  if (!appState.stream || !screenVideo.srcObject || !shareStage) {
    return;
  }

  const isAlreadyFull = document.fullscreenElement === shareStage;
  setStageFullScreen(!isAlreadyFull);
}

function syncFullScreenState() {
  const isFullScreen = document.fullscreenElement === shareStage;
  shareStage?.classList.toggle("fullscreen-mode", isFullScreen);
  document.body.classList.toggle("fullscreen-lock", isFullScreen);
}

async function shareScreen() {
  if (!appState.roomCode) {
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true,
    });

    appState.stream = stream;
    screenVideo.srcObject = stream;
    screenVideo.style.display = "block";
    screenPlaceholder.classList.add("hidden");
    updateTransmissionControls();

    liveChannel.postMessage({
      type: "stream-start",
      roomCode: appState.roomCode,
      userName: appState.userName,
      mode: appState.mode,
    });

    stream.getVideoTracks()[0].addEventListener("ended", () => {
      appState.stream = null;
      screenVideo.srcObject = null;
      screenVideo.style.display = "none";
      screenVideo.classList.remove("fullscreen-video");
      shareStage.classList.remove("fullscreen-mode");
      document.body.classList.remove("fullscreen-lock");
      screenPlaceholder.classList.remove("hidden");
      screenMessage.textContent = "Compartilhamento encerrado.";
      liveChannel.postMessage({
        type: "stream-stop",
        roomCode: appState.roomCode,
      });
      updateTransmissionControls();
    });
  } catch (error) {
    console.error("Erro ao compartilhar tela:", error);
    screenMessage.textContent = "Permita o acesso à sua tela para continuar.";
  }
}

roleButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.role));
});

lobbyForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const userName = userNameInput.value.trim();
  if (!userName) {
    userNameInput.focus();
    userNameInput.placeholder = "Digite seu nome antes de entrar";
    return;
  }

  if (appState.mode === "host") {
    const roomCode = generateRoomCode();
    activateRoom("host", roomCode);
    return;
  }

  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!roomCode) {
    roomCodeInput.focus();
    roomCodeInput.placeholder = "Informe o código da sala";
    return;
  }

  activateRoom("viewer", roomCode);
});

shareScreenBtn.addEventListener("click", shareScreen);
stopShareBtn.addEventListener("click", stopShare);
fullScreenBtn.addEventListener("click", toggleFullScreenVideo);
miniFullScreenBtn.addEventListener("click", toggleFullScreenVideo);
copyRoomCodeBtn.addEventListener("click", copyRoomCode);
leaveRoomBtn.addEventListener("click", resetRoom);

liveChannel.addEventListener("message", (event) => {
  const data = event.data || {};
  if (!data || data.roomCode !== appState.roomCode) {
    return;
  }

  if (data.type === "participants-update") {
    renderOnlineUsers();
  }

  if (data.type === "presence-update" && data.sessionId !== appState.sessionId) {
    notifyPresenceChange(data.userName, data.action);
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === ROOM_STORAGE_KEY && appState.roomCode) {
    renderOnlineUsers();
  }
});

window.addEventListener("beforeunload", () => {
  leaveRoomMembers();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.fullscreenElement === shareStage) {
    event.preventDefault();
    document.exitFullscreen?.();
  }
});

document.addEventListener("fullscreenchange", syncFullScreenState);
document.addEventListener("webkitfullscreenchange", syncFullScreenState);

themeSettingsBtn.addEventListener("click", () => {
  themeMenu.classList.toggle("hidden");
});

themeOptions.forEach((option) => {
  option.addEventListener("click", () => {
    setTheme(option.dataset.theme);
    themeMenu.classList.add("hidden");
  });
});

setTheme("dark");
setMode("host");
updateTransmissionControls();
