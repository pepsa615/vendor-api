# ADR 0001: Split repositories

Governance version: `2026.10.14-m0`

**Status:** Accepted

Backend and frontend remain independently versioned with separate dependencies and CI. Governance is intentionally duplicated with matching revision stamps and drift validation. API compatibility is managed through a versioned OpenAPI snapshot rather than filesystem imports.
