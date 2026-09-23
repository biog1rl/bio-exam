# Plan 004: Enforce assignment and atomic attempt sessions

> **Drift check**: `git diff --stat 29563ff..HEAD -- app/server/src/routes/tests/public.ts app/server/src/db app/web/components/tests/TestRunner.tsx app/web/lib/tests/api.ts`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 001, 003
- **Category**: security, bug, tests
- **Planned at**: commit `29563ff`, 2026-07-27

## Why this matters

Knowing a published test UUID lets an authenticated but unassigned user start
and submit it. Timed submissions are explicitly accepted without a session;
concurrent starts/submits can create multiple sessions or attempts, and draft
PATCH requests lose fields through an unlocked read-modify-write.

## Current state

- Read routes enforce assignment, but start/draft/submit do not consistently.
- Submit looks up the latest session rather than requiring its ID and accepts a
  missing timed session.
- The browser creates a fresh `clientAttemptId` on every submit call.
- Attempt insert and session completion are separate operations.
- Draft answers/telemetry are merged in memory without lock/version/transaction.

## Scope

**In scope**: public test routes and schemas, session/attempt constraints and
migrations, browser submission API/TestRunner, integration tests.

**Out of scope**: scoring rules, attempt-review presentation, assignment
feature expansion.

## Steps

1. Centralize `assigned-or-currently-privileged` authorization and apply it to
   read/start/draft/submit using current DB permissions.
2. Require explicit `sessionId` on submit; validate test/user/open state.
   Add one-open-session-per-user/test and one-attempt-per-session constraints.
3. Persist one client attempt ID for the full retry cycle. In one transaction,
   claim the exact session, insert/get the attempt, close the session, and clear
   its draft. Preserve idempotent response-loss retry behavior.
4. Make draft answer/telemetry merges atomic using row lock/versioning or
   atomic JSONB operations without last-writer field loss.
5. Add DB-backed concurrency/authorization/time-limit integration tests.

## Done criteria

- [ ] Unassigned users receive 403 on every attempt mutation.
- [ ] Timed submission without the exact open session is rejected.
- [ ] Concurrent starts produce one open session.
- [ ] Concurrent/retried submits produce one attempt and stable response.
- [ ] Concurrent answer+telemetry PATCHes preserve all fields.
- [ ] `yarn verify` and GitNexus change detection pass.

## STOP conditions

- Existing production duplicate/open-session data cannot be migrated
  deterministically; report counts and propose a cleanup policy.
- Atomicity requires changing scoring semantics.

