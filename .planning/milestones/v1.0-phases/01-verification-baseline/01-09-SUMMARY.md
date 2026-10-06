---
phase: 01-verification-baseline
plan: 09
subsystem: testing
tags: [playwright, e2e, next-env, isolation, seed, postgres, local-storage, node-test]

# Dependency graph
requires:
  - phase: 01-verification-baseline
    provides: "01-01 withTestDatabase / isolatedChildEnv / isolation-probe / assertTestDatabaseUrl; 01-02 @playwright/test 1.63.0 pin; 01-06 rbac built by tsdown, web build placeholders; 01-07 StorageService local mode (STORAGE_DRIVER=local + STORAGE_LOCAL_DIR), Supabase lock-out"
provides:
  - "yarn e2e (scripts/e2e.mjs): rbac build -> disposable PostgreSQL 17 + test_e2e_* scratch DB -> real migration runner -> deterministic seed -> Express isolation probe -> next-env guard -> next build with the e2e API origin -> Playwright (Express + Next as webServer) -> full teardown, also on SIGINT"
  - "yarn e2e flags: --seed-only (stop after the seed), --no-build (needs explicit E2E_API_PORT/E2E_WEB_PORT matching the build), any other args go to playwright test"
  - "scripts/lib/e2e-web-env.mjs: buildWebEnv (the one definition of the Next e2e env), webEnvFileKeys (names only), assertWebEnvClosed, CLI --check printing next-env-guard: OK"
  - "app/server/src/scripts/e2e-seed.ts: 8 active users, 1 topic, 8 tests, 16 questions with answer keys v1, assignments, 16 prompt.md files in local storage, search documents"
  - "e2e/fixtures/seed.json + accounts.ts: per-project (desktop/mobile) accounts and tests; helpers projectKeyFromName, sessionAccount, loginAccount, seedTest, storageStatePath"
  - "e2e/playwright.config.ts: projects setup, chromium-desktop (Desktop Chrome), chromium-mobile (Pixel 7); fails closed outside yarn e2e"
  - "e2e/auth.setup.ts (one login per storage-state account), e2e/tests/auth.spec.ts (@smoke + D-14 flow 1 @flow1)"
affects: [01-10, 01-11, 01-15, ci, e2e]

# Actuals (#2632) — chars/4 over the files this plan created (byte count; Cyrillic text inflates it)
actuals:
  tokens: 15420
  tasks: 3
  commits: 0
plan_head_before: 11b291649c54eec9678edf0a441232a92b631197
plan_head_after: 11b291649c54eec9678edf0a441232a92b631197

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Next e2e env is explicit and closed: one buildWebEnv object for next build and next start; every key name in app/web/.env* must already be set so @next/env has nothing to fill"
    - "Guard output is 'KEY: reason' per line, names only: no URL, host, database name or secret value is ever printed"
    - "Playwright runs from the wrapper through node <repo>/node_modules/@playwright/test/cli.js (no yarn shim), so SIGINT reaches it directly and its webServers die with it"
    - "Per-project fixtures (<name>-desktop / <name>-mobile) so the two Playwright projects never share mutable data; storage-state accounts log in once per run"

key-files:
  created:
    - scripts/e2e.mjs
    - scripts/lib/e2e-web-env.mjs
    - scripts/lib/e2e-web-env.test.mjs
    - app/server/src/scripts/e2e-seed.ts
    - e2e/fixtures/seed.json
    - e2e/fixtures/accounts.ts
    - e2e/playwright.config.ts
    - e2e/auth.setup.ts
    - e2e/tests/auth.spec.ts
  modified:
    - package.json
    - .gitignore

key-decisions:
  - "NEXT_IGNORE_INCORRECT_LOCKFILE is pinned to '1', not '' as the plan's behaviour list said: with an empty value next build and next start try to patch the lockfile and shell out to 'yarn config get registry' (a registry lookup) on every run"
  - "The guard never prints the host or database name of a rejected DATABASE_URL (only 'host is not localhost or 127.0.0.1' / 'database name does not match ...'), because a decoy pooler host is itself a live value that must not appear"
  - "Seed points come from BUILTIN_QUESTION_TYPES correctPoints of each question's type key; the fixture carries both the DB type key (radio, checkbox, matching, short_answer, sequence) and the UI template"
  - "On mobile (Pixel 7, < 1024 px) the app renders no visible sidebar trigger; the flow-1 logout opens the sidebar Sheet with the app's own Ctrl+B shortcut and records an 'issue' annotation"
  - "The @smoke test is kept (cheap check that a saved student session reaches /dashboard)"

