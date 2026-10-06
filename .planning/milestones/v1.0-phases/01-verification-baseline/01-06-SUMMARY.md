---
phase: 01-verification-baseline
plan: 06
subsystem: tooling
tags: [oxlint, oxfmt, tsdown, eslint-removal, prettier-removal, tsup-removal, turbo, vercel]

requires:
  - phase: 01-verification-baseline
    provides: "01-02 exact pins oxlint 1.86.0 (web/server/rbac), oxfmt 0.71.0 (root), tsdown 0.23.0 (rbac); 01-03/01-04 test files kept Prettier-clean; 01-03 rbac 14-export smoke test"
provides:
  - "oxlint in all three workspaces (web: nextjs+react+typescript; server/rbac: typescript), correctness at warn, no-debugger at error, 0 errors"
  - "ESLint, Prettier and tsup removed: packages, configs, ignore files, the web prettier key, Prettier editor settings"
  - "@bio-exam/rbac built by tsdown (fixedExtension: false) into the same four dist files with the same 14 exports, guarded by scripts/check-rbac-dist.mjs"
  - "Root .oxfmtrc.json with proven Prettier parity on all 405 tracked web TS/TSX/CSS/MD files; root format / format:check scripts"
  - "Both Vercel build commands reproduced locally with placeholder env, exit 0"
affects: [01-10, 01-11, 01-14, 01-15]

actuals:
  tokens: 3340
  tasks: 3
  commits: 0
plan_head_before: 11b291649c54eec9678edf0a441232a92b631197
plan_head_after: 11b291649c54eec9678edf0a441232a92b631197

tech-stack:
  added: []
  removed: [eslint, "@eslint/eslintrc", eslint-config-next, eslint-config-prettier, eslint-plugin-import, eslint-plugin-jsx-a11y, eslint-plugin-node, eslint-plugin-prettier, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-unused-imports, "@typescript-eslint/eslint-plugin", "@typescript-eslint/parser", "@next/eslint-plugin-next", prettier, prettier-plugin-tailwindcss, "@trivago/prettier-plugin-sort-imports", tsup]
  patterns:
    - "Lint config per workspace: app/web/.oxlintrc.json; root .oxlintrc.json for server and rbac via -c ../../.oxlintrc.json src"
    - "turbo lint task: no dependsOn, inputs [$TURBO_DEFAULT$, $TURBO_ROOT$/.oxlintrc.json] so a root config change busts the cache"
    - "Warnings never fail lint; only errors do (no --deny-warnings anywhere)"

key-files:
  created:
    - .oxlintrc.json
    - app/web/.oxlintrc.json
    - .oxfmtrc.json
    - packages/rbac/tsdown.config.ts
    - scripts/check-rbac-dist.mjs
  modified:
    - package.json
    - app/web/package.json
    - app/server/package.json
    - packages/rbac/package.json
    - turbo.json
    - yarn.lock
    - app/web/.vscode/settings.json
  deleted:
    - app/web/eslint.config.mjs
    - app/web/.eslintrc.json
    - .prettierrc.json
    - app/web/.prettierrc.json
    - app/server/.prettierrc.json
    - app/web/.prettierignore
    - app/server/.prettierignore

key-decisions:
  - "nextjs rules mapped from the merged ESLint spread (core-web-vitals after recommended): 8 at error, 13 at warn; oxlint 1.86 has all 21, none missing"
  - "no-debugger set to error explicitly in both configs: measured that categories.correctness=warn demotes it to warn"
  - "turbo lint gets inputs including $TURBO_ROOT$/.oxlintrc.json (verified with turbo --dry=json) instead of a repo-wide globalDependencies entry"
  - "app/web/.vscode/settings.json: editor.defaultFormatter removed (plan fallback), because no local documentation confirms that oxc.oxc-vscode formats through oxfmt"
  - "Vercel web build reproduction also pins SESSION_COOKIE_NAME and NEXT_IGNORE_INCORRECT_LOCKFILE to placeholders, so @next/env fills nothing from app/web/.env"

