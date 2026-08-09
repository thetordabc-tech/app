const CACHE_SECONDS = 30 * 60; // how long Vercel's edge caches a given grid cell
const STALE_SECONDS = 60 * 60; // serve stale data (while revalidating) for up to this long

module.exports = async function handler(req, res) {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    res.status(400).json({ error: "lat and lon are required" });
    return;
  }

  const apiKey = process.env.WORLDTIDES_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is not configured with a WorldTides API key" });
    return;
  }

  // Bucket the request window to the hour so repeated calls within the same
  // cache period ask WorldTides for an identical window.
  const hour = 3600;
  const start = Math.floor(Date.now() / 1000 / hour) * hour - 86400;
  const length = 3 * 86400;

  const url =
    `https://www.worldtides.info/api/v3?extremes` +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}` +
    `&key=${encodeURIComponent(apiKey)}&start=${start}&length=${length}`;

  try {
    const upstream = await fetch(url);
    const data = await upstream.json();

    // Cache at the edge so nearby users (same rounded lat/lon from the client)
    // share one upstream WorldTides call instead of one per user.
    if (upstream.ok) {
      res.setHeader(
        "Cache-Control",
        `public, max-age=0, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
      );
    }

    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Failed to reach WorldTides" });
  }
};
