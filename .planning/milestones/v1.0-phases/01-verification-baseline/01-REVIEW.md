---
phase: 01-verification-baseline
reviewed: 2026-10-03T10:38:42Z
depth: standard
files_reviewed: 83
files_reviewed_list:
  - .github/workflows/ci.yml
  - .gitignore
  - .oxfmtrc.json
  - .oxlintrc.json
  - AGENTS.md
  - README.md
  - app/server/.env.example
  - app/server/README.md
  - app/server/drizzle.config.ts
  - app/server/drizzle/migrations-manifest.json
  - app/server/package.json
  - app/server/src/config/env.isolation.test.ts
  - app/server/src/config/env.ts
  - app/server/src/config/test-database-url.test.ts
  - app/server/src/config/test-database-url.ts
  - app/server/src/db/index.ts
  - app/server/src/db/schema.ts
  - app/server/src/db/seed.ts
  - app/server/src/db/timestamps.test.ts
  - app/server/src/lib/tests/question-type-resolver.test.ts
  - app/server/src/lib/tests/scoring.test.ts
  - app/server/src/lib/tests/telemetry.test.ts
  - app/server/src/schemas/tests.test.ts
  - app/server/src/scripts/apply-migration.ts
  - app/server/src/scripts/bootstrap-admin.ts
  - app/server/src/scripts/e2e-seed.ts
  - app/server/src/scripts/isolation-probe.ts
  - app/server/src/services/storage/storage.local.test.ts
  - app/server/src/services/storage/storage.ts
  - app/server/src/test-support/test-database.ts
  - app/server/vitest.config.ts
  - app/web/.env.example
  - app/web/.oxlintrc.json
  - app/web/.vscode/settings.json
  - app/web/app/(internal)/(protected)/admin/tests/lifecycle.test.ts
  - app/web/components/tests/attempt-review/AttemptQuestionsList.test.ts
  - app/web/components/tests/attempt-review/attempt-review-utils.test.ts
  - app/web/components/tests/telemetry.test.ts
  - app/web/lib/auth/getServerMe.test.ts
  - app/web/lib/auth/loginRedirect.test.ts
  - app/web/lib/auth/sessionCookie.test.ts
  - app/web/lib/mdx/normalizeSource.test.ts
  - app/web/package.json
  - app/web/vitest.config.ts
  - e2e/auth.setup.ts
  - e2e/fixtures/accounts.ts
  - e2e/fixtures/exam.ts
  - e2e/fixtures/seed.json
  - e2e/playwright.config.ts
  - e2e/tests/auth.spec.ts
  - e2e/tests/authoring.spec.ts
  - e2e/tests/review.spec.ts
  - e2e/tests/take-test.spec.ts
  - package.json
  - packages/rbac/package.json
  - packages/rbac/src/index.test.ts
  - packages/rbac/tsdown.config.ts
  - packages/rbac/vitest.config.ts
  - scripts/check-ci-workflow.mjs
  - scripts/check-ci-workflow.test.mjs
  - scripts/check-docs-commands.mjs
  - scripts/check-docs-commands.test.mjs
  - scripts/check-docs-structure.test.mjs
  - scripts/check-env-contract.mjs
  - scripts/check-env-contract.test.mjs
  - scripts/check-lockfile.mjs
  - scripts/check-lockfile.test.mjs
  - scripts/check-migrations.mjs
  - scripts/check-migrations.test.mjs
  - scripts/check-rbac-dist.mjs
  - scripts/compare-schema-dump.mjs
  - scripts/e2e.mjs
  - scripts/env-contract.config.json
  - scripts/lib/e2e-web-env.mjs
  - scripts/lib/e2e-web-env.test.mjs
  - scripts/lib/isolation-guards.test.mjs
  - scripts/lib/schema-fingerprint.mjs
  - scripts/lib/schema-fingerprint.test.mjs
  - scripts/lib/test-db.mjs
  - scripts/verify.mjs
  - scripts/verify.test.mjs
  - scripts/with-test-db.mjs
  - turbo.json
findings:
  critical: 0
  warning: 6
  info: 7
  total: 13
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-10-03T10:38:42Z
**Depth:** standard
**Files Reviewed:** 83
**Status:** issues_found

