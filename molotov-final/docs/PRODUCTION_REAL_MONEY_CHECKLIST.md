# MOLOTOV — Requirements Before Real Money

This is an integration checklist, NOT proof of license or readiness.

## Legal and regulatory approval
- Incorporate Philippine entity; confirm regulatory fit with Philippine fintech counsel.
- Obtain applicable BSP EMI-NBFI certificate of authority OR operate as an approved program of an appropriately licensed financial partner (with explicit written scope).
- Confirm applicable BSP capital, safeguarding and liquidity requirements, settlement arrangements, and operational readiness reviews.
- AMLC registration and AML/CFT program where applicable, KYC/EDD, screening, reporting and monitoring.
- Implement BSP consumer protection, data privacy and NPC requirements.
- Merchant acquiring may require different approval from P2P e-money issuance; analyze separately.
- Obtain payment network/participant approvals and access to QR Ph/InstaPay rails or approved sponsor arrangements.

## Real-money funding and transfer lifecycle
1. Verify user identity and customer account eligibility.
2. Receive authenticated funding confirmation from authorized partner/bank.
3. Verify settled/pending state and update controlled financial ledger appropriately.
4. Validate payee QR Ph data, provider routing, beneficiary details, sanctions/fraud checks and customer authorization.
5. Reserve amount to prevent overspending; use idempotency.
6. Submit signed payment instruction to approved provider with managed credentials.
7. Accept only cryptographically validated or independently verified response/webhook status; do not equate request acceptance with final settlement.
8. Reconcile provider records against internal journal, settlement statements and safeguarded assets.
9. Handle timeouts, reversals, disputes, refunds and exceptions with compensating journal entries.
10. Inform customers of status accurately, including pending and failed cases.

## QR functionality
- Personal QR Ph issuance requires approved participant/partner capabilities and beneficiary registration.
- Support both P2P and P2M only where approved and technically supported.
- Validate EMVCo payloads, CRC and canonical format, but never treat QR parsing as payment authorization.
- The sandbox QR `molotov-sandbox://pay/<handle>` is only an internal test code.

## Technology and operational minimums
- Independent ledger audits, security audits, penetration tests and external certifications.
- Role-based access with dual control for treasury operations, no arbitrary admin creation of spendable funds.
- HSM/KMS keys, managed secrets, strong identity, device binding, MFA, immutable audit traces.
- Transaction monitoring, limits, on-call incident response, data backups, tested disaster recovery.
- Reliable queues, durable outbox/inbox, idempotency and provider reconciliation.
- Strong customer account security, recovery, privacy and support processes.
- Proper user fee disclosures even if Molotov charges ₱0; platform still incurs operating costs.

## What to request from an approved payment provider
- Official API docs, sandbox access and supported real-money flows.
- Onboarding/underwriting requirements; business authorization and approved program scope.
- QR Ph receive/send support, P2P/P2M capabilities and beneficiary registration workflow.
- Funding/settlement accounts, liquidity thresholds, fees, SLAs and reconciliation file formats.
- Webhook signatures, certificates, transaction status APIs, reversals and disputes.
- Production enablement checklist and certification tests.

**IMPORTANT:** No bank or payment network grants access merely because an app is well-designed or has many users.

## See also
`GO_LIVE_BLOCKERS.md` (what you must supply), `TESTING.md` (what was verified), `DEPLOY.md`, `IOS_BUILD_EAS.md`.
