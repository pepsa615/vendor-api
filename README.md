# Pepsa Vendor API

Governance version: `2026.10.14-m0`

Production foundation for the Pepsa Vendor modular-monolith API. Read `AGENTS.md` before contributing.

## Local setup

1. Install Node 24 and pnpm 12.
2. Copy `.env.example` to `.env` and supply local non-production values.
3. Start PostgreSQL and run `pnpm prisma:deploy`.
4. Run `pnpm start:dev`.

The API prefix is `/api/v1`; liveness is `/api/v1/health/live`, readiness is `/api/v1/health/ready`, and optional Swagger is `/docs`.

Run `pnpm verify` before opening a change. Never commit `.env` files or credentials.
