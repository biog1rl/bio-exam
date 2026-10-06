---
phase: 01-verification-baseline
plan: 02
subsystem: testing
tags: [vitest, vite, oxlint, oxfmt, tsdown, playwright, drizzle-orm, drizzle-kit, yarn, supply-chain]

# Dependency graph
requires:
  - phase: 01-verification-baseline
    provides: "01-01 disposable PostgreSQL harness (scripts/lib/test-db.mjs --self-test) used to prove the migration runner on the bumped drizzle-orm"
provides:
  - "Exact (no ^/~) toolchain pins installed: vitest 5.0.3 and vite 8.3.2 and oxlint 1.86.0 in app/web, app/server, packages/rbac; oxfmt 0.71.0 and @playwright/test 1.63.0 at the root; tsdown 0.23.0 in packages/rbac"
  - "drizzle-orm 0.45.3 and drizzle-kit 0.31.11 on app/server (D-05 revised option B; closes GHSA-gpj5-g38j-94v9 which is fixed from 0.45.2)"
  - "yarn.lock updated by one consolidated install pass; package-lock.json untouched"
affects: [01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-09, 01-10]

# Actuals (#2632)
actuals:
  tokens: 20779
  tasks: 2
  commits: 0
plan_head_before: 11b291649c54eec9678edf0a441232a92b631197
plan_head_after: 11b291649c54eec9678edf0a441232a92b631197

# Tech tracking
tech-stack:
  added: [vitest@5.0.3, vite@8.3.2, oxlint@1.86.0, oxfmt@0.71.0, tsdown@0.23.0, "@playwright/test@1.63.0", drizzle-orm@0.45.3, drizzle-kit@0.31.11]
  patterns:
    - "Every workspace that runs a tool declares it itself (Yarn 4 runs a workspace script only with that workspace's own binaries)"
    - "Toolchain packages are pinned exactly with yarn add -E; later CI uses yarn install --immutable"

key-files:
  created: []
  modified:
    - package.json
    - app/web/package.json
    - app/server/package.json
    - packages/rbac/package.json
    - yarn.lock

key-decisions:
  - "Placement exactly as the plan's Task 2 and the checkpoint: root = oxfmt + @playwright/test; web/server/rbac = vitest + vite + oxlint; server also drizzle-kit (dev) and drizzle-orm (dependency); rbac also tsdown"
  - "Nothing removed (ESLint, Prettier, tsup, existing lint/build scripts stay until 01-06); no browser download; package-lock.json not touched"
  - "Drizzle stays on the 0.45 line with no query rewrites (D-06): the 01-01 real migration runner applies 0000-0020 on 0.45.3"

requirements-completed: [VER-01, DRZ-02]

coverage:
  - id: D1
    description: "User approved the exact pins at the blocking-human checkpoint before any install (T-1-05, T-1-06, T-1-SC)"
    requirement: VER-01
    verification: []
    human_judgment: true
    rationale: "The approval is a human decision recorded from the checkpoint reply 'approved'; no automated test can assert it"
  - id: D2
    description: "All eight toolchain packages installed with exact pins in the workspaces that run them"
    requirement: VER-01
    verification:
      - kind: other
        ref: "plan verify 1: node -e <package.json pin check> -> exit 0"
        status: pass
      - kind: other
        ref: "plan verify 2: node -e <installed node_modules version check> -> 'installed versions match'"
        status: pass
      - kind: other
        ref: "grep -E '\"(vitest|vite|oxlint|oxfmt|tsdown|@playwright/test|drizzle-orm|drizzle-kit)\": \"[\\^~]' on the four package.json -> prints nothing"
        status: pass
    human_judgment: false
  - id: D3
    description: "Drizzle on 0.45.3 / 0.31.11 with the real migration runner and typechecks still green"
    requirement: DRZ-02
    verification:
      - kind: integration
        ref: "node scripts/lib/test-db.mjs --self-test (14 ok, 'test-db self-test: OK', includes 21/21 migrations through the real runner)"
        status: pass
      - kind: other
        ref: "yarn workspace @bio-exam/server typecheck and yarn workspace @bio-exam/web typecheck -> exit 0, 0 'error TS'"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 02: Exact-pinned verification toolchain and Drizzle 0.45.3 / 0.31.11 Summary

