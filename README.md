# Tide

A single-page web app that shows the current tide at your location as a full-screen
ocean animation. The water fills the whole screen at high tide and covers about a
tenth of the screen at low tide, with a small arrow showing whether the tide is
rising or falling.

## How it works

- Uses the browser Geolocation API to find your location.
- Fetches tide extremes (highs/lows) for your location from the
  [WorldTides API](https://www.worldtides.info/).
- Interpolates the current tide height between the nearest low and high using a
  smooth (cosine) curve, animates the ocean fill in real time, and refetches data
  every 5 minutes to stay current.

## Setup

1. Open `index.html` in a browser (or serve the folder with any static file server).
2. Click the gear icon and paste a free [WorldTides API key](https://www.worldtides.info/register).
3. Allow location access when prompted.

The API key is stored only in your browser's `localStorage` — it is never sent
anywhere except directly to WorldTides.

## Files

- `index.html` — page structure and settings panel
- `style.css` — ocean animation and UI styling
- `app.js` — geolocation, tide data fetching, fill/trend calculation, animation loop
