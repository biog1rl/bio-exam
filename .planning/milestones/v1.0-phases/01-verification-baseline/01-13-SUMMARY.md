---
phase: 01-verification-baseline
plan: 13
subsystem: tooling
tags: [env-contract, docs, readme, agents, verify, node-test]

# Dependency graph
requires:
  - phase: 01-verification-baseline
    provides: "01-10 scripts/verify.mjs STEPS array; 01-01 isolation switch (BIO_EXAM_ISOLATED_ENV, TEST_DATABASE_URL, ISOLATED_ENV_FLAG); 01-07 STORAGE_DRIVER / STORAGE_LOCAL_DIR; 01-09 yarn e2e and E2E_SEED_FILE; 01-11 test/lint scripts"
provides:
  - "app/web/.env.example (new) and a rewritten app/server/.env.example: every key the code reads, placeholders only, Russian comments"
  - "scripts/check-env-contract.mjs + scripts/env-contract.config.json: allowlisted comparison of example keys with process.env reads and web zod keys, secret-pattern and placeholder rules, never opens a real env file"
  - "scripts/check-docs-commands.mjs: every yarn command in README.md, app/server/README.md and AGENTS.md must exist (root script, named-workspace script, yarn built-in or root devDependency binary)"
  - "Russian root README.md (onboarding), short Russian app/server/README.md, AGENTS.md sections Project commands / Scope and safety / Routing"
  - "yarn verify steps env-contract and docs-commands (order: lockfile, env-contract, docs-commands, lint-typecheck-test, migrations, script-tests)"
affects: [01-14, 01-15, ci, every later phase that adds an environment key or a documented command]

# Actuals (#2632) - chars/4 over the files this plan created or changed (byte count; Cyrillic text inflates it)
actuals:
  tokens: 14000
  tasks: 3
  commits: 0
plan_head_before: 11b291649c54eec9678edf0a441232a92b631197
plan_head_after: 11b291649c54eec9678edf0a441232a92b631197

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Check scripts export a pure function over injected inputs (checkEnvContract({ workspaces, config }), checkDocsCommands({ files, packages })) plus a thin CLI guarded by isMain; fixtures live in temp dirs or in memory"
    - "Findings are objects with a message, sorted by workspace then key (env) or kept in file/line order (docs); messages carry key names only, never values"
    - "Allowlist entries are data (scripts/env-contract.config.json) and each needs a reason; allowlisted means exempt from both the undocumented and the unused rule"
    - "Env example convention: required keys uncommented with empty or placeholder value, optional keys commented with their code default, so a copied example is a valid minimal file"

key-files:
  created:
    - app/web/.env.example
    - scripts/check-env-contract.mjs
    - scripts/env-contract.config.json
    - scripts/check-env-contract.test.mjs
    - scripts/check-docs-commands.mjs
    - scripts/check-docs-commands.test.mjs
    - README.md
  modified:
    - app/server/.env.example
    - app/server/README.md
    - AGENTS.md
    - scripts/verify.mjs

key-decisions:
  - "Optional keys with a code default are commented in the examples; only DATABASE_URL, AUTH_JWT_SECRET (and API_ORIGIN, NODE_ENV, PORT, ALLOWED_ORIGIN, which match the placeholder list) are uncommented, so the placeholder rule needs no widening"
  - "AUTH_JWT_SECRET is an empty value, not a change-me string: a copied example must fail loudly instead of running with a guessable secret"
  - "Non-key findings (missing example, no keys, missing source, empty allowlist reason) use an empty key so they sort first within a workspace"
  - "When the example file is missing or has no keys, the key rules are skipped for that workspace to avoid a wall of undocumented noise next to the one real error"
  - "extractYarnCommands reads only inline code and fenced blocks; trailing punctuation is stripped from the script token so `yarn verify: OK` counts as yarn verify"

patterns-established:
  - "New environment key in server or web code -> add it to the matching .env.example or the allowlist with a reason, or yarn verify fails at env-contract"
  - "A yarn command written in README.md, app/server/README.md or AGENTS.md must resolve, or yarn verify fails at docs-commands"

requirements-completed: [VER-06, VER-07]

