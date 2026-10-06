---
phase: 01-verification-baseline
plan: 04
subsystem: testing
tags: [vitest, web, getServerMe, vi.mock, test-port]

requires:
  - phase: 01-verification-baseline
    provides: "01-02 vitest 5.0.3 / vite 8.3.2 installed in app/web; 01-03 server/rbac Vitest pattern and root turbo test task"
provides:
  - "app/web/vitest.config.ts: node env, include **/*.test.ts, alias '@' -> app/web root"
  - "app/web test script (vitest run); yarn workspace @bio-exam/web test runs 8 files, 33 tests"
  - "7 simple web tests ported with unchanged assertions"
  - "getServerMe.test.ts rebuilt on vi.mock / vi.stubEnv / vi.stubGlobal instead of the node:vm recompile harness (D-19)"
affects: [01-05, 01-06, 01-10, 01-16]

actuals:
  tokens: 9000
  tasks: 2
  commits: 0
plan_head_before: 11b291649c54eec9678edf0a441232a92b631197
plan_head_after: 11b291649c54eec9678edf0a441232a92b631197

tech-stack:
  added: []
  patterns:
    - "Web port pattern: keep node:assert/strict, add import { test } from 'vitest', wrap each top-level scenario in test() with a Russian name"
    - "vi.hoisted holders (cookie, getMeData spy) feeding vi.mock factories; per-scenario vi.resetModules + vi.stubEnv + vi.stubGlobal('fetch'), cleaned in afterEach"

key-files:
  created:
    - app/web/vitest.config.ts
  modified:
    - app/web/package.json
    - "app/web/app/(internal)/(protected)/admin/tests/lifecycle.test.ts"
    - app/web/components/tests/attempt-review/AttemptQuestionsList.test.ts
    - app/web/components/tests/attempt-review/attempt-review-utils.test.ts
    - app/web/components/tests/telemetry.test.ts
    - app/web/lib/auth/loginRedirect.test.ts
    - app/web/lib/auth/sessionCookie.test.ts
    - app/web/lib/mdx/normalizeSource.test.ts
    - app/web/lib/auth/getServerMe.test.ts

key-decisions:
  - "The two harness-only guards (assert.ok(name in dependencies, 'Unexpected dependency')) are dropped: with vi.mock an unmocked import resolves to the real module, so there is no shim to police. This is the only assert. removed (23 -> 21)."
  - "Local-mode 'localImports' counter becomes holders.getMeData.mock.calls.length, as the plan prescribes; the mock is reset in every scenario."
  - "API_ORIGIN is stubbed in every scenario (vi.stubEnv with undefined removes it), so a shell-level API_ORIGIN never leaks into local-mode scenarios."

requirements-completed: [VER-01]

coverage:
  - id: D1
    description: "Web Vitest config with the @ alias and a test script; all 8 tracked web test files run under Vitest"
    requirement: VER-01
    verification:
      - kind: other
        ref: "yarn workspace @bio-exam/web test -> 8 files, 33 tests passed"
        status: pass
    human_judgment: false
  - id: D2
    description: "Seven simple web tests ported with every assertion kept (assert. count identical per file)"
    requirement: VER-01
    verification:
      - kind: other
        ref: "git show HEAD:<file> vs working tree, grep -c 'assert\\.': 3/3, 7/7, 4/4, 5/5, 2/2, 4/4, 4/4"
        status: pass
    human_judgment: true
    rationale: "Prohibition 'no assertion meaning changed' is verification: judgment; counts are mechanical support, a reviewer should skim the git diff"
  - id: D3
    description: "getServerMe.test.ts ported from the vm harness to vi.mock with the same scenario groups and expectations"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "app/web/lib/auth/getServerMe.test.ts (14 tests passed); mutation checks: local fallback on API denial -> 3 failures, cache 'force-cache' -> 1 failure"
        status: pass
    human_judgment: true
    rationale: "Prohibition 'no scenario weakened' is verification: judgment; the mapping table below is the evidence to review"

duration: 12min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 04: Web Vitest config, seven ported web tests, getServerMe on vi.mock Summary

**All eight tracked `app/web` test files (33 tests) now run under Vitest 5.0.3 with the `@` alias, and `getServerMe.test.ts` no longer recompiles source through `node:vm`/`transpileModule`: it uses `vi.mock` for `server-only`, `react`, `next/headers`, `next/navigation`, `getMeData` and the profile page component, plus `vi.stubEnv('API_ORIGIN')` and `vi.stubGlobal('fetch')`.**

## Performance

