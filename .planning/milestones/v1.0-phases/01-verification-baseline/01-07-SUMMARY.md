---
phase: 01-verification-baseline
plan: 07
subsystem: infra
tags: [storage, local-fs, path-containment, symlink, isolation, vitest, supabase-lockout]
requires:
  - phase: 01-verification-baseline
    provides: "isIsolatedEnv() in config/test-database-url.ts (01-01); server Vitest config with BIO_EXAM_ISOLATED_ENV=1 (01-03)"
provides:
  - "StorageService local-folder mode (STORAGE_DRIVER=local + absolute STORAGE_LOCAL_DIR) with path containment and atomic writes"
  - "Isolated processes (BIO_EXAM_ISOLATED_ENV=1) can never construct a Supabase client"
  - "storage.local.test.ts: 58 table-driven tests, no database, temp dirs only"
affects: [01-09, 01-11, e2e-seed, phase-7-storage-seam]

actuals:
  tokens: 9436
  tasks: 2
  commits: 0
plan_head_before: 11b291649c54eec9678edf0a441232a92b631197
plan_head_after: 11b291649c54eec9678edf0a441232a92b631197

tech-stack:
  added: []
  patterns:
    - "Config read lazily at call time (isLocalStorage(), getLocalRoot()), so tests can vi.stubEnv; SUPABASE_* constants still read at import for the non-isolated path"
    - "Local branch is the first statement of each StorageService method; module-level functions (no new class members), so the public interface is unchanged"
    - "Containment: syntactic key check, path.resolve + path.relative (never string startsWith on the root), realpath of target (read) or deepest existing ancestor (write), dangling symlinks rejected on write"

key-files:
  created:
    - app/server/src/services/storage/storage.local.test.ts
  modified:
    - app/server/src/services/storage/storage.ts

key-decisions:
  - "Any '..' segment in the raw key is rejected, including 'a/../b' that would stay inside after normalize (truth wording: 'contain a .. segment')"
  - "Empty key is rejected for list operations too, so listFiles('') / deleteDirectory('') cannot address or wipe the whole root (no caller uses an empty prefix)"
  - "isConfigured() additionally returns false in isolated mode (leaked SUPABASE_* must not steer routes into Supabase code paths); in local mode it keeps meaning 'Supabase configured'"
  - "getClient() returns null in local mode: the local driver never constructs a Supabase client"
  - "Symlinks are not followed or listed by listFilesRecursive; entries with a transient .tmp-<12 hex> suffix are hidden from listings"
  - "readFilesParallel in local mode returns only existing keys (plan behaviour); the Supabase branch still maps missing keys to ''"

requirements-completed: [VER-05]

coverage:
  - id: D1
    description: "Local mode CRUD: read/write/json/upload/download/readFilesParallel/list/listRecursive/delete/deleteDirectory/exists/moveDirectory under STORAGE_LOCAL_DIR, local branch beats Supabase even with SUPABASE_* set"
    requirement: VER-05
    verification:
      - kind: unit
        ref: "app/server/src/services/storage/storage.local.test.ts#local mode: file operations / local mode: moveDirectory / the local driver takes precedence over Supabase"
        status: pass
    human_judgment: false
  - id: D2
    description: "Containment: empty, NUL, absolute, drive, UNC, backslash and '..' keys rejected before any fs call on all 12 key-taking operations; '%2e%2e' is a literal name; directory, file and dangling symlinks and the sibling-prefix trap rejected"
    requirement: VER-05
    verification:
      - kind: unit
        ref: "app/server/src/services/storage/storage.local.test.ts#local mode: containment"
        status: pass
    human_judgment: false
  - id: D3
    description: "Isolated process never constructs a Supabase client (createClient spy with fake SUPABASE_* set), non-isolated Supabase path unchanged (createClient called once with env values)"
    requirement: VER-05
    verification:
      - kind: unit
        ref: "app/server/src/services/storage/storage.local.test.ts#Supabase client lock-out"
        status: pass
    human_judgment: false
  - id: D4
    description: "createSignedUrl, getPublicUrl, createZip and listFilesWithMeta throw 'not supported in local storage mode' instead of returning an empty value"
    requirement: VER-05
    verification:
      - kind: unit
        ref: "app/server/src/services/storage/storage.local.test.ts#local mode: unsupported methods fail loudly"
        status: pass
    human_judgment: false
  - id: D5
    description: "Production behaviour without the switches is unchanged (Supabase default driver, legacy disk fallback in moveDirectory)"
    requirement: VER-05
    verification:
      - kind: unit
        ref: "storage.local.test.ts#Supabase client lock-out: without isolation and without the local driver / without any configuration the old fallbacks stay"
        status: pass
    human_judgment: true
    rationale: "Only the Supabase client creation and the no-config fallbacks are exercised with a mocked client; no live Supabase call is allowed. The unchanged branches are otherwise confirmed by diff reading (git diff shows additions only before the original statements)"

