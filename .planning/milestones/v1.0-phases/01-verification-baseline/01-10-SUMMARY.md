---
phase: 01-verification-baseline
plan: 10
subsystem: tooling
tags: [verify, yarn, turbo, lockfile, node-test, postgres, disposable-db]

# Dependency graph
requires:
  - phase: 01-verification-baseline
    provides: "01-01 withTestDatabase / isolatedChildEnv / findPgBin (exclusive PG_BIN_DIR); 01-03/01-04/01-06 turbo lint, typecheck, test over all three workspaces and the globalPassThroughEnv; 01-08 scripts/check-migrations.mjs; 01-09 scripts/lib/e2e-web-env.test.mjs"
provides:
  - "yarn verify (scripts/verify.mjs): one gate, fixed order lockfile -> lint-typecheck-test -> migrations -> script-tests, inside one disposable PostgreSQL 17 database, stop at first failure, summary block with the failing step in the last line"
  - "scripts/check-lockfile.mjs: single-lockfile guard (findLockfileViolations, existingPaths) judging the working tree, with 10 node:test cases"
  - "package-lock.json deleted from the working tree (unstaged); yarn.lock is the only lockfile"
  - "Root script verify: node scripts/verify.mjs"
affects: [01-11, 01-14, 01-15, ci, every later phase gate]

# Actuals (#2632) — chars/4 over the files this plan created (byte count; Cyrillic text inflates it)
actuals:
  tokens: 3280
  tasks: 2
  commits: 0
plan_head_before: 11b291649c54eec9678edf0a441232a92b631197
plan_head_after: 11b291649c54eec9678edf0a441232a92b631197

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "STEPS array in scripts/verify.mjs is the only place that defines gate order; later plans append entries ({ name, cmd, args }, args may be a function that throws on zero tests)"
    - "Pure helpers take injected predicates (existingPaths(paths, exists)) so node:test cases need neither git nor a filesystem"
    - "Gate failure before step 1 (no PostgreSQL 17, bad TEST_DATABASE_URL) is reported as pseudo-step test-database; every real step shows 'not run'"

key-files:
  created:
    - scripts/verify.mjs
    - scripts/check-lockfile.mjs
    - scripts/check-lockfile.test.mjs
  modified:
    - package.json
  deleted:
    - package-lock.json

key-decisions:
  - "script-tests expands scripts/**/*.test.mjs inside verify.mjs (recursive readdir) and passes explicit files to node --test, so zero files is a hard failure and the gate does not depend on shell or Node glob support"
  - "Pseudo-step name test-database for a failure before step 1, so the last line always names a failing step ('yarn verify: FAILED at test-database')"
  - "The summary always goes to stdout; step output and [verify] diagnostics go to stderr/inherit"
  - "check-rbac-dist.mjs is not a verify step: it is not in the plan's fixed step order, and turbo test already builds rbac via ^build"

patterns-established:
  - "Guards that read git state drop paths absent on disk before judging, so an unstaged deletion is not a violation but a file on disk is"

requirements-completed: [VER-02, VER-04]

