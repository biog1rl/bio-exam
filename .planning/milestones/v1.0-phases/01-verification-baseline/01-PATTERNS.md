# Phase 1: Verification baseline - Pattern Map

**Mapped:** 2026-10-03
**Files analyzed:** 36 (new/modified, grouped)
**Analogs found:** 22 in-repo / 36. The rest are tooling files with no in-repo analog (use RESEARCH.md recipes, option B for Drizzle).

All analog paths below are git-tracked source (checked with `git ls-files`: the 12 `*.test.ts` files, `.prettierrc.json` x3, `app/server/.env.example`, `AGENTS.md`). No gitignored mirrors are named.

Drizzle: option B only (stable 0.45.3 / 0.31.11). Ignore RESEARCH 4d/4e/4f option A.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `app/server/src/config/env.ts` (modify: isolation switch) | config | request-response (startup) | itself | exact (edit in place) |
| `app/server/src/db/index.ts` (modify: URL guard) | config | CRUD | itself | exact |
| `app/server/src/scripts/apply-migration.ts` (modify: guard + TEST_DATABASE_URL) | utility (script) | batch | itself | exact |
| `app/server/drizzle.config.ts` (modify: check config / kit 0.31) | config | batch | itself | exact |
| `app/server/src/db/schema.ts` (modify: D-28) | model | CRUD | itself (`testAttempts` block L395-418) | exact |
| `app/server/drizzle/meta/0020_snapshot.json` (new) | migration metadata | batch | `meta/0015_snapshot.json` | exact |
| `scripts/lib/test-db.mjs` | utility | batch / file-I/O | none | no analog |
| `scripts/verify.mjs`, `scripts/e2e.mjs` | utility (orchestrator) | batch | `app/server/vercel-build.cjs` (execSync runner) | partial |
| `scripts/check-env-contract.mjs`, `check-lockfile.mjs`, `check-migrations.mjs` | utility | transform | none | no analog |
| `app/server/src/services/storage/storage.ts` (modify: local driver) | service | file-I/O | itself (Supabase branches) | exact |
| `app/server/src/scripts/e2e-seed.ts` | utility (seed) | CRUD / batch | `app/server/src/db/seed.ts` + `scripts/bootstrap-admin.ts` | role-match |
| `app/server/vitest.config.ts`, `vitest.global-setup.ts` | config | batch | none (RESEARCH sketch) | no analog |
| `app/web/vitest.config.ts`, `packages/rbac/vitest.config.ts` | config | batch | `app/web/tsconfig.json` (`@/*` alias) | partial |
| 3 server + `schemas/tests.test.ts` ports (4 files) | test | transform | themselves (`telemetry.test.ts`) | exact |
| `question-type-resolver.test.ts` port | test | transform | itself + `vi.mock` of `db/index.js` | exact |
| 7 web test ports (non-getServerMe) | test | transform | themselves | exact |
| `app/web/lib/auth/getServerMe.test.ts` port | test | request-response | itself (vm harness) | exact |
| `packages/rbac/src/index.test.ts` (new smoke) | test | transform | none | no analog |
| `packages/rbac/package.json`, `tsdown.config.ts` | config | batch | `packages/rbac/package.json` (tsup scripts) | exact |
| `.oxfmtrc.json`, `.oxlintrc.json`, `app/web/.oxlintrc.json` | config | transform | `app/web/.prettierrc.json`, `app/web/eslint.config.mjs` | exact (translate) |
| root `package.json`, `turbo.json` (modify) | config | batch | themselves | exact |
| `app/server/package.json`, `app/web/package.json` (modify scripts/deps) | config | batch | themselves | exact |
| `.github/workflows/ci.yml` | config | batch | none (RESEARCH Pattern 10) | no analog |
| `e2e/playwright.config.ts`, `auth.setup.ts`, `tests/*.spec.ts` | test | request-response | none | no analog |
| `app/server/.env.example`, `app/web/.env.example` | config | n/a | `app/server/.env.example` | exact (server), role-match (web) |
| `README.md`, `app/server/README.md`, `AGENTS.md` | docs | n/a | existing files | exact |

