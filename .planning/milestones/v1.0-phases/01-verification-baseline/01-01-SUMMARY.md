---
phase: 01-verification-baseline
plan: 01
subsystem: testing
tags: [postgres, pg_ctl, initdb, dotenv, drizzle, isolation, harness, node24-type-stripping]

# Dependency graph
requires: []
provides:
  - "BIO_EXAM_ISOLATED_ENV=1 switch: env.ts, db/index.ts, apply-migration.ts, drizzle.config.ts, seed.ts and bootstrap-admin.ts load no .env and read only TEST_DATABASE_URL"
  - "app/server/src/config/test-database-url.ts: the single guard (localhost/127.0.0.1 + ^test_[a-z0-9_]+$), importable from server code (.js) and from root .mjs (.ts, Node 24 type stripping)"
  - "scripts/lib/test-db.mjs: disposable PostgreSQL 17 cluster lifecycle, scratch databases, settings assertion, isolated child env, orphan sweep, --self-test (14 cases)"
  - "scripts/with-test-db.mjs: run any command against a fresh guarded scratch database, with a ready marker and full teardown"
  - "app/server/src/scripts/isolation-probe.ts: JSON probe of env source, Supabase vars and connected database"
affects: [01-02, 01-05, 01-08, 01-09, vitest-db-tests, migration-check, e2e]

# Actuals (#2632)
actuals:
  tokens: 11996
  tasks: 2
  commits: 0
plan_head_before: 11b291649c54eec9678edf0a441232a92b631197
plan_head_after: 11b291649c54eec9678edf0a441232a92b631197

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Isolation switch BIO_EXAM_ISOLATED_ENV=1 + TEST_DATABASE_URL guard before any new Pool / client"
    - "Conditional dotenv: import { config as loadDotenv } from 'dotenv'; if (!isIsolatedEnv()) loadDotenv()"
    - "Root .mjs scripts import server TypeScript (erasable syntax only, no imports) directly via Node 24 type stripping"
    - "Cluster dir layout: <tmp>/bio-exam-pg-*/owner.pid + data/ (PGDATA) + postgres.log"
    - "Self-test cases print 'ok - <case>' / 'not ok - <case>: <reason>' collect-and-continue, final 'test-db self-test: OK'"

key-files:
  created:
    - app/server/src/config/test-database-url.ts
    - app/server/src/scripts/isolation-probe.ts
    - scripts/lib/test-db.mjs
    - scripts/with-test-db.mjs
  modified:
    - app/server/src/config/env.ts
    - app/server/src/db/index.ts
    - app/server/src/scripts/apply-migration.ts
    - app/server/drizzle.config.ts
    - app/server/src/db/seed.ts
    - app/server/src/scripts/bootstrap-admin.ts

key-decisions:
  - "PGDATA is <dir>/data, not <dir>: initdb refuses a non-empty directory, and owner.pid must exist from mkdtemp on; the sweep reads <dir>/owner.pid and <dir>/data/postmaster.pid"
  - "assertDatabaseSettings rejects C/POSIX in both datcollate and datctype (pg_trgm Cyrillic depends on ctype), timezone read via current_setting('TimeZone')"
  - "acquireTestServer treats a SET but empty TEST_DATABASE_URL as an error (guard 'is not set'), only an unset variable starts a local cluster; DATABASE_URL is never consulted"
  - "isolation-probe.ts refuses to run unless BIO_EXAM_ISOLATED_ENV=1, so it can never connect to the live pooler"
  - "withTestDatabase signal cleanup awaits in-flight cluster/scratch creation, so a SIGINT during initdb still removes the cluster"

patterns-established:
  - "DB safety: every DB-touching process runs with isolatedChildEnv({ TEST_DATABASE_URL }) and never logs a URL (host/port/db name only)"
  - "Guard error wording is fixed: 'TEST_DATABASE_URL host <h> is not localhost or 127.0.0.1' and 'TEST_DATABASE_URL database <n> does not match ^test_[a-z0-9_]+$'"

