---
phase: 01-verification-baseline
plan: 05
subsystem: database
tags: [drizzle, drizzle-kit, postgres, rls, timestamptz, vitest, migrations, catalog-fingerprint]

# Dependency graph
requires:
  - phase: 01-verification-baseline
    provides: "01-01 disposable PostgreSQL 17 harness (acquireTestServer, createScratchDatabase, isolatedChildEnv, with-test-db.mjs) and the TEST_DATABASE_URL guard; 01-02 drizzle-orm 0.45.3 / drizzle-kit 0.31.11; 01-03 server Vitest config with BIO_EXAM_ISOLATED_ENV=1"
provides:
  - "scripts/lib/schema-fingerprint.mjs: fingerprintDatabase(url), diffFingerprints(a, b, labels): catalog fingerprint of schema public and a line-per-difference diff"
  - "scripts/check-migrations.mjs: DRZ-01 comparison stage (chain DB vs schema.ts DB on two scratch test_* databases), markers 'DRZ-01: chain == schema.ts' / 'DRZ-01 FAILED'"
  - "app/server/src/test-support/test-database.ts: requireTestDatabaseUrl, createScratchDatabase(prefix), migrateTestDatabase(url) for DB-backed Vitest files"
  - "app/server/src/db/timestamps.test.ts: timestamptz round-trip regression under Asia/Bangkok, America/New_York and UTC sessions"
  - "app/server/src/db/schema.ts declares the database the migration chain builds (D-28): 10 withTimezone columns, RLS + deny_direct_access on 25 tables, migration index/FK/PK names, 3 undeclared indexes, DESC NULLS FIRST columns"
affects: [01-08, 01-09, 01-12, 01-16, verify, ci, drizzle-snapshot-restore]

# Actuals (#2632)
actuals:
  tokens: 9500
  tasks: 3
  commits: 0
plan_head_before: 11b291649c54eec9678edf0a441232a92b631197
plan_head_after: 11b291649c54eec9678edf0a441232a92b631197

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Schema truth check by materialising both sides: chain via the real runner, schema.ts via drizzle-kit generate (no --config, temp --out) applied in one transaction, then catalog fingerprints compared on the same server"
    - "DB-backed Vitest file: requireTestDatabaseUrl() + createScratchDatabase('test_<x>') + migrateTestDatabase in beforeAll, drop() in afterAll; never skipped"
    - "schema.ts RLS: pgTable(...).enableRLS() + denyDirectAccess: denyDirectAccessPolicy() (fresh pgPolicy per table)"
    - "Migration-named FKs: foreignKey({ name: '<table>_<col>_fkey', columns, foreignColumns }).onDelete('cascade') instead of .references()"

key-files:
  created:
    - scripts/lib/schema-fingerprint.mjs
    - scripts/check-migrations.mjs
    - app/server/src/test-support/test-database.ts
    - app/server/src/db/timestamps.test.ts
  modified:
    - app/server/src/db/schema.ts

key-decisions:
  - "question_drafts DESC columns are declared .desc().nullsFirst(): drizzle-kit 0.31 emits 'DESC NULLS LAST' for a bare .desc(), while the migration's bare DESC is NULLS FIRST in PostgreSQL; with nullsFirst the server canonicalises both to 'updated_at DESC'"
  - "The comparator mirrors 0017/0018 on the declared side (schema extensions + pg_trgm WITH SCHEMA extensions + SET LOCAL search_path) so the gin opclass reads as extensions.gin_trgm_ops on both sides; pg_trgm is the only extension the chain creates"
  - "Fingerprints are read with default search_path, so cross-table references and opclasses are qualified identically on both sides; column order is ignored on purpose"
  - "check-migrations.mjs replicates the withTestDatabase cleanup shape (idempotent cleanup, SIGINT 130 / SIGTERM 143) for two scratch databases instead of extending test-db.mjs, which is outside this plan's files"
  - "requireTestDatabaseUrl checks unset/empty first and throws the wrapper hint, then applies assertTestDatabaseUrl; migrationsFolder is resolved from import.meta.url, not cwd"

patterns-established:
  - "DRZ-01 report line format: 'table <t>: <category> <name> <field>: migrations=<v> schema.ts=<v>' or '... only in <side>: <definition>', ordered by table, category, name"

