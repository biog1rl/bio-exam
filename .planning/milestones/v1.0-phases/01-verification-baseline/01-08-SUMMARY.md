---
phase: 01-verification-baseline
plan: 08
subsystem: database
tags: [drizzle, drizzle-kit, snapshot, migrations, sha256, manifest, node-test, postgres]

# Dependency graph
requires:
  - phase: 01-verification-baseline
    provides: "01-05 DRZ-01 comparator (compareChainWithSchema, schema-fingerprint.mjs) and the corrected schema.ts (D-28, .desc().nullsFirst(), unqualified gin_trgm_ops); 01-01 harness (acquireTestServer, createScratchDatabase, assertDatabaseSettings, isolatedChildEnv, with-test-db.mjs); 01-02 drizzle-kit 0.31.11 / drizzle-orm 0.45.3"
provides:
  - "app/server/drizzle/meta/0020_snapshot.json: current v0 (version 7) snapshot generated from the corrected schema.ts, id 8ec59738-0f9a-40ec-9de2-6537d597a086, prevId = 0015 id c63e796f-0b39-41ae-bc8b-50859c975721"
  - "app/server/drizzle/migrations-manifest.json: checksumAlgorithm sha256, 21 entries {idx, tag, file, sha256} in journal order"
  - "scripts/check-migrations.mjs: exported stages checkManifest, compareChainWithSchema, checkIdempotency, checkGenerateNoDiff, checkDrizzleCheck, STOP_MESSAGE; main() prints 'ok - <stage>' x5 then 'check-migrations: OK' (or 'check-migrations: FAILED (<stages>)')"
  - "scripts/check-migrations.test.mjs: 10 node:test cases on temp copies of app/server/drizzle"
affects: [01-09, 01-10, 01-15, verify, ci, any future drizzle migration]

# Actuals (#2632)
actuals:
  tokens: 25000
  tasks: 3
  commits: 0
plan_head_before: 11b291649c54eec9678edf0a441232a92b631197
plan_head_after: 11b291649c54eec9678edf0a441232a92b631197

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "drizzle-kit is called only with --dialect/--schema/--out (never the config-file flag) and --out is a path RELATIVE to app/server: kit 0.31.11 reads snapshots as `./${path}`, so an absolute path to a folder with snapshots fails with ENOENT"
    - "Migration-folder stages take a folder path and work on their own temp copy (bio-exam-drizzle-kit-*), so they are testable on fixtures and never write to app/server/drizzle"
    - "Root tooling tests use node:test (node --test scripts/<name>.test.mjs), zero dependencies; the script guards main() so importing it from a test never starts a cluster"

key-files:
  created:
    - app/server/drizzle/meta/0020_snapshot.json
    - app/server/drizzle/migrations-manifest.json
    - scripts/check-migrations.test.mjs
  modified:
    - scripts/check-migrations.mjs

key-decisions:
  - "The snapshot is the unedited output of a probe generate on a scratch copy; its prevId already equalled the 0015 id, so no field was changed by hand"
  - "drizzle-kit --out is passed relative to app/server in every stage, including the 01-05 generateDeclaredSql (its empty temp dir hid the bug)"
  - "drizzle-check fails on a non-zero exit, a missing \"Everything's fine\" line, or any journal 'Warning:' (kit only warns when journal timestamps are not strictly increasing, and the migrator then skips entries)"
  - "idempotency also compares __drizzle_migrations.created_at with journal 'when' per position, in addition to the hash list and row count"
  - "Stages run collect-and-continue: a failing stage does not hide later ones; the final line names every failed stage"

patterns-established:
  - "Stage report format: 'ok - <stage>' / 'not ok - <stage>' + indented detail lines; kit summary lines go to stderr as '[check-migrations] <stage>: <last kit line>'"

requirements-completed: [DRZ-02, DRZ-03, DRZ-01]

