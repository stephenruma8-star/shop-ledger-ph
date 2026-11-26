# Shop Ledger PH — What's New / release notes

One shared changelog powers the **What's New** sheet on both apps. The desktop
and the phone never keep separate copies, so a release only has to be written
once.

## Files

| File | Purpose |
| --- | --- |
| `src/shared/whats-new.json` | The release notes themselves (bilingual). |
| `src/renderer/js/whatsNew.js` | Desktop modal, unseen dot, `slpWhatsNewSeenDesktop`. |
| `src/mobile/whats-new.js` | Phone bottom sheet, header dot + Settings badge, `slpWhatsNewSeenMobile`. |
| `scripts/test-unit.mjs` | Validates the JSON and fails when the current app version has no notes. |
| `scripts/smoke.mjs` | Desktop open → mark-seen regression. |
| `scripts/smoke-mobilepage.mjs` | Phone sheet + unseen badge regression. |

The phone bundles get the JSON injected as `const SHOP_WHATS_NEW = …;` by
`scripts/build-mobile.mjs` and `scripts/build-standalone.mjs`. The desktop
imports it directly through Vite.

## Entry format

```json
{
  "id": "mobile-4.8.61",
  "app": "mobile",
  "version": "4.8.61",
  "date": "2026-12-01",
  "title": {
    "en": "Short summary of the release",
    "fil": "Maikling buod ng release"
  },
  "changes": [
    {
      "type": "new",
      "text": {
        "en": "What changed and why it matters to the shop owner.",
        "fil": "Ano ang nagbago at bakit mahalaga ito sa may-ari ng tindahan."
      }
    }
  ]
}
```

Rules:

- `id` is unique and doubles as the seen marker. Keep the
  `<app>-<version>` convention (`mobile-4.8.61`, `desktop-3.37.39`).
- `app` is exactly `mobile` or `desktop`. The standalone APK uses the
  `mobile` entries.
- `version` must match `mobile-app/package.json` or `package.json` for the
  release that ships it.
- `date` is `YYYY-MM-DD`. The UI sorts newest first, then by version.
- `title` and every `changes[].text` need both `en` and `fil`.
- `changes[].type` is `new`, `improved`, or `fixed` — those drive the colored
  chips.
- Write for a sari-sari store owner: short, plain language, and say what the
  change means for them. Keep the Filipino natural, not a literal translation.

## Adding a release

1. Add the new entry to `src/shared/whats-new.json` (position in the file does
   not matter).
2. Run the unit tests — they fail if the current desktop or mobile version has
   no entry:

   ```powershell
   node scripts/test-unit.mjs
   ```

3. Rebuild the phone artifacts so the JSON is re-injected:

   ```powershell
   node scripts/build-mobile.mjs
   node scripts/build-standalone.mjs
   node mobile-app/scripts/sync-phone-ui.mjs
   ```

4. Run the full suite:

   ```powershell
   npm.cmd test
   ```

Do **not** bump `package.json` / `mobile-app/package.json` or publish a release
just to add notes. Notes are written for the version that is actually shipping.

## Seen state

- Desktop key: `slpWhatsNewSeenDesktop`
- Phone key: `slpWhatsNewSeenMobile`

Both store the `id` of the newest entry for that app. The dot/badge shows while
the stored id differs; opening the sheet marks it seen. There is deliberately
no automatic popup.

## Entry points

- **Desktop:** sidebar **What's New** button with a blue unseen dot.
- **Phone:** header sparkle button (amber dot) and the **What's New** card in
  Settings (NEW badge).

## Guardrails

- The JSON must be a non-empty array, and `scripts/test-unit.mjs` enforces the
  bilingual fields and change types.
- The phone build rejects text containing `</script`.
- After editing any phone source, rebuild the generated files —
  `src/renderer/mobile.html`, `mobile-app/www/app/index.html`, and
  `mobile-app/www/lan/index.html` are checked in.
