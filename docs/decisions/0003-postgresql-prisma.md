# ADR 0003: PostgreSQL and Prisma

Governance version: `2026.10.14-m0`

**Status:** Accepted

Use PostgreSQL for relational integrity and Prisma for schema, migrations, and infrastructure repositories. Repositories require tenant context. Exact money representation, append-only histories, database constraints, transactions, and concurrency controls remain domain requirements beyond ORM defaults.
