<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Carried forward (locked in `.planning/PROJECT.md`, not re-asked):
- **ADR-0003 (PROJECT D-03).** Vitest in every workspace, root `yarn verify`, CI on PRs, Yarn 4 as the only package manager.
- **D-07.** `package-lock.json` is deleted, and a CI guard fails on a second lockfile.
- **D-08.** The 12 `*.test.ts` files are ported to Vitest, with their assertion meaning unchanged. They are not wrapped.
- **Plan 009 guards.** Applied SQL migrations are never edited, reordered or re-checksummed. A generated diff that proposes a drop or recreate is a STOP.

#### Disposable database (tests, migration check, e2e)
- **D-01:** The local disposable PostgreSQL comes from Homebrew `pg_ctl` (PostgreSQL 17.10, the same major as Supabase 17.6). A script `initdb`s a fresh cluster in a temp directory, starts it on a free port, and stops and removes it afterwards. No Docker is required. CI uses a `postgres:17` service container. The migration chain runs on plain PostgreSQL 17: migration 0018 creates the `extensions` schema and moves `pg_trgm` into it, and RLS policies target `public`. No Supabase roles or images are needed. This also matches the self-hosted target, because the project is leaving Supabase and Vercel for its own server (Milestone 2).
- **D-02:** Tests and the migration check read only `TEST_DATABASE_URL`, never `DATABASE_URL`. The harness refuses to run unless the host is `localhost` or `127.0.0.1` and the database name starts with `test_`. Today `DATABASE_URL` in `app/server/.env` and `app/web/.env` points at the Supabase pooler (`aws-1-eu-north-1.pooler.supabase.com`), which holds live data.
- **D-03:** `yarn verify` starts the temporary `pg_ctl` cluster itself, runs everything, and tears the cluster down. If PostgreSQL is not installed, it fails with a clear message. It never skips DB tests silently.
- **D-04:** Restore only the current Drizzle snapshot. Intermediate snapshots (0002–0014, 0016–0019) are not reconstructed. Today only `0000`, `0001` and `0015` exist in `app/server/drizzle/meta/`.
- **D-05:** Migrate the project to Drizzle v1 (`drizzle-orm` and `drizzle-kit` 1.x) in this phase, together with the snapshot work. The restored snapshot and migrations folder are produced directly in the v1 format, so the work is not done twice. The migration check is built on v1 from the start. — **Reversibility:** costly — the migrations folder format, `drizzle.config.ts` and `src/scripts/apply-migration.ts` change together; undoing means converting the folder back. Research must establish whether v1 changes the applied-migrations tracking table in the database. If it does, rolling the change out to the live database is **one-way** and needs a gated step. Phase 1 itself never writes to the live database.
- **D-06:** The Drizzle v1 migration is mechanical: version bumps, migrations converted to the v1 format, and existing relational queries (`db.query.*`, about 76 call sites in about 10 files; `relations()` × 11 in `schema.ts`) kept working through the v1 compatibility path. Query behaviour does not change. Queries are rewritten on the new API module by module in Phases 4, 5, 7 and 8, inside the ADR-0005 modules. A wholesale data-layer rewrite was rejected: no tests protect it yet, and the known query defects (non-atomic start/submit, read-modify-write JSON, serial queries, row-by-row point sync) live inside modules that are already scheduled for rewrite.
- **D-07:** Compare the schema once, read-only, in this phase. Take a `pg_dump --schema-only` from the current Supabase database and diff it against a disposable database after migrations 0000→latest. Record the differences in the phase report. This check is not part of CI, because CI has no production access. It also gives the baseline for the later data transfer to the own server.

#### `yarn verify` strictness and toolchain
- **D-08:** Move to the ox toolchain in every workspace (`app/web`, `app/server`, `packages/rbac`):
  - `oxlint` replaces ESLint. It covers the current coverage: Next.js rules, react-hooks, TypeScript, unused vars with the `^_` ignore pattern.
  - `oxfmt` replaces Prettier.
  - ESLint, Prettier and their plugins and configs are removed (`app/web/eslint.config.mjs`, `.prettierrc.json`, `app/web/.prettierrc.json`, eslint-* and prettier-* devDependencies).
- **D-09:** `@bio-exam/rbac` is built with `tsdown` instead of `tsup`, with the same outputs: ESM, CJS and `.d.ts` in `dist`. `packages/exam-core` (Phase 3) will start on the same setup.
- **D-10:** Keep `oxfmt` even if it cannot reproduce the Prettier plugins' Tailwind class sorting or import sorting (`prettier-plugin-tailwindcss`, `@trivago/prettier-plugin-sort-imports`). The missing ordering is accepted, or enforced by an oxlint rule if one exists.
- **D-11:** Reformat the whole repository once, as a separate format-only step with no logic changes, that the user commits separately. Its commit hash goes into `.git-blame-ignore-revs`. After that, `oxfmt --check` runs inside `yarn verify`.
- **D-12:** Lint errors in legacy code are fixed. Rules that fire en masse are set to `warn` temporarily and listed as tech debt. `yarn verify` fails on errors.

#### Tests: Vitest and Playwright
- **D-13:** Vitest stays the module and unit runner (ADR-0003 unchanged). Playwright e2e is added **in addition** in this phase, as the outside-in safety net before Phases 3–8 rewrite the internals. Replacing Vitest with Playwright was rejected, because ADR-0002, 0004 and 0005 rely on fast module, table and contract tests.
- **D-14:** e2e flows in Phase 1:
  1. Login and logout for a student and an admin; a protected page redirects to login.
  2. A student opens an assigned test that contains all five question templates, answers, submits and sees the score.
  3. Attempt review, as the student and as the admin.
  4. Question authoring: an admin creates and saves questions.

  Known defects (D1 key substitution in admin review, D2 sequence metric, D5 multi-variant short-text save) are captured as expected-to-fail checks. They are flipped when their phase fixes them.
- **D-15:** `yarn e2e` is a separate command. It brings up the disposable DB, a deterministic seed, the API and the web app, then runs Playwright. CI runs `yarn verify` and `yarn e2e` on every run. `yarn verify` stays fast.
- **D-16:** Playwright runs Chromium in two projects: desktop and a mobile viewport.
- **D-17:** The e2e environment is fully isolated. The app processes get the disposable DB, a test-only JWT secret, no Supabase keys and the local storage driver (D-18). Nothing in e2e may reach the live database or Supabase Storage.
- **D-18:** Add a minimal local-disk storage driver in this phase. The current `StorageService` (`app/server/src/services/storage/storage.ts`) gains a local-folder mode for read, write, upload, delete and list, selected by configuration. Without Supabase it currently throws on write and returns `''` on read, so prompts render empty. The `StorageService` interface does not change. Path containment (a resolved path never leaves the configured root) is enforced from day one. The full ADR-0004 seam stays in Phase 7: interface redesign, contract test suite across adapters, key normalisation, URL rule and streaming ZIP. — **Reversibility:** reversible — additive mode behind configuration.
- **D-19:** Port `app/web/lib/auth/getServerMe.test.ts` from its `vm` recompile harness to Vitest with `vi.mock` for `fetch`, `next/headers` and the `getMeData` import. The assertions stay the same. It protects behaviour until Phase 4 replaces `getMeData`.

#### CI
- **D-20:** GitHub Actions runs on pull requests and on pushes to `master`.
- **D-21:** CI also builds `next build`, the server and the packages. Local `yarn verify` does not build.
- **D-22:** CI is advisory. No branch protection is required, and direct pushes to `master` keep working. The user commits directly to `master` today.
- **D-23:** Cache Yarn and Turbo with `actions/cache`. No Turbo remote cache, and no new Vercel dependency, because the project is leaving Vercel.
- **D-24:** CI contains no deployment or write step. It reaches production by no path.

#### Docs
- **D-25:** Project docs (root `README.md`, `app/server/README.md`, env-example comments) are written in Russian. Identifiers, commands and paths stay as they are.
- **D-26:** `app/server/README.md` becomes a short overview: API areas, access rules, the five question templates, run and migrate commands. It contains no exhaustive route list, because exact routes live in code and CodeGraph and the router is split in Phase 8.
- **D-27:** `AGENTS.md` gains project commands, scope and routing next to its existing CodeGraph section. `CLAUDE.md` keeps importing it (`@AGENTS.md`). Project-specific rules stay valid for any developer; personal rules are not copied into project files.

### Claude's Discretion
- How `oxfmt` is configured (indentation and quotes follow the current `.prettierrc.json` where possible).
- The Vitest layout: a workspace or projects config versus per-package configs.
- The e2e seed contents and fixtures, kept minimal and deterministic.
- The env-contract check mechanism: an allowlisted comparison of `.env.example` keys with the zod env schemas in `app/web/lib/env/server.ts` and `app/server/src/config/env.ts`.
- The local storage driver's root path and configuration key names.

### Deferred Ideas (OUT OF SCOPE)
- **VER-08 (project skills `bio-exam-web`, `bio-exam-api`, `bio-exam-data`).** Deferred until after Phases 3–5. Skills written now would describe code that is about to be rewritten (exam-core, auth, attempts). The user confirmed this deferral in discussion on 2026-10-03. `AGENTS.md` plus `docs/adr/` cover agent guidance until then.
- **Rewriting all relational queries onto the Drizzle v1 query API.** This happens per module in Phases 4, 5, 7 and 8, not in Phase 1 (D-06).
- **The full storage seam from ADR-0004.** Interface, contract tests, key normalisation, URL rule and streaming ZIP stay in Phase 7; Phase 1 adds only a minimal local mode (D-18).
- **Branch protection that makes CI a required check.** The user chose advisory CI for now (D-22); revisit when work moves to PR branches.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VER-01 | Vitest in every workspace; all 12 existing `*.test.ts` ported with assertion meaning unchanged | Vitest 5.0.3 + vite 8.3.2 verified on a `vi.mock` port of `getServerMe.test.ts` (Standard Stack, Pattern 5, Pitfalls 9-10). `question-type-resolver.test.ts` imports `db/index.ts` transitively (Pitfall 9). `packages/rbac` has no tests today (needs one smoke test). |
| VER-02 | Root `yarn verify` = lint + typecheck + test across workspaces, exit 0 on a clean tree | Pattern 1 (verify orchestrator), Turbo strict-env pitfall (Pitfall 12), oxlint parity config gives 0 errors today (Pattern 7). |
| VER-03 | CI on every PR: Corepack, `yarn install --immutable`, `yarn verify`, migration check; no deploy/write step | Pattern 9 (workflow), action versions verified, `yarn install --immutable` verified green on a clone. |
| VER-04 | `package-lock.json` deleted; CI fails on a second lockfile | Pattern 9 lockfile guard; `NEXT_IGNORE_INCORRECT_LOCKFILE` in `app/web/.env` becomes obsolete. |
| VER-05 | Disposable PostgreSQL harness locally and in CI, never `DATABASE_URL` | Pattern 2 (pg_ctl lifecycle, 3 verified failure modes), Pattern 3 (guard), Pitfall 1 (`.env` override hazard). |
| VER-06 | `.env.example` for web and server with placeholders only + allowlisted env-contract check in `yarn verify` | Pattern 8; `app/web/.env.example` does not exist, server example is stale; server has NO zod env schema (Conflict C5). |
| VER-07 | Root README, `app/server/README.md`, `AGENTS.md` commands/scope/routing | Docs section of Architecture Patterns; D-25..D-27 constraints. |
| VER-08 | Project skills | **DEFERRED** by CONTEXT.md `<deferred>` (user-confirmed 2026-10-03). Nothing to research or plan. |
| DRZ-01 | Migration chain 0000-0020 on an empty DB yields exactly `schema.ts` | **Currently false** (Conflict C3). Divergence register measured; schema.ts edits prototyped to reach an empty `push --explain` (Pattern 4). |
| DRZ-02 | Snapshot continuity through 0020 with supported tooling; no applied SQL edited | Both the v0 (stable) and v1 (rc) restore procedures were executed and verified (Pattern 4). |
| DRZ-03 | CI check: migrate from zero, subsequent generation has no unexpected diff | Pattern 4 migration-check pipeline (`migrate` -> `push --explain` = [] -> `generate` no new files -> checksum manifest). |
</phase_requirements>

# Phase 1: Verification baseline - Research

**Researched:** 2026-10-03
**Domain:** Monorepo verification tooling (Vitest, oxlint/oxfmt, tsdown, Playwright), disposable PostgreSQL harness, Drizzle migration metadata, GitHub Actions CI
**Confidence:** HIGH for everything measured in this session (scratch experiments on PG 17.10 + real tool runs); MEDIUM for GitHub-runner behaviour, the full Next + Playwright run and Vercel builds (not executed here; see Assumptions Log)

## Summary

The phase is feasible and almost every moving part was exercised end to end in disposable scratch copies (repo working tree is untouched: `git status` clean). The migration chain 0000-0020 applies cleanly on plain PostgreSQL 17.10; the Express API boots on that DB, seeds roles, bootstraps an admin, logs in and serves `/api/auth/me` with no Supabase variables; `next build` passes with three placeholder variables; Vitest 5.0.3 runs a representative `vi.mock` port of the `vm`-based `getServerMe` test (2 of its scenario groups); oxfmt reproduces the current Prettier + trivago import-sort output on all 402 `app/web` TypeScript files with 0 diffs; tsdown reproduces `index.js` / `index.cjs` / `index.d.ts` / `index.d.cts` for `@bio-exam/rbac` with identical runtime exports.

