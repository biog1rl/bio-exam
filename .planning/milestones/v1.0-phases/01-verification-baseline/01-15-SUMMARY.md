---
phase: 01-verification-baseline
plan: 15
subsystem: ci
tags: [github-actions, ci, policy-check, oxfmt, format-check, postgres-service, playwright]

requires:
  - phase: 01-verification-baseline
    provides: "01-10/01-13 yarn verify with TEST_DATABASE_URL guard and migration check; 01-09 yarn e2e; 01-06 check-rbac-dist and format:check; 01-14 one-time oxfmt format commit recorded in .git-blame-ignore-revs"
provides:
  - ".github/workflows/ci.yml: advisory read-only CI with jobs verify, build, e2e"
  - "scripts/check-ci-workflow.mjs (checkCiWorkflow) plus 23 node:test cases"
  - "yarn verify steps ci-workflow and format-check (8 steps in total)"
  - "Production start smoke step in the build job (resolves squad review R3)"
  - "First CI run green on PR #2: all three jobs, no deploy step"
affects: [phase-2]

actuals:
  tokens: 0
  tasks: 3
  commits: 1
plan_head_before: a343af19d15141a5f34cab0167ec3ba9d5346d1f
plan_head_after: e02a86b59022b4b1da1cfb1cb71049eb0bde4139

tech-stack:
  added: []
  patterns:
    - "Text and line based policy check of a workflow file (no YAML library): forbidden fragments searched over the whole file including comments, required elements only in comment-free lines"
    - "CI mirrors the local gate: the verify job runs the same yarn verify against a postgres:17 service container"

key-files:
  created:
    - .github/workflows/ci.yml
    - scripts/check-ci-workflow.mjs
    - scripts/check-ci-workflow.test.mjs
  modified:
    - scripts/verify.mjs

key-decisions:
  - "CI is advisory: triggers are pull_request (no branch or path filter) and push on master only; no branch protection is configured (D-22)"
  - "Production start smoke runs inside the build job against app/server/dist with NODE_ENV=production and fake values; /healthz does not touch the database, so no postgres service is needed in that job"
  - "The policy check requires the /healthz smoke in the build job, so the R3 gate cannot be removed silently"
  - "format-check sits after the static checks (docs-commands, ci-workflow) and before lint-typecheck-test"
  - "Commits were made by the main session at the user's explicit request, not by GSD; the no-commit rule for agents held"

requirements-completed: [VER-02, VER-03, VER-04, DRZ-03]

duration: n/a (checkpoint-spanning)
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 15: Advisory CI and format-check Summary

**Read-only GitHub Actions CI (verify, build, e2e) with a tested static policy check inside `yarn verify`, the oxfmt `format-check` step, and a production start smoke that resolves R3; the first run on PR #2 is green in all three jobs.**

## Accomplishments

- **Task 1 (workflow and policy check).** `.github/workflows/ci.yml` runs on `pull_request` (no filters) and `push` to `master`, with top-level `permissions: contents: read` and a per-ref `concurrency` group with `cancel-in-progress: true`. Every job is on `ubuntu-24.04` and starts with `actions/checkout@v7` (`persist-credentials: false`), `corepack enable`, `actions/setup-node@v7` (`node-version-file: .nvmrc`, `cache: yarn`).
  - `verify`: `postgres:17` service with `pg_isready` health check, job env `TEST_DATABASE_URL` pointing at `localhost/test_bio_exam` (throwaway service credentials, not a secret), `actions/cache@v6` for `.turbo`, `Lockfile guard` (`node scripts/check-lockfile.mjs`) before `yarn install --immutable`, then `yarn verify`.
  - `build`: `yarn install --immutable`, rbac build, `check-rbac-dist`, server build, `Production start smoke`, web build with fake `DATABASE_URL`, `AUTH_JWT_SECRET`, `API_ORIGIN`.
  - `e2e`: own postgres service, `yarn install --immutable`, `actions/cache@v6` for `~/.cache/ms-playwright`, `yarn playwright install --with-deps chromium`, `yarn e2e`.
  - Policy check `scripts/check-ci-workflow.mjs` (272 lines, zero dependencies, exports `checkCiWorkflow(text)`, CLI prints `check-ci-workflow: OK` or the findings and exits 1):
    - Forbidden fragments, case-insensitive, searched over the whole file including comments: `pull_request_target`, `secrets.`, `deploy`, `vercel`, `: write`, `write-all`, `id-token`, `upload-artifact`, `git push`.
    - Required elements, searched in comment-free lines: `pull_request:`, a `push:` block with `master`, `contents: read`, `concurrency` with `cancel-in-progress: true`, `postgres:17`, the three jobs, and in each job the order checkout, `corepack enable`, setup-node, `yarn install --immutable`, followed by the job's own commands (`yarn verify`; rbac build, `check-rbac-dist`, server build, the `/healthz` smoke, web build; `yarn playwright install`, `yarn e2e`); in the verify job `node scripts/check-lockfile.mjs` must precede the first `yarn install`.
  - `scripts/check-ci-workflow.test.mjs`: 23 `node:test` cases built from the real file with one mutation each (missing push-to-master, write permission, secret reference, target-context trigger, deploy step, hosting CLI, install before lockfile guard, artifact upload, and the ordering and job-presence cases).