- **Duration:** about 12 min
- **Started:** 2026-10-03T06:45Z (approx.)
- **Completed:** 2026-10-03T06:58Z
- **Tasks:** 2/2
- **Files:** 1 created, 9 modified

## Accomplishments

- `app/web/vitest.config.ts`: `resolve.alias['@']` = app/web root (mirrors tsconfig `@/*`), `environment: 'node'`, `include: ['**/*.test.ts']`, `exclude: ['**/node_modules/**', '.next/**']`. No `globals`, no `passWithNoTests`.
- `app/web/package.json`: `"test": "vitest run"` (other scripts untouched).
- Seven simple tests ported: every original top-level scenario wrapped in its own `test()` (Russian names, like the server ports); the originals had no PASS log lines.
- `getServerMe.test.ts` rebuilt: no `node:vm`, `typescript`, `node:module`, `compile`/`load` helpers.
- Prettier (existing config) run over all eight touched files plus `vitest.config.ts`: all reported "unchanged", so oxfmt parity in 01-06 is not disturbed.

## Assertion counts (`assert.` calls, HEAD vs ported)

| File | Before | After | Tests |
|------|--------|-------|-------|
| `app/(internal)/(protected)/admin/tests/lifecycle.test.ts` | 3 | 3 | 3 |
| `components/tests/attempt-review/AttemptQuestionsList.test.ts` | 7 | 7 | 3 |
| `components/tests/attempt-review/attempt-review-utils.test.ts` | 4 | 4 | 1 |
| `components/tests/telemetry.test.ts` | 5 | 5 | 5 |
| `lib/auth/loginRedirect.test.ts` | 2 | 2 | 1 |
| `lib/auth/sessionCookie.test.ts` | 4 | 4 | 3 |
| `lib/mdx/normalizeSource.test.ts` | 4 | 4 | 3 |
| `lib/auth/getServerMe.test.ts` | 23 | 21 | 14 |

`getServerMe.test.ts`: the 2 removed calls are the harness guards `assert.ok(name in dependencies, ...)` (one in `scenario`, one in `profile`), which police the hand-written `require` shim and have no meaning under `vi.mock`. All 21 behavioural assertions are carried over with the same expected values.

## getServerMe scenario mapping (original `main()` vs new test)

| Original scenario (vm harness) | New Vitest test |
|---|---|
| API accepts session at `https://api.example.test`: `me` equals user, profile page resolves, 0 local imports, URL `.../api/auth/me`, `cache 'no-store'`, `redirect 'error'`, cookie header forwarded, `isAuthenticated() === true` | `getServerMe: сессия принята API, профиль открывается, локальная реализация не вызывается` |
| Trailing-slash origin normalised to `.../api/auth/me` | `getServerMe: завершающий слэш в API_ORIGIN нормализуется` |
| Empty cookie + `{ ok: false }`: `me === null`, cookie header `''` | `getServerMe: пустой cookie пересылается как есть, ok:false даёт null` |
| Denial loop, status 401 | `test.each` case `отказ API (статус 401)` |
| Denial loop, status 403 | `test.each` case `отказ API (статус 403)` |
| Denial loop, status 500 | `test.each` case `отказ API (статус 500)` |
| Denial loop, body `{ ok: false }` | `test.each` case `отказ API (ok:false)` |
| Denial loop, body `{ ok: true, user: {} }` | `test.each` case `отказ API (ok:true с пустым user)` |
| Denial loop, fetch failure | `test.each` case `отказ API (сбой fetch)` |
| Denial loop, raw body `invalid JSON` | `test.each` case `отказ API (невалидный JSON)` |
| Denial loop, origin `invalid-url` | `test.each` case `отказ API (невалидный origin)` |
| (each denial case) `me === null`, 0 local calls with `local: user` set, profile `rejects(/redirect:\/login/)`, `isAuthenticated() === false` | the shared body of the `test.each` above |
| Student (`roles: ['student']`) profile `rejects(/not-found/)` | `профиль: пользователь без роли admin получает not-found` |
| Local mode (no origin, `local: user`): `me.id`, 0 requests, 1 local call | `getServerMe: локальный режим без API_ORIGIN делает один локальный вызов и ни одного запроса` |
| Empty env: `me === null` | `getServerMe: пустое окружение без локального пользователя даёт null` |

