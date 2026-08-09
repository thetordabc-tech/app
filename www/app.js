const API_BASE = "https://www.worldtides.info/api/v3";
const API_KEY_STORAGE = "worldtides_api_key";
const REFRESH_MS = 5 * 60 * 1000; // refetch extremes every 5 minutes
const TICK_MS = 1000; // recompute animated fill every second

const waterEl = document.getElementById("water");
const trendEl = document.getElementById("trend");
const trendArrowEl = document.getElementById("trend-arrow");
const trendLabelEl = document.getElementById("trend-label");
const placeEl = document.getElementById("place");
const levelEl = document.getElementById("level");
const statusEl = document.getElementById("status");
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const apiKeyInput = document.getElementById("api-key-input");
const saveKeyBtn = document.getElementById("save-key-btn");
const closeSettingsBtn = document.getElementById("close-settings-btn");

let cachedExtremes = null;
let tickTimer = null;
let refreshTimer = null;
let currentCoords = null;

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || "";
}

function setApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE, key.trim());
}

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function openSettings() {
  apiKeyInput.value = getApiKey();
  settingsPanel.classList.remove("hidden");
}

function closeSettings() {
  settingsPanel.classList.add("hidden");
}

settingsBtn.addEventListener("click", openSettings);
closeSettingsBtn.addEventListener("click", closeSettings);
saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  setApiKey(key);
  closeSettings();
  setStatus("");
  start();
});

async function fetchViaProxy(lat, lon) {
  const res = await fetch(`/api/tides?lat=${lat}&lon=${lon}`);
  if (res.status === 404) return null; // no backend deployed here (e.g. static-only hosting)
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.status !== 200) {
    const message = (data && data.error) || `Tide request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

async function fetchDirect(lat, lon, apiKey) {
  const start = Math.floor(Date.now() / 1000) - 86400;
  const length = 3 * 86400;
  const url = `${API_BASE}?extremes&lat=${lat}&lon=${lon}&key=${encodeURIComponent(
    apiKey
  )}&start=${start}&length=${length}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.status !== 200) {
    const message = (data && data.error) || `Tide request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

function computeTideState(extremes, nowSeconds) {
  const sorted = extremes.slice().sort((a, b) => a.dt - b.dt);
  let prev = null;
  let next = null;
  for (const e of sorted) {
    if (e.dt <= nowSeconds) prev = e;
    if (e.dt > nowSeconds && !next) next = e;
  }
  if (!prev || !next) return null;

  const heights = sorted.map((e) => e.height);
  const minH = Math.min(...heights);
  const maxH = Math.max(...heights);

  const frac = (nowSeconds - prev.dt) / (next.dt - prev.dt);
  const eased = (1 - Math.cos(Math.PI * frac)) / 2;
  const currentHeight = prev.height + (next.height - prev.height) * eased;

  const rising = next.type === "High";

  let fillPct;
  if (maxH === minH) {
    fillPct = 55;
  } else {
    fillPct = 10 + (90 * (currentHeight - minH)) / (maxH - minH);
  }
  fillPct = Math.max(10, Math.min(100, fillPct));

  return { fillPct, rising, currentHeight, next, prev };
}

function render() {
  if (!cachedExtremes) return;
  const nowSeconds = Date.now() / 1000;
  const state = computeTideState(cachedExtremes.extremes, nowSeconds);
  if (!state) {
    setStatus("Waiting for more tide data…");
    return;
  }
  setStatus("");

  waterEl.style.height = `${state.fillPct}%`;

  trendEl.classList.remove("hidden", "rising", "falling");
  trendEl.classList.add(state.rising ? "rising" : "falling");
  trendArrowEl.textContent = "↑";
  trendLabelEl.textContent = state.rising ? "Rising" : "Falling";

  levelEl.textContent = `${state.currentHeight.toFixed(2)} m — next ${
    state.next.type
  } ${formatTime(state.next.dt)}`;
}

function formatTime(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function loadTides() {
  if (!currentCoords) return;

  try {
    setStatus("Fetching tide data…");
    let data = await fetchViaProxy(currentCoords.lat, currentCoords.lon);

    if (data === null) {
      // No server-side proxy available here — fall back to a user-supplied key.
      const apiKey = getApiKey();
      if (!apiKey) {
        setStatus("Add your WorldTides API key in settings to get started.");
        openSettings();
        return;
      }
      data = await fetchDirect(currentCoords.lat, currentCoords.lon, apiKey);
    }

    cachedExtremes = data;
    placeEl.textContent =
      data.station || `${currentCoords.lat.toFixed(2)}, ${currentCoords.lon.toFixed(2)}`;
    setStatus("");
    render();
  } catch (err) {
    setStatus(err.message || "Could not load tide data.");
  }
}

function startTimers() {
  if (tickTimer) clearInterval(tickTimer);
  if (refreshTimer) clearInterval(refreshTimer);
  tickTimer = setInterval(render, TICK_MS);
  refreshTimer = setInterval(loadTides, REFRESH_MS);
}

function locate() {
  if (!navigator.geolocation) {
    setStatus("Geolocation is not supported by this browser.");
    return;
  }
  setStatus("Locating…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      loadTides();
    },
    (err) => {
      setStatus(`Location access denied: ${err.message}`);
      placeEl.textContent = "Location unavailable";
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 }
  );
}

function start() {
  locate();
  startTimers();
}

start();
