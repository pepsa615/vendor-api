# Product Reference — Vendor Logistics Platform

Governance version: `2026.10.14-m0`

This document normalizes the supplied October 2026 draft. It describes product intent; it does not override user requests, ADRs, security policy, or approved contracts.

## Confirmed product areas

- Dashboard with account-wide operational summaries.
- Operations: active dispatch, delivery history, and inbound assigned manifests.
- Manifest: tracking-ID validation, batching, travel manifests, waybills, and receiving-vendor actions.
- Open Dispatch: vendor fleet assignment, customer-link orders, and Pepsa general rider pool.
- Account: settlement earnings distinct from spendable wallet, cash-out, transfers, statements, and quick services.
- People: dispatcher onboarding/compliance, customers, staff, roles, and invitations.
- Settings: same-city distance pricing, four discount tiers, staff roles, and public business profile.

Core entities are Vendor, Staff/Role, Customer, Dispatcher/Document, Order, Batch, Manifest, WalletTransaction, SettlementEntry, PricingSetting, and DiscountTier. Vendor data is tenant-isolated. Pepsa platform services retain their own authoritative records.

## Business rules requiring formalization

Revenue share is configured per dispatcher; wallet and settlement are different concepts; runway matching has a documented example fee and deferred-balance behavior; general-pool dispatch requires funds upfront; customer-link pricing uses distance, vendor rate, and an applicable tier. Numeric examples in the draft are illustrative until approved as configured rules.

## Suggestions, not commitments

Preview before finalization, shared manifest action audit, negative-wallet warning, discount gap/overlap validation, and starter role templates require product acceptance. Security-driven auditability and unambiguous tier validation may still be architecture requirements without adopting the exact proposed UX.

## Open questions

Do not infer the manifest table/view strategy, manifest statuses, third active-dispatch status, dispatcher table columns, or dashboard widgets. Resolve each through an ADR/product decision before implementation.

## M4 resolved decisions

ADR 0009 resolves manifest storage, views, lifecycle, preview, revision, shared-history, eligibility, and waybill behavior. Dispatch, dispatcher-table, and dashboard questions remain open for their owning milestones.

## M5 resolved decisions

ADR 0010 resolves asynchronous own-fleet and general-pool matching, the dispatch lifecycle, exclusive assignment, optimized route snapshots, payout overrides, signed provider tracking, and the M5-to-M6 finance boundary. ADR 0011 resolves Pepsa Pay ledger authority, settlement triggers, deferred-fee recovery, transaction-PIN security, and reconciliation for M6. Dashboard questions remain open for M7.
