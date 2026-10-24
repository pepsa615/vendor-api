# Progress Log

Governance version: `2026.10.14-m0`

Append entries; never rewrite historical evidence.

## 2026-10-14 — M0 implementation started

- Status: In Progress
- Scope: governance pack, backend foundation, frontend shell, security baseline, automated quality gates.
- Product source: `Pepsa_Logistis_Platform_Documentation.pdf` treated as a working reference with open questions preserved as decision gates.
- Decisions: split repositories; duplicated revision-stamped governance; modular monolith; PostgreSQL/Prisma; Pepsa IAM; OpenAPI-generated frontend contract.
- Evidence: pending final verification run.

## 2026-10-14 — M0 completed

- Status: Complete
- Backend: governance, Prisma validation/generation, typecheck, lint, architecture boundaries (35 TypeScript files), 4 unit tests, 1 API e2e test, Nest production build, and formatting passed.
- Database: the baseline migration applied successfully to a clean temporary PostgreSQL database; the temporary database was then removed.
- Frontend: governance/contract checks, typecheck, lint without findings, 2 unit/component tests, production build, formatting, and 1 Chromium smoke test passed.
- Bundle: 11 JavaScript chunks; entry chunk 344.51 KiB raw / 108.29 KiB gzip, within the 500 KiB raw and 250 KiB gzip budgets; all lazy chunks remained below 150 KiB gzip.
- Security: production dependency audits reported no known vulnerabilities after patched transitive dependency overrides; no credentials were added to either repository.
- Governance: backend and frontend packs reported the same local checksum and governance version.

## 2026-10-16 — Shared UI kit expanded

- Added the Pepsa red semantic token system and reusable size/state variants.
- Added the governed UI catalog: accordion, switch, search, table, button, tabs, badge, pill, avatar, skeleton, icon/loader, button group, dropdown, list box, tags, chips, calendar, date field/picker, alert, checkbox, card, alert dialog, drawer, modal, popover, toast, tooltip, and select.
- Added the lazy `/ui-kit` visual integration route and required shared-component reuse in agent guidance.
- Evidence: typecheck and lint passed; 6 unit/component tests passed; the production build passed with 14 JavaScript chunks; the lazy UI-kit chunk measured 446.09 KiB raw / 137.52 KiB gzip; bundle budgets passed; and the Chromium catalog interaction test passed. Full-page visual review found no clipping, overlap, hierarchy, or legibility defects.

*

## 2026-10-17 — M1 IAM, onboarding, and vendor administration completed

- Status: Complete
- Identity: first-party Argon2id credentials, short-lived RS256 access tokens and JWKS, rotating hashed refresh sessions, revocation, throttling, email verification, invitations, SMTP outbox, and generic authentication failures.
- Tenant security: authenticated-session tenant derivation, explicit custom-role capabilities, immutable owner authority, server-side authorization, and append-only privileged audit evidence. The approved matrix is recorded in `docs/m1-permission-matrix.md`.
- Onboarding: individual and company paths, repeatable directors and ownership validation, encrypted identity fields, versioned submissions/corrections, approval gating, and approved/rejected/under-review experiences.
- Documents and review: private R2 quarantine, signature/MIME/size validation, ClamAV fail-closed scanning, clean-object promotion, short-lived access, and signed idempotent Admin review APIs.
- Contracts and UI: OpenAPI and frontend types regenerated; API-backed session bootstrap, single-flight refresh, permission-aware shell, staff/role/profile administration, and responsive M1 routes implemented from supplied screen references.
- Verification: backend Prisma validation/generation, typecheck, lint, architecture boundaries (76 TypeScript files), 13 unit/security tests, 1 API e2e test, production build, and dependency/format gates passed. Frontend governance/contract checks, typecheck, lint, 6 unit/component tests, production build, bundle budget, formatting, and 3 Chromium journeys passed.
- External design evidence: supplied PNG references were used. Direct enumeration/export of the Figma yellow-background section remains unavailable until the Figma connector is reauthenticated; no temporary Figma URL is stored in source.