patterns-established:
  - "yarn e2e [playwright args]: e.g. yarn e2e --grep @flow1, yarn e2e --project setup"
  - "New e2e specs pick their accounts with projectKeyFromName(testInfo.project.name)"

requirements-completed: [VER-05, VER-03]

coverage:
  - id: D1
    description: "yarn e2e --seed-only on a fresh checkout (no packages/rbac/dist): builds rbac, creates test_e2e_*, migrates through the real runner, seeds active users, rows and local prompt files, tears everything down; deterministic count line"
    requirement: VER-05
    verification:
      - kind: integration
        ref: "rm -rf packages/rbac/dist; yarn e2e --seed-only -> exit 0, dist/index.js present, 'e2e-seed: users=8 tests=8 questions=16 prompts=16'"
        status: pass
      - kind: integration
        ref: "two consecutive yarn e2e --seed-only runs -> identical e2e-seed line (diff empty)"
        status: pass
      - kind: other
        ref: "ls -d $TMPDIR/bio-exam-pg-* $TMPDIR/bio-exam-e2e-storage-* | wc -l -> 0 after every run"
        status: pass
    human_judgment: false
  - id: D2
    description: "Closed Next environment and its guard: passes on the closed env (including a fixture .env with decoy live keys), fails naming the key for every violation, never prints a value; @next/env fill-but-never-override control"
    requirement: VER-05
    verification:
      - kind: unit
        ref: "node --test scripts/lib/e2e-web-env.test.mjs (16/16)"
        status: pass
      - kind: other
        ref: "plan Task 2 verify 2: env -i ... node scripts/lib/e2e-web-env.mjs --check -> exit 1, API_ORIGIN/DATABASE_URL/AUTH_JWT_SECRET lines, no s3cret, no OK line"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real-run isolation: Express probe (envLoadedFrom null, no SUPABASE_*, test_e2e_* database) and next-env-guard: OK before next build and as the first command of the Next webServer"
    requirement: VER-05
    verification:
      - kind: e2e
        ref: "yarn e2e --project setup -> '[e2e] isolation probe OK', 'next-env-guard: OK' and '[WebServer] next-env-guard: OK', 4 passed"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-14 flow 1 on chromium-desktop and chromium-mobile: anonymous /dashboard -> /login?callbackUrl=%2Fdashboard; student login + logout; admin login, /admin, logout"
    requirement: VER-03
    verification:
      - kind: e2e
        ref: "yarn e2e --grep @flow1 -> 10 passed (4 setup + 3 per project)"
        status: pass
      - kind: e2e
        ref: "yarn e2e --grep '@smoke|@flow1' -> 12 passed"
        status: pass
    human_judgment: false
  - id: D5
    description: "SIGINT to the wrapper during the Playwright stage stops both servers, drops the scratch DB, removes the storage dir and stops the cluster"
    requirement: VER-05
    verification:
      - kind: other
        ref: "scratchpad driver: SIGINT to node scripts/e2e.mjs after '[WebServer] Ready' -> exit 130; t+1s..t+8s no e2e processes; no bio-exam-pg-*/bio-exam-e2e-storage-* dirs; API port not listening"
        status: pass
    human_judgment: false
  - id: D6
    description: "Mobile users have no visible way to open the sidebar (user menu, logout); the test reaches it via Ctrl+B"
    verification: []
    human_judgment: true
    rationale: "Product/UX finding outside this plan's scope: whether to add a mobile SidebarTrigger is a user decision; the e2e flow passes but does not prove a touch-only user can log out"

# Metrics
duration: 16min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 09: Isolated e2e stack and D-14 flow 1 Summary

**`yarn e2e` now runs Playwright against a fully isolated stack. It builds rbac and starts a throwaway PostgreSQL 17 with a `test_e2e_*` database, migrates it through the real runner and loads a deterministic seed (8 active users, 16 questions, prompt files in a temp local store). An isolation probe then checks Express, and a tested guard proves that `next build` and `next start` get one closed environment that `app/web/.env` cannot add to. Login, logout and the protected-page redirect pass on Desktop Chrome and Pixel 7, and everything is torn down, even on SIGINT.**

