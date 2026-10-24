# Vendor provisioning failure

Trigger: provisioning is non-active for more than 15 minutes.

1. Inspect saga stage, attempt, request ID and classified error.
2. For ambiguous provider outcomes, reconcile Payment resources before retry.
3. Retry only known retryable failures with the existing deterministic idempotency key.
4. Route identity/document mismatch to manual review; do not copy raw documents into Admin.
5. Keep checkout, order intake and new dispatch mutations disabled until all resources are active.

Success: exactly one Payment identity, main wallet, settlement wallet and SVA are active.
