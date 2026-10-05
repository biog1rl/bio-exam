# bio-exam

## CodeGraph

Code intelligence runs on CodeGraph: a local index in `.codegraph/`, reached through the `codegraph_*` MCP tools or the `codegraph` CLI. Reach for it before grep or reading files:

- Understanding an area, or any question about the code: `codegraph explore "<symbols or question>"`.
- One symbol with its callers, or a file with line numbers: `codegraph node <symbol-or-file>`.
- Before editing a symbol: `codegraph impact <symbol>`, and report the affected callers.
- Choosing tests for a change: `codegraph affected <changed files>`.

When `.codegraph/` is missing, say so and work from `rg` and direct reads; `codegraph init` builds the index.

## Decisions and plans

- Architecture decisions live in `docs/adr/`. Read the relevant ADR before changing auth, the exam domain, file storage, or module structure.
- Implementation plans and their order: `plans/README.md`.

## Project commands

Run everything from the repository root. Node 24 (`.nvmrc`), Yarn 4.12 through Corepack, PostgreSQL 17 for anything that touches a database.

- `yarn install`: install dependencies. `yarn.lock` is the only lockfile.
- `yarn dev`: run web (`:3000`) and the Express API (`:4000`) through Turbo.
- `yarn verify`: the single repository gate (steps `lockfile`, `env-contract`, `docs-commands`, `ci-workflow`, `format-check`, `lint-typecheck-test`, `migrations`, `script-tests`). It starts its own disposable PostgreSQL 17 and ends with `yarn verify: OK` or `yarn verify: FAILED at <step>`.
- `yarn e2e`: isolated Playwright run (first `yarn playwright install chromium`). It is not part of `yarn verify`.
- `yarn editor:budget`: after `yarn workspace @bio-exam/web build`, checks the first-load JS of the question editor routes (raw and gzip) against `scripts/editor-bundle-budget.json` and that the emoji table is not in it. CI runs it after "Build web"; it is not part of `yarn verify`.
- `yarn lint`, `yarn typecheck`, `yarn test`: the same Turbo tasks `yarn verify` runs, for a quicker loop.
- `yarn format` / `yarn format:check`: oxfmt over the repository.
- `node scripts/with-test-db.mjs <command>`: run any command against a fresh guarded `test_*` database, for example `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test`.

## Scope and safety

- Database-touching work (tests, migrations, scripts) runs only against a local disposable `test_*` database through `TEST_DATABASE_URL` with `BIO_EXAM_ISOLATED_ENV=1`. The guard in `app/server/src/config/test-database-url.ts` accepts hosts `localhost` and `127.0.0.1` and names matching `^test_[a-z0-9_]+$`. The `DATABASE_URL` in a developer's `.env` may point at live data: never use it for tests or migration experiments.
- Never edit an applied Drizzle migration in `app/server/drizzle/`; add a new one. `yarn verify` checks the chain from an empty database.
- Env examples (`app/server/.env.example`, `app/web/.env.example`) hold placeholders only. When code starts reading a new environment key, add it to the matching example; `scripts/check-env-contract.mjs` fails otherwise. Never copy a real value into an example, a doc or a log.
- Docs: README files and env example comments are in Russian; identifiers, commands and paths stay as they are. A `yarn ...` command written in a doc must exist (`scripts/check-docs-commands.mjs`).
- `yarn verify` must be green before a phase or change is considered done. A zero-test run counts as a failure.
- Formatting-only changes go in their own commit, separate from behavior changes, so the commit hash can be listed in `.git-blame-ignore-revs`.

## Routing

| Area                                                | Where                                                                           | Read first                                             | Skill           |
| --------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------- |
| Web client (Next.js)                                | `app/web`                                                                       | `docs/adr/0001-express-owns-data-and-access-policy.md` | `bio-exam-web`  |
| API, auth, access policy                            | `app/server/src/routes`, `app/server/src/middleware`, `packages/rbac`           | `docs/adr/0001-express-owns-data-and-access-policy.md` | `bio-exam-api`  |
| Exam domain (question templates, scoring, attempts) | `packages/exam-core`, `app/server/src/lib/tests`, `app/server/src/routes/tests` | `docs/adr/0002-shared-exam-core-package.md`            | `bio-exam-api`  |
| File storage                                        | `app/server/src/services/storage`                                               | `docs/adr/0004-storage-port-two-adapters.md`           | `bio-exam-api`  |
| Schema and migrations                               | `app/server/src/db`, `app/server/drizzle`                                       | `docs/adr/0003-verification-before-refactoring.md`     | `bio-exam-data` |
| Module structure and decomposition                  | `app/server/src`, `app/web`                                                     | `docs/adr/0005-decompose-by-concept.md`                | -               |
| Verification, e2e, repository checks                | `scripts`, `e2e`, `turbo.json`                                                  | `docs/adr/0003-verification-before-refactoring.md`     | -               |
| User deletion and foreign keys to users             | `app/server/src/db/schema.ts`, `app/server/drizzle`                             | `docs/adr/0007-user-deletion-rule.md`                  | `bio-exam-data` |
| Work order and plans                                | `plans`                                                                         | `plans/README.md`                                      | -               |

Project skills live in `.agents/skills/<name>/SKILL.md`. Read the skill named in the Skill column before editing its area.