coverage:
  - id: D1
    description: "yarn verify on a clean tree runs lockfile, turbo lint/typecheck/test, migrations and script tests in order against a disposable PostgreSQL 17 it starts itself, and exits 0 with 'yarn verify: OK'"
    requirement: VER-02
    verification:
      - kind: integration
        ref: "yarn verify -> exit 0; summary lockfile/lint-typecheck-test/migrations/script-tests all passed; 'yarn verify: OK'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Any failing step makes verify exit 1, stops there, lists later steps as 'not run' and names the step in the last line (failing Vitest probe, stray lockfile)"
    requirement: VER-02
    verification:
      - kind: integration
        ref: "app/server/src/__verify_probe__.test.ts (expect(1).toBe(2)) -> yarn verify exit 1, 'yarn verify: FAILED at lint-typecheck-test'; probe removed, rerun exit 0"
        status: pass
      - kind: integration
        ref: "touch app/web/package-lock.json; yarn verify -> exit 1, 'yarn verify: FAILED at lockfile', three later steps 'not run'"
        status: pass
    human_judgment: false
  - id: D3
    description: "Missing PostgreSQL 17 with TEST_DATABASE_URL unset is a hard failure with the install hint, never a skip; a remote preset URL is rejected by the guard"
    requirement: VER-02
    verification:
      - kind: integration
        ref: "env -u TEST_DATABASE_URL PG_BIN_DIR=/nonexistent node scripts/verify.mjs -> exit 1, 'PostgreSQL 17 not found', no 'yarn verify: OK' (plan verify line passes)"
        status: pass
      - kind: integration
        ref: "TEST_DATABASE_URL=postgres://u@db.example.invalid:5432/test_x node scripts/verify.mjs -> exit 1, 'host db.example.invalid is not localhost or 127.0.0.1'"
        status: pass
    human_judgment: false
  - id: D4
    description: "Preset TEST_DATABASE_URL (CI service container) is used after the guard instead of starting a cluster, and verify still creates its own scratch databases"
    requirement: VER-02
    verification:
      - kind: integration
        ref: "node scripts/with-test-db.mjs -- node scripts/verify.mjs -> exit 0 (only the wrapper's cluster started), 'yarn verify: OK'"
        status: pass
    human_judgment: false
  - id: D5
    description: "package-lock.json is gone and the guard fails on any second lockfile or a missing root yarn.lock, while passing with the unstaged deletion"
    requirement: VER-04
    verification:
      - kind: unit
        ref: "node --test scripts/check-lockfile.test.mjs (10/10)"
        status: pass
      - kind: other
        ref: "node scripts/check-lockfile.mjs with the deletion unstaged -> 'check-lockfile: OK'; with a touched app/web/package-lock.json or packages/rbac/bun.lockb -> exit 1 naming the path"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 10: yarn verify gate and single-lockfile guard Summary

**`yarn verify` is now the one gate: it starts its own disposable PostgreSQL 17, runs lockfile guard, `turbo run lint typecheck test` (rbac, server, web), the full migration check and the root script tests in a fixed order, stops at the first failure and ends with `yarn verify: OK` or `yarn verify: FAILED at <step>`. `package-lock.json` is deleted and a tested guard keeps `yarn.lock` the only lockfile.**

## Performance

- **Duration:** about 4 min (the final gate itself takes about 8 s warm)
- **Started:** 2026-10-03T08:17:32Z
- **Completed:** 2026-10-03T08:20:03Z (SUMMARY written after)
- **Tasks:** 2/2
- **Files:** 3 created, 1 modified, 1 deleted

## Accomplishments

