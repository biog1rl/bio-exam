---
phase: 01-verification-baseline
plan: 03
subsystem: testing
tags: [vitest, turbo, rbac, server, test-port, isolation]

requires:
  - phase: 01-verification-baseline
    provides: "01-01 BIO_EXAM_ISOLATED_ENV switch and guard; 01-02 vitest 5.0.3 / vite 8.3.2 installed in server and rbac"
provides:
  - "app/server/vitest.config.ts: node env, include src/**/*.test.ts, test.env BIO_EXAM_ISOLATED_ENV=1 (D-29)"
  - "4 server test files ported to Vitest with unchanged assertions (45 tests), no database needed"
  - "packages/rbac Vitest config and smoke test (14 runtime exports + one behavioural check)"
  - "turbo.json test task (cache false, dependsOn ^build) and globalPassThroughEnv TEST_DATABASE_URL, BIO_EXAM_ISOLATED_ENV; root yarn test"
affects: [01-04, 01-05, 01-06, 01-10, 01-16]

actuals:
  tokens: 14000
  tasks: 3
  commits: 0
plan_head_before: 11b291649c54eec9678edf0a441232a92b631197
plan_head_after: 11b291649c54eec9678edf0a441232a92b631197

tech-stack:
  added: []
  patterns:
    - "Port pattern: keep node:assert/strict, wrap each original top-level scenario in its own test(); PASS-line removal not needed (originals had none)"
    - "vi.mock('../../db/index.js', () => ({ db: {} })) for modules that only import db at module level; never a dummy DATABASE_URL"
    - "Server Vitest config forces isolated mode for every worker"

key-files:
  created:
    - app/server/vitest.config.ts
    - packages/rbac/vitest.config.ts
    - packages/rbac/src/index.test.ts
  modified:
    - app/server/package.json
    - app/server/src/lib/tests/question-type-resolver.test.ts
    - app/server/src/lib/tests/scoring.test.ts
    - app/server/src/lib/tests/telemetry.test.ts
    - app/server/src/schemas/tests.test.ts
    - packages/rbac/package.json
    - turbo.json
    - package.json

key-decisions:
  - "Scenario granularity: scoring 29 tests (one per original const scenario), schemas 13 (a scenario's follow-up chunks, e.g. hasQuestionsIssue, stay in the same test), resolver 2, telemetry 1"
  - "Shared module-level constants (builtinTypesMap, basePayload, question fixtures) stay at module level; they are never mutated, so no state leaks between test blocks"
  - "rbac smoke test uses vitest expect (not node:assert) because it is a new file, not a port"

requirements-completed: [VER-01, VER-02, VER-05]

coverage:
  - id: D1
    description: "Server Vitest config with isolation flag; 4 ported server test files run under it without a database"
    requirement: VER-01
    verification:
      - kind: other
        ref: "yarn workspace @bio-exam/server test -> 4 files, 45 tests passed, exit 0, TEST_DATABASE_URL unset"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ported assertions are unchanged (D-08): assert count before/after equal; whitespace-insensitive diff shows no changed original line"
    requirement: VER-02
    verification:
      - kind: other
        ref: "grep -c 'assert\\.' HEAD vs working tree: 2/2, 35/35, 1/1, 17/17; normalized diff of non-wrapper lines = 0"
        status: pass
    human_judgment: true
    rationale: "Prohibition 'no assertion meaning changed' is verification: judgment; the mechanical diff supports it but a reviewer should skim the git diff"
  - id: D3
    description: "rbac smoke test, turbo test task fans out uncached with env passthrough, root test script"
    requirement: VER-05
    verification:
      - kind: other
        ref: "yarn workspace @bio-exam/rbac test (1 file, 2 tests); yarn turbo run test --filter=@bio-exam/server --filter=@bio-exam/rbac --only -> 2 successful, 0 cached"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 03: Vitest in server and rbac, four ported server tests, Turbo test task Summary

**Vitest 5.0.3 now runs the four tracked server test files (45 tests, assertions verbatim, no database) under a config that forces `BIO_EXAM_ISOLATED_ENV=1`, rbac gets a 14-export smoke test, and `turbo run test` fans out uncached with `TEST_DATABASE_URL`/`BIO_EXAM_ISOLATED_ENV` passed through.**

## Performance

- **Duration:** about 8 min
- **Completed:** 2026-10-03
- **Tasks:** 3/3
- **Files:** 3 created, 8 modified

## Accomplishments