**Four findings contradict assumptions baked into CONTEXT.md and must be put to the user before planning (see "Decision conflicts" and Open Questions).** None of them is hidden in the pitfalls list on purpose: C1 (Drizzle v1 has no RQB v1 for PostgreSQL, so D-06's "mechanical, compatibility path" is false), C2 (no stable Drizzle 1.x exists as of 2026-10-03), C3 (DRZ-01 is currently failing: the chain does not produce `schema.ts`), C4 (`config/env.ts` loads `.env` with `override: true`, so a test or e2e process that is handed a disposable `DATABASE_URL` is silently re-pointed at Supabase when a local `.env` exists). C5-C7 are smaller factual corrections.

**Primary recommendation:** Build the safety layer first (TEST_DATABASE_URL guard + `.env`-override kill switch + pg_ctl harness), then the Vitest port and `yarn verify`, then the Drizzle work in the order *edit `schema.ts` to declare DB truth -> gate with `drizzle-kit push --explain` returning no statements -> restore the snapshot -> (only if the user confirms C1/C2 option A) swap to the v1 folder + migrator*, then the ox toolchain swap and the single format-only commit, then storage local mode + Playwright, then CI and docs. Do not let any agent commit (user rule); the format commit and its hash in `.git-blame-ignore-revs` are manual steps for the user.

## Decision conflicts requiring user confirmation (read first)

| # | Locked decision | What research found | Evidence | Options |
|---|-----------------|---------------------|----------|---------|
| **C1** | D-06: v1 migration is "mechanical", `db.query.*` (76 sites) "kept working through the v1 compatibility path" | **There is no RQB v1 compatibility path for PostgreSQL in drizzle-orm 1.0.0-rc.4.** `drizzle()` for PG no longer accepts `schema`, `db._query` does not exist in `pg-core`, `relations()` moved to `drizzle-orm/_relations` and is ignored by the PG driver. A server typecheck against rc.4 gives 176 errors with only the import fixed and still **82 errors** after adding a `defineRelations` stub (all `where: eq(...)` -> RQB v2 object filters, plus `drizzle(pool)` -> `drizzle({ client: pool, relations })`). | `[VERIFIED: /Volumes/T7/its/lifemy-doc-drizzle-v1/node_modules/drizzle-orm/pg-core/utils.d.ts:55]` `type DrizzlePgConfig<TRelations extends AnyRelations> = Omit<DrizzleConfig<Record<string, never>, TRelations>, 'schema'> & {` ; no `_query` in `pg-core/` of rc.4 or of nightly `1.0.0-rc.5-5935859` (grep); `[CITED: https://github.com/drizzle-team/drizzle-orm/releases]` (RQB v1 removed from PostgreSQL in rc.1) | **A** keep D-05 and accept a bounded rewrite: ~76 one-line `where` edits in 10 files + 1 real relation (`routes/tests/index.ts:2652`) + 3 `columns:` projections + `drizzle()` signature in `db/index.ts` and `scripts/apply-migration.ts`; sequence it after the Vitest port and e2e so it is protected. **B** stay on stable `drizzle-orm@0.45.3` / `drizzle-kit@0.31.11` in Phase 1: the snapshot restore (DRZ-02) and `generate`/`check` (DRZ-03) are verified, the Phase 2 Drizzle advisory is closed (>= 0.45.2), no query code changes, and the RQB rewrite is done once (inside the Phase 4/5/7/8 module rewrites that D-06 already schedules) instead of twice; the conversion script below is reusable later. **Gate asymmetry (decides the trade-off):** A has a verified structured DRZ-01 gate (`push --explain --output json`); B's DRZ-01 gate is weaker: kit 0.31 has no dry run, `generate` against a pulled snapshot is unusable (measured: drops/re-creates all 32 indexes, 4 FKs, 25 policies from cosmetic representation differences), and the usable form is a text parse of `push --verbose --strict </dev/null` (verified non-mutating) whose zero state was **not** demonstrated (see 4g). **Research leans B for runtime risk, but this is the user's call:** choose A if a machine-checkable DRZ-01 gate and being on the v1 format now outweigh an rc dependency in production and an unprotected-until-e2e 82-site rewrite; choose B if unchanged query behaviour and a single rewrite win. |
| **C2** | D-05: "drizzle-orm and drizzle-kit 1.x" | **No stable 1.x exists.** npm `latest` = `drizzle-orm@0.45.3` (2026-09-21), `drizzle-kit@0.31.11`. The `rc` tag = `1.0.0-rc.4` (2026-06-27); rc.5 exists only as nightly `1.0.0-rc.5-5935859` (2026-09-09) under tag `rc5`. The neighbour project already runs rc.4. | `[VERIFIED: npm registry]` `npm view drizzle-orm dist-tags` -> `"latest": "0.45.3"`, `"rc": "1.0.0-rc.4"`, `"rc5": "1.0.0-rc.5-5935859"`; `npm view drizzle-orm versions` has no `1.x` without a pre-release suffix. `[CITED: https://github.com/drizzle-team/drizzle-orm/releases]` | If option A: pin **exactly** `1.0.0-rc.4` (no caret) in both packages. GHSA-gpj5-g38j-94v9 (SQL injection via identifier escaping) is fixed in `0.45.2` **and** `>= 1.0.0-beta.20`, so both options close the Phase 2 advisory. `[VERIFIED: api.github.com/advisories]` |
| **C3** | DRZ-01 / plan 009: migrations 0000-0020 "yield exactly" `schema.ts` | **They do not.** `drizzle-kit push --explain` against a freshly migrated DB lists 25 `drop_policy` + 25 `alter_rls` (RLS + `deny_direct_access` from 0018 are not declared in `schema.ts`), 10 `alter_column` (DB is `timestamptz`, `schema.ts` says `timestamp()`), 7 `drop_index` (3 hand-named `idx_*` + `idx_users_locked_until` + `idx_refresh_tokens_expires_at` + the gin trigram index undeclared) and 4 `create_index` (Drizzle-style names vs migration names). The snapshot restore passes `check`/`generate` only because it is generated *from* `schema.ts` (tautological). The timestamp mismatch is also a **runtime** hazard: a `timestamptz` column read through `timestamp()` is shifted by the session timezone offset (verified: Asia/Bangkok +7h, America/New_York -4h; correct only when the DB session is UTC). | Experiment output in Pattern 4; `[VERIFIED: app/server/src/db/schema.ts:407-408]` `createdAt: timestamp('created_at').notNull().defaultNow(),` / `submittedAt: timestamp('submitted_at').notNull().defaultNow(),` vs migration 0004 `created_at timestamptz NOT NULL DEFAULT now()` | Fix **`schema.ts`** to declare DB truth (no new migration, no SQL edits): `withTimezone: true` on 10 columns, explicit existing index names, 3 undeclared indexes (incl. gin `.op('gin_trgm_ops')`), and either declare RLS (`pgTable.withRLS` + `pgPolicy`) or allowlist it in the DRZ-01 gate. Then restore the snapshot. See Pattern 4 for the verified recipe and the order. |
| **C4** | D-02 / D-17: tests and e2e read only `TEST_DATABASE_URL`; app processes get the disposable DB | **`app/server/src/config/env.ts` loads `.env` with `override: true`.** `db/index.ts` imports it first. A process started with `DATABASE_URL=<disposable>` while `app/server/.env` exists is re-pointed at the value in `.env` (Supabase pooler, live data). Same hazard for `yarn seed`, `yarn bootstrap:admin`, the Express e2e server and any Vitest test that imports `db/index.ts` (`question-type-resolver.test.ts` does). `dotenv/config` in `apply-migration.ts` / `drizzle.config.ts` does NOT override (safe), `config/env.ts` does. | `[VERIFIED: app/server/src/config/env.ts:33]` `dotenv({ path: p, override: true }) // <- разрешаем переопределять` ; `[VERIFIED: app/server/src/db/index.ts:67]` `export const db: DB = drizzle(pgPool, { schema })` with `import '../config/env.js'` on its line 4 | Phase 1 **must** add an isolation switch (e.g. `BIO_EXAM_ISOLATED_ENV=1` makes `config/env.ts` skip dotenv entirely) and a startup assertion in `db/index.ts` that, when the switch is on, the URL passes the same `assertTestDatabaseUrl` guard. This is additive and does not change production behaviour. Treat as the first task of the phase. |
| **C5** | Discretion item: "zod env schemas in `app/web/lib/env/server.ts` **and `app/server/src/config/env.ts`**" | Only the web file has a zod schema. `app/server/src/config/env.ts` is a dotenv loader plus a production check for two keys; the server reads ~30 distinct `process.env.*` keys scattered in code. | `[VERIFIED: app/web/lib/env/server.ts:4-19]` zod object with `DATABASE_URL`, `AUTH_JWT_SECRET`, optional `SESSION_COOKIE_NAME`, `NEXTAUTH_*`, `APP_ORIGIN` ; server key inventory in Pattern 8 | Env-contract check = regex-extract `process.env.NAME` per workspace (+ the web zod keys) compared with `.env.example` files and an allowlist. Do not introduce a server zod schema in Phase 1 (scope creep). |
| **C6** | D-10: oxfmt "may not reproduce" Tailwind/import sorting | oxfmt 0.71.0 has **built-in** `sortImports` (perfectionist-like) and `sortTailwindcss`. A tuned `sortImports` config reproduces the trivago output with **0 diffs on `app/web`**. Tailwind sorting has been **inert** in the repo (`tailwindStylesheet: ./app/globals.css` does not exist; the real file is `app/web/styles/globals.css`), so "parity with today" means no class re-ordering; enabling `sortTailwindcss` with the real stylesheet rewrites 85 files (class order only). | Pattern 6 numbers; `[VERIFIED: app/web/.prettierrc.json:10]` `"tailwindStylesheet": "./app/globals.css",` | Gate on parity first (0 diffs), then decide in the single D-11 format commit whether to enable `sortTailwindcss` (recommended: yes, correct stylesheet, one-time churn). |
| **C7** | VER-01 "12 existing test files ... in `app/web`, `app/server`, `packages/rbac`" | `packages/rbac` has no tests; `question-type-resolver.test.ts` is not a pure unit test: it transitively imports `db/index.ts`, which throws `DATABASE_URL is not set` at import. | `tsx question-type-resolver.test.ts` -> `Error: DATABASE_URL is not set` at `db/index.ts:10`; the other 11 pass under `tsx` | Add one rbac smoke test (export parity; also guards the tsdown swap). `vi.mock('../../db/index.js')` in the resolver test (assertions unchanged); never set a dummy `DATABASE_URL` (D-02). |

**Everything below the table is written so that it works under either C1/C2 option; steps that differ are labelled `[option A]` (v1 rc.4) / `[option B]` (stable 0.x).**

## Project Constraints (from CLAUDE.md and the user's global rules)

Sources: `/Users/kdvornichenko/bio-exam/CLAUDE.md` (disk content: `@AGENTS.md`), `/Users/kdvornichenko/bio-exam/AGENTS.md`, `~/.claude/CLAUDE.md`. Note: the project instructions injected into the session still show a stale GitNexus block; `AGENTS.md` on disk (commit `a2f501a`) is CodeGraph-only and the user's global rule 3 says CodeGraph wins.

- **No commits by agents.** The user commits. Leave changes in the working tree; the repository-wide format commit (D-11) and the `.git-blame-ignore-revs` hash are manual user steps. Plans must not contain `git commit` tasks, and the GSD docs-commit step must not run.
- **Code navigation: CodeGraph** (`codegraph explore | node | impact | affected`). Before editing a symbol run `codegraph impact <symbol>` and report callers. When `.codegraph/` is missing say so and use `rg` + direct reads (it exists here).
- **`.env` files may be read, values must never be printed or copied** into plans, logs or docs. Every database in `.env` is local/test data on the user's home server **except** the Supabase pooler URL in `app/server/.env` and `app/web/.env`, which holds live data (31 users, 63 tests, 1834 questions, 264 attempts at the 2026-09-26 baseline). Treat every DB-touching script as dangerous unless it proves `localhost` + `test_*`.
- **No Codex, no agent teams.** Parallelism = plain parallel subagents. No `workflow.cross_ai_*`.
- **Architecture decisions** live in `docs/adr/`; plan order in `plans/README.md`. ADR-0003 (verification first), ADR-0004 (storage seam stays Phase 7), ADR-0001 (`getMeData` dies in Phase 4).
- **Docs language:** project docs in Russian; identifiers, commands, paths untouched (D-25).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `yarn verify` orchestration, env/lockfile/migration checks | Dev tooling (root `scripts/`, Turbo) | CI | One entry point must behave identically locally and in CI; Turbo only fans out per-workspace tasks. |
| Disposable PostgreSQL lifecycle + URL guard | Dev tooling (Node script around `pg_ctl`) | CI service container | Local has no Docker (D-01); CI supplies `postgres:17`; both go through one guard. |
| `.env` isolation kill switch, DB URL assertion | API / Backend (`app/server/src/config`, `db/index.ts`) | Dev tooling | The override happens inside the server process; only the server can refuse it. |
| Migration history, snapshot, schema truth | Database / Storage (`app/server/drizzle`, `schema.ts`) | Dev tooling (check script) | `schema.ts` + SQL are the source of truth; the check proves they agree on a real PG. |
| Local-disk storage mode + path containment | API / Backend (`StorageService`) | Frontend Server (`/uploads` rewrite) | Express owns files (ADR-0001/0004); Next only proxies `/api` and `/uploads`. |
| Unit/module tests | Per-workspace Vitest | Turbo | Fast, no browser; DB-backed ones read only `TEST_DATABASE_URL`. |
| Outside-in flows (login, take test, review, authoring) | Browser / Client (Playwright) | Frontend Server + API + DB | Safety net before Phases 3-8 rewrite internals. |
| Build artifacts (`@bio-exam/rbac` dist) | Package build (tsdown) | Vercel build commands | `app/web/vercel.json` and `app/server/vercel-build.cjs` call `yarn workspace @bio-exam/rbac build`; script name must not change. |

## Standard Stack

### Core (versions verified against the npm registry on 2026-10-03)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest` | 5.0.3 (peer `vite ^6.4 || ^7 || ^8`) | Unit/module runner, `vi.mock` port of the vm harness | ADR-0003 locked; verified on Node 24.17 against the real `getServerMe` sources. Needs `vite@8.3.2` installed explicitly (peer). |
| `vite` | 8.3.2 | Vitest peer | Required peer, dev-only. |
| `@playwright/test` | 1.63.0 | e2e (Chromium desktop + mobile) | D-13/D-16. `test.fail()` implements "expected-to-fail" for D1/D2/D5. Brings its own `playwright@1.63` next to `playwright@1.58.0` pulled by `react-scan` (two copies; browsers are cached per version: local cache has `chromium-1243` only). |
| `oxlint` | 1.86.0 (exact) | Lint (replaces ESLint) | D-08. 870+ rules; plugins `nextjs`, `react`, `typescript` cover the old config. Node `^20.19 || >=22.12`. |
| `oxfmt` | 0.71.0 (exact, pre-1.0 "alpha/beta") | Format (replaces Prettier) | D-08. Matches Prettier output (0 diffs on 402 web TS files); built-in `sortImports`, `sortTailwindcss`. |
| `tsdown` | 0.23.0 (exact, pre-1.0) | `@bio-exam/rbac` build (replaces tsup) | D-09. Needs `fixedExtension: false` to keep `index.js`/`index.d.ts`. Node `^22.18 || ^24.11 || >=26`. |
| `drizzle-orm` / `drizzle-kit` | **[option B]** `0.45.3` / `0.31.11` (stable, `latest`) **[option A]** `1.0.0-rc.4` / `1.0.0-rc.4` exact | ORM + migrations | See Conflicts C1/C2. Installed today: `drizzle-orm 0.45.1`, `drizzle-kit 0.31.8` (declared `^0.31.5`). |
| `turbo` | ^2.9.8 (latest 2.11.7) | Task fan-out | Already installed; add `test` task. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@oxlint/migrate` | latest (one-shot via `npx`) | Convert `eslint.config.mjs` | Run once, **do not add as dependency**; output needs the cleanups listed in Pattern 6. |
| `oxlint-tsgolint` | 7.0.2003 | Type-aware rules (`--type-aware`) | Optional; not needed for ESLint parity. Skip in Phase 1. |

### Removed in this phase (D-08/D-09)
`eslint`, `@eslint/eslintrc`, `eslint-config-next`, `eslint-config-prettier`, `eslint-plugin-{import,jsx-a11y,node,prettier,react,react-hooks,unused-imports}`, `@typescript-eslint/{eslint-plugin,parser}`, `@next/eslint-plugin-next`, `prettier`, `@trivago/prettier-plugin-sort-imports`, `prettier-plugin-tailwindcss` (web, server and root `.prettierrc.json` files, web `eslint.config.mjs`, web `package.json` `prettier` key), `tsup` (rbac). Keep `rimraf` only if still used by server `build`.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| per-workspace `vitest.config.ts` | root `vitest.config.ts` with `test.projects` | Projects give one process and one report, but ADR-0003/VER-02 want a Turbo `test` task per workspace; per-workspace configs also let `app/web` set the `@` alias and `server-only` mock locally. **Recommend per-workspace.** |
| Playwright `globalSetup` for DB | `scripts/e2e.mjs` wrapper | The wrapper owns teardown even when Playwright crashes; `webServer` still starts Next/Express. **Recommend wrapper.** |
| `drizzle-kit migrate` as runner | keep custom `src/scripts/apply-migration.ts` | The custom runner pins `migrationsSchema: 'public'` (live tracking table location). **Keep it.** |

**Installation (illustrative; exact pins):**
```bash
yarn add -D -W oxlint@1.86.0 oxfmt@0.71.0 vitest@5.0.3 vite@8.3.2 @playwright/test@1.63.0
yarn workspace @bio-exam/rbac add -D tsdown@0.23.0
# [option B] yarn workspace @bio-exam/server add drizzle-orm@0.45.3 && yarn workspace @bio-exam/server add -D drizzle-kit@0.31.11
# [option A] yarn workspace @bio-exam/server add drizzle-orm@1.0.0-rc.4 && yarn workspace @bio-exam/server add -D drizzle-kit@1.0.0-rc.4
```

**Version verification:** `npm view <pkg> version` run 2026-10-03: oxlint 1.86.0, oxfmt 0.71.0, tsdown 0.23.0, vitest 5.0.3, @playwright/test 1.63.0, turbo 2.11.7, vite 8.3.2. `[VERIFIED: npm registry]`

## Package Legitimacy Audit

`gsd_run query package-legitimacy check --ecosystem npm ...` returned **SUS for every package, sole reason `too-new`** (the heuristic keys on the *latest release* being days old; these projects release near-daily). Signals: all have a source repo, 0 postinstall scripts, `deprecated: false`, and very high weekly downloads. This is a recency false positive, but the protocol is followed: **the planner must add one consolidated `checkpoint:human-verify` before the first `yarn add` of this set** (the user confirms the pins). Package names come from official docs (oxc.rs, vitest.dev, playwright.dev, tsdown.dev, orm.drizzle.team), not from search results.

| Package | Registry | Latest published | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|------------------|--------------|-------------|---------|-------------|
| oxlint | npm | 2026-09-28 | 27.7M | github.com/oxc-project/oxc | SUS (too-new) | Flagged - checkpoint |
| oxfmt | npm | 2026-09-28 | 17.6M | github.com/oxc-project/oxc | SUS (too-new) | Flagged - checkpoint |
| tsdown | npm | 2026-09-03 | 4.9M | github.com/rolldown/tsdown | SUS (too-new) | Flagged - checkpoint |
| vitest | npm | 2026-09-30 | 132M | github.com/vitest-dev/vitest | SUS (too-new) | Flagged - checkpoint |
| vite | npm | 2026-10-01 | 221M | github.com/vitejs/vite | SUS (too-new) | Flagged - checkpoint |
| @playwright/test | npm | 2026-09-04 | 80M | github.com/microsoft/playwright | SUS (too-new) | Flagged - checkpoint |
| drizzle-orm | npm | 2026-09-21 | 29.9M | github.com/drizzle-team/drizzle-orm | SUS (too-new) | Flagged - checkpoint |
| drizzle-kit | npm | 2026-09-21 | 24.6M | github.com/drizzle-team/drizzle-orm | SUS (too-new) | Flagged - checkpoint |
| @oxlint/migrate | npm | 2026-09-28 | 125K | github.com/oxc-project/oxlint-migrate | SUS (too-new) | One-shot `npx`, not installed |
| oxlint-tsgolint | npm | 2026-09-24 | 12.1M | github.com/oxc-project/tsgolint | SUS (too-new) | Not recommended in Phase 1 |

**Packages removed due to SLOP:** none. **Packages flagged SUS:** all rows above (version-recency only). Mitigation if the user wants it: pin the previous minor of each tool; the experiments here used exactly the versions in the table.

## Architecture Patterns

### System Architecture Diagram

```
                       developer / CI job
                              |
                +-------------+--------------+
                |                            |
          yarn verify                    yarn e2e
        (scripts/verify.mjs)          (scripts/e2e.mjs)
                |                            |
     1. guard + test DB  <----shared----> 1. guard + test DB
        TEST_DATABASE_URL (preset in CI service, else pg_ctl temp cluster,
        UTC, en_US.UTF-8, 127.0.0.1:<free port>, db test_*)
                |                            |
     2. turbo run lint typecheck test   2. migrate chain -> e2e seed (DB + local files)
        |  oxlint | tsc | vitest              |
        |  (web, server, rbac)         3. Playwright webServer[]:
     3. oxfmt --check .                    Express (NODE_ENV=development, isolated env,
     4. check-env-contract                  local storage root in tmp)  <- Next (API_ORIGIN
     5. check-lockfile                      -> Express; /api + /uploads rewrites)
     6. check-migrations:                  projects: chromium-desktop, chromium-mobile
        apply 0000..0020 from zero  ->     (storageState per role, test.fail for D1/D2/D5)
        push --explain == []        ->
        generate => no new files    ->  4. teardown (always): kill servers,
        sha256 manifest == committed        pg_ctl stop, rm temp dir
     7. teardown (always)
                |
   CI-only: next build (3 placeholder env vars), server tsc build, rbac tsdown build
   NEVER: deploy step, secrets, production DB
```

### Recommended Project Structure
```
scripts/
├── verify.mjs                  # orchestrator (steps above), exit code = first failure
├── e2e.mjs                     # DB + migrate + seed + playwright + teardown
├── lib/test-db.mjs             # assertTestDatabaseUrl(), startTestCluster(), stop()
├── check-env-contract.mjs      # VER-06
├── check-lockfile.mjs          # VER-04 (also run as a CI step)
├── check-migrations.mjs        # DRZ-03
└── convert-drizzle-folder.mjs  # [option A] one-shot journal -> v1 folder conversion
e2e/                            # Playwright (root devDependency, not a workspace)
├── playwright.config.ts
├── auth.setup.ts               # logs in once per role -> storageState
└── tests/{auth,take-test,review,authoring}.spec.ts
app/server/src/scripts/e2e-seed.ts   # deterministic seed (DB rows + local prompt files)
app/server/drizzle/             # [A] 14-digit-UTC_name/{migration.sql,snapshot.json}; [B] NNNN_x.sql + meta/
.github/workflows/ci.yml
.oxfmtrc.json  .oxlintrc.json (root) + app/web/.oxlintrc.json (nextjs+react)
packages/rbac/tsdown.config.ts  packages/rbac/src/index.test.ts  (+ vitest.config.ts per workspace)
```

### Pattern 1: `yarn verify` orchestrator (VER-02, D-03)
**What:** a zero-dependency Node ESM script (not a shell one-liner) that starts the disposable DB, exports `TEST_DATABASE_URL`, runs `turbo run lint typecheck test`, then `oxfmt --check .`, the env/lockfile/migration checks, and always tears down (`try/finally` plus `SIGINT`/`SIGTERM`/`exit` handlers). Root scripts: `"verify": "node scripts/verify.mjs"`, `"test": "turbo run test"`, `"lint": "turbo run lint"`, `"format": "oxfmt ."`, `"format:check": "oxfmt --check ."`, `"e2e": "node scripts/e2e.mjs"`.
**Turbo specifics (both verified in docs):** Strict env mode is the default, so variables not declared are **filtered out of task processes**: `[CITED: https://turborepo.dev/docs/crafting-your-repository/using-environment-variables]` "Strict Mode (Default): Filter environment variables to only those that are specified in the `env` and `globalEnv` keys". Declare `TEST_DATABASE_URL` (and `BIO_EXAM_ISOLATED_ENV`) in `globalPassThroughEnv` (not hashed). Set `"cache": false` on `test` and `e2e` so a cached pass cannot skip DB-backed tests. `lint` no longer needs `dependsOn: ["^build"]` (oxlint has no type info); `typecheck` and `test` keep `["^build"]` because web/server import `@bio-exam/rbac` from `dist`.
**CI vs local:** if `TEST_DATABASE_URL` is already set (CI service container), skip cluster startup but still run the guard.

### Pattern 2: pg_ctl disposable cluster (D-01, D-03)
Verified flags (PostgreSQL 17.10 Homebrew, macOS arm64) and the three failure modes hit during research:
```js
// scripts/lib/test-db.mjs (sketch; every flag was run except the speed/zone options
// --no-sync, fsync=off, synchronous_commit=off, full_page_writes=off and timezone=UTC,
// which are standard PostgreSQL settings not exercised here [ASSUMED])
const env = { ...process.env, LC_ALL: 'en_US.UTF-8' }            // failure 1 if unset
await run('initdb', ['-D', dir, '-U', 'postgres', '--auth=trust', '-E', 'UTF8',
                     '--locale=en_US.UTF-8', '--no-sync'], { env })
await run('pg_ctl', ['-D', dir, '-w', '-t', '30', '-l', `${dir}/log`,
  '-o', `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories= ` +   // failure 2
        `-c timezone=UTC -c fsync=off -c synchronous_commit=off -c full_page_writes=off`,
  'start'], { env })
// createdb test_<random>; teardown: pg_ctl -m immediate stop; rm -rf dir
```
1. **`LC_ALL` unset on macOS** -> `FATAL: postmaster became multithreaded during startup / HINT: Set the LC_ALL environment variable to a valid locale.` `[VERIFIED: run, pg.log]`
2. **Unix socket path > 103 bytes** (a long temp dir) -> `Unix-domain socket path "...s.PGSQL.54329" is too long (maximum 103 bytes)` and the server exits. Fix: `-c unix_socket_directories=` (empty; TCP only, verified `pg_ctl -w` still reports ready) or a short dir. Also use `os.tmpdir()` + `mkdtemp('bio-exam-pg-')`.
3. **Locale `C` kills Cyrillic search.** In a `C`-locale database `show_trgm('тест')` returned `{}` and `similarity(...)` = 0 (verified in a `template0 locale 'C'` DB); in `en_US.UTF-8` `extensions.similarity('тест по биологии','тест биология')` = 0.6315789. `database-search.ts` relies on `extensions.similarity`. The harness must assert `datcollate` is not `C`/`POSIX`. The `postgres:17` image defaults to `en_US.utf8` `[ASSUMED]` (verify with the same assertion in CI).
4. Port: choose with `net.createServer().listen(0)`; retry start on `EADDRINUSE` (race window) `[ASSUMED]`.
5. **Timezone:** pin `-c timezone=UTC`. Without it the cluster inherits the OS zone (Asia/Bangkok here) and any `timestamptz`-read-as-`timestamp` bug (C3) shows up as flaky offsets. For one extra assurance, a Phase-1 test can run the round-trip under a non-UTC session.
6. Orphan sweep: if the wrapper is `kill -9`'d the cluster survives; at start delete `bio-exam-pg-*` dirs whose `postmaster.pid` process is dead `[ASSUMED]`.
7. Binary discovery order: `PATH`, `/opt/homebrew/opt/postgresql@17/bin`, `/usr/local/opt/postgresql@17/bin`, `/usr/lib/postgresql/17/bin`; if none, exit non-zero with "install PostgreSQL 17 (`brew install postgresql@17`) or set TEST_DATABASE_URL". `/opt/homebrew/bin/{pg_ctl,initdb,pg_dump,psql}` are present here (17.10).

### Pattern 3: TEST_DATABASE_URL guard (D-02)
```js
// scripts/lib/test-db.mjs  (also importable from vitest globalSetup and e2e-seed)
export function assertTestDatabaseUrl(raw) {
  let u; try { u = new URL(raw) } catch { throw new Error('TEST_DATABASE_URL is not a valid URL') }
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error('TEST_DATABASE_URL must be postgres://')
  if (!['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error(`refusing non-local host "${u.hostname}"`)
  const db = decodeURIComponent(u.pathname.replace(/^\//, ''))
  if (!/^test_[a-z0-9_]+$/.test(db)) throw new Error(`database "${db}" must match test_*`)
  return u.toString()
}
```
Never log the URL (it may contain a password in CI). The guard is applied by: the wrapper, Vitest `globalSetup` (server), `check-migrations`, `e2e-seed`, and, through the isolation switch (C4), `db/index.ts` itself. **C4 fix (additive):** in `config/env.ts` skip all `dotenv()` calls when `process.env.BIO_EXAM_ISOLATED_ENV === '1'`; in `db/index.ts`, when that flag is set, call the same guard on `DATABASE_URL` and map it from `TEST_DATABASE_URL` in the child-process env set by the wrapper (children get `DATABASE_URL=<TEST_DATABASE_URL>` only inside the isolated env; the parent shell's real `DATABASE_URL` is never forwarded). **The switch does not cover the migration runner:** `scripts/apply-migration.ts` and `drizzle.config.ts` use `import 'dotenv/config'` directly (no override, never `config/env.ts`), so the runner must call `assertTestDatabaseUrl` itself whenever it is launched by the harness or by `check-migrations`, and must read `TEST_DATABASE_URL`, not `DATABASE_URL`, in that mode (production use keeps `DATABASE_URL`). `app/web` (Next) does not override process env with `.env` files `[ASSUMED, standard Next behaviour]`, but the wrapper must still pass `DATABASE_URL` (test URL), `AUTH_JWT_SECRET` (test secret) and `API_ORIGIN` explicitly because `lib/env/server.ts` requires the first two at build/import time.

### Pattern 4: Drizzle migration metadata (DRZ-01..03, D-04, D-05, D-07)

#### 4a. Facts that were measured
- Chain 0000-0020 applies on plain PG 17.10 (psql `ON_ERROR_STOP` and the drizzle `migrate()` runner), 25 public tables, `pg_trgm@extensions`. Also applies in one transaction through the real runner.
- Journal `when` values, quoted: `[VERIFIED: app/server/drizzle/meta/_journal.json:120-121]` `"when": 1775820279949,` / `"tag": "0016_session_draft_answers",`; 0017 is `1775820280000`.
- `0015_snapshot.json` has `prevId` = id of 0001, so snapshots 0002-0014 were skipped from the chain; `generate` today diffs against 0015 and emits a spurious `0021` that re-creates `question_search_documents` and `draft_telemetry` (verified, kit 0.31.8). 0020 is data-only (an `INSERT ... ON CONFLICT` seed of `short_answer_variants`), 0016/0019 add `draft_*` columns.
- Live-DB tracking table is `public.__drizzle_migrations` because the runner pins it: `[VERIFIED: app/server/src/scripts/apply-migration.ts:20]` `await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle'), migrationsSchema: 'public' })`. Migration 0018 even enables RLS on it.

#### 4b. DRZ-01 divergence register (what the chain produces vs `schema.ts`)
Measured with `drizzle-kit push --explain --output json` (v1) / `push --verbose` (v0.31.8) against a freshly migrated DB, `schemaFilter: ['public']`, `tablesFilter: ['!__drizzle_migrations']`:

| Class | Count | Detail | Resolution (no applied SQL edited) |
|-------|-------|--------|------------------------------------|
| RLS on + policy `deny_direct_access` (`FOR ALL TO public USING (false) WITH CHECK (false)`) | 25 + 25 | from migration 0018; absent from `schema.ts` | declare with `pgTable.withRLS(...)` + `pgPolicy(...)` (verified for `users`: remaining statements 25+25 -> 24+24) **or** allowlist in the gate |
| `timestamptz` vs `timestamp()` | 10 | `users.locked_until`, `test_attempts.{created_at,submitted_at}`, `test_sessions.{started_at,submitted_at}`, `test_assignments.assigned_at`, `test_timer_settings.updated_at`, `refresh_tokens.{expires_at,revoked_at,created_at}` | `timestamp('x', { withTimezone: true })` |
| Index names | 4 renames | DB `idx_test_attempts_{test_id,user_id,submitted_at}`, `idx_refresh_tokens_token_hash`; `schema.ts` has `*_idx` names | rename in `schema.ts` to the DB names |
| Undeclared indexes | 3 | `idx_refresh_tokens_expires_at`, `idx_users_locked_until`, gin `question_search_documents_search_text_trgm_idx` (`gin_trgm_ops`) | declare: `index('...').using('gin', t.searchText.op('gin_trgm_ops'))` etc. |
| FK / PK names (`test_attempts_test_id_fkey`, `test_assignments_pkey`, ...) | v0.31 diff only | not reported by the v1 diff engine | none needed for the v1 gate; v0 `push` reports them, so under option B use `generate`+`pull`-snapshot comparison or accept as documented |

**Verified end state:** after the 10 `withTimezone` edits, 4 renames and 3 added indexes in a scratch copy of `schema.ts`, `drizzle-kit push --explain --output json` (v1) returned `status: ok` with **only** the 25+25 policy/RLS statements; declaring `users` RLS pattern removed 2 of them. Extrapolating the same pattern to 25 tables is expected to reach `statements: []` `[ASSUMED until run]`.

**Timestamp edit is behaviour-neutral on UTC and a bug fix elsewhere.** Verified round trip (drizzle-orm 0.45.1, a `timestamptz` column, write `2026-09-26T10:11:12.345Z`): session `UTC` -> `timestamp()` and `withTimezone` both read `10:11:12.345Z`; session `Asia/Bangkok` -> `timestamp()` reads `17:11:12.345Z` (wrong), `withTimezone` reads `10:11:12.345Z`; `America/New_York` -> `06:11:12.345Z` vs `10:11:12.345Z`. Planner: add this as a Vitest DB test (round-trip under a non-UTC session) and note that Supabase is UTC today, so the live system is unaffected, but a self-hosted PG with a non-UTC `timezone` (Milestone 2) would silently shift `lockedUntil`, `submittedAt`, `expiresAt`.

#### 4c. Order of work (Plan 009 STOP: any proposed drop/recreate of an applied object)
1. Edit `schema.ts` to declare DB truth (table above). No migration file is generated for these edits.
2. Gate: migrate from zero on `test_*` -> `drizzle-kit push --explain --output json --config <check config>` must return `statements: []` (any hint request, `missing_hints`, exit code 2, is a failure to investigate, not to auto-answer).
3. Restore the snapshot (4d) **from the corrected schema**.
4. `drizzle-kit generate` -> "No schema changes, nothing to migrate" and **no new file** (assert `git status --porcelain app/server/drizzle` empty, not output text); `drizzle-kit check` -> "Everything's fine".
5. Checksums: commit a manifest (sha256 per applied SQL, name, order) and assert it in `check-migrations`; pattern borrowed from `[CITED: /Volumes/T7/its/lifemy-doc-drizzle-v1/packages/db/drizzle/migrations-manifest.json]` (`checksumAlgorithm: sha256`, per-file `checksum`; seen via `head`, not a full read). Applied SQL files must stay byte-identical (verified by `sha256sum` before/after in both procedures).

#### 4d. Snapshot restore, executed and verified
**[option B] stable 0.x (kit 0.31.x):** copy the repo `drizzle/` to scratch, run `drizzle-kit generate --name probe` (emits a spurious `0021_probe.sql` + `0021_snapshot.json`), keep only the snapshot: rename to `meta/0020_snapshot.json`, set its `prevId` to the `id` of `0015_snapshot.json`, delete the probe SQL and its journal entry, then `generate` -> "No schema changes" and `check` -> "Everything's fine"; all 21 `.sql` files unchanged. `[VERIFIED: run]`

**[option A] v1 rc.4:** `drizzle-kit up` does **not** work here: it converted only 0000/0001 and stopped with `No snapshot was found` at 0002 (snapshots 0002-0014/0016-0020 are missing). The working procedure (script `scripts/convert-drizzle-folder.mjs`, executed):
1. For each journal entry create `<UTC YYYYMMDDHHmmss of floor(when/1000)>_<tag without NNNN_>/migration.sql` (byte-identical copy; `cmp` verified; 21 distinct seconds, e.g. `20231114221320_typical_exiles` ... `20260725132000_short_answer_variants`).
2. Delete `meta/` entirely: the v1 reader throws if it exists. `[VERIFIED: /Volumes/T7/its/lifemy-doc-drizzle-v1/node_modules/drizzle-orm/migrator.js:8]` `if (fs.existsSync(`${config.migrationsFolder}/meta/_journal.json`)) throw Error("We detected that you have old drizzle-kit migration folders. You must upgrade drizzle-kit and run \"drizzle-kit up\"");`
3. With **no** snapshots present, `drizzle-kit generate --name probe` diffs against empty and writes a 352-line full-schema migration plus `snapshot.json` (`version: "8"`, `dialect: "postgres"`, 323 DDL entities, `prevIds: ["00000000-0000-0000-0000-000000000000"]`). Keep only that `snapshot.json`, move it into the last folder (`20260725132000_short_answer_variants/snapshot.json`), delete the probe folder.
4. `generate` -> "No schema changes, nothing to migrate"; `check` -> "Everything's fine". Folders without a `snapshot.json` are tolerated.
The v1 config needs no `strict` (flag removed) and no snapshot for intermediate folders.

#### 4e. Runner and live-database facts (D-05 reversibility question, answered)
- **The v1 migrator matches applied migrations by `name` only:** `[VERIFIED: .../drizzle-orm/migrator.utils.js:11-15]` `const dbNamesSet = new Set(dbMigrations.map((m) => m.name).filter((n) => n !== null)); return localMigrations.filter((lm) => !lm.name || !dbNamesSet.has(lm.name));`
- On first `migrate()` against a v0-shaped table it runs `upgradeIfNeeded`: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS name text`, `ADD COLUMN IF NOT EXISTS applied_at timestamptz DEFAULT now()`, then `UPDATE ... SET name = <local name>, applied_at = NULL WHERE id = <id>` per row, matching DB rows to local folders by `created_at` truncated to seconds (or by hash when several share a second); it **throws** if any DB row matches no local migration. Executed on a DB created by the v0 runner: all 21 rows named, 0 migrations applied, no `drizzle` schema created, `hash` values identical (all 21) and `created_at` identical except row 17 (`1775820279949` -> `1775820279000`, second truncation). After the upgrade the **v0 runner still runs cleanly** (no-op) on the same DB, so the DB change is additive and an app rollback does not need a DB rollback. `[VERIFIED: run on test_up]`
- **Therefore the "one-way" gate is exactly one `ALTER TABLE` + 21 `UPDATE`s on live `public.__drizzle_migrations`,** performed by the first v1 `yarn drizzle:migrate` against Supabase (a Phase 1 deliverable never runs it). Pre-flight (read-only, folds into D-07): dump `(hash, created_at)` from the live table via the session pooler and compare with the disposable DB; every live row must match one of the 21 local migrations or the v1 migrator aborts.
- **Keep `migrationsSchema: 'public'` in the v1 runner.** With the v1 default (`drizzle`) the migrator creates `drizzle.__drizzle_migrations` empty and tries to re-apply from zero: executed, fails at the first statement `CREATE TYPE "public"."link_target" ... type "link_target" already exists`, leaving an empty `drizzle` schema/table behind. Add a runner assertion `migrationsSchema === 'public'`.
- **[option A] runner change** (verified shape): `const db = drizzle({ client: pool })` then `await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle'), migrationsSchema: 'public' })`; `drizzle(pool)` no longer type-checks (`Type 'Pool' is not assignable to type 'string'`). Under **[option B]** the runner is unchanged except it must refuse non-test URLs when isolated.
- v1 `generate --explain` and `push --explain` are non-mutating dry runs; `--output json` is machine readable (`status`, `statements`, `hints`); `missing_hints` exits 2. v1 `push`/`pull` default to **all schemas**, so every check config must set `schemaFilter: ['public']` and `tablesFilter: ['!__drizzle_migrations']` (otherwise `extensions`/`pg_trgm` objects are in scope). `[CITED: https://orm.drizzle.team/docs/v0-v1-changes]`

#### 4f. [option A] RQB rewrite scope (so the plan can size it)
Counted this session in `app/server/src`: 76 `db.query.<table>.findFirst|findMany` calls in 10 files (`routes/tests/index.ts` 55 of the 82 type errors, `routes/tests/public.ts` 7, `routes/auth/invites.ts` 6, `routes/users/index.ts` 3, `lib/tests/question-type-resolver.ts` 3, `routes/settings.ts`, `routes/auth/me.ts`, `routes/auth/login.ts`, `middleware/auth/session.ts`, `scripts/bootstrap-admin.ts`: 1 each), 11 `relations()` blocks, exactly one relational `with:` (`routes/tests/index.ts:2652-2654`, `topic: { columns: { slug: true } }`), three `columns:` projections (`routes/settings.ts:32`, `routes/tests/index.ts:2652`, `routes/tests/public.ts:853`). The dominant form is `findFirst({ where: eq(users.id, userId) })`. RQB v2: `where` is an object filter (`{ id: userId }`), `db.query.*` requires `drizzle({ client, relations })` with `relations = defineRelations(schema, r => ({ tests: { topic: r.one.topics({ from: r.tests.topicId, to: r.topics.id }) } }))`, and `DB = NodePgDatabase<typeof relations>`. Core `db.select().from(t).where(eq(...)).limit(1)` is an equivalent, version-neutral rewrite for every plain-`where` site. Protect either with the Vitest + e2e suites built earlier in the phase.

#### 4g. [option B] DRZ-01 / DRZ-03 gate on kit 0.31, as measured
- **`generate` against a pulled snapshot is not a gate.** Building a check `out` dir whose only snapshot is `drizzle-kit pull` output of the migrated DB and running `generate` with the original `schema.ts` emitted 140 lines of real drift mixed with cosmetic noise; with the step-1 corrected `schema.ts` it still emitted 32 `DROP INDEX` + 24 `CREATE INDEX` + 8 `CREATE UNIQUE INDEX` (every index, due to `opclass` representation differences), 4 FK drop/add, 25 `DISABLE ROW LEVEL SECURITY`, 25 `DROP POLICY`. Unusable.
- **`push --verbose --strict </dev/null` is a non-mutating detector** (stdin closed aborts at the confirmation prompt, exit code 0): verified by re-reading the target DB afterwards (25 policies, old index and FK names still present). It lists precise statements, including items the v1 engine ignores. With the step-1 edits it reported 25 `DROP POLICY` + 25 `DISABLE ROW LEVEL SECURITY`, 2 `question_drafts_*` index drop/create (the DB indexes are `updated_at DESC`), 3 FK renames (`*_fkey` vs `*_users_id_fk`) and 1 PK rename (`test_assignments_pkey`). Explicit `foreignKey({ name, columns, foreignColumns }).onDelete('cascade')` in the table callback cleared the two `test_attempts` FK items; the full zero state under 0.31 was **not** reached in the time-box (A6).
- Gate form under B: run `push --verbose --strict` with stdin closed against the migrated `test_*` DB (`schemaFilter: ['public']`, `tablesFilter: ['!__drizzle_migrations']`), fail on any line matching `^(ALTER|CREATE|DROP) `; keep an explicit allowlist file for anything the user decides to leave undeclared (for example RLS). Text parsing is brittle across kit patch releases: pin `0.31.11` exactly. Option A's `--explain --output json` avoids all of this.

### Pattern 5: Vitest layout and the 12-file port (VER-01, D-08, D-19)
- **Per-workspace `vitest.config.ts` + `"test": "vitest run"`**, Turbo `test` task (`dependsOn: ["^build"]`, `cache: false`, `globalPassThroughEnv: ["TEST_DATABASE_URL", "BIO_EXAM_ISOLATED_ENV"]`). `app/web`: `resolve.alias: { '@': <app/web root> }` (tsconfig has `"paths": { "@/*": ["./*"] }`), `environment: 'node'` is enough: none of the 8 web tests renders React. `packages/rbac` has no tests: add one smoke test (export names of `src/index.ts`) so `vitest run` is not "no test files"; build-parity of `dist` (ESM vs CJS export lists, 14 each) is a CI build-job assertion, not a Vitest test (Vitest would then depend on build order).
- **Port style that keeps assertion meaning identical:** keep `import assert from 'node:assert/strict'`, wrap top-level statements in `test(...)` blocks (one per original scenario), drop `console.log('PASS ...')`. D-08 forbids wrapping them with a script harness, not using `test()` blocks.
- **The 12 files** (`git ls-files '*.test.ts'`): server `src/lib/tests/{question-type-resolver,scoring,telemetry}.test.ts`, `src/schemas/tests.test.ts`; web `app/(internal)/(protected)/admin/tests/lifecycle.test.ts`, `components/tests/attempt-review/{AttemptQuestionsList,attempt-review-utils}.test.ts`, `components/tests/telemetry.test.ts`, `lib/auth/{getServerMe,loginRedirect,sessionCookie}.test.ts`, `lib/mdx/normalizeSource.test.ts`. Baseline under `tsx`: 11 pass; `question-type-resolver.test.ts` fails (`DATABASE_URL is not set`, C7). Sizes 8-369 lines (`scoring.test.ts` 369, `tests.test.ts` 203, `getServerMe.test.ts` 147).
- **`getServerMe.test.ts` (D-19), verified skeleton** (2 of its ~8 scenario groups executed green on Vitest 5.0.3): the vm/`transpileModule` harness is replaced by `vi.mock('server-only', () => ({}))`, `vi.mock('react', async (orig) => ({ ...(await orig()), cache: (fn) => fn }))`, `vi.mock('next/headers', ...)` with a mutable cookie holder, `vi.mock('@/lib/auth/server/getMeData', () => ({ getMeData: vi.fn(async () => localMe) }))` (call count replaces `localImports`), `vi.mock('next/navigation', ...)` (`redirect`/`notFound` throw as in the original), `vi.mock('@/components/users/UserProfileAssignmentsPage', ...)`; per scenario `vi.resetModules()`, `vi.stubEnv('API_ORIGIN', ...)`, `vi.stubGlobal('fetch', vi.fn(...))`, then `await import('./getServerMe')` and `await import('../../app/(internal)/(protected)/profile/[id]/page')`. Assertions to carry over verbatim: URL `.../api/auth/me` (trailing slash origin normalised), `init.cache === 'no-store'`, `init.redirect === 'error'`, `cookie` header, `localImports` 0 on API denial (`401/403/500`, `{ ok:false }`, `{ ok:true, user:{} }`, fetch failure, invalid JSON, invalid origin), `rejects /redirect:\/login/`, student -> `rejects /not-found/`, local mode (no `API_ORIGIN`) -> 1 local import and 0 requests, empty env -> `null`.
- **`question-type-resolver.test.ts`:** `vi.mock('../../db/index.js', () => ({ db: {} }))` placed before the import; assertions untouched.
- **DB-backed tests** (Phase 1 needs few: guard table, `timestamptz` round trip under a non-UTC session, local-storage containment needs no DB): server `vitest.config.ts` has `globalSetup` that calls `assertTestDatabaseUrl(process.env.TEST_DATABASE_URL)` and `test.env: { DATABASE_URL: <test url>, BIO_EXAM_ISOLATED_ENV: '1' }`. Missing `TEST_DATABASE_URL` for a DB-backed file = hard failure with the "run via yarn verify" message (D-03), never a skip.
- `tsc --noEmit` already covers `*.test.ts` (web `include: ["**/*.ts"]`, server `include: ["src"]`); import `describe/test/expect/vi` explicitly (no `globals`).

### Pattern 6: ox toolchain configuration (D-08..D-12)
**oxfmt** (`.oxfmtrc.json` at repo root). Validated config (0 diffs on all `app/web` TS/TSX/CSS/MD, 3 JSON diffs only):
```json
{
  "useTabs": true, "trailingComma": "es5", "semi": false, "singleQuote": true, "endOfLine": "lf", "printWidth": 120,
  "sortImports": {
    "newlinesBetween": true, "ignoreCase": false, "internalPattern": ["@/"],
    "groups": ["scoped", "react-scan", "react", ["builtin", "external"], "internal", ["parent", "sibling", "index"]],
    "customGroups": [
      { "groupName": "scoped", "elementNamePattern": ["@[a-z]*/**"] },
      { "groupName": "react-scan", "elementNamePattern": ["react-scan"] },
      { "groupName": "react", "elementNamePattern": ["react", "react/*", "react-*", "react-*/**"] }
    ]
  },
  "ignorePatterns": ["**/drizzle/**", "**/.next/**", "**/dist/**"]
}
```
Measured (scratch copy of tracked files, oxfmt 0.71.0): base options only -> **0 diffs in 402 web TS files**; 48 files in `app/server` (43) + `packages/rbac` (5) differ (never Prettier-formatted; rbac uses 2-space indent) + 3 web JSON files (`.vscode/settings.json`, `components.json`, `package.json`); `sortImports` as above reproduces the trivago result with 0 further web diffs (trivago puts non-`[a-z]` scoped packages first, `react-scan`, `react*`, other packages, `@/`, relative; this config encodes exactly that; without the `scoped` group 141 files differ, without `react-*/**` 1 file differs); `sortTailwindcss` with the real stylesheet / functions `["clsx","cn","cva"]` rewrites class order in ~85 (default theme) to ~130 (real stylesheet) web files, same magnitude as Prettier's own plugin with the real stylesheet (131 files flagged) because the current code was sorted against a stylesheet path that does not exist. Pitfalls: (a) `oxfmt --migrate prettier` drops the trivago plugin and leaves stale `importOrder`/`importOrderSeparation` keys: delete them; (b) **Tailwind sorting is a silent no-op when `tailwindcss` is not resolvable from the config directory** (verified: 0 changes in a tree without `node_modules`), so run it only after `yarn install`; (c) `oxfmt --check` exits 1 on issues, 0 clean (verified); default ignore = `.gitignore` + `.prettierignore`.
Recommended sequence for D-11: step 1 land the config with the parity subset (no `sortTailwindcss`) and prove `oxfmt --check .` clean on web; step 2 one format-only run over the whole repo (server/rbac churn + optional Tailwind) -> user commits alone -> user adds the hash to `.git-blame-ignore-revs` (`[CITED: https://docs.github.com/en/repositories/working-with-files/using-files/viewing-and-understanding-files]` file name `.git-blame-ignore-revs` at repo root; local `git config blame.ignoreRevsFile .git-blame-ignore-revs`); only then wire `oxfmt --check .` into `yarn verify`. The hash does not exist until the user commits, so this is a `checkpoint:human-action`.

**oxlint.** `npx @oxlint/migrate eslint.config.mjs --output-file <rel path>` (output path is relative to cwd) produced rules under `overrides` with plugins `nextjs`, `react`, `typescript`, a `prettier/prettier` entry (**delete it**), `categories: { correctness: "off" }` and the 21 `nextjs/*` rules + `react/rules-of-hooks` (error) + `react/exhaustive-deps` (warn) + `no-unused-vars` with `argsIgnorePattern`/`varsIgnorePattern` `^_`. Flattened parity config (executed over `app/web`, `app/server/src`, `packages/rbac/src`): **0 errors, 18 warnings** (13 `no-unused-vars`, 5 `nextjs/no-img-element`; ESLint baseline on web was 12 = 7 + 5), exit 0; `--deny-warnings` -> exit 1, so **do not** use it (D-12). Turning `correctness` on adds ~50 warnings (31 `react/set-state-in-effect`, 7 `immutability`, 5 `refs`, 4 `purity`, ...), zero errors: list them as tech debt per D-12, do not enable by default. Per workspace config is cleaner: `app/web/.oxlintrc.json` (nextjs+react+typescript), root/`app/server`/`packages/rbac` (typescript only); scripts `"lint": "oxlint ."` per workspace. Type-aware linting (`oxlint-tsgolint`, `--type-aware`) is optional and out of scope.

**tsdown** (`packages/rbac/tsdown.config.ts`, verified output = same 4 file names, ESM 6.3 kB / CJS 6.7 kB, 14 exports in both formats, build 157-347 ms):
```ts
import { defineConfig } from 'tsdown'
export default defineConfig({ entry: ['src/index.ts'], format: ['esm', 'cjs'], outDir: 'dist', dts: true, clean: true, fixedExtension: false })
```
Without `fixedExtension: false` tsdown emits `index.mjs` / `index.d.mts`, which breaks the unchanged `package.json` `exports` (`"import": "./dist/index.js"`, `"types": "./dist/index.d.ts"`). Scripts: `"build": "tsdown"`, `"watch": "tsdown --watch"`, keep script names (`build`, `clean`, `watch`, `typecheck`) because `app/web/vercel.json` runs `yarn --cwd ../.. workspace @bio-exam/rbac build && yarn build:dev` and `app/server/vercel-build.cjs` runs `yarn workspace @bio-exam/rbac build`. `.d.ts` content differs only by `//#region` comments and `export declare` vs `declare`.

### Pattern 7: Local-disk mode in `StorageService` (D-18)
Facts (all `Read` this session): `app/server/src/services/storage/storage.ts:12-14` `const SUPABASE_URL = process.env.SUPABASE_URL` / `const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY` / `const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'main'` (env read at import time); `:29-31` `function isConfigured(): boolean { return Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY) }`. Today without Supabase: `readFile`/`readFilesParallel`/`listFiles*`/`exists`/`deleteFiles` silently return `''`/empty/`false`/no-op, `writeFile`/`uploadBuffer`/`writeJson`/`downloadBuffer`/`createSignedUrl`/`createZip` throw. `moveDirectory` already has a legacy disk branch at `:397-409` rooted at `process.cwd()/../web/public/uploads` with **no containment** (`relParts = ['../web/public/uploads/tests', parts[1], parts[2], ...parts.slice(3)]`); routes also write there directly (`routes/docs/assets.ts:15-16` `LOCAL_UPLOAD_DIR = path.join(process.cwd(), '../web/public/uploads/images')`) and Express serves it: `app.ts:88-89` `if (process.env.NODE_ENV !== 'production') { app.use('/uploads', express.static(path.join(process.cwd(), '../web/public/uploads')))`.
Recommended design (interface unchanged, additive):
- Selection: new env `STORAGE_DRIVER=local` + `STORAGE_LOCAL_DIR=<absolute path>` (names are discretion). Keep `isConfigured()` meaning "Supabase configured": `routes/docs/assets.ts`, `routes/users/avatar.ts`, `routes/tests/index.ts:2326` branch on it and own their local code; making it true in local mode would route them into Supabase-style calls. Local mode is entered from `getClient() === null && driver === 'local'` inside each method.
- Methods needing local equivalents for the e2e flows: `readFile`, `readFilesParallel`, `writeFile`, `writeJson`/`readJson`, `deleteFiles`, `listFiles`, `listFilesRecursive` (files only, relative to root, `/` separators, sorted by name, like Supabase), `deleteDirectory`, `moveDirectory` (replace the legacy branch when local mode is on), `exists`, `uploadBuffer`, `downloadBuffer` (content type by extension map `[ASSUMED]`). `createSignedUrl`/`getPublicUrl`/`listFilesWithMeta`/`createZip` may stay unsupported in Phase 1 (seed questions are text-only; images and ZIP export are Phase 7 and not in D-14's flows) but must fail loudly, not return `''`.
- Containment, from day one: reject empty/NUL/absolute keys; `path.posix.normalize`, reject any `..` segment; `const abs = path.resolve(root, key); if (path.relative(root, abs).startsWith('..') || path.isAbsolute(path.relative(root, abs))) throw`; for writes also `realpath` the deepest existing ancestor and require it to stay under `realpath(root)` (symlink escape); never compare with a bare `startsWith(root)` (prefix `/data` vs `/data-evil`). Table-driven tests: `../x`, `a/../../x`, `/etc/passwd`, `C:\x`, `%2e%2e/x` (literal, harmless), NUL byte, symlink inside root pointing out. Write atomically (temp file + `rename`).
- The seed (below) writes prompt/explanation files through the same `StorageService` instance (or the same helper) so DB `promptPath` values and files cannot drift.

### Pattern 8: Env-contract check (VER-06, C5)
Facts: `app/web/.env.example` **does not exist**; `app/server/.env.example` is tracked but stale; `.gitignore` ignores `.env` and `.env*.local` (examples are allowed). Server code reads these 33 distinct keys via `process.env.<NAME>` (grep over `app/server/src`, `api/`, config files): `NODE_ENV DATABASE_URL DEBUG_ENV AUTH_JWT_SECRET REFRESH_TOKEN_EXPIRES_DAYS ACCESS_TOKEN_EXPIRES_SEC VERCEL SUPABASE_URL SUPABASE_STORAGE_BUCKET SUPABASE_SERVICE_KEY SESSION_MAX_AGE_DAYS SESSION_COOKIE_NAME RBAC_USE_DB_OVERRIDES RBAC_DB_FAIL_OPEN PORT PG_STATEMENT_TIMEOUT_MS PG_QUERY_TIMEOUT_MS PG_POOL_MAX PG_MAX_USES PG_KEEPALIVE_DELAY_MS PG_FORCE_SSL PG_CONNECTION_TIMEOUT_MS LOG_LEVEL JSON_BODY_LIMIT DB_QUERY_RETRY AUTH_SESSION_ENFORCE_DB ALLOWED_ORIGIN ADMIN_PASSWORD_HASH ADMIN_PASSWORD ADMIN_LOGIN ADMIN_BOOTSTRAP_PASSWORD_HASH ADMIN_BOOTSTRAP_PASSWORD ADMIN_BOOTSTRAP_LOGIN`. The server example currently omits the 3 `SUPABASE_*`, `REFRESH_TOKEN_EXPIRES_DAYS`, `ACCESS_TOKEN_EXPIRES_SEC`, `LOG_LEVEL`, `JSON_BODY_LIMIT`, `RBAC_DB_FAIL_OPEN`, `PG_FORCE_SSL`, both `*_PASSWORD_HASH` keys, and lists `DOCS_ROOT`, which no code reads. Web: `lib/env/server.ts` zod object (`DATABASE_URL`, `AUTH_JWT_SECRET` required; `SESSION_COOKIE_NAME`, `NEXTAUTH_SECRET`, `NEXTAUTH_LOGIN`, `NEXTAUTH_PASSWORD`, `NEXTAUTH_URL`, `NEXTAUTH_URL_IP`, `APP_ORIGIN` optional) plus direct reads `API_ORIGIN`, `NEXT_PUBLIC_APP_ORIGIN`, `NODE_ENV` and the web pool's `PG_*` keys (7); `NEXT_IGNORE_INCORRECT_LOCKFILE` appears in `app/web/.env` only (obsolete once `package-lock.json` is gone).
Mechanism: `scripts/check-env-contract.mjs` (zero dependencies) + `scripts/env-contract.config.json` allowlist: (1) extract used keys per workspace by regex `process\.env\.([A-Z0-9_]+)` and the web zod object keys (`lib/env/server.ts` imports `server-only` and parses at import, so the script cannot import it); (2) parse each `.env.example` into `required` (uncommented) and `optional` (commented `# KEY=`) entries; (3) fail when a used key is neither documented nor allowlisted (`NODE_ENV`, `VERCEL`, ...), when a documented key is unused and not allowlisted (`DOCS_ROOT`), when an uncommented example value is not a placeholder (empty, `<...>`, `changeme*`, `example*`) or looks like a secret (`eyJ...`, `sb_...`, hostnames containing `supabase.com`, long random strings); (4) never reads real `.env` files. Unit-test the script with fixture directories in Vitest.

### Pattern 9: Playwright e2e (D-13..D-17)
- **Servers (`webServer` array, `[CITED: https://playwright.dev/docs/test-webserver]` "Multiple web servers ... can be launched simultaneously by providing an array"):** Express (`NODE_ENV=development` because `setSessionCookie` adds `Secure` only when `process.env.NODE_ENV === 'production'` (`middleware/auth/session.ts:41`) and the app is plain HTTP; set `AUTH_SESSION_ENFORCE_DB=1` and `RBAC_USE_DB_OVERRIDES=1` explicitly to get production-like DB enforcement (`session.ts:64`, `services/rbac/rbac.ts:17`), `PORT`, `ALLOWED_ORIGIN=<web origin>`, isolated env (C4), `DATABASE_URL=<test url>`, `AUTH_JWT_SECRET=<test secret>`, no `SUPABASE_*`, `STORAGE_DRIVER=local`, `STORAGE_LOCAL_DIR=<tmp>`), then Next (`next start` after `next build` in CI; `reuseExistingServer: !process.env.CI`) with `API_ORIGIN=<express origin>` so `next.config.ts` rewrites `/api/:path*` and `/uploads/:path*` (`beforeFiles`) to Express and cookies stay same-origin; plus placeholder `DATABASE_URL`/`AUTH_JWT_SECRET` for `lib/env/server.ts`.
- **Lifecycle** in `scripts/e2e.mjs`: guard -> start/attach DB -> migrate (the real runner) -> `e2e-seed` -> `playwright test` -> teardown in `finally`. Smoke executed this session on the disposable DB: migrate (v0 runner) -> `tsx src/db/seed.ts` ("Seed OK") -> `bootstrap-admin.ts` -> `tsx src/index.ts` -> `/healthz` 200, `/healthz/db` reports `PostgreSQL 17.10`, `POST /api/auth/login` 200 with `bio_exam_session` and `refresh_token` cookies, `GET /api/auth/me` returns roles `["admin"]` and permissions.
- **Login API:** body field is `username`, not `login`: `[VERIFIED: app/server/src/routes/auth/login.ts:49]` `const { username, password } = (req.body ?? {}) as { username?: string; password?: string }`; the in-memory limiter is `rateLimiter({ maxAttempts: 5, windowMs: 60 * 1000, keyPrefix: `login:${login}` })` (`:56`), so e2e must log in **once per role in `auth.setup.ts` and reuse `storageState`**; the explicit login/logout tests use a dedicated user and stay under 5 attempts/min (also 5 failures lock the account for 30 minutes per the project description of AUTH-06).
- **Seed** (`app/server/src/scripts/e2e-seed.ts`, deterministic, DB rows + local files): `db/seed.ts` only inserts roles (`ROLE_KEYS`), `bootstrap-admin.ts` creates one admin via `ADMIN_BOOTSTRAP_*` and `db/index.js` (C4 hazard), so the e2e seed needs its own inserts: admin + student (bcrypt hashes with fixed passwords from a test-only env), a topic, a test with 5 questions (`single_choice`, `multi_choice`, `matching`, `short_text`, `sequence_digits` per `question-types.ts`), answer keys, prompt files via `StorageService` local mode, an assignment for the student. Read `app/server/src/lib/tests/question-types.ts` and `scoring.test.ts` (key shapes) during planning; not exhaustively researched here.
- **Projects:** `chromium-desktop` (`devices['Desktop Chrome']`) and `chromium-mobile` (a Chromium-based phone profile, e.g. `devices['Pixel 7']`); `workers: 1` per project against one DB or per-project users; flows per D-14; known defects D1/D2/D5 as `test.fail()` `[CITED: https://playwright.dev/docs/test-annotations]` ("Playwright will run this test and ensure it does indeed fail. If the test does not fail, Playwright will complain"), so the fixing phase is forced to delete the annotation.
- **CI cost:** browsers install per `@playwright/test` version (`playwright install --with-deps chromium`); cache `~/.cache/ms-playwright` keyed on the version, still run `install-deps` on a hit `[ASSUMED]`; the repo already has `playwright@1.58.0` via `react-scan ^1.49` so Yarn will hold two copies unless deduped.

### Pattern 10: CI workflow (VER-03, VER-04, D-20..D-24)
Action versions verified from the GitHub API on 2026-10-03: `actions/checkout v7.0.1`, `actions/setup-node v7.0.0`, `actions/cache v6.1.0`, `actions/upload-artifact v7.0.1`.
```yaml
name: CI
on: { pull_request: {}, push: { branches: [master] } }
permissions: { contents: read }              # D-24: read-only token, no secrets, no deploy
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  verify:
    runs-on: ubuntu-24.04
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: test_bio_exam }
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 5s --health-timeout 5s --health-retries 10
    env: { TEST_DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/test_bio_exam' }
    steps:
      - uses: actions/checkout@v7
      - run: corepack enable                      # before setup-node's yarn cache
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: yarn }
      - uses: actions/cache@v6
        with: { path: .turbo, key: turbo-${{ runner.os }}-${{ github.sha }}, restore-keys: 'turbo-${{ runner.os }}-' }
      - run: node scripts/check-lockfile.mjs      # fails on package-lock.json / pnpm-lock.yaml / bun.lock* / npm-shrinkwrap.json
      - run: yarn install --immutable             # .yarnrc.yml has enableImmutableInstalls: false, so the flag is mandatory
      - run: yarn verify
      - run: yarn workspace @bio-exam/rbac build && yarn workspace @bio-exam/server build
      - run: yarn workspace @bio-exam/web build   # env: DATABASE_URL, AUTH_JWT_SECRET, API_ORIGIN placeholders (Pitfall 11)
  e2e: { ... same setup + playwright install --with-deps chromium + yarn e2e ... }
```
The job has no `secrets.*`, no deploy, `pull_request` (not `pull_request_target`). `.nvmrc` content is `v24` `[VERIFIED: .nvmrc:1]` (`v24`). `yarn install --immutable` was run in a clone: green, 574 packages fetched in 9 s (warnings only: `Resolutions field will be ignored`, peer notice). Lockfile guard script must also be reachable locally (`yarn verify`).

### Pattern 11: One-time read-only production schema comparison (D-07)
Manual, user-run (agents must not connect to the live DB): the local `DATABASE_URL` is the **transaction pooler** (host `aws-1-eu-north-1.pooler.supabase.com`, port **6543**, user prefix `postgres.`); `pg_dump` needs session semantics `[ASSUMED, from web-search summaries of Supabase docs: session pooler/direct on port 5432, not the 6543 transaction pooler; page not fetched]` -> use the same host on port **5432** (session mode) or the direct connection. Suggested command shape (values from the user's shell, never printed): `PGOPTIONS='-c default_transaction_read_only=on' pg_dump -h <pooler host> -p 5432 -U <user> -d postgres -s -n public -n extensions --no-owner --no-privileges -f prod.sql`; same flags against the disposable DB after migrations; normalise by deleting `--` comments, blank lines and the **`\restrict <token>` / `\unrestrict <token>` lines that pg_dump 17.10 emits with a random token (verified: two dumps of identical schemas differ only there)**, then `diff`. Also capture `select datcollate, datctype from pg_database where datname = current_database()` and `show timezone`, and dump `(hash, created_at)` from `public.__drizzle_migrations` to confirm the 21 rows match the local manifest (pre-flight for the one-way v1 upgrade, 4e). Expect noise from Supabase default privileges (`--no-privileges`), the `supabase_realtime` publication, and extension placement. Client 17.10 >= server 17.6 `[ASSUMED client/server rule]`. Output goes to the phase report, not to CI.

### Pattern 12: Docs deliverables (VER-07, D-25..D-27)
Root `README.md` (Russian): prerequisites (Node 24 via `.nvmrc`, Corepack/Yarn 4.12, PostgreSQL 17 via `brew install postgresql@17`), `yarn install`, copy `.env.example` files and fill locally (never commit values), `yarn dev`, `yarn verify`, `yarn e2e`, `yarn workspace @bio-exam/server drizzle:migrate` (**only against a `test_*` local database; the default `.env` points at live data**), the commit-by-user convention. `app/server/README.md`: short overview (API areas, access rules, five question templates, run/migrate); the current file documents obsolete routes and three question types (plan 001). `AGENTS.md`: add project commands, scope, routing under the existing CodeGraph section; `CLAUDE.md` stays `@AGENTS.md`. Env-example comments in Russian.

## Plan 002 overlap and toolchain side effects (research item 11)
- **Drizzle advisory moves to Phase 1:** GHSA-gpj5-g38j-94v9 is fixed in `drizzle-orm >= 0.45.2` and `>= 1.0.0-beta.20`; either option closes DEP-01's Drizzle line. Phase 2 must not re-plan the bump; keep its "Drizzle queries" regression coverage (it will use the VER-05 harness).
- **`package-lock.json` deletion (plan 002 step 3)** is VER-04 here; remove it from Phase 2. Also delete `NEXT_IGNORE_INCORRECT_LOCKFILE` from the user's local `app/web/.env` (not tracked).
- **Next bump (>= 16.2.11) and PostCSS/TinyMCE/Multer/Sharp/Lodash/next-mdx-remote stay in Phase 2.** The toolchain swap removes `@next/eslint-plugin-next`, `eslint-config-next`, `prettier-plugin-tailwindcss` etc. from the dependency graph, so Phase 2 must not touch them; oxlint's `nextjs` plugin is bundled and independent of the Next version.
- **Audit surface changes:** new dev dependencies (oxlint/oxfmt/tsdown/vitest/vite/playwright and their native optional binaries) enter `yarn npm audit`; DEP-04's reachability notes should classify them as tooling. Not executed here.
- **Vercel builds** (production runtime until Milestone 2) keep working only if: the rbac `build` script name is unchanged; `yarn install` on Vercel resolves the native optional binaries for linux-x64 (lockfile must carry them `[ASSUMED]`, first CI run on ubuntu proves `--immutable`); `app/web` build gets `DATABASE_URL`/`AUTH_JWT_SECRET` (already real in Vercel). Local reproduction: `yarn workspace @bio-exam/rbac build && yarn --cwd app/web build:dev` (with the 3 placeholder vars; executed in a clone: `next build` Compiled in 8.3 s, TypeScript 5.5 s, exit 0) and `node app/server/vercel-build.cjs`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Applied-migration tracking | A custom "which migrations ran" table/bridge (the neighbour project built a 500-line bridge) | Drizzle's own `migrate()` with `migrationsSchema: 'public'` | Verified: it upgrades the live-shaped table in place and matches by hash/created_at; names are derived from folder names. |
| DB-vs-schema comparison | A hand-written information_schema differ | `drizzle-kit push --explain --output json` (v1) and `generate --explain` | Understands Drizzle's own naming/normalisation; JSON statements list is the gate. |
| Postgres cluster management | Docker-in-scripts or a bundled binary | `initdb` + `pg_ctl` with the 3 verified flags | D-01; failure modes are known. |
| Schema dump diffing | A SQL parser | `pg_dump -s` + comment/`\restrict` stripping + `diff` | The only noise is deterministic. |
| Import / Tailwind ordering | Custom lint rules | oxfmt `sortImports` / `sortTailwindcss` | 0-diff parity measured. |
| Test waiting/retries in e2e | `sleep`/polling loops | Playwright auto-waiting + web-first assertions | Flake source number one. |
| Path containment | `startsWith(root)` string checks | `path.resolve` + `path.relative` + `realpath` of the existing ancestor | Prefix and symlink escapes. |
| Free port | Hard-coded 5432/4000/3000 | `net.createServer().listen(0)` | Parallel runs, developer's own Postgres on 5432. |
| Env parsing in the check | A new zod schema for the server | regex extraction + allowlist config | Server has no schema (C5); introducing one is scope creep. |

**Key insight:** every "obvious" shortcut in this phase has a verified trap (locale, socket path, `.env` override, tracking-table schema, Tailwind no-op), so reuse the exact recipes in this document instead of re-deriving them.

## Runtime State Inventory (migration / toolchain-swap phase)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Live Supabase `public.__drizzle_migrations` (21 rows `id, hash, created_at`); all other live data (31 users, 63 tests, 1834 questions, 264 attempts at 2026-09-26) untouched | **[option A only]** first v1 migrate adds `name`/`applied_at` + 21 `UPDATE`s: a gated, post-phase step (user-run, after the read-only pre-flight). Phase 1 writes nothing to it. Option B: none. |
| Live service config | Vercel projects run `corepack enable && yarn --cwd ../.. install`, rbac build then web/server build (`app/web/vercel.json`, `app/server/vercel.json`, `vercel-build.cjs`); Vercel dashboard env/Node-version settings not visible from git | Keep script names; run a Vercel preview build (or the local reproduction in the Plan 002 section) after tsdown/lockfile/eslint removal. No GitHub workflows or branch protection exist yet. |
| OS-registered state | None for this phase. Ephemeral: temp `bio-exam-pg-*` clusters under `os.tmpdir()` | Orphan sweep at harness start (Pattern 2). |
| Secrets / env vars | Local `app/server/.env` (15 keys incl. `DATABASE_URL`, `SUPABASE_*`, `AUTH_JWT_SECRET`, `ADMIN_*`) and `app/web/.env` (5 keys incl. `DATABASE_URL`, `AUTH_JWT_SECRET`, `NEXT_IGNORE_INCORRECT_LOCKFILE`) | No rename. New isolation switch must keep these files from being loaded in test/e2e (C4). Values never read into plans. |
| Build artifacts | `packages/rbac/dist` (tsup output), `app/web/tsconfig.tsbuildinfo`, `.turbo`, `app/web/.next`, `graphify-out/`, `.codegraph/`, `node_modules` still holds ESLint/Prettier packages until reinstall | tsdown `clean: true` replaces `dist`; run `yarn install` after removals; re-run `codegraph sync` after the file moves; the index and graphify graph go stale after the repo-wide reformat. |

## Common Pitfalls

### Pitfall 1: A process handed a disposable `DATABASE_URL` is re-pointed at Supabase (C4)
**What goes wrong:** `config/env.ts` loads `app/server/.env` with `override: true`; `db/index.ts` imports it first; `seed.ts`, `bootstrap-admin.ts`, the Express e2e server and any test importing `db/index.ts` use it. **How to avoid:** isolation switch + assertion (Pattern 3); first task of the phase; a Vitest test that spawns a child with a temp `cwd` containing a fake `.env` and proves `DATABASE_URL` is unchanged (candidate list includes `path.resolve(process.cwd(), '.env')`). **Warning sign:** `/healthz/db` `conn` field shows a non-localhost host.

### Pitfall 2: Postgres will not start on the Mac harness
Three verified messages: `postmaster became multithreaded during startup` (set `LC_ALL`), `Unix-domain socket path ... is too long (maximum 103 bytes)` (empty `unix_socket_directories`), and the `C`-locale Cyrillic trigram collapse (silent: `similarity` 0). See Pattern 2.

### Pitfall 3: `drizzle-kit up` looks like the conversion tool and is not (option A)
It stops at the first migration without a snapshot (`No snapshot was found`) after converting only 0000/0001, leaving a half-converted folder. Use the scripted conversion (4d).

### Pitfall 4: v1 migrator with the default schema re-applies everything
`migrationsSchema` default is `drizzle` in v1. Pin `'public'` and assert it. A wrong schema fails safe at the first statement (transaction rolled back) but leaves an empty `drizzle.__drizzle_migrations`.

### Pitfall 5: `drizzle-kit push` is not a gate under v0 and mutates under v1
v0.31 `push --verbose --strict` prints statements and prompts (no `--explain`); with stdin closed it printed the statements and exited 0 **without applying** (verified by re-reading the DB: policies, old index and FK names intact), but a gate built on parsing that text is brittle (4g). v1 `push --explain` is the structured, non-mutating form. Never run `push` without `--explain`/closed stdin against anything except a `test_*` DB.

### Pitfall 6: Declaring DB truth in `schema.ts` can alter runtime types
`withTimezone: true` changes `mapFromDriverValue`; behaviour is identical on UTC and fixes non-UTC sessions (4b). Add the non-UTC round-trip test before merging the edit. Index renames and extra indexes have no runtime effect.

### Pitfall 7: `question-type-resolver.test.ts` imports the DB module
Mock `db/index.js`; do not give it a dummy `DATABASE_URL` (D-02) or it will load `.env` (C4).

### Pitfall 8: Turbo strips env and caches DB tests
Strict env mode filters `TEST_DATABASE_URL` unless it is in `globalPassThroughEnv`; a cached `test` result would skip DB-backed tests. Set `cache: false` on `test`/`e2e`.

### Pitfall 9: oxfmt Tailwind sorting is silently inert without `tailwindcss`
Run format/check only after `yarn install`; CI order matters (install first). Also the repo's current class order was produced against a non-existent stylesheet (`./app/globals.css`), so enabling the sorter is churn, not a regression.

### Pitfall 10: Login rate limit breaks e2e
5 attempts/min per login+IP in memory; share `storageState`; keep explicit login tests few and on separate users.

### Pitfall 11: `next build` needs env at page-data collection
Without `DATABASE_URL` and `AUTH_JWT_SECRET`: `❌ Invalid server env: { DATABASE_URL: [ 'Required' ], AUTH_JWT_SECRET: [ 'Required' ] }` / `Failed to collect page data for /api/auth/me` (executed). With `DATABASE_URL=postgres://ci:ci@127.0.0.1:5432/test_ci AUTH_JWT_SECRET=ci-build-secret API_ORIGIN=http://127.0.0.1:4000` the build exits 0. Use obviously fake values and never a real secret in CI.

### Pitfall 12: `NODE_ENV=production` for the e2e Express changes semantics
Cookies become `Secure` (not sent over HTTP), `AUTH_SESSION_ENFORCE_DB` and RBAC DB overrides turn on, `/uploads` static is disabled. Use `development` plus the explicit flags.

### Pitfall 13: `pg_dump` 17.10 adds a random `\restrict` token
Strip before diffing, otherwise every dump differs.

### Pitfall 14: Two Playwright copies and a cold browser cache
`playwright@1.58.0` (react-scan) and `@playwright/test@1.63.0`; local browser cache has `chromium-1243` only. First local `yarn e2e` downloads Chromium; CI must install and cache by version.

### Pitfall 15: RLS on every public table (0018) bites non-owner roles
The harness connects as superuser `postgres` (bypasses RLS). A test that connects as another role would silently see zero rows because `deny_direct_access` is `USING (false)`. Keep tests on the superuser/owner role `[ASSUMED, standard PostgreSQL semantics]`.

### Pitfall 16: Reformat commit ordering
Agents cannot commit. The hash for `.git-blame-ignore-revs` exists only after the user commits the format-only change; `oxfmt --check` in `yarn verify` must be enabled after that commit lands (or guarded behind the step), otherwise verify is red on a dirty tree.

## Code Examples

Verified patterns (all executed in scratch against the real sources unless marked).

### Isolation switch for `config/env.ts` (C4; additive)
```ts
// app/server/src/config/env.ts  (sketch)
const isolated = process.env.BIO_EXAM_ISOLATED_ENV === '1'
let loadedFrom: string | null = null
if (!isolated) {
	for (const p of candidates) { /* existing loop, unchanged */ }
}
```
```ts
// app/server/src/db/index.ts (sketch): after the existing DATABASE_URL presence check
if (process.env.BIO_EXAM_ISOLATED_ENV === '1') assertTestDatabaseUrl(databaseUrl) // same function as the harness
```

### Vitest configs
```ts
// app/web/vitest.config.ts  (verified shape)
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
export default defineConfig({
	resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
	test: { environment: 'node', include: ['**/*.test.ts'], exclude: ['**/node_modules/**', '.next/**'] },
})
```
```ts
// app/server/vitest.config.ts  (sketch)
import { defineConfig } from 'vitest/config'
export default defineConfig({
	test: { include: ['src/**/*.test.ts'], globalSetup: ['./vitest.global-setup.ts'],
	        env: { BIO_EXAM_ISOLATED_ENV: '1' } },
})
```

### schema.ts edits that reach an empty diff (verified in scratch on rc.4 diff engine)
```ts
lockedUntil: timestamp('locked_until', { withTimezone: true }),
(t) => ({ ...,
	lockedUntilIdx: index('idx_users_locked_until').on(t.lockedUntil),
	testIdIdx: index('idx_test_attempts_test_id').on(t.testId),                 // renamed to the migration's name
	searchTextTrgmIdx: index('question_search_documents_search_text_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
	denyDirectAccess: pgPolicy('deny_direct_access', { as: 'permissive', for: 'all', to: 'public', using: sql`false`, withCheck: sql`false` }),
})
export const users = pgTable.withRLS('users', { /* columns */ }, (t) => ({ /* above */ }))
```

### v1 drizzle config used for all checks (executed)
```ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
	schema: './src/db/schema.ts', out: './drizzle', dialect: 'postgresql',
	dbCredentials: { url: process.env.DATABASE_URL! },   // check script injects the guarded test URL
	schemaFilter: ['public'], tablesFilter: ['!__drizzle_migrations'],
})
```

### Migration check pipeline (`scripts/check-migrations.mjs`)
1. `assertTestDatabaseUrl`; create a fresh `test_*` database. 2. Run the real runner (`apply-migration.ts`) with `migrationsSchema: 'public'`. 3. `[option A]` `drizzle-kit push --explain --output json` -> require `status: "ok"` and `statements.length === 0` (policies/RLS only allowlisted if the user chooses not to declare them); `[option B]` the 4g text-parse of `push --verbose --strict` with stdin closed, fail on any `^(ALTER|CREATE|DROP) ` line outside the allowlist. 4. `drizzle-kit generate --name check` then require `git status --porcelain app/server/drizzle` empty (delete nothing; the command must create nothing). 5. `drizzle-kit check` exit 0. 6. sha256 of every applied SQL equals the committed manifest, in order. 7. Re-run the runner: 0 migrations applied (idempotent). 8. Drop the database.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ESLint + Prettier + trivago + tailwind plugin | oxlint + oxfmt (built-in import/Tailwind sorting) | oxfmt 0.x, 2026 | One native binary each, ~ms runs; formatting parity measured. |
| tsup | tsdown (rolldown) | 2025-2026 | `fixedExtension: false` needed for `.js`/`.d.ts` names. |
| Drizzle journal + `meta/*_snapshot.json` | v1: one folder per migration with `migration.sql` + `snapshot.json` (v8 DDL snapshot), name-matched tracking table (`name`, `applied_at`) | Drizzle 1.0 rc | No `_journal.json`; `drizzle-kit drop` removed; RQB v1 removed for PG. |
| RQB v1 `relations()` + `schema` | RQB v2 `defineRelations` + object `where` | rc.1 (2026-04-30) | C1. |
| Playwright `globalSetup` DB | external wrapper owning teardown | n/a | Reliable teardown on crash. |

**Deprecated/outdated:** `eslint-plugin-react-hooks` v5 mapped as oxlint `react/rules-of-hooks`; `NEXT_IGNORE_INCORRECT_LOCKFILE` after the lockfile removal; the `app/web/package.json` `prettier` key and both `.prettierrc.json` files.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `postgres:17` image initialises the cluster with `en_US.utf8` | Pattern 2 | Cyrillic trigram search returns nothing in CI; the harness `datcollate` assertion catches it on the first run. |
| A2 | Free-port race is rare; orphan-sweep by `postmaster.pid` liveness is sufficient | Pattern 2 | Occasional flaky start; retry loop. |
| A3 | Yarn lockfile already carries linux-x64 optional binaries for oxlint/oxfmt/rolldown so `yarn install --immutable` works on ubuntu and Vercel | CI, Plan 002 section | First CI/Vercel install fails or rewrites the lockfile; fix by `yarn install` on a machine and commit. |
| A4 | Next does not let `.env*` files override already-set process env | Pattern 3 | e2e Next could read live `DATABASE_URL`; mitigated by passing explicit test values and having the web in API mode. |
| A5 | The `pgTable.withRLS` + `pgPolicy` pattern verified on `users` scales to all 25 tables to reach `statements: []` | Pattern 4 | Remaining diffs; fall back to allowlisting RLS in the gate. |
| A6 | Under option B the 25+25 RLS items can be cleared in kit 0.31 with `.enableRLS()` + `pgPolicy`, and the remaining v0-only items (FK names, `test_assignments_pkey`, `updated_at DESC` indexes) with explicit `foreignKey({ name })`, `primaryKey({ name })`, `.desc()`; zero state of `push --verbose` text not demonstrated | Pattern 4g | Option B's DRZ-01 gate stays noisy or needs a small allowlist; decide A vs B with this in mind. |
| A7 | Supabase session timezone is UTC, so live timestamps are read correctly today | Pattern 4b | If not UTC, live attempts already carry shifted times; the pg_dump/`show timezone` capture in D-07 answers it. |
| A8 | `playwright install-deps` is needed even on browser-cache hit; ubuntu-24.04 apt deps suffice | Pattern 9/10 | CI e2e fails to launch; add the step. |
| A9 | Content-type by extension for local `downloadBuffer` | Pattern 7 | Wrong `Content-Type` for images in local mode (Phase 7 redesigns). |
| A10 | pg_dump client 17.10 vs server 17.6 is acceptable | Pattern 11 | Dump refuses; use a matching client. |
| A11 | oxlint/oxfmt/tsdown/vitest native optional deps install on Vercel linux-x64 | Plan 002 section | Vercel preview build fails; run a preview build before merging. |
| A12 | Server-side NEXT env `API_ORIGIN` rewrite order keeps cookies same-origin in `next start` as in `next dev` | Pattern 9 | Login flow fails in e2e; adjust `ALLOWED_ORIGIN`/cookie domain. |

## Open Questions (RESOLVED)

All seven questions are resolved. None blocks planning; each resolution points at the decision or plan that settles it.

1. **Drizzle: option A (v1 rc.4 + RQB v2 rewrite now) or option B (stable 0.45.3/0.31.11 now, v1 with the module rewrites)?** (C1 + C2) (RESOLVED) — needs the user's decision before planning because the scope of tasks 4/9 differs by roughly the 82-error rewrite. Research leans **B** (no rc in production, one query rewrite instead of two) but B's DRZ-01 gate is weaker (4g); A has the verified structured gate. If A, pin `1.0.0-rc.4` exactly and schedule the live tracking-table upgrade as a gated post-phase step.
   - **Resolution:** option B, chosen by the user: CONTEXT D-05 (revised) and D-06 (revised). Exact pins `drizzle-orm` 0.45.3 and `drizzle-kit` 0.31.11 (01-02); v1 is deferred to its own later phase. The weaker B gate is replaced by the catalog comparator in 01-05 (chain database vs `schema.ts` database, no `push --explain`), so DRZ-01 stays machine-checked.
2. **Declare RLS/policies in `schema.ts` (`pgTable.withRLS` + `pgPolicy` on 25 tables) or allowlist them in the DRZ-01 gate?** (RESOLVED) — Declaring is more honest but touches 25 table definitions. Recommendation: declare (verified pattern), allowlist only as fallback.
   - **Resolution:** declare, by the user: CONTEXT D-28. Implemented in 01-05 Task 3 with the 0.45 API (`.enableRLS()` plus `pgPolicy('deny_direct_access', ...)` on all 25 tables; `pgTable.withRLS` does not exist in 0.45). 01-05 Task 3 STOPs and reports instead of allowlisting if the API cannot express an object.
3. **Enable `sortTailwindcss` in the single format commit?** (RESOLVED) — Recommendation: yes with the real stylesheet (class-order churn only), decided by the user before step 2 of D-11.
   - **Resolution:** yes, by the user: CONTEXT D-10 (updated after research). Enabled with `app/web/styles/globals.css` in the one-time format step, 01-14 Task 2; the parity config in 01-06 Task 3 deliberately leaves it out.
4. **Local storage key names and root path** (discretion) (RESOLVED) — proposal `STORAGE_DRIVER=local`, `STORAGE_LOCAL_DIR`; default root should NOT be `../web/public/uploads` (ties to Vercel/web layout) for e2e: use a temp dir.
   - **Resolution:** Claude's discretion under D-18, settled in 01-07: `STORAGE_DRIVER=local` plus an absolute `STORAGE_LOCAL_DIR` (a relative path throws); there is no default root. The e2e wrapper (01-09 Task 1) passes a temp directory `bio-exam-e2e-storage-*` and removes it afterwards.
5. **D-07 pre-flight execution:** (RESOLVED) — the user must run the read-only session-pooler `pg_dump` and the `public.__drizzle_migrations` dump themselves (or explicitly authorise it); planner marks it `checkpoint:human-action`.
   - **Resolution:** CONTEXT D-07. 01-12 Task 2 is a `checkpoint:human-action` with the exact read-only commands (session pooler, port 5432); agents never connect to production, and the user may answer "skip D-07", which leaves the report marked open.
6. **e2e seed shape:** (RESOLVED) — exact answer-key and prompt-file shapes per template must be read from `question-types.ts`/`scoring.test.ts` during planning (not exhaustively researched).
   - **Resolution:** Claude's discretion under D-14/D-15, settled in 01-09 Task 1 (`read_first` lists `question-types.ts`, `scoring.test.ts` and the question-create handler). The seed keeps data in `e2e/fixtures/seed.json`: one topic, per project (desktop, mobile) separate accounts and tests, one question per template with the answer-key shape taken from `scoring.test.ts`.
7. **Does the user want `oxlint` `correctness` category on** (about 50 extra warnings) or parity-only? (RESOLVED) — Recommendation: parity-only now, list the rest as tech debt (D-12).
   - **Resolution:** `correctness` stays on at `warn`, kept as a discretion call under D-08 and D-12 (the research recommendation of parity-only is not followed). Reasons: D-12 already prescribes "mass-firing rules at `warn`, listed as tech debt"; warnings never fail `yarn verify` because no `--deny-warnings` flag is used anywhere (01-06 acceptance grep); the extra findings become a visible tech-debt list instead of staying invisible. 01-06 Task 1 (steps 2, 3 and 6) carries the config and records the warnings per workspace and per rule in its SUMMARY. Only genuine errors are fixed, which keeps the toolchain swap behaviour-neutral. Reversing this later is a one-line config change.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | yes | 24.17.0 (`.nvmrc` `v24`) | none |
| Yarn (vendored release) / Corepack | install, CI | yes | 4.12.0 / corepack 0.35.0 | none |
| PostgreSQL server+tools (Homebrew) | harness, migration check, e2e | yes | 17.10 (`pg_ctl`, `initdb`, `pg_dump`, `psql` in `/opt/homebrew/bin`; `en_US.UTF-8` available) | `TEST_DATABASE_URL` pointing at any local `test_*` DB |
| Docker | none required (D-01) | no | - | not needed |
| `gh` CLI | none | no | - | GitHub API via `curl` was enough |
| Playwright Chromium | e2e | partial | cached `chromium-1243` (for 1.58) | `yarn playwright install chromium` (network) |
| `timeout` (coreutils) | n/a | no (macOS) | - | use Node timers in scripts; do not use `timeout` in npm scripts |
| `pg_trgm` extension | search + 0017/0018 | yes (contrib in Homebrew and in `postgres:17` image `[ASSUMED]` for image) | 17.10 | none |
| GitHub Actions | CI | n/a here | - | workflow validated only structurally |

**Missing with no fallback:** none. **Missing with fallback:** Playwright browser build for 1.63 (download), `timeout`.

## Validation Architecture

Nyquist validation is enabled (`.planning/config.json`: `workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 (unit/module/DB-backed), Playwright 1.63.0 (e2e), node scripts for repository checks |
| Config files | `app/web/vitest.config.ts`, `app/server/vitest.config.ts`, `packages/rbac/vitest.config.ts`, `e2e/playwright.config.ts` (all Wave 0, none exist) |
| Quick run command | `yarn workspace @bio-exam/web test` / `yarn workspace @bio-exam/server test` / `yarn workspace @bio-exam/rbac test` (each < 10 s expected; single file: `yarn workspace @bio-exam/server vitest run src/lib/tests/scoring.test.ts`) |
| Full suite command | `yarn verify` (starts/uses the disposable DB), then `yarn e2e` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VER-01 | 12 ported files run and pass under Vitest in web/server; rbac smoke test | unit | `yarn workspace @bio-exam/web test && yarn workspace @bio-exam/server test && yarn workspace @bio-exam/rbac test` | Wave 0 (configs, ports, rbac test) |
| VER-02 | `yarn verify` exits 0 on a clean tree and non-zero when any step fails | integration | `yarn verify`; negative: inject an oxlint error / a failing assert, expect non-zero | Wave 0 (`scripts/verify.mjs`) |
| VER-03 | CI file has Corepack, `--immutable`, `yarn verify`, migration check, no deploy/secrets | static | `node scripts/check-ci-workflow.mjs` (asserts triggers, `permissions: contents: read`, absence of `secrets.`, `deploy`, `vercel`, `pull_request_target`) | Wave 0 |
| VER-04 | single lockfile | static | `node scripts/check-lockfile.mjs` and `test ! -e package-lock.json` | Wave 0 |
| VER-05 | guard accepts only `localhost`/`127.0.0.1` + `test_*`; harness starts, UTC + non-C locale asserted, tears down | unit + smoke | `yarn workspace @bio-exam/server vitest run src/**/test-db.test.ts`; `node scripts/lib/test-db.mjs --self-test` | Wave 0 |
| VER-06 | env examples complete, placeholders only | unit (fixtures) + static | `node scripts/check-env-contract.mjs` | Wave 0 |
| VER-07 | README/AGENTS mention only existing scripts and files | static | `node scripts/check-docs-commands.mjs` (every `yarn <script>` in README/AGENTS exists in a `package.json`) + human review | Wave 0 |
| VER-08 | deferred | - | - | - |
| DRZ-01 | chain from zero == `schema.ts` (empty `push --explain`) | integration (DB) | `node scripts/check-migrations.mjs` step 3 | Wave 0 |
| DRZ-02 | snapshot restored; SQL byte-identical; `generate` creates nothing; `check` ok | integration | `node scripts/check-migrations.mjs` steps 4-6 | Wave 0 |
| DRZ-03 | CI runs the same script | CI | job `verify` calls `yarn verify` (includes it) | Wave 0 |
| C3 | `timestamptz` round trip under non-UTC session | DB unit | `yarn workspace @bio-exam/server vitest run src/db/timestamps.test.ts` | Wave 0 |
| C4 | `BIO_EXAM_ISOLATED_ENV=1` ignores `.env` (child process with fake `.env`) | unit | `yarn workspace @bio-exam/server vitest run src/config/env.isolation.test.ts` | Wave 0 |
| D-09 | rbac dist file names + 14 exports ESM == CJS | build check | `yarn workspace @bio-exam/rbac build && node scripts/check-rbac-dist.mjs` | Wave 0 |
| D-11 | repo formatted | static | `yarn format:check` (`oxfmt --check .`) after the user's format commit | Wave 0 |
| D-12 | zero lint errors | static | `yarn lint` | Wave 0 |
| D-14/D-15/D-16 | four flows on desktop+mobile; D1/D2/D5 expected-fail | e2e | `yarn e2e` | Wave 0 (`e2e/`) |
| D-18 | local storage CRUD + containment table | unit | `yarn workspace @bio-exam/server vitest run src/services/storage/storage.local.test.ts` | Wave 0 |
| D-19 | ported `getServerMe` assertions | unit | `yarn workspace @bio-exam/web vitest run lib/auth/getServerMe.test.ts` | Wave 0 (port) |
| D-21 | CI builds web/server/rbac | CI | `yarn workspace @bio-exam/web build` (3 placeholder env vars) etc. | Wave 0 |

### Sampling Rate
- **Per task commit (user commits; agent runs after each task):** the quick command for the touched workspace + the specific check script.
- **Per wave merge:** `yarn verify`.
- **Phase gate:** `yarn verify` and `yarn e2e` green, plus one CI run on GitHub (advisory) and the read-only D-07 report attached, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `vitest.config.ts` in web/server/rbac, `vitest`/`vite` dev deps, `test` scripts, Turbo `test` task, rbac smoke test.
- [ ] `scripts/lib/test-db.mjs` (guard + cluster), `scripts/verify.mjs`, `scripts/e2e.mjs`, the check scripts listed above.
- [ ] `config/env.ts` isolation switch + `db/index.ts` assertion (C4) and their tests.
- [ ] `e2e/` with Playwright config, `auth.setup.ts`, 4 specs, `e2e-seed.ts`.
- [ ] `.oxfmtrc.json`, `.oxlintrc.json` files, `tsdown.config.ts`, removal of ESLint/Prettier/tsup artefacts.
- [ ] `.github/workflows/ci.yml`.

## Security Domain

`security_enforcement` is not set to false (config has no such key), so the section applies.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no change | login/session code untouched; e2e uses a test-only `AUTH_JWT_SECRET` |
| V3 Session Management | no change | cookies stay HttpOnly/SameSite=Lax; e2e must not weaken production flags |
| V4 Access Control | no change | RBAC untouched; e2e exercises it with `RBAC_USE_DB_OVERRIDES=1` |
| V5 Input Validation | yes | local storage key validation + containment (Pattern 7); URL guard (Pattern 3) |
| V6 Cryptography | no | no custom crypto; bcrypt test hashes only |
| V12 Files and Resources | yes | path containment incl. symlink escape; temp dirs |
| V14 Configuration | yes | env examples value-free + contract check; CI least privilege; no secrets in workflows; pinned toolchain; dependency provenance (SUS audit) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Test/e2e process writes to live Supabase via `.env` override (C4) | Tampering / Information disclosure | `BIO_EXAM_ISOLATED_ENV` kill switch + `assertTestDatabaseUrl` at harness, Vitest, seed and `db/index.ts` |
| Path traversal / symlink escape in local storage | Tampering / Information disclosure | `resolve` + `relative` + `realpath` containment, traversal test table |
| Secrets committed through env examples | Information disclosure | placeholder-only validator in `yarn verify`; docs never print `.env` values |
| Over-privileged CI token / untrusted PR code with secrets | Elevation of privilege | `permissions: contents: read`, `pull_request` (never `pull_request_target`), no `secrets.*`, no deploy, `actions` pinned by major (consider SHA pinning) |
| Supply chain (new native toolchain packages flagged SUS/too-new) | Tampering | exact pins, human-verify checkpoint, lockfile immutable install, audit after install |
| Postgres cluster exposed on the network | Information disclosure | `listen_addresses=127.0.0.1`, `--auth=trust` only on loopback, `0700` data dir by `initdb`, random free port, removed on teardown |
| Destructive migration diff applied to a live DB | Tampering | Plan 009 STOP; migrations never edited; checksum manifest; v1 tracking-table upgrade gated and user-run |

## Suggested sequencing (for the planner; user commits between waves)
1. **Wave A, safety first:** `config/env.ts` switch + `db/index.ts` assertion + tests; `scripts/lib/test-db.mjs` (guard, cluster, self-test).
2. **Wave B, tests:** Vitest configs, port of the 12 files (+ rbac smoke), Turbo `test`, `scripts/verify.mjs` (lint step stubbed until Wave D).
3. **Wave C, Drizzle:** `schema.ts` truth edits (+ timezone test) -> gate -> snapshot restore -> migration check; `[A]` v1 conversion script, runner and RQB rewrite (largest, needs C1 decision); checkpoint for the user's read-only D-07 pre-flight.
4. **Wave D, toolchain:** oxlint/oxfmt configs, parity proof, tsdown swap, ESLint/Prettier/tsup removal, lockfile deletion + guard; `checkpoint:human-verify` for package pins; `checkpoint:human-action` for the format commit + `.git-blame-ignore-revs`; enable `oxfmt --check` in verify.
5. **Wave E, e2e:** StorageService local mode + tests, e2e seed, Playwright config, `scripts/e2e.mjs`, four specs, expected-fail checks.
6. **Wave F, CI + docs:** workflow, env examples + contract check, READMEs, AGENTS.md; one real CI run (advisory).

## Sources

### Primary (HIGH confidence, executed or read this session)
- Scratch experiments on PostgreSQL 17.10 (Homebrew): chain apply, `drizzle-kit` 0.31.8 and 1.0.0-rc.4 `generate`/`up`/`check`/`push --explain`/`pull`, v0 and v1 migrators on a v0-created tracking table, timezone round trip, API boot/login, `next build` with and without env, Vitest 5.0.3 port, oxfmt 0.71.0 / oxlint 1.86.0 / `@oxlint/migrate`, tsdown 0.23.0, `yarn install --immutable`.
- Source reads: `/Volumes/T7/its/lifemy-doc-drizzle-v1/node_modules/drizzle-orm/{migrator.js,migrator.utils.js,up-migrations/pg.js,pg-core/utils.d.ts,pg-core/async/session.js}` (rc.4), nightly `1.0.0-rc.5-5935859` tarball (no PG `_query`), repo files cited inline.
- npm registry (`npm view`), GitHub API (advisories, action releases).

### Secondary (MEDIUM confidence, official docs via fetch)
- https://orm.drizzle.team/docs/upgrade-v1 and /docs/v0-v1-changes (folder format, `up`, name/applied_at, all-schemas default, RQBv1 removed)
- https://github.com/drizzle-team/drizzle-orm/releases (no stable 1.0.0; 0.45.3 / kit 0.31.11 latest)
- https://oxc.rs/docs/guide/usage/formatter and /linter (config files, `sortImports`, `sortTailwindcss`, `--migrate`)
- https://playwright.dev/docs/test-webserver, /docs/test-annotations
- https://turborepo.dev/docs/crafting-your-repository/using-environment-variables
- https://docs.github.com/en/repositories/working-with-files/using-files/viewing-and-understanding-files (`.git-blame-ignore-revs`)
- Supabase connection docs via search (session mode port 5432 for `pg_dump`)

### Tertiary (LOW confidence)
- Image/runner behaviours listed in the Assumptions Log (A1, A3, A8, A11).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, versions from the registry; behaviour of each tool exercised here. Caveat: oxfmt/tsdown are pre-1.0 and every package is flagged SUS (recency).
- Architecture: HIGH for DB harness, Drizzle procedures, Vitest port, ox configs; MEDIUM for e2e (smoke ran API + login only; Next+Playwright not run, per scope) and CI (not executed).
- Pitfalls: HIGH, nearly all reproduced.

**Research date:** 2026-10-03
**Valid until:** 2026-10-10 for tool versions and the Drizzle status (fast-moving: rc.5 may land; oxlint/oxfmt release almost daily); 30 days for the rest.