coverage:
  - id: D1
    description: "Snapshot continuity restored through 0020 with supported tooling: generate on a copy reports no schema changes and creates no file; drizzle-kit check passes; SQL 0000-0020, journal and old snapshots byte-identical"
    requirement: DRZ-02
    verification:
      - kind: unit
        ref: "scripts/check-migrations.test.mjs#generate-no-diff: the restored snapshot produces no new file"
        status: pass
      - kind: unit
        ref: "scripts/check-migrations.test.mjs#drizzle-check: the repository folder passes"
        status: pass
      - kind: other
        ref: "git diff --quiet HEAD -- 'app/server/drizzle/*.sql' app/server/drizzle/meta/_journal.json meta/0000|0001|0015_snapshot.json (exit 0); shasum -a 256 before == after"
        status: pass
    human_judgment: false
  - id: D2
    description: "sha256 manifest of the 21 applied migrations; check-migrations fails on an edited, renamed, reordered, unjournaled or missing file"
    requirement: DRZ-02
    verification:
      - kind: unit
        ref: "scripts/check-migrations.test.mjs#manifest: * (6 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A generated diff with DROP stops the check with the plan-009 STOP message instead of being applied or auto-answered"
    requirement: DRZ-02
    verification:
      - kind: unit
        ref: "scripts/check-migrations.test.mjs#generate-no-diff: without meta/0020_snapshot.json the destructive diff stops the check"
        status: pass
    human_judgment: false
  - id: D4
    description: "Real runner is idempotent: second run applies nothing, __drizzle_migrations holds exactly the 21 manifest hashes (and journal 'when') in order"
    requirement: DRZ-03
    verification:
      - kind: integration
        ref: "env -u TEST_DATABASE_URL node scripts/check-migrations.mjs#ok - idempotency"
        status: pass
      - kind: other
        ref: "ad-hoc negative control via with-test-db.mjs: tampered manifest copy -> 'position 7 0007_global_scoring_settings: hash ... differs from the manifest'"
        status: pass
    human_judgment: false
  - id: D5
    description: "[BLOCKING] schema verification from zero on a fresh disposable PostgreSQL 17.10 cluster: all five stages pass (DRZ-01 chain == schema.ts), timestamps test passes, drizzle.config guard proven two-sided"
    requirement: DRZ-01
    verification:
      - kind: integration
        ref: "env -u TEST_DATABASE_URL node scripts/check-migrations.mjs (exit 0, check-migrations: OK)"
        status: pass
      - kind: integration
        ref: "node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/db/timestamps.test.ts (6/6, exit 0)"
        status: pass
      - kind: other
        ref: "drizzle.config .then() probes: db.example.invalid -> exit 3 + guard message; 127.0.0.1/test_x -> exit 0"
        status: pass
    human_judgment: false

# Metrics
duration: 9min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 08: Drizzle snapshot restore, migration manifest and full check-migrations gate Summary

**`meta/0020_snapshot.json` (generated by drizzle-kit 0.31.11 from the corrected `schema.ts`, `prevId` = 0015) closes the snapshot gap, so `generate` now reports "No schema changes" instead of a spurious 0021. A sha256 manifest pins the 21 applied SQL files in journal order. `scripts/check-migrations.mjs` is now the single DRZ-01..03 gate: five stages (manifest, chain-vs-schema, idempotency, generate-no-diff, drizzle-check), with a STOP on any generated DROP. It passes from zero on a disposable PostgreSQL 17.10 cluster.**

## Performance

- **Duration:** about 9 min
- **Started:** 2026-10-03T07:40:50Z
- **Completed:** 2026-10-03T07:49Z
- **Tasks:** 3/3
- **Files:** 4 (3 created, 1 modified)

## Accomplishments

- **Snapshot restore (D-04, option B).** A probe `generate --name=probe` on a scratch copy emitted the expected spurious `0021_probe.sql` (109 lines). Statement histogram: 53 `ALTER TABLE`, 12 `CREATE INDEX`, 25 `CREATE POLICY`, 1 `CREATE TABLE`, 6 `DROP INDEX`. That is the stale-0015 baseline, expected and not the plan-009 STOP. The probe SQL was never applied and was deleted with the scratch dir. Only `meta/0021_snapshot.json` was kept, as `meta/0020_snapshot.json`. Its `prevId` was already `c63e796f-…` (the 0015 id), so no field was edited.
- **Post-restore proof** on a fresh copy:
  - `drizzle-kit generate --dialect=postgresql --schema=./src/db/schema.ts --out=<copy>`: exit 0, and the before/after hash listing of the copy is identical. The kit's last line is quoted verbatim: `No schema changes, nothing to migrate 😴`
  - `drizzle-kit check --dialect=postgresql --out=<copy>`: exit 0, output `Everything's fine 🐶🔥`
- **Manifest:** `migrations-manifest.json` has 21 entries in journal order. Its hashes equal `shasum -a 256 app/server/drizzle/*.sql`, checked by diffing the two outputs.
- **check-migrations.mjs** was refactored into exported stage functions with a guarded `main()`. The 01-05 DRZ-01 stage is unchanged in behaviour and still prints `DRZ-01: chain == schema.ts`.
- **[BLOCKING] gate passed from zero** (output below).

## Task Commits (ready to commit, not committed)

Per the user's standing rule, nothing was committed and nothing was staged. All changes are in the working tree.

1. **Task 1: restore meta/0020_snapshot.json and write the checksum manifest.** Proposed message: `fix: Восстановлен снимок Drizzle 0020 и манифест контрольных сумм миграций`
   ```
   ?? app/server/drizzle/meta/0020_snapshot.json
   ?? app/server/drizzle/migrations-manifest.json
   ```
