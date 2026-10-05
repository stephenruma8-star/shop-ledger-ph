# Shop Ledger PH — Android app (standalone)

Native Android POS built with Capacitor v8. Since v4.0.0 the phone is a
**fully independent shop ledger**: its own on-device SQLite database, all
sales/clients/inventory/suppliers/expenses/reports logic running locally.
No desktop, no pairing, no Wi-Fi needed — except for the thermal printer.

The app adds over the browser: native camera barcode scanning, haptics,
proper back-button behavior, biometric/PIN lock, and direct Wi-Fi receipt
printing through the first-party `ShopPrinter` plugin (raw TCP ESC/POS,
same bytes the desktop sends). No Play Store needed: the signed APK
sideloads directly. Releases ship as `Shop-Ledger-Mobile-X.Y.Z-standalone.apk`
under the `mobile-vX.Y.Z` prerelease tags (pre-release so desktop
updaters ignore them).

## One-time setup (on a machine with Android Studio)

Prerequisites: **Android Studio** (SDK + JDK), Node LTS, and a device with
Google Play services for the scanner.

```powershell
cd mobile-app
npm install
node scripts/build-standalone.mjs
npx cap sync android
```

Then apply `mobile-app/android-manifest-snippet.xml` to
`android/app/src/main/AndroidManifest.xml` (camera permission + cleartext),
and wire the local printer plugin (see
`mobile-app/plugins/shop-printer/README.md`: settings.gradle include,
`implementation project(':shop-printer')`, `registerPlugin` in
MainActivity — `npx cap sync` preserves all three).

Icons (one command, `src/renderer/assets/pwa-512.png` works as source):

```powershell
npx @capacitor/assets generate --iconBackgroundColor '#0f172a' --splashBackgroundColor '#0f172a'
npx cap sync
npx cap open android
```

Keystore: `mobile-app/shop-ledger-release.keystore` (gitignored — back it
up; lose it and installed apps can never update). Passwords live in
`mobile-app/android/gradle.properties` (also ignored).

## Run / build

- **Try it:** in Android Studio, pick a device/emulator and press Run. For
  barcode scanning use a physical device.
- **Signed APK:** `./gradlew assembleRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease -x lintVitalRelease`
  in `mobile-app/android` (lint exclusions are for machine JDKs with
  missing AWT libs; debug lint passes). Copy the APK to the phone, allow
  "install unknown apps", install.

## Updating the app on phones

1. Edit `src/mobile/` (shared views) or `src/mobile-standalone/`, then
   `node scripts/build-standalone.mjs` — refreshes the bundled UI.
2. Bump `mobile-app/package.json`, then
   `node mobile-app/scripts/stamp-android-version.mjs` (versionCode
   `major*1000000 + minor*1000 + patch`).
3. `npx cap sync` — copies web assets + plugins into the native project.
4. Rebuild, reinstall (on-device data survives: same app id, same DB file).

Root `npm test` covers the standalone layer: `build-standalone --check`,
`test-standalone` (59 store tests), `check-standalone-refs` (bundle link
check). The old companion flow (pairing, connect screen, LAN API) is gone:
desktop v3.35+ has no Mobile Access screen, and `mobile-app/www/index.html`
redirects straight into the app.

## First run on a phone

Fresh ledger — nothing carries over from anywhere. Set a PIN in Settings,
enter the receipt printer's Wi-Fi IP in Settings → shop edit, add catalog
items, and run a test sale + payment + return before shop use.

## Troubleshooting

- **Blank screen:** reinstall the APK (downgrades blocked by versionCode).
- **Scanner won't start:** needs Play services + camera permission; grant it
  in App info if denied. Emulators usually can't do this — use hardware.
- **Print fails:** printer IP set? Same Wi-Fi? No printer → receipt shares
  as text instead (by design).
- **Stale UI in the APK:** you forgot `build-standalone.mjs` + `cap sync`.
- **SQLite plugin missing at boot:** `npx cap sync` wasn't run after
  `npm install` — the app shows a database error instead of data.

## Later: iPhone, Play Store

iPhone needs the iOS platform (`npx cap add ios`, macOS + Xcode) and the
$99/yr Apple Developer Program for distribution — no sideloading path like
Android. Play Store publishing is optional; the signed APK works fine
without it.