requirements-completed: [VER-02]

coverage:
  - id: D1
    description: "yarn lint runs oxlint in web, server and rbac and exits 0 with 0 errors; warnings do not fail it"
    requirement: VER-02
    verification:
      - kind: other
        ref: "yarn lint -> 3 tasks successful; web 66 warnings 0 errors, server 6 warnings 0 errors, rbac 0/0"
        status: pass
      - kind: other
        ref: "grep -rn deny-warnings on the four package.json -> nothing"
        status: pass
    human_judgment: false
  - id: D2
    description: "Lint boundary: a warning-only run exits 0, a single error exits non-zero"
    requirement: VER-02
    verification:
      - kind: other
        ref: "app/server/src/__lint_probe__.ts (unused import, unused const, debugger) -> yarn workspace @bio-exam/server lint exit 1; probe deleted -> exit 0 with 6 warnings"
        status: pass
    human_judgment: false
  - id: D3
    description: "Web oxlint config covers the ESLint config (21 nextjs rules at merged severity, rules-of-hooks error, exhaustive-deps warn, no-unused-vars warn with ^_ patterns)"
    requirement: VER-02
    verification:
      - kind: other
        ref: "oxlint --print-config in app/web: every nextjs/* rule and react/* rule at the mapped severity"
        status: pass
    human_judgment: false
  - id: D4
    description: "ESLint, Prettier and tsup fully removed (packages, configs, prettier key)"
    verification:
      - kind: other
        ref: "plan Task 1 verify 2 and Task 3 verify 2 (node -e package scans) -> exit 0; test ! -e on all seven deleted configs -> exit 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "rbac built by tsdown into index.js/index.cjs/index.d.ts/index.d.cts with the 14 tsup-baseline exports"
    verification:
      - kind: other
        ref: "yarn workspace @bio-exam/rbac build && node scripts/check-rbac-dist.mjs -> 'rbac dist OK ... 14 экспортов'"
        status: pass
      - kind: unit
        ref: "packages/rbac/src/index.test.ts (2 tests passed against the tsdown dist)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Both Vercel build commands still pass locally; web/server/rbac typechecks pass"
    verification:
      - kind: other
        ref: "placeholder env + yarn --cwd app/web build:dev -> exit 0, no 'Failed to compile'/'Invalid server env'"
        status: pass
      - kind: other
        ref: "cd app/server && node vercel-build.cjs -> exit 0, '=== Build completed successfully! ==='"
        status: pass
      - kind: other
        ref: "yarn typecheck -> 4 tasks successful"
        status: pass
    human_judgment: false
  - id: D7
    description: "oxfmt parity config: oxfmt --check over every tracked app/web .ts/.tsx/.css/.md exits 0; no file reformatted"
    verification:
      - kind: other
        ref: "plan Task 3 verify 1 -> 'All matched files use the correct format', 405 files, exit 0"
        status: pass
      - kind: other
        ref: "git diff --name-only -- '*.ts' '*.tsx' identical before and after Task 3 (20 files, all from earlier waves)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Editor settings no longer point at Prettier; formatOnSave stays on without a pinned formatter"
    verification:
      - kind: other
        ref: "Task 3 verify 4 -> exit 0"
        status: pass
    human_judgment: true
    rationale: "Whether VS Code on save now formats acceptably (no pinned formatter) is an editor experience check a human should confirm"

duration: 10min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 06: oxlint, oxfmt parity config and tsdown replace ESLint, Prettier and tsup Summary

