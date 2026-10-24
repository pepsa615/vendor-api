# Relationship signing-key rotation

1. Create a new key in the secret manager for one relationship and deploy lane only.
2. Publish its key ID while retaining the previous verification key for the overlap window.
3. Send and verify a signed non-financial probe, then a controlled callback.
4. Promote the new signer, observe failures, and independently revoke the old key.
5. Record request IDs, timestamps and owners. Never log key material.

Rollback: restore the previous signer during overlap. Do not reuse a key across Admin→Vendor, Vendor→Payment, Payment→Vendor, Vendor→Order or Order→Vendor.
