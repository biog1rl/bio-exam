---
phase: 01-verification-baseline
plan: 12
subsystem: database
tags: [postgres, pg_dump, drizzle, supabase, schema-drift]

requires:
  - phase: 01-verification-baseline
    provides: "01-01 disposable-cluster harness (scripts/lib/test-db.mjs); 01-08 migrations-manifest.json"
provides:
  - "scripts/compare-schema-dump.mjs: normalises a user-supplied schema-only dump, diffs it against the migrated chain, classifies hunks, checks timezone/collation and __drizzle_migrations history"
  - "01-SCHEMA-DIFF.md: D-07 report; live schema equals the chain; migration history diverged in format"
affects: [milestone-2-beget-migration, 01-verification]

actuals:
  tokens: 11280
  tasks: 3
  commits: 0
plan_head_before: 11b291649c54eec9678edf0a441232a92b631197
plan_head_after: 11b291649c54eec9678edf0a441232a92b631197

tech-stack:
  added: []
  patterns:
    - "Comparator never connects to production: it reads only user-produced dump files and uses disposable test_* databases"
    - "Line-level noise classifier defaults to реальное отличие; unrecognised groups are reclassified by hand in the report"

key-files:
  created:
    - scripts/compare-schema-dump.mjs
    - .planning/phases/01-verification-baseline/01-SCHEMA-DIFF.md
  modified:
    - .planning/phases/01-verification-baseline/deferred-items.md

key-decisions:
  - "Group 1 (six Supabase extensions.* event-trigger functions) reclassified by hand as platform noise; the classifier is not taught dollar-quoted spans in this plan (logged to deferred-items.md)"
  - "Migration-history divergence is reported, not fixed: normalising live __drizzle_migrations rows is a Milestone 2 decision"

requirements-completed: [DRZ-01]

coverage:
  - id: D1
    description: "Comparator script with a self-test: normalises dumps, diffs against the migrated chain, classifies hunks, parses tag and sha256 history rows"
    requirement: DRZ-01
    verification:
      - kind: unit
        ref: "node scripts/compare-schema-dump.mjs --self-test"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-07 report: live Supabase schema compared once, read-only, with the 0000-0020 chain; timezone UTC (A7), collation en_US.UTF-8, history divergence recorded"
    requirement: DRZ-01
    verification:
      - kind: other
        ref: "test -s 01-SCHEMA-DIFF.md && grep -qE 'timezone|открыто'; leak grep returns nothing"
        status: pass
    human_judgment: true
    rationale: "The classification of the two diff groups and the migration-history conclusions are a reviewer judgment over user-supplied production data that nobody else can re-derive; the user should read the report"

duration: multi-session (two executors and a user checkpoint)
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 12: Production schema vs migration chain (D-07) Summary

**Read-only comparison of the live Supabase schema with migrations 0000-0020: application schema is identical, live migration history is mixed-format (15 of 22 rows store a tag, not sha256) and carries one orphan row.**

## Performance

- **Duration:** multi-session (first executor Task 1, user checkpoint Task 2, this executor Task 3)
- **Completed:** 2026-10-03
- **Tasks:** 3 of 3
- **Files:** 2 created, 1 modified (all uncommitted)

## Findings first (for the orchestrator to surface to the user)

1. **Migration history has diverged in format.** Live `public.__drizzle_migrations` has 22 rows: 7 rows (0014-0020) store sha256 and equal `migrations-manifest.json`; 14 rows (0000-0013) store the migration name in `hash` instead of sha256, so their checksums cannot be verified; 1 row, `0010_test_drafts`, has no counterpart in the chain and no file ever existed in git (source not established). Cause of the tag rows and of `created_at bigint NOT NULL`: the pre-`f9d0e45` hand-written runner created the table and wrote names; drizzle-orm 0.45.3's `CREATE TABLE IF NOT EXISTS` kept it.
2. **Application schema equals the chain.** `public` (26 tables, 26 RLS enablements, 26 policies, 33 indexes) and `extensions` placement of `pg_trgm` show no difference. The clean diff is the evidence that the orphan row left no residual objects.
3. **Two diff groups, neither a drift of application schema:** group 1 is six Supabase `extensions.*` event-trigger functions (hand-reclassified as platform noise, 218 lines); group 2 is `__drizzle_migrations.created_at` `NOT NULL` vs nullable (bookkeeping table).
4. **A7 confirmed:** `show timezone` is UTC. Collation `en_US.UTF-8 en_US.UTF-8` equals the harness cluster.
5. **Production is safe with the current runner:** drizzle-orm compares only the latest `created_at` (0020) with journal `when`, so `drizzle:migrate` on production applies nothing already applied. Milestone 2 must not mix "restore dump incl. `__drizzle_migrations`" with "rebuild by chain" (plans/beget-migration.md section 3.1.2).

## Accomplishments

