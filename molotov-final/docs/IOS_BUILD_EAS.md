# Build the iPhone app (IPA) from Windows with EAS

**No IPA exists.** Building needs your accounts; I did not and could not build one. The configuration was verified only to the extent that `expo export` produced iOS and Android bundles locally.

You need: a free **Expo account** (expo.dev) and a paid **Apple Developer Program** membership (US$99/yr) for installable IPAs.

## Steps
1. Deploy the API first (`docs/DEPLOY.md`). Edit `mobile/eas.json`: replace `https://REPLACE-WITH-YOUR-DEPLOYED-API-HOST` (preview + production). Production builds **refuse non-HTTPS** URLs.
2. Choose your own unique bundle id (default `com.molotov.wallet` may be taken): set env `MOLOTOV_BUNDLE_ID=com.yourcompany.molotov` in `eas.json`, or edit `mobile/app.json`.
3. Double-click **`BUILD_IPHONE.bat`**. It runs: `eas login` → `eas init` → `eas device:create` (register your iPhone via the link EAS shows; open it on the iPhone) → `eas build --platform ios --profile preview`.
4. EAS asks to sign in to your Apple account and can create certificates/provisioning profiles for you — say **Yes** (that is the guided Apple code-signing).
5. When the build finishes EAS prints an install link/QR. Open it on the registered iPhone (enable Developer Mode: Settings → Privacy & Security).
6. TestFlight/App Store later: `eas build --profile production` then `eas submit -p ios`.

Android APK (no paid account): **`BUILD_ANDROID.bat`**.

## Store-review reality
A wallet that shows balances but moves no real money, labelled sandbox, may be rejected or restricted for store release. Real-money features need the licensing in `docs/GO_LIVE_BLOCKERS.md`.
