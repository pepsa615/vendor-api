# ADR 0012: Dashboard, reporting, search, and notifications

Status: Accepted

## Decision

M7 uses tenant-scoped live queries rather than a second analytics store. The dashboard shows active delivery points, active batches, active dispatchers, completed vendor earnings, a status breakdown, and recent deliveries for a selectable range. Reads may be cached for at most 60 seconds.

Operations and settlement reports expose paginated JSON and hardened UTF-8 CSV. Global search covers orders, dispatches, manifests, customers, and dispatchers, and omits categories the actor cannot read.

In-app notifications are persistent, per-user, idempotent, permission-addressed records. The browser polls every 30 seconds. Actionable manifest/order/dispatch events and successful financial events also enqueue transactional email. Email jobs are claimed atomically, retry with bounded backoff, fail terminally after five attempts, and never expose private payloads in errors.

## Consequences

Existing operational and financial tables remain authoritative. M7 adds no warehouse, snapshots, WebSocket transport, or broad tenant notification feed. Reports are limited to operations and settlement data.
