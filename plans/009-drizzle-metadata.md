# Plan 009: Restore Drizzle migration metadata continuity

> **Drift check**: `git diff --stat 29563ff..HEAD -- app/server/src/db/schema.ts app/server/drizzle app/server/drizzle.config.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: plans 001, 002
- **Category**: migration
- **Planned at**: commit `29563ff`, 2026-07-27

## Why this matters

The Drizzle journal reaches migration 0020, but the latest committed snapshot is
0015. Future generation can re-emit already-applied objects or produce unsafe
diffs. Metadata must be reconciled against a disposable database, never guessed.

## Current state

- `_journal.json` includes 0016–0020.
- `meta/0015_snapshot.json` lacks later search-document and draft-telemetry
  schema state.
- SQL migrations 0017 and 0019 add objects absent from the latest snapshot.

## Scope

**In scope**: Drizzle schema, SQL migrations, journal/snapshots, disposable-DB
verification and CI drift check.

**Out of scope**: modifying production schema by hand, rewriting applied
migrations, using production credentials.

## Steps

1. Apply the complete migration chain to a disposable PostgreSQL database and
   compare it with `schema.ts`.
2. Use supported Drizzle tooling to restore snapshot continuity without editing
   applied SQL history. Review the generated diff for destructive statements.
3. Add a CI check that applies migrations from zero and confirms a subsequent
   generation has no unexpected diff.

## Done criteria

- [ ] Fresh disposable DB reaches the current schema.
- [ ] A second schema-diff generation is empty/expected.
- [ ] Existing SQL migration checksums/order remain unchanged.
- [ ] `yarn verify` exits 0.

## STOP conditions

- Live schema state is required to resolve ambiguity.
- Tooling proposes drop/recreate or changes an already-applied migration.
- No disposable PostgreSQL environment is available.