## Pattern Assignments

### `app/server/src/config/env.ts` (config, startup, D-29)

**Analog:** itself. Wrap the loader loop (lines 29-39) in the isolation check. Existing code:
```typescript
let loadedFrom: string | null = null
for (const p of candidates) {
	try {
		if (fs.existsSync(p)) {
			dotenv({ path: p, override: true }) // <- разрешаем переопределять
			loadedFrom = p
			break // берём ПЕРВЫЙ существующий по приоритету
		}
	} catch { /* ignore */ }
}
```
Change: `const isolated = process.env.BIO_EXAM_ISOLATED_ENV === '1'`; skip the loop when `isolated`. Keep the `safeDsn` export (lines 42-51) and the production check unchanged. Comments in this repo are Russian; use `/** */` + `//` in Russian. Style: tabs, no semicolons, single quotes.

### `app/server/src/db/index.ts` (D-29 guard)

**Analog:** itself, lines 1-10:
```typescript
import '../config/env.js'
import { ENV_LOADED_FROM, safeDsn } from '../config/env.js'
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) { throw new Error('DATABASE_URL is not set') }
```
Insert directly after the presence check: `if (process.env.BIO_EXAM_ISOLATED_ENV === '1') assertTestDatabaseUrl(databaseUrl)`. The guard function must live where server code can import it. `scripts/lib/test-db.mjs` is outside `app/server/src` and `tsc -p` `include: ["src"]`, so put a typed copy or a small `src/config/assertTestDatabaseUrl.ts` in the server and have the harness import the shared logic (planner decision; keep one source of truth). Never log the URL (use `safeDsn` only). Guard body: RESEARCH Pattern 3 (lines 285-293).

### `app/server/src/scripts/apply-migration.ts` (full file, 25 lines)

**Analog:** itself:
```typescript
import 'dotenv/config'
...
const connectionString = process.env.DATABASE_URL
if (!connectionString) { throw new Error('DATABASE_URL is not set') }
const pool = new Pool({ connectionString })
const db = drizzle(pool)
await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle'), migrationsSchema: 'public' })
main().catch((err) => { console.error('Migration failed:', err); process.exit(1) })
```
Keep `migrationsSchema: 'public'` and `drizzle(pool)` (option B, no signature change). Add: when `BIO_EXAM_ISOLATED_ENV === '1'`, read `TEST_DATABASE_URL` and call the guard before `new Pool`. Production keeps `DATABASE_URL`.

### `app/server/src/db/schema.ts` (D-28, model)

**Analog:** itself. Existing shape (lines 407-418):
```typescript
createdAt: timestamp('created_at').notNull().defaultNow(),
submittedAt: timestamp('submitted_at').notNull().defaultNow(),
...
(t) => ({
	testIdIdx: index('test_attempts_test_id_idx').on(t.testId),
	userClientAttemptUniq: uniqueIndex('test_attempts_user_client_attempt_idx')
		.on(t.userId, t.clientAttemptId).where(sql`${t.clientAttemptId} IS NOT NULL`),
})
```
Apply (recipe in RESEARCH "schema.ts edits", lines 571-581): the 10 columns listed in 4b become `timestamp('x', { withTimezone: true })`; rename 4 indexes to `idx_test_attempts_{test_id,user_id,submitted_at}`, `idx_refresh_tokens_token_hash`; add `idx_users_locked_until`, `idx_refresh_tokens_expires_at`, gin `question_search_documents_search_text_trgm_idx` (`.using('gin', t.searchText.op('gin_trgm_ops'))`); `pgTable.withRLS` + `pgPolicy('deny_direct_access', ...)` on 25 tables. Keep the callback in the object-return form `(t) => ({ ... })` already used in the file. RLS declaration needs a kit/orm 0.45 API check; if `pgTable.withRLS` is unavailable, use `.enableRLS()`/`pgTable.withRLS` per 0.45 docs or allowlist (user chose declare). No migration file generated; applied SQL never edited.

