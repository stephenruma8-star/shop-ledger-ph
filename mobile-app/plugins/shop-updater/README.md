# shop-updater (first-party Capacitor plugin)

Downloads an APK through the system DownloadManager (with progress
notification) and opens the installer when finished — the reliable way to
deliver in-app updates. Exposed as `ShopUpdater`:

- `fetchAndInstall({ url, fileName })` — resolves `{ started: true }` once
  queued. Rejects `ENABLE_INSTALL: ...` on Android 8+ when the per-app
  unknown-sources opt-in is missing (the plugin opens that Settings page;
  the app tells the user to tap Download again after allowing).

## Wiring (applied to the local native project)

`npx cap sync` does not pick up local plugins (files under
`mobile-app/android/` are gitignored build state — re-apply after a fresh
`npx cap add`):

1. `mobile-app/android/settings.gradle`:
   ```
   include ':shop-updater'
   project(':shop-updater').projectDir = new File('../plugins/shop-updater/android')
   ```
2. `mobile-app/android/app/build.gradle`:
   ```
   implementation project(':shop-updater')
   ```
3. `MainActivity.java`: `registerPlugin(ShopUpdater.class)` in `onCreate`
   (before `super.onCreate`), with `import shop.updater.ShopUpdater;`
4. Manifest needs `android.permission.REQUEST_INSTALL_PACKAGES`
   (see `mobile-app/android-manifest-snippet.xml`).
