const CACHE_SECONDS = 30 * 60; // how long Vercel's edge caches a given grid cell
const STALE_SECONDS = 60 * 60; // serve stale data (while revalidating) for up to this long

// Rough bounding box for Norway's mainland coastline + coastal waters.
const NORWAY_BOUNDS = { latMin: 57.8, latMax: 71.5, lonMin: 4.0, lonMax: 31.5 };

function isInNorway(lat, lon) {
  return (
    lat >= NORWAY_BOUNDS.latMin &&
    lat <= NORWAY_BOUNDS.latMax &&
    lon >= NORWAY_BOUNDS.lonMin &&
    lon <= NORWAY_BOUNDS.lonMax
  );
}

function isoNoMillis(date) {
  return date.toISOString().split(".")[0] + "Z";
}

// Kartverket's "TAB" datatype returns only the high/low extrema themselves
// (not a continuous curve), so consecutive points already strictly alternate
// between highs and lows — we classify each one that way rather than trusting
// any particular flag string, since the exact flag vocabulary isn't documented.
function parseKartverketExtremes(xmlText) {
  const tags = xmlText.match(/<waterlevel\b[^>]*\/>/g) || [];
  const points = tags
    .map((tag) => {
      const valueMatch = tag.match(/value="(-?[0-9.]+)"/);
      const timeMatch = tag.match(/time="([^"]+)"/);
      if (!valueMatch || !timeMatch) return null;
      return { value: parseFloat(valueMatch[1]), time: new Date(timeMatch[1]) };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  if (points.length < 2) return [];

  const firstIsHigh = points[0].value > points[1].value;
  return points.map((p, i) => ({
    dt: Math.floor(p.time.getTime() / 1000),
    height: p.value / 100, // Kartverket returns centimeters
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
  const extremes = parseKartverketExtremes(xmlText);
  if (extremes.length === 0) throw new Error("No tide data returned by Kartverket");

  return { status: 200, extremes, source: "kartverket" };
}

async function fetchWorldTides(lat, lon) {
  const apiKey = process.env.WORLDTIDES_API_KEY;
  if (!apiKey) throw new Error("Server is not configured with a WorldTides API key");

  const start = Math.floor(Date.now() / 1000) - 86400;
  const length = 3 * 86400;
  const url =
    `https://www.worldtides.info/api/v3?extremes&datum=MSL` +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}` +
    `&key=${encodeURIComponent(apiKey)}&start=${start}&length=${length}`;

  const upstream = await fetch(url);
  const data = await upstream.json();
  if (!upstream.ok || data.status !== 200) {
    throw new Error(data.error || `WorldTides request failed (${upstream.status})`);
  }
  return data;
}

module.exports = async function handler(req, res) {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    res.status(400).json({ error: "lat and lon are required" });
    return;
  }
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);

  try {
    let data;
    if (isInNorway(latNum, lonNum)) {
      try {
        data = await fetchKartverket(latNum, lonNum);
      } catch (err) {
        // Fall back to WorldTides if Kartverket has a hiccup, rather than failing outright.
        data = await fetchWorldTides(latNum, lonNum);
      }
    } else {
      data = await fetchWorldTides(latNum, lonNum);
    }

    // Cache at the edge so nearby users (same rounded lat/lon from the client)
    // share one upstream call instead of one per user.
    res.setHeader(
      "Cache-Control",
      `public, max-age=0, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
    );
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message || "Failed to reach tide data provider" });
  }
};
