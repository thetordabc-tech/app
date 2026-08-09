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

  const start = Math.floor(Date.now() / 1000) - 86400;
  const length = 3 * 86400;
  const url =
    `https://www.worldtides.info/api/v3?extremes` +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}` +
    `&key=${encodeURIComponent(apiKey)}&start=${start}&length=${length}`;

  try {
    const upstream = await fetch(url);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Failed to reach WorldTides" });
  }
}