## Summary

Scope: every file with substantive changes in 11b2916..e02a86b (excluding the format-only commits 2b59334/a343af1), plus the uncommitted validation tests and the README/AGENTS.md step-list fix. Modified files were reviewed against `git diff 11b2916 ad3a9e1`. `compare-schema-dump.mjs` (user-run, reads dump files only, never connects to production) was reviewed for its normalisation, classification, history and cleanup logic; its report and self-test tail was only skimmed.

**Production path (priority 1): no regression found.**
- `env.ts`, `db/index.ts`, `apply-migration.ts`, `drizzle.config.ts`: without `BIO_EXAM_ISOLATED_ENV=1` they run the same code as before. `loadDotenv()` with no arguments is what `import 'dotenv/config'` did, and `DATABASE_URL` resolution is the same.
- `storage.ts`: with `STORAGE_DRIVER` unset and not isolated, every public method reaches the old Supabase branch unchanged. `getClient()`/`isConfigured()` only add early returns for the isolated and local cases.
- `schema.ts`: index and foreign-key renames, `pgPolicy`, `.enableRLS()` and the gin trigram index only change declarations. Runtime query SQL is the same. `generate-no-diff` against `meta/0020_snapshot.json` guards future `drizzle-kit generate`. The one runtime-visible change is `withTimezone: true` on 10 columns: drizzle 0.45.3 `PgTimestamp.mapFromDriverValue` stops appending `+0000`. I probed V8: the old mapping returned the right instant only when the session offset is `+00` and shifted every other offset. So this change is a no-op on Supabase's UTC session (which D-07 must confirm through `show timezone`) and fixes a latent bug otherwise. `timestamps.test.ts` tells the two apart because it uses Asia/Bangkok and America/New_York.
- `seed.ts`/`bootstrap-admin.ts`: prod behaviour is the same (see IN-01).

**Safety tooling (priority 2):** I found no new path from a test or e2e process to a non-test database beyond the known H-1 (`?host=`, which also applies to `?hostaddr=` for the libpq tools `pg_dump`/`createdb`) and H-3 (explicit strip list). The main problems are cleanup and integrity:
- I reproduced a cluster/process leak on SIGHUP. The orphan sweep cannot reclaim it (WR-01).
- The migration manifest does not pin the journal `when` values, and those values decide what drizzle applies in production (WR-02).
- The CI policy check can be bypassed for secret references (WR-03).
- In local storage mode `isConfigured()` returns false, so legacy upload paths write into the developer's working tree (WR-04).

**Test quality (priority 3):** one test only matches source text (WR-05). The self-test's orphan case covers a state that cannot happen in practice (part of WR-01). Two smaller test-weakening notes are listed as Info.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Wrapper death (SIGHUP, kill -9, closed terminal) leaks a running trust-auth cluster, the scratch DB and the child; the orphan sweep can never reclaim it

**File:** `scripts/lib/test-db.mjs:199-201, 210-242, 398-405, 651-681` (same handler pattern in `scripts/with-test-db.mjs:54-78`, `scripts/check-migrations.mjs:469-476`, `scripts/compare-schema-dump.mjs:151-157`)
**Issue:**
- Only SIGINT and SIGTERM are handled. `pg_ctl start` puts the postmaster in its own session (`setsid`), so it outlives its parent.
- I reproduced this through the harness: `node scripts/with-test-db.mjs -- node -e "setTimeout(()=>{},60000)"`, then `kill -HUP <wrapper>`. The wrapper died. The postmaster (own PGID, `-c listen_addresses=127.0.0.1`, trust auth) and the wrapped child both kept running, and the `bio-exam-pg-*` directory stayed. I cleaned this up by hand afterwards.
- The next `sweepOrphanClusters()` returned `[]`. `pidProtects(postmaster)` keeps the directory for as long as the orphaned postgres runs, and nothing ever stops that postgres. So the sweep's documented purpose ("брошенные кластеры, например, после kill -9") cannot be met: after any wrapper death the postmaster is alive by construction.
- The self-test case "orphan sweep" (line 666) builds its fixture with `postmaster: deadPid`. That state does not happen after a real crash, so the test passes for the wrong reason.
- For `yarn e2e` the leaked children are Playwright, Express and Next on the e2e ports.

