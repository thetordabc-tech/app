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

## Files

- `index.html`, `style.css`, `app.js` — the whole app (static, no build step)