coverage:
  - id: D1
    description: "app/server/.env.example and app/web/.env.example list every key the code reads, with placeholders only and Russian comments; the check passes on the real repository"
    requirement: VER-06
    verification:
      - kind: integration
        ref: "node scripts/check-env-contract.mjs -> 'check-env-contract: OK'"
        status: pass
      - kind: other
        ref: "grep -nE 'eyJ|sb_|supabase\\.co|pooler\\.' app/server/.env.example app/web/.env.example prints nothing; DOCS_ROOT absent"
        status: pass
    human_judgment: false
  - id: D2
    description: "env-contract check fails on undocumented, unused, unsafe, non-placeholder and duplicate keys, missing or empty examples, stable sort; allowlisted keys are exempt; real env files are never read"
    requirement: VER-06
    verification:
      - kind: unit
        ref: "node --test scripts/check-env-contract.test.mjs (17/17)"
        status: pass
    human_judgment: false
  - id: D3
    description: "docs-commands check resolves yarn commands against root scripts, the named workspace only, built-ins and root devDependency binaries; README must show yarn verify and yarn e2e; missing doc file is an error; stable file/line order"
    requirement: VER-07
    verification:
      - kind: unit
        ref: "node --test scripts/check-docs-commands.test.mjs (8/8)"
        status: pass
      - kind: integration
        ref: "node scripts/check-docs-commands.mjs -> 'check-docs-commands: OK'"
        status: pass
    human_judgment: false
  - id: D4
    description: "Both checks run inside yarn verify in the order lockfile, env-contract, docs-commands, lint-typecheck-test, migrations, script-tests"
    requirement: VER-06
    verification:
      - kind: integration
        ref: "yarn verify -> exit 0, all six steps passed, 'yarn verify: OK'"
        status: pass
    human_judgment: false
  - id: D5
    description: "Root README.md (Russian), short app/server/README.md (Russian, five templates, no route list) and AGENTS.md routing give a newcomer or agent the right entry point and never point development or tests at the live database"
    requirement: VER-07
    verification:
      - kind: other
        ref: "plan Task 2 verify one-liners (README commands, postgresql@17, AGENTS.md sections, CLAUDE.md == @AGENTS.md, five templates) all pass"
        status: pass
    human_judgment: true
    rationale: "Prose quality, order of onboarding steps and absence of misleading safety advice need a human read-through (plan Task 2 human-check)"

# Metrics
duration: 20min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 13: Env contract, docs commands, onboarding docs Summary

**Both apps now have value-free `.env.example` files that an allowlisted check (`env-contract`) keeps in sync with every `process.env` read and the web zod schema; a second check (`docs-commands`) fails when README.md, app/server/README.md or AGENTS.md mention a yarn script that does not exist; both run inside `yarn verify`, which still ends with `yarn verify: OK`. A Russian root README, a short Russian server README and the AGENTS.md commands/scope/routing sections give newcomers and agents one accurate entry point.**

## Performance

- **Duration:** about 20 min
- **Started:** about 2026-10-03T09:07Z (approximate, back-computed from the duration)
- **Completed:** 2026-10-03T09:27Z
- **Tasks:** 3/3
- **Files:** 7 created, 4 modified (nothing deleted)

## Accomplishments