**Fix:**
```js
// sweepOrphanClusters: dead owner + live postmaster => stop the orphan, then remove
const ownerDead = owner !== null && !Number.isNaN(owner) && !isPidAlive(owner)
if (ownerDead && pidProtects(postmaster)) {
	await run(path.join(findPgBin(), 'pg_ctl'), ['-D', path.join(dir, 'data'), '-m', 'immediate', 'stop'], { env: pgToolEnv() })
	postmaster = await readPidFile(path.join(dir, 'data', 'postmaster.pid')) // re-read after the stop (make it `let`)
}
if (pidProtects(owner) || pidProtects(postmaster)) continue
```
Also register `SIGHUP` alongside SIGINT/SIGTERM in `withTestDatabase` (and in the copies in `check-migrations.mjs` / `compare-schema-dump.mjs`). Change the self-test to start a real cluster, kill the owner only, and assert that the next sweep stops it and removes the directory.

### WR-02: Migration manifest does not pin journal `when`; an edited or non-monotonic `when` passes every stage and changes what production applies

**File:** `scripts/check-migrations.mjs:141-204, 319-348`; `app/server/drizzle/migrations-manifest.json`
**Issue:**
- drizzle 0.45.3 (`pg-core/dialect.js:57-67`, `migrator.js:22`) applies a journal entry only when `lastDbMigration.created_at < entry.when`.
- `checkManifest` pins tag, idx, file and SQL sha256, but not `when` (or `breakpoints`). `checkIdempotency` compares the scratch database's `created_at` with the same journal file, so the check is circular.
- Two examples:
  - Raising `when` on the last applied entry (0020) passes `manifest`, `chain-vs-schema` and `idempotency`, and makes the production migrator re-run 0020's DDL.
  - A future entry whose `when` is not greater than the live maximum `created_at` is skipped in production without any error. The journal already has non-chronological synthetic values for 0000-0013.
- T-1-15 says the manifest protects the applied history, but this field is not covered.

**Fix:** add `"when"` (and `"breakpoints"`) to each manifest entry and compare it in `checkManifest`. Also fail when `entries[i].when <= entries[i-1].when`:
```js
if (expected.when !== entry.when) lines.push(`order: journal position ${i} ${entry.tag} when ${entry.when} differs from the manifest ${expected.when}`)
if (i > 0 && entries[i - 1] && entry.when <= entries[i - 1].when) lines.push(`order: journal position ${i} ${entry.tag} when is not greater than the previous entry`)
```

### WR-03: CI policy check fails open for secret references (`secrets['X']`, `toJSON(secrets)`)

**File:** `scripts/check-ci-workflow.mjs:19-29, 229-231`
**Issue:**
- The forbidden token is the literal substring `secrets.`.
- I probed `checkCiWorkflow()` on `ci.yml` with `TOKEN: ${{ secrets['NPM_TOKEN'] }}` added to the verify step: it returned `[]`. `ALL: ${{ toJSON(secrets) }}` also returned `[]`.
- T-1-40 cites "policy check forbids secret references" as its mitigation evidence, which overstates what the check does. The current `ci.yml` is clean.
- A `workflow_run:` trigger also passes; that is the known H-2 and is not reported again here.

**Fix:** match the context name, not the dotted form:
```js
if (/\bsecrets\b/i.test(text)) findings.push('forbidden: reference to the secrets context')
```
and replace the trigger denylist with an allowlist of `on:` keys (`pull_request`, `push`), which closes H-2 at the same time.

### WR-04: In local storage mode `isConfigured()` returns false, so upload routes write into the repository working tree, outside `STORAGE_LOCAL_DIR`

