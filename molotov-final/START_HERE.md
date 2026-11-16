# MOLOTOV — Start Here (Windows, iPhone & Android)

**Status: SANDBOX wallet. Test money only. Not deployed. Not BSP-authorised. No GCash / Maya / GoTyme / QR Ph money moves.**
Real-money send/receive is *prepared* (provider interface, QR Ph inspector, compliance docs) but switched off until a licensed provider is connected — see `docs/GO_LIVE_BLOCKERS.md`.

## Run it on your PC — 3 double-clicks

Install these once: **Node.js LTS** (nodejs.org), **Docker Desktop** (docker.com), and **Expo Go** on your phone (App Store / Play Store).

1. Double-click **`START_BACKEND.bat`** → leave the window open. It starts the database + API.
   Check: open <http://localhost:4000/health> → you should see `"environment":"SANDBOX","realMoneyEnabled":false`.
2. Double-click **`START_MOBILE.bat`** → a QR code appears. Scan it with your phone camera (iPhone) or Expo Go (Android). Phone and PC must be on the same Wi-Fi. Press **w** to use your PC browser instead.
3. In the app: create account **A** and account **B** (use two devices, or one phone + the browser). On A tap *Add Funds* (simulated ₱), then *Send* → B's handle → enter your 6-digit PIN. B sees the money.

Optional: **`RUN_TESTS.bat`** runs all automated tests.

## Run with NO server (standalone) and get a sideloadable IPA
Set `EXPO_PUBLIC_API_URL=local` and the whole sandbox runs inside the app (data stored on the phone). Follow **`docs/SIDELOAD_FREE.md`** to build `Molotov-unsigned.ipa` for free on GitHub and install it with Sideloadly.

## Put it online (HTTPS) and build the iPhone app
- `docs/DEPLOY.md` — host the API + PostgreSQL (Render blueprint included; needs *your* account).
- `docs/IOS_BUILD_EAS.md` — build the iPhone IPA from Windows with EAS (needs a free Expo account + paid Apple Developer account). Double-click **`BUILD_IPHONE.bat`**. Android: **`BUILD_ANDROID.bat`** (free).

## What's inside
| Path | What |
|---|---|
| `backend/` | Node 22 + Express 5 + PostgreSQL API, double-entry ledger, migrations, tests |
| `mobile/` | Expo SDK 58 / React Native app (iOS, Android, web preview) |
| `docs/` | Audit, compatibility matrix, deploy, iOS build, testing results, go-live blockers, compliance checklist |
| `assets/` | Your UI reference and transparent logo (app icons/splash are generated from the logo) |

## Never do this
Never paste real customer data, OTPs, bank/PSP credentials, certificates or signing keys into chat or into the repo. Put them in your host's secret manager.
