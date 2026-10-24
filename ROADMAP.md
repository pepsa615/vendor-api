# Pepsa Vendor Delivery Roadmap

Governance version: `2026.10.14-m0`

Statuses: Not Started, In Progress, Blocked, Complete. Evidence belongs in `docs/progress-log.md`.

| Milestone                                 | Status      | Outcomes                                                                                                                                                                       | Exit gate                                                                  |
| ----------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| M0 Foundation and governance              | Complete    | Agent governance, architecture, secure Nest foundation, Prisma, OpenAPI, React shell, Tailwind, lazy routing, CI checks                                                        | Both `pnpm verify` suites pass and evidence is logged                      |
| M1 IAM and vendor administration          | Complete    | IAM session, tenant context, vendor profile, invitations, roles/permissions, privileged audit                                                                                  | Auth/tenant threat tests and role matrix approved                          |
| M2 People                                 | Complete    | Customers, dispatchers, conditional vehicle validation, private documents, Pepsa approval                                                                                      | Upload/security review and approval contract tests pass                    |
| M3 Orders and pricing                     | Complete    | Vendor/customer-link orders, lifecycle, distance pricing, checkout ports                                                                                                       | Pricing boundaries and order state machine approved                        |
| M4 Batching and manifests                 | Complete    | ID validation, batches, manifests, waybills, action history                                                                                                                    | Manifest storage/status decisions resolved                                 |
| M5 Dispatch                               | Complete    | Fleet assignment, customer conversion, general pool, tracking, payout, optimization                                                                                            | Dispatch state machine and concurrency tests pass                          |
| M6 Settlement and wallet                  | Complete    | Ledger, cash-out, wallet views, transfers, fees, reconciliation                                                                                                                | Financial invariants, idempotency, reconciliation and security review pass |
| M7 Dashboard, reporting and notifications | Complete    | Aggregates, reports, search, email, exports, background work                                                                                                                   | Data freshness, privacy and operational SLOs approved                      |
| M8 Production hardening and launch        | In Progress | Monitoring/readiness contracts, runbooks, isolated-key controls and release evidence templates are implemented; live load/security/a11y/DR and staged rollout evidence remains | Release checklist and production evidence approved                         |

## Decision gates

Before the owning milestone begins, resolve: unified versus separate assigned/travel manifest storage; final manifest and dispatch state machines; dashboard widgets; preview-before-finalize; shared manifest audit visibility; negative-wallet warnings; discount-tier validation; and role templates.