**File:** `app/server/src/services/storage/storage.ts:35-39, 321-323`; callers `app/server/src/routes/tests/index.ts:2326-2339`, `app/server/src/routes/users/avatar.ts:33, 138`, `app/server/src/routes/docs/assets.ts:30, 62, 119, 167, 204, 236`
**Issue:**
- In isolated mode `isConfigured()` is always `false`, and it ignores `STORAGE_DRIVER=local`.
- Every route that branches on it falls through to the legacy disk fallback. One example is `path.join(process.cwd(), '../web/public/uploads/tests/${topic.slug}/${test.slug}/assets')`, which resolves to the developer's real `app/web/public/uploads`. That directory is not `STORAGE_LOCAL_DIR` and is never cleaned up.
- This contradicts the trust-boundary row "STORAGE_DRIVER=local keys resolve strictly inside STORAGE_LOCAL_DIR".
- No current e2e spec uploads a file (`rg setInputFiles|avatar|/assets e2e/` finds nothing), so the problem is latent. The first upload test added in a later phase will write into the tree on every run.
- Flipping `isConfigured()` to true in local mode is not enough on its own: the Supabase branches of `avatar.ts:197, 227` call `getPublicUrl()`, which throws `unsupportedInLocal`.

**Fix:** add an explicit `isLocal()`, or a `driver` getter, to `StorageService`. In the routes, take the local branch through `storageService.uploadBuffer`/`writeFile` (those already confine writes to `STORAGE_LOCAL_DIR`). Until then, make the legacy `../web/public/uploads` fallback refuse to run when `isIsolatedEnv()`:
```ts
if (isIsolatedEnv()) throw new Error('[storage] legacy web/public/uploads fallback is disabled in isolated mode')
```

### WR-05: `verify.test.mjs` "zero tests is a failure" asserts on function source text, not behaviour

**File:** `scripts/verify.test.mjs:40-45`
**Issue:** `assert.match(step.args.toString(), /zero tests is a failure/)` passes as long as the string literal is in the function body. The literal could become unreachable (for example, the `files.length === 0` guard removed or inverted) and the test would still pass. The test's own comment admits that the behaviour is not exercised.
**Fix:** export `collectScriptTests(dir)` and let the step's `args` take a directory. Then assert behaviour:
```js
const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-empty-'))
assert.throws(() => scriptTestArgs(empty), /zero tests is a failure/)
```

### WR-06: Signal handling: `verify.mjs` does not forward signals to the running step, and `with-test-db` exits before its command does

**File:** `scripts/verify.mjs:73-90, 100-117`; `scripts/with-test-db.mjs:54-78, 87-90` with `scripts/lib/test-db.mjs:398-405`
**Issue:**
- `verify.mjs`: on SIGTERM (for example `kill <pid>`), `withTestDatabase`'s handler drops the scratch DB and stops the cluster, then calls `process.exit(143)`. It never signals the step child (`turbo` → vitest/tsc, `check-migrations` with its own cluster), so those processes are orphaned and keep running. An orphaned `check-migrations` then leaks its own cluster, which is WR-01 again.
- `with-test-db.mjs`: two SIGINT listeners run. One forwards the signal to the child. The other (`withTestDatabase`) runs cleanup and calls `process.exit(130)` without waiting for the child to exit. The documented contract "Код выхода — код команды (130/143 при сигнале)" is therefore not honoured: a command that traps SIGINT and exits 0 still produces exit code 130. The database is also dropped `WITH (FORCE)` and the cluster stopped `-m immediate` while the command may still be in its own teardown.

**Fix:** track the active child in `verify.mjs`, as `e2e.mjs` does with `activeChild`, and forward SIGINT/SIGTERM/SIGHUP to it. In `withTestDatabase`, accept an `onSignal` hook so `with-test-db` can wait for its child to exit (with a timeout) before cleanup and `process.exit`.

## Info

### IN-01: `loadDotenv()` in `seed.ts` and `bootstrap-admin.ts` runs after `db` is built and cannot affect DB resolution

**File:** `app/server/src/db/seed.ts:6-10`; `app/server/src/scripts/bootstrap-admin.ts:6-11`
**Issue:**
- ES imports are hoisted, so `db/index.ts` → `env.ts` has already loaded the first candidate `.env` (with `override: true`) and created the pool before `if (!isIsolatedEnv()) loadDotenv()` runs.
- Before 11b2916, `import 'dotenv/config'` ran before `./index.js`. Now the cwd `.env` is loaded after the pool exists. Under `yarn workspace` the cwd is `app/server`, so the effective values are the same and there is no prod change.
- The comment still implies this line guards isolation, but the real guard is `env.ts`.