### `app/server/drizzle/meta/0020_snapshot.json` (option B restore)

**Analog:** `app/server/drizzle/meta/0015_snapshot.json` (only the existing format reference). Procedure (RESEARCH 4d option B): run `drizzle-kit generate --name probe` in a scratch copy, keep only the snapshot as `0020_snapshot.json` with `prevId` = id of `0015_snapshot.json`, discard the probe SQL and journal entry. Do this after `schema.ts` is corrected. Existing meta: `0000`, `0001`, `0015`, `_journal.json`; SQL 0000-0020 untouched (assert with a sha256 manifest).

### `app/server/src/services/storage/storage.ts` (service, file-I/O, D-18)

**Analog:** itself. Pattern for every method: `const client = getClient(); if (!client) { <current fallback> }`. E.g. `uploadBuffer` (lines 186-196) and `writeFile` (line 166):
```typescript
const client = getClient()
if (!client) {
	throw new Error('[StorageService] Cannot upload: Supabase not configured')
}
await this.withRetry(async () => { const { error } = await client.storage.from(BUCKET).upload(...) ... })
```
Add a module-level `isLocal()` (`process.env.STORAGE_DRIVER === 'local'` + `STORAGE_LOCAL_DIR`), a `resolveLocal(key)` containment helper (RESEARCH Pattern 7 lines 396), and a local branch ahead of `getClient()` in: `readFile` (90), `readFilesParallel` (130), `writeFile` (166), `deleteFiles` (282), `listFiles` (299), `listFilesRecursive` (316), `exists` (492), `uploadBuffer`, `moveDirectory`, `writeJson/readJson`, `downloadBuffer`. Keep `isConfigured()` (lines 29-31, 55) meaning Supabase-configured. Unsupported local methods (`createSignedUrl`, `createZip`) must throw. Imports already include `fs` and `path` (lines 6-7). Env keys read at import (lines 12-14); read the new keys lazily at call time so tests can set them. Unit tests: table-driven containment cases (no DB), file `storage.local.test.ts` beside it.

### `app/server/src/scripts/e2e-seed.ts` (seed, CRUD)

**Analog:** `app/server/src/db/seed.ts` (whole file):
```typescript
import { ROLE_KEYS } from '@bio-exam/rbac'
import 'dotenv/config'
import { db } from './index.js'
import { roles } from './schema.js'
await db.insert(roles).values(ROLE_KEYS.map((key) => ({ key }))).onConflictDoNothing()
console.log('Seed OK')
main().catch((e) => { console.error(e); process.exit(1) })
```
Copy the `main().catch` wrapper and `onConflictDoNothing` idempotence. Second analog: `src/scripts/bootstrap-admin.ts` for user creation with bcrypt (read it during planning). Import `db` from `../db/index.js` only in isolated mode. Do not import `dotenv/config` (C4). Write prompt files via `storageService` from `../services/storage/storage.js`.

### Test ports (11 files), D-08

**Analog for style:** `app/server/src/lib/tests/telemetry.test.ts` (top-level `assert.deepEqual(...)`). Port pattern (RESEARCH Pattern 5): keep `import assert from 'node:assert/strict'`, add `import { describe, test, vi } from 'vitest'`, wrap each top-level assertion group in `test('...', () => { ... })`. Assertions unchanged. Imports stay `./telemetry.js` (server uses `.js` suffixes; web uses extensionless and `@/`).

**`question-type-resolver.test.ts`:** top-of-file `vi.mock('../../db/index.js', () => ({ db: {} }))` before the import of `./question-type-resolver.js`. Never set a dummy `DATABASE_URL`.