## 2026-10-17 — M2 people completed

- Status: Complete
- Customers: tenant-scoped customer creation, search, list views, contact details, and order-count-ready records.
- Dispatchers: full profile registration, conditional motorized-vehicle validation, guarantor and revenue-share data, summary statistics, searchable table, availability controls, and detail/edit experiences.
- Review lifecycle: immutable dispatcher revisions, draft/submitted/approved/rejected states, correction-field feedback, approved-profile continuity during edits, replacement document uploads, and resubmission.
- Documents and administration: private quarantine uploads reuse the M1 signature/MIME/size, malware scan, clean-object promotion, and audit controls; signed internal Admin review queue/detail/document/decision endpoints are ready for the later Admin roadmap.
- Contracts and UI: Prisma migration, OpenAPI snapshot and generated frontend types updated; permission-aware routes use the reusable Pepsa UI component kit throughout.
- Verification: backend schema validation/generation, typecheck, lint, architecture boundaries (85 TypeScript files), 15 unit/security tests, API e2e, production build, and formatting passed. Frontend governance/contract checks, typecheck, lint, 7 unit/component tests, production build, bundle budgets, and formatting passed.
- Design evidence: the linked yellow Figma section was inventoried and stored under `vendor/design-references/figma`; its available frames do not include M2 People screens, so M2 follows the established vendor visual system. Figma export rate limits allowed the section overview and two exact screen exports; remaining nodes are recorded in the local manifest for later export.

## 2026-10-17 — M3 orders and pricing completed

- Status: Complete.
- Orders: tenant-scoped vendor-direct draft/ready/cancel workflows and paid customer-link pending-payment/pending-acceptance/accept/cancel workflows, with immutable public references, concurrency checks, idempotency, and audit evidence.
- Pricing: versioned price-per-kilometre settings, exactly four continuous metre-based discount tiers, Google server-side geocoding/road distance, same-city enforcement, immutable 15-minute quote snapshots, and exact minor-unit/basis-point calculations.
- Checkout: pre-provisioned Pepsa Payment user mapping through the signed Admin boundary, one-time DVA checkout sessions, public payment status, and timestamped HMAC callbacks with durable replay protection.
- Contracts and UI: Prisma migration, OpenAPI snapshot and generated frontend schema updated; Open Dispatch vendor/customer tabs, Payment Settings, and the public `/order/:slug` quote/checkout journey use the shared component kit.
- Verification: all five migrations applied to a clean temporary PostgreSQL 16 database, which was then removed. Backend governance, Prisma validation/generation, typecheck, lint, architecture boundaries (105 TypeScript files), 20 unit/security tests, API e2e, production build, and formatting passed. Frontend governance/contract checks, typecheck, lint, 7 unit/component tests, production build, bundle budgets, and formatting passed.
- Design evidence: every pending yellow-section export was retried using the authenticated Figma account. Figma returned the Starter-plan MCP call limit; the local manifest records the retry and all pending node IDs, and no substitute images were fabricated.

## 2026-10-18 — M4 batching and manifests completed

- Status: Complete.
- Decisions: ADR 0009 resolves unified manifest storage with separate inbound/outbound views, immutable preview-based finalization and revisioning, the receiving-vendor lifecycle, shared action history, eligibility, and on-demand versioned waybill PDFs.
- Backend: tenant-scoped tracking validation, exclusive immutable batches, manifest revisions, optimistic/idempotent response and transit actions, approved-vendor directory, append-only shared/audit history, PDF waybills, Prisma migration, and OpenAPI endpoints implemented.
- Frontend: responsive Batching and Travel Manifest workflows, Operations Assigned Manifest actions, preview/confirmation, filters and status summaries, revision resend, shared history, permission-aware navigation, and waybill downloads implemented from the supplied Pepsa screen references and shared UI kit.
- Verification: all six migrations applied successfully to a clean temporary PostgreSQL database, which was removed. Backend governance, Prisma validation/generation, typecheck, lint, architecture boundaries (117 TypeScript files), 22 unit/security tests, API e2e, production build, and formatting passed. Frontend governance/contract checks, typecheck, lint, 8 unit/component tests, production build, bundle budgets (32 JavaScript chunks; entry 358.69 KiB raw / 113.40 KiB gzip; UI 436.09 KiB raw / 134.35 KiB gzip), formatting, and the Chromium M4 batch-validation journey passed.