**Fix:** remove the call, or move it into `main()` for the `ADMIN_BOOTSTRAP_*` reads only, and correct the comment.

### IN-02: Schema fingerprint ignores functions, triggers, sequences, views and column collation

**File:** `scripts/lib/schema-fingerprint.mjs:35-161`
**Issue:** `chain-vs-schema` reports "chain == schema.ts" even if the migration chain adds or drops a trigger, a function, a view, a sequence option or a column collation. schema.ts cannot declare most of these, but the docstring presents the fingerprint as the whole-schema comparison.
**Fix:** say so in the docstring and in DRZ-01 output ("tables, columns, constraints, indexes, policies, enums, extensions only"). Optionally add `attcollation` to the column fingerprint.

### IN-03: `migrationsStatus()` comparison cannot detect further edits to an already-dirty migration file

**File:** `scripts/check-migrations.mjs:87-90, 278-283, 492, 520-524`; `scripts/check-migrations.test.mjs:23-27, 50-52`
**Issue:** `git status --porcelain` prints the same ` M path` line before and after a second modification, so a run started on a dirty `app/server/drizzle` cannot see that drizzle-kit changed the file again.
**Fix:** compare `fileHashes(MIGRATIONS_PATH)` before and after, or `git diff` output, instead of the porcelain status.

### IN-04: `getServerMe.test.ts` now counts `getMeData` calls instead of module loads

**File:** `app/web/lib/auth/getServerMe.test.ts:64-66, 103-108`
**Issue:**
- The pre-port test counted `require('@/lib/auth/server/getMeData')`, i.e. initialisation of the local JWT/DB module. The vitest port counts calls of a mocked `getMeData`.
- With today's code (`await import(...)` and the call on the same line) both counts are equivalent.
- If a future change hoisted a static import, the module (and its pg pool on `DATABASE_URL`) would initialise in API mode. The new test would still pass, although its message says "must not initialize".

**Fix:** count module evaluation with a side effect inside the `vi.mock` factory (`holders.moduleLoads++`) and assert it is 0 in API mode.

### IN-05: `test.fail` bodies still contain steps whose failure would be counted as the expected defect

**File:** `e2e/tests/authoring.spec.ts:234-240`; `e2e/tests/review.spec.ts:311-318`
**Issue:**
- In the D5 body, `saveQuestion` clicks the 'Сохранить вопрос' button, and the setup test never exercised that button. If the button is renamed, the click times out, and that timeout counts as the "expected" D5 failure. The same body could also hide a fix of D5.
- The D1 body navigates and asserts the heading and section count through `adminReviewSections`. The setup already exercised that helper, so the risk there is lower.

**Fix:** move the button lookup into setup (`await expect(page.getByRole('button', { name: 'Сохранить вопрос' })).toBeEnabled()`) so the `test.fail` body holds only the defect assertion.

### IN-06: Scratch database prefixes longer than 48 characters produce a name Postgres truncates

**File:** `scripts/lib/test-db.mjs:332-345`; `app/server/src/test-support/test-database.ts:62-79`
**Issue:** `<prefix>_<pid>_<6 hex>` can exceed the 63-byte identifier limit. `CREATE DATABASE` then truncates the name with only a NOTICE, while the returned URL and `drop()` use the full name. The connection fails and the truncated database is left behind.
**Fix:** reject `name.length > 63` (or `prefix.length > 40`) in both `createScratchDatabase` implementations.

### IN-07: `check-env-contract` sees only `process.env.X` / `process.env['X']`

**File:** `scripts/check-env-contract.mjs:31-33, 100-105`
**Issue:** a destructured read (`const { FOO } = process.env`) or a variable key escapes the "undocumented" rule, so the check fails open. There are none today (`rg '} = process.env'` finds nothing), so this is latent.
**Fix:** also match `const\s*\{([^}]+)\}\s*=\s*process\.env`, or forbid that pattern with a finding.

---

_Reviewed: 2026-10-03T10:38:42Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
