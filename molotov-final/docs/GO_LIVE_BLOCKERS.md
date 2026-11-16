# What still blocks real money (and what you must supply)

Everything below is **outside this codebase**. Nothing here can be solved by more code alone.

## A. Licence / approval (you)
| Need | Why |
|---|---|
| BSP authority to issue e-money (EMI-NBFI) **or** a written programme agreement with an already-licensed EMI/bank | Holding customer balances and moving them is a regulated activity in the Philippines. Confirm the exact route with Philippine fintech counsel. |
| AMLC registration, AML/CFT programme, KYC/EDD, sanctions screening, reporting | Required before onboarding real users. This build has **no KYC**. |
| Data Privacy Act / NPC registration, consumer-protection & complaints process | Required for real customer data. |
| Safeguarding / settlement account arrangements | Customer funds must be held and reconciled per BSP rules. |

## B. Provider credentials & approval (you)
- A **licensed payment partner / PSP / bank** that offers documented APIs for: funding, payouts to GCash/Maya/GoTyme/bank accounts (typically via InstaPay/PESONet rails), and **personal QR Ph** issuance. My understanding is that GCash, Maya and GoTyme do **not** offer open consumer P2P APIs to arbitrary apps; access is via partner/PSP agreements — confirm directly with each.
- Sandbox + production API keys, webhook signing secrets, IP allow-lists, certification tests, fee schedule, SLAs, reconciliation file format. Store in the host's secret manager; **never** paste them in chat.
- Then implement one adapter against `backend/src/providers/interface.js` and register it in `providers/index.js`. Until then the server **refuses** `SANDBOX_MODE=false`.

## C. Engineering still required after (A)+(B)
Real-money ledger accounts (customer funds, safeguarding, provider settlement, fees) separate from the sandbox issuer; **delete the sandbox credit endpoint from production builds**; reservation → provider submit → verified-webhook completion state machine; reversals/refunds/disputes; reconciliation jobs (helper stub exists); KYC flow; device binding/MFA; fraud rules; admin dual-control; observability; backups/DR; independent security audit + penetration test + ledger audit.

## D. Deployment & distribution (you)
Cloud account to host the API + Postgres (`docs/DEPLOY.md`); Expo + Apple Developer accounts for the IPA (`docs/IOS_BUILD_EAS.md`); a unique bundle id; App Store review.

## E. Zero Molotov fee — is it viable?
Molotov can charge users ₱0 (the UI already shows ₱0.00 fee), but **third parties may still charge Molotov** (partner/PSP per-transaction fees, InstaPay/QR Ph participant fees, cash-in/cash-out costs, compliance, hosting). Sustainable zero-user-fee models, **to be validated with your partner and a finance model**: partner-funded/sponsored programme, merchant-side revenue (P2M), float/interest income where permitted, premium tiers for businesses. I have not seen any provider's price list, so I make no claim that it is currently viable.
