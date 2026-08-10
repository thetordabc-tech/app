const APP_NAME = "Web Remote";
const STORAGE_IP = "tvremote.ip";
const STORAGE_TOKEN = "tvremote.token";

const setupScreen = document.getElementById("setup");
const remoteScreen = document.getElementById("remote");
const ipInput = document.getElementById("tv-ip");
const connectBtn = document.getElementById("connect-btn");
const setupError = document.getElementById("setup-error");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const forgetBtn = document.getElementById("forget-btn");

let socket = null;
let currentIp = null;
let usingFallbackPort = false;

function encodedName() {
  return btoa(APP_NAME);
}

function wsUrl(ip, secure, token) {
  const scheme = secure ? "wss" : "ws";
  const port = secure ? 8002 : 8001;
  const tokenPart = token ? `&token=${encodeURIComponent(token)}` : "";
  return `${scheme}://${ip}:${port}/api/v2/channels/samsung.remote.control?name=${encodedName()}${tokenPart}`;
}

function setStatus(state, text) {
  statusDot.className = state;
  statusText.textContent = text;
}

function showSetup(errorMsg) {
  remoteScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
  setupError.textContent = errorMsg || "";
}

function showRemote() {
  setupScreen.classList.add("hidden");
  remoteScreen.classList.remove("hidden");
}

function connect(ip, secure) {
  currentIp = ip;
  usingFallbackPort = !secure;
  const token = localStorage.getItem(STORAGE_TOKEN);
  const url = wsUrl(ip, secure, token);

  setStatus("", secure ? "Connecting…" : "Connecting (fallback)…");

  let opened = false;
  const ws = new WebSocket(url);
  socket = ws;

  const connectTimeout = setTimeout(() => {
    if (!opened) {
      ws.close();
    }
  }, 6000);

  ws.onopen = () => {
    opened = true;
    clearTimeout(connectTimeout);
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      return;
    }

    if (msg.event === "ms.channel.connect") {
      if (msg.data && msg.data.token) {
        localStorage.setItem(STORAGE_TOKEN, msg.data.token);
      }
      localStorage.setItem(STORAGE_IP, ip);
      setStatus("connected", "Connected");
      showRemote();
    } else if (msg.event === "ms.channel.unauthorized" || msg.event === "ms.channel.timeOut") {
      setStatus("disconnected", "Rejected by TV");
      localStorage.removeItem(STORAGE_TOKEN);
      ws.close();
    }
  };

  ws.onerror = () => {
    // onclose will follow and handle fallback / error display
  };

  ws.onclose = () => {
    clearTimeout(connectTimeout);
    if (!opened && secure) {
      // Secure attempt never opened (likely a self-signed cert or older TV) — try the plain port.
      connect(ip, false);
      return;
    }
    if (!opened && !secure) {
      setStatus("disconnected", "Disconnected");
      showSetup(
        "Couldn't reach the TV. Make sure it's on, on the same WiFi, and that " +
        "you accepted the connection prompt on the TV screen."
      );
      return;
    }
    if (socket === ws) {
      setStatus("disconnected", "Disconnected — reconnecting…");
      setTimeout(() => {
        if (currentIp) connect(currentIp, !usingFallbackPort ? true : false);
      }, 2000);
    }
  };
}

function sendKey(key) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(
    JSON.stringify({
      method: "ms.remote.control",
      params: {
        Cmd: "Click",
        DataOfCmd: key,
        Option: "false",
        TypeOfRemote: "SendRemoteKey",
      },
    })
  );
}

document.querySelectorAll("[data-key]").forEach((el) => {
  el.addEventListener("click", () => sendKey(el.dataset.key));
});

connectBtn.addEventListener("click", () => {
  const ip = ipInput.value.trim();
  if (!ip) {
    setupError.textContent = "Enter a valid IP address.";
    return;
  }
  setupError.textContent = "";
  connect(ip, true);
});

ipInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") connectBtn.click();
});

forgetBtn.addEventListener("click", () => {
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  currentIp = null;
  localStorage.removeItem(STORAGE_TOKEN);
  showSetup("");
});

// Auto-connect if we already know the TV's IP.
const savedIp = localStorage.getItem(STORAGE_IP);
if (savedIp) {
  ipInput.value = savedIp;
  connect(savedIp, true);
}
