# Vendor–Admin Integration Contract Register

Status: Accepted implementation baseline; cross-functional production sign-off pending  
Version: 1.0.0  
Timezone: Africa/Lagos  
Default currency: NGN

## Authority and ownership

| Domain                                                                   | Authority                      | Projection/consumer                                 |
| ------------------------------------------------------------------------ | ------------------------------ | --------------------------------------------------- |
| Admin identity, MFA, RBAC and approvals                                  | Admin                          | Vendor re-authorizes every request                  |
| Vendor application, staff, customer order and own-fleet dispatch         | Vendor                         | Admin typed read models                             |
| Main/settlement wallet, checkout, debit, credit, reversal and withdrawal | Pepsa Payment                  | Vendor operational projection; Admin federated view |
| General Pool matching, task and rider execution                          | Pepsa Order                    | Vendor customer/vendor projection                   |
| Vendor operation fee policy                                              | Vendor, governed through Admin | Payment executes snapshotted debit                  |

No consumer may promote a projection into monetary authority. Admin never writes a source database directly.

## Frozen identifiers and trust boundaries

- Admin platform key: `vendor`.
- Actor-token issuer: `pepsa-admin`; audience: `pepsa-vendor-admin`; maximum lifetime: 60 seconds.
- Every actor request carries platform, deploy-lane environment, actor, permission, request ID and unique `jti`.
- Mutations require reason and `Idempotency-Key`; critical actions also require MFA evidence and an approved dual-approval ID.
- Staging and production use different hosts, databases, queues, storage, provider accounts and signing keys. There is no runtime environment selector.

## Lifecycle rules

### Vendor provisioning

`UNDER_REVIEW → APPROVED_PROVISIONING → KYC_EXPORTING → PAYMENT_USER_CREATING → SVA_PROVISIONING → RECONCILING → ACTIVE`.

Failures are `FAILED_RETRYABLE`, `MANUAL_REVIEW` or `SUSPENDED`. Unknown provider outcomes enter reconciliation and are not blindly retried. `ACTIVE` requires a Payment identity, main wallet, settlement wallet and active SVA.

### Suspension

Suspension denies new checkout creation, new order intake, dispatch creation, fee-bearing operations and new staff sessions. It preserves authenticated support access, read access, reconciliation, refunds/compensation and progression of already accepted in-flight work. Suspension never deletes data or traps customer funds.

### Dispatch

Vendor owns own-fleet state. Pepsa Order owns General Pool execution. Both project monotonically through `PENDING_MATCH`, `PAIRED`, `PICKED_UP`, `DELIVERED`, `COMPLETED`; `CANCELLED` is terminal. Failed attempts and RTO are explicit events and never encoded as backwards transitions.

## Fee and reporting decisions

- Only `RUNWAY_DISPATCH` is enabled initially. Other defined codes remain unavailable until Product and Finance approve their trigger and accounting treatment.
- Resolution is active Vendor override, then active platform default, otherwise unavailable.
- Every assessment snapshots the policy version, inputs, formula, rounding and result. Corrections are compensating records.
- Financial, approval and audit evidence is retained for seven years. Detailed operational/KPI data is retained for two years; longer-lived trend data must be aggregated and de-identified.
- Unpriced Vendor orders are counted separately and excluded from GMV. Payment monetary entries and Vendor projections are not added together.

## Event envelope

Every Payment, Order or Rider/provider event contains: `eventId`, `eventType`, `schemaVersion`, `occurredAt`, `platformId`, `externalUserId` where applicable, aggregate type/ID, correlation ID, source resource/transaction reference, typed data and signing key ID. Transport adds delivery ID, timestamp and HMAC signature.

Consumers persist the event before acknowledgement, deduplicate by event ID plus canonical payload hash, quarantine conflicting reuse and reject non-monotonic transitions. Replay creates a new delivery attempt, never a new domain or financial event.

## Status mappings