## Performance

- **Duration:** about 16 min
- **Started:** 2026-10-03T07:55:44Z
- **Completed:** 2026-10-03T08:12:03Z
- **Tasks:** 3/3
- **Files:** 9 created, 2 modified

## Accomplishments

- **Seed and lifecycle (Task 1).** The wrapper runs `yarn workspace @bio-exam/rbac build` before any cluster starts, so a fresh checkout works: `rm -rf packages/rbac/dist && yarn e2e --seed-only` exits 0. Inside `withTestDatabase('test_e2e', …)` it picks free ports, creates `bio-exam-e2e-storage-*` and builds the child env with `isolatedChildEnv` plus the test-only secret, cookie name and seed path. It deletes `NODE_ENV` from that env, then migrates and seeds. The seed has no dotenv import. It refuses to run unless the env is isolated, `STORAGE_DRIVER=local` and `E2E_SEED_FILE` is set, and it imports db modules only after that check. All rows go in one transaction, users with `isActive: true`. After commit it writes `prompt.md` files through `storageService` and upserts search documents, mirroring the create handler.
- **Closed web env and guard (Task 2, TDD).** `buildWebEnv` is the single source for build and start. The guard checks `NODE_ENV`, `API_ORIGIN`, `DATABASE_URL` (equal to `TEST_DATABASE_URL` and passing the localhost + `test_` guard), the `e2e-only-` secret marker, no `SUPABASE_*`, and that every key name in `app/web/.env*` (except `*.example`) is present. It runs before `next build` (wrapper) and as the first command of the Next webServer. The wrapper also runs `isolation-probe.ts` with the Express env and fails the run unless the probe reports `envLoadedFrom: null`, no Supabase vars and a `test_e2e_*` database.
- **Playwright (Task 2).** The config fails closed outside `yarn e2e`; `yarn playwright test --config e2e/playwright.config.ts --list` alone exits 1 with "start e2e through yarn e2e". There are three projects, `setup`, `chromium-desktop` and `chromium-mobile`. Express runs with `NODE_ENV=development` plus DB enforcement flags; Next takes `E2E_WEB_ENV` verbatim. `auth.setup.ts` logs each storage-state account in once through the web origin and asserts the session cookie.
- **Flow 1 (Task 3).** Anonymous redirect, student login/logout and admin login → `/admin` → logout pass on both projects, plus the `@smoke` test.

## Task Commits (ready to commit — not committed)

Per the standing rule nothing was committed or staged; `commits: 0` measured, HEAD still `11b2916`. Proposed commits in the user's style:

1. **Task 1: deterministic seed and isolated DB/storage lifecycle.** `feat: Детерминированный сид и изолированный жизненный цикл yarn e2e`
   ```
   ?? app/server/src/scripts/e2e-seed.ts
   ?? e2e/fixtures/seed.json
   ?? e2e/fixtures/accounts.ts
   ?? scripts/e2e.mjs                 (shared with Task 2)
    M package.json                    (only the "e2e" script line is this plan's; the rest is 01-02/01-03/01-06)
   ```
2. **Task 2 (tdd): closed web env, guard, Playwright projects, per-account setup.** `feat: Закрытое окружение Next для e2e, проверка next-env и проекты Playwright`
   ```
   ?? scripts/lib/e2e-web-env.mjs
   ?? scripts/lib/e2e-web-env.test.mjs
   ?? e2e/playwright.config.ts
   ?? e2e/auth.setup.ts
   ?? scripts/e2e.mjs                 (shared with Task 1)
   ```
3. **Task 3: D-14 flow 1.** `test: Сквозной сценарий входа и выхода для десктопа и мобильного`
   ```
   ?? e2e/tests/auth.spec.ts
    M .gitignore                      (e2e/.auth/, test-results/, playwright-report/, blob-report/)
   ```
Single-commit alternative: `feat: Изолированный e2e-стенд на Playwright и сценарий входа и выхода`. `scripts/` and `package.json` also hold earlier waves' uncommitted work, so stage per file (`git add -p package.json`).