## 2026-10-18 — M5 dispatch implemented; final verification pending

- Status: In Progress.
- Decisions: ADR 0010 resolves asynchronous own-fleet/general-pool assignment, lifecycle, exclusive membership, optimized route snapshots, payout overrides, signed tracking events, and the M5/M6 finance boundary.
- Backend: tenant-scoped dispatch aggregates, preview/finalization, approved fleet eligibility, general-pool funding reservation, immutable payout/fee/route snapshots, optimistic transitions, provider event inbox, append-only history and location points, operational summaries, local provider-neutral adapters, Prisma migration, and OpenAPI endpoints implemented.
- Frontend: Runway Manifest, Customer Orders conversion, Open Dispatch general-pool flow, payout preview/override, Dispatch Activities, Delivery Report, live OpenStreetMap location fallback, status history, generated request types, and a mocked Chromium dispatch journey implemented.
- Evidence: all seven migrations applied to a clean temporary PostgreSQL database, which was removed. Backend `pnpm verify` passed with 130 boundary-checked TypeScript files, 24 unit/security tests, API e2e, build, and formatting. Frontend contract generation/check, typecheck, lint, production build, bundle budget (32 JavaScript chunks; M5 chunks 11.49 KiB and 11.83 KiB raw), and the M5 Chromium journey passed.
- Remaining gate: the standard frontend unit suite is not green on this macOS 12 host using fallback Node 22; unchanged pre-M5 jsdom tests intermittently exceed their existing five-second timeout or fail to start a worker. The repository requires Node 24, whose macOS binary cannot execute on this host. Tests were not weakened, and M5 remains In Progress until `pnpm verify` passes in the supported Node 24 environment.

## 2026-10-19 — M5 dispatch completed

- Status: Complete.
- Final gate: the frontend `pnpm verify` suite passed under Node 24.19.0 without weakening tests or quality controls.
- Frontend evidence: governance and OpenAPI contract checks passed; typecheck and lint reported no errors; all 5 test files and 8 unit/component tests passed; the production build and bundle budget passed for 32 JavaScript chunks; formatting passed. The M5 Open Dispatch and Operations lazy chunks measured 11.49 KiB raw / 4.74 KiB gzip and 11.83 KiB raw / 4.59 KiB gzip.
- Combined evidence: backend `pnpm verify`, seven clean-database migrations, and the Chromium M5 dispatch journey had already passed. The dispatch state-machine, concurrency, contract, migration, frontend, and supported-runtime verification gates are satisfied.

## 2026-10-19 — M6 settlement and wallet completed

- Status: Complete.
- Decisions: ADR 0011 fixes Pepsa Pay as the monetary source of truth, keeps Vendor records operational and append-only, defines rider-completion and customer-checkout settlement triggers, prevents wallet overdraft, collects deferred Runway fees oldest-first, and keeps transaction PINs inside Vendor identity.
- Backend: approved-vendor Pay provisioning, settlement projections and credits, partial/full cash-out, wallet/SVA and statement access, bank enquiry and two-stage transfers, live VAS catalogs/validation/purchases, outstanding fee receivables, reconciliation, purpose-bound single-use PIN challenges, audit evidence, permissions, migration, and OpenAPI contract implemented.
- Frontend: responsive Settlement Ledger and Wallet views, earnings and debt summaries, transaction history, cash-out, Add Funds details, internal/external transfer flows, live airtime/data/electricity/cable catalogs, PIN enrollment/reset/challenges, permission-aware navigation, and retry-safe status presentation implemented.
- Pepsa Pay: idempotent partner settlement credit by external user and immutable source reference added; conflicting replays fail while identical replays return the original result. Existing balance, withdrawal, transfer, deposit, and VAS authorities remain unchanged.
- Verification: all Vendor and Pepsa Pay migrations applied to clean temporary PostgreSQL databases and removed. Vendor backend and frontend verification suites passed, including 24 backend unit/security tests, API e2e, 8 frontend unit/component tests, production builds, bundle/format/contract gates, and the mocked Chromium Account journey. Pepsa Pay lint, 153 tests, and production build passed.

