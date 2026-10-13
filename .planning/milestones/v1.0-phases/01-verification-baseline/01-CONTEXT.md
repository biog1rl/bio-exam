# Phase 1: Verification baseline - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning

<domain>
## Phase Boundary

One trustworthy verification gate for the monorepo, plus a migration history that is safe to extend:

- `yarn verify`: oxlint, `oxfmt --check`, typecheck, Vitest, the env-contract check and the migration check. It runs locally and in CI.
- `yarn e2e`: Playwright end-to-end tests of the critical flows, on a disposable PostgreSQL and a local file store. It runs in CI.
- A single lockfile.
- Drizzle on the stable 0.45.3/0.31.11 line, with a corrected `schema.ts` and a restored current snapshot.
- Onboarding docs.

The phase delivers tooling and safety nets only. Application behaviour does not change, except for two additive changes: a local-disk storage driver and the tooling swap.

Requirements in scope: VER-01…VER-07, DRZ-01…DRZ-03 (`.planning/REQUIREMENTS.md`). VER-08 is deferred (see `<deferred>`). The user approved these scope additions in discussion: the ox toolchain (oxlint, oxfmt, tsdown), Playwright e2e, a minimal local-disk storage driver, env isolation (D-29), and `schema.ts` truth-alignment (D-28). Drizzle v1 was moved out of this phase after research (D-05).

</domain>

<decisions>
## Implementation Decisions

Carried forward (locked in `.planning/PROJECT.md`, not re-asked):
- **ADR-0003 (PROJECT D-03).** Vitest in every workspace, root `yarn verify`, CI on PRs, Yarn 4 as the only package manager.
- **PROJECT D-07.** `package-lock.json` is deleted, and a CI guard fails on a second lockfile.
- **PROJECT D-08.** The 12 `*.test.ts` files are ported to Vitest, with their assertion meaning unchanged. They are not wrapped.
- **Plan 009 guards.** Applied SQL migrations are never edited, reordered or re-checksummed. A generated diff that proposes a drop or recreate is a STOP.

### Disposable database (tests, migration check, e2e)
- **D-01:** The local disposable PostgreSQL comes from Homebrew `pg_ctl` (PostgreSQL 17.10, the same major as Supabase 17.6). A script `initdb`s a fresh cluster in a temp directory, starts it on a free port, and stops and removes it afterwards. No Docker is required. CI uses a `postgres:17` service container. The migration chain runs on plain PostgreSQL 17: migration 0018 creates the `extensions` schema and moves `pg_trgm` into it, and RLS policies target `public`. No Supabase roles or images are needed. This also matches the self-hosted target, because the project is leaving Supabase and Vercel for its own server (Milestone 2).
- **D-02:** Tests and the migration check read only `TEST_DATABASE_URL`, never `DATABASE_URL`. The harness refuses to run unless the host is `localhost` or `127.0.0.1` and the database name starts with `test_`. Today `DATABASE_URL` in `app/server/.env` and `app/web/.env` points at the Supabase pooler (`aws-1-eu-north-1.pooler.supabase.com`), which holds live data.
- **D-03:** `yarn verify` starts the temporary `pg_ctl` cluster itself, runs everything, and tears the cluster down. If PostgreSQL is not installed, it fails with a clear message. It never skips DB tests silently.
- **D-04:** Restore only the current Drizzle snapshot. Intermediate snapshots (0002–0014, 0016–0019) are not reconstructed. Today only `0000`, `0001` and `0015` exist in `app/server/drizzle/meta/`.
- **D-05 (revised 2026-10-03 after research):** Stay on the stable Drizzle line in this phase. Bump to `drizzle-orm` 0.45.3 and `drizzle-kit` 0.31.11, which closes GHSA-gpj5-g38j-94v9 (fixed in 0.45.2). Restore the current snapshot in the v0 format and build the migration check on 0.31. Drizzle v1 is deferred to its own later phase, once 1.0 is released stable (see `<deferred>`).
  - Reason: research (01-RESEARCH.md, C1/C2) found no stable 1.x; npm `latest` is 0.45.3/0.31.11 and v1 exists only as `1.0.0-rc.4`.
  - v1 also has no compatibility path for the existing relational queries. A typecheck against rc.4 left 82 call sites to rewrite.
  - The first v1 migrate would also alter the live `public.__drizzle_migrations` table (one-way).
  - The original "v1 now" choice rested on a compatibility path that does not exist. The user chose the stable line.
