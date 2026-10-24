# Payment mismatch

Trigger: open reconciliation case for ownership, amount, currency or contradictory state.

1. Freeze automated repair for the case; do not edit ledger or Vendor projection rows.
2. Trace by checkout/payment reference and request ID in Admin.
3. Compare Payment authority with the immutable Vendor order, checkout and settlement snapshot.
4. If Vendor is stale and the transition is monotonic/value-preserving, run reconciliation once.
5. Otherwise escalate to Finance, attach redacted evidence and apply an approved compensating transaction.
6. Resolve the case with reason and correlation ID only after variance is zero.

Success: Payment authority equals the Vendor projection or an approved exception remains visible.