requirements-completed: [VER-05]

coverage:
  - id: D1
    description: "Isolated mode: no .env load, TEST_DATABASE_URL only, guard rejects non-local hosts and non-test_ databases before any connection (env.ts, db/index.ts, apply-migration.ts, drizzle.config.ts, seed.ts, bootstrap-admin.ts)"
    requirement: VER-05
    verification:
      - kind: integration
        ref: "node scripts/lib/test-db.mjs --self-test#guard table"
        status: pass
      - kind: integration
        ref: "node scripts/lib/test-db.mjs --self-test#isolated probe ignores .env and Supabase vars"
        status: pass
      - kind: integration
        ref: "node scripts/lib/test-db.mjs --self-test#isolated probe rejects remote host"
        status: pass
      - kind: integration
        ref: "node scripts/lib/test-db.mjs --self-test#isolated migration runner rejects database prod"
        status: pass
      - kind: integration
        ref: "node scripts/lib/test-db.mjs --self-test#drizzle config rejects remote host"
        status: pass
      - kind: other
        ref: "plan verify: BIO_EXAM_ISOLATED_ENV=1 TEST_DATABASE_URL=postgres://u@db.example.invalid:5432/test_x yarn workspace @bio-exam/server tsx -e <.then() probe> (exit 3 + guard message) and the 127.0.0.1/test_x positive control (exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Disposable PostgreSQL 17 harness: initdb/pg_ctl on 127.0.0.1 + free port, UTF-8 en_US.UTF-8 + UTC scratch DB, 21/21 migrations through the real runner, cluster and temp dir removed"
    requirement: VER-05
    verification:
      - kind: integration
        ref: "node scripts/lib/test-db.mjs --self-test#migrations applied through the real runner (21)"
        status: pass
      - kind: integration
        ref: "node scripts/lib/test-db.mjs --self-test#harness database"
        status: pass
    human_judgment: false
  - id: D3
    description: "with-test-db.mjs wrapper: exit-code passthrough, SIGINT/SIGTERM teardown, parallel safety, orphan sweep with owner.pid protection, loud failure without PostgreSQL 17, empty TEST_DATABASE_URL rejected"
    requirement: VER-05
    verification:
      - kind: integration
        ref: "node scripts/lib/test-db.mjs --self-test#exit code passthrough with teardown"
        status: pass
      - kind: integration
        ref: "node scripts/lib/test-db.mjs --self-test#sigint teardown"
        status: pass
      - kind: integration
        ref: "node scripts/lib/test-db.mjs --self-test#parallel runs"
        status: pass
      - kind: integration
        ref: "node scripts/lib/test-db.mjs --self-test#orphan sweep"
        status: pass
      - kind: integration
        ref: "node scripts/lib/test-db.mjs --self-test#missing postgres fails with install hint"
        status: pass
      - kind: integration
        ref: "node scripts/lib/test-db.mjs --self-test#empty TEST_DATABASE_URL is rejected by the wrapper"
        status: pass
      - kind: other
        ref: "manual: node scripts/with-test-db.mjs -- node -e 'setTimeout(...)' + kill -TERM -> exit 143, no bio-exam-pg-* left"
        status: pass
    human_judgment: false
  - id: D4
    description: "Non-isolated startup unchanged (same .env loaded with override, DATABASE_URL used)"
    requirement: VER-05
    verification:
      - kind: other
        ref: "yarn workspace @bio-exam/server tsx -e \"import('./src/config/env.ts')...\" -> ENV_LOADED_FROM = app/server/.env (no DB connection)"
        status: pass
    human_judgment: true
    rationale: "Only env.ts loading was exercised without isolation (no connection to the live DB is allowed); the unchanged non-isolated paths of db/index.ts, apply-migration.ts, drizzle.config.ts, seed.ts and bootstrap-admin.ts are verified by code reading and typecheck only"

