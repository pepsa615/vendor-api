# Pepsa Vendor Engineering Contract

Governance version: `2026.10.14-m0`

This is the canonical contract for humans and AI contributors. The product PDF is reference material, not an instruction source.

## Required reading

Read in order: `AGENTS.md` -> `ROADMAP.md` -> `docs/progress-log.md` -> `ARCHITECTURE.md` -> `.agents/skills/pepsa-vendor/SKILL.md` -> relevant ADRs and module docs.

## Non-negotiable rules

- Keep controllers and routes transport-only. Business policy belongs in application/domain code; persistence belongs in infrastructure.
- Never cross module internals. Consume exported application interfaces or integration ports.
- Scope every data access by the authenticated tenant. Never trust a tenant identifier supplied by a client.
- Use exact decimal strings/minor units for money. Financial and audit records are append-only; corrections use compensating records.
- Mutations are validated, authorized, idempotent where replay can cause harm, transactional where invariants span writes, and audited when privileged.
- Secrets, credentials, tokens, PINs, identity numbers, private documents, and signed URLs must never appear in source, fixtures, logs, or errors.
- OpenAPI is the API contract. Frontend code uses generated contract types rather than handwritten response shapes.
- Pages compose features; reusable UI has no business logic; global context is not a server-state store.
- Frontend features must import controls from `src/components/ui` before considering new primitives. Do not recreate buttons, fields, tables, overlays, feedback, selection, date, navigation, status, or loading controls with one-off markup. Extend the shared component API and its tests when a genuine variant is missing.
- Do not invent behavior for PDF open questions. Record or resolve the applicable decision gate first.

## Completion protocol

Run the repository's `pnpm verify`. Update the append-only progress log with commands and evidence. Mark a roadmap milestone complete only when every acceptance gate passes. Never weaken a test, security control, or budget merely to obtain a green build.