- **D-06 (revised):** Existing queries (`db.query.*`, about 76 call sites in 10 files) stay on the 0.45 API in this phase, and their behaviour does not change. A wholesale data-layer rewrite was rejected, because no tests protect it yet and the known query defects live inside the ADR-0005 modules (Phases 4, 5, 7, 8). The later v1 phase rewrites the remaining relational queries under e2e and module-test protection.
- **D-28:** `schema.ts` is corrected to declare the real database, with **no new migration**. This is required before DRZ-01 can hold (research C3). Three kinds of changes:
  - The 10 columns that are `timestamptz` in the migrations are declared `timestamp(..., { withTimezone: true })`. This also fixes a live bug: today values are shifted by the process time zone. Vercel runs in UTC, so the bug is invisible there, but it would show on the own server.
  - The `deny_direct_access` RLS enablement and policy on the 25 tables are declared in `schema.ts` (user choice: declare, not allowlist).
  - The 4 differently named indexes and the 3 undeclared indexes (including the gin trigram index) are aligned with the migrations.
  — **Reversibility:** reversible — schema.ts declarations only; no DDL is applied to any live database.
- **D-29:** Env isolation is the **first** task of the phase, before any script runs against a disposable DB (research C4). `app/server/src/config/env.ts` loads `.env` with `dotenv({ override: true })`, so a process given a disposable `DATABASE_URL` silently switches to Supabase whenever a local `.env` exists. The fix has three parts:
  - an explicit isolation switch (e.g. `BIO_EXAM_ISOLATED_ENV=1`) that disables `.env` loading/override;
  - a URL guard in `app/server/src/db/index.ts` that refuses non-`localhost`/non-`test_` URLs in isolated mode;
  - the same guard in the migration runner (`src/scripts/apply-migration.ts`), which loads `dotenv/config` itself.

  Seed, bootstrap-admin, the e2e Express server and every DB-touching test run in isolated mode.
- **D-07:** Compare the schema once, read-only, in this phase. The **user** runs the `pg_dump --schema-only` from the current Supabase database via the session pooler on port 5432, not the 6543 transaction pooler. The plan gives the exact command as a human-action checkpoint; agents never connect to production. The dump is then and diff it against a disposable database after migrations 0000→latest. Record the differences in the phase report. This check is not part of CI, because CI has no production access. It also gives the baseline for the later data transfer to the own server.

### `yarn verify` strictness and toolchain
- **D-08:** Move to the ox toolchain in every workspace (`app/web`, `app/server`, `packages/rbac`):
  - `oxlint` replaces ESLint. It covers the current coverage: Next.js rules, react-hooks, TypeScript, unused vars with the `^_` ignore pattern.
  - `oxfmt` replaces Prettier.
  - ESLint, Prettier and their plugins and configs are removed (`app/web/eslint.config.mjs`, `.prettierrc.json`, `app/web/.prettierrc.json`, eslint-* and prettier-* devDependencies).
- **D-09:** `@bio-exam/rbac` is built with `tsdown` instead of `tsup`, with the same outputs: ESM, CJS and `.d.ts` in `dist`. `packages/exam-core` (Phase 3) will start on the same setup.
- **D-10 (updated after research):** `oxfmt` has built-in `sortImports` and `sortTailwindcss`. A tuned config reproduces the current Prettier + trivago output with 0 diffs on `app/web` (01-RESEARCH.md C6). **Enable `sortTailwindcss`** in the same one-time format step. This is a one-time class-order churn: Tailwind sorting was inert before, because the plugin pointed at a non-existent `./app/globals.css`.
- **D-11:** Reformat the whole repository once, as a separate format-only step with no logic changes, that the user commits separately. Its commit hash goes into `.git-blame-ignore-revs`. After that, `oxfmt --check` runs inside `yarn verify`.
- **D-12:** Lint errors in legacy code are fixed. Rules that fire en masse are set to `warn` temporarily and listed as tech debt. `yarn verify` fails on errors.