## 2026-10-19 — M7 dashboard, reporting, search, and notifications completed

- Status: Complete.
- Decisions: ADR 0012 defines the operational dashboard, 60-second aggregate freshness, permission-filtered global search, operations and settlement CSV reports, per-user notifications, 30-second polling, and transactional email boundaries.
- Backend: tenant-scoped dashboard aggregates, bounded reporting ranges, paginated JSON reports, formula-safe UTF-8 CSV exports, permission-filtered grouped search, persistent idempotent notifications, permission-derived recipients, and atomically claimed email jobs with bounded retries and terminal failure state implemented. Manifest, paid-order, dispatch, cash-out, and transfer events publish actionable or financial notifications.
- Frontend: responsive dashboard cards, status summary, recent deliveries, date controls, one-minute refresh, debounced global search, notification badge/popover/read actions, 30-second polling, and operations/settlement CSV controls implemented from the supplied Pepsa references and shared UI kit.
- Contracts and persistence: Prisma notification/outbox migration, OpenAPI snapshot, and generated frontend types updated. All nine Vendor migrations applied successfully to a clean disposable PostgreSQL database, which was then removed. Vitest now uses its recommended single-worker VM pool to avoid the documented macOS jsdom startup timeouts without changing test assertions or time limits.
- Verification: backend `pnpm verify` passed with Prisma validation/generation, typecheck, lint, architecture boundaries across 149 TypeScript files, 27 unit/security tests, API e2e, production build, and formatting. Frontend verification passed with governance/contract checks, typecheck, lint, 9 unit/component tests, production build, bundle budget across 29 JavaScript chunks, formatting, and the mocked Chromium M7 journey. The main entry measured 433.19 KiB raw / 137.76 KiB gzip and the dashboard chunk 6.13 KiB raw / 2.45 KiB gzip.

## 2026-10-19 — M7 supplied-screen alignment completed

- Dashboard: rebuilt to match the supplied red-header/left-navigation composition with the insurance banner, four current-activity cards, Dispatch/Order/Revenue views, six-period trend, online dispatchers, top performers, dispatch preview, and overall information.
- Operations: Dispatch Activities and Delivery Report now follow the supplied summary-card, status-radio, table-column, status-color, tracking-action, and report-export hierarchy.
- Backend: dashboard aggregates now expose activity, dispatch/order/revenue overview, trend, online-dispatcher, performer, and overall-information data. Dispatch listing accepts tenant-scoped lifecycle filters and summary supports active/history modes with status counts and earnings.
- Verification: backend `pnpm verify` passed with 27 tests and API e2e. Frontend contract generation/check, typecheck, lint, targeted dashboard test, production build, 30-chunk bundle budget, formatting, and the mocked Chromium M7 journey passed. Two unchanged M2/M4 jsdom tests intermittently exceeded their existing five-second timeouts in the combined suite on this host; assertions and time limits were not weakened.

## 2026-10-20 — Order and Open Dispatch pricing boundary correction

- Vendor-assisted order creation is now deliberately unpriced: it does not request a route quote or collect a mobility method. The public customer checkout remains a separate, optionally mobility-aware paid flow.
- General Pool preview and irreversible Runway-to-Open publication now require mobility selection and obtain the Open Dispatch provider price at that boundary.
- Open Dispatch funding continues through the non-deferred commerce debit against the vendor's main payment wallet before provider submission; settlement funds are not used.
- Made stored order mobility nullable for existing and vendor-created unpriced orders and added the corresponding Prisma migration.