# Metrics
duration: 8min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 01: Database isolation boundary and disposable PostgreSQL 17 harness Summary

**`BIO_EXAM_ISOLATED_ENV=1` makes every server entrypoint skip `.env` and accept only a guarded `TEST_DATABASE_URL` (localhost/127.0.0.1, `test_*`). An initdb/pg_ctl harness (`scripts/lib/test-db.mjs` + `scripts/with-test-db.mjs`) proves the boundary: migrations 0000-0020 apply through the real runner on a throwaway PostgreSQL 17 cluster, which is always torn down. A 14-case self-test covers it.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-03T06:31:03Z
- **Completed:** 2026-10-03T06:39:21Z
- **Tasks:** 2/2
- **Files modified:** 10 (4 created, 6 modified)

## Accomplishments

- D-29 closed first: `env.ts` skips the whole dotenv candidate loop in isolated mode (`ENV_LOADED_FROM === null`). `db/index.ts`, `apply-migration.ts` and `drizzle.config.ts` take the URL only from `TEST_DATABASE_URL` through `assertTestDatabaseUrl`, before `new Pool`. `seed.ts` and `bootstrap-admin.ts` no longer fill `SUPABASE_*`/`ADMIN_BOOTSTRAP_*` from `.env` in isolated mode.
- One guard module (`test-database-url.ts`) has no imports and only erasable syntax. Root `.mjs` imports it directly under Node 24.17 type stripping, so no JS twin is needed and the plan's fallback was not used.
- Harness: Homebrew PostgreSQL 17.10 cluster in about 1 s, TCP only (`unix_socket_directories=`), `LC_ALL=en_US.UTF-8`, UTC, scratch DB `test_<prefix>_<pid>_<hex>`. Settings are asserted (UTF8, non-C collate/ctype, UTC). `__drizzle_migrations` holds 21 rows, matching the 21 journal entries.
- Teardown is proven for a normal exit, a non-zero exit (exit 3 passes through), SIGINT (130) and SIGTERM (143). Two parallel runs get distinct dirs, ports and DB names. The orphan sweep removes dead-owner and stale dirs and keeps live-owner and fresh ones. PostgreSQL 17 missing (exclusive `PG_BIN_DIR=/nonexistent`) fails with the install hint and no ready marker.
- An extra end-to-end check, `with-test-db.mjs -- sh -c 'drizzle:migrate && seed'`, runs migrate plus seed in isolated mode against a scratch DB and exits 0.

## Task Commits (ready to commit, not committed)

Per the user's standing rule, GSD agents do not commit. Everything is left in the working tree. Proposed commits in the user's `<type>: <Russian>` style:

1. **Task 1 (tracer): end-to-end "a harness-launched migration reaches only a disposable PostgreSQL"**. Proposed message: `feat: Изоляция окружения сервера и одноразовый PostgreSQL 17 для тестов`
   ```
    M app/server/src/config/env.ts
    M app/server/src/db/index.ts
    M app/server/src/scripts/apply-migration.ts
   ?? app/server/src/config/test-database-url.ts
   ?? scripts/lib/test-db.mjs            (shared with Task 2)
   ```
2. **Task 2 (tdd): close the remaining isolation paths; prove failure, interruption and parallel behaviour**. Proposed message: `feat: Изоляция drizzle.config, seed и bootstrap-admin, обёртка with-test-db и самопроверка харнесса`
   ```
    M app/server/drizzle.config.ts
    M app/server/src/db/seed.ts
    M app/server/src/scripts/bootstrap-admin.ts
   ?? app/server/src/scripts/isolation-probe.ts
   ?? scripts/lib/test-db.mjs            (shared with Task 1)
   ?? scripts/with-test-db.mjs
   ```
   `scripts/lib/test-db.mjs` holds both tasks' work. A single commit with the Task 1 message plus the Task 2 files is equally valid: `feat: Изоляция окружения сервера, одноразовый PostgreSQL 17 и обёртка with-test-db`.