**`getServerMe.test.ts`** (lines 1-70 are the vm harness: `runInNewContext`, `transpileModule`, a `dependencies` map, `require` shim counting `localImports`). Replace with `vi.mock('server-only', ...)`, `vi.mock('react', ...)` (`cache: fn => fn`), `vi.mock('next/headers', ...)`, `vi.mock('@/lib/auth/server/getMeData', ...)`, `vi.stubEnv('API_ORIGIN', ...)`, `vi.stubGlobal('fetch', ...)`, `vi.resetModules()` + dynamic `await import('./getServerMe')` per scenario. Source under test starts `import { cache } from 'react'; import { cookies } from 'next/headers'; import 'server-only'` and calls `fetch(new URL('/api/auth/me', apiOrigin), { headers: { cookie }, cache: 'no-store', redirect: 'error' })`. Carry over the assertion list in RESEARCH lines 357.

### `packages/rbac/package.json` + `tsdown.config.ts`

**Analog:** `packages/rbac/package.json` scripts:
```json
"build": "rimraf dist && tsup src/index.ts --dts --format esm,cjs --out-dir dist --clean",
"clean": "rimraf dist",
"watch": "tsup src/index.ts --dts --format esm,cjs --out-dir dist --watch --clean=false",
"typecheck": "tsc --noEmit"
```
Replace `build`/`watch` with `tsdown` / `tsdown --watch`; keep names (`build`, `clean`, `watch`, `typecheck`) because Vercel calls `yarn workspace @bio-exam/rbac build`. Keep `exports` unchanged. Config: RESEARCH lines 386-387 (`fixedExtension: false` is mandatory). Add `"test": "vitest run"`, `"lint": "oxlint ."`. Remove `tsup` devDependency.

### `.oxfmtrc.json` / `.oxlintrc.json`

**Analog:** `app/web/.prettierrc.json` (git-tracked; there are also `.prettierrc.json` at root and `app/server/.prettierrc.json`):
```json
"useTabs": true, "trailingComma": "es5", "semi": false, "singleQuote": true,
"importOrder": ["^react-scan$", "^react", "^[a-z]", "^@/", "^[./]"],
"tailwindFunctions": ["clsx","cn","cva"], "tailwindStylesheet": "./app/globals.css", "endOfLine": "lf", "printWidth": 120
```
Translate to the validated config in RESEARCH Pattern 6 (lines 365-377). Fix the stylesheet path to `app/web/styles/globals.css` when enabling `sortTailwindcss`. Delete the three `.prettierrc.json` files and `app/web/eslint.config.mjs` (used as the oxlint migrate input). `oxlint`: generate with `npx @oxlint/migrate`, remove `prettier/prettier`, no `--deny-warnings`.

### Root `package.json` and `turbo.json`

**Analog:** themselves. Existing root scripts: `build`, `dev`, `start`, `lint`, `typecheck` all `turbo run <x>`. Add `"test": "turbo run test"`, `"verify": "node scripts/verify.mjs"`, `"e2e": "node scripts/e2e.mjs"`, `"format": "oxfmt ."`, `"format:check": "oxfmt --check ."`. `turbo.json` task shape to copy (existing):
```json
"typecheck": { "dependsOn": ["^build"] }
```
Add `"test": { "dependsOn": ["^build"], "cache": false }` and a top-level `"globalPassThroughEnv": ["TEST_DATABASE_URL", "BIO_EXAM_ISOLATED_ENV"]`. `lint` may drop `dependsOn`. Workspaces glob is `packages/*`, `app/web`, `app/server`; root-level `e2e/` stays outside workspaces (root devDependency).

### `app/server/package.json`, `app/web/package.json`

**Analog:** themselves. Server scripts use `tsx` and `drizzle-kit ... --config=drizzle.config.ts`; add `"test": "vitest run"`, `"lint": "oxlint ."`; bump `drizzle-orm` to exact `0.45.3`, `drizzle-kit` to `0.31.11` (pin exactly). Web: replace `"lint": "eslint . --config eslint.config.mjs"`, `"prettier"`, `"format"`, `"deploy"` (calls `npm run format`) with oxlint/oxfmt equivalents; add `"test": "vitest run"`; keep `build`, `build:dev`, `typecheck`, `dev`, `start`. Remove the `prettier` key and all eslint/prettier devDependencies.

