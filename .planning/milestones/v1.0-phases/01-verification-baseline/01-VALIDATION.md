---
phase: "1"
slug: "verification-baseline"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-03"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `01-RESEARCH.md` § Validation Architecture, adjusted to CONTEXT.md D-05 (revised): Drizzle stays on 0.45.3/0.31.11, no v1 conversion in this phase.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.x (unit / module / DB-backed), Playwright 1.6x (e2e), node scripts for repository checks |
| **Config file** | none — Wave 0 installs `app/web/vitest.config.ts`, `app/server/vitest.config.ts`, `packages/rbac/vitest.config.ts`, `e2e/playwright.config.ts` |
| **Quick run command** | `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server test` / `yarn workspace @bio-exam/web test` / `yarn workspace @bio-exam/rbac test` (single non-DB file: `yarn workspace @bio-exam/server vitest run <path>`; DB-backed files only through `with-test-db.mjs`) |
| **Full suite command** | `yarn verify` (starts and tears down the disposable PostgreSQL), then `yarn e2e` |
| **Estimated runtime** | quick < 10 s per workspace; `yarn verify` ~60–120 s; `yarn e2e` several minutes |

---

## Sampling Rate

- **After every task (user commits; agent runs after each task):** the quick command of the touched workspace plus the task's specific check script
- **After every plan wave:** `yarn verify`
- **Before `/gsd-verify-work`:** `yarn verify` and `yarn e2e` green, one advisory CI run on GitHub, and the user-run read-only D-07 schema report attached
- **Max feedback latency:** 120 seconds for `yarn verify`

---

## Per-Task Verification Map