**Plan metadata:** not committed (`commit_docs: false`, `.planning/` gitignored).

## TDD Gate Compliance (Task 2, no-commit mode)

- **RED:** `e2e-web-env.test.mjs` written first against a stub module whose three exports throw `not implemented`. `node --test` gave exit 1: `tests 16, pass 2, fail 14`. The two passes were the `@next/env` control and the `@next/env` resolution check, which do not touch the module. Failures were the stub errors and assertions such as `buildWebEnv did not name TEST_DATABASE_URL`.
- **GREEN:** first implementation gave 15/16. The failing case caught a real leak: the guard echoed the decoy pooler host from `assertTestDatabaseUrl`. After host and database names were redacted from the reason: 16/16.
- **REFACTOR:** `NEXT_IGNORE_INCORRECT_LOCKFILE` changed to `'1'` (deviation 1), test expectations updated, and oxfmt applied. Still 16/16.

## Guard negative proof (Task 2 step 7, real CLI)

`env -i PATH=… NODE_ENV=production API_ORIGIN=http://127.0.0.1:4000 DATABASE_URL=postgres://u:<pw>@db.example.invalid:5432/test_x E2E_API_PORT=4999 E2E_WEB_PORT=4998 TEST_DATABASE_URL=postgres://u@127.0.0.1:5432/test_x AUTH_JWT_SECRET=not-the-e2e-secret node scripts/lib/e2e-web-env.mjs --check` → exit 1:

```
next-env-guard: FAILED
API_ORIGIN: does not equal the e2e Express origin on 127.0.0.1 port 4999
DATABASE_URL: does not equal TEST_DATABASE_URL
DATABASE_URL: rejected by the test database guard (host is not localhost or 127.0.0.1)
AUTH_JWT_SECRET: does not carry the e2e-only- test marker
NEXT_IGNORE_INCORRECT_LOCKFILE: defined in .env but not set, @next/env would fill it from the file
SESSION_COOKIE_NAME: defined in .env but not set, @next/env would fill it from the file
```

No URL, password or secret value appears. The last two lines come from the real `app/web/.env` key names, which shows the key-presence rule working on the developer's file.

## @smoke run (Task 3 step 0)

`yarn playwright install chromium` exited 0. Chromium 1243, which matches 1.63, was already cached, so nothing new was downloaded. `yarn e2e --grep @smoke` → `6 passed`: 4 setup logins, then `student session opens the dashboard without a login form @smoke` on `chromium-desktop` (783 ms) and `chromium-mobile` (371 ms). The smoke test is **kept**, tagged `@smoke`.

## Verification Results

- Task 1 verify (`rm -rf packages/rbac/dist; yarn e2e --seed-only …`): exit 0, `e2e-seed: users=8 tests=8 questions=16 prompts=16`. Two consecutive runs gave the same line.
- `yarn workspace @bio-exam/server typecheck`: exit 0.
- `node --test scripts/lib/e2e-web-env.test.mjs`: 16/16.
- Guard negative CLI (Task 2 verify 2): pass.
- `yarn e2e --project setup`: exit 0. `next-env-guard: OK` appears twice (build step and `[WebServer]`), `4 passed`, and `e2e/.auth/{student,admin}-{desktop,mobile}.json` were written.
- `yarn e2e --seed-only` after all stages were added: exit 0.
- `yarn e2e --grep @flow1`: 10 passed. `yarn e2e --grep "@smoke|@flow1"`: 12 passed (8 chromium tests, 4 per project).
- `--no-build`: without explicit ports it exits 1 with a clear message; with `E2E_API_PORT/E2E_WEB_PORT` matching the previous build, `--grep @smoke` passes (6).
- SIGINT (wrapper only, during Playwright): exit 130. `[test-db] SIGINT: cleaning up` ran; no e2e process was left at t+1s…t+8s, no temp dirs remained, and the API port was closed.
- `ls -d $TMPDIR/bio-exam-pg-* $TMPDIR/bio-exam-e2e-storage-* | wc -l` → 0 after every run.
- Acceptance greps:
  - `dotenv` in the seed: 0.
  - `isActive` in the seed: 2.
  - The comment-filtered `DATABASE_URL: process.env.DATABASE_URL|SUPABASE_URL` grep over `scripts/e2e.mjs` prints nothing.
  - `process.env.DATABASE_URL` in the config: 0. `NODE_ENV: 'development'` in the config: 1.
  - `waitForTimeout|setTimeout` in the spec: 0.
  - `.gitignore` contains `e2e/.auth/`.