requirements-completed: [DRZ-01, VER-01, VER-05]

coverage:
  - id: D1
    description: "DRZ-01 comparator: chain 0000-0020 and schema.ts materialised in two scratch test_* databases and their catalogs compared; it detected all 83 baseline differences and now reports zero"
    requirement: DRZ-01
    verification:
      - kind: integration
        ref: "node scripts/check-migrations.mjs (baseline on unmodified schema.ts: exit 1, 'DRZ-01 FAILED', 83 lines)"
        status: pass
      - kind: integration
        ref: "node scripts/check-migrations.mjs (after Task 3: exit 0, 'DRZ-01: chain == schema.ts')"
        status: pass
      - kind: other
        ref: "git status --porcelain app/server/drizzle -> empty; ls $TMPDIR/bio-exam-drizzle-decl-* $TMPDIR/bio-exam-pg-* -> 0; SIGINT mid-run -> exit 130, nothing left"
        status: pass
    human_judgment: false
  - id: D2
    description: "timestamptz runtime fix: 10 columns declared withTimezone; a fixed instant written to users.locked_until and refresh_tokens.expires_at reads back unchanged under Asia/Bangkok, America/New_York and UTC sessions (RED on the old declarations)"
    requirement: DRZ-01
    verification:
      - kind: integration
        ref: "app/server/src/db/timestamps.test.ts#timestamptz round trip (6 tests) via node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/db/timestamps.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "DB-backed test helpers: per-file scratch database test_<prefix>_<pid>_<hex> from TEST_DATABASE_URL, dropped in afterAll; a bare run without TEST_DATABASE_URL fails with the with-test-db hint"
    requirement: VER-01
    verification:
      - kind: other
        ref: "yarn workspace @bio-exam/server vitest run src/db/timestamps.test.ts (no TEST_DATABASE_URL) -> exit 1, 'Test Files 1 failed', 'DB-backed test needs TEST_DATABASE_URL: run it through node scripts/with-test-db.mjs ...'"
        status: pass
      - kind: integration
        ref: "node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/db src/lib src/schemas -> 5 files, 51 tests passed"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live production timestamps are unaffected by the withTimezone change because the Supabase session timezone is UTC (research A7)"
    requirement: VER-05
    verification: []
    human_judgment: true
    rationale: "Backstop truth: depends on the live Supabase session timezone, which this plan may not read; the D-07 capture in 01-12 (show timezone) confirms it"

# Metrics
duration: 10min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 05: DRZ-01 catalog comparator and schema.ts truth alignment Summary

**`node scripts/check-migrations.mjs` builds the migration chain and the `drizzle-kit generate` DDL of `schema.ts` in two throwaway `test_*` databases and diffs their catalogs. On the old `schema.ts` it reported 83 differences, matching the research register exactly. After D-28 it prints `DRZ-01: chain == schema.ts`. Those edits were 10 `withTimezone` columns, `.enableRLS()` plus `deny_direct_access` on all 25 tables, the migrations' index/FK/PK names, 3 undeclared indexes and `DESC NULLS FIRST`. No migration was added or touched, and a new non-UTC round-trip test proves the timestamptz runtime fix.**

## Performance

- **Duration:** about 10 min
- **Started:** 2026-10-03T07:00:03Z
- **Completed:** 2026-10-03T07:09:40Z
- **Tasks:** 3/3
- **Files:** 4 created, 1 modified

## Accomplishments

- `scripts/lib/schema-fingerprint.mjs` reads enums, extensions, tables (`relrowsecurity`/`relforcerowsecurity`), columns (`format_type`, NOT NULL, `pg_get_expr` default, identity, generated), constraints (`pg_get_constraintdef`), indexes (`pg_get_indexdef`) and policies (`pg_policies`). It skips `__drizzle_migrations` in every query. The connection goes through `assertTestDatabaseUrl`, and no URL is printed.
- `scripts/check-migrations.mjs` runs the chain through the real runner (`drizzle:migrate`, isolated env). `drizzle-kit generate --dialect=postgresql --schema=./src/db/schema.ts --out=<tmp> --name=declared` runs without `--config`, with stdin closed and an isolated env that has no `TEST_DATABASE_URL`, so evaluating `drizzle.config.ts` would have thrown. The DDL is applied in one transaction, and `git status --porcelain app/server/drizzle` is asserted unchanged. A run takes about 3 s.
- `schema.ts` now declares the real database, and the comparator reports 0 differences. Exported names, relations and inferred row types are unchanged. Server typecheck is clean.
- The timestamptz bug is covered by a regression test. RED on the old declarations: Bangkok read +7 h, New York -4 h. GREEN after the fix.

