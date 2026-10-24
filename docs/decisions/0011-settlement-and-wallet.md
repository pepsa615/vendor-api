# ADR 0011: Settlement, wallet, deferred fees, and transaction authorization

Governance version: `2026.10.21-m6`

**Status:** Accepted

Pepsa Pay is the monetary source of truth for main-wallet and settlement balances, transfers, cash-out, account funding, and value-added services. Vendor stores only opaque Pepsa Pay identifiers, tenant-scoped operational settlement projections, fee receivables, reconciliation state, and audit evidence. Money is represented as minor-unit integers inside Vendor and exact two-decimal strings at the Pay boundary.

Completed own-fleet dispatches create one idempotent rider-fulfilled settlement credit using the immutable dispatch payout snapshot. Customer-link checkout proceeds are credited by Pepsa Pay and projected once from the verified checkout event. Partial or full cash-out moves settled funds to the main wallet through Pepsa Pay.

Pepsa Pay wallets never become negative. An unfunded Runway fee creates an append-only Vendor receivable; general-pool funding remains fail-closed. Receivables are collected oldest-first from later verified inflows. Transaction PINs belong to Vendor identity: only Argon2id hashes are stored, repeated failures lock verification, reset revokes sessions, and successful verification issues a short-lived actor/tenant/purpose-bound single-use challenge.

All financial mutations are tenant-derived, permission checked, idempotent, audited, and reconciled against Pepsa Pay. Provider timeouts never manufacture a successful financial state.
