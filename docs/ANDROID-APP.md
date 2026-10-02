# Shop Ledger PH — Android app

Native Android companion built with Capacitor v8 around the LAN phone UI.
The APK bundles a snapshot of the phone UI; the **shop computer is still
required** — it remains the server (database, API, printer). The app adds:
native camera barcode scanning (works on plain-http shop Wi-Fi, where the
browser blocks the camera), haptics, proper back-button behavior, and a
connect screen with saved shops. No Play Store needed for shop use: the APK
sideloads directly. A ready debug APK ships with every desktop release
(starting v3.30.0) as `Shop-Ledger-Mobile-X.Y.Z-debug.apk` — grab it for
testing; follow below to build your own signed release.

## One-time setup (on a machine with Android Studio)

Prerequisites: **Android Studio** (includes SDK + a suitable JDK — use the
Studio-bundled JDK), Node LTS, and (for the scanner) a device with Google
Play services. This repo machine has none of these, so all of this runs on
yours.

```powershell
cd mobile-app
npm install
node scripts/sync-phone-ui.mjs
npx cap add android
```

Then apply `mobile-app/android-manifest-snippet.xml` to
`android/app/src/main/AndroidManifest.xml` (camera permission + cleartext
http for shop Wi-Fi + ML Kit model), and in
`android/variables.gradle` set `minSdkVersion = 26` (barcode scanner
requirement; Android 8+, covers virtually every device today).

Icons (one command, needs a source image — `src/renderer/assets/pwa-512.png`
works):

```powershell
npx @capacitor/assets generate --iconBackgroundColor '#0f172a' --splashBackgroundColor '#0f172a'
npx cap sync
npx cap open android
```

## Run / build

- **Try it:** in Android Studio, pick a device/emulator and press Run. For
  barcode scanning use a physical device (emulators lack Play-services
  vision unless the image ships it).
- **Debug APK** (sideload for testing): `Build → Build App Bundle(s) / APK(s)
  → Build APK(s)`, or `./gradlew assembleDebug` in `mobile-app/android`.
  Copy the APK to the phone, allow “install unknown apps”, install.
- **Release APK:** `Build → Generate Signed Bundle / APK`, create a
  keystore once, keep it backed up — lose it and you can never update the
  installed app. Share the signed APK (Drive, USB, QR to the file).

## Updating the app on phones

1. Pull the repo (new `mobile-app/package.json` version tracks desktop).
2. `node scripts/build-mobile.mjs` (if phone UI sources changed) then
   `node mobile-app/scripts/sync-phone-ui.mjs` — refreshes the bundled UI.
3. `node mobile-app/scripts/stamp-android-version.mjs` — stamps
   versionCode/versionName from `mobile-app/package.json` (the in-app
   updater and Android use these to tell releases apart).
4. `npx cap sync` — copies web assets + plugins into the native project.
5. Rebuild the APK in Android Studio, reinstall on phones (data and pairing
   survive; the stored shop address stays).

Phones also self-notify: the phone UI checks the GitHub releases about
once a day (plus a manual Settings → App updates check) and offers newer
mobile APKs through the system browser, which installs them like any
sideloaded file.

## How it connects

First launch shows a connect screen: type the shop address
(`http://192.168.1.5:3456`, shown on the desktop under Mobile Access) or
scan the desktop QR with the native scanner. The app health-checks the
address, saves it, and opens the phone UI with the QR claim (or the pair
screen for typed codes). Saved shops persist; the token flow, roles, PIN,
and offline queue are unchanged from the browser version.

## Troubleshooting

- **Blank / can't reach shop:** same Wi-Fi? Desktop app running? Address
  must include the port (`:3456`). Cleartext is enabled via the manifest
  snippet — without it Android blocks plain-http.
- **Scanner won't start:** needs Play services + camera permission; grant it
  in App info if denied. Emulators usually can't do this — use hardware.
- **Build fails on minSdk:** the barcode plugin needs 26+; check
  `android/variables.gradle` wasn't overwritten by `cap sync` (it isn't —
  variables survive syncs).
- **Stale UI in the APK:** you forgot `sync-phone-ui.mjs` + `cap sync`.
  Root `npm test` includes `sync:check` to catch this.
- **Desktop API rejects the app:** the app sends the same tokens/headers as
  the browser page; check pairing and the LAN token as usual.

## Later: iPhone, Play Store

iPhone needs the iOS platform (`npx cap add ios`, macOS + Xcode) and the
$99/yr Apple Developer Program for distribution — no sideloading path like
Android. Play Store publishing is optional; the signed APK works fine
without it.