## Baseline divergence register (Task 1, unmodified schema.ts)

`node scripts/check-migrations.mjs` exited 1 with 83 lines under `DRZ-01 FAILED: migrations and schema.ts differ`. By class:

| Class | Lines | Detail | Research 4b/4g |
|-------|-------|--------|----------------|
| RLS flag | 25 | `table <t>: rls migrations=true schema.ts=false` on all 25 tables | 25 alter_rls (4b) |
| Policy | 25 | `policy deny_direct_access only in migrations: PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false)` | 25 drop_policy (4b) |
| timestamptz | 10 | `column <c> type: migrations=timestamp with time zone schema.ts=timestamp without time zone`: users.locked_until; test_attempts.created_at, submitted_at; test_sessions.started_at, submitted_at; test_assignments.assigned_at; test_timer_settings.updated_at; refresh_tokens.expires_at, revoked_at, created_at | 10 alter_column (4b) |
| Index names | 8 (4 renames) | `idx_test_attempts_{test_id,user_id,submitted_at}`, `idx_refresh_tokens_token_hash` only in migrations; `test_attempts_*_idx`, `refresh_tokens_token_hash_idx` only in schema.ts | 4 renames (4b) |
| Undeclared indexes | 3 | `idx_users_locked_until`, `idx_refresh_tokens_expires_at`, `question_search_documents_search_text_trgm_idx` (`USING gin (search_text extensions.gin_trgm_ops)`) only in migrations | 3 (4b) |
| DESC index columns | 2 | `question_drafts_owner_test_updated_idx`, `question_drafts_test_updated_idx`: migrations `updated_at DESC`, schema.ts `updated_at` | 2 (4g) |
| FK names | 6 (3 renames) | `test_attempts_test_id_fkey`, `test_attempts_user_id_fkey`, `refresh_tokens_user_id_fkey` only in migrations; `*_tests_id_fk` / `*_users_id_fk` only in schema.ts | 3 FK renames (4g) |
| PK name | 4 (1 rename) | constraint and backing index `test_assignments_pkey` only in migrations; `test_assignments_test_id_user_id_pk` only in schema.ts | 1 PK rename (4g) |

Total: 25 + 25 + 10 + 8 + 3 + 2 + 6 + 4 = 83. Every class research measured appears, and nothing else does: no enum, extension, column default/nullability or other constraint differences. The full report was saved at `$TMPDIR/drz01-baseline.txt` during the run. Excerpt:

```
DRZ-01 FAILED: migrations and schema.ts differ
  table answer_keys: rls migrations=true schema.ts=false
  table answer_keys: policy deny_direct_access only in migrations: PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false)
  ...
  table question_drafts: index question_drafts_test_updated_idx definition: migrations=CREATE INDEX question_drafts_test_updated_idx ON public.question_drafts USING btree (test_id, updated_at DESC) schema.ts=CREATE INDEX question_drafts_test_updated_idx ON public.question_drafts USING btree (test_id, updated_at)
  table question_search_documents: index question_search_documents_search_text_trgm_idx only in migrations: CREATE INDEX question_search_documents_search_text_trgm_idx ON public.question_search_documents USING gin (search_text extensions.gin_trgm_ops)
  table refresh_tokens: constraint refresh_tokens_user_id_fkey only in migrations: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  table refresh_tokens: constraint refresh_tokens_user_id_users_id_fk only in schema.ts: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  table test_assignments: constraint test_assignments_pkey only in migrations: PRIMARY KEY (test_id, user_id)
  table test_assignments: constraint test_assignments_test_id_user_id_pk only in schema.ts: PRIMARY KEY (test_id, user_id)
  table test_attempts: column submitted_at type: migrations=timestamp with time zone schema.ts=timestamp without time zone
  table test_attempts: index idx_test_attempts_test_id only in migrations: CREATE INDEX idx_test_attempts_test_id ON public.test_attempts USING btree (test_id)
  table users: column locked_until type: migrations=timestamp with time zone schema.ts=timestamp without time zone
  table users: index idx_users_locked_until only in migrations: CREATE INDEX idx_users_locked_until ON public.users USING btree (locked_until)
  table users: policy deny_direct_access only in migrations: PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false)
(83 differences)
```

