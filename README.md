# Tide

A single-page web app that shows the current tide at your location as a full-screen
ocean animation. The water fills the whole screen at high tide and covers about a
tenth of the screen at low tide, with a bobbing arrow showing whether the tide is
rising or falling, swimming fish, and a day/night sky with a sun or moon based on
the real time of day.

## How it works

- Uses the browser Geolocation API to find your location.
- `api/tides.js`, a serverless proxy, routes each request to a **free, keyless
  government tide data source** based on where you are:
  - 🇳🇴 Norway → [Kartverket](https://vannstand.kartverket.no/tideapi_en.html)
  - 🇺🇸 USA → [NOAA CO-OPS](https://api.tidesandcurrents.noaa.gov/api/prod/)
  - 🇨🇦 Canada → [Canadian Hydrographic Service (IWLS)](https://api-iwls.dfo-mpo.gc.ca/)
- Outside those regions, the app shows a friendly "not available here yet" message
  instead of tide data. There is no paid API and no API key anywhere — everyone
  gets the same experience without signing up for anything.
- Interpolates the current tide height between the nearest low and high using a
  smooth (cosine) curve, animates the ocean fill in real time, and refetches data
  every 5 minutes to stay current.
- Nearby requests are rounded to a shared ~11km grid and cached at the edge for
  30 minutes, so many users in the same area share one upstream call.

**Note:** because `api/tides.js` is a serverless function, this only works when
deployed somewhere that can run server code (see below). A static-only host like
GitHub Pages can serve the page's look and feel, but cannot fetch real tide data —
there's no more "bring your own API key" fallback now that WorldTides has been
removed.

## Deploying the live web app (Vercel)

Vercel hosts both the static site and the `api/tides.js` serverless function from
one project — this is the only way to get real tide data working.

1. Sign up / log in at [vercel.com](https://vercel.com) and import this GitHub repo
   as a new project (defaults are fine — no build step, no environment variables
   needed since none of the data sources require a key).
2. Deploy. Vercel gives you a URL like `https://your-project.vercel.app` — open that
   on your phone and it works immediately, no setup screen.

## Wrapping it as an installable app (Capacitor)

Once the Vercel deployment is live, you can wrap it in a native shell for the
App Store / Play Store using [Capacitor](https://capacitorjs.com/):

1. `capacitor.config.json` has a placeholder `server.url` — replace it with your
   real Vercel URL from the step above.
2. Install dependencies: `npm install`
3. Add the native platforms (each only needs to be run once):
   - iOS (requires a Mac + Xcode): `npm run cap:add:ios`
   - Android (requires Android Studio): `npm run cap:add:android`
4. After any change to `capacitor.config.json` or the `www/` folder: `npm run cap:sync`
5. Open and build in the native IDE:
   - iOS: `npm run cap:open:ios` → build/sign/archive in Xcode, submit via
     App Store Connect (requires an active Apple Developer Program membership).
   - Android: `npm run cap:open:android` → build a signed bundle in Android Studio,
     submit via Google Play Console (requires a one-time developer registration fee).

This wraps the live site in a thin native shell — the app itself keeps working the
same way (geolocation, tide fetch, animation) since it's just rendering the same
page inside a native container.

## Adding more countries

A few other countries publish free tide data but weren't added yet:

- 🇬🇧 UK ([Admiralty API](https://developer.admiralty.co.uk/)) — free tier exists,
  but requires registering for a personal API key, unlike the others.
- 🇳🇱 Netherlands (Rijkswaterstaat) — the only working method found is an
  undocumented, unofficial endpoint keyed by named station rather than
  coordinates, and needs its own station list plus local high/low detection.

Both are possible to add later with more work; they were left out to avoid
shipping fragile, low-confidence integrations.

## Local development

Open `index.html` directly in a browser, or serve the folder with any static file
server. Without a deployed proxy (`api/tides.js`), no live tide data is available —
you'll see the "not available" status message everywhere.

## Files

- `index.html`, `style.css`, `app.js` — the web app (also mirrored in `www/` for
  the Capacitor build)
- `api/tides.js` — serverless proxy that routes to the right free country data
  source based on coordinates
- `capacitor.config.json`, `package.json` — native app shell configuration