- `app/server/vitest.config.ts`: `include: ['src/**/*.test.ts']`, `environment: 'node'`, `env: { BIO_EXAM_ISOLATED_ENV: '1' }`. No `globals`, no `passWithNoTests`, no globalSetup.
- Four server files ported. `question-type-resolver.test.ts` mocks `../../db/index.js` with `{ db: {} }`; no file sets or reads `DATABASE_URL` (`grep -l DATABASE_URL` prints nothing).
- `packages/rbac/src/index.test.ts` asserts `Object.keys(rbac).sort()` equals the sorted 14 names and `can(buildPermissionSet(['admin']), 'users', 'read') === true`.
- `turbo.json`: `globalPassThroughEnv` and `test` task; root `package.json`: `"test": "turbo run test"`; `test` scripts in server and rbac.

## Assertion counts (`assert.` calls, HEAD vs ported)

| File | Before | After | Tests |
|------|--------|-------|-------|
| `app/server/src/lib/tests/question-type-resolver.test.ts` | 2 | 2 | 2 |
| `app/server/src/lib/tests/scoring.test.ts` | 35 | 35 | 29 |
| `app/server/src/lib/tests/telemetry.test.ts` | 1 | 1 | 1 |
| `app/server/src/schemas/tests.test.ts` | 17 | 17 | 13 |

A whitespace-insensitive diff of HEAD against each ported file (ignoring only imports, `test(`/`})` wrappers, `vi.mock` and added comments) shows 0 differing lines. The originals contained no `console.log('PASS ...')` lines, so none were removed.

## Verification Results

- `yarn workspace @bio-exam/server vitest run src/lib/tests/question-type-resolver.test.ts src/lib/tests/scoring.test.ts`: 2 files, 31 tests passed.
- `yarn workspace @bio-exam/server test`: 4 files, 45 tests passed (TEST_DATABASE_URL unset).
- `yarn workspace @bio-exam/rbac test`: 1 file, 2 tests passed.
- `yarn turbo run test --filter=@bio-exam/server --filter=@bio-exam/rbac --only`: `@bio-exam/server#test` and `@bio-exam/rbac#test` both ran, 2 successful, 0 cached.
- `yarn workspace @bio-exam/server typecheck` and `yarn workspace @bio-exam/rbac typecheck`: exit 0.
- `grep -rn passWithNoTests` over both Vitest configs, root `package.json`, `turbo.json`: prints nothing.
- No `bio-exam-pg-*` directory left in the temp dir (no database was started by this plan).

## Task Commits (ready to commit, not committed)

Per the standing rule, nothing was committed. Proposed commits:

1. **Task 1** (server config, resolver and scoring ports): `test: Vitest в app/server, перенос тестов резолвера типов вопросов и подсчёта баллов`
   - `app/server/vitest.config.ts` (new), `app/server/package.json`, `app/server/src/lib/tests/question-type-resolver.test.ts`, `app/server/src/lib/tests/scoring.test.ts`
2. **Task 2** (telemetry and schema ports): `test: Перенос тестов телеметрии и схемы теста на Vitest`
   - `app/server/src/lib/tests/telemetry.test.ts`, `app/server/src/schemas/tests.test.ts`
3. **Task 3** (rbac, Turbo, root script): `test: Смоук-тест rbac, задача test в Turbo и корневой yarn test`
   - `packages/rbac/vitest.config.ts` (new), `packages/rbac/src/index.test.ts` (new), `packages/rbac/package.json`, `turbo.json`, `package.json`

Caution: `app/server/package.json`, `packages/rbac/package.json` and `package.json` also carry uncommitted 01-02 changes (pins, yarn.lock). Stage the 01-02 commit first, or use `git add -p`, so this plan's commits contain only the `test` script lines. The wave-1 (01-01) changes in `app/server` are likewise still uncommitted.

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations):
- The three edited `package.json`/`turbo.json` files are CRLF in the repo; the added lines are CRLF to match. New files (configs, rbac test) are LF, per `.prettierrc` `endOfLine: lf`.
- Ported test files were LF already and remain LF. Import order is `node:assert/strict`, `vitest`, then relative imports; the one-time formatter plan (D-11) may reorder.
- `app/server` `build` (`tsc -p tsconfig.json`) already compiled `*.test.ts` into `dist` before this plan; unchanged here. A later plan may want to exclude `**/*.test.ts` from the build tsconfig.

## Known Stubs

None.

## Threat Flags

None. T-1-08 mitigation in place: `test.env.BIO_EXAM_ISOLATED_ENV='1'` and the `db/index.js` mock; the regression proving no `.env` load is plan 01-16.

## Self-Check: PASSED

- Created files exist: `app/server/vitest.config.ts`, `packages/rbac/vitest.config.ts`, `packages/rbac/src/index.test.ts`.
- All plan acceptance criteria re-run above and pass. Commits: none, by rule (`commits: 0` measured, HEAD still 11b2916).