**Extra differences beyond research for Task 3:** none in the baseline. One more appeared during Task 3. `.desc()` alone generated `DESC NULLS LAST`, which PostgreSQL keeps distinct from the migration's `DESC` (NULLS FIRST by default). Declaring `.desc().nullsFirst()` resolved it (see Deviations).

**Progression:** 83, then 70 after the 10 withTimezone edits and `users` alone (RLS, policy and `idx_users_locked_until` all cleared, so the 0.45 `pgPolicy` + `.enableRLS()` reproduces 0018's policy row exactly and the plan's STOP condition did not apply), then 2 after all 25 tables and the index/FK/PK edits (only the NULLS ordering), then 0.

## TDD evidence (Task 2, no-commit mode)

**RED** (old `timestamp()` declarations, with `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/db/timestamps.test.ts`): exit 1, 4 failed and 2 passed (UTC).

```
 ❯ src/db/timestamps.test.ts (6 tests | 4 failed) 182ms
     × users.locked_until keeps the instant under Asia/Bangkok 10ms
     × refresh_tokens.expires_at keeps the instant under Asia/Bangkok 4ms
     × users.locked_until keeps the instant under America/New_York 5ms
     × refresh_tokens.expires_at keeps the instant under America/New_York 3ms
 FAIL  src/db/timestamps.test.ts > timestamptz round trip > users.locked_until keeps the instant under Asia/Bangkok
AssertionError: Expected values to be strictly equal:
- 1790417472345
+ 1790442672345          (+25 200 000 ms = +7 h)
 FAIL  ... > users.locked_until keeps the instant under America/New_York
- 1790417472345
+ 1790403072345          (-14 400 000 ms = -4 h)
```

The failures are assertion failures on the planned behaviour. They are not load or connection errors, and each test first asserts `SHOW timezone` equals the zone. Two evidence records (Bangkok `users.locked_until`, New York `refresh_tokens.expires_at`) were built from a real `--reporter=tap-flat` run. Vitest TAP does not print node:test's `# tests/# pass/# fail` summary, so those lines were appended mechanically from the `ok`/`not ok` lines. `gsd-tools check tdd-red-evidence` returned `RED_EVIDENCE_OK / target_test_failed` for both.

**GREEN** (after the 10 `withTimezone: true` edits): `Test Files 1 passed (1)`, `Tests 6 passed (6)`, exit 0.

**Bare run** (`yarn workspace @bio-exam/server vitest run src/db/timestamps.test.ts`, no `TEST_DATABASE_URL`): exit 1, `Test Files 1 failed (1)`, error `DB-backed test needs TEST_DATABASE_URL: run it through node scripts/with-test-db.mjs -- <command> or yarn verify`. Vitest lists the 6 tests as "skipped" because their `beforeAll` hook failed, but the file and the run both fail, so nothing passes silently (D-03).

**REFACTOR:** none needed.

## Task Commits (ready to commit, not committed)

Per the standing rule, nothing was committed and everything is in the working tree. Proposed commits:

1. **Task 1** (comparator): `feat: Сравнение каталогов цепочки миграций и schema.ts для DRZ-01`
   - `scripts/lib/schema-fingerprint.mjs` (new), `scripts/check-migrations.mjs` (new)
   - `scripts/` as a whole is still untracked from 01-01 (`scripts/lib/test-db.mjs`, `scripts/with-test-db.mjs`). Stage the 01-01 commit first, or add only these two files.
2. **Task 2** (helpers, regression test, timestamptz): `fix: timestamptz в schema.ts и тест сохранения времени при поясе сессии не UTC`
   - `app/server/src/test-support/test-database.ts` (new), `app/server/src/db/timestamps.test.ts` (new), `app/server/src/db/schema.ts` (the 10 `withTimezone` lines only)
