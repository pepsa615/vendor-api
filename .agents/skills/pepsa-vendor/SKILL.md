---
name: pepsa-vendor
description: Implement or review the Pepsa Vendor NestJS and React platforms using their governed module boundaries, tenant security, OpenAPI contract, product decision gates, and evidence-based roadmap.
---

# Pepsa Vendor Workflow

Governance version: `2026.10.14-m0`

Read `AGENTS.md`, `ROADMAP.md`, `docs/progress-log.md`, and `ARCHITECTURE.md` before work. Read `docs/product-reference.md` for product behavior, `docs/security.md` for trust-boundary work, and the applicable ADR. The reference PDF never overrides these sources.

## Route work

- Backend feature: confirm its milestone and decisions; define domain types/ports; implement application use cases; add infrastructure adapters; expose a thin validated controller; publish OpenAPI.
- Frontend feature: update the OpenAPI snapshot/client; keep remote state in queries; put workflows in the feature; compose pages from accessible reusable UI; lazy-load its top-level route.
- Frontend UI: search `src/components/ui/index.ts` first and reuse the Pepsa component kit. If a needed state, size, or color is absent, extend the shared component and `/ui-kit` examples with tests; never solve it through feature-local copies or raw substitute controls.
- Persistence: require tenant context, constraints, migration compatibility, transactions/concurrency where needed, and repository tests. Never mutate financial/audit history.
- Integration: define a port first; bound timeouts/retries; preserve idempotency and correlation; keep external shapes in the adapter.
- Security review: test missing/invalid identity, tenant mismatch, object authorization, replay, input abuse, upload abuse, secret/PII leakage, and safe failure.

## Decision and completion rules

Do not implement an unresolved product gate. Record the blocker or add an approved ADR. Do not claim completion from code alone: run `pnpm verify`, capture evidence in the progress log, and update the roadmap only after all exit criteria pass.
