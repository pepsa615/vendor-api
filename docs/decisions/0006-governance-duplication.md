# ADR 0006: Duplicated governance pack

Governance version: `2026.10.14-m0`

**Status:** Accepted

Because repositories are split, each carries the full governance pack for offline agent discovery. Shared files must remain byte-identical and carry the same version. Local validation checks presence/version and compares the sibling copy when both checkouts are available.
