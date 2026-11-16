# MASTER PROMPT FOR CLAUDE — MOLOTOV ONLINE WALLET

You are a senior fintech architect, React Native engineer, backend engineer, UX designer, payments integration specialist and security auditor.

I uploaded a ZIP named `Molotov_Online_Claude_Kit.zip`. Treat its contents as an existing codebase to inspect, run, debug, enhance and deploy (with my explicit authorization). Use `assets/Molotov_UI_Reference.png` as the reference, `assets/Molotov_Logo_Transparent.png` as the exact app logo, and `START_HERE.md` as the starting instructions.

## Goal
Build **Molotov** — premium dark-mode (#090909) with neon-lime (#CCFF00) accents — as a genuinely networked mobile wallet with interactive UI, native QR scanner, user login, account profiles, realistic transaction status, receipt history and the ability to transfer simulated balances end-to-end between different real test-user accounts on the online backend.

I ultimately want real-money send/receive and personal QR Ph codes across eligible GCash, Maya and GoTyme flows, with ₱0 Molotov user transaction fees where commercially viable. That future ability is subject to authorization and integration with licensed institutions and networks, and must NOT be falsely represented as functional today.

## Required immediate work
1. Inspect EVERY file and present a concise code audit (do not pretend functionality is present if missing).
2. Upgrade dependencies to a presently supported Expo SDK and Node LTS, preserving the ability to build on Windows using EAS for iOS.
3. Fix runtime, typing, dependency and schema issues; test a full sender-to-recipient sandbox transfer with two user accounts.
4. Produce an elegant, lively interface aligned with the supplied UI reference: dark backgrounds, glowing lime accents, animated counters, smooth card transitions, haptics, loading/error states, spring bottom navigation, accessibility and reduce-motion support.
5. Keep backend as the source of truth, authenticate all money endpoints, make transfers atomic/idempotent, and add functional tests for concurrent sends, retry, insufficient funds and double-entry journal balancing.
6. Strengthen authentication and dev security without claiming the sandbox meets production financial security requirements.
7. Add robust QR scanning: keep `molotov-sandbox://` receive codes for internal demo payments; independently parse/inspect QR Ph payloads where standard and clearly block execution of any real bank transfer until authorized credentials and supported integration exist.
8. Implement backend deployment scripts and instructions for a user-selected HTTPS host with PostgreSQL. Do not claim deployment until you actually have credentials, deploy, and verify public HTTPS endpoints.
9. Set up Expo EAS Build configuration for iOS IPA cloud builds from Windows; guide the user through Apple code signing. Do not say an IPA exists unless successfully built.
10. Create a full licensing and PSP partner integration checklist, taking account of Philippine BSP requirements for EMI-NBFI authorization, AML/CFT, privacy, e-money safeguarding and settlement operations.

## Real-money transfer production architecture
Build a **provider interface** that is not enabled until a legitimate licensed provider is connected:
- `createReceivingIdentifier(user)`
- `generateAuthorizedQR(user, type)`
- `resolveQrRecipient(payload)`
- `initiateFundedTransfer(user, recipient, amount, idempotencyKey)`
- `getTransferStatus(providerReference)`
- `verifyWebhook(signature, payload)`
- `reconcileSettlement(fileOrProviderFeed)`

Use only documented, legitimate APIs and official onboarding processes. NO invented bank credentials, endpoints, unauthorized token creation, payment network spoofing, or fabricated confirmation messages. No arbitrary production wallet credit creation; production balances must reflect verified funding and valid regulated operations. No sandbox-to-production value transfer.

## UI screens
- Splash / onboarding
- Registration / login
- Animated wallet dashboard
- Test balance generator (clearly marked SANDBOX ONLY)
- Send / receive
- QR scanner and QR viewer
- Recipient confirmation and review
- Payment processing and verified success/failure states
- Searchable activity and receipts
- Account security/settings
- Back-office compliance/admin scaffolding (read-only demo where appropriate)

## Outputs to provide
- Updated complete runnable codebase, not just snippets
- Clear setup guide for Windows and iPhone
- Database schema and migrations
- Test suite and results (report what truly ran)
- Online deployment instructions and environment variables
- Version compatibility matrix
- App icons/splash screen based on supplied transparent PNG
- Release checklist and unresolved go-live blockers
- Signed installable IPA only if build environment, Apple developer signing and actual successful export permit it

First: inspect the attached assets and code, run local checks when possible, explain what is implemented already, and then systematically improve the app. Do not request live banking secrets in chat.