### Tests: Vitest and Playwright
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

### CI
- **D-20:** GitHub Actions runs on pull requests and on pushes to `master`.
- **D-21:** CI also builds `next build`, the server and the packages. Local `yarn verify` does not build.
- **D-22:** CI is advisory. No branch protection is required, and direct pushes to `master` keep working. The user commits directly to `master` today.
- **D-23:** Cache Yarn and Turbo with `actions/cache`. No Turbo remote cache, and no new Vercel dependency, because the project is leaving Vercel.
- **D-24:** CI contains no deployment or write step. It reaches production by no path.

### Docs
- **D-25:** Project docs (root `README.md`, `app/server/README.md`, env-example comments) are written in Russian. Identifiers, commands and paths stay as they are.
- **D-26:** `app/server/README.md` becomes a short overview: API areas, access rules, the five question templates, run and migrate commands. It contains no exhaustive route list, because exact routes live in code and CodeGraph and the router is split in Phase 8.
- **D-27:** `AGENTS.md` gains project commands, scope and routing next to its existing CodeGraph section. `CLAUDE.md` keeps importing it (`@AGENTS.md`). Project-specific rules stay valid for any developer; personal rules are not copied into project files.

### Claude's Discretion
- How `oxfmt` is configured (indentation and quotes follow the current `.prettierrc.json` where possible).
- The Vitest layout: a workspace or projects config versus per-package configs.
- The e2e seed contents and fixtures, kept minimal and deterministic.
- The env-contract check mechanism: an allowlisted comparison of `.env.example` keys with the zod env schemas in `app/web/lib/env/server.ts` and `app/server/src/config/env.ts`.
- The local storage driver's root path and configuration key names.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Decisions and scope
- `docs/adr/0003-verification-before-refactoring.md` — verification first: Vitest, `yarn verify`, CI, one lockfile, Drizzle metadata before new migrations.
- `docs/adr/0004-storage-port-two-adapters.md` — the full storage seam (Phase 7). D-18 adds only a minimal local mode and must not pre-empt it.
- `docs/adr/0001-express-owns-data-and-access-policy.md` — `getMeData` is deleted in Phase 4. Context for D-19.
- `.planning/PROJECT.md` — locked decisions D-01…D-14, constraints, defects D1–D8.
- `.planning/REQUIREMENTS.md` — VER-01…VER-08, DRZ-01…DRZ-03.
- `.planning/ROADMAP.md` — Phase 1 goal and success criteria.

### Source plans
- `plans/001-project-operating-baseline.md` — verify, CI, env examples and docs steps. Step 1's "wrap without rewriting" and its STOP are overridden by ADR-0003 and D-08. Step 5 (skills) is deferred.
- `plans/009-drizzle-metadata.md` — snapshot reconciliation, a disposable DB, a clean-generation drift check, and the STOP conditions.
- `plans/002-dependency-security.md` — overlaps on the Drizzle ORM version. The Drizzle 0.45.3/0.31.11 bump (GHSA-gpj5-g38j-94v9) now happens in Phase 1, so Phase 2 must not re-plan it.
- `plans/beget-migration.md` §2.1, §3.1, §5, §6 — the self-hosted target, live-data facts, the planned Docker and CI shape, and why Supabase specifics must not leak into new tooling.

### External reference
- `/Volumes/T7/its/lifemy-doc-drizzle-v1` — a neighbouring project on `drizzle-orm`/`drizzle-kit` `1.0.0-rc.4`. Not used in Phase 1 (Drizzle stays on 0.45); kept as a reference for the later v1 phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Tests.** 12 `*.test.ts` files (git-tracked). Three in `app/server/src/lib/tests/`: question-type-resolver, scoring, telemetry. One at `app/server/src/schemas/tests.test.ts`. Eight in `app/web`: `admin/tests/lifecycle`, `attempt-review/AttemptQuestionsList`, `attempt-review-utils`, `components/tests/telemetry`, `lib/auth/getServerMe`, `loginRedirect`, `sessionCookie`, `lib/mdx/normalizeSource`. All are top-level `node:assert/strict` scripts.
- **`app/server/src/scripts/apply-migration.ts`.** The custom migration runner behind `yarn drizzle:migrate`. It loads `dotenv/config` itself, so it gets the D-29 guard and must keep working on drizzle 0.45.3.
- **`app/server/src/db/seed.ts` and `src/scripts/bootstrap-admin.ts`.** A starting point for the deterministic e2e seed.
- **`app/server/src/services/storage/storage.ts`.** The `StorageService` with an `isConfigured()` branch. The insertion point for the D-18 local mode.
- **Zod env schemas.** `app/web/lib/env/server.ts` and `app/server/src/config/env.ts`. The source of truth for the env contract (VER-06).

