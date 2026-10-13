---
phase: 01-verification-baseline
plan: 16
subsystem: testing
tags: [vitest, isolation, tsx, dotenv, d-29, d-02]

requires:
  - phase: 01-verification-baseline
    provides: "01-01 test-database-url.ts guard and BIO_EXAM_ISOLATED_ENV switch in env.ts; 01-03 server Vitest config"
provides:
  - "app/server/src/config/test-database-url.test.ts: table-driven accept/reject regression for assertTestDatabaseUrl, resolveIsolatedDatabaseUrl, withDatabaseName, isIsolatedEnv (34 tests)"
  - "app/server/src/config/env.isolation.test.ts: C4 regression via child process, with a control case (2 tests)"
affects: [yarn verify, 01-08]

actuals:
  tokens: 2500
  tasks: 2
  commits: 0
plan_head_before: 11b291649c54eec9678edf0a441232a92b631197
plan_head_after: 11b291649c54eec9678edf0a441232a92b631197

tech-stack:
  added: []
  patterns:
    - "Child-process regression test: tsx/cli resolved with createRequire, --eval code stubs console.log during import, prints one JSON line of booleans and a path"
    - "Rejection-message tests use conspicuous fake credentials (appuser_zq / pw_s3cret_zq) and assert they never appear in the message"

key-files:
  created:
    - app/server/src/config/test-database-url.test.ts
    - app/server/src/config/env.isolation.test.ts
  modified: []

key-decisions:
  - "The child's console.log is stubbed while env.ts is imported: the control case may load the real app/server/.env, and DEBUG_ENV=1 there makes env.ts print a masked DSN line; only the final JSON line may reach stdout"
  - "Child env sets NODE_ENV=test and deletes DATABASE_URL, TEST_DATABASE_URL, DEBUG_ENV and SUPABASE_* so the production check and inherited values cannot influence the result"

requirements-completed: [VER-05]

coverage:
  - id: D1
    description: "assertTestDatabaseUrl accept/reject table (protocols, hosts incl. 127.0.0.2 and db.example.invalid, database names postgres/prod/Test_x, empty, undefined, malformed), messages free of user and password"
    requirement: VER-05
    verification:
      - kind: unit
        ref: "app/server/src/config/test-database-url.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "resolveIsolatedDatabaseUrl never falls back to DATABASE_URL; withDatabaseName re-applies the guard; isIsolatedEnv true only for '1'"
    requirement: VER-05
    verification:
      - kind: unit
        ref: "app/server/src/config/test-database-url.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Isolation switch: child with BIO_EXAM_ISOLATED_ENV=1 loads no .env (ENV_LOADED_FROM null, SUPABASE_URL unset); same child without it loads a .env (control)"
    requirement: VER-05
    verification:
      - kind: unit
        ref: "app/server/src/config/env.isolation.test.ts"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 16: Regression tests for the D-29 guard and the .env isolation switch Summary

**Two fast Vitest files (36 tests, no database) lock in the `TEST_DATABASE_URL` guard (accept/reject table, no `DATABASE_URL` fallback, no credentials in messages) and prove through a child process that `BIO_EXAM_ISOLATED_ENV=1` stops `env.ts` from loading any `.env`, with a control case showing the same child does load one without the switch.**

## Accomplishments

- `test-database-url.test.ts`: `test.each` tables. Accepts `postgres://postgres@127.0.0.1:5432/test_x`, `postgresql://u:p@localhost/test_bio_exam` and one more. Rejects undefined, empty, whitespace, a non-URL, `mysql:` and `http:`, `db.example.invalid`, `127.0.0.2`, databases `postgres`, `prod`, `Test_x`, `test_`, an empty name and `test_a-b`. A separate table asserts the user and password of the URL under test never appear in the message (four rejection kinds including an unparsable URL). `resolveIsolatedDatabaseUrl` ignores a set `DATABASE_URL` for undefined and empty `TEST_DATABASE_URL`. `withDatabaseName` rejects `prod` and a bad source URL. `isIsolatedEnv` is true only for `'1'`. All calls use explicit env objects; the file has no `process.env.`.
- `env.isolation.test.ts`: temp dir `bio-exam-envtest-*` with a fake `.env`, child `process.execPath tsx/cli --eval` importing `env.ts` by file URL. Isolated child: `envLoadedFrom === null`, `supabaseUrlSet === false`. Control child (flag removed): a non-null string path. The temp dir is removed in `afterAll` (none left in `$TMPDIR`).
- No fix to `test-database-url.ts` or `env.ts` was needed; both tests passed against the 01-01 implementation.

## Verification Results

- `yarn workspace @bio-exam/server vitest run src/config`: 2 files, 36 tests passed (TEST_DATABASE_URL unset, no database).
- `yarn workspace @bio-exam/server typecheck`: exit 0.
- Acceptance greps: `test.each` present; `db.example.invalid`, `127.0.0.2`, `prod` present; `grep "process\.env\." test-database-url.test.ts` prints nothing; in `env.isolation.test.ts` `SUPABASE_URL` appears only inside `Boolean(...)` and the fake `.env` content; it contains `BIO_EXAM_ISOLATED_ENV` and `ENV_LOADED_FROM`.
- Prettier (repo config) applied to both files; both files are LF.
- `yarn workspace @bio-exam/server test` (whole workspace): 7 of 8 files pass; the one failure is `src/db/timestamps.test.ts` (01-05, DB-backed): "needs TEST_DATABASE_URL: run it through with-test-db.mjs". Expected outside the harness and not in this plan's scope.

## Task Commits (ready to commit, not committed)

1. **Task 1**: `test: Тесты защиты TEST_DATABASE_URL и флага изоляции`
   - `app/server/src/config/test-database-url.test.ts` (new)
2. **Task 2**: `test: Регрессионный тест изоляции .env через дочерний процесс`
   - `app/server/src/config/env.isolation.test.ts` (new)

Nothing committed (`commits: 0` measured, HEAD still 11b2916). No other files touched.

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations): the control case may load the real `app/server/.env` on this machine (it exists). The child stubs `console.log` during the import, so the existing `DEBUG_ENV=1` masked-DSN line from `env.ts` cannot reach stdout, and the test never prints child output. No connection is opened (`env.ts` does not import `db`). I did not mutate `env.ts` to watch the isolated case fail; the control case demonstrates the test can detect a loaded `.env`.

## Known Stubs

None.

## Threat Flags

None. T-1-09 mitigation in place: the child prints one JSON line of a path and a boolean.

## Self-Check: PASSED

- Both created files exist; plan verify commands re-run and pass; HEAD unchanged.
