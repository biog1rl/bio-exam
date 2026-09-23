# Plan 001: Establish the project operating baseline

> **Executor instructions**: Run each verification gate. Stop on a mismatch;
> do not weaken checks to make them pass.
>
> **Drift check**: `git diff --stat 29563ff..HEAD -- package.json turbo.json app/*/package.json packages/rbac/package.json AGENTS.md CLAUDE.md README.md app/server/README.md app/server/.env.example app/web/.env.example .github .agents`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests, dx, docs
- **Planned at**: commit `29563ff`, 2026-07-27

## Why this matters

The monorepo has 11 executable tests but no `test` or repository-wide
verification command and no CI workflow. Agent guidance contains only a stale
generated GitNexus block; root onboarding and a complete env contract are
missing. Every later security/refactor phase needs a deterministic gate first.

## Current state

- `package.json` exposes `build`, `lint`, and `typecheck`, not `test`/`verify`.
- `turbo.json` has no test task; server and RBAC expose no lint/test scripts.
- `AGENTS.md` and `CLAUDE.md` duplicate stale GitNexus counts and use `main`
  although the branch is `master`.
- `app/server/README.md` documents obsolete routes and only three question
  types. No root README or `app/web/.env.example` exists.
- Stack: Yarn 4.12, Turbo 2.9, Next 16/React 19, Express/Drizzle/Postgres.

## Scope

**In scope**: root/workspace manifests, `turbo.json`, `.github/workflows/**`,
`README.md`, `AGENTS.md`, `CLAUDE.md`, env examples, server README,
`.agents/skills/bio-exam-{web,api,data}/**`.

**Out of scope**: application behavior, deployment, secrets, wholesale copies
from lifemy-doc.

## Steps

1. Add package-level test/lint commands and root `test` plus `verify`. Use the
   existing top-level assertion tests without changing their semantics.
   **Verify**: `yarn test` exits 0 and runs all 11 existing test files.
2. Add a CI workflow using Corepack, Yarn 4 immutable install, and `yarn verify`.
   **Verify**: workflow YAML parses and contains no deployment or write step.
3. Add concise root onboarding, correct server route/access docs, and complete
   value-free web/server env examples. Add an allowlisted env-contract check.
   **Verify**: no `.env` value is read or copied; `yarn verify` exits 0.
4. Preserve the generated GitNexus block but add project commands/scope/routing
   outside it; make `CLAUDE.md` point to `AGENTS.md`. Refresh GitNexus using
   the current generator and preserve embeddings if present.
5. Use `skill-creator` to scaffold and validate three thin project overlays:
   `bio-exam-web`, `bio-exam-api`, and `bio-exam-data`. Adapt relevant lifemy
   concepts, never its identity/paths/commands.
   **Verify**: run `quick_validate.py` for all three skills.

## Done criteria

- [ ] `yarn verify` exits 0 and executes every committed test.
- [ ] CI runs immutable install and `yarn verify`.
- [ ] Env templates contain keys/placeholders only.
- [ ] Three project skills validate and routing is documented.
- [ ] Server/root docs match current routes and dynamic question types.

## STOP conditions

- Any proposed test runner requires rewriting the existing test corpus.
- GitNexus refresh would discard existing embeddings.
- A required env key cannot be classified without reading a secret value.