**Eight user-approved toolchain packages (vitest 5.0.3, vite 8.3.2, oxlint 1.86.0, oxfmt 0.71.0, tsdown 0.23.0, @playwright/test 1.63.0, drizzle-orm 0.45.3, drizzle-kit 0.31.11) installed in one `yarn add -E` pass behind a blocking-human package-legitimacy checkpoint. Drizzle moved to the stable line that closes GHSA-gpj5-g38j-94v9, and the 01-01 migration runner still applies 0000-0020 on 0.45.3.**

## Performance

- **Duration:** 3 min for this continuation (Task 2 only; Task 1 was the checkpoint handled by the previous agent and the user)
- **Started:** 2026-10-03T06:46:42Z
- **Completed:** 2026-10-03T06:50:45Z
- **Tasks:** 2/2 (Task 1 checkpoint approved, Task 2 executed)
- **Files modified:** 5 (4 package.json + yarn.lock), no files created

## Task 1: Package legitimacy checkpoint (blocking-human, approved by the user)

The previous agent ran read-only `npm view` queries only. Nothing was installed before approval. The user replied **approved** for exactly these pins.

Registry facts recorded at the checkpoint:

- Every pin is the current `dist-tags.latest`.
- None of the eight packages has an `install`, `preinstall` or `postinstall` script.
- None is deprecated.
- Repositories match the plan: vitest-dev/vitest, vitejs/vite, oxc-project/oxc (oxlint and oxfmt), rolldown/tsdown, microsoft/playwright, drizzle-team/drizzle-orm (orm and kit).
- Published dates:

| Package | Version | Published |
|---------|---------|-----------|
| vitest | 5.0.3 | 2026-09-30 |
| vite | 8.3.2 | 2026-10-01 |
| oxlint | 1.86.0 | 2026-09-28 |
| oxfmt | 0.71.0 | 2026-09-28 |
| tsdown | 0.23.0 | 2026-09-03 |
| @playwright/test | 1.63.0 | 2026-09-04 |
| drizzle-orm | 0.45.3 | 2026-09-21 |
| drizzle-kit | 0.31.11 | 2026-09-21 |

`@oxlint/migrate` and `oxlint-tsgolint` were NOT installed (the oxlint config is written by hand in 01-06).

## Task 2: Install pass (executed)

Four `yarn add` passes, all exit 0 (logs were kept in the session scratchpad, not in the repo):

1. Root: `yarn add -D -E oxfmt@0.71.0 @playwright/test@1.63.0`
2. `yarn workspace @bio-exam/web add -D -E vitest@5.0.3 vite@8.3.2 oxlint@1.86.0`
3. `yarn workspace @bio-exam/server add -D -E vitest@5.0.3 vite@8.3.2 oxlint@1.86.0 drizzle-kit@0.31.11`, then `yarn workspace @bio-exam/server add -E drizzle-orm@0.45.3`
4. `yarn workspace @bio-exam/rbac add -D -E vitest@5.0.3 vite@8.3.2 oxlint@1.86.0 tsdown@0.23.0`

Resulting pins (exact strings, no range):

| File | Section | Pins |
|------|---------|------|
| package.json | devDependencies | `@playwright/test` 1.63.0, `oxfmt` 0.71.0 |
| app/web/package.json | devDependencies | `oxlint` 1.86.0, `vite` 8.3.2, `vitest` 5.0.3 |
| app/server/package.json | dependencies | `drizzle-orm` 0.45.3 |
| app/server/package.json | devDependencies | `drizzle-kit` 0.31.11, `oxlint` 1.86.0, `vite` 8.3.2, `vitest` 5.0.3 |
| packages/rbac/package.json | devDependencies | `oxlint` 1.86.0, `tsdown` 0.23.0, `vite` 8.3.2, `vitest` 5.0.3 |

## Accomplishments