Task IDs are `<plan>-T<n>` (for example `01-05-T2` is Task 2 of `01-05-PLAN.md`). DB-backed commands run through `node scripts/with-test-db.mjs -- …` (or inside `yarn verify`), because DB-backed test files fail without `TEST_DATABASE_URL` instead of skipping (D-03).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1, 01-01-T2, 01-16-T2 | 01-01, 01-16 | 1, 4 | D-29 (C4 env isolation) | T-1-env | Isolated processes ignore `.env`; non-`localhost`/non-`test_` URLs refused | unit | `yarn workspace @bio-exam/server vitest run src/config/env.isolation.test.ts` | ✅ | ✅ green |
| 01-01-T1, 01-01-T2 | 01-01 | 1 | VER-05 | T-1-env | Guard accepts only `localhost`/`127.0.0.1` + `test_*`; cluster asserts UTC + UTF-8 non-C locale; teardown; orphan sweep removes a directory only when its `owner.pid` and `postmaster.pid` are dead and keeps one whose creator is alive; missing PostgreSQL 17 (exclusive `PG_BIN_DIR=/nonexistent`) fails with the install hint and never skips | unit + smoke | `node scripts/lib/test-db.mjs --self-test` | ✅ | ✅ green |
| 01-03-T1, 01-03-T2, 01-03-T3, 01-04-T1, 01-04-T2 | 01-03, 01-04 | 3 | VER-01 | — | N/A | unit | `yarn workspace @bio-exam/web test && node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server test && yarn workspace @bio-exam/rbac test` | ✅ | ✅ green |
| 01-04-T2 | 01-04 | 3 | D-19 | — | N/A | unit | `yarn workspace @bio-exam/web vitest run lib/auth/getServerMe.test.ts` | ✅ | ✅ green |
| 01-10-T2 (extended by 01-13-T3, 01-15-T1, 01-15-T2) | 01-10 | 7 | VER-02 | — | 8 steps in fixed order (`lockfile`, `env-contract`, `docs-commands`, `ci-workflow`, `format-check`, `lint-typecheck-test`, `migrations`, `script-tests`); fails closed without PostgreSQL 17 | integration | `yarn verify` (plus negative runs: a failing assert → non-zero `FAILED at lint-typecheck-test`; `env -u TEST_DATABASE_URL PG_BIN_DIR=/nonexistent node scripts/verify.mjs` → non-zero with the install hint) | ✅ | ✅ green |
| 01-05-T2 | 01-05 | 4 | D-28 (C3 timestamptz) | — | N/A | DB unit | `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/db/timestamps.test.ts` | ✅ | ✅ green |
| 01-05-T1, 01-05-T3 | 01-05 | 4 | DRZ-01 | T-1-migr | Chain from zero matches `schema.ts` (incl. RLS, indexes, timestamptz) | integration (DB) | `node scripts/check-migrations.mjs` | ✅ | ✅ green |
| 01-08-T1, 01-08-T2 | 01-08 | 6 | DRZ-02 | T-1-migr | Snapshot restored; applied SQL byte-identical (checksum manifest); `generate` creates nothing | integration | `node scripts/check-migrations.mjs` | ✅ | ✅ green |
| 01-08-T3, 01-15-T1, 01-15-T3 | 01-08, 01-15 | 6, 11 | DRZ-03 | — | N/A | CI | CI job runs `yarn verify` (includes the migration check) | ✅ | ✅ green |
| 01-15-T1 | 01-15 | 11 | VER-03 | T-1-ci | `permissions: contents: read`, `pull_request` only (no `pull_request_target`), no `secrets.*`, no deploy/vercel steps | static | `node scripts/check-ci-workflow.mjs` | ✅ | ✅ green |
| 01-10-T1 | 01-10 | 7 | VER-04 | — | The guard judges the working tree: it passes while the `package-lock.json` deletion is unstaged (`git ls-files --cached` still lists it, `git ls-files --deleted` shows it) and still flags a lockfile that exists on disk | static | `node scripts/check-lockfile.mjs` and `test ! -e package-lock.json` | ✅ | ✅ green |
| 01-13-T1, 01-13-T3 | 01-13 | 9 | VER-06 | T-1-secrets | Env examples contain placeholders only; the check runs as the `env-contract` step of `yarn verify`; `BIO_EXAM_ISOLATED_ENV` and `TEST_DATABASE_URL` (read through the guard's `env` parameter) are allowlisted with a reason, so they are not reported as unused | unit + static | `node scripts/check-env-contract.mjs` | ✅ | ✅ green |
| 01-13-T2, 01-13-T3 | 01-13 | 9 | VER-07 | — | N/A | static | `node scripts/check-docs-commands.mjs` + human review | ✅ | ✅ green |
| 01-06-T1 | 01-06 | 5 | D-08/D-12 | — | N/A | static | `yarn lint` (oxlint, 0 errors) | ✅ | ✅ green |
| 01-14-T2, 01-15-T2 | 01-14, 01-15 | 10, 11 | D-10/D-11 | T-1-37, T-1-38 | Reformat starts from a committed clean tree and rewrites no vendored or non-source tracked file (`.yarn`, `yarn.lock`, `pencil-new.pen`, `app/server/drizzle`); then `format-check` is enforced in verify | static | `yarn format:check` (`oxfmt --check .`) after the user's format commit; diff gate `git diff --quiet -- .yarn yarn.lock pencil-new.pen app/server/drizzle app/web/public app/web/components.json app/web/.vscode` | ✅ | ✅ green |
| 01-06-T2 | 01-06 | 5 | D-09 | T-1-supply | rbac dist names + exports identical ESM/CJS | build check | `yarn workspace @bio-exam/rbac build && node scripts/check-rbac-dist.mjs` | ✅ | ✅ green |
| 01-07-T1, 01-07-T2 | 01-07 | 4 | D-18 | T-1-path | Local storage CRUD; traversal and symlink escape rejected | unit | `yarn workspace @bio-exam/server vitest run src/services/storage/storage.local.test.ts` | ✅ | ✅ green |
| 01-09-T1, 01-09-T2, 01-09-T3, 01-11-T1, 01-11-T2 | 01-09, 01-11 | 6, 8 | D-14/D-15/D-16/D-17 | T-1-env | Four flows on desktop + mobile against isolated stack; D1/D2/D5 expected-fail (setup outside the `test.fail()` test); the build-step `next-env-guard: OK` line appears in every run | e2e | `yarn e2e` | ✅ | ✅ green |
| 01-09-T2 | 01-09 | 6 | D-17 (C1 web env closure) | T-1-env | Next build and start get one explicit closed environment (scratch `DATABASE_URL`, e2e `API_ORIGIN`, `NODE_ENV=production`); every key name in `app/web/.env*` is pinned so `@next/env` fills nothing; guard fails on wrong values and unpinned key names and never prints values; `@next/env` fills unset keys but never overrides set ones (control) | unit + smoke | `node --test scripts/lib/e2e-web-env.test.mjs` and the negative run of `node scripts/lib/e2e-web-env.mjs --check` with a wrong environment (non-zero, names `API_ORIGIN`, `DATABASE_URL`, `AUTH_JWT_SECRET`, no password in the output) from 01-09-T2 | ✅ | ✅ green |
| 01-09-T1 | 01-09 | 6 | D-15 (C2 fresh checkout) | — | `yarn e2e` builds `packages/rbac` itself, so it works where `dist` does not exist (fresh clone, fresh CI runner) | smoke | `rm -rf packages/rbac/dist; yarn e2e --seed-only` (exit 0, `packages/rbac/dist/index.js` exists afterwards) | ✅ | ✅ green |
| 01-06-T2, 01-15-T1 | 01-06, 01-15 | 5, 11 | D-21 | — | N/A | CI | CI builds web (placeholder `DATABASE_URL`, `AUTH_JWT_SECRET`, `API_ORIGIN`), server, rbac; local reproduction in 01-06-T2 | ✅ | ✅ green |
| 01-02-T1, 01-02-T2 | 01-02 | 2 | VER-01 / D-05 (supply chain) | T-1-supply | Exact pins approved at a blocking-human gate before the only install pass; Drizzle 0.45.3 / 0.31.11 | static + smoke | pin check `node -e …` from 01-02-T2 and `node scripts/lib/test-db.mjs --self-test` | ✅ | ✅ green |
| 01-01-T2, 01-08-T3 | 01-01, 01-08 | 1, 6 | D-29 (drizzle.config guard) | T-1-env | `drizzle.config.ts` refuses a non-test URL in isolated mode (negative control: exit 3 plus the guard message) and loads with a valid `127.0.0.1/test_x` URL (positive control: exit 0) | smoke | `probe="import('./drizzle.config.ts').then(() => process.exit(0), (e) => { console.error(String(e && e.message)); process.exit(3) })"; out=$(BIO_EXAM_ISOLATED_ENV=1 TEST_DATABASE_URL=postgres://u@db.example.invalid:5432/test_x yarn workspace @bio-exam/server tsx -e "$probe" 2>&1); rc=$?; test "$rc" -eq 3 && printf '%s\n' "$out" \| grep -q 'TEST_DATABASE_URL host db.example.invalid'` and, with `TEST_DATABASE_URL=postgres://u@127.0.0.1:5432/test_x`, the same `$probe` exits 0 | ✅ | ✅ green |
| 01-16-T1 | 01-16 | 4 | D-02 (guard table) | T-1-env | Accept/reject table for `assertTestDatabaseUrl`, no `DATABASE_URL` fallback | unit | `yarn workspace @bio-exam/server vitest run src/config/test-database-url.test.ts` | ✅ | ✅ green |
| 01-08-T2 | 01-08 | 6 | DRZ-02 (stage fixtures) | T-1-migr | Edited, unjournaled or reordered SQL and generated DROP statements fail the check | unit | `node --test scripts/check-migrations.test.mjs` | ✅ | ✅ green |
| 01-10-T1 | 01-10 | 7 | VER-04 (guard fixtures) | — | Second lockfiles flagged; a tracked path absent from disk (`existingPaths` with an injected predicate) is not a violation; a deleted root `yarn.lock` is still reported | unit | `node --test scripts/check-lockfile.test.mjs` | ✅ | ✅ green |
| 01-13-T1 | 01-13 | 9 | VER-06 (fixtures) | T-1-secrets | Secret-looking values, duplicates, missing files rejected | unit | `node --test scripts/check-env-contract.test.mjs` | ✅ | ✅ green |
| 01-13-T3 | 01-13 | 9 | VER-07 (fixtures) | — | N/A | unit | `node --test scripts/check-docs-commands.test.mjs` | ✅ | ✅ green |
| 01-15-T1 | 01-15 | 11 | VER-03 (policy fixtures) | T-1-ci | Write permission, secrets, target-context trigger, deploy and artifact upload rejected | unit | `node --test scripts/check-ci-workflow.test.mjs` | ✅ | ✅ green |
| 01-12-T1, 01-12-T3 | 01-12 | 7 | D-07 (read-only prod comparison) | — | N/A | smoke + manual | `node scripts/compare-schema-dump.mjs --self-test` (production dump is user-run in 01-12-T2) | ✅ | ✅ green |
| 01-01, 01-16 (gap fill) | validate-phase | — | D-29 / VER-05 / D-03 (isolation refusals) | T-1-env | `isolation-probe.ts`, the migration runner and `drizzle.config.ts` refuse a remote host, a non-`test_` database and an unset `TEST_DATABASE_URL` (no `DATABASE_URL` fallback, no connection attempt); `isolatedChildEnv` strips `DATABASE_URL`/`SUPABASE_*`/`PG*`; missing PostgreSQL 17 gives the install hint; a DB-backed vitest file without `TEST_DATABASE_URL` fails instead of skipping | integration (no DB) | `node --test scripts/lib/isolation-guards.test.mjs` | ✅ | ✅ green |
| 01-10, 01-13, 01-15 (gap fill) | validate-phase | — | VER-02 (`verify.mjs`) | — | The 8 step names in order; summary text for OK and `FAILED at <step>`; a run without PostgreSQL 17 exits 1 with `FAILED at test-database` and no `yarn verify: OK` | unit + spawn | `node --test scripts/verify.test.mjs` | ✅ | ✅ green |
| 01-13 (gap fill) | validate-phase | — | VER-07 (docs structure) | — | README and `AGENTS.md` name every `yarn verify` step; `AGENTS.md` keeps `## CodeGraph` and `## Project commands`; `CLAUDE.md` is `@AGENTS.md`; the server README names all five templates | unit | `node --test scripts/check-docs-structure.test.mjs` | ✅ | ✅ green |
| 01-05 (gap fill) | validate-phase | — | DRZ-01 (`diffFingerprints`) | T-1-migr | Identical fingerprints give no difference; column type, one-sided index, index definition (DESC NULLS FIRST), RLS flag, one-sided policy, FK name and PK name each produce their line; stable ordering | unit | `node --test scripts/lib/schema-fingerprint.test.mjs` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `app/server/src/config/env.ts` isolation switch + `app/server/src/db/index.ts` URL assertion + migration-runner guard, with tests (D-29, first)
- [x] `scripts/lib/test-db.mjs` — guard + Homebrew `pg_ctl` cluster lifecycle + self-test
- [x] `vitest`/`vite` dev deps, `vitest.config.ts` in web/server/rbac, `test` scripts, Turbo `test` task, rbac smoke test
- [x] `scripts/verify.mjs`, `scripts/e2e.mjs`, `scripts/lib/e2e-web-env.mjs` (web e2e environment and its guard), check scripts (`check-migrations`, `check-ci-workflow`, `check-lockfile`, `check-env-contract`, `check-docs-commands`, `check-rbac-dist`)
- [x] `e2e/` — Playwright config, auth setup (reused `storageState`), 4 specs, deterministic seed
- [x] `.oxlintrc.json`, `.oxfmtrc.json`, `packages/rbac/tsdown.config.ts`; removal of ESLint/Prettier/tsup artefacts
- [x] `.github/workflows/ci.yml`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Read-only schema diff against live Supabase | D-07 | Agents never connect to production | User runs the plan's `pg_dump --schema-only` via the session pooler (port 5432), places the file where the plan says; the diff script compares it with the migrated disposable DB |
| Commit of the work of plans 01-01 to 01-13 before the reformat | D-11 | Only the user commits | User commits waves 1-9 in their own style so `git status --porcelain` is empty; the executor checks it before the first format run (01-14 Task 1) |
| Repository-wide format commit + `.git-blame-ignore-revs` | D-11 | Only the user commits | User commits the format-only change separately, then adds its hash to `.git-blame-ignore-revs` (01-14 Task 3); the executor checks the hash and that the commit left the protected paths alone |
| Package pins for flagged-new toolchain packages | supply chain | Package legitimacy check flagged `too-new` | User confirms the exact pinned versions at the `checkpoint:human-verify` before first install |
| CI run on GitHub | VER-03 | Requires a push | User pushes; checks the Actions run is green and has no deploy step |
| Vercel builds still pass | Integration (CONTEXT) | Vercel is the production runtime | Preview deploy or local reproduction of both `vercel.json` build commands |
| README onboarding is usable | VER-07 | Prose quality | Human read-through |
| Cluster lifecycle of the disposable PostgreSQL harness (teardown, SIGINT, parallel runs, orphan sweep) | VER-05 | Needs a local Homebrew `pg_ctl`; CI uses a `postgres:17` service instead | `node scripts/lib/test-db.mjs --self-test` (14 `ok`) |
| Dump-comparison script self-test | D-07 | Needs a local `pg_ctl`; not part of `yarn verify` or CI | `node scripts/compare-schema-dump.mjs --self-test` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-10-03 (validate-phase: 4 gaps found, 4 resolved, 0 escalated)

---

## Validation Audit 2026-10-03

Done items of the Manual-Only table: D-07 dump compared (`01-SCHEMA-DIFF.md`); plans 01-01..01-13 committed (1e4045f..ad3a9e1); format commit 2b59334 + `.git-blame-ignore-revs` (a343af1); package pins approved at 01-02-T1; CI run 37114466556 green on e02a86b (verify, build with production start smoke, e2e); Vercel build commands reproduced in 01-06-T2 and covered by the CI `build` job. Still manual: README read-through; local `--self-test` runs.

| Metric | Count |
|--------|-------|
| Gaps found | 4 |
| Resolved | 4 |
| Escalated | 0 |

New tests: `scripts/lib/isolation-guards.test.mjs` (12), `scripts/verify.test.mjs` (6), `scripts/check-docs-structure.test.mjs` (5), `scripts/lib/schema-fingerprint.test.mjs` (9). Docs drift fixed: README and `AGENTS.md` now list all 8 `yarn verify` steps.
