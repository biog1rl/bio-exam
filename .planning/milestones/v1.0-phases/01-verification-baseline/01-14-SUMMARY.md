---
phase: 01-verification-baseline
plan: 14
subsystem: tooling
tags: [oxfmt, tailwind-sorting, format-only, git-blame-ignore-revs]

requires:
  - phase: 01-verification-baseline
    provides: "01-06 root .oxfmtrc.json with Prettier parity and ignorePatterns for protected paths; 01-10/01-11 yarn verify; 01-12/01-13 e2e suite"
provides:
  - "sortTailwindcss enabled in .oxfmtrc.json (stylesheet ./app/web/styles/globals.css, functions clsx, cn, cva)"
  - "Whole repository reformatted once by oxfmt as an isolated format-only commit 2b59334"
  - ".git-blame-ignore-revs recording 2b59334c7f946f643b13eedb755cc1e32add73fb (commit a343af1)"
  - "yarn format:check exits 0 on HEAD, ready for 01-15 to enforce it inside yarn verify"
affects: [01-15]

actuals:
  tokens: 0
  tasks: 3
  commits: 2
plan_head_before: ad3a9e16d46ccef1c8bb353aed05c05a1dffa382
plan_head_after: a343af19d15141a5f34cab0167ec3ba9d5346d1f

tech-stack:
  added: []
  patterns:
    - "Format-only commit isolated from logic changes and recorded in .git-blame-ignore-revs; local git config blame.ignoreRevsFile points at it"

key-files:
  created:
    - .git-blame-ignore-revs
  modified:
    - .oxfmtrc.json

key-decisions:
  - "sortTailwindcss uses ./app/web/styles/globals.css (the old Prettier path ./app/globals.css never existed, which made sorting inert)"
  - ".yarnrc.yml added to ignorePatterns because oxfmt formats YAML and the file is Yarn's own config at the root, not covered by .yarn/**"
  - "Commits were made by the main session at the user's explicit request, not by GSD; this plan's no-commit rule for agents held"

requirements-completed: [VER-02]

duration: n/a (checkpoint-spanning)
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 14: One-time oxfmt reformat Summary

**Repository reformatted once by oxfmt with Tailwind class sorting enabled, committed as a single format-only commit (2b59334) and recorded in `.git-blame-ignore-revs`; `yarn format:check` is green on HEAD.**

## Accomplishments

- Task 1: waves 1-9 (plans 01-01 to 01-13) were committed by the main session on the user's explicit request as 13 per-plan commits, `1e4045f..ad3a9e1` on branch `phase-1-verification`. The tree was clean before the formatter ran, so the format diff holds formatter output only.
- Task 2: `.oxfmtrc.json` gained `sortTailwindcss` with `stylesheet: "./app/web/styles/globals.css"` and `functions: ["clsx", "cn", "cva"]` (the exact option keys of oxfmt 0.71), and `.yarnrc.yml` was added to `ignorePatterns`. `yarn format` rewrote 219 files (tsx 130, ts 63, md 16, json 9, css 1, cjs 1) plus `.oxfmtrc.json`: 220 files, +3603/-3645 lines. Some root `package.json`/json/cjs files were normalised from CRLF to LF (`endOfLine: lf`).
- Task 3: the user's main session committed the reformat as `2b59334` (`style: Форматирование репозитория oxfmt`) and the hash record as `a343af1` (`docs: Хеш форматирования oxfmt в .git-blame-ignore-revs`); `git config blame.ignoreRevsFile .git-blame-ignore-revs` is set locally.

## Verification Results

- `.git-blame-ignore-revs` holds `# Форматирование oxfmt (D-11)` and the 40-hex line `2b59334c7f946f643b13eedb755cc1e32add73fb`.
- `git cat-file -e 2b59334...^{commit}`: succeeds.
- `git status --porcelain`: empty.
- `git show --name-only --format= 2b59334` lists 220 paths, none under `.yarn/` or `app/server/drizzle/`, and neither `yarn.lock` nor `pencil-new.pen` (the same check over `app/web/public/`, `app/web/components.json` and `app/web/.vscode/` also prints 0).
- `yarn format:check` on HEAD: exit 0, "All matched files use the correct format" over 556 files.
- `package-lock.json` is absent.
- Recorded during Task 2: `yarn verify: OK`; `yarn e2e` 40 passed, with the known expected failures for D1, D2 and D5.

## Deviations from Plan

None. The `.yarnrc.yml` ignore and the CRLF-to-LF normalisation were anticipated by the plan (step 3: exclude `.yarnrc.yml` if the formatter handles YAML). The user chose to have the main session make the Task 1 and Task 3 commits rather than run them by hand; this is the plan's checkpoint flow with a different committer, and GSD itself created no commit.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None. The reformat introduced no new network, auth or file-access surface. T-1-37 and T-1-38 are mitigated: clean tree before the run, `yarn verify` and `yarn e2e` on the reformatted tree, and no protected path in the format commit.

## Next Phase Readiness

Plan 01-15 can add `oxfmt --check` (`yarn format:check`) to `yarn verify`: the format commit exists, its hash is recorded, and the tree passes the check.

## Self-Check: PASSED

- `.git-blame-ignore-revs`: found; commits 2b59334 and a343af1: found in `git log`.
- `.oxfmtrc.json` contains `sortTailwindcss` and `styles/globals.css`.