2. **Task 2 (tdd): complete check-migrations.mjs with the manifest, idempotency, generate-no-diff and check stages.** Proposed message: `feat: Полная проверка миграций: манифест, идемпотентность, generate без diff и drizzle-kit check`
   ```
   ?? scripts/check-migrations.mjs        (created by 01-05, still untracked; extended here)
   ?? scripts/check-migrations.test.mjs
   ```
3. **Task 3 ([BLOCKING] schema verification).** This task only runs checks: the `server_version`/settings report line it needs was added to `check-migrations.mjs` and belongs to the Task 2 commit. No separate commit.

`scripts/check-migrations.mjs` and `scripts/lib/*` were created by 01-05/01-01 and are still untracked. If the user commits 01-05 first, the Task 2 commit carries only this plan's diff of `check-migrations.mjs` plus the test file.

**Plan metadata:** not committed (`commit_docs: false`, `.planning/` gitignored).

## TDD Gate (Task 2)

- **RED:** `node --test scripts/check-migrations.test.mjs` failed with exit 1: `SyntaxError: The requested module './check-migrations.mjs' does not provide an export named 'checkDrizzleCheck'` (tests 1, fail 1). The failure is an ESM link error, so the old unconditional `main()` never ran.
- **GREEN:** after the refactor, 10/10 pass (`ℹ tests 10`, `ℹ pass 10`, `ℹ fail 0`, about 2.3 s).
- **REFACTOR:** oxfmt only (formatting).

## Task 3: [BLOCKING] verification record

`env -u TEST_DATABASE_URL node scripts/check-migrations.mjs` (the shell had no `TEST_DATABASE_URL`, so the harness started its own cluster) gave exit 0:

```
ok - manifest
[test-db] cluster 127.0.0.1:60994 (…/bio-exam-pg-X62SfG)
[check-migrations] test_migchk_chain_18915_6afb81: server_version 17.10 (Homebrew), encoding UTF8, datcollate en_US.UTF-8, datctype en_US.UTF-8, TimeZone UTC
[check-migrations] test_migchk_decl_18915_16e867: server_version 17.10 (Homebrew), encoding UTF8, datcollate en_US.UTF-8, datctype en_US.UTF-8, TimeZone UTC
[check-migrations] chain applied to test_migchk_chain_18915_6afb81
[check-migrations] schema.ts DDL (150 statements) applied to test_migchk_decl_18915_16e867
DRZ-01: chain == schema.ts
ok - chain-vs-schema
ok - idempotency
ok - generate-no-diff
[check-migrations] generate-no-diff: No schema changes, nothing to migrate 😴
ok - drizzle-check
[check-migrations] drizzle-check: Everything's fine 🐶🔥
check-migrations: OK
```

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/db/timestamps.test.ts`: 1 file, 6/6 passed, exit 0.
- drizzle.config probes:
  - Negative control (`BIO_EXAM_ISOLATED_ENV=1`, `TEST_DATABASE_URL` host `db.example.invalid`): **exit 3**, message `TEST_DATABASE_URL host db.example.invalid is not localhost or 127.0.0.1`.
  - Positive control (`127.0.0.1:5432/test_x`): **exit 0**.
- Config-file flag grep on code lines of `check-migrations.mjs`: 0. A plain grep for the flag across both script files also finds nothing, comments included.
- `git status --porcelain app/server`, restricted to `drizzle/` and `src/db/schema.ts`:
  ```
   M app/server/src/db/schema.ts                     (01-05, unchanged by this plan)
  ?? app/server/drizzle/meta/0020_snapshot.json
  ?? app/server/drizzle/migrations-manifest.json
  ```
- `ls -d $TMPDIR/bio-exam-pg-* $TMPDIR/bio-exam-drizzle-*`: 0 after every run (check script, tests, ad-hoc controls).

## Files Created/Modified

- `app/server/drizzle/meta/0020_snapshot.json` (new): v0 snapshot, version 7, dialect postgresql, 25 tables.
- `app/server/drizzle/migrations-manifest.json` (new): `{ checksumAlgorithm: "sha256", migrations: [{ idx, tag, file, sha256 }] x21 }`.
- `scripts/check-migrations.mjs` (modified): exports `checkManifest(dir)`, `compareChainWithSchema({chain, decl, tmpDir})`, `checkIdempotency(url, dir)`, `checkGenerateNoDiff(dir)`, `checkDrizzleCheck(dir)` and `STOP_MESSAGE`. Every stage returns `{ ok, lines, … }`. Also adds `kitOutArg` (relative `--out`), `activeTmpDirs`, which signal cleanup removes, the `describeDatabase` report line, a git status check of `app/server/drizzle` around the whole run, and the `main()` import guard.
- `scripts/check-migrations.test.mjs` (new): 10 `node:test` cases. Manifest (6): repo passes, one changed byte in 0005, unjournaled `0021_x.sql`, swapped journal entries 5/6, missing 0007, renamed 0003. Generate (2): restored passes; without `0020_snapshot.json` it gives STOP and `DROP`, and the input dir is untouched. Check (2): repo passes; a snapshot collision fails. An `after()` hook asserts that `git status app/server/drizzle` is unchanged.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] drizzle-kit 0.31.11 cannot take an absolute `--out` for a folder with snapshots**
- **Found during:** Task 1, step 2
- **Issue:** `validateWithReport` reads each snapshot with `readFileSync(`./${it}`)`, so `--out=/var/folders/…` became `.//var/folders/…/meta/0000_snapshot.json` and failed with ENOENT. The 01-05 `generateDeclaredSql` passed an absolute path and only worked because its temp dir had no `meta/`.
- **Fix:** every drizzle-kit call computes `--out` with `path.relative(app/server, dir)` (`kitOutArg`). It runs with cwd `app/server` (manually, and through `yarn workspace`). `generateDeclaredSql` uses it too, so the latent bug is closed.
- **Files modified:** scripts/check-migrations.mjs
- **Verification:** probe and proof runs, all generate/check tests, and the full script.

