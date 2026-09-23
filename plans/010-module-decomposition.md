# Plan 010: Decompose the auth and test-domain god modules

> **Drift check**: `git diff --stat 29563ff..HEAD -- app/server/src/routes/tests app/web/components/tests app/web/lib/auth/server`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 003–009
- **Category**: tech-debt
- **Planned at**: commit `29563ff`, 2026-07-27

## Why this matters

The 2,723-line admin test router owns unrelated domains, while the active
847-line TestRunner owns persistence, timers, telemetry, submission, retakes,
dialogs, and UI. Both are high-churn critical paths; the duplicate Next auth
boundary must also be fully removed after plan 003.

## Current state

- `app/server/src/routes/tests/index.ts` contains topics, tests, question types,
  scoring, questions, import/export, dashboard, and attempts.
- `TestRunner.tsx` mixes state machines and rendering and changed ten times in
  the recent 30-commit window.
- Route precedence and React effect lifecycles make blind extraction unsafe.

## Scope

**In scope**: domain subrouters with unchanged public paths/order; tested
TestRunner hooks/modules with unchanged props/UI; final removal of obsolete auth
implementation proven unused.

**Out of scope**: API redesign, UI redesign, schema changes, behavior changes.

## Steps

1. Run GitNexus context/impact for each extraction target. Add characterization
   tests for route registration/order and TestRunner state transitions first.
2. Split admin router by existing domain boundary, retaining a small composition
   entrypoint and exact middleware/path order.
3. Extract TestRunner session persistence, telemetry, answer state, and submit
   orchestration into focused tested hooks/modules; leave presentation in the
   component.
4. Confirm no caller uses the old Next auth DB/policy code, then remove only the
   exact obsolete files via `codex-trash`.

## Verification

- Public route inventory before/after is byte-for-byte equivalent.
- TestRunner behavior and props remain compatible under characterization tests.
- GitNexus detects only expected test/auth processes.
- `yarn verify` and production build exit 0.

## STOP conditions

- Express route order changes or a route is ambiguous.
- Extracted hooks require changed timing/submission semantics.
- An obsolete auth file still has a live caller.