### Established Patterns
- **Monorepo.** Yarn 4.12 with the `node-modules` linker, Turbo 2.9 (`turbo.json` has build, dev, start, lint and typecheck tasks; no test task yet), Node 24.
- **Lint.** Only `app/web` has lint (ESLint 9 flat config, with Prettier run as an ESLint rule). `app/server` and `packages/rbac` have only `typecheck`.
- **`@bio-exam/rbac` build.** It is built by tsup to `dist` (ESM and CJS, plus types) and consumed from `dist` by web and server.
- **Search SQL.** It calls `extensions.similarity(...)` (`app/server/src/services/search/database-search.ts`), which works on any PostgreSQL after migration 0018.

### Integration Points
- **Vercel is still the production runtime** until Milestone 2. `app/web/vercel.json` runs `yarn workspace @bio-exam/rbac build && yarn build:dev`. `app/server/vercel.json` runs `node vercel-build.cjs`, which builds rbac and then the server. The tsdown switch, lockfile removal, ESLint removal and the Drizzle 0.45.3 bump must keep both Vercel builds working. Planners should include a Vercel preview-build check or an equivalent local reproduction.
- `turbo.json` gets `test` (and `e2e` if routed through Turbo). The root `package.json` gets `test`, `verify`, `e2e` and formatting scripts.
- `.github/workflows/` does not exist yet.
- `.agents/` does not exist; the skills are deferred.

</code_context>

<specifics>
## Specific Ideas

- **Live data.** `DATABASE_URL` in local `.env` files points to Supabase with live data (the 2026-09-26 baseline: 31 users, 63 tests, 1834 questions, 264 attempts). Treat every DB-touching script as dangerous unless it proves it is on `test_*` at localhost.
- **Leaving Supabase.** The user is moving off Supabase as well as Vercel; everything will run on their own server. Prefer plain-PostgreSQL and local-disk solutions; add no new Supabase or Vercel coupling.
- **One-time format commit.** The repository-wide reformat must be isolated so the user can commit it separately and add it to `.git-blame-ignore-revs`.

</specifics>

<deferred>
## Deferred Ideas

- **VER-08 (project skills `bio-exam-web`, `bio-exam-api`, `bio-exam-data`).** Deferred until after Phases 3–5. Skills written now would describe code that is about to be rewritten (exam-core, auth, attempts). The user confirmed this deferral in discussion on 2026-10-03. At the plan-phase coverage gate the user moved VER-08 to Phase 6 (ROADMAP and REQUIREMENTS traceability updated). `AGENTS.md` plus `docs/adr/` cover agent guidance until then.
- **Query rewrites inside the ADR-0005 modules.** These happen per module in Phases 4, 5, 7 and 8, on the 0.45 API. The remaining relational queries move to v1 in the later Drizzle v1 phase.
- **Drizzle v1 (`drizzle-orm` and `drizzle-kit` 1.x).** It gets its own phase once 1.0 is released stable, and it rewrites the remaining relational queries (82 call sites per research) to the v1 query API under e2e and module-test protection. The first v1 migrate alters live `public.__drizzle_migrations` (one-way), so that phase needs a gated rollout. User decision, 2026-10-03.
- **The full storage seam from ADR-0004.** Interface, contract tests, key normalisation, URL rule and streaming ZIP stay in Phase 7; Phase 1 adds only a minimal local mode (D-18).
- **Branch protection that makes CI a required check.** The user chose advisory CI for now (D-22); revisit when work moves to PR branches.

</deferred>

---

*Phase: 01-verification-baseline*
*Context gathered: 2026-10-03*