- **Task 2 (format-check).** `.git-blame-ignore-revs` holds the 01-14 format commit (`2b59334c7f946f643b13eedb755cc1e32add73fb`, resolvable). `scripts/verify.mjs` gained `ci-workflow` (after `docs-commands`) and `format-check` (`yarn format:check`, before `lint-typecheck-test`). `yarn verify` now has 8 steps in this order: `lockfile`, `env-contract`, `docs-commands`, `ci-workflow`, `format-check`, `lint-typecheck-test`, `migrations`, `script-tests`.
- **Task 3 (checkpoint:human-action, user push).** The user pushed `phase-1-verification` and opened PR #2 into `master` (not merged). The orchestrator verified, and this agent re-confirmed via the public GitHub API with no credentials:
  - Run: https://github.com/biog1rl/bio-exam/actions/runs/37114466556
  - Workflow `CI`, event `pull_request`, head_sha `e02a86b59022b4b1da1cfb1cb71049eb0bde4139`, status `completed`, conclusion `success`.
  - Jobs `verify`, `build`, `e2e`: all `success`, every step `success`.
  - `verify` steps: Initialize containers, checkout, Enable Corepack, setup-node, cache, `Lockfile guard`, `Install dependencies`, `Verify`.
  - `build` steps: `Build rbac`, `Check rbac dist`, `Build server`, `Production start smoke`, `Build web`.
  - `e2e` steps: `Install Playwright Chromium`, `End-to-end` (the first green run is the fresh-runner proof for the e2e wrapper: no `packages/rbac/dist` in a fresh checkout).
  - Checks (a)-(c) of the plan: (a) three jobs green: confirmed. (c) no step publishes or ships anything: confirmed from the step lists, which contain no deploy, upload or push step, and from the policy check that forbids them. (b) the literal text `check-migrations: OK` and `yarn verify: OK` in the `verify` job log was not read, because log download needs credentials; the `Verify` step (which runs `yarn verify`, including the `migrations` step) concluded `success`, so `yarn verify` exited 0.

## R3 status: RESOLVED

Squad review item R3 (MINOR): no gate ran the production (non-isolated) server start branch. The user approved adding a `Production start smoke` step to the `build` job. It starts `app/server/dist/index.js` with `NODE_ENV=production`, fake `DATABASE_URL`/`AUTH_JWT_SECRET`/`ALLOWED_ORIGIN`, polls `/healthz` with curl for up to 30 seconds, fails if the process dies or `/healthz` does not answer, and prints the server log. In run 37114466556 this step concluded `success`, so R3 is proven by CI. The policy check requires the `/healthz` smoke in the build job, so it cannot be dropped without failing `yarn verify`.

## Deviations from Plan

### Auto-fixed Issues

None.

### User-approved scope additions

**1. [R3 - approved addition] `Production start smoke` step in the build job**
- **Found during:** squad review of phase 1 (item R3)
- **Issue:** the production start branch of the server was never executed by any gate
- **Fix:** added the step to `ci.yml` and a `/healthz` requirement to `scripts/check-ci-workflow.mjs`, with matching test cases
- **Files modified:** `.github/workflows/ci.yml`, `scripts/check-ci-workflow.mjs`, `scripts/check-ci-workflow.test.mjs`
- **Commit:** e02a86b

### Process notes

- The plan says the user commits and pushes in Task 3. In practice the main session made the single commit `e02a86b` (`ci: Информационный CI, проверка политики ci.yml и format-check в yarn verify`) at the user's request, and the user pushed. No commit, push or index mutation was made by a GSD agent. `e02a86b` holds Tasks 1 and 2 together (4 files, +609/-3), so `scripts/verify.mjs` carries both steps in one commit rather than two per-task commits.
- This continuation agent did not re-run `yarn verify` locally: it needs a database connection and the project safety rules for this run forbid one. The local Task 1/Task 2 verification is recorded by the previous agent and independently supported by the green `Verify` step in CI.
- The plan ledger file `gsd-plan-head-before-01-15` does not exist in the git directory (the commit was made by the main session). `plan_head_before` is `a343af1` (the 01-14 head), and `git rev-list --count a343af1..HEAD` gives 1.

## Verification Results

- GitHub API, run 37114466556: conclusion `success`; jobs `verify`, `build`, `e2e` all `success`; no step with a deploy, upload or push name.
- `git status --short`: clean at the start of this continuation.
- `grep` acceptance criteria for the workflow (`contents: read`, `postgres:17`, `yarn install --immutable`, `yarn verify`, `yarn e2e`, `check-rbac-dist`, no forbidden fragments) hold on the committed file, and `scripts/verify.mjs` lists `ci-workflow` and `format-check` in the required order.

## Known Stubs

None.

## Threat Flags

None. The workflow adds no write permission, secret reference or external endpoint; T-1-39 to T-1-41 are mitigated by `permissions: contents: read`, `pull_request` only, `persist-credentials: false`, and the policy check. T-1-42 (third-party actions) is accepted: only official `actions/*` at majors checkout v7, setup-node v7, cache v6; SHA pinning is left for Phase 2.

## Issues Encountered

None. The first CI run passed without a runner-specific fix (the Playwright system dependencies and postgres image concerns A1, A3, A8 did not materialise).

## Next Phase Readiness

CI is advisory and green on PR #2. PR #2 is not merged; merging, and any branch protection (not configured by design, D-22), are the user's decisions. STATE.md, ROADMAP.md and REQUIREMENTS.md were not touched by this agent; the orchestrator owns them.

## Self-Check: PASSED

- `.github/workflows/ci.yml`, `scripts/check-ci-workflow.mjs`, `scripts/check-ci-workflow.test.mjs`, `scripts/verify.mjs`: present in commit e02a86b.
- Commit `e02a86b` exists and equals HEAD; `plan_head_after` matches it.
- Run 37114466556 re-read from the public API: success, three jobs success.
