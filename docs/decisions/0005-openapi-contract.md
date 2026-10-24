# ADR 0005: OpenAPI contract

Governance version: `2026.10.14-m0`

**Status:** Accepted

The backend publishes OpenAPI as the public contract. Frontend stores a reviewed snapshot and generates TypeScript bindings. Breaking changes require explicit versioning/migration; handwritten duplicate network response types are prohibited.