**2. [Rule 2 - Missing critical] Report line for server version and database settings**
- **Found during:** Task 3, step 4
- **Issue:** the SUMMARY must record the server version, collation and timezone, but nothing printed them.
- **Fix:** `describeDatabase()` logs one stderr line per scratch DB (`SHOW server_version` plus the `assertDatabaseSettings` result). No URL is printed.
- **Files modified:** scripts/check-migrations.mjs

**3. [Rule 2 - Missing critical] Stricter checks in idempotency and drizzle-check**
- idempotency also compares `created_at` with the journal `when` at each position.
- drizzle-check treats a journal `Warning:` as a failure. Kit exits 0 on non-increasing `when`, but the migrator would then skip entries.

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 missing-critical).
**Impact on plan:** no scope change. No SQL, journal or old snapshot was touched. No push, no install, no prompt was answered.

## Issues Encountered

- My first ad-hoc idempotency negative control was wrong: the stage reads the table before migrating, so the empty DB never got a table. The second version migrated first. The genuine run returned `ok` with 21 rows, and a tampered manifest copy failed with `position 7 0007_global_scoring_settings: hash … differs from the manifest`. A wholly empty DB fails the stage with `relation "public.__drizzle_migrations" does not exist`, which is the correct "chain not built" behaviour.
- In zsh, `${PIPESTATUS[0]}` is empty, so the timestamps exit code was re-measured without a pipe: 0.

## Known Stubs

None.

## Threat Flags

None. T-1-15: the manifest, the `git diff --quiet HEAD` check, generate on temp copies only, and the DROP STOP are all in place and tested. T-1-16: no drizzle-kit call passes the config-file flag (grep 0), and the guard is proven by the two-sided probe. T-1-SC: no installs.

## User Setup Required

None.

## Next Phase Readiness

- 01-09 (e2e) can run on this tree. This plan touched only its four declared files.
- 01-10/01-15 can call `node scripts/check-migrations.mjs` from `yarn verify` and CI. It honours `TEST_DATABASE_URL` and starts its own cluster otherwise. Root `node --test scripts/check-migrations.test.mjs` needs no database. It runs drizzle-kit in about 2.3 s.
- Any future migration: the 0020 snapshot is now the generate baseline, and adding a migration means adding its manifest entry (`check-migrations` fails otherwise).
- Carried over from 01-05: the snapshot names `gin_trgm_ops` unqualified. Re-creating that index from generated SQL needs `extensions` on the `search_path`.

---
*Phase: 01-verification-baseline*
*Completed: 2026-10-03*

## Self-Check: PASSED

- Files exist: `app/server/drizzle/meta/0020_snapshot.json`, `app/server/drizzle/migrations-manifest.json`, `scripts/check-migrations.mjs`, `scripts/check-migrations.test.mjs`.
- Commits: none, by rule. `commits: 0` was measured, and HEAD is still `11b2916`.
- Every plan verify command was re-run and passes:
  - prevId/manifest node check: exit 0
  - `git diff --quiet HEAD` on SQL, journal and old snapshots: 0
  - `ls app/server/drizzle/*.sql | wc -l` = 21
  - `node --test`: 10/10
  - full script: `check-migrations: OK`
  - timestamps: 6/6
  - probes: 3, then 0
  - config-flag grep: 0
  - oxfmt `--check`: clean
  - oxlint: 0
- STATE.md, ROADMAP.md and REQUIREMENTS.md were not modified.