Mock mapping: harness `dependencies` map -> `vi.mock` of `react` (cache passthrough), `server-only`, `next/headers`, `next/navigation` (redirect throws `redirect:<url>`, notFound throws `not-found`), `@/lib/auth/server/getMeData` (spy replaces the `localImports` counter), `@/components/users/UserProfileAssignmentsPage` (stub). `./authMePayload`, `@/lib/auth/getServerMe` and `@/lib/auth/loginRedirect` are real modules now (the page and the test share one `getServerMe` instance because the page is imported after the scenario without another `resetModules`).

## Verification Results

- `yarn workspace @bio-exam/web vitest run app components/tests lib/auth/loginRedirect.test.ts lib/auth/sessionCookie.test.ts lib/mdx`: 7 files, 19 tests passed.
- `yarn workspace @bio-exam/web vitest run lib/auth/getServerMe.test.ts`: 1 file, 14 tests passed.
- `yarn workspace @bio-exam/web test`: 8 files, 33 tests passed.
- `yarn workspace @bio-exam/web typecheck`: exit 0.
- Acceptance greps: `node:vm|transpileModule|runInNewContext|createRequire` in getServerMe.test.ts = 0; `vi.mock('next/headers'` = 1; `vi.stubGlobal('fetch'` = 1; `no-store` = 1; `redirect:` = 3; `passWithNoTests` in web vitest config = 0; `"test": "vitest run"` present.
- Regression sensitivity of the port (temporary mutations of `getServerMe.ts`, restored byte-for-byte afterwards, `git diff` for the file is empty): adding a local fallback on `!response.ok` -> 3 tests fail (401/403/500 cases); changing `no-store` to `force-cache` -> the first test fails.
- No live database or network is touched: web tests import no `pg`/db module, `fetch` is stubbed in every scenario, origins are `api.example.test` fixtures (T-1-10). No `.env` value was read.

## Task Commits (ready to commit, not committed)

Per the standing rule, nothing was committed (`commits: 0`, HEAD still 11b2916). Proposed commits, in the user's style:

1. **Task 1** (config and seven simple ports): `test: Vitest в app/web, перенос семи простых веб-тестов`
   - `app/web/vitest.config.ts` (new), `app/web/package.json` (only the `test` script line is this plan's), `app/web/app/(internal)/(protected)/admin/tests/lifecycle.test.ts`, `app/web/components/tests/attempt-review/AttemptQuestionsList.test.ts`, `app/web/components/tests/attempt-review/attempt-review-utils.test.ts`, `app/web/components/tests/telemetry.test.ts`, `app/web/lib/auth/loginRedirect.test.ts`, `app/web/lib/auth/sessionCookie.test.ts`, `app/web/lib/mdx/normalizeSource.test.ts`
2. **Task 2** (getServerMe): `test: getServerMe на vi.mock вместо vm-обвязки`
   - `app/web/lib/auth/getServerMe.test.ts`

Caution: `app/web/package.json` also carries the uncommitted 01-02 changes (`oxlint`, `vite`, `vitest` pins). Stage the 01-02 commit first or use `git add -p` so the Task 1 commit holds only the `test` script line.

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations):
- Vite prints a warning on every run: `vitest.config.ts` is ESM syntax loaded as CommonJS because `app/web/package.json` has no `"type": "module"`. It is cosmetic (config loads, tests pass). The plan fixes the filename as `vitest.config.ts`; options if the noise matters: rename to `vitest.config.mts` or set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true`. Setting `"type": "module"` would affect the whole Next app, so it was not done.
- New `vi.mock` of `react` spreads the original module and replaces only `cache`.
- `package.json` edit keeps LF/tab style of the file (no CR in `app/web/package.json`).

## Issues Encountered

None. One formatting detail: Prettier split `vi.stubGlobal(` across lines, which broke the literal acceptance grep `vi.stubGlobal('fetch'`; the fetch mock was extracted into a `fetchMock` const so the call stays on one line.

## Known Stubs

`vi.mock('@/components/users/UserProfileAssignmentsPage', () => ({ default: 'student-profile' }))` is a test double carried over verbatim from the original harness (`{ default: 'student-profile' }`), not a production stub.

## Threat Flags

None. T-1-10 mitigated (fetch stubbed per scenario, fixture origins); T-1-11 mitigated (assert-count parity table and scenario mapping above).

## Self-Check: PASSED

- Created: `app/web/vitest.config.ts` exists.
- All plan acceptance criteria re-run above and pass; `yarn workspace @bio-exam/web test` exits 0 with 8 files.
- Commits: none, by rule (`commits: 0` measured).

## Next Phase Readiness

All 12 tracked tests (4 server + 8 web) now run under Vitest; with 01-03 this completes VER-01's test-port half. 01-06 can switch web lint/format knowing the ported files are Prettier-clean.
