---
phase: "1"
slug: "verification-baseline"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-03"
---

# Phase 1 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Developer `.env` files → test/e2e processes | `app/server/.env` and `app/web/.env` hold live Supabase credentials; isolated processes (`BIO_EXAM_ISOLATED_ENV=1`) must never read them | live `DATABASE_URL`, `SUPABASE_*` keys, JWT secret (secret) |
| Tooling → disposable PostgreSQL 17 | Harness, migration check, Vitest DB tests and e2e reach only `test_*` databases on 127.0.0.1 through the `assertTestDatabaseUrl` guard | scratch schema and seed data (test only) |
| Migration chain → applied history | Applied SQL 0000–0020 and the journal must stay byte-identical; drizzle-kit writes only to temp copies | schema DDL (integrity-critical) |
| Local storage driver → filesystem | `STORAGE_DRIVER=local` keys resolve strictly inside `STORAGE_LOCAL_DIR` | uploaded/test files |
| e2e Next/Express → environment | Next build/start get one closed env; `@next/env` has nothing to fill from `app/web/.env` | scratch DB URL, e2e-only secret |
| User → live Supabase (D-07) | Only the user runs a read-only `pg_dump --schema-only`; agents never connect | production schema (sensitive), no data |
| GitHub Actions | `contents: read` token, `pull_request` + push on `master`, no secrets, no deploy | repository checkout, service-container DB |
| npm registry → `yarn.lock` | Single install pass behind a blocking-human package gate with exact pins | third-party code (supply chain) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-1-01 | Tampering | `config/env.ts` override, `db/index.ts`, `apply-migration.ts`, `drizzle.config.ts` (VALIDATION T-1-env) (01-01) | critical | mitigate | `BIO_EXAM_ISOLATED_ENV=1` skips every dotenv load; isolated code reads only `TEST_DATABASE_URL` through `assertTestDatabaseUrl` (localhost/127.0.0.1 + `^test_[a-z0-9_]+$`) before `new Pool`; self-test proves a poisoned `DATABASE_URL` is ignored | closed |
| T-1-02 | Information disclosure | dotenv fill-in of `SUPABASE_*` in runner, seed, bootstrap (01-01) | high | mitigate | conditional `loadDotenv()` only when not isolated; `isolatedChildEnv` strips `SUPABASE_*`, `DATABASE_URL`, `PG*`; probe asserts the Supabase vars are unset | closed |
| T-1-03 | Information disclosure | disposable cluster (01-01) | medium | mitigate | `listen_addresses=127.0.0.1`, empty `unix_socket_directories`, trust auth only on loopback, `initdb` 0700 data dir, random free port, `pg_ctl stop` + dir removal in finally and on SIGINT/SIGTERM, orphan sweep | closed |
| T-1-04 | Information disclosure | harness and probe logging (01-01) | medium | mitigate | no URL is logged anywhere; guard errors name host and database only; `safeDsn` kept for `DEBUG_ENV`; acceptance grep forbids URL logging in `test-db.mjs` | closed |
| T-1-05 | Tampering | toolchain packages flagged SUS (too-new) (VALIDATION T-1-supply) (01-02) | high | mitigate | blocking-human checkpoint with exact names, repositories and versions before install; `yarn add -E` exact pins; registry metadata recorded in SUMMARY | closed |
| T-1-06 | Tampering | typosquat / wrong package name (01-02) | high | mitigate | names taken from official docs (oxc.rs, vitest.dev, playwright.dev, tsdown.dev, orm.drizzle.team) and shown with repository URLs at the checkpoint; `@oxlint/migrate` deliberately not installed | closed |
| T-1-07 | Elevation of privilege | install-time lifecycle scripts (01-02) | medium | mitigate | research found 0 postinstall scripts in the set; executor records any build scripts reported by `yarn install` in the SUMMARY | closed |
| T-1-08 | Tampering | server Vitest workers importing `db/index.ts` (01-03) | high | mitigate | `test.env.BIO_EXAM_ISOLATED_ENV='1'` in `app/server/vitest.config.ts`; resolver test mocks `db/index.js`; the regression test that proves no `.env` load in isolated mode is 01-16 (with the T-1-09 child-output control) | closed |
| T-1-09 | Information disclosure | env.isolation child output (01-16) | low | mitigate | child prints only booleans and a file path, never env values; the control case opens no database connection; the acceptance check requires that the child prints only the two boolean/path fields | closed |
| T-1-10 | Information disclosure | `getServerMe.test.ts` fetch (01-04) | low | mitigate | `vi.stubGlobal('fetch', vi.fn(...))` in every scenario; origins are fixture values (`http://api.test` style), never real hosts | closed |
| T-1-11 | Repudiation | weakened test port hides a regression (01-04) | medium | mitigate | per-file assert-count parity check and the scenario mapping table in the SUMMARY | closed |
| T-1-12 | Tampering | `check-migrations.mjs` DDL execution (VALIDATION T-1-migr) (01-05) | critical | mitigate | DDL only on scratch DBs created by `createScratchDatabase` (guarded `test_*`, localhost); `drizzle-kit generate` runs without `--config` into a temp dir, so no URL is read; `git status` on `app/server/drizzle` asserted unchanged | closed |
| T-1-13 | Tampering | `schema.ts` declarations drifting from production (01-05) | high | mitigate | comparator must report zero differences against the real chain; database-changing differences are a STOP; D-07 (01-12) compares the chain with the live schema read-only | closed |
| T-1-14 | Information disclosure | comparator output (01-05) | low | mitigate | prints table, column and index names only; no URLs | closed |
| T-1-15 | Tampering | applied migration history (VALIDATION T-1-migr) (01-08) | critical | mitigate | sha256 manifest in journal order; `git diff --quiet HEAD` on SQL/journal/old snapshots; generate runs only on temp copies; DROP in a generated diff is a STOP | closed |
| T-1-16 | Tampering | drizzle-kit reading a live URL through `drizzle.config.ts` (01-08) | high | mitigate | every drizzle-kit call uses `--dialect/--schema/--out` without `--config`; config guard proven in Task 3 | closed |
| T-1-17 | Tampering | verify child env (01-10) | high | mitigate | every step runs with `isolatedChildEnv` (no `DATABASE_URL`, `SUPABASE_*`, `PG*`) and a guarded scratch `TEST_DATABASE_URL`; acceptance grep forbids forwarding | closed |
| T-1-18 | Tampering | dependency resolution via a stray lockfile (01-10) | medium | mitigate | `check-lockfile.mjs` first step of verify (and first CI step in 01-15) | closed |
| T-1-19 | Tampering | oxfmt write mode over the tree (01-06) | medium | mitigate | this plan runs only `oxfmt --check`; `**/drizzle/**` is ignored so applied SQL and snapshots are never touched, and `.yarn/**` (vendored Yarn release executed through `yarnPath`), `**/*.pen`, `yarn.lock` are ignored so vendored and non-source tracked files are never rewritten; reformat is isolated in 01-14 with a user commit and a diff-path gate | closed |
| T-1-20 | Information disclosure | Vercel build reproduction env (01-06) | medium | mitigate | fixed fake values (`postgres://ci:ci@127.0.0.1:5432/test_ci`, `ci-build-secret`); explicit env vars take precedence over `app/web/.env` | closed |
| T-1-21 | Tampering | rbac dist consumed by production builds (01-06) | medium | mitigate | `check-rbac-dist.mjs` asserts file names and ESM/CJS export parity against the tsup baseline; both Vercel build commands reproduced | closed |
| T-1-22 | Tampering | `resolveLocalPath` (VALIDATION T-1-path) (01-07) | high | mitigate | normalise + reject `..`/absolute/backslash/NUL/empty; `path.resolve` + `path.relative` check; `realpath` of target (read) or deepest existing ancestor (write) under `realpath(root)`; table tests incl. symlink and sibling-prefix cases. Path traversal is canon (ASVS V12); this register covers it rather than a minted prohibition | closed |
| T-1-23 | Information disclosure | `getClient()` in isolated processes (01-07) | high | mitigate | `isIsolatedEnv()` short-circuits `getClient()` to null; test spies on `createClient` with fake Supabase vars set | closed |
| T-1-24 | Denial of service | partial writes (01-07) | low | mitigate | temp file + `rename` for local writes | closed |
| T-1-25 | Tampering | e2e Express / seed reaching live DB (VALIDATION T-1-env) (01-09) | critical | mitigate | `isolatedChildEnv` strips `DATABASE_URL`/`SUPABASE_*`/`PG*`; `BIO_EXAM_ISOLATED_ENV=1` makes `db/index.ts` use the guarded scratch `TEST_DATABASE_URL`; the seed refuses to run outside isolated + local-storage mode; the wrapper runs the 01-01 isolation-probe with the Express environment before Playwright starts and fails unless no `.env` was loaded, no Supabase variable is set and the database is `test_e2e_*` | closed |
| T-1-26 | Information disclosure | e2e writing to Supabase Storage (01-09) | high | mitigate | `STORAGE_DRIVER=local` with a temp dir; `getClient()` returns null in isolated mode (01-07) | closed |
| T-1-27 | Spoofing | e2e JWT secret / passwords reused in production (01-09) | medium | mitigate | fixed strings marked test-only in `seed.json`/`e2e.mjs`, passed only to processes that `e2e.mjs` starts, never written to any `.env`, Vercel or deployment config; they sign tokens for a scratch database that is dropped after the run | closed |
| T-1-28 | Tampering | `next build` and `next start` picking up `app/web/.env` values (the live `DATABASE_URL`, the developer's `API_ORIGIN`, secrets) through `@next/env`; SSR then calls the developer's API or opens a pool on the live database (01-09) | high | mitigate | one explicit, closed web environment (`buildWebEnv`) for build and start; `NODE_ENV=production` for the web, `development` for Express only; `node scripts/lib/e2e-web-env.mjs --check` runs before `next build` and as the first command of the Next webServer entry and fails on any wrong value or any `.env*` key name left unset (names only, never values); node:test cases include a fixture `.env` with decoy live keys and the `@next/env` fill-but-never-override control; Playwright config fails closed when started outside `yarn e2e` | closed |
| T-1-29 | Tampering | specs mutating shared fixtures (01-11) | low | mitigate | per-project and per-check fixtures (`review-d1-<p>`, `authoring-<p>`); `workers: 1`; scratch database per run | closed |
| T-1-30 | Repudiation | defect checks silently passing or skipped (01-11) | medium | mitigate | `test.fail()` (unexpected pass is an error); setup runs outside the annotated test so a broken setup cannot pass as the expected failure; acceptance forbids `test.skip(`; pre-annotation failure messages recorded | closed |
| T-1-31 | Information disclosure | `.env.example` files (VALIDATION T-1-secrets) (01-13) | high | mitigate | placeholder-only rule + secret patterns (eyJ, sb_, supabase hosts, pooler, long random) enforced in `yarn verify`; acceptance grep on both files | closed |
| T-1-32 | Information disclosure | env-contract check reading `.env` (01-13) | medium | mitigate | the check reads only `.env.example`, the config JSON and source files; documented and tested | closed |
| T-1-33 | Tampering | docs instructing unsafe DB use (01-13) | medium | mitigate | README and AGENTS.md state that development, tests and migrations target local `test_*` databases; human read-through in Task 2 | closed |
| T-1-34 | Tampering | production database during D-07 (01-12) | critical | mitigate | user-run only; `PGOPTIONS='-c default_transaction_read_only=on'`; `--schema-only`; agents never receive credentials | closed |
| T-1-35 | Information disclosure | `prod-schema.sql`, `prod-meta.txt`, report (01-12) | medium | mitigate | files under gitignored `.planning/`; password prompted interactively, never in env or files; report grep forbids connection strings, `PGPASSWORD=` and libpq `password=` assignments while leaving schema identifiers such as `password_hash` alone | closed |
| T-1-36 | Spoofing | wrong pooler / wrong database (01-12) | low | accept | the user picks the host and user from their own config; the report records `show timezone` and collation so a wrong target is visible | closed (accepted) |
| T-1-37 | Tampering | repository-wide rewrite hiding a logic change (01-14) | medium | mitigate | Task 1 makes the user commit waves 1-9 first and the executor confirms an empty `git status --porcelain`; Task 2 precondition repeats the check; `yarn verify` + `yarn e2e` on the reformatted tree; user reviews `git diff --stat` before the separate commit | closed |
| T-1-38 | Tampering | migrations and vendored or non-source files rewritten by the formatter (01-14) | high | mitigate | `**/drizzle/**`, `.yarn/**`, `**/*.pen`, `yarn.lock` and other protected paths in `ignorePatterns` (01-06); Task 2 diff gate: empty `git diff` over the protected paths plus an expected-extension check on `git diff --name-only`; Task 3 re-checks the recorded commit's paths | closed |
| T-1-39 | Elevation of privilege | workflow token and triggers (VALIDATION T-1-ci) (01-15) | high | mitigate | `permissions: contents: read`; trigger `pull_request` only (no target-context trigger); `persist-credentials: false`; policy check in `yarn verify` forbids write permissions, `id-token` and target-context triggers | closed |
| T-1-40 | Information disclosure | secrets in CI (01-15) | high | mitigate | the workflow references no repository secrets; only throwaway service-container credentials and fake build values; policy check forbids secret references | closed |
| T-1-41 | Tampering | deployment or production access from CI (01-15) | critical | mitigate | no deploy, hosting-CLI or artifact-upload step; the database is a service container; policy check forbids these patterns (D-24) | closed |
| T-1-42 | Tampering | third-party actions (01-15) | medium | accept | only official `actions/*` at verified majors; SHA pinning is optional hardening at ASVS L1 and is listed for Phase 2 | closed (accepted) |
| T-1-SC | Tampering | npm/pip/cargo installs (14 plans) | high | accept | this plan installs no package (uses `pg`, `tsx`, `dotenv` already in the lockfile); the package-legitimacy gate lives in 01-02 | closed (accepted) |
| T-1-SC | Tampering | npm/pip/cargo installs (01-02, 01-15) | high | mitigate | package-legitimacy gate (Task 1, `gate="blocking-human"`, never auto-approved) before the only install pass of the phase; exact pins; later CI uses `yarn install --immutable` | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Evidence per threat (file:line, test name or command) is recorded in the audit below; summary: guard `app/server/src/config/test-database-url.ts`, isolation in `env.ts`/`db/index.ts`/`apply-migration.ts`/`drizzle.config.ts`/`seed.ts`/`bootstrap-admin.ts`, child-env stripping `scripts/lib/test-db.mjs`, migration manifest + `scripts/check-migrations.mjs`, storage containment `app/server/src/services/storage/storage.ts`, closed web env `scripts/lib/e2e-web-env.mjs`, CI policy `scripts/check-ci-workflow.mjs`, env contract `scripts/check-env-contract.mjs`, lockfile guard `scripts/check-lockfile.mjs`; tests `scripts/**/*.test.mjs`, `app/server/src/config/*.test.ts`, `storage.local.test.ts`, `test-db.mjs --self-test`; CI run 37114466556 (green on e02a86b).

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-1 | T-1-SC (01-01, 01-03..01-14, 01-16) | No package installs in these plans; the real control is the 01-02 blocking-human package gate (exact pins, registry facts). `yarn.lock` changed only in f0913e6 during the phase | plan threat model; user passed the 01-02 gate | 2026-10-03 |
| AR-2 | T-1-36 | The user chooses the pooler/database for the read-only dump; the report records timezone and collation so a wrong target is visible | plan threat model | 2026-10-03 |
| AR-3 | T-1-42 | CI uses only official `actions/*` pinned by major; SHA pinning is optional hardening at ASVS L1 and is listed for Phase 2 | plan threat model | 2026-10-03 |

*Accepted risks do not resurface in future audit runs.*

---

## Hardening Notes (non-blocking at ASVS L1) — all three fixed 2026-10-03 after code review (see 01-REVIEW-DISPOSITION.md)

- **H-1 — guard bypass via `?host=` (within T-1-01).** `assertTestDatabaseUrl` checks `new URL(raw).hostname` but ignores query parameters; node-postgres and libpq let `?host=` override the host, so `postgres://u@127.0.0.1:5432/test_x?host=db.example.invalid` passes the guard. The modelled vector (`.env` / `DATABASE_URL` inheritance) stays blocked; exploiting this needs a deliberately crafted `TEST_DATABASE_URL`. Fix in one place (`app/server/src/config/test-database-url.ts`): reject any query string, or re-parse with `pg-connection-string` and check the resolved `host`/`hostaddr`.
- **H-2 — CI trigger policy.** `check-ci-workflow` forbids `pull_request_target` but not `workflow_run` or other triggers; consider allowing only `pull_request` and `push`.
- **H-3 — explicit strip lists.** `isolatedChildEnv` strips named `SUPABASE_*`/`PG*` keys rather than by prefix (`PGHOSTADDR`, `PGPASSFILE`, `PGSERVICEFILE` not stripped); prefix stripping would match the register wording.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-03 | 58 register rows (43 unique IDs; 42 mitigate, 16 accept) | 58 | 0 | gsd-security-auditor (opus), ASVS L1, block_on high |

## Security Audit 2026-10-03
| Metric | Count |
|--------|-------|
| Threats found | 58 |
| Closed | 58 |
| Open | 0 |

Dynamic evidence: 88/88 node tests (isolation-guards, e2e-web-env, check-ci-workflow, check-env-contract, check-lockfile, check-migrations); 92/92 vitest (storage.local, test-database-url); `test-db.mjs --self-test` 14/14; `checkManifest()` ok; applied SQL/journal unchanged since 11b2916; format commit 2b59334 reproduced byte-identical for 219/220 files (the 220th is `.oxfmtrc.json`); credential grep on D-07 artifacts 0 hits; CI run 37114466556 green.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-03

### Hardening follow-up 2026-10-03

H-1 fixed (`assertTestDatabaseUrl` rejects any query string or fragment; tests for `?host=`, `?hostaddr=`, `?sslmode=`, `#fragment`). H-2 fixed (CI `on:` allowlist `pull_request` + `push`; any `secrets` context reference forbidden — also WR-03). H-3 fixed (`isStrippedEnvKey`: `DATABASE_URL`, `/^SUPABASE_/`, `/^PG(?!_)[A-Z]+$/`; `PG_BIN_DIR`/`PG_FORCE_SSL`/`PG_POOL_MAX` kept). `threats_open` stays 0.
