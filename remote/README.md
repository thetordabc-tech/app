# Remote

A simple TV remote for Samsung (Tizen) smart TVs. Connects directly from your phone's
browser to the TV over local WiFi using Samsung's local WebSocket remote-control API —
no app store, no server, no account.

## Setup

1. Make sure your phone and TV are on the same WiFi network.
2. On the TV, find its IP address: **Settings → General → Network → Network Status**.
3. Open this app, enter the IP, tap **Connect**.
4. The TV will show an **"Allow connection?"** popup the first time — accept it there.
   After that, this device is remembered (a token is saved in the browser) and future
   connections skip the prompt.

## Notes on the connection

- Samsung TVs expose the remote API over a local WebSocket:
  `wss://<tv-ip>:8002/...` (encrypted, self-signed certificate) on newer models, and
  `ws://<tv-ip>:8001/...` (unencrypted) as a fallback on some older ones. The app tries
  the encrypted port first and falls back automatically.
- **If this page is served over HTTPS** (e.g. deployed on Vercel like the Tide app),
  browsers block the unencrypted `ws://8001` fallback (mixed content), so only the
  `wss://8002` path will work. Because the TV's certificate is self-signed, the first
  connection may silently fail in some browsers. If that happens, open
  `https://<tv-ip>:8002` directly in the same mobile browser once, accept the certificate
  warning, then return to this app and connect again.
- Opening this app directly as a local file, or serving it over plain HTTP on your own
  network, avoids the certificate issue entirely since the `ws://8001` fallback is then
  allowed.
- Some Samsung TVs require **IP Remote / Mobile Connection** to be enabled:
  **Settings → General → External Device Manager → Device Connect Manager**.

## Deploying the live web app (Vercel)

1. Sign up / log in at [vercel.com](https://vercel.com) and import this GitHub repo
   as a **new, separate project** from the Tide one.
2. In the project's setup screen, set **Root Directory** to `remote`.
3. Framework preset: **Other** (static site, no build step, no environment variables).
4. Deploy. Vercel gives you a URL like `https://your-project.vercel.app`.

This is independent of the Tide app's own Vercel project — the two are deployed
separately even though they live in the same repo.

## Wrapping it as an installable app (Capacitor)

Once the Vercel deployment is live, you can wrap it in a native shell for the
App Store / Play Store using [Capacitor](https://capacitorjs.com/), same as Tide:

1. `capacitor.config.json` has a placeholder `server.url` — replace it with your
   real Vercel URL from the step above.
2. Install dependencies: `npm install` (run from inside `remote/`)
3. Add the native platforms (each only needs to be run once):
   - iOS (requires a Mac + Xcode): `npm run cap:add:ios`
   - Android (requires Android Studio): `npm run cap:add:android`
4. After any change to `capacitor.config.json` or the `www/` folder: `npm run cap:sync`
5. Open and build in the native IDE:
   - iOS: `npm run cap:open:ios` → build/sign/archive in Xcode, submit via
     App Store Connect.
   - Android: `npm run cap:open:android` → build a signed bundle in Android Studio,
     submit via Google Play Console.

## Files

- `index.html`, `style.css`, `app.js` — the web app (also mirrored in `www/` for
  the Capacitor build)
- `capacitor.config.json`, `package.json` — native app shell configuration