### `app/server/vercel-build.cjs` -> `scripts/verify.mjs` / `scripts/e2e.mjs`

**Analog (partial):** `app/server/vercel-build.cjs` run helper:
```javascript
function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env } })
}
```
Use ESM (`"type": "module"` at root), `child_process` with `stdio: 'inherit'`, `try/finally` teardown. No dependency on `.env` files. Do not change `vercel-build.cjs` itself except for reproduction checks.

### `.env.example` files

**Analog:** `app/server/.env.example` (sections `# --- Common ---`, `# --- DB ---`, `# --- Auth ---`; commented optional keys `# PG_POOL_MAX=...`). Keep this layout, write comments in Russian, placeholders only; add the missing keys listed in RESEARCH Pattern 8 and the new `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`, `TEST_DATABASE_URL`, `BIO_EXAM_ISOLATED_ENV`; remove `DOCS_ROOT`. Create `app/web/.env.example` using the same layout from the zod object in `app/web/lib/env/server.ts`.

### Docs

**Analog:** the existing `README.md`/`app/server/README.md`/`AGENTS.md` (read at plan time). `AGENTS.md` keeps its CodeGraph section; add commands/scope/routing below it. `CLAUDE.md` contains `@AGENTS.md` only. Russian for prose, identifiers untouched.

## Shared Patterns

### Code style (all new TS/MJS)
Tabs, no semicolons, single quotes, width 120, Russian comments, ESM `.js` import suffixes in `app/server`, `@/` alias in `app/web`. Source: `app/web/.prettierrc.json`; observed in `config/env.ts`, `db/index.ts`, `seed.ts`.

### DB safety (every DB-touching script and test)
Read `TEST_DATABASE_URL` only; call `assertTestDatabaseUrl` (host `localhost`/`127.0.0.1`, db `^test_[a-z0-9_]+$`); never print the URL (use `safeDsn` from `app/server/src/config/env.ts:42-51`); set `BIO_EXAM_ISOLATED_ENV=1`; no skipping when the env is missing (hard failure).

### Script error handling
`main().catch((err) => { console.error(...); process.exit(1) })` as in `seed.ts` and `apply-migration.ts`; pool closed with `await pool.end()` before exit.

### Process rules
No `git commit` task anywhere. Format-only reformat and `.git-blame-ignore-revs` are `checkpoint:human-action`. The D-07 `pg_dump` against Supabase is a user-run human-action. Package versions need one consolidated `checkpoint:human-verify` before `yarn add` (RESEARCH legitimacy audit). Run `codegraph impact <symbol>` before editing `env.ts`, `db/index.ts`, `storage.ts`, `schema.ts`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/lib/test-db.mjs` (+ `verify.mjs` internals) | utility | batch | No existing `pg_ctl`/harness code; use RESEARCH Pattern 2 (LC_ALL, empty `unix_socket_directories`, UTC, non-C locale assertion) |
| `scripts/check-*.mjs` | utility | transform | No existing check scripts; RESEARCH Patterns 8 and 4c/4g |
| `app/server/vitest.config.ts`, global setup | config | batch | No Vitest anywhere; RESEARCH "Vitest configs" |
| `packages/rbac/src/index.test.ts` | test | transform | rbac has no tests; export-name smoke test |
| `.github/workflows/ci.yml` | config | batch | `.github/workflows/` does not exist; RESEARCH Pattern 10 (`.nvmrc` is `v24`) |
| `e2e/*` Playwright | test | request-response | No e2e; RESEARCH Pattern 9 (login body field is `username`; log in once per role, rate limit 5/min) |

## Metadata

**Analog search scope:** repo root configs, `app/server/{src/config,src/db,src/scripts,src/services/storage,drizzle}`, `app/web/{lib/auth,package.json,.prettierrc.json}`, `packages/rbac`.
**Files read:** about 14; RESEARCH lines 339-590 and CONTEXT in full; RESEARCH lines 591-762 (Drizzle v1 config, open questions) not read, option A material is out of scope.
**Pattern extraction date:** 2026-10-03
