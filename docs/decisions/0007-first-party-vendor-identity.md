# ADR 0007: First-party Vendor identity and onboarding

Governance version: `2026.10.16-m1`

**Status:** Accepted; supersedes ADR 0004 for the Vendor platform.

The Vendor API owns human credentials, email verification, refresh sessions, staff invitations, and vendor-scoped roles. Passwords use Argon2id. The API issues short-lived RS256 access tokens and rotates opaque refresh credentials stored only as hashes; browsers keep refresh credentials in secure HttpOnly cookies. Signing and encryption keys are injected secrets.

Vendor approval remains a separate trust domain. The Admin control plane calls `/internal/admin/v1` with its existing 60-second signed actor context. The Vendor API re-authorizes `vendor.businesses.review`, requires reasons and idempotency for decisions, and writes its own append-only audit event.

KYC/KYB objects are private. They enter a Cloudflare R2 quarantine key, pass signature/type/size validation and self-hosted ClamAV scanning, and are promoted only when clean. Production fails closed when signing keys, encryption, R2, or scanning are unavailable.