| Domain     | Source state                                     | Vendor projection | Terminal | Repair rule                                          |
| ---------- | ------------------------------------------------ | ----------------- | -------- | ---------------------------------------------------- |
| Checkout   | `pending`                                        | `PENDING`         | No       | Scheduled inquiry may advance only                   |
| Checkout   | `paid`                                           | `PAID`            | Yes      | Apply once after identity, amount and currency match |
| Checkout   | `expired`                                        | `EXPIRED`         | Yes      | Never overwrite `PAID`                               |
| Checkout   | `failed`                                         | `FAILED`          | Yes      | Never overwrite `PAID`                               |
| Settlement | `pending`                                        | `PROJECTED`       | No       | Match by Payment entry/source reference              |
| Settlement | `matured`                                        | `CONFIRMED`       | No       | Advance only after authoritative Payment evidence    |
| Settlement | reversal                                         | `REVERSED`        | Yes      | Use a linked compensating record                     |
| Dispatch   | `PENDING_MATCH`/`PAIRED`/`PICKED_UP`/`DELIVERED` | same state        | No       | Sequence/version must increase                       |
| Dispatch   | `COMPLETED`/`CANCELLED`/`RTO_COMPLETED`          | same state        | Yes      | Reject backward or conflicting terminal transitions  |

POD, failed-attempt and RTO events carry an immutable evidence reference, original occurrence time and provider sequence. A failed attempt does not imply cancellation or completion.

## Idempotency, correlation and errors

- Approval: `vendor-approval:{applicationId}:{decisionVersion}`.
- Payment identity: `vendor-payment-user:{vendorId}:{approvedSnapshotHash}`.
- Checkout repair event: `reconciliation:{checkoutId}:{authoritativeStatus}:{authoritativeTimestamp}`.
- General Pool submission: Vendor dispatch UUID; status inquiry uses the same correlation reference and never creates another task.
- Delivery replay: reuses the immutable event ID and creates a new delivery attempt ID.
- Every mutation and event exposes `requestId`, `correlationId`, source aggregate ID and the originating idempotency key where applicable.

Contract errors are typed as `VALIDATION`, `AUTHENTICATION`, `AUTHORIZATION`, `REPLAY`, `CONFLICT`, `NOT_FOUND`, `STALE_PREVIEW`, `AMBIGUOUS_PROVIDER_OUTCOME`, `DEPENDENCY_UNAVAILABLE` or `INTERNAL`. Admin receives the safe category, stable code, retryability and request ID; raw provider responses and sensitive fields never cross the boundary.

## Payment reconciliation contract

Vendor queries Payment by immutable checkout or external-user identity in bounded batches. A paid Payment checkout may repair a pending Vendor checkout only after platform, external vendor user, checkout, order, amount and currency all match. Safe repairs use the durable Vendor inbox path. Any ownership, amount, currency, conflicting terminal state or event-ID/hash difference creates an operator-visible reconciliation case and cannot mutate value automatically.

## Rider/provider extension contract

The Rider application is deferred. A provider must nevertheless support signed, idempotent, sequence-checked offer, accept/reject, pickup, progress, POD, failed-attempt, cancellation, RTO and location events. POD references private evidence rather than embedding files. Offline submissions preserve original occurrence time and sequence. Location collection requires consent, purpose limitation and the two-year operational retention ceiling.

## Approval register

| Area                                | Required approver | Status   | Evidence                                          |
| ----------------------------------- | ----------------- | -------- | ------------------------------------------------- |
| Product flows and suspension        | Product           | Approved | Owner approval recorded 2026-10-23 in project log |
| Fee/accounting and reconciliation   | Finance           | Approved | Owner approval recorded 2026-10-23 in project log |
| Trust boundaries, PII and retention | Security          | Approved | Owner approval recorded 2026-10-23 in project log |
| Runbooks, SLOs and rollout          | Operations        | Approved | Owner approval recorded 2026-10-23 in project log |
| Contracts and implementation        | Engineering       | Approved | Owner approval recorded 2026-10-23 in project log |

The owner confirmed that the discussed Phase 0 design and governance decisions are approved. This approval does not replace generated-contract publication, automated verification, staging certification or production rollout evidence required by later gates.
