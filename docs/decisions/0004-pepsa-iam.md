# ADR 0004: Pepsa IAM authority

Governance version: `2026.10.14-m0`

**Status:** Superseded by ADR 0007 for the Vendor platform

Pepsa IAM owns credentials and token issuance. Vendor API verifies tokens locally and derives actor/tenant/permissions from validated claims. It never trusts client tenant fields. Sensitive operations additionally require an IAM-backed transaction-PIN verification port.