**All three workspaces now lint with oxlint 1.86 (0 errors; 72 warnings recorded as tech debt). The web config carries all 21 Next.js rules at the severities ESLint used. `@bio-exam/rbac` builds with tsdown into the same four dist files and the same 14 exports, which `scripts/check-rbac-dist.mjs` checks against the tsup baseline. A root `.oxfmtrc.json` reproduces the Prettier + trivago output on all 405 tracked web TS/TSX/CSS/MD files. ESLint, Prettier and tsup are gone from every manifest, and both Vercel build commands still exit 0 locally.**

## Performance

- **Duration:** about 10 min
- **Started:** 2026-10-03T07:26:05Z
- **Completed:** 2026-10-03T07:36:00Z
- **Tasks:** 3/3
- **Files:** 5 created, 7 modified, 7 deleted

## Accomplishments

- oxlint configs written and wired into the `lint` scripts of all three workspaces. `turbo.json` `lint` no longer depends on `^build` and now hashes the root config.
- The lint boundary is proven: an error fails the run, warnings alone do not.
- 14 ESLint packages, 3 Prettier packages and tsup removed with `yarn remove`. Seven config and ignore files deleted.
- rbac moved to tsdown (`build: tsdown`, `watch: tsdown --watch`). The `exports`/`main`/`module`/`types` fields and the script names are unchanged.
- Vercel builds reproduced with fake env values. Web and server typechecks pass, the web tests pass (8 files, 33 tests) and the rbac smoke tests pass (2).
- `.oxfmtrc.json` parity config written. The repository was not reformatted.

## ESLint to oxlint mapping (web)

ESLint applied `recommended` first and then `core-web-vitals`, so the later spread decided each severity. Merged map → oxlint:

| Rule (`@next/next/*` → `nextjs/*`) | Severity |
|---|---|
| google-font-display, google-font-preconnect, next-script-for-ga, no-async-client-component, no-before-interactive-script-outside-document, no-css-tags, no-head-element, no-img-element, no-page-custom-font, no-styled-jsx-in-document, no-title-in-document-head, no-typos, no-unwanted-polyfillio | warn (13) |
| no-html-link-for-pages, no-sync-scripts (raised to error by core-web-vitals), inline-script-id, no-assign-module-variable, no-document-import-in-page, no-duplicate-head, no-head-import-in-document, no-script-component-in-head | error (8) |

**Rules oxlint lacks: none.** All 21 `@next/eslint-plugin-next` 16.2.1 rules exist in oxlint 1.86 (`oxlint --rules -f json`, scope `nextjs`), and `--print-config` confirms the severities above.

Other ESLint rules:
- `react-hooks/rules-of-hooks` error → `react/rules-of-hooks: error`.
- `react-hooks/exhaustive-deps` warn → `react/exhaustive-deps: warn`.
- `@typescript-eslint/no-unused-vars` warn `^_` → `no-unused-vars: ["warn", { argsIgnorePattern, varsIgnorePattern: "^_" }]`.
- `prettier/prettier` dropped.

`app/web/.eslintrc.json` was a dead legacy file: the lint script used `--config eslint.config.mjs`, so nothing read it. It was deleted and not mapped.

`no-debugger`: with `categories.correctness: "warn"` and no explicit entry, a `debugger` statement reported at **warn** and the run exited 0 (measured in scratch). That is why `"no-debugger": "error"` is set in both configs (plan step 7).

ESLint baseline before removal: `yarn workspace @bio-exam/web lint` → 0 errors, 12 warnings (7 `@typescript-eslint/no-unused-vars`, 5 `@next/next/no-img-element`, counted in the saved output).

## Lint fixes

None. `yarn lint` reported 0 errors on the first run, so no application source file was changed (D-12; prohibition "lint fixes limited to genuine errors" holds trivially).

## Warning counts (tech debt, D-12; warnings never fail `yarn lint` / `yarn verify`)

