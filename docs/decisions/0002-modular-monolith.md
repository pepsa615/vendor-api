# ADR 0002: Modular monolith first

Governance version: `2026.10.14-m0`

**Status:** Accepted

Deploy the Vendor API as one NestJS application with enforced bounded modules and ports. This avoids premature distributed operations while preserving extraction seams. Direct cross-module database access and deep imports are prohibited.