**Plan metadata:** not committed (`commit_docs: false`, `.planning/` gitignored).

## Files Created/Modified

- `app/server/src/config/test-database-url.ts` (new): `ISOLATED_ENV_FLAG`, `isIsolatedEnv`, `assertTestDatabaseUrl`, `resolveIsolatedDatabaseUrl`, `withDatabaseName`.
- `app/server/src/config/env.ts`: the dotenv loop is skipped when isolated. The header documents the switch. `safeDsn`, `ENV_LOADED_FROM` and the production check are unchanged.
- `app/server/src/db/index.ts`: `resolveDatabaseUrl()` returns `resolveIsolatedDatabaseUrl()` when isolated and the old `DATABASE_URL` check otherwise. It runs before `new Pool`.
- `app/server/src/scripts/apply-migration.ts`: conditional `loadDotenv()`. The isolated URL is guarded before `new Pool`. `drizzle(pool)` and `migrationsSchema: 'public'` are untouched.
- `app/server/drizzle.config.ts`: conditional `loadDotenv()`. When isolated, `dbCredentials.url = resolveIsolatedDatabaseUrl()`. `strict`, `verbose` and `out` are unchanged.
- `app/server/src/db/seed.ts`, `app/server/src/scripts/bootstrap-admin.ts`: `if (!isIsolatedEnv()) loadDotenv()`.
- `app/server/src/scripts/isolation-probe.ts` (new): one JSON line `{ envLoadedFrom, supabaseUrlSet, supabaseKeySet, database }`. It refuses to run unless isolated.
- `scripts/lib/test-db.mjs` (new): `findPgBin`, `sweepOrphanClusters`, `startTestCluster`, `acquireTestServer`, `createScratchDatabase`, `assertDatabaseSettings`, `isolatedChildEnv`, `withTestDatabase`, `--self-test`.
- `scripts/with-test-db.mjs` (new): `node scripts/with-test-db.mjs [--prefix test_*] [--] <command...>`.

CRLF line endings of the six pre-existing files were preserved (diff is 72+/18- lines).

## CodeGraph impact (run before editing, as Task 1 requires)

- `safeDsn` (5 symbols): `config/env.ts`, `db/index.ts`, `routes/db/health.ts`, `app.ts`. Unchanged.
- `ENV_LOADED_FROM` (2): `config/env.ts`, `db/index.ts`. The value is unchanged in non-isolated mode and `null` in isolated mode.
- `pgPool` (49 symbols): `db/index.ts` (`db`, `withUserTx`), `scripts/backfill-question-search.ts` (`main`), `services/search/question-documents.ts` (`upsertQuestionSearchDocument`, `updateQuestionSearchDocumentLocation`), `routes/tests/index.ts` (POST `/api/tests/save`, POST `/api/tests/:id/questions`, PATCH `/api/tests/:id/questions/:questionId`, POST `.../move`, `syncQuestionPointsForTestByTypeConfig`, `ensureGlobalScoringRules`), `services/search/index.ts`, `index.ts` (`gracefulShutdown`), `routes/db/health.ts`, `app.ts`. Only the URL source before `new Pool` changed. The pool config and exports are the same.

## Self-test case names (Task 2 acceptance mapping)

`guard table` · `migrations applied through the real runner (21)` · `isolated probe ignores .env and Supabase vars` · `isolated probe rejects remote host` · `isolated migration runner rejects database prod` · `harness database` · `drizzle config rejects remote host` · `drizzle config loads with a local test database` · `exit code passthrough with teardown` · `sigint teardown` · `parallel runs` · `orphan sweep` (dead-owner dir removed, live-owner dir without `postmaster.pid` kept, stale bare dir removed, fresh bare dir kept) · `missing postgres fails with install hint` (in-process exclusive `PG_BIN_DIR` + wrapper spawn) · `empty TEST_DATABASE_URL is rejected by the wrapper`.