| Workspace | Rule | Count |
|---|---|---|
| web | react(set-state-in-effect) | 31 |
| web | react(immutability) | 7 |
| web | eslint(no-unused-vars) | 7 |
| web | nextjs(no-img-element) | 5 |
| web | react(refs) | 5 |
| web | react(purity) | 4 |
| web | react(static-components) | 3 |
| web | react(jsx-key) | 1 |
| web | react(incompatible-library) | 1 |
| web | react(preserve-manual-memoization) | 1 |
| web | eslint(no-useless-escape) | 1 |
| **web total** | | **66** (403 files) |
| server | eslint(no-unused-vars) | 6 |
| **server total** | | **6** (74 files) |
| rbac | (none) | 0 (6 files) |

The 12 parity warnings (7 `no-unused-vars` + 5 `no-img-element`) match the ESLint baseline. The other 54 web warnings come from the `correctness` category at `warn` (research Open Question 7).

Unused-variable sites:
- web: all 7 are in `app/(internal)/(protected)/dashboard/DashboardClient.tsx` (lines 23 `Area`/`AreaChart`, 96, 103, 232, 242, 270).
- server:
  - `src/routes/auth/login.ts:14` `loginRateLimiter`
  - `src/app.ts:15` `ApiError`
  - `src/services/rbac/rbac.ts:10` `and`
  - `src/routes/tests/public.ts:11` `appSettings`
  - `src/scripts/backfill-question-search.ts:3` `inArray`
  - `src/services/storage/storage.ts:517` catch param `e`

Worth a look later (not changed here; behaviour-neutral rule):
- The unused `loginRateLimiter` import in `login.ts` should be checked against where the login rate limit is actually mounted.
- The single `react(jsx-key)` hit is in `components/editor/plugins/mentions-plugin.tsx:573`. PROJECT.md lists a Mentions-toolbar JSX-key warning as a rejected React Doctor false positive, which is probably the same site.

## rbac dist parity (Task 2)