- All installed `node_modules` versions equal the approved pins. Only one copy of each exists on disk (tsdown in `packages/rbac/node_modules`, the others hoisted to the root).
- `drizzle-orm` went from 0.45.1 to 0.45.3 and `drizzle-kit` from 0.31.8 to 0.31.11 (the old `^` ranges are gone). 0.45.2 or later fixes GHSA-gpj5-g38j-94v9. No 1.x release and no rc was installed.
- `yarn.lock` is the only lockfile that changed. No existing lock entry changed its resolved version: the diff is 168 added `name@version` resolutions (mostly per-platform optional native bindings) and 4 removed keys (`drizzle-kit@^0.31.5`, `drizzle-orm@^0.45.1`, `esbuild-register@npm:^3.5.0`, and a merged `@jridgewell/trace-mapping` range line whose resolved version 0.3.31 is unchanged).
- Verified on the bumped Drizzle:
  - `node scripts/lib/test-db.mjs --self-test` exits 0 with 14 `ok -` lines and `test-db self-test: OK`, including "migrations applied through the real runner (21)".
  - `yarn workspace @bio-exam/server typecheck`, `yarn workspace @bio-exam/web typecheck` and (extra) `yarn workspace @bio-exam/rbac typecheck` exit 0 with 0 `error TS`.
  - No `bio-exam-pg-*` directory is left in the temp dir.

## Install-time scripts and transitive additions (T-1-07)