duration: 9min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 07: StorageService local mode and Supabase lock-out Summary

**`StorageService` gains a local-folder mode (`STORAGE_DRIVER=local` + absolute `STORAGE_LOCAL_DIR`) with traversal and symlink containment and atomic temp+rename writes, and `getClient()` returns null in isolated processes so no test or e2e process can reach Supabase Storage. The public interface is unchanged.**

## Performance

- **Duration:** about 9 min
- **Started:** 2026-10-03T07:11Z (approx.), pin guard run at 07:15:16Z
- **Completed:** 2026-10-03T07:19Z
- **Tasks:** 2/2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Local mode for `readFile`, `readFilesParallel`, `writeFile`, `writeJson`, `readJson`, `uploadBuffer`, `downloadBuffer`, `deleteFiles`, `listFiles`, `listFilesRecursive`, `deleteDirectory`, `moveDirectory`, `exists`. `createSignedUrl`, `getPublicUrl`, `createZip`, `listFilesWithMeta` throw `[StorageService] <method> is not supported in local storage mode (ADR-0004, Phase 7)`.
- `resolveLocalPath(key, { forWrite })`: rejects empty, NUL, leading `/` or `\`, drive letter, any backslash and any `..` segment; then `path.resolve` + `path.relative` check; reads require `realpath(target)` inside `realpath(root)`; writes require the realpath of the deepest existing ancestor inside it, and dangling symlinks on the write chain are rejected. No `startsWith(root)` comparison anywhere. Error text is `[StorageService] path escapes storage root` or `[StorageService] invalid storage key` and never echoes a host path.
- Writes are `<abs>.tmp-<12 hex>` + `rename`, parents created, temp file removed on failure.
- `moveDirectory` in local mode validates both prefixes before moving anything, renames file by file (EXDEV falls back to copy+unlink), removes only emptied directories, and never touches `../web/public/uploads`.
- D-17: `getClient()` starts with `if (isIsolatedEnv()) return null`; the test spies on `createClient` with fake `SUPABASE_*` set and asserts 0 calls.

## Production path without the switches (unchanged)

With `STORAGE_DRIVER` unset and `BIO_EXAM_ISOLATED_ENV` unset, `isLocalStorage()` is false and `isIsolatedEnv()` is false, so every method falls through its new first-line guard into the original statements, byte for byte:

- `getClient()`: both new guards are skipped, then the original `isConfigured()` check, `showConfigWarning()` and the lazy `createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!)`.
- `isConfigured()`: `Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY)` as before.
- `moveDirectory`: Supabase branch when a client exists, otherwise the legacy `../web/public/uploads` branch, both untouched.
- `readJson`: the original try/catch body is kept verbatim for the non-local path; the local branch has its own copy so key errors are not turned into `null`.
- Test evidence: `Supabase client lock-out > without isolation and without the local driver ...` (createClient called once with the env values) and `... without any configuration the old fallbacks stay`.

## Task Commits (ready to commit, not committed)

Per the standing rule no commit was made. Both tasks touch the same two files, so the split below is by feature; a single commit is equally valid.

1. **Task 1 (tdd): local mode with containment.** Proposed: `feat: Локальный режим StorageService с защитой от выхода за корень`
   ```
    M app/server/src/services/storage/storage.ts
   ?? app/server/src/services/storage/storage.local.test.ts
   ```
2. **Task 2 (tdd): Supabase lock-out in isolated processes, local moveDirectory, loud unsupported methods.** Proposed: `feat: Запрет Supabase в изолированных процессах и moveDirectory в локальном режиме StorageService`
   ```
    M app/server/src/services/storage/storage.ts
   ?? app/server/src/services/storage/storage.local.test.ts
   ```
   Single-commit alternative: `feat: Локальный режим StorageService и запрет Supabase в изолированных процессах`.

**Plan metadata:** not committed (`commit_docs: false`, `.planning/` gitignored).

## TDD Gate Compliance (no-commit mode)

- **Task 1 RED:** `yarn workspace @bio-exam/server vitest run src/services/storage/storage.local.test.ts` with the 42 Task 1 tests and no implementation: `Tests 39 failed | 3 passed (42)`. Failures are assertion failures (for example `Expected: /path escapes storage root|invalid storage key/ Received: [StorageService] Cannot write: Supabase not configured`), not import crashes. The 3 tests that passed were ones whose expectation today's code already satisfies (for example a missing key reading as an empty string and `getQuestionPath`).
- **Task 1 GREEN:** 42/42. Mutation check: forcing `isInsideRoot` to return true makes exactly the three symlink/sibling-prefix tests fail (3 failed, 39 passed), so those tests do detect a missing realpath check. Original restored.
- **Task 2 RED:** 16 tests added (moveDirectory, unsupported methods, lock-out); `Tests 10 failed | 48 passed (58)`. The failures were real assertions (legacy `Failed to move local file`, `Cannot create signed URL: Supabase not configured`, `Storage error: fake supabase`, `createClient` called).
- **Task 2 GREEN:** 58/58, three consecutive runs stable.
- **REFACTOR:** format only (Prettier with the repo's tab/no-semi/single-quote/120 settings, no import-sort plugin) on the test file; `readJson` restructured so the non-local path is the original code (see deviation 3). 58/58 after.

## Files Created/Modified

- `app/server/src/services/storage/storage.ts`: local-mode helpers (`isLocalStorage`, `getLocalRoot`, `resolveLocalPath`, `localWrite`, `localReadBuffer/Text`, `localListFiles(Recursive)`, `localDeleteFiles/Directory`, `localMoveDirectory`, `localExists`, content-type map), first-line local branches in the methods, isolated/local short-circuits in `getClient()`, isolated short-circuit in `isConfigured()`. Imports `crypto` and `isIsolatedEnv`. LF line endings kept; +325 lines, no original statement removed except two header lines.
- `app/server/src/services/storage/storage.local.test.ts` (new): 58 tests. Uses `fs.mkdtempSync` roots (`data`, `data-evil`, `outside`) and `vi.stubEnv`; `vi.mock('@supabase/supabase-js')` through `vi.hoisted` spy, `vi.resetModules()` + dynamic import for the lock-out cases. No database, no network.

## CodeGraph impact (run before editing)

`codegraph impact StorageService` (68 symbols) and `codegraph impact storageService` (8 symbols). Real server callers of the singleton:

- `routes/docs/assets.ts` (GET/POST/DELETE `/api/docs/assets`, `/proxy`; uses `isConfigured`, `listFilesWithMeta`)
- `routes/users/avatar.ts` (POST `/api/users/avatar`; `isConfigured`, `getPublicUrl`)
- `routes/tests/index.ts` (save, questions create/patch/move/delete, test delete, topic delete, assets, export ZIP; `deleteDirectory`, `moveDirectory`, `createZip`, `isConfigured`, JSON/text I/O)
- `routes/tests/public.ts` (`readFile`)
- `scripts/backfill-question-search.ts` (`readFile`)
- `routes/index.ts`, `routes/users/index.ts` (re-exports)

The `app/web` entries in the impact list (`image-upload.tsx`, `images-plugin*`, `MediaLibrary.tsx`, `drag-drop-paste-plugin.tsx`) are API consumers by name, not importers of this class. Behaviour for all of them is unchanged without the switches. In local mode the image, avatar and ZIP-export routes would hit the new "not supported" errors if they took their Supabase branch; they branch on `isConfigured()`, which stays `false` without `SUPABASE_*`, so they keep their own legacy disk code (ADR-0004 moves them in Phase 7).

## Decisions Made

See `key-decisions`. In short: stricter-than-plan `..` rule, no empty prefix for list/delete, `isConfigured()` false when isolated, `getClient()` null in local mode, symlinks not listed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] `isConfigured()` returns false in isolated mode**
- **Found during:** Task 2
- **Issue:** With leaked `SUPABASE_*` in an isolated process, `getClient()` is null but `isConfigured()` would still say true, steering `routes/docs/assets.ts`, `routes/users/avatar.ts` and `routes/tests/index.ts` into Supabase code paths that then fail with confusing errors instead of using their legacy disk code.
- **Fix:** `isConfigured()` starts with `if (isIsolatedEnv()) return false`. In production the flag is never set, so nothing changes. In local mode it still means "Supabase configured".
- **Files modified:** app/server/src/services/storage/storage.ts
- **Verification:** `Supabase client lock-out > isolated env reports Supabase as not configured ...`

**2. [Rule 2 - Missing critical] `getClient()` returns null in local mode**
- **Found during:** Task 2
- **Issue:** The plan only requires the local branch to come first in each method; any path that still reached `getClient()` with `SUPABASE_*` set (including the legacy `moveDirectory` fallthrough) could build a Supabase client although the local driver was chosen.
- **Fix:** `if (isLocalStorage()) return null` in `getClient()`.
- **Verification:** `the local driver takes precedence over Supabase and never constructs a client` (createClient 0 calls).

**3. [Rule 1 - Bug] `readJson` would have swallowed containment errors**
- **Found during:** Task 1
- **Issue:** `readJson` wraps `readFile` in try/catch and returns `null` on any error, so `readJson('../x')` in local mode would silently return `null` instead of rejecting.
- **Fix:** local branch calls `readFile` outside the try; the non-local path keeps the original body verbatim (an earlier version moved `readFile` out of the try for all modes; reverted because a throwing `createClient` would then propagate instead of returning `null`).
- **Verification:** the containment table includes `readJson`.

**4. [Rule 1 - Bug, test side effect] RED run of Task 2 created empty directories under `app/web/public`**
- **Found during:** Task 2 RED
- **Issue:** Before the local `moveDirectory` branch existed, the legacy branch did `mkdirSync` under `process.cwd()/../web/public/uploads` and `../web/public/escaped` while failing to rename.
- **Fix:** removed the empty `app/web/public/uploads` and `app/web/public/escaped` trees (only directories, no files, none tracked, created by the run; `app/web/public` now holds only `img`). With the local branch in place the run no longer touches that path, and a test asserts it.

### Notes that are not deviations

- Added tests beyond the behaviour list: relative/missing `STORAGE_LOCAL_DIR`, atomic-write cleanup, `uploadBuffer({ upsert: false })` refusing to overwrite, listing hides and does not follow symlinks, in-root symlink allowed, dangling symlink, move into own subdirectory, overwrite on move, e2e-shaped config (isolated + local + no `SUPABASE_*`).
- The plan's `rel.startsWith('..')` is implemented as `rel === '..' || rel.startsWith('..' + path.sep)`, so a legitimate name such as `..hidden` is not rejected while real escapes still are.

**Total deviations:** 4 auto-fixed (2 missing critical, 2 bug/side effect).
**Impact on plan:** all within `storage.ts`/its test, additive, no interface change.

## Issues Encountered

- Whole-workspace `yarn workspace @bio-exam/server typecheck` exits 0 (no sibling errors at run time).
- `oxlint` on `services/storage` reports one pre-existing warning (`catch (e)` unused in `getPublicUrl`, line 517); not touched.

## Limitations to carry forward

- Containment is checked before the operation (check-then-use); a local attacker who can swap directories concurrently could race it. Acceptable for the test/e2e driver; the Phase 7 adapter should use handle-based operations.
- Windows path semantics are only covered by rejecting drive/UNC/backslash keys; the driver is meant for macOS/Linux/CI.
- `exists()` is true for regular files only (directories give false), and `listFiles()` lists directories as direct entries like Supabase.
- If an e2e flow later hits image upload, avatar, ZIP export or `listFilesWithMeta` in local mode, it will fail loudly with the "not supported" error; that plan's SUMMARY must report it (D-14 flows are text-only).

## Known Stubs

None.

## Threat Flags

None. The new local file-system surface is exactly the one T-1-22 covers (mitigated, tested). T-1-23 (Supabase from isolated processes) and T-1-24 (partial writes) are mitigated as planned.

## User Setup Required

None. For e2e: `STORAGE_DRIVER=local`, `STORAGE_LOCAL_DIR=<absolute temp dir>`, `BIO_EXAM_ISOLATED_ENV=1`, no `SUPABASE_*`.

## Verification Results

- `yarn workspace @bio-exam/server vitest run src/services/storage/storage.local.test.ts`: exit 0, `Tests 58 passed (58)`.
- `yarn workspace @bio-exam/server typecheck`: exit 0.
- Acceptance greps: `STORAGE_LOCAL_DIR` (4), `path.relative(` (2), `realpath` (8) in storage.ts; `grep -nE "startsWith\((root|this\.root|storageRoot)"` prints nothing; test file contains `'../x'`, `'/etc/passwd'`, `'%2e%2e/x'`, symlink cases, `vi.mock('@supabase/supabase-js'` and `BIO_EXAM_ISOLATED_ENV`; `isIsolatedEnv` inside `getClient`; `not supported in local storage mode` present.
- Prettier (repo settings, no plugins) check passes on both files. No temp directories left in `$TMPDIR`. `git status` shows only the two files for this plan (plus earlier waves' uncommitted work, untouched). STATE.md, ROADMAP.md and REQUIREMENTS.md were not modified.

## Next Phase Readiness

- 01-09 / 01-11 (e2e seed and environment) can write prompt files through `storageService` with `STORAGE_DRIVER=local`.
- Phase 7 (ADR-0004) owns the real port, key-to-URL rule, streaming ZIP, and moving the route-level `isConfigured()` branches.

---
*Phase: 01-verification-baseline*
*Completed: 2026-10-03*

## Self-Check: PASSED