`EXPECTED_EXPORTS` was captured from the tsup 8.5 build before the swap; ESM and CJS were identical:
`PERMISSION_DOMAINS, ROLES_LIST, ROLE_KEYS, ROLE_REGISTRY, accessRuleToSerializable, buildPermissionSet, can, createAccessRule, normaliseActionList, normaliseRoleAccessMap, normaliseRoleKeys, normaliseUserAccessMap, normaliseUserIdentifiers, roleDisplayName` (14, the same list as 01-03's smoke test).

| File | tsup | tsdown |
|---|---|---|
| index.js | 6650 B | 6296 B |
| index.cjs | 8273 B | 6742 B |
| index.d.ts / index.d.cts | 3594 B | 3453 B |

The `.d.ts` files differ only in format: `//#region` comments, `export declare` instead of `declare` + export list, and 2-space indent. Web and server typecheck against them cleanly.

## Vercel build reproduction (Task 2)

- Web: `yarn workspace @bio-exam/rbac build && DATABASE_URL=postgres://ci:ci@127.0.0.1:5432/test_ci AUTH_JWT_SECRET=ci-build-secret API_ORIGIN=http://127.0.0.1:4000 SESSION_COOKIE_NAME=ci_session NEXT_IGNORE_INCORRECT_LOCKFILE=1 NEXT_TELEMETRY_DISABLED=1 yarn --cwd app/web build:dev`
  - Next 16.2.1 (Turbopack): "Compiled successfully in 9.2s", TypeScript 5.5s, exit 0.
  - `[next.config] API_ORIGIN` printed the placeholder, which proves explicit env beats `app/web/.env`.
  - `app/web/.env` holds 5 keys (`API_ORIGIN`, `NEXT_IGNORE_INCORRECT_LOCKFILE`, `AUTH_JWT_SECRET`, `DATABASE_URL`, `SESSION_COOKIE_NAME`). All 5 were set explicitly; only the names were read.
- Server: `cd app/server && node vercel-build.cjs` → rbac build (tsdown) + server `tsc` build, "Build completed successfully!", exit 0.
- Side effects: only the gitignored `packages/rbac/dist`, `app/server/dist` and `app/web/.next` changed. No tracked file changed. The `package-lock.json` shasum is still `2f89d1d9…` (untouched).

## oxfmt (Task 3)

- Option names in `node_modules/oxfmt/configuration_schema.json` (0.71.0) match the research config exactly: `sortImports.{newlinesBetween, ignoreCase, internalPattern, groups, customGroups[].groupName/elementNamePattern}` and `ignorePatterns`. No remapping was needed.
- Parity proof (plan verify 1): 405 tracked web files, "All matched files use the correct format", exit 0.
- Detection sanity: `oxfmt --check app/server/src packages/rbac/src` → exit 1 (60 files never Prettier-formatted). The check does fail when files differ.
- `git diff --name-only -- '*.ts' '*.tsx'`, before and after Task 3, is the same 20 files, all from earlier waves: `app/server/drizzle.config.ts`, `app/server/src/config/env.ts`, `app/server/src/db/index.ts`, `app/server/src/db/schema.ts`, `app/server/src/db/seed.ts`, `app/server/src/lib/tests/question-type-resolver.test.ts`, `app/server/src/lib/tests/scoring.test.ts`, `app/server/src/lib/tests/telemetry.test.ts`, `app/server/src/schemas/tests.test.ts`, `app/server/src/scripts/apply-migration.ts`, `app/server/src/scripts/bootstrap-admin.ts`, `app/server/src/services/storage/storage.ts`, and the 8 `app/web` test files from 01-04. This list also equals the plan-start list, so Task 1 and Task 2 changed no TS/TSX file either.
- The new files (`.oxlintrc.json`, `app/web/.oxlintrc.json`, `.oxfmtrc.json`, `tsdown.config.ts`, `check-rbac-dist.mjs`) already pass `oxfmt --check`, so 01-14 will not churn them.

### Extensions oxfmt 0.71 formats (for 01-14)

I measured this by probing one sample file per extension, because `--help` and the README do not list extensions.
- **Formatted:** js, jsx, mjs, cjs, ts, tsx, mts, cts, json, jsonc, json5, css, scss, less, md, mdx, **yml, yaml (YAML: yes)**, html, vue, graphql, toml, hbs, handlebars. **JSON: yes**, and `package.json` key order is rewritten by the default `sortPackageJson`.
- **Not formatted:** sql, svelte, astro, svg, xml, txt, pen.

Tracked files that are formatted and not ignored: ts 190, tsx 287, json 15 (11 once the 4 deleted `.prettierrc.json`/`.eslintrc.json` leave the index), md 21, css 3, mjs 1, cjs 1, yml 1 (`.yarnrc.yml`). **Every one of these extensions is in 01-14's changed-path gate** (`ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonc|css|md|mdx|yml|yaml`). Nothing is missing.

Read-only preview for 01-14 (`oxfmt --list-different .` with this config): 90 files would change.
- 63 ts and 1 cjs, all in `app/server`/`packages/rbac`.
- 17 md in `docs/adr` and `plans/`.
- 8 json: `package.json`, `app/web/package.json`, `turbo.json` and server/rbac json.
- 1 yml: **`.yarnrc.yml`**.

Notes for 01-14:
- Because oxfmt formats YAML, 01-14 step 3 applies: add `.yarnrc.yml` to `ignorePatterns` and to the protected-path list.
- Expect `package.json` key reordering from `sortPackageJson` (it moves `resolutions` before `postcss` in `app/web/package.json`). That is format-only, but it is visible churn.

### Editor settings

`app/web/.vscode/settings.json` (tracked, CRLF kept):
- Removed: `editor.defaultFormatter: esbenp.prettier-vscode`, `prettier.requireConfig`, `prettier.configPath`.
- Kept: `typescript.tsdk`, `editor.formatOnSave`, `css.customData`.
- Not added: `oxc.oxc-vscode`. Neither oxfmt's nor oxlint's packaged README documents the VS Code extension, and no network docs were consulted, so the plan's fallback applied.
- Follow-up for the user: with `formatOnSave: true` and no pinned formatter, VS Code uses whatever formatter is installed. Install the Oxc extension and set it as the default formatter once confirmed, or turn `formatOnSave` off.

## Task Commits (ready to commit — not committed)

Nothing was committed (standing no-commit rule): `commits: 0` measured, HEAD still `11b2916`. 01-14 asks for 01-06 in a commit of its own. Proposed single commit, or three if preferred:

1. **Task 1:** `chore: oxlint вместо ESLint во всех воркспейсах`
   - `.oxlintrc.json` (new), `app/web/.oxlintrc.json` (new), `turbo.json`
   - deleted `app/web/eslint.config.mjs`, `app/web/.eslintrc.json`
   - `app/web/package.json`, `app/server/package.json`, `packages/rbac/package.json` (lint script lines + ESLint package removals), `yarn.lock`
2. **Task 2:** `chore: сборка @bio-exam/rbac через tsdown, проверка dist`
   - `packages/rbac/tsdown.config.ts` (new), `scripts/check-rbac-dist.mjs` (new), `packages/rbac/package.json` (build/watch scripts, tsup removed), `yarn.lock`
3. **Task 3:** `chore: конфиг oxfmt с паритетом Prettier, Prettier удалён`
   - `.oxfmtrc.json` (new), `package.json` (format, format:check), `app/web/package.json` (format/prettier scripts and prettier key removed, deploy, Prettier packages removed), `app/server/package.json` (Prettier packages removed), `app/web/.vscode/settings.json`, `yarn.lock`
   - deleted `.prettierrc.json`, `app/web/.prettierrc.json`, `app/server/.prettierrc.json`, `app/web/.prettierignore`, `app/server/.prettierignore`

Caution on shared files: `package.json`, `app/web/package.json`, `app/server/package.json`, `packages/rbac/package.json`, `turbo.json` and `yarn.lock` also carry uncommitted earlier-wave edits:
- 01-02: pins.
- 01-03/01-04: `test` scripts.
- 01-03: turbo `test` task and `globalPassThroughEnv`.

Commit those plans first or use `git add -p`. `scripts/` also contains earlier-wave files (`check-migrations.mjs`, `with-test-db.mjs`, `lib/`); stage only `scripts/check-rbac-dist.mjs` for this plan. `yarn.lock` cannot be split by hunk meaningfully, so it goes with whichever commit lands last.

## Files Created/Modified

- `.oxlintrc.json` — server/rbac oxlint config (typescript plugin, correctness warn, no-unused-vars `^_`, no-debugger error).
- `app/web/.oxlintrc.json` — web oxlint config (nextjs/react/typescript, the 21 nextjs rules, hooks rules).
- `.oxfmtrc.json` — oxfmt parity config + ignorePatterns (no `sortTailwindcss`).
- `packages/rbac/tsdown.config.ts` — tsdown build, `fixedExtension: false`, `dts: true`.
- `scripts/check-rbac-dist.mjs` — dist file names + ESM/CJS export parity against `EXPECTED_EXPORTS`.
- `package.json` — `format`, `format:check`.
- `app/web/package.json` — `lint` → oxlint, `format`/`prettier` scripts removed, `deploy` → `yarn --cwd ../.. format:check && yarn lint && vercel --prod`, `prettier` key removed, 17 packages removed.
- `app/server/package.json` — `lint` added, Prettier packages removed (CRLF kept).
- `packages/rbac/package.json` — `build: tsdown`, `watch: tsdown --watch`, `lint` added, tsup removed (CRLF kept).
- `turbo.json` — `lint`: `inputs: ["$TURBO_DEFAULT$", "$TURBO_ROOT$/.oxlintrc.json"]`, no `dependsOn`.
- `app/web/.vscode/settings.json` — Prettier keys and default formatter removed.
- `yarn.lock` — this plan only removes entries (ESLint/Prettier/tsup trees); the working-tree diff also holds 01-02's additions.

## Decisions Made

See frontmatter `key-decisions`. The main one beyond the plan text is the turbo lint `inputs` change (below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Root oxlint config added to the turbo lint cache key**
- **Found during:** Task 1 (step 4)
- **Issue:** `lint` is a cached turbo task. The server and rbac lint read `../../.oxlintrc.json`, which lies outside their package directories, so changing the root config would replay a stale cached result.
- **Fix:** `"lint": { "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/.oxlintrc.json"] }`. This also removes `dependsOn: ["^build"]` as the plan requires.
- **Files modified:** `turbo.json`
- **Verification:** `yarn turbo run lint --dry=json` lists `../../.oxlintrc.json` among the inputs of all three lint tasks and shows no dependencies.
- **Committed in:** not committed (Task 1 set)

**2. [Rule 2 - Missing critical] Extra placeholder env keys in the web build reproduction**
- **Found during:** Task 2 (step 5)
- **Issue:** `app/web/.env` also defines `SESSION_COOKIE_NAME` and `NEXT_IGNORE_INCORRECT_LOCKFILE`. The plan's command sets only 3 keys, so `@next/env` would fill the other two from the live file.
- **Fix:** added `SESSION_COOKIE_NAME=ci_session NEXT_IGNORE_INCORRECT_LOCKFILE=1` (and `NEXT_TELEMETRY_DISABLED=1`). This follows the orchestrator's project_safety instruction to give a placeholder for every key.
- **Verification:** build exit 0, placeholder `API_ORIGIN` echoed by `next.config`.

---

**Total deviations:** 2 auto-fixed (2 missing critical). **Impact:** both are small safety additions; no scope creep, no application code touched.

## Issues Encountered

- `oxlint --rules` prints nothing in the default format when output is not a TTY. `-f json` gives the full list.
- `yarn remove` printed the known `YN0057` (web `resolutions` ignored) and `YN0086` peer warnings from 01-02. Nothing new.

## Known Stubs

None.

## Threat Flags

None. T-1-19: only `oxfmt --check` ran; the protected paths are in `ignorePatterns`. T-1-20: placeholder env only, no `.env` value read. T-1-21: `check-rbac-dist.mjs` and both builds reproduced.

## User Setup Required

None. Optional: pick a VS Code formatter for `app/web` (see Editor settings).

## Next Phase Readiness

- 01-10 can call `yarn lint` (`turbo run lint`, oxlint in all 3 workspaces) inside `yarn verify`.
- 01-14:
  - The recorded extension list is complete and fits its gate.
  - Add `.yarnrc.yml` to `ignorePatterns` because YAML is formatted.
  - Expect 90 changed files, including `sortPackageJson` key reordering.

---
*Phase: 01-verification-baseline*
*Completed: 2026-10-03*

## Self-Check: PASSED

- Created files exist: `.oxlintrc.json`, `app/web/.oxlintrc.json`, `.oxfmtrc.json`, `packages/rbac/tsdown.config.ts`, `scripts/check-rbac-dist.mjs`.
- Deleted files absent: all 7 (`test ! -e` checks exit 0); probe `app/server/src/__lint_probe__.ts` absent.
- Plan verification re-run at the end:
  - `yarn lint` exit 0 (0 errors).
  - `yarn typecheck` 4/4.
  - `yarn workspace @bio-exam/rbac build && node scripts/check-rbac-dist.mjs` OK.
  - Parity check exit 0.
  - Task 1/3 package scans exit 0.
  - Ignore-pattern check exit 0.
  - `.prettierignore`/vscode check exit 0.
- Commits: none by rule; `git rev-list --count 11b2916..HEAD` = 0, and the changes sit in the working tree on purpose.
- STATE.md, ROADMAP.md, REQUIREMENTS.md not modified.
