const API_BASE = "https://www.worldtides.info/api/v3";
const API_KEY_STORAGE = "worldtides_api_key";
const REFRESH_MS = 5 * 60 * 1000; // refetch extremes every 5 minutes
const TICK_MS = 1000; // recompute animated fill / sky / clock every second

const waterEl = document.getElementById("water");
const arrowEl = document.getElementById("tide-arrow");
const placeEl = document.getElementById("place");
const clockEl = document.getElementById("clock");
const sunEl = document.getElementById("sun");
const moonEl = document.getElementById("moon");
const highValueEl = document.getElementById("high-value");
const highEtaEl = document.getElementById("high-eta");
const currentValueEl = document.getElementById("current-value");
const lowValueEl = document.getElementById("low-value");
const lowEtaEl = document.getElementById("low-eta");
const statusEl = document.getElementById("status");
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const apiKeyInput = document.getElementById("api-key-input");
const saveKeyBtn = document.getElementById("save-key-btn");
const closeSettingsBtn = document.getElementById("close-settings-btn");
const rootStyle = document.documentElement.style;

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

function roundToGrid(value, step) {
  return (Math.round(value / step) * step).toFixed(2);
}

async function fetchViaProxy(lat, lon) {
  // Round to a shared ~11km grid so nearby users hit the same cached
  // response at the edge instead of each triggering their own WorldTides call.
  const gridLat = roundToGrid(lat, 0.1);
  const gridLon = roundToGrid(lon, 0.1);
  const res = await fetch(`/api/tides?lat=${gridLat}&lon=${gridLon}`);
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
  const url = `${API_BASE}?extremes&datum=MSL&lat=${lat}&lon=${lon}&key=${encodeURIComponent(
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

  const nextHigh = sorted.find((e) => e.dt > nowSeconds && e.type === "High") || null;
  const nextLow = sorted.find((e) => e.dt > nowSeconds && e.type === "Low") || null;

  return { fillPct, rising, currentHeight, nextHigh, nextLow };
}

function formatTime(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatClock(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function lerpColor(a, b, f) {
  const c = [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

const SKY_NIGHT_1 = [6, 16, 28], SKY_NIGHT_2 = [10, 26, 42];
const SKY_DAY_1 = [191, 232, 250], SKY_DAY_2 = [230, 246, 252];

function updateSky(date) {
  const t = (date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600) / 24;
  const brightness = (Math.sin((t - 0.25) * 2 * Math.PI) + 1) / 2; // 0 midnight, 1 noon

  rootStyle.setProperty("--sky-1", lerpColor(SKY_NIGHT_1, SKY_DAY_1, brightness));
  rootStyle.setProperty("--sky-2", lerpColor(SKY_NIGHT_2, SKY_DAY_2, brightness));

  const dayStart = 0.25, dayEnd = 0.75; // 6am - 6pm
  const isDay = t >= dayStart && t < dayEnd;
  const progress = isDay
    ? (t - dayStart) / (dayEnd - dayStart)
    : ((t >= dayEnd ? t - dayEnd : t + (1 - dayEnd)) / (1 - (dayEnd - dayStart)));
  const elevation = Math.sin(progress * Math.PI);

  const top = 62 - elevation * 54; // % from top of sky
  const left = 8 + progress * 84; // % from left

  const activeEl = isDay ? sunEl : moonEl;
  const inactiveEl = isDay ? moonEl : sunEl;
  activeEl.style.top = top + "%";
  activeEl.style.left = left + "%";
  activeEl.style.opacity = String(elevation);
  inactiveEl.style.opacity = "0";
}

function render() {
  const now = new Date();
  clockEl.textContent = formatClock(now);
  updateSky(now);

  if (!cachedExtremes) return;
  const nowSeconds = now.getTime() / 1000;
  const state = computeTideState(cachedExtremes.extremes, nowSeconds);
  if (!state) {
    setStatus("Waiting for more tide data…");
    return;
  }
  setStatus("");

  waterEl.style.height = `${state.fillPct}%`;
  arrowEl.classList.toggle("falling", !state.rising);
  currentValueEl.textContent = state.currentHeight.toFixed(2) + " m";

  if (state.nextHigh) {
    highValueEl.textContent = state.nextHigh.height.toFixed(1) + " m";
    highEtaEl.textContent = formatTime(state.nextHigh.dt);
  }
  if (state.nextLow) {
    lowValueEl.textContent = state.nextLow.height.toFixed(1) + " m";
    lowEtaEl.textContent = formatTime(state.nextLow.dt);
  }
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
  render();
}

start();
