# Code audit — original kit vs. this build

## The original kit (`Molotov_Online_Claude_Kit.zip`) really had
- Express API in **one 69-line file**; Postgres tables created at start-up (no migrations).
- Register/login, a **credit endpoint**, a sandbox send with `Idempotency-Key`, last-50 history, disabled live endpoint.
- Expo **SDK 52** app in **one `App.tsx`** (40 dense lines): login, balance, send, QR show/scan, list.

Defects/gaps found: 12-hour non-revocable JWT, no refresh/logout, no transaction PIN, ledger was a flat `delta` table with a `NULL` counter-account (not true double entry), no DB-level invariants, no tests, no limits, unauthenticated-QR logic trivially blind (`startsWith`), bundled dependencies two major versions old, no EAS variants/HTTPS enforcement, no Dockerfile, no Windows launchers, no screens from the UI reference beyond a basic list.

## What this build contains (verified by running — see `docs/TESTING.md`)
**Backend**: migrations (`001_core`, `002_provider_inbox`); append-only double-entry `journal_lines` with DB triggers that reject unbalanced entries and any UPDATE/DELETE; `balance >= 0` constraint; sandbox-issuer ledger account; atomic transfers with deadlock-safe lock ordering; idempotency (unique per actor+key, replay returns the original); 6-digit transaction PIN with lockout; access (15 min) + rotating refresh tokens with reuse detection; log-out-all; password/PIN change; append-only audit log; rate limits; sandbox limits; read-only admin overview; EMVCo/QR Ph **inspector** (CRC-16 check, never executes); provider interface (`createReceivingIdentifier`, `generateAuthorizedQR`, `resolveQrRecipient`, `initiateFundedTransfer`, `getTransferStatus`, `verifyWebhook`, `reconcileSettlement`) wired to a **Disabled** provider that returns 501; webhook inbox table; config guard that refuses to start in "live" mode.

**Mobile**: onboarding, register/login, animated dashboard (spring bottom nav, animated balance counter, glow), add test funds (marked SANDBOX), send → recipient lookup → review → PIN → processing → success/failure, receipts with share/copy, searchable activity, receive QR, camera QR scanner + photo QR + manual paste, QR Ph inspection screen (blocked), settings (PIN, password, biometrics, sign out everywhere), compliance console (admin, read-only), haptics, reduce-motion support, accessibility labels.

## Not present / not possible here
Real-money anything; KYC/AML; device binding; push notifications; localisation; statements. A physical-device run (camera, Face ID, haptics) was **not** performed — I had no device.