## TDD Gate Compliance (Task 2, no-commit mode)

- **RED:** the full Task 2 case list was added to `--self-test` before any Task 2 production change. The run exited 1 with 9 of 14 failing. The targets failed on assertions, not crashes: `orphan sweep` (dead-owner directory was not removed) and `drizzle config rejects remote host` (config probe exited 0, expected 3). Both records passed `gsd-tools check tdd-red-evidence` with `RED_EVIDENCE_OK / target_test_failed`. The self-test prints `ok - <case>` without numbers, because the acceptance greps need that exact form, so the records hold a mechanical numbered-TAP conversion of the real output. The only code added before RED was a 9-line `isPidAlive` helper, so that the sweep case fails on its assertion and not with a ReferenceError.
- **GREEN:** after `drizzle.config.ts`, `seed.ts`, `bootstrap-admin.ts`, `isolation-probe.ts`, the sweep, the signal cleanup and `with-test-db.mjs` were added, 14/14 cases pass.
- **REFACTOR:** format only. Prettier (the repo's existing config) was applied to `test-db.mjs`, and import order in `apply-migration.ts` and `seed.ts` was adjusted with CRLF kept. 14/14 pass again.
- No `test(...)`/`feat(...)` commits exist because of the no-commit rule. The gate sequence is recorded here instead.

## Decisions Made

See `key-decisions` in the frontmatter. In short: PGDATA lives in the `data/` subdirectory, ctype and collation are both checked, an empty-but-set `TEST_DATABASE_URL` is rejected, the probe is isolated-only, and signal cleanup waits for an in-flight startup.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] PGDATA moved to `<dir>/data`**
- **Found during:** Task 1 (`startTestCluster`)
- **Issue:** The plan writes `<dir>/owner.pid` right after `mkdtemp` and then runs `initdb -D <dir>`. initdb refuses a non-empty directory.
- **Fix:** `initdb -D <dir>/data`. `owner.pid` and `postgres.log` sit next to `data/`. The sweep reads `<dir>/data/postmaster.pid`.
- **Files modified:** scripts/lib/test-db.mjs
- **Verification:** the self-test cases `harness database` and `orphan sweep`.

**2. [Rule 2 - Missing critical] `isolation-probe.ts` refuses to run outside isolated mode**
- **Found during:** Task 2
- **Issue:** Run without the flag, the probe would import `db/index.ts` with `app/server/.env` and query the live Supabase database.
- **Fix:** The probe throws before any import of env/db unless `BIO_EXAM_ISOLATED_ENV=1`.
- **Files modified:** app/server/src/scripts/isolation-probe.ts

**3. [Rule 2 - Missing critical] `datctype` checked as well as `datcollate`**
- **Found during:** Task 1 (`assertDatabaseSettings`)
- **Issue:** pg_trgm character classification follows `LC_CTYPE`. A C ctype with a non-C collation would still break Cyrillic trigram search silently.
- **Fix:** Both values are rejected when `C`/`POSIX`.

**4. [Rule 2 - Missing critical] Signal cleanup covers an in-flight startup**
- **Found during:** Task 2 (`withTestDatabase`)
- **Issue:** A SIGINT that arrives during `initdb`/`pg_ctl start` would exit before the server object exists, which would orphan a running postmaster that the sweep must never touch.
- **Fix:** Cleanup awaits the pending acquire/scratch promises, then stops and removes the cluster.

**5. [Rule 1 - Bug] The URL-logging acceptance grep flagged a safe log line**
- **Found during:** Task 1 acceptance
- **Issue:** `console.error(... describeDatabase(url) ...)` matched the no-URL grep, although it printed only host:port/db.
- **Fix:** It now logs only the scratch database name, and the helper was removed.