## 2026-10-20 — Dashboard analytics and profile security refinement

- Dashboard: analytics now support 7-, 30-, 90-day and custom ranges; metric changes are calculated against the preceding equal-length period, including negative, unchanged, and newly established values. The custom SVG was replaced with a responsive Recharts area chart, and the overall-information presentation was refined using authoritative API values only.
- Profile: the page now follows the supplied two-column Business Details and Security Settings composition with compact shared UI-kit controls. Existing challenge-based transaction-PIN enrollment/reset is exposed without weakening its email verification flow. Business-logo upload uses private scanned storage, tenant-owned metadata, short-lived retrieval, a schema migration, and audit evidence; initials are derived as the honest fallback when no retrievable logo exists.
- Security: authenticated password change now verifies the current password, stores a fresh Argon2id hash, increments token version, revokes active sessions, and appends an audit event.
- Contracts and verification: OpenAPI and generated frontend types were refreshed. Focused reporting and dashboard regression tests passed; server typecheck, lint, production build, and frontend contract, typecheck, lint, production build, 36-chunk bundle budget, and formatting passed. The full server test command exposed an unrelated pre-existing IAM timing-test failure and was not reported as green.

## 2026-10-20 — Company onboarding registration types aligned with BAS

- Company registration type is now a required shared UI-kit select backed by the six BAS business types: Business Name, Sole Proprietor, Limited Liability, Unlimited Liability, Public Limited Company, and Non-Profit.
- The server now rejects values outside that enum, the registration date uses the shared calendar control, and OpenAPI plus generated frontend contract types were refreshed.
- Server and frontend typecheck/lint, frontend contract validation, and formatting passed.
- All onboarding state fields now use the shared select with the BAS canonical 36-state plus `FCT` list; FCT is presented as “Federal Capital Territory (Abuja)”. The same enum is enforced for company, individual, and director submissions by server validation and the generated contract.

## 2026-10-20 — Operations reports aligned with supplied references

- Dispatch Activities and Delivery Report now follow the supplied summary, filters, compact table, status, report-detail, and item-timeline hierarchy while using authoritative dispatch/order data and approved lifecycle states.
- Dispatch lists support tenant-scoped created-date, own-fleet/general-pool, vendor-direct/customer-link, status, search, and pagination filters. Screenshot-only deadline data was not fabricated because it is not part of the dispatch model.
- A shared accessible Pagination component was added and documented in the UI-kit catalog. OpenAPI and generated frontend types were refreshed.
- Backend and frontend typecheck/lint, backend build, frontend production build and 37-chunk bundle budget, contract validation, and formatting passed.

## 2026-10-20 — Manifest flow aligned with supplied references

- Travel Manifest now presents authoritative inbound/outbound totals, direction filtering, search, pagination, compact route/status tables, and a polished create/revise flow with shared state selects, vendor/batch selection, preview validation, and immutable confirmation.
- Manifest Management now exposes the latest revision’s real parcel rows, destination, event timing, route duration, lifecycle status, action history, revision action, and waybill export. Parcel drill-down uses receiver, payment, fee, address, and dispatch-event data returned by the tenant-scoped detail endpoint; absent timelines remain explicitly unavailable.
- The Nigerian state option list is centralized and reused by onboarding and manifest creation. OpenAPI and generated frontend types were refreshed.
- Focused manifest validation tests, backend/frontend typecheck and lint, frontend production build, 38-chunk bundle budget, contract checks, and formatting passed.
- Create Manifest was further refined into a wide parcel workspace matching the supplied composition: manifest/batch header, route and receiving-vendor sections, single scan/add, bulk edit, live validation totals and rows, clear, revalidate, and remove-invalid/deduplicate actions. Preview remains disabled until entered parcel IDs have a clean authoritative validation result.

## 2026-10-20 — Runway dispatch flow aligned with supplied references