- **Env contract (Task 1, TDD).** `checkEnvContract({ workspaces, config })` collects `process.env.NAME` / `process.env['NAME']` over `.ts .tsx .js .mjs .cjs .mts .cts` (skipping `node_modules .next dist .turbo coverage`, sorted walk) and the zod keys of `app/web/lib/env/server.ts` (regex, the file imports `server-only`). It parses uncommented and commented example entries, then applies: undocumented, unused, duplicate (commented plus uncommented counts), unsafe value (`eyJ`, `sb_`, `supabase.co/.com`, `pooler.`, any 32+ run of `[A-Za-z0-9+/=_-]`; also on commented lines), not-a-placeholder (uncommented only), a required zod key left commented, missing or empty example, missing source root, allowlist entry without reason. Messages never contain values. The CLI prints `check-env-contract: OK` or the findings and exits 1; it opens only source files, `.env.example` and the config JSON.
- **Allowlist.** `app/server`: `NODE_ENV`, `VERCEL`, `E2E_SEED_FILE`, `BIO_EXAM_ISOLATED_ENV`, `TEST_DATABASE_URL`, each with a reason (the last two are read through the guard module's parameter). `app/web`: `NODE_ENV`. `CI`, named in the plan, is not read by either workspace so it was not added.
- **Examples.** The server example has the sections Общее, База данных, Авторизация, Хранилище файлов, Тесты и изоляция; all 33 server keys of research Pattern 8 plus `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`, `TEST_DATABASE_URL`, `BIO_EXAM_ISOLATED_ENV`. `DOCS_ROOT` and the pooler example line are gone; a warning says `DATABASE_URL` must be local. The web example (new) follows the zod schema plus the direct reads and notes that `DATABASE_URL` and `AUTH_JWT_SECRET` leave web in Phase 4 (ADR-0001).
- **Docs (Task 2).** `README.md`: what it is, prerequisites (Node 24 via `.nvmrc`, Corepack/Yarn 4.12, `brew install postgresql@17`), install, env setup with the live-database warning, `yarn dev`, `yarn verify` (six steps), the `with-test-db` wrapper, `yarn e2e` (`yarn playwright install chromium` first), layout, conventions. `app/server/README.md`: API areas table (10 rows), access rules, the five templates, run/migrate/seed commands, tests, pointer to CodeGraph. `AGENTS.md`: `## Project commands`, `## Scope and safety`, `## Routing` appended (34 lines added, 0 removed, CodeGraph section untouched, English). `CLAUDE.md` untouched.
- **Docs-commands check and wiring (Task 3, TDD).** `extractYarnCommands` reads inline code and fenced blocks (prompts, trailing comments, `&&` chains and `node ... yarn ...` wrappers handled). `checkDocsCommands({ files, packages })` resolves root scripts, `yarn workspace <name> <script>` against that workspace only, built-ins, and root devDependency binaries (derived from `node_modules/<dep>/package.json` `bin`: turbo, oxfmt, playwright). `scripts/verify.mjs` got the two steps right after `lockfile` and its header comment was renumbered.

## Task Commits (ready to commit - not committed)

Per the standing rule nothing was committed or staged (`git diff --cached --name-only` empty, `git rev-list --count 11b2916..HEAD` = 0, HEAD still `11b2916`). Proposed commits in the user's style:

1. **Task 1: env examples and env-contract check.** `feat: Контракт окружения: .env.example для web и сервера и проверка env-contract`
   ```
   ?? app/web/.env.example
    M app/server/.env.example
   ?? scripts/check-env-contract.mjs
   ?? scripts/env-contract.config.json
   ?? scripts/check-env-contract.test.mjs
   ```
2. **Task 2: onboarding docs.** `docs: Корневой README на русском, краткий README сервера и команды и маршрутизация в AGENTS.md`
   ```
   ?? README.md
    M app/server/README.md
    M AGENTS.md
   ```
3. **Task 3: docs-commands check and verify wiring.** `feat: Проверка команд yarn в документации и шаги env-contract и docs-commands в yarn verify`
   ```
   ?? scripts/check-docs-commands.mjs
   ?? scripts/check-docs-commands.test.mjs
   ?? scripts/verify.mjs      (untracked as a whole: created by 01-10, this plan adds two STEPS entries and the header lines)
   ```
`scripts/` is untracked as a whole (earlier waves), so stage per file. `yarn.lock` and root `package.json` were not touched by this plan.

**Plan metadata:** not committed (`commit_docs: false`, `.planning/` gitignored).

## TDD Gate (no-commit mode)

- **Task 1 RED:** `node --test scripts/check-env-contract.test.mjs` exited 1 before the module existed (`tests 1, fail 1`, ESM resolution error for `./check-env-contract.mjs`). **GREEN:** 17/17. One correction on the way: my own expected sort order for the multi-workspace test was wrong (sort is by key, so `X` precedes `Y`); the implementation was right.
- **Task 3 RED:** `node --test scripts/check-docs-commands.test.mjs` exited 1 before the module existed (`tests 1, fail 1`). **GREEN:** 8/8.
- **REFACTOR:** oxfmt `--check` clean on all new or changed code and doc files.

## Verification record

- `node --test scripts/check-env-contract.test.mjs scripts/check-docs-commands.test.mjs` -> 25 tests, 25 pass, 0 fail.
- Before the examples were rewritten, `node scripts/check-env-contract.mjs` on the stale server example reported 22 findings (undocumented token lifetimes, `LOG_LEVEL`, `JSON_BODY_LIMIT`, `PG_FORCE_SSL`, `RBAC_DB_FAIL_OPEN`, `SUPABASE_*`, `STORAGE_*`, password-hash keys; unused `DOCS_ROOT`; unsafe `AUTH_JWT_SECRET`; missing web example): the check detects the exact drift the plan describes. After: `check-env-contract: OK`.
- `node scripts/check-docs-commands.mjs` -> `check-docs-commands: OK`.
- Acceptance greps: `grep -nE "eyJ|sb_|supabase\.co|pooler\." app/server/.env.example app/web/.env.example` prints nothing; `grep -nE "['\"]\.env['\"]|/\.env['\"]" scripts/check-env-contract.mjs` prints nothing; `DOCS_ROOT` absent; both allowlist reasons present; web example has `AUTH_JWT_SECRET=` and `API_ORIGIN=`.
- Task 2 one-liners: README has `yarn verify`, `yarn e2e`, `postgresql@17`; AGENTS.md has `## CodeGraph` and `## Project commands`; `test "$(cat CLAUDE.md)" = "@AGENTS.md"` passes; `git diff --numstat AGENTS.md` = `34 0`; the server README names all five templates and has no list over 25 entries.
- `yarn verify` -> exit 0:
  ```
  verify summary:
    lockfile: passed
    env-contract: passed
    docs-commands: passed
    lint-typecheck-test: passed
    migrations: passed
    script-tests: passed
  yarn verify: OK
  ```
- e2e interaction (new `app/web/.env.example`): `webEnvFileKeys` in `scripts/lib/e2e-web-env.mjs` skips `*.example` files, so the new example cannot add keys to the next-env guard. Measured: `webEnvFileKeys('app/web')` returns only the keys of the local `.env` (names, not the example's `NEXTAUTH_*`/`PG_*`/`APP_ORIGIN`), and `node --test scripts/lib/e2e-web-env.test.mjs` passes 16/16 including the existing '.env.example keys are ignored' case. `yarn e2e` itself was not run (outside `yarn verify` by design, and slow); no guard change was needed.
- No `bio-exam-pg-*` directory left in `$TMPDIR`. STATE.md, ROADMAP.md, REQUIREMENTS.md, CLAUDE.md and every real `.env` untouched; no `.env` value was printed (only key names were read, via the grep-for-names commands and the check itself, which opens no `.env`).

## Files Created/Modified

- `app/web/.env.example` (new), `app/server/.env.example` (rewritten): the env contract.
- `scripts/check-env-contract.mjs`, `scripts/env-contract.config.json`, `scripts/check-env-contract.test.mjs`: the env-contract check, its allowlist/workspace config and 17 tests.
- `scripts/check-docs-commands.mjs`, `scripts/check-docs-commands.test.mjs`: the docs command check and 8 tests.
- `README.md` (new), `app/server/README.md` (rewritten), `AGENTS.md` (3 sections appended).
- `scripts/verify.mjs`: two STEPS entries and the renumbered header.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Extra rule: a required zod key must not be commented**
- **Found during:** Task 1
- **Issue:** the plan's truth says required keys are uncommented, but no behaviour line enforced it; a required web key could silently be commented out.
- **Fix:** `required key is commented: KEY` finding, based on the zod schema (no `.optional()`/`.default()`), with a test.
- **Files modified:** scripts/check-env-contract.mjs, scripts/check-env-contract.test.mjs

**2. [Additional] Fail-closed extras**
- A missing source root (`missing source: <path>`) and an allowlist entry without a reason are findings, so a moved folder or a bare allowlist cannot make the check pass vacuously.

**3. [Additional] `CI` not allowlisted**
- The plan lists `CI` among the platform keys, but no code in either workspace reads it, so an entry would be dead config. Add it with a reason if a later change reads `process.env.CI` inside a workspace.

---

**Total deviations:** 1 auto-fixed (missing critical) plus 2 small additions.
**Impact on plan:** none on scope. No install, no real `.env` opened, no database touched outside the harness (`yarn verify` used its own disposable PostgreSQL 17).

## Issues Encountered

None blocking. A BSD `sed -i` call failed once on AGENTS.md (a macOS flag difference); the change was applied with a Python replace instead. A temporary output file in the system temp directory was removed.

## Known Stubs

None.

## Threat Flags

None. T-1-31: the placeholder and secret-pattern rules run in `yarn verify`; acceptance grep on both examples is empty. T-1-32: the check reads only source files, `.env.example` and its config; a test plants a real env file with unsafe content in a fixture workspace and asserts it is ignored, and another asserts the script source has no literal path to such a file. T-1-33: README and AGENTS.md say development, tests and migrations target local `test_*` databases and that the live pooler URL must not be used. T-1-SC: no installs.

## User Setup Required

None. Optional: `NEXT_IGNORE_INCORRECT_LOCKFILE` in your local `app/web/.env` is obsolete (README says so); this plan did not touch any `.env`.

Human check still open (plan Task 2): read `README.md` as a newcomer through `yarn verify` and confirm the Russian text and the step order make sense.

## Next Phase Readiness

- 01-14 (format commit): the new `.mjs`, `.json` and `.md` files are already oxfmt-clean. README currently describes `.git-blame-ignore-revs` as a future convention (the file does not exist until the user records the hash).
- 01-15 (CI): `yarn verify` now has six steps; the CI job only needs to call `yarn verify`. The format-check step planned there goes between the static checks and `lint-typecheck-test`.
- Any later plan that adds an environment key or a documented yarn command must update the example or the doc in the same change, or `yarn verify` fails.

---
*Phase: 01-verification-baseline*
*Completed: 2026-10-03*

## Self-Check: PASSED

- Files exist: app/web/.env.example, app/server/.env.example, scripts/check-env-contract.mjs, scripts/env-contract.config.json, scripts/check-env-contract.test.mjs, scripts/check-docs-commands.mjs, scripts/check-docs-commands.test.mjs, README.md, app/server/README.md, AGENTS.md, scripts/verify.mjs.
- Commits: none, by rule (`commits: 0` measured, HEAD still `11b2916`, nothing staged).
- Plan verify commands re-run in final form: both node test files 25/25; both CLIs print OK; `yarn verify` exit 0 with `yarn verify: OK`; project root pin matched.
- STATE.md, ROADMAP.md and REQUIREMENTS.md were not modified.