**6. [Additional test] The self-test has 3 cases beyond the five named in the acceptance list**
- `exit code passthrough with teardown`, `empty TEST_DATABASE_URL is rejected by the wrapper` and the drizzle.config positive control. They prove truths 35/36 and the plan's verify probe from inside the self-test.

---

**Total deviations:** 5 auto-fixed (1 blocking, 3 missing critical, 1 bug) plus extra self-test cases.
**Impact on plan:** All were needed for correctness or safety. No scope creep. No package was installed.

## Issues Encountered

- **Masked DSN appeared in tool output once:** the non-isolated sanity check (`tsx -e "import('./src/config/env.ts')"`, no DB connection) triggered the existing `DEBUG_ENV=1` from `app/server/.env`. That printed the pre-existing `[env] DATABASE_URL: <safeDsn>` line: the pooler host and user, with the password replaced by `***`. No password or key was printed, and no connection was made. This is long-standing `env.ts` debug behaviour and was not changed. The user may want `DEBUG_ENV` off in `app/server/.env`.
- **Hazard for later plans:** Yarn 4 can inject a root `.env` into script environments (`injectEnvironmentFiles`). `.yarnrc.yml` does not override it, and no root `.env` exists today, so `yarn workspace ... drizzle:migrate` under the harness is clean now. Creating a root `.env` later would put its values into every `yarn` script environment. Values passed explicitly by `isolatedChildEnv` still win, but a variable that the harness strips (e.g. `SUPABASE_URL`) could come back. Re-check this if a root `.env` is ever added.
- **Prettier on pre-existing CRLF files:** `prettier --check` warns on the six edited CRLF files only because of `endOfLine: lf`. LF-normalised copies are Prettier-clean. The one-time reformat (D-11) resolves this.
- **Self-test needs a local PostgreSQL 17:** the `orphan sweep` and `missing postgres` cases call `startTestCluster`/`findPgBin` directly. In CI with only a `postgres:17` service container, run the CI database checks through `acquireTestServer`/`with-test-db.mjs`, not `--self-test`.

## Verification Results

- `node scripts/lib/test-db.mjs --self-test`: exit 0, 14 `ok -` lines, 0 `not ok`, final line `test-db self-test: OK` (about 8 s).
- `yarn workspace @bio-exam/server typecheck`: exit 0, 0 `error TS`.
- drizzle.config `.then()` probe: remote host gives exit 3 with `TEST_DATABASE_URL host db.example.invalid`; `127.0.0.1/test_x` gives exit 0. drizzle-kit's own loader (`drizzle-kit check`, no connection, no writes) also prints the guard message.
- `node scripts/with-test-db.mjs -- node -e "process.exit(0)"` exits 0; with `process.exit(3)` it exits 3.
- `git status --porcelain app/server/drizzle` is empty (no migration file touched).
- `ls -d $TMPDIR/bio-exam-pg-* | wc -l` gives 0 after every run.
- The URL-logging grep over `scripts/lib/test-db.mjs` prints nothing.
- `grep -c "^import 'dotenv/config'"` gives 0 for apply-migration.ts, drizzle.config.ts, seed.ts and bootstrap-admin.ts.

## Known Stubs

None.

## User Setup Required

None. PostgreSQL 17 is already installed through Homebrew (`/opt/homebrew/bin`, 17.10).

## Next Phase Readiness

- Plan 01-02 and every later DB-touching plan can rely on `withTestDatabase`/`with-test-db.mjs` and the guard messages. 01-08 can grep the fixed wording.
- Vitest `globalSetup` (later plans) can import `scripts/lib/test-db.mjs` directly. Turbo needs `TEST_DATABASE_URL` and `BIO_EXAM_ISOLATED_ENV` in `globalPassThroughEnv` (planned for 01-02/verify).

---
*Phase: 01-verification-baseline*
*Completed: 2026-10-03*

## Self-Check: PASSED