- Yarn reported exactly one new build step: **`esbuild@0.28.2` "must be built because it never has been before"** (plus rebuilds of esbuild 0.25.12 and 0.27.2 because their dependency trees changed). The `postinstall` is the standard `node install.js` binary check of the esbuild project (repository evanw/esbuild, `dist-tags.latest` 0.28.2, not deprecated). It is not one of the eight approved packages: it arrived transitively as `drizzle-kit@0.31.11` -> `tsx@4.23.15` -> `esbuild@~0.28.0`.
- I scanned the 61 new packages that exist on disk (the other 107 new resolutions are per-platform optional bindings that were not fetched for darwin-arm64) for `preinstall`/`install`/`postinstall` scripts or `binding.gyp`. Only `esbuild@0.28.2` has one.
- New transitive tool versions to be aware of (read-only registry check, all `latest`, source repos as expected): `tsx@4.23.15` (privatenumber/tsx, modified 2026-09-20; server's own `tsx` stays 4.21.0, this copy belongs to drizzle-kit) and `esbuild@0.28.2` (modified 2026-08-08). `rolldown` bindings 1.2.12 (from tsdown) and `@oxc-project/types@0.152.0` also arrived transitively.
- None of these were separately approved at the checkpoint because they are dependencies of approved packages, not top-level pins. If you want that treated as strict scope creep, the esbuild 0.28.2 postinstall is the only item with execution at install time.

## Task Commits (ready to commit, not committed)

Per the standing rule, GSD agents do not commit. Everything is in the working tree. Proposed commit:

1. **Task 2: install the approved pins and bump Drizzle.** Message: `chore: Тулчейн верификации (vitest, vite, oxlint, oxfmt, tsdown, Playwright) и drizzle-orm 0.45.3 с drizzle-kit 0.31.11`

   ```
    M package.json
    M app/web/package.json
    M app/server/package.json
    M packages/rbac/package.json
    M yarn.lock
   ```

Task 1 produced no files and no commit. The five files above are the only changes from this plan. Wave 1 (01-01) changes are still uncommitted in the same tree (`app/server/drizzle.config.ts`, `app/server/src/config/env.ts`, `app/server/src/db/index.ts`, `app/server/src/db/seed.ts`, `app/server/src/scripts/apply-migration.ts`, `app/server/src/scripts/bootstrap-admin.ts`, `app/server/src/config/test-database-url.ts`, `app/server/src/scripts/isolation-probe.ts`, `scripts/`). Keep them in a separate commit from this plan's.

**Plan metadata:** not committed (`commit_docs: false`, `.planning/` gitignored).

## Files Created/Modified

- `package.json` - root devDependencies `@playwright/test` 1.63.0 and `oxfmt` 0.71.0.
- `app/web/package.json` - devDependencies `oxlint`, `vite`, `vitest`.
- `app/server/package.json` - `drizzle-orm` 0.45.3 (dependency); `drizzle-kit` 0.31.11, `oxlint`, `vite`, `vitest` (devDependencies).
- `packages/rbac/package.json` - devDependencies `oxlint`, `tsdown`, `vite`, `vitest`.
- `yarn.lock` - +1865/-71 lines, as described above.

## Decisions Made

- Followed the checkpoint placement and Task 2 text without change.
- Did not edit `package.json` by hand and did not normalise line endings. Yarn rewrote `app/server/package.json` with consistent CRLF: `git diff` shows 21 changed lines there instead of about 10, because HEAD had mixed LF/CRLF lines (the `drizzle:studio` to `bootstrap:admin` scripts block and `multer`) and yarn made them CRLF. This is whitespace only. The root `package.json` is fully CRLF (29 of 29 lines, checked), so the added lines match their neighbours. The one-time reformat in the formatter plan (D-11) removes the remaining noise.

## Deviations from Plan

None - plan executed exactly as written. The esbuild 0.28.2 postinstall and the tsx 4.23.15 transitive copy are documented above as observed facts, not as plan deviations (the plan asked the executor to record any build scripts).

## Authentication Gates

None.

## Process notes

- Not read in this continuation: `.planning/PROJECT.md`, `STATE.md`, `config.json`, `01-CONTEXT.md` and `01-RESEARCH.md` (D-05/D-06 and the research sections were taken from the plan text and the checkpoint message), and `app/server/src/scripts/apply-migration.ts`. The migration runner's behaviour on 0.45.3 was proven by the 01-01 self-test instead.
- The root-pin guard was run (root equality, `root pin OK`) before the first install. It was not re-run immediately before the SUMMARY write. The cwd was `/Users/kdvornichenko/bio-exam` for every command.

## Issues Encountered

- `yarn` prints `YN0057: @bio-exam/web: Resolutions field will be ignored` (the web package carries a `resolutions` block that only works at the root; pre-existing, untouched) and `YN0086: Some peer dependencies are incorrectly met by dependencies`. No YN0086 baseline was captured before the install. After it, `yarn explain peer-requirements` shows 2 unmet (✘) edges in total and none of them names vitest, vite, oxlint, oxfmt, tsdown, @playwright/test, drizzle-orm or drizzle-kit. The many "doesn't provide" lines for those packages are optional peers (`@types/*`, `@edge-runtime/vm`, `@tsdown/css` and similar) and are marked ✓. I did not investigate the two unmet edges further.
- `enableImmutableInstalls: false` in `.yarnrc.yml` is why `yarn add` was allowed to rewrite the lockfile. CI will switch to `yarn install --immutable` in a later plan, as the threat model states.

## Known Stubs

None.

## Threat Flags

None. No new endpoints, auth paths or file access. Supply-chain surface is covered by the plan's threat model (T-1-05, T-1-06, T-1-07, T-1-SC), with the transitive esbuild 0.28.2 postinstall noted above.

## User Setup Required

None - no external service configuration required. Playwright browsers are not downloaded here (01-09 does it).

## Next Phase Readiness

- Ready for 01-03 and later: the tools exist in each workspace that will run them. Nothing is wired yet (no scripts switched, no configs written).
- Turbo needs `TEST_DATABASE_URL` and `BIO_EXAM_ISOLATED_ENV` in `globalPassThroughEnv` (already noted by 01-01 as planned work).
- `package-lock.json` still exists (shasum `2f89d1d9...` unchanged); deleting it is plan 01-10.

---
*Phase: 01-verification-baseline*
*Completed: 2026-10-03*

## Self-Check: PASSED

- All five modified files exist and carry the exact pins (plan verify 1 exit 0, verify 2 "installed versions match").
- `git status --porcelain package-lock.json` prints nothing; its shasum equals the pre-install value.
- `node scripts/lib/test-db.mjs --self-test` exits 0 (14 ok, "test-db self-test: OK"); server, web and rbac typechecks exit 0.
- Commits: none, by the standing no-commit rule. `commits: 0` is measured: HEAD is still 11b2916, and the changes sit in the working tree on purpose.
