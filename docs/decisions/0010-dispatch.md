# ADR 0010: M5 dispatch lifecycle and integration boundaries

Governance version: `2026.10.14-m0`

**Status:** Accepted

Dispatch uses one tenant-owned aggregate for own-fleet and Pepsa general-pool assignments. Both modes accept riders asynchronously and follow Pending Match, Paired, Picked Up, Delivered, then Completed; Cancelled is terminal. Vendors may cancel only Pending Match. Provider events are signed, replay-safe, append-only, and concurrency checked.

An assignment contains one eligible order or one eligible batch. A batch has one pickup and one or more optimized delivery stops. Active membership is exclusive. Route, fee, revenue-share, and payout inputs are immutable snapshots.

Own-fleet payout is suggested from the dispatcher's approved revenue share and can be overridden as a bulk amount or per-stop amounts. M5 calls a finance reservation port but does not create wallet or settlement records; those remain M6. General-pool funding cannot be deferred. Optimization, provider dispatch, finance, and tracking remain provider-neutral ports with deterministic local adapters until production contracts are approved.

Vendor-created orders remain unpriced at creation. When an order is about to enter General Pool, the operator selects a mobility method and the server obtains the corresponding Open Dispatch quote. A Pending Match own-fleet assignment follows the same pricing step before it can be published. The server debits the tenant's main payment wallet before provider submission, changes the same aggregate to General Pool, removes the fleet assignment, and records an audit/event trail. After publication it cannot be converted back to Runway.

## 2026-10-27 amendment — prepaid multi-order intake

General Pool batches use Pepsa Order's dedicated prepaid batch contract rather than
client-side shipment fan-out. Vendor validates the complete immutable batch before
debit, supplies the Payment authority reference, and stores the returned group as
execution evidence. Stable external references and idempotency keys make retries
value-safe; ambiguous outcomes use inquiry and never blind resubmission. Activation
is bilateral and remains disabled until both deployments advertise support.
