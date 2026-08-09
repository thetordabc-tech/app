const CACHE_SECONDS = 30 * 60; // how long Vercel's edge caches a given grid cell
const STALE_SECONDS = 60 * 60; // serve stale data (while revalidating) for up to this long

// Rough bounding boxes for the countries with free, keyless tide data.
// Checked in order; the first match wins.
const REGIONS = [
  { name: "norway", latMin: 57.8, latMax: 71.5, lonMin: 4.0, lonMax: 31.5, fetch: fetchKartverket },
  { name: "usa", latMin: 24.0, latMax: 49.5, lonMin: -125.5, lonMax: -66.0, fetch: fetchNOAA },
  { name: "usa-alaska", latMin: 51.0, latMax: 71.5, lonMin: -180.0, lonMax: -129.0, fetch: fetchNOAA },
  { name: "usa-hawaii", latMin: 18.5, latMax: 22.5, lonMin: -160.5, lonMax: -154.5, fetch: fetchNOAA },
  { name: "canada", latMin: 41.5, latMax: 83.5, lonMin: -141.0, lonMax: -52.0, fetch: fetchCHS },
];

function isoNoMillis(date) {
  return date.toISOString().split(".")[0] + "Z";
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function findNearest(lat, lon, points, getLat, getLon) {
  let best = null;
  let bestDist = Infinity;
  for (const p of points) {
    const pLat = getLat(p);
    const pLon = getLon(p);
    if (typeof pLat !== "number" || typeof pLon !== "number" || Number.isNaN(pLat) || Number.isNaN(pLon)) continue;
    const d = haversine(lat, lon, pLat, pLon);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

// Kartverket (Norway) returns only the extrema themselves for datatype=TAB,
// so consecutive points already strictly alternate between highs and lows.
// Canada's wlp-hilo series has the same shape with no explicit type field,
// so this same classifier is reused for both.
function classifyAlternating(points) {
  if (points.length < 2) return [];
  const firstIsHigh = points[0].height > points[1].height;
  return points.map((p, i) => ({
    ...p,
    type: (i % 2 === 0 ? firstIsHigh : !firstIsHigh) ? "High" : "Low",
  }));
}

async function fetchKartverket(lat, lon) {
  const fromtime = isoNoMillis(new Date(Date.now() - 86400 * 1000));
  const totime = isoNoMillis(new Date(Date.now() + 2 * 86400 * 1000));

  const url =
    `https://vannstand.kartverket.no/tideapi.php?tide_request=locationdata` +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}` +
    `&fromtime=${encodeURIComponent(fromtime)}&totime=${encodeURIComponent(totime)}` +
    `&datatype=TAB&refcode=MSL&interval=60&lang=en&dst=1`;

  const upstream = await fetch(url);
  if (!upstream.ok) throw new Error(`Kartverket request failed (${upstream.status})`);
  const xmlText = await upstream.text();

  const tags = xmlText.match(/<waterlevel\b[^>]*\/>/g) || [];
  const points = tags
    .map((tag) => {
      const valueMatch = tag.match(/value="(-?[0-9.]+)"/);
      const timeMatch = tag.match(/time="([^"]+)"/);
      if (!valueMatch || !timeMatch) return null;
      return {
        dt: Math.floor(new Date(timeMatch[1]).getTime() / 1000),
        height: parseFloat(valueMatch[1]) / 100, // centimeters -> meters
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.dt - b.dt);

  const extremes = classifyAlternating(points);
  if (extremes.length === 0) throw new Error("No tide data returned by Kartverket");
  return { status: 200, extremes, source: "kartverket" };
}

async function fetchNOAA(lat, lon) {
  const stationsRes = await fetch(
    "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions"
  );
  if (!stationsRes.ok) throw new Error(`NOAA station lookup failed (${stationsRes.status})`);
  const stationsData = await stationsRes.json();
  const stations = stationsData.stations || [];
  if (stations.length === 0) throw new Error("No NOAA stations returned");

  const nearest = findNearest(
    lat,
    lon,
    stations,
    (s) => (typeof s.lat === "number" ? s.lat : parseFloat(s.lat)),
    (s) => (typeof s.lng === "number" ? s.lng : parseFloat(s.lng))
  );
  if (!nearest) throw new Error("No nearby NOAA station found");

  const fmt = (d) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  };
  const beginDate = fmt(new Date(Date.now() - 86400 * 1000));
  const endDate = fmt(new Date(Date.now() + 2 * 86400 * 1000));

  const url =
    `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions` +
    `&application=tide-app&begin_date=${beginDate}&end_date=${endDate}` +
    `&datum=MSL&station=${encodeURIComponent(nearest.id)}` +
    `&time_zone=gmt&units=metric&interval=hilo&format=json`;

  const upstream = await fetch(url);
  if (!upstream.ok) throw new Error(`NOAA predictions request failed (${upstream.status})`);
  const data = await upstream.json();
  const predictions = data.predictions || [];
  if (predictions.length === 0) throw new Error("No tide predictions returned by NOAA");

  const extremes = predictions.map((p) => ({
    dt: Math.floor(new Date(p.t.replace(" ", "T") + "Z").getTime() / 1000),
    height: parseFloat(p.v),
    type: p.type === "H" ? "High" : "Low",
  }));

  return { status: 200, extremes, source: "noaa" };
}

async function fetchCHS(lat, lon) {
  const stationsRes = await fetch("https://api-iwls.dfo-mpo.gc.ca/api/v1/stations");
  if (!stationsRes.ok) throw new Error(`CHS station lookup failed (${stationsRes.status})`);
  const stations = await stationsRes.json();
  if (!Array.isArray(stations) || stations.length === 0) throw new Error("No CHS stations returned");

  const nearest = findNearest(
    lat,
    lon,
    stations,
    (s) => (typeof s.latitude === "number" ? s.latitude : parseFloat(s.latitude)),
    (s) => (typeof s.longitude === "number" ? s.longitude : parseFloat(s.longitude))
  );
  if (!nearest) throw new Error("No nearby CHS station found");

  const from = isoNoMillis(new Date(Date.now() - 86400 * 1000));
  const to = isoNoMillis(new Date(Date.now() + 2 * 86400 * 1000));

  const url =
    `https://api-iwls.dfo-mpo.gc.ca/api/v1/stations/${encodeURIComponent(nearest.id)}/data` +
    `?time-series-code=wlp-hilo&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const upstream = await fetch(url);
  if (!upstream.ok) throw new Error(`CHS predictions request failed (${upstream.status})`);
  const events = await upstream.json();
  if (!Array.isArray(events) || events.length === 0) throw new Error("No tide predictions returned by CHS");

  const points = events
    .map((e) => ({
      dt: Math.floor(new Date(e.eventDate).getTime() / 1000),
      height: e.value,
    }))
    .sort((a, b) => a.dt - b.dt);

  const extremes = classifyAlternating(points);
  return { status: 200, extremes, source: "chs" };
}

module.exports = async function handler(req, res) {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    res.status(400).json({ error: "lat and lon are required" });
    return;
  }
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);

  const region = REGIONS.find(
    (r) => latNum >= r.latMin && latNum <= r.latMax && lonNum >= r.lonMin && lonNum <= r.lonMax
  );

  if (!region) {
    res.status(404).json({
      status: 404,
      unsupported: true,
      message: "Tide data isn't available for this location yet (currently: Norway, USA, Canada).",
    });
    return;
  }

  try {
    const data = await region.fetch(latNum, lonNum);
    res.setHeader(
      "Cache-Control",
      `public, max-age=0, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
    );
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message || "Failed to reach tide data provider" });
  }
};