- Runway Dispatch now presents live dispatcher totals and an assignment table using approved tenant-owned dispatcher records, availability, vehicles, locations, and completed-order counts. Unavailable dispatchers cannot be selected and an explicit empty state replaces sample rows.
- The assignment journey now follows the supplied pickup, payment-confirmation, and success hierarchy. Pickup and sender details are read from the authoritative order/batch preview and remain immutable; payout, platform fee, route, funding, and totals use the dispatch preview response rather than placeholder balances or amounts.
- The existing preview-token, idempotency, funding reservation, and asynchronous dispatch lifecycle remain unchanged. The success state displays the public reference returned by dispatch creation.
- Frontend typecheck and lint passed. The focused Chromium runway journey passed after a production build and bundle-budget check, covering dispatcher selection, pickup review, payment confirmation, creation, and returned-reference presentation.
- Follow-up correction: Runway Manifest is now a distinct landing experience rather than opening directly into assignment. It includes shared UI-kit search, created-date and lifecycle filters, tenant-scoped own-fleet summary cards, paginated real assignments, explicit loading/empty/error states, and a real assignment-detail view. “Create Manifest” opens the validated source, dispatcher, pickup, payment, and success workflow in a dedicated workspace.
- The dispatch summary contract now accepts an optional mode scope so Runway analytics cannot include General Pool records. OpenAPI and generated frontend types were refreshed.

## 2026-10-20 — Order intake and Open Dispatch finalization

- Added one quote-first, on-behalf-of-customer order workflow shared by Customer Orders, Runway Manifest, and Open Dispatch. Saved customers can be linked, pricing snapshots are consumed tenant-safely, and created vendor orders are advanced to dispatch-ready state.
- Added price review and irreversible publication of an unpaired Runway manifest to General Pool. General-pool funding is non-deferred and debited before provider submission; the existing dispatch aggregate is converted once and audited.
- Dispatcher intake now records an 11-digit NIN instead of an arbitrary identity type, and create/edit state fields use the canonical Nigerian state selector.
- Fixed role creation and staff invitation form resets by retaining the form element before asynchronous requests.
- Refreshed OpenAPI and generated frontend types. Backend/frontend typecheck, lint, contract, formatting, 9 focused backend tests, and 10 frontend tests passed. The full backend unit run had 27 passing tests and one unrelated IAM signing-authority test timeout on this host.

## 2026-10-20 — Multi-step parcel intake aligned with BAS

- Replaced free-text parcel category with the six canonical BAS reference categories and their descriptions. Added compulsory persisted handling with the six BAS handling modes and server-side enum validation.
- Rebuilt the shared vendor order form as Contacts, Route, Parcel, and Review & Price steps. Runway, Open Dispatch, and Customer Orders inherit the same flow; the public order form also uses the governed category and handling selects.
- Added the order-handling Prisma migration, regenerated OpenAPI/frontend types, and passed Prisma validation, backend typecheck, 5 focused order/pricing tests, frontend typecheck/lint, and all 10 frontend tests.

## 2026-10-20 — Local address-pricing availability

- Added deterministic development/test geocoding and route estimates when `GOOGLE_MAPS_API_KEY` is absent, restoring local quote and order flows without external credentials.
- Production remains fail-closed and requires Google Maps. Local results are explicitly identified with `local:` place IDs and are not presented as production routing evidence.
- Backend typecheck/lint and five focused maps/pricing tests passed.

## 2026-10-20 — BAS last-mile order parity

- Google geocoding now accepts the first valid resolved candidate instead of rejecting otherwise valid addresses when multiple candidates are returned.
- Last-mile orders now require and persist the BAS fulfilment payload: mobility method, category, handling, declared value, dimensions, weight, quantity, description, and package-inspection consent.
- Applied both parcel migrations to the local `pepsa_vendor` database, refreshed OpenAPI/frontend types, and passed seven focused backend tests plus all ten frontend tests.

## 2026-10-22 — M7 documentation audit and notification hardening