- oxfmt `--check` passes on all 9 new files. oxlint reports 0 warnings on them. An ad-hoc `tsc --noEmit --strict` over the four e2e TS files passes.

## Flagged assumptions resolved

- **Rewrites are baked at build time:** yes. `next.config` prints the build-time `API_ORIGIN` during `next build`, and `--no-build` works only with the same ports. `--no-build` stays opt-in.
- **`devices['Pixel 7']`** exists in 1.63 and is used as is.
- **Guard-prefixed webServer command:** Playwright's shell accepts `node … --check && yarn workspace @bio-exam/web start …`, and `[WebServer] next-env-guard: OK` appears before Next starts. No fallback was needed.
- **Grep and dependencies:** `--grep @flow1` / `--grep @smoke` still run the `setup` dependency project. Its tests carry no tags.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `NEXT_IGNORE_INCORRECT_LOCKFILE` pinned to `'1'` instead of `''`**
- **Found during:** Task 2 (first `yarn e2e --project setup`)
- **Issue:** With an empty value, `next build` and `next start` both printed "Found lockfile missing swc dependencies, patching…" and ran `yarn config get registry`, which is the first step of a registry fetch, failing with a stack trace on every run.
- **Fix:** `buildWebEnv` returns `'1'`. The key is still pinned, so `@next/env` fills nothing. The "empty value counts as present" behaviour is now tested explicitly with empty overrides.
- **Files modified:** scripts/lib/e2e-web-env.mjs, scripts/lib/e2e-web-env.test.mjs
- **Verification:** `grep -c "lockfile\|registry"` on the setup output is 0; 16/16 tests pass.

**2. [Rule 2 - Missing critical] Guard reasons redact the host and database name**
- **Found during:** Task 2 GREEN
- **Issue:** The plan allowed the reason to carry the host or DB name that `assertTestDatabaseUrl` reports. The behaviour list, though, requires that no decoy value (a pooler-style host) appears, and the test caught the host leaking.
- **Fix:** `guardReason` maps the guard error to a class of violation (`host is not localhost or 127.0.0.1`, `database name does not match …`, `protocol …`).
- **Files modified:** scripts/lib/e2e-web-env.mjs

**3. [Rule 1 - Bug] Playwright started through node, not the yarn shim**
- **Found during:** Task 3 SIGINT check
- **Issue:** With `yarn playwright test`, a SIGINT to the wrapper left the Express webServer alive for several seconds after the wrapper exited. Express's own graceful shutdown waits 5 s.
- **Fix:** the wrapper spawns `node <repo>/node_modules/@playwright/test/cli.js test …`. Re-test: no e2e process remained at t+1s.
- **Files modified:** scripts/e2e.mjs

**4. [Rule 2 - Missing critical] Wrapper-level signal handling for the storage dir and the active child**
- **Found during:** Task 1
- **Issue:** `withTestDatabase`'s SIGINT handler calls `process.exit` after dropping the DB, which skips the wrapper's `finally`, so the storage temp dir would be left behind.
- **Fix:** while the stack is up, a wrapper handler forwards the signal to the active child and removes the storage dir synchronously.
- **Files modified:** scripts/e2e.mjs

**5. [Rule 3 - Blocking] Locators: placeholder instead of label**
- **Found during:** Task 3
- **Issue:** The login inputs have no `<label>` and no `aria-label`, only placeholders (`Login`, `Пароль`), so `getByLabel` cannot match.
- **Fix:** `getByPlaceholder` for the two inputs; role locators everywhere else (`button 'Войти'`, `menuitem 'Выйти'`, the user-menu button by its accessible name).

**6. [Rule 3 - Blocking] Mobile user menu reached through Ctrl+B**
- **Found during:** Task 3
- **Issue:** Below 1024 px the sidebar is a closed Sheet, and no `SidebarTrigger` is rendered anywhere in the app. `AppLayout` has none, and `SidebarTrigger` exists only in `components/ui/sidebar.tsx`.
- **Fix:** on `chromium-mobile` the test presses the app's own `Ctrl+B` sidebar shortcut inside a `toPass` loop that checks visibility first, so a late hydration cannot double-toggle it. It also adds an `issue` annotation. No app code was changed. See D6 / Next Phase Readiness.

