# shop-printer (first-party Capacitor plugin)

Sends ESC/POS receipt bytes to a Wi-Fi thermal printer over raw TCP
(host:9100). No third-party dependency by design — ~60 lines of Kotlin.

Exposed to the WebView as `ShopPrinter` with one method:

- `send({ host, port, data })` — `data` is base64 ESC/POS (see
  `src/mobile-standalone/escpos.js`). Resolves `{ success: true }`,
  rejects with the socket error message.

## Wiring (already applied to the local native project)

`npx cap sync` does NOT pick up local plugins automatically, so the app
project references it explicitly (files under `mobile-app/android/`
are gitignored build state — re-apply after a fresh `npx cap add`):

1. `mobile-app/android/settings.gradle`:
   ```
   include ':shop-printer'
   project(':shop-printer').projectDir = new File('../plugins/shop-printer/android')
   ```
2. `mobile-app/android/app/build.gradle`:
   ```
   implementation project(':shop-printer')
   ```
3. `MainActivity.java`: `registerPlugin(ShopPrinter.class)` in `onCreate`
   (before `super.onCreate`), with `import shop.printer.ShopPrinter;`

No extra manifest permissions: raw LAN sockets ride on INTERNET.