- Re-audited M7 against the governed roadmap, ADR 0012, security standard, product reference PDF, and saved dashboard, report, and notification screens. Existing dashboard, reports, CSV hardening, permission-filtered search, notification persistence, and email outbox architecture remain authoritative.
- Closed three audit gaps: global-search input is now capped at 120 characters, initial/revised manifest assignment notifies permission-eligible users at the receiving vendor, and failed wallet transfers enqueue a safe idempotent in-app/email notification without masking the authoritative payment error.
- Regenerated OpenAPI and frontend contract types. Backend `pnpm verify` passed: governance, Prisma validation/generation, typecheck, lint, boundaries across 150 TypeScript files, 30 unit/security tests, API e2e, production build, and formatting.

## 2026-10-22 — Public customer-order link readiness contract

- Extended the tenant-scoped vendor profile response with the vendor public slug, relative public-order path, computed availability, and safe blocker codes.
- Availability now requires an approved vendor, an active pricing configuration containing all four tiers, and an active Pepsa Payment provisioning record with both checkout user and wallet identifiers. Sensitive payment identifiers remain server-only.
- Added service coverage for ready and blocked profiles and refreshed the OpenAPI document. Server `pnpm verify` passed with governance, Prisma validation/generation, typecheck, lint, architecture boundaries, 32 unit/security tests, API e2e, production build, and formatting.

## 2026-10-23 — Vendor–Admin integration foundation

- Replaced lazy wallet creation with an approval-triggered, leased and idempotent provisioning saga. Vendor activation now requires the Payment user, main wallet, settlement wallet and SVA identifiers; account reads no longer create financial resources.
- Added destination-authorized Admin capabilities and typed read models for portfolio, vendor detail, lifecycle, provisioning and fee operations. Admin actor JWTs now use the Vendor audience, replay nonces and route permissions.
- Added versioned fee defaults/overrides, effective intervals, simulation and immutable dispatch snapshots. The historical fixed Runway charge is explicitly retained as `LEGACY_FIXED_2000`.
- Added signed Payment event-envelope ingestion with persistence, deduplication, conflict quarantine and oldest-first partial deferred-fee collection.
- Added a Pepsa Order General Pool adapter using separate credentials, immutable intake data, the Payment debit reference and stable cross-system idempotency. Production startup now fails closed without both Payment and Order relationship credentials.
- Full `pnpm verify` passed: governance, Prisma validation/generation, typecheck, lint, boundaries across 166 TypeScript files, 32 unit/security tests, API e2e, production build and repository formatting.

## 2026-10-23 — Evidence-gated Phase 0–7 closure increment

- Added the versioned Vendor–Admin contract register covering system authority, trust boundaries, provisioning and suspension semantics, fee/reporting rules, retention and the deferred Rider/provider extension contract.
- Propagated signed MFA and approval evidence from Admin and required it again at Vendor for critical lifecycle, Payment-provisioning and fee operations. Mutations now also require correlated request ID, reason and idempotency headers at the destination.
- Replaced the Admin Vendor operations/finance/exceptions/audit/review route shells with typed, allow-listed Vendor read models and human-readable tables.
- Vendor verification passed governance, Prisma validation/generation, typecheck, boundaries across 168 TypeScript files, 36 unit/security tests, API e2e and production build. The final repository-wide format check remains open because `src/common/dto/address.dto.ts` and `src/integrations/maps/maps.service.ts` contain concurrent formatting differences that were preserved.

## 2026-10-23 — Phase 0/1 checkout reconciliation closure increment

- Froze checkout, settlement and dispatch mappings, reconciliation repair limits, error categories, deterministic idempotency scopes and correlation requirements in the Vendor–Admin contract register. Named cross-functional approval and generated-schema review remain external Phase 0 gates.
- Added bounded scheduled inquiry for pending Payment checkouts. Matching authoritative paid/expired/failed states enter the durable Vendor inbox and advance monotonically; vendor, checkout, amount or currency differences are quarantined in an operator-visible reconciliation case.
- Added typed Admin exception presentation and audited reconciliation-case resolution. Raw payloads remain excluded from the Admin UI.
- Verification: Prisma generation, TypeScript checking and all 36 Vendor tests passed. Admin frontend typecheck, all 5 tests and the production build passed. Lost-delivery staging certification and chaos coverage remain Phase 1 gates.