**7. [Additional] `NEXT_TELEMETRY_DISABLED=1` in the e2e child env**, so `next build`/`next start` make no telemetry calls during e2e.

---

**Total deviations:** 6 auto-fixed (2 bugs, 2 missing critical, 2 blocking) plus 1 small addition.
**Impact on plan:** all of them serve isolation, cleanup or the ability to run the flow. No application code was changed and no package was installed.

## Issues Encountered

- **Port collision during iteration:** a pinned-port run hit ports held by an unrelated project's Playwright on this machine (`/Volumes/T7/its/lifemy-doc`). Free-port selection, the default, avoids it. Pinned ports are only needed for `--no-build`.
- **`next build` overwrites `app/web/.next`** (gitignored) with the e2e build. A developer's local `next start` afterwards serves the e2e build until they rebuild.
- **zsh does not word-split unquoted variables.** My first oxfmt check over `$FILES` silently matched nothing; it was re-run with an explicit file list.
- `next.config.ts` prints `[next.config] API_ORIGIN: http://127.0.0.1:<port>` during the build. This is pre-existing logging of a loopback test value and was left as is.

## Known Stubs

None.

## Threat Flags

None beyond the register: T-1-25 (probe + seed refusal + isolated env), T-1-26 (local storage, no Supabase), T-1-27 (test-only values in `seed.json`/`e2e.mjs`, never written to any `.env`) and T-1-28 (closed web env + guard + node:test) are mitigated as planned. T-1-SC: only `yarn playwright install chromium`, which downloaded nothing.

## User Setup Required

None. PostgreSQL 17 (Homebrew) and the Chromium 1243 browser are already present locally. CI needs `playwright install --with-deps chromium` (01-15).

## Next Phase Readiness

- 01-11 can add `take-test`, `review` and `authoring` specs. The fixtures `all-templates-<p>`, `review-d1-<p>`, `seq-d2-<p>` (`sequence_digits`, key `1243`) and `authoring-<p>` (empty, unpublished) exist. `seedTest(projectKey, prefix)` returns them. Question ids are generated at seed time, so 01-11 should look questions up by prompt text or by the fixture `key` if it adds one to the DB.
- 01-15 (CI) can run `yarn e2e`. It needs `CI=1` (list reporter, `forbidOnly`) and a PostgreSQL 17 service via `TEST_DATABASE_URL`, which `withTestDatabase` already honours.
- 01-10 (`yarn verify`): `scripts/lib/e2e-web-env.test.mjs` runs only through an explicit `node --test`. Turbo's workspace-scoped `yarn test` does not pick up root `.test.mjs` files, so `yarn verify` must call `node --test scripts/lib/e2e-web-env.test.mjs` next to `scripts/check-migrations.test.mjs`, or the guard's tests drop out of the gate.
- **For the user** (also logged in `deferred-items.md`): the mobile layout has no visible way to open the sidebar, so a touch-only user cannot reach the profile or logout. This is worth a UI fix in a later phase. The e2e test will then switch from `Ctrl+B` to the trigger.

---
*Phase: 01-verification-baseline*
*Completed: 2026-10-03*

## Self-Check: PASSED

- `[ -f ]` loop run after writing this file: FOUND for all 9 created files (`scripts/e2e.mjs`, `scripts/lib/e2e-web-env.mjs`, `scripts/lib/e2e-web-env.test.mjs`, `app/server/src/scripts/e2e-seed.ts`, `e2e/fixtures/seed.json`, `e2e/fixtures/accounts.ts`, `e2e/playwright.config.ts`, `e2e/auth.setup.ts`, `e2e/tests/auth.spec.ts`); `package.json` has `"e2e": "node scripts/e2e.mjs"`; `.gitignore` has the four Playwright entries.
- Commits: none by rule. `git rev-list --count 11b2916..HEAD` = 0, and the changes sit in the working tree on purpose.
- Every plan verify command passed in its final form (see Verification Results). STATE.md, ROADMAP.md and REQUIREMENTS.md were not modified.
