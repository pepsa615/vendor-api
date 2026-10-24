# Security Standard and Threat Model

Governance version: `2026.10.14-m0`

## Assets and threats

Protect tenant data, dispatcher identity documents, location, IAM tokens, transaction PIN verification, wallet/settlement records, pricing, audit evidence, and integration credentials. Primary threats are cross-tenant access, broken object authorization, replay/double processing, privilege escalation, injection, malicious uploads, credential leakage, supply-chain compromise, denial of service, and sensitive telemetry.

## Required controls

- Verify IAM signature, issuer, audience, expiry, actor, and tenant. Derive tenant server-side and authorize every object/action.
- Require least privilege and step-up PIN verification for sensitive transactions; never store or log a raw PIN.
- Validate and bound all input; use parameterized Prisma access; escape output by context; reject unknown fields.
- Require idempotency and atomic writes where replay or partial failure can cause financial/operational harm.
- Use TLS, encrypted storage, managed secret injection, rotation, short-lived credentials, and explicit CORS origins.
- Redact authorization, cookies, secrets, PINs, identity numbers, private document references, signed URLs, and bank details from telemetry.
- Upload only to private storage after type/size/signature checks and malware scanning; serve short-lived URLs after tenant authorization.
- Apply rate/body/time limits, safe retry policy, dependency/secret scanning, locked installs, reviewed migrations, backups, and restore tests.
- Emit append-only audit events for role, permission, manifest, document, and financial actions with actor, tenant, subject, time, and request ID.

## Response expectations

Revoke exposed credentials immediately, preserve audit evidence, contain affected access, assess tenants/data, communicate through the incident process, and document remediation. Production releases cannot carry unresolved high/critical security findings without explicit accountable acceptance.
