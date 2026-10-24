# Pepsa Vendor Platform Architecture

Governance version: `2026.10.14-m0`

## Context and topology

The vendor platform consists of independently versioned React and NestJS repositories. The browser calls the Vendor API through the Pepsa gateway. Pepsa IAM issues identity; existing Pepsa Order, Payment, route-optimization, storage, tracking, and notification capabilities are external systems behind explicit ports.

The backend owns vendor profiles, staff/roles, customers, dispatcher registrations, batches, manifests, pricing configuration, and vendor-facing workflow state. Shared order/payment truth remains with the owning Pepsa service.

## Backend

The initial deployment is a modular monolith. `core` owns framework infrastructure; `common` owns stable cross-cutting contracts; `integrations` owns external adapters; `modules` owns bounded business capabilities. Inside a module, dependencies point from controllers to application, application to domain ports, and infrastructure toward those ports. Domain code imports neither Nest nor Prisma. Modules communicate through exported application contracts, not tables or deep imports.

PostgreSQL and Prisma provide persistence. Every tenant-owned record carries a tenant key and every repository method requires tenant context. Database constraints back application invariants. Financial/audit histories are append-only. Multi-write invariants use transactions and concurrency controls. The REST surface is `/api/v1`; errors expose stable codes, safe messages, request IDs, and optional safe details.

A module may become a service only after measured scaling, ownership, fault-isolation, or release-independence needs justify extraction. Its existing application contract becomes the service boundary; direct cross-module database access is forbidden so extraction remains possible.

## Frontend

The frontend is feature-oriented: app/providers/router, API boundary, layouts, pages, feature code, shared components, and UI primitives. Each top-level product area is a lazy route. TanStack Query owns remote state; local component state owns transient interaction; context is limited to session and truly global UI concerns. OpenAPI-generated types form the network boundary. Tailwind semantic tokens are the future Figma mapping layer.

`src/components/ui` is the mandatory Pepsa design-system boundary. It owns buttons, button groups, accordions, switches, search, tables, tabs, badges, pills, avatars, skeletons, icons/loaders, dropdowns, list boxes, tags/chips, calendars/date controls, alerts, checkboxes, cards, dialogs, drawers, modals, popovers, toasts, tooltips, and selects. Feature code composes these APIs and must not fork their styling or accessibility behavior. Components expose consistent `sm`/`md`/`lg` sizes and semantic color variants based on the Pepsa brand palette. The lazy `/ui-kit` route is the visual integration reference; approved Figma tokens will map to the semantic CSS tokens rather than replace component contracts.

## Security and operations

Pepsa IAM JWTs are verified against issuer, audience, signature, and required actor/tenant claims. Authorization is enforced server-side with least-privilege permissions and step-up transaction-PIN verification for sensitive finance actions. HTTP protections include an explicit CORS allowlist, security headers, validation with unknown-field rejection, body limits, rate limits, correlation IDs, safe errors, and log redaction.

Private uploads use allowlisted types and sizes, malware scanning, tenant-owned opaque references, encryption at rest, and short-lived authorized access URLs. Services expose liveness/readiness, use structured telemetry, shut down gracefully, and deploy migrations separately before compatible application rollout.

## Contract and data flow

The backend publishes deterministic OpenAPI. The frontend stores a reviewed snapshot, generates TypeScript from it, and CI detects stale artifacts. External integrations apply timeouts, bounded retries only for safe/idempotent work, circuit protection, correlation, and sanitized telemetry. Webhook/event consumers persist an inbox record before processing and handle duplicates safely.