- **Lockfile guard (Task 1, TDD).** `findLockfileViolations(paths)` returns the sorted forbidden basenames (`package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `bun.lock`, `bun.lockb`, exact basename match) plus a `missing: yarn.lock` entry when the root file is absent. `existingPaths(paths, exists)` filters by an injected predicate. The CLI lists `git ls-files --cached --others --exclude-standard`, drops paths absent on disk, then judges, so the unstaged deletion of `package-lock.json` passes while any file that exists on disk is flagged.
- **Orchestrator (Task 2).** `scripts/verify.mjs` wraps everything in `withTestDatabase('test_verify', ...)`. Each step is spawned with `stdio: 'inherit'` and `isolatedChildEnv({ TEST_DATABASE_URL: url })`: no `DATABASE_URL`, `SUPABASE_*` or `PG*`, `BIO_EXAM_ISOLATED_ENV=1`. Exit code is the only verdict, so the 6 server and 66 web oxlint warnings in the passing run did not fail it.
- **Final green run.** Turbo ran 10 tasks (rbac 1 file / 2 tests, web 8 / 33, server 8 / 145 including the DB-backed `timestamps.test.ts`), `check-migrations: OK` (all five stages on PostgreSQL 17.10), and `node --test` over three script test files (36 tests). No `bio-exam-pg-*` directory was left after any run.

## Task Commits (ready to commit — not committed)

Per the standing rule nothing was committed or staged (`git diff --cached --name-only` is empty; `git rev-list --count 11b2916..HEAD` = 0; HEAD still `11b2916`). Proposed commits in the user's style:

1. **Task 1: single-lockfile guard and package-lock.json deletion.** `chore: Единственный lock-файл yarn.lock и охранник от второго`
   ```
   ?? scripts/check-lockfile.mjs
   ?? scripts/check-lockfile.test.mjs
    D package-lock.json                (plain rm, deletion NOT staged; stage it with `git rm package-lock.json` or `git add -u package-lock.json`)
   ```
2. **Task 2: yarn verify orchestrator.** `feat: Команда yarn verify: единый запуск проверок на одноразовой PostgreSQL 17`
   ```
   ?? scripts/verify.mjs
    M package.json                    (only the "verify" line is this plan's; the rest is 01-02/01-03/01-06/01-09)
   ```
`scripts/` is untracked as a whole (earlier waves' files), and `package.json` already carries other plans' edits (the `test`, `e2e`, `format`, `format:check` scripts and two devDependencies come from 01-03/01-06/01-09), so stage per file. `git diff package.json` is compact (CRLF kept), so `git add -p package.json` works if the user wants to split the hunks.

**Plan metadata:** not committed (`commit_docs: false`, `.planning/` gitignored).

## TDD Gate (Task 1, no-commit mode)

- **RED:** `node --test scripts/check-lockfile.test.mjs` exited 1 before the module existed (`tests 1, fail 1`, ESM resolution error for `./check-lockfile.mjs`).
- **GREEN:** after the implementation 10/10 pass (`ℹ pass 10`, `ℹ fail 0`).
- **REFACTOR:** oxfmt only.

## Verification record

**Unstaged deletion (acceptance P2).** After `rm package-lock.json`:
```
$ git ls-files --deleted | grep -n '^package-lock.json$'
8:package-lock.json
$ node scripts/check-lockfile.mjs
check-lockfile: OK            (exit 0)
```
`git diff --cached --name-only` is empty. The `yarn verify` summary lists `lockfile: passed` in this state. A file that exists on disk is still caught: `touch app/web/package-lock.json` -> `check-lockfile: app/web/package-lock.json`, exit 1; `touch packages/rbac/bun.lockb` -> exit 1 (both removed again).

**Green run (`yarn verify`, no TEST_DATABASE_URL in the shell), exit 0:**
```
verify summary:
  lockfile: passed
  lint-typecheck-test: passed
  migrations: passed
  script-tests: passed
yarn verify: OK
```

**Failing-probe run.** `app/server/src/__verify_probe__.test.ts` with one test `expect(1).toBe(2)`: `yarn verify` exit **1**,
```
verify summary:
  lockfile: passed
  lint-typecheck-test: FAILED
  migrations: not run
  script-tests: not run
yarn verify: FAILED at lint-typecheck-test
```
The probe was deleted (`test ! -e app/server/src/__verify_probe__.test.ts` exits 0) and the next `yarn verify` exited 0 with `yarn verify: OK`.

**No-PostgreSQL run.** Command: `env -u TEST_DATABASE_URL PG_BIN_DIR=/nonexistent node scripts/verify.mjs`, exit code **1**:
```
[verify] PostgreSQL 17 not found: brew install postgresql@17, or set TEST_DATABASE_URL to a local test_* database (PG_BIN_DIR is set and is the only directory searched)
verify summary:
  lockfile: not run
  lint-typecheck-test: not run
  migrations: not run
  script-tests: not run
yarn verify: FAILED at test-database
```
No `yarn verify: OK` line. The plan's verify one-liner (`rc != 0 && grep 'PostgreSQL 17 not found' && ! grep 'yarn verify: OK'`) passes. PostgreSQL 17 is on PATH on this machine, so the refusal comes only from the exclusive `PG_BIN_DIR`.

**Extra controls (not required by the plan).**
- Preset URL: `node scripts/with-test-db.mjs -- node scripts/verify.mjs` -> exit 0. Only the wrapper started a cluster (one `[test-db] cluster` line); verify used the preset server and created its own `test_verify_*` database.
- Remote preset URL (`db.example.invalid`) -> exit 1, `TEST_DATABASE_URL host db.example.invalid is not localhost or 127.0.0.1`, `FAILED at test-database`.
- Stray lockfile: `touch app/web/package-lock.json; yarn verify` -> exit 1, `FAILED at lockfile`, three later steps `not run`.

**Acceptance greps.**
- `"verify": "node scripts/verify.mjs"` is in root `package.json`.
- Step names appear in order `lockfile`, `lint-typecheck-test`, `migrations`, `script-tests`; `yarn verify: OK` and `FAILED at` are both in the file.
- `grep -vE '^[[:space:]]*(//|\*|/\*)' scripts/verify.mjs | grep -nE "DATABASE_URL: process\.env\.DATABASE_URL|SUPABASE"` prints nothing.
- `scripts/check-lockfile.mjs` contains `export function findLockfileViolations`, `export function existingPaths` and `--exclude-standard`.
- oxfmt `--check` and oxlint pass on the three new files (oxlint 0 findings).

## Files Created/Modified

- `scripts/verify.mjs` (new): `STEPS`, `formatSummary`, `main`; guarded by an `isMain` check so importing it starts nothing.
- `scripts/check-lockfile.mjs` (new): guard and CLI.
- `scripts/check-lockfile.test.mjs` (new): 10 `node:test` cases for the behaviour list.
- `package.json` (modified): `"verify": "node scripts/verify.mjs"`.
- `package-lock.json` (deleted from the working tree, not staged).

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] script-tests expands the test files itself and fails on zero**
- **Found during:** Task 2
- **Issue:** The plan allowed `node --test "scripts/**/*.test.mjs"`. With a quoted glob a typo or a moved folder could collect zero files, which the prohibition ("zero collected tests is a failure") forbids.
- **Fix:** a recursive `readdir` collects `*.test.mjs` under `scripts/`; zero files throws and fails the step; the files go to `node --test` as explicit arguments.
- **Files modified:** scripts/verify.mjs

**2. [Additional] Pseudo-step `test-database`**
- The plan fixes four step names but also requires the last line to name a failing step and the summary to list every step. For a failure before step 1 (no PostgreSQL 17, rejected `TEST_DATABASE_URL`) the last line reads `yarn verify: FAILED at test-database` and all four steps show `not run`.

**3. [Process] oxfmt side effects on `package.json`, restored**
- Running oxfmt directly on `package.json` moved `"type"` below `"workspaces"` and converted CRLF to LF (`.oxfmtrc.json` has `endOfLine: lf`). Earlier waves keep CRLF in the working tree (control: `turbo.json`, `app/server/package.json`, `packages/rbac/package.json` all still CRLF; `app/web/package.json` is LF in HEAD too). I restored the key order and the CRLF endings. `git diff --stat package.json` is now `8 insertions(+), 1 deletion(-)`, and `yarn verify` was re-run after the restore: exit 0, `yarn verify: OK`.
- `package.json` was not oxfmt-clean before this plan either (the same check on a copy without the `verify` line also fails), so the format-only reformat checkpoint will cover it. Do not run oxfmt on the root `package.json` before that checkpoint.

---

**Total deviations:** 1 auto-fixed (missing critical) plus 2 small additions.
**Impact on plan:** none on scope. No install, no `.env` edit, no live-database access.

## Issues Encountered

None. The first full run passed.

## Known Stubs

None.

## Threat Flags

None. T-1-17: every step gets `isolatedChildEnv`; the forwarding grep prints nothing; the remote preset URL is rejected before any step runs. T-1-18: `check-lockfile.mjs` is step 1 of verify (01-15 adds it to CI). T-1-SC: no installs.

## User Setup Required

None.

Note for the user: `NEXT_IGNORE_INCORRECT_LOCKFILE` in your local `app/web/.env` is now obsolete because `package-lock.json` no longer exists, and you may remove it yourself. This plan did not touch any `.env` file. Caveat: `scripts/lib/e2e-web-env.mjs` (01-09) pins that key to `'1'` for the e2e child env and its guard requires every key name present in `app/web/.env*` to be set, so removing it from `.env` is safe for `yarn e2e`.

## Next Phase Readiness

- Later plans append steps to `STEPS` in `scripts/verify.mjs` (for example 01-11 e2e is intentionally not part of verify, per D-21 CI owns build and e2e).
- 01-15 (CI) can run `yarn verify` with a `postgres:17` service: a preset `TEST_DATABASE_URL` is honoured after the guard (control run above).
- `scripts/check-rbac-dist.mjs` is not called by verify; add it as a step only if a plan asks for it.
- The package-lock.json deletion stays uncommitted until the user's first commit checkpoint (01-14 Task 1); every `yarn verify` in between passes the lockfile step by design.

---
*Phase: 01-verification-baseline*
*Completed: 2026-10-03*

## Self-Check: PASSED

- Files exist: `scripts/verify.mjs`, `scripts/check-lockfile.mjs`, `scripts/check-lockfile.test.mjs`; `package-lock.json` absent; `app/server/src/__verify_probe__.test.ts` absent.
- Commits: none, by rule (`commits: 0` measured, HEAD still `11b2916`, nothing staged).
- Plan verify commands re-run in final form: `node --test scripts/check-lockfile.test.mjs` 10/10; `node scripts/check-lockfile.mjs` OK; `yarn verify` exit 0 with `yarn verify: OK`; the `PG_BIN_DIR=/nonexistent` one-liner passes.
- STATE.md, ROADMAP.md and REQUIREMENTS.md were not modified.
