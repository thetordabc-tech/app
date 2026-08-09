# Tide

A single-page web app that shows the current tide at your location as a full-screen
ocean animation. The water fills the whole screen at high tide and covers about a
tenth of the screen at low tide, with a small arrow showing whether the tide is
rising or falling.

## How it works

- Uses the browser Geolocation API to find your location.
- Fetches tide extremes (highs/lows) for your location from the
  [WorldTides API](https://www.worldtides.info/), via a small serverless proxy
  (`api/tides.js`) so individual users don't need their own API key.
- Interpolates the current tide height between the nearest low and high using a
  smooth (cosine) curve, animates the ocean fill in real time, and refetches data
  every 5 minutes to stay current.

If the proxy isn't available (e.g. when the site is served from a static-only host
like GitHub Pages), the app falls back to asking the visitor for their own free
WorldTides key via the settings (gear) button.

## Deploying the live web app (Vercel)

Vercel hosts both the static site and the `api/tides.js` serverless function from
one project, which is what lets end users skip the API key entirely.

1. Sign up / log in at [vercel.com](https://vercel.com) and import this GitHub repo
   as a new project (defaults are fine — no build step needed).
2. In the project's **Settings → Environment Variables**, add:
   - `WORLDTIDES_API_KEY` = your [WorldTides API key](https://www.worldtides.info/register)
3. Deploy. Vercel gives you a URL like `https://your-project.vercel.app` — open that
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

## Local development

Open `index.html` directly in a browser, or serve the folder with any static file
server. Without a deployed proxy, use the gear icon to add your own WorldTides key
for local testing.

## Files

- `index.html`, `style.css`, `app.js` — the web app (also mirrored in `www/` for
  the Capacitor build)
- `api/tides.js` — serverless proxy that holds the shared WorldTides key
- `capacitor.config.json`, `package.json` — native app shell configuration