3. **Task 3** (RLS, policies, names): `fix: schema.ts описывает реальную базу: RLS, политики, имена индексов и ключей`
   - `app/server/src/db/schema.ts` (the rest)
   - Tasks 2 and 3 both edit `schema.ts`. Split them with `git add -p`, or make one commit: `fix: schema.ts описывает базу из цепочки миграций (timestamptz, RLS, индексы, ключи)` with the Task 2 files.

**Plan metadata:** not committed (`commit_docs: false`, `.planning/` gitignored).

## Files Created/Modified

- `scripts/lib/schema-fingerprint.mjs` (new, 273 lines): `fingerprintDatabase`, `diffFingerprints`.
- `scripts/check-migrations.mjs` (new, 214 lines): DRZ-01 comparison stage. `compareChainWithSchema()` is a separate function so that 01-08 can add the snapshot, manifest and idempotency stages next to it.
- `app/server/src/test-support/test-database.ts` (new): `requireTestDatabaseUrl`, `createScratchDatabase(prefix)`, `migrateTestDatabase(url)`, `ScratchDatabase` type.
- `app/server/src/db/timestamps.test.ts` (new): 6 tests (2 columns x 3 zones).
- `app/server/src/db/schema.ts`: `pgPolicy` import, `denyDirectAccessPolicy()` helper, `.enableRLS()` on 25 tables, `denyDirectAccess` key in 25 extra-config objects (6 tables got their first callback: `roles`, `rbac_page_rules`, `test_scoring_settings`, `test_timer_settings`, `app_settings`, `student_groups`), 10 `withTimezone`, new keys `lockedUntilIdx`, `expiresAtIdx`, `searchTextTrgmIdx`, `testIdFk`/`userIdFk` (test_attempts), `userIdFk` (refresh_tokens), named `test_assignments_pkey`, `desc().nullsFirst()` on two question_drafts indexes. LF and Prettier-clean (repo config).

## CodeGraph impact (run before editing schema.ts)

- `testAttempts`: `schema.ts` (`testSessions`, `testsRelations`, `testAttemptsRelations`, `testSessionsRelations`), `routes/tests/index.ts`, `routes/tests/public.ts`, `routes/users/index.ts`, `routes/index.ts`.
- `refreshTokens`: `routes/auth/login.ts`, `routes/auth/logout.ts`, `routes/auth/refresh.ts`, `routes/auth/index.ts`, `routes/index.ts`.
- `users` (server constant): `middleware/auth/session.ts`, `routes/auth/{invites,login,me,index}.ts`, `routes/groups/index.ts`, `routes/tests/{assignments,index}.ts`, `routes/users/{avatar,index,profile}.ts`, `routes/index.ts`, `scripts/bootstrap-admin.ts`.
- Also touched: `testSessions` (`routes/tests/public.ts`), `testAssignments` (`routes/tests/assignments.ts`, `routes/tests/public.ts`, `routes/users/index.ts`), `questionDrafts` (`routes/tests/index.ts`), `testTimerSettings` and `questionSearchDocuments` (no callers outside `schema.ts` in the index).
- None of these callers needed a change. The runtime type of the timestamp columns stays `Date`. `.enableRLS()` returns `Omit<PgTableWithColumns<T>, 'enableRLS'>`, which still type-checks in `relations()`, `db.query.*` and `db.select()` (server typecheck exit 0, 0 `error TS`). Removing `.references()` from three columns changes nothing at runtime, because the relations use explicit `fields`/`references`.
- `codegraph affected app/server/src/db/schema.ts` lists two test files among its 20 entries: `app/server/src/db/timestamps.test.ts` (6/6 pass) and `app/web/lib/auth/getServerMe.test.ts` (14/14 pass, no real schema dependency). The other entries are source files.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `.desc()` alone does not reproduce the migration's `DESC` index columns**
- **Found during:** Task 3 (step 5)
- **Issue:** drizzle-kit 0.31 emits `"updated_at" DESC NULLS LAST` for `t.updatedAt.desc()`. The plan's text was `t.updatedAt.desc()`. PostgreSQL's default for `DESC` is NULLS FIRST, so the comparator showed `updated_at DESC` (migrations) against `updated_at DESC NULLS LAST` (schema.ts) on both question_drafts indexes. This difference changes the index's sort order, not just its name.
- **Fix:** `t.updatedAt.desc().nullsFirst()`. Kit emits `DESC NULLS FIRST`, which the server canonicalises to `updated_at DESC`.
- **Files modified:** app/server/src/db/schema.ts
- **Verification:** the comparator went from 2 differences to 0.