- `scripts/compare-schema-dump.mjs` (Task 1, first executor): `--prod`, `--prod-meta`, `--report`, `--self-test`; two scratch databases in one temporary cluster; `normalize` drops comments, blank lines, `\restrict`/`\unrestrict` tokens and the session preamble.
- Task 2: the user ran the read-only dump and metadata commands; the executor checked only `test -s`.
- Task 3: comparison run against the user's files, `01-SCHEMA-DIFF.md` written in Russian with classification table, timezone, collation, hash/name comparison, blind-spot list; leak check clean.

## Task Commits

Nothing committed (user's standing no-commit rule). Ready to commit, not committed:

1. **Tasks 1 and 3 script:** `scripts/compare-schema-dump.mjs` (untracked). Proposed message: `feat: Скрипт сравнения схемы Supabase с цепочкой миграций (D-07)`
2. **Task 3 report:** `.planning/` is gitignored in this repo, so `01-SCHEMA-DIFF.md`, `deferred-items.md` and this SUMMARY are not tracked by git.

`commits: 0` is measured: `git rev-list --count 11b2916..HEAD` = 0, and the script and docs are in the working tree.

## Files Created/Modified

- `scripts/compare-schema-dump.mjs` - dump normaliser, diff classifier, metadata and history comparison, report builder, self-test (untracked, ready to commit)
- `.planning/phases/01-verification-baseline/01-SCHEMA-DIFF.md` - the D-07 report (gitignored)
- `.planning/phases/01-verification-baseline/deferred-items.md` - appended the classifier gap

## Decisions Made

- Group 1 is reclassified by hand rather than extending the classifier to dollar-quoted spans; logged as deferred.
- History divergence is reported only. No change to `schema.ts`, migrations, snapshots or the live database.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] History check dropped migration-name rows and reported a false verdict**
- **Found during:** Task 3 (first run on real data reported "7 live hashes, 14 not applied")
- **Issue:** `parseProdMeta` accepted only `^[0-9a-f]{64}\s+\d+$`; the 15 live rows whose `hash` holds a migration name were silently ignored, so the report said 14 migrations were never applied.
- **Fix:** `parseProdMeta` now takes every `<key> <digits>` row after the two header lines and tags it `sha256` or `tag` (unparsable lines are counted); `compareHistory` matches by sha256 or by name, reports `matchedByHash`, `matchedByTag` (checksum not verified), `missingLive`, `extraLive`, and checks `created_at` against the journal `when` only for sha256 rows (journal `when` for 0000-0013 is synthetic); the report section was rewritten accordingly; the self-test gained a tag-row and orphan-row case.
- **Files modified:** `scripts/compare-schema-dump.mjs`
- **Verification:** `node scripts/compare-schema-dump.mjs --self-test` prints `compare-schema-dump self-test: OK`; re-run on the user's files gives 22 rows, 7 by sha256, 14 by name, 1 extra, 0 missing.
- **Committed in:** not committed (no-commit rule)

---

**Total deviations:** 1 auto-fixed (1 bug). **Impact on plan:** necessary for a correct D-07 verdict; no scope creep.

## Issues Encountered

- The classifier cannot recognise multi-line function bodies; handled by manual reclassification (plan step 2) and logged in `deferred-items.md`.
- Source of the orphan row `0010_test_drafts` could not be established (no such file in git history).

## Authentication Gates

Task 2 was a planned `checkpoint:human-action`: the user ran the production commands with an interactive password prompt. No agent saw credentials or connected to production.

## User Setup Required

None. `prod-schema.sql` and `prod-meta.txt` stay in the gitignored `.planning/` directory; delete them when no longer needed.

## Known Stubs

None. (The script's report template emits a `<что это значит …>` placeholder per real group for a human to fill; in this plan the assessment was written by hand in `01-SCHEMA-DIFF.md`.)

## Threat Flags

None. No new network endpoints, auth paths or schema changes. The script reads local files only; the leak grep over the report returns nothing.

## Next Phase Readiness

- D-07 is closed; Milestone 2 has a schema baseline and a clear note on how to handle `__drizzle_migrations`.
- Surface to the user: the history divergence and the orphan `0010_test_drafts` row.

## Self-Check: PASSED

- `scripts/compare-schema-dump.mjs`, `01-SCHEMA-DIFF.md`, `deferred-items.md`: FOUND
- Self-test OK; no `bio-exam-schema-diff-*` temp directory and no `bio-exam-pg-*` cluster left
- Plan checks: report `test -s` + `timezone` grep OK; leak grep empty; the two leak-pattern acceptance probes exit as required; `prod-schema.sql` and `prod-meta.txt` do not appear in `git status`
- Commits: none by design (`git rev-list --count 11b2916..HEAD` = 0)

---
*Phase: 01-verification-baseline*
*Completed: 2026-10-03*