## 2026-10-23 — Owner approval recorded for Phase 0 decisions

- The project owner confirmed approval of the discussed Product, Finance, Security, Operations and Engineering decisions covering ownership, suspension, fees, reconciliation, retention, trust boundaries, SLO direction and implementation contracts.
- The roadmap approval checkboxes and contract approval register now reflect that authorization. Generated OpenAPI/event-schema publication remains the only Phase 0 completion item; staging and production evidence remain independent engineering gates.

## 2026-10-23 — Vendor–Admin Phase 2 and Phase 3 completed

- Phase 2 expanded the capability catalogue and enforces issuer, audience, platform, deploy lane, expiry, nonce, permission and optional vendor resource scope. Typed allow-listed reads, malformed-filter rejection, sensitive-read audit, destination mutation audit, session revocation, dispatch freeze/unfreeze and mutation idempotency are complete.
- Phase 3 added immutable fee assessments, collection portions and compensating adjustments; tiered calculation with explicit rounding and min/max; different-actor approval, scheduling and retirement; Payment-linked reversal; and typed assessed/collected/adjusted/outstanding reporting.
- Database triggers prevent fee-policy content rewrites and overlapping active/scheduled intervals. All 17 migrations applied to a clean disposable PostgreSQL database and the overlap invariant rejected a conflicting policy.
- Verification passed: Vendor typecheck, 20 test files/52 tests, API e2e, production build and formatting; Admin backend 46 tests and production TypeScript build. Live financial certification remains Phase 7.

## 2026-10-23 — Vendor–Admin Phase 4 and Phase 5 completed

- Added a fail-closed Admin Vendor adapter catalogue covering the Phase 4 set of 26 read and mutation operations with explicit permission, risk, approval and retry policy. Phase 6 later extends the catalogue to 29 with performance, correlation and operational-health reads. Capability drift, unknown operations, wrong methods and missing critical-action evidence fail before destination execution.
- Completed typed Admin workflows for vendor lifecycle and session controls, onboarding review, provisioning recovery, reconciliation resolution, delivery replay, fee creation/activation/retirement and fee simulation. Protected actions collect a business reason and use MFA plus dual approval where critical.
- Added bounded formula-safe Vendor directory export and retained explicit loading, empty, error, freshness and classification presentation without raw JSON.
- Verification passed: Admin backend 51 tests and build; Vendor 20 test files/52 tests and build; Admin frontend 5 component tests, lint and production build; Chrome Playwright suspension, fee approval, review and replay workflows. Live deployment certification remains Phase 7.

## 2026-10-24 — Vendor–Admin Phase 6 completed; Phase 7 readiness started

- Added bounded live-source KPI time series and per-vendor performance with source, `asOf`, watermark, timezone, currency, freshness, classification and data-quality metadata. GMV excludes null-priced orders and exposes the unpriced count; Payment remains authoritative for received value.
- Added vendor-scoped exact correlation search and operational alert evaluation for provisioning age, reconciliation variance, receivable age, stuck lifecycle, provider delay, callback lag and terminal outbox growth. Every alert links to an operator runbook and all alert branches are exercised in tests.
- Published the API/read-model scaling decision, seven recovery/key-rotation runbooks and a signed Rider/provider event schema covering sequence, POD, failed attempt, RTO, location consent and offline recording.
- Phase 7 repository readiness now includes fail-closed deploy-lane and relationship key-ID configuration, an enablement/rollback checklist and a structured pilot evidence template. Real infrastructure, drills, certification traffic, canary reconciliation and cross-functional production sign-off remain external evidence gates and are not marked complete.
- Verification: Vendor 20 test files/54 tests and production build passed; Admin backend 51 tests and build passed; Admin frontend 5 tests, lint and production build passed. OpenAPI was regenerated.