---

**Total deviations:** 1 auto-fixed (1 bug, a plan-text correction needed to reach the DRZ-01 zero state).
**Impact on plan:** None on scope. No migration was added or edited, no package was installed, no allowlist was used.

## Issues Encountered

- My first Python edit script had a bad end-of-block regex. It raised before writing anything, so `schema.ts` was untouched, and the second run applied cleanly.
- Prettier wrapped one over-long index line in `schema.ts` and formatted the two new `.mjs` files. The pre-edit `schema.ts` was already Prettier-clean, so no unrelated lines changed.

## Verification Results

- `node scripts/check-migrations.mjs`: exit 0, prints `DRZ-01: chain == schema.ts` (150 declared statements applied to `test_migchk_decl_*`).
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/db src/lib src/schemas`: 5 files, 51 tests passed, exit 0. Scoped on purpose: the run does not collect the 01-07/01-16 files.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/db/timestamps.test.ts`: 6/6 passed.
- The same command without the wrapper exits 1 with the hint (never skips).
- `yarn workspace @bio-exam/server typecheck`: exit 0, 0 `error TS`.
- `git status --porcelain app/server/drizzle`: empty, before and after every run.
- `ls -d $TMPDIR/bio-exam-drizzle-decl-* $TMPDIR/bio-exam-pg-*`: 0 after every run. A SIGINT 1.2 s into the comparator gives exit 130 with nothing left behind.
- Acceptance greps: `withTimezone: true` = 10, `enableRLS()` = 25, `denyDirectAccessPolicy` = 26 lines (25 calls + the definition), `pgPolicy('deny_direct_access'` = 1 (inside the helper). The named objects `idx_users_locked_until`, `idx_refresh_tokens_expires_at`, `question_search_documents_search_text_trgm_idx`, `gin_trgm_ops`, `test_attempts_test_id_fkey`, `refresh_tokens_user_id_fkey` and `test_assignments_pkey` are present. The fingerprint and check scripts contain every required token.

## Known Stubs

None.

## Threat Flags

None. T-1-12: DDL only runs on `test_migchk_*` scratch databases from `createScratchDatabase` (guarded). `drizzle-kit generate` runs without `--config` into an `os.tmpdir()` directory, and the `app/server/drizzle` status is asserted. T-1-13: the comparator reports zero differences, and no difference needed a database change. T-1-14: the output names only tables, columns, indexes and scratch database names, never a URL.

## User Setup Required

None.

## Next Phase Readiness

- 01-08 can add the snapshot restore (from the corrected `schema.ts`), the sha256 manifest and the idempotency stage to `scripts/check-migrations.mjs` next to `compareChainWithSchema`.
- `yarn verify` / CI can call `node scripts/check-migrations.mjs`. It honours `TEST_DATABASE_URL` (CI service container) and starts its own cluster otherwise.
- Note for 01-08: the generated DDL names the gin opclass unqualified (`gin_trgm_ops`). It resolves on the declared side only because the comparator sets `search_path TO public, extensions`. A snapshot built from this `schema.ts` carries the same unqualified name, so any later re-creation of that index from generated SQL needs `extensions` on the search path.
- Later DB-backed tests should use `app/server/src/test-support/test-database.ts`. `RLS` is now declared, so the harness must keep connecting as the superuser/owner (Pitfall 15).
- Backstop: the live Supabase session timezone (A7) is still unconfirmed and is checked by 01-12 (D-07).

---
*Phase: 01-verification-baseline*
*Completed: 2026-10-03*

## Self-Check: PASSED

- Created files exist: `scripts/lib/schema-fingerprint.mjs`, `scripts/check-migrations.mjs`, `app/server/src/test-support/test-database.ts`, `app/server/src/db/timestamps.test.ts`. Modified: `app/server/src/db/schema.ts`.
- Commits: none, by rule. `commits: 0` measured, HEAD is still `11b2916`.
- Every task's acceptance criteria and the plan-level `<verification>` were re-run above and pass.
- STATE.md, ROADMAP.md and REQUIREMENTS.md were not modified.
