# Phase 4: Authentication and web session - Pattern Map

**Mapped:** 2026-10-04
**Files analyzed:** 46 (новых и изменяемых; список по `04-CONTEXT.md` D-01...D-24 и `<code_context>`)
**Analogs found:** 40 / 46 (6 без полного аналога, см. «No Analog Found»)

Статус аналогов в git (HEAD 7a6f95a). Рабочее дерево содержит незакоммиченные изменения фаз 2 и 3, поэтому часть аналогов не в HEAD:

- **В HEAD:** `app/server/src/test-support/test-database.ts`, `app/server/src/middleware/auth/*`, `routes/auth/*`, `services/rbac/rbac.ts`, `config/auth.ts`, `packages/rbac/src/*`, `app/web/proxy.ts`, `app/web/lib/api-fetch.ts`, `lib/auth/*`, `components/providers/AuthProvider.tsx`, `e2e/auth.setup.ts`, `e2e/fixtures/exam.ts`, `app/server/drizzle/*`, `scripts/check-migrations*.mjs`.
- **Не в HEAD (untracked, фаза 2/3):** `app/server/src/test-support/http.ts`, `app/server/src/routes/tests/exam-flow.test.ts`, `app/server/src/routes/uploads.test.ts`, `app/server/src/db/answer-keys-jsonb.test.ts`, `e2e/tests/proxy-protection.spec.ts`, `scripts/exam-core-no-private-copies.test.mjs`, `packages/exam-core/`, `.planning/phases/02-dependency-security/baseline/*`. Планировщик должен учесть: к исполнению фазы 4 они уже должны быть закоммичены (`04-CONTEXT.md` «Прочее»); пути не меняются.
- Зеркал `.gsd/capabilities` в аналогах нет.

Номера строк сняты с рабочего дерева.

## File Classification

### Тесты и красные проверки (план 1)

| Новый/изменяемый файл | Роль | Поток данных | Ближайший аналог | Качество |
|---|---|---|---|---|
| `app/server/src/routes/auth/auth-characterization.test.ts` (login, refresh, logout, `/auth/me`, `requirePerm` через `app.ts`) | test | request-response + CRUD | `app/server/src/routes/tests/exam-flow.test.ts` | exact |
| `app/server/src/routes/auth/auth-known-defects.test.ts` (или в том же файле; константа `KNOWN_DEFECTS` + `test.fails`) | test | request-response | `.planning/phases/02-dependency-security/baseline/untrusted.test.ts.02-01:94-100,188-200` | exact (форма) |
| `app/server/src/db/session-backfill.test.ts` (бэкфилл 0021 с заранее вставленными refresh-токенами) | test | CRUD / batch | `app/server/src/db/answer-keys-jsonb.test.ts` | exact |
| `e2e/tests/session.spec.ts` (D8, D3 `test.fail` + `@known-defect`; logout; `/admin/users` для `user`) | test | e2e | `e2e/tests/review.spec.ts:230-310`, `e2e/tests/auth.spec.ts`, `e2e/tests/proxy-protection.spec.ts` | exact / role-match |
| `app/server/src/test-support/http.ts` (`sessionCookieFor` -> настоящая сессия) | test-support | request-response | сам файл `:9-14` | exact |
| `app/server/src/services/access-policy/*.test.ts` (табличные, синтетический реестр + in-memory адаптер) | test | transform | `packages/rbac/src/index.test.ts` (форма), `app/server/src/db/answer-keys-jsonb.test.ts` (БД-адаптер) | role-match |
| `app/server/src/routes/auth/me-requirePerm-parity.test.ts` (D-20) | test | request-response | `exam-flow.test.ts` + `requirePerm.ts` | role-match |

### Сервер: политика прав (план 2)

| Файл | Роль | Поток | Аналог | Качество |
|---|---|---|---|---|
| `app/server/src/services/access-policy/policy.ts` (чистая функция: реестр + снимок грантов -> `Set<PermissionKey>`) | service | transform | `packages/rbac/src/rbac.ts:10-40` (`expandRole` с `inherits`) + `services/rbac/rbac.ts:62-141` | exact (слияние двух) |
| `.../grants-loader.ts` (шов: Drizzle-адаптер и in-memory) | service | CRUD | `services/rbac/rbac.ts:86-103,123-136` (запросы) | role-match |
| `.../principal.ts` (мемоизация принципала на запрос) | middleware/service | request-response | `middleware/auth/session.ts:66-109` | role-match |
| `app/server/src/services/rbac/rbac.ts` | service | CRUD | сам файл: удалить кэши `:15-42`, флаги `:16-17`, `handleRbacDbError` | - |
| `app/server/src/middleware/auth/requirePerm.ts` | middleware | request-response | сам файл (33 строки) | exact |
| `app/server/src/middleware/auth/session.ts` | middleware | request-response | сам файл | exact |
| `app/server/src/routes/auth/me.ts` | controller | request-response | сам файл | exact |
| `app/server/src/routes/rbac/index.ts:91-134` | controller | CRUD | вызов модуля политики | - |
| `routes/tests/public.ts:152,196,303,409`, `routes/settings.ts:25,51`, `routes/search.ts`, `services/search/database-search.ts:84` | controller/service | request-response | `requirePerm.ts:23-33` (`requirePermKey`) | exact |
| `packages/rbac/src/rbac.ts`, `index.ts:7`, `index.test.ts` | utility (словарь) | transform | сами файлы (удалить `buildPermissionSet`, оставить `can`) | exact |

### Сервер: сессии, миграция, выдача (план 3)

| Файл | Роль | Поток | Аналог | Качество |
|---|---|---|---|---|
| `app/server/drizzle/0021_<имя>.sql` (DDL + бэкфилл) | migration | batch | `0020_short_answer_variants.sql` (формат), `0003*.sql` (refresh_tokens), `0011`/`0012` (данные + таблицы) | role-match |
| `app/server/drizzle/meta/_journal.json` (`entries[21]`), `meta/0021_snapshot.json` | config | - | `_journal.json` последняя запись `idx 20`, `meta/0020_snapshot.json` | exact |
| `app/server/drizzle/migrations-manifest.json` (`migrations[21]`) | config | - | запись `idx 20` (`when` `1784985600000`) | exact |
| `app/server/src/db/schema.ts` (таблицы сессий и троттлинга, `session_id`, `used_at`) | model | CRUD | `schema.ts:601-624` (`refreshTokens`), `:42-51` (`denyDirectAccessPolicy`) | exact |
| `app/server/src/services/session/issue.ts` (чтение cookie, выпуск, Set-Cookie без перезаписи, очистка) | service | request-response | `routes/auth/login.ts:114-153`, `refresh.ts:15-91`, `session.ts:25-59` (три копии, из них собрать одну) | exact (консолидация) |
| `app/server/src/routes/auth/login.ts`, `refresh.ts`, `logout.ts`, `routes/users/profile.ts:116-163`, `routes/users/index.ts:135-182` | controller | request-response/CRUD | сами файлы | exact |
| `app/server/src/config/auth.ts` (диапазон `ACCESS_TOKEN_EXPIRES_SEC` 60...3600, fail-fast) | config | - | `config/auth.ts:10-14` (проверка `AUTH_JWT_SECRET`) | exact |
| `app/server/src/routes/auth/revoke.ts` или `routes/users/*` (завершить все сеансы, `users.edit`) | controller | CRUD | `routes/users/index.ts` + `requirePerm('users','edit')` | role-match |

### Сервер: троттлинг (план 4)

| Файл | Роль | Поток | Аналог | Качество |
|---|---|---|---|---|
| `app/server/src/services/login-throttle/*.ts` (корзины, прогрессия, IP) | service | CRUD | `routes/auth/login.ts:55-98` (удаляемая логика), `middleware/rateLimiter.ts` | partial |
| `routes/auth/login.ts` (429 + `Retry-After`) | controller | request-response | сам файл | exact |
| Маршрут «снять ограничение входа» (`users.edit`) | controller | CRUD | как «завершить все сеансы» | role-match |
| `app/server/README.md` (runbook SQL) | docs | - | сам файл | exact |

### Web (планы 5 и 6)

| Файл | Роль | Поток | Аналог | Качество |
|---|---|---|---|---|
| `app/web/lib/session/*` (транспорт с HTTP-адаптером и фейком, single-flight, редирект, карта маршрутов -> права) | service | request-response | `lib/auth/refresh.ts`, `lib/api-fetch.ts`, `lib/auth/fetchMe.ts`, `lib/auth/getServerMe.ts` | exact (консолидация) |
| `app/web/proxy.ts` (обновление сессии при SSR) | middleware | request-response | сам файл `:16-30` | exact |
| `app/web/components/providers/AuthProvider.tsx` | provider | event-driven | сам файл `:70-127` | exact |
| `app/web/components/AppLayout/AppLayout.tsx`, `app/providers.tsx` | component | - | сами файлы (`AppLayout.tsx:27`, `providers.tsx:29`) | exact |
| `app/web/components/auth/AuthGuard.tsx`, `admin/layout.tsx`, `admin/settings/rbac/layout.tsx`, `admin/page.tsx`, `profile/[id]/page.tsx`, `admin/users/[id]/page.tsx`, `DashboardClient.tsx`, `ProfileClient.tsx`, `nav-user.tsx`, `LoginPageClient.tsx` | component | request-response | сами файлы | exact |
| `app/web/lib/auth/session.test.ts`, `redirect.test.ts` (Vitest в Node) | test | transform | `lib/auth/getServerMe.test.ts`, `loginRedirect.test.ts`, `sessionCookie.test.ts` | exact |
| Удаление: `lib/auth/server/getMeData.ts`, `app/api/auth/me/route.ts`, `lib/env/server.ts`, зависимости `pg`/`jsonwebtoken` (`package.json:86,97,133,136`), `.env.example`, `scripts/lib/e2e-web-env.mjs:51,62-63` | config | - | - | - |
| `scripts/auth-no-role-string-checks.test.mjs` (охранный, D-21) | test | file-I/O | `scripts/exam-core-no-private-copies.test.mjs` | exact |
| `e2e/playwright.config.ts:73-74`, `scripts/e2e.mjs`, `e2e/fixtures/exam.ts:58-81` | config/test | - | сами файлы | exact |

---

## Pattern Assignments

### `app/server/drizzle/0021_*.sql` + `_journal.json` + `migrations-manifest.json` (migration, batch)

**Аналоги:** `app/server/drizzle/0020_short_answer_variants.sql` (разделитель, стиль), `0003*.sql` (исходный DDL `refresh_tokens`), `scripts/check-migrations.test.mjs:137-160` (`appendMigration`: точная форма записи журнала и манифеста для 0021).

**Правила, зафиксированные в коде:**

- Журнал: ключ `entries` (не `migrations`), запись `{ "idx": 21, "version": "7", "when": <> 1784985600000, "tag": "0021_...", "breakpoints": true }`. `when` строго больше, чем у 0020 (`1784985600000`), иначе раннер в production пропустит миграцию или применит предыдущую повторно; `check-migrations` этап 1 и `check-migrations.test.mjs:115-122,163-169` это проверяют.
- Манифест: ключ `migrations`, запись `{ idx, tag, file, sha256, when, breakpoints }`, `checksumAlgorithm: "sha256"`. `sha256` считается по байтам `.sql` файла: после ручного дописывания бэкфилла сумму пересчитать (`check-migrations.test.mjs:144-152`: `crypto.createHash('sha256').update(sql).digest('hex')`).
- Снимок `meta/0021_snapshot.json` создаёт `drizzle-kit generate`; этап 4 (`generate-no-diff`) требует, чтобы повторный `generate` не менял файлов, то есть `schema.ts` и снимок совпадают.
- Разделитель операторов: `--> statement-breakpoint` (`scripts/check-migrations.mjs:STATEMENT_BREAKPOINT`). Бэкфилл `INSERT ... SELECT` и `UPDATE` отделять им.
- Только добавление (ни `DROP`, ни `RENAME`): этап 4 печатает DROP как STOP по плану 009.
- Колонки `users.failed_login_attempts`, `users.locked_until`, индекс `idx_users_locked_until` остаются.

**Форма бэкфилла (D-09), вставить в тот же SQL после DDL:**

```sql
INSERT INTO "auth_sessions" ("id", "user_id", "created_at", "last_refreshed_at")
SELECT "id", "user_id", "created_at", "created_at"
FROM "refresh_tokens"
WHERE "revoked_at" IS NULL AND "expires_at" > now();
--> statement-breakpoint
UPDATE "refresh_tokens" SET "session_id" = "id"
WHERE "revoked_at" IS NULL AND "expires_at" > now();
```

(имена таблицы сессий и колонок — Discretion; приведено как форма. `session_id` в DDL должен быть nullable либо добавлен без NOT NULL: отозванные и истёкшие токены остаются без сессии.)

**Проверка бэкфилла:** `check-migrations` на пустой базе бэкфилл ничего не затрагивает, поэтому отдельный DB-тест (см. `session-backfill.test.ts` ниже). Он не может применить «до 0020, потом вставить, потом 0021» через `migrateTestDatabase` (мигратор применяет всё). Приём: `createScratchDatabase`, затем применить SQL миграции 0000...0020 вручную нельзя; рабочий вариант: `migrateTestDatabase`, вставить токены без `session_id`, затем выполнить текст бэкфилла из файла 0021 повторно (прочитать из `app/server/drizzle/0021_*.sql`, разбить по `--> statement-breakpoint`, взять операторы `INSERT INTO "auth_sessions"`/`UPDATE "refresh_tokens"`). Выбор приёма за планировщиком (Claude's Discretion).

**Обновить после появления 0021:** строки «0000-0020» в комментариях `scripts/check-migrations.mjs:8` и `scripts/compare-schema-dump.mjs:2` (не обязательно, текст), фикстуры `scripts/check-migrations.test.mjs` используют `idx: 21` как «следующую» запись и после добавления настоящей 0021 перестанут быть «следующими»: `appendMigration` (`:137`) и тесты `:74-77,163-175` нужно сдвинуть на `idx: 22`/`0022_*`. Это место для проверки планировщиком.

**Новые таблицы в `schema.ts`** (копировать форму `refreshTokens`, `schema.ts:601-624`):

```typescript
export const refreshTokens = pgTable(
	'refresh_tokens',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id').notNull(),
		tokenHash: text('token_hash').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		createdByIp: text('created_by_ip'),
	},
	(t) => ({
		tokenHashIdx: index('idx_refresh_tokens_token_hash').on(t.tokenHash),
		expiresAtIdx: index('idx_refresh_tokens_expires_at').on(t.expiresAt),
		userIdFk: foreignKey({
			name: 'refresh_tokens_user_id_fkey',
			columns: [t.userId],
			foreignColumns: [users.id],
		}).onDelete('cascade'),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()
```

Для каждой новой таблицы: `denyDirectAccess: denyDirectAccessPolicy()` (функция, а не общая константа, `schema.ts:36-51`) и `.enableRLS()`; FK с явным `name` и `.onDelete('cascade')` на `users.id`. `refresh_tokens` получает `session_id` (FK cascade на таблицу сессий, индекс) и `used_at` (`timestamp with time zone`). Выкатка: аддитивна, старый код с ней работает (D-24).

---

### `app/server/src/db/session-backfill.test.ts` и все DB-тесты (test, CRUD)

**Аналог:** `app/server/src/db/answer-keys-jsonb.test.ts` (117 строк, не в HEAD) + `app/server/src/test-support/test-database.ts` (в HEAD).

**Шаблон жизненного цикла** (`answer-keys-jsonb.test.ts:1-48`):

```typescript
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	createScratchDatabase,
	migrateTestDatabase,
	requireTestDatabaseUrl,
	type ScratchDatabase,
} from '../test-support/test-database.js'
import * as schema from './schema.js'

let scratch: ScratchDatabase | null = null
let pool: Pool | null = null
let db: NodePgDatabase<typeof schema>

beforeAll(async () => {
	requireTestDatabaseUrl()
	scratch = await createScratchDatabase('test_answer_keys')
	await migrateTestDatabase(scratch.url)
	pool = new Pool({ connectionString: scratch.url })
	db = drizzle(pool, { schema })
	// ... вставка фикстур через db.insert(schema.X).values(...).returning(...)
}, 60_000)

afterAll(async () => {
	await pool?.end()
	await scratch?.drop()
})
```

Контракт `test-database.ts`: `requireTestDatabaseUrl()` (`:37-45`) без `TEST_DATABASE_URL` бросает исключение (никаких пропусков, D-03); `createScratchDatabase(prefix)` (`:62-79`) требует `^test_[a-z0-9_]+$`, создаёт `<prefix>_<pid>_<hex>`, `drop()` с `WITH (FORCE)`; `migrateTestDatabase(url)` (`:85-92`) тот же мигратор `drizzle-orm/node-postgres/migrator` с `migrationsSchema: 'public'`. Префикс для фазы: `test_auth_sessions`, `test_auth_throttle`, `test_auth_flow`. Запуск: `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test` (`AGENTS.md`).

Утверждения через `node:assert/strict`, сырые проверки типа через `pool.query` (`answer-keys-jsonb.test.ts:70-78`). Для replay-теста (D-07, окно 30 с) сдвиг `used_at` в прошлое: `await pool.query('UPDATE refresh_tokens SET used_at = now() - interval \'31 seconds\' WHERE ...')` или часы, переданные модулю (Discretion).

---

### `app/server/src/routes/auth/auth-characterization.test.ts` (test, request-response через `app.ts`)

**Аналог:** `app/server/src/routes/tests/exam-flow.test.ts` (не в HEAD; ту же форму использует `routes/uploads.test.ts`).

**Подготовка окружения** (`exam-flow.test.ts:1-60`): `vi.hoisted` + `vi.mock` для хранилища (в тестах авторизации не нужно), `startTestServer(app)` из `test-support/http.ts`, динамический импорт `app.ts` и `db/index.js` после выставления `process.env.TEST_DATABASE_URL`/`DATABASE_URL` на scratch-базу (`previousTestDatabaseUrl` в `:48`, типы `DbModule`/`SchemaModule`). Читать целиком `exam-flow.test.ts:60-140` при планировании (порядок: `createScratchDatabase`, `migrateTestDatabase`, подмена env, `await import('../../db/index.js')`, `await import('../../app.js')`, `startTestServer(app.default)`).

`test-support/http.ts` (32 строки, не в HEAD):

```typescript
export function sessionCookieFor(user: { id: string; roles: RoleKey[]; login?: string | null }): string {
	const token = jwt.sign({ sub: user.id, roles: user.roles, login: user.login ?? null }, AUTH_CONFIG.jwtSecret, {
		expiresIn: '10m',
	})
	return `${AUTH_CONFIG.sessionCookieName}=${encodeURIComponent(token)}`
}

export function startTestServer(app: Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
	return new Promise((resolve, reject) => {
		const server = app.listen(0, '127.0.0.1')
		server.once('error', reject)
		server.once('listening', () => {
			const { port } = server.address() as AddressInfo
			resolve({
				baseUrl: `http://127.0.0.1:${port}`,
				close: () =>
					new Promise<void>((done, fail) => {
						server.close((error) => (error ? fail(error) : done()))
						server.closeAllConnections()
					}),
			})
		})
	})
}
```

**Что менять по D-19:** характеризационные тесты входят через `POST /api/auth/login` (cookie настоящие, переживают смену формата токена), а не через `sessionCookieFor`: старый `sessionCookieFor` подписывает голый JWT с `roles` без `sid`, он перестанет работать после плана 3. В плане 3 `sessionCookieFor` переписывается на выпуск настоящей сессии через модуль выдачи (D-10); сигнатуру сохранить, чтобы `uploads.test.ts` и `exam-flow.test.ts` остались зелёными. Флаги D-02 (`AUTH_SESSION_ENFORCE_DB=1`, `RBAC_USE_DB_OVERRIDES=1`) задаются до импорта `app.ts` (`process.env.X = '1'` перед `await import`), как в e2e (`e2e/playwright.config.ts:73-74`); в плане 2 они удаляются вместе с флагами.

---

### Красные проверки: `KNOWN_DEFECTS` + `test.fails` (test, request-response)

**Аналог (форма):** `.planning/phases/02-dependency-security/baseline/untrusted.test.ts.02-01:94-100,188-200`. Это сохранённая копия; рабочий `app/web/lib/mdx/untrusted.test.ts` после 02-08 константу уже не содержит (`02-08-SUMMARY.md:68`). Не искать `KNOWN_HOLES` в коде: есть только в baseline и в `STATE.md:92`.

```typescript
const KNOWN_HOLES = new Set([
	'выражение в блоке',
	'выражение в абзаце',
	'выражение в атрибуте onError',
	'элемент script',
	'iframe srcdoc со скриптом',
])

// ...внутри цикла по случаям:
	if (KNOWN_HOLES.has(payload.name)) {
		test.fails(`${payload.name} не исполняется — исправляется в Группе 4 (DEP-03)`, async () => {
			// тело проверки как у обычного теста
		})
	} else {
		test(`${payload.name} не исполняется`, async () => {
			// то же тело
		})
	}
```

**Применение в фазе 4:** `const KNOWN_DEFECTS = new Set([...])` с шестью именами из D-19 (роль снята после выдачи токена; после logout старый access проходит; два параллельных refresh дают двух преемников; пять неудач с чужого IP блокируют владельца; allow `tests.read` даёт 403 на `public.ts:303`; расхождение `/auth/me` и `requirePerm` при ошибке БД прав). Тело проверки пишется один раз и описывает ЦЕЛЕВОЕ поведение; метка `test.fails` в плане, который чинит дефект, снимается удалением имени из константы. План, который чинит, обязан удалить имя из `KNOWN_DEFECTS` (иначе `test.fails` покраснеет). В имени теста — ссылка на фазу/требование (`AUTH-02`, ...) по образцу `исправляется в Группе 4 (DEP-03)`. Планировщику закрепить в `<verify>` плана проверку «константа пуста после плана N».

---

### `e2e/tests/session.spec.ts` (e2e, `test.fail` + `@known-defect`)

**Аналог:** `e2e/tests/review.spec.ts:230-310` (трекается, но правка D1 в рабочем дереве).

```typescript
test('D1 setup: ... @known-defect', async ({ browser }, testInfo) => {
	// обычный тест, сбой красный: подготовка состояния
	student = await newSessionContext(browser, testInfo, 'user')
	...
})

test.afterAll(async () => {
	await student?.close()
	await admin?.close()
})

test.fail(
	'D1 — fixed in Phase 5 (SCORE-03): admin review of an earlier attempt is unchanged @known-defect',
	async () => {
		const after = await adminReviewSections(adminPage!, attemptId, reviewTest.questions.length)
		expect(after, '...').toEqual(before)
	}
)
```

Правила формы: подготовка отдельным обычным тестом (красный при сбое), единственное падающее утверждение в `test.fail(...)`, в заголовке `fixed in Phase N (ID)` и тег `@known-defect`; `test.describe.serial`-контекст с общими `student`/`admin`/`attemptId`. В фазе 4 переключается (снятие `test.fail`) в плане 5 для D8 и D3. Контекст со своим входом (D-23): D8 вращает refresh, поэтому НЕ `newSessionContext` (общий `storageState`), а `browser.newContext()` + `context.request.post('/api/auth/login', { data: { username, password: E2E_PASSWORD } })` (форма входа из `e2e/auth.setup.ts:16-22`, `E2E_PASSWORD` и `storageStateAccounts()` из `e2e/fixtures/accounts`).

**D8:** `context.clearCookies({ name: 'bio_exam_session' })` затем `page.goto('/profile/<login>')`; ожидание `not.toHaveURL(/\/login/)`. До плана 5 серверная страница с `redirect` при `getServerMe() === null` уходит на `/login`, поэтому утверждение в `test.fail`.

**D3:** `page.on('request', r => r.url().includes('/api/auth/me'))`, затем `page.goto('/dashboard')` с действующей сессией; ожидание: ноль клиентских `/api/auth/me` и `/api/auth/refresh`. До плана 5 браузер делает `/api/auth/me` (и двойной refresh в `AuthProvider`), поэтому `test.fail`.

**Матрица `@proxy`** (`e2e/tests/proxy-protection.spec.ts`, не в HEAD) должна остаться зелёной без изменения ожиданий (D-14): запросы идут без cookie, `request.get(path, { maxRedirects: 0 })`, ожидание `307` с `/login?callbackUrl=<путь>`:

```typescript
function expectLoginRedirect(res: APIResponse, baseURL: string | undefined, expectedCallback: string): void {
	expect(res.status()).toBe(LOGIN_REDIRECT_STATUS)
	const location = res.headers()['location']
	const target = new URL(location, baseURL)
	expect(target.pathname).toBe('/login')
	expect(target.searchParams.get('callbackUrl')).toBe(expectedCallback)
}
```

Новая функция редиректа из D-13 должна давать ровно `new URL('/login', req.url)` + `searchParams.set('callbackUrl', pathname+search)`, а варианты заголовков (`RSC`, `Next-Router-Prefetch`, `x-middleware-subrequest`, ...) не должны обходить refresh-ветку.

**Удалить после D-15:** `e2e/fixtures/exam.ts:68-77` (`addInitScript` с ключом `auth_refresh_cookie_migrated_v2`) и сопровождающий комментарий `:68-71`. `e2e/playwright.config.ts:73-74` (`AUTH_SESSION_ENFORCE_DB`, `RBAC_USE_DB_OVERRIDES` в `env` Express) удалить; добавить `ACCESS_TOKEN_EXPIRES_SEC: '3600'` (D-23). `auth.setup.ts` сохраняется; комментарий про «лимит 5 входов в минуту» (`:2`) устаревает.

---

### `app/server/src/services/access-policy/policy.ts` (service, transform)

**Аналоги:** `packages/rbac/src/rbac.ts:1-40` (разворот `inherits`, перенос в сервер), `app/server/src/services/rbac/rbac.ts:62-141` (allow/deny из БД).

**Разворот ролей с `inherits`** (`packages/rbac/src/rbac.ts:4-40`, переносимо как есть, но с реестром параметром вместо глобального `ROLE_REGISTRY`):

```typescript
function expandRole(roleKey: RoleKey, seen: Set<RoleKey> = new Set()): Set<PermissionKey> {
	if (seen.has(roleKey)) return new Set<PermissionKey>()
	seen.add(roleKey)
	const cfg: RoleConfig | undefined = ROLE_REGISTRY[roleKey] as unknown as RoleConfig | undefined
	const base = expandGrants(cfg?.grants)
	const parents = (cfg?.inherits ?? []) as RoleKey[]
	for (const rk of parents) {
		if (!(rk in ROLE_REGISTRY)) continue
		for (const k of expandRole(rk, seen)) base.add(k)
	}
	return base
}
```

Циклы и неизвестные роли пропускаются (`seen`, `rk in ROLE_REGISTRY`), как требует D-01. `ROLE_REGISTRY` сейчас без `inherits` (`roles.ts:18-31`), `RoleConfig.inherits?: RoleKey[]` (`roles.ts:14`) есть; проверка `inherits` идёт на синтетическом реестре в тесте.

**Allow/deny из БД** (`services/rbac/rbac.ts:94-99,127-132`, порядок: роли -> `rbac_role_grants` -> `rbac_user_grants`):

```typescript
for (const r of rows) {
	const domain = r.domain as PermissionDomain
	const key = `${domain}.${r.action}` as PermissionKey
	if (r.allow) base.add(key)
	else base.delete(key) // deny снимает базовое право
}
```

Разворот `'*'` (`rbac.ts:52-59` `addAllActionsOfDomain`, и `expandDomainGrant` в пакете). Из `services/rbac/rbac.ts` в модуль переходят: `isValidAction` (`:45-50`, используется маршрутами rbac), построение набора; удаляются: `rolesCache`, `userCache`, `invalidateRBACCache` (`:30-42`), `CACHE_TTL_MS`, `failOpenOnRbacDbError`, `useDbOverrides`, `handleRbacDbError` (`:15-28`), `if (DEBUG_ENV)` лог. Ошибка запроса грантов пробрасывается (fail-closed). Вызовы `invalidateRBACCache` удаляются в `routes/users/index.ts:177,246`, `routes/rbac/index.ts:60,82,159,180`.

**Шов загрузчика грантов (форма, Claude's Discretion):**

```typescript
export type GrantsSnapshot = {
	roles: string[]
	roleGrants: Array<{ roleKey: string; domain: string; action: string; allow: boolean }>
	userGrants: Array<{ domain: string; action: string; allow: boolean }>
}
export interface GrantsLoader { load(userId: string): Promise<GrantsSnapshot> }
```

Drizzle-адаптер берёт те же три запроса, что и сейчас (`userRoles` по `userId`, `rbacRoleGrants` по `inArray(roleKey, roles)`, `rbacUserGrants` по `userId`; импорты `rbacRoleGrants, rbacUserGrants, userRoles` из `../../db/schema.js`, `eq`/`inArray` из `drizzle-orm`). In-memory адаптер для табличных тестов и parity (D-20).

**Мемоизация на запрос (D-03):** принципал (`sid`-сессия, пользователь, роли, гранты) читается один раз на запрос и кладётся на `req` (расширение `declare module 'express-serve-static-core'` как в `session.ts:17-21`). `requirePerm`, `requirePermKey`, `/auth/me`, `routes/search.ts`, `GET /api/rbac/user/:id/grants` берут права из принципала; никаких межзапросных кэшей.

---

### `app/server/src/middleware/auth/requirePerm.ts` и `session.ts` (middleware, request-response)

**Аналог:** сами файлы. `requirePerm.ts` (33 строки) уже имеет нужную форму: два экспорта (`requirePerm(domain, action)`, `requirePermKey(key)`), 401 при отсутствии `authUser?.id`, 403 при отсутствии ключа.

```typescript
export function requirePerm<D extends PermissionDomain>(domain: D, action: ActionOf<D>): RequestHandler {
	return (async (req, res, next) => {
		const u = (req as unknown as { authUser?: AuthUserLike | null }).authUser
		if (!u?.id) return res.status(401).json({ error: 'Unauthorized' })

		const perms = await buildPermissionSetForUser(u.id)
		const key = `${domain}.${action}` as PermissionKey
		if (!perms.has(key)) return res.status(403).json({ error: 'Forbidden' })

		next()
	}) as RequestHandler
}
```

Менять только источник `perms` (`buildPermissionSetForUser` -> набор из принципала запроса/модуля политики) и тип `AuthUserLike` (`roles?` убрать). Не менять коды 401/403 и порядок проверок: parity-тест D-20 сравнивает исход `requirePermKey` с `perms` из `/api/auth/me` для каждого `PermissionKey`. Важно: ошибка БД прав теперь даёт ответ с ошибкой (500 через `next(err)`), а не запасной набор.

**`session.ts` (план 2 и 3):** `sessionOptional()`/`sessionRequired()` сохраняют структуру (`:66-123`, `sessionRequired` повторно использует `opt`). Что удаляется: `readCookie` (`:25-38`, переезжает в модуль выдачи), `setSessionCookie`/`clearSessionCookie` (`:40-59`), `enforceDbSessionCheck` (`:64`), ветка `if (!enforceDbSessionCheck)` (`:83-86`), `jwtRoles`, объединение ролей (`:97-100`). Что добавляется: проверка `sid` (сессия существует, не отозвана, пользователь активен, D-05). Ветка `catch -> authUser = null` (`:104-107`) для ошибок БД: решить явно (fail-closed на ошибку БД сессии = 401/500, а не молчаливый анонимный запрос), проверить характеризационным тестом.

`middleware/auth/basic-admin.ts` (66 строк): вызовов нет по D (Discretion); подтвердить `codegraph_explore`/`codegraph impact basicAdmin` перед удалением вместе с `ADMIN_LOGIN`, `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD` в `.env.example`.

---

### `app/server/src/services/session/issue.ts` (service, request-response; D-10)

**Источники для консолидации** (три копии, все читать при планировании):

- `readCookie`: `session.ts:25-38`, `refresh.ts:15-28`, `logout.ts:11-24`. Единая реализация (одна и та же):

```typescript
function readCookie(req: Request, name: string): string | null {
	const raw = req.headers.cookie
	if (!raw) return null
	const found = raw
		.split(';')
		.map((p) => p.trim())
		.find((p) => p.startsWith(name + '='))
	if (!found) return null
	try {
		return decodeURIComponent(found.split('=').slice(1).join('='))
	} catch {
		return null
	}
}
```

- Склейка Set-Cookie без перезаписи (`login.ts:145-153`, `refresh.ts:83-91`; повтор во `logout.ts:40-63`):

```typescript
const prev = res.getHeader('Set-Cookie')
if (!prev) {
	res.setHeader('Set-Cookie', refreshCookie)
} else if (Array.isArray(prev)) {
	res.setHeader('Set-Cookie', [...prev, refreshCookie])
} else {
	res.setHeader('Set-Cookie', [String(prev), refreshCookie])
}
```

  Единая `appendSetCookie(res, cookie)` вместо `res.setHeader` в `setSessionCookie` (`session.ts:50`, перезапись: этот баг и есть причина ручной склейки).
- Атрибуты cookie (`session.ts:41-49`): `Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age=<сек>`, `Secure` только при `NODE_ENV === 'production'`. Имена: `AUTH_CONFIG.sessionCookieName` (`bio_exam_session`), `refresh_token`. Refresh-cookie на `Path=/` (читает `proxy.ts`). Очистка со старым `Path=/api/auth/refresh` (`logout.ts:49-56`) удаляется.
- Выпуск access (`login.ts:114-117`, `refresh.ts:49-50`): `jwt.sign({ sub, login, ... }, AUTH_CONFIG.jwtSecret, { expiresIn: `${ACCESS_EXPIRES_SEC}s` })`. Новое: claims `sub`, `sid`, `login` (без `roles`) и у login, и у refresh (AUTH-07: сейчас refresh-токен без `login`).
- Выпуск refresh (`login.ts:120-130`): `crypto.randomBytes(64).toString('hex')`, в БД `sha256` (`crypto.createHash('sha256').update(raw).digest('hex')`), `expiresAt = now + REFRESH_EXPIRES_DAYS * 86400000`, `createdByIp: req.ip || req.socket.remoteAddress || null`.

**Refresh (D-07), атомарный захват**, заменяет `refresh.ts:38-71` (там `select` затем `update` вне условия: две параллельные заявки оба проходят). Основа: `db.transaction(async (tx) => { ... })` (уже используется `refresh.ts:60`), внутри условный `UPDATE refresh_tokens SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING *`; пустой результат -> ветка повтора (в окне 30 с при живой сессии: только новый access; позже или у токена с преемником: отзыв всей сессии `revoke_reason = 'replay'`, 401, лог). Cookie выставляются ТОЛЬКО после выхода из транзакции (сейчас access-cookie ставится до commit, `refresh.ts:52`, это и нужно поменять); ошибка транзакции -> 500 без `Set-Cookie`. Лимитер (`refresh.ts:30`, `rateLimiter({ maxAttempts: 10, ... })`) снимается.

**Ошибка/ответ:** `ERROR_MESSAGES.UNAUTHORIZED` из `lib/constants.js` (`res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })`), 500: `console.error('Refresh token error', e)` + `res.status(500).json({ error: 'Internal Server Error' })` (в `refresh.ts:94-98`; в login — `next(e)` в централизованный обработчик, предпочесть).

**Конфиг (`config/auth.ts`):** fail-fast образец (`:10-14`):

```typescript
if (process.env.NODE_ENV === 'production') {
	if (!process.env.AUTH_JWT_SECRET || jwtSecret === DEFAULTS.JWT_SECRET) {
		throw new Error('AUTH_JWT_SECRET must be set to a non-default value in production')
	}
}
```

Добавить в `AUTH_CONFIG` разбор `ACCESS_TOKEN_EXPIRES_SEC` (по умолчанию 900, диапазон 60...3600, значение вне диапазона или не число -> `throw new Error(...)` при импорте, во всех средах). Читают его сейчас `login.ts:114`, `refresh.ts:49` через `Number(process.env.ACCESS_TOKEN_EXPIRES_SEC ?? AUTH_CONFIG.sessionMaxAgeSec)`; `sessionMaxAgeSec` для access больше не использовать. Новых env-ключей нет, поэтому `scripts/check-env-contract.mjs` не требует правок для добавления; для удалённых флагов (`AUTH_SESSION_ENFORCE_DB`, `RBAC_USE_DB_OVERRIDES`, `RBAC_DB_FAIL_OPEN`, при удалении `basic-admin.ts` — `ADMIN_*`) убрать строки из `app/server/.env.example`, затем прогнать `yarn verify` (шаг `env-contract`).

---

### `app/server/src/services/login-throttle/*.ts` (service, CRUD)

**Аналогов в коде нет по назначению** (хранилище в PostgreSQL); частичные: удаляемая логика `routes/auth/login.ts:55-98` (определение «пары» и ответы), `middleware/rateLimiter.ts` (форма ключей `keyPrefix`) и общая форма нового модуля как у `services/rbac/rbac.ts` (импорт `db`, схем, запрос Drizzle). Форма ответа блокировки (D-11): `429` с заголовком `Retry-After`, одинаковым для существующих и несуществующих логинов; bcrypt не выполняется; DUMMY_HASH-ветка (`login.ts:17-19,78-80`, защита от timing) сохраняется для случая «не заблокирован»:

```typescript
const hashToCompare = u?.passwordHash || DUMMY_HASH
const passwordMatches = await bcrypt.compare(password, hashToCompare)
```

Ключ логина: `(username ?? '').toLowerCase().trim()` (`login.ts:49`). Ответы 401 `ERROR_MESSAGES.INVALID_CREDENTIALS`, 403 `ACCOUNT_NOT_ACTIVATED` (`login.ts:97,101`) без изменений; удаляются 403 `ACCOUNT_LOCKED` (`:73-76`), `updateLoginGuardFields` (`:21-37`), обнуление счётчиков (`:104-107`), лимитер (`:54-69`) и `loginRateLimiter` в `rateLimiter.ts:101-105`. Отсчёт числами-константами в коде (D-11). Одна функция определения IP (D-12): за `trust proxy 1` (`app.ts:22`), до подтверждения preview корзина «IP по всем логинам» выключена, пара (логин, IP) вырождается в корзину логина.

Сопутствующие тесты на `test_*` (`createScratchDatabase('test_auth_throttle')`), в образце `answer-keys-jsonb.test.ts`; «часы» передаются модулю параметром, чтобы тест не ждал.

---

### `app/web/proxy.ts` (middleware, request-response; Next 16)

**Аналог:** сам файл (34 строки).

```typescript
export function proxy(req: NextRequest) {
	const { pathname, search } = req.nextUrl
	const hasSession = SESSION_COOKIE_CANDIDATES.some((cookieName) => Boolean(req.cookies.get(cookieName)?.value))
	const hasRefresh = Boolean(req.cookies.get(REFRESH_COOKIE_NAME)?.value)

	if (isPublicPath(pathname)) {
		return NextResponse.next()
	}

	if (hasSession || hasRefresh) return NextResponse.next()

	const loginUrl = new URL('/login', req.url)
	loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`)
	return NextResponse.redirect(loginUrl)
}

export const config = {
	matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|uploads).*)'],
}
```

Экспорт называется `proxy` (Next 16, не `middleware`), `config.matcher` без изменений (D-14). Импорт `getSessionCookieCandidates` из `@/lib/auth/sessionCookie`. Новое: функция становится `async`, добавляется ветка: страничный запрос, есть refresh-cookie, нет access-cookie, или он истекает в ближайшие 60 с, или без `sid` (payload JWT читается без проверки подписи, `atob`/`Buffer.from(part, 'base64url')`; секрета в web нет). Тогда `fetch(new URL('/api/auth/refresh', API_ORIGIN), { method: 'POST', headers: { cookie: req.headers.get('cookie') ?? '' }, cache: 'no-store', redirect: 'manual' })`; `Set-Cookie` ответа переносится в ответ proxy (`response.headers.getSetCookie()` -> `res.headers.append('set-cookie', c)`), новые cookie подставляются в заголовок запроса для RSC: `NextResponse.next({ request: { headers } })` (прочитать `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:243-255` и раздел про изменение заголовков запроса и cookie; AGENTS.md не нужен, правило Next 16 для web: сверять с этим документом). Не удался refresh -> очистить cookie, редирект на `/login?callbackUrl=...` общей функцией D-13. Источник `API_ORIGIN`: `process.env.API_ORIGIN` обязательный (явная ошибка конфигурации, не тихий null; сейчас `getServerMe.ts:12-13` его читает мягко).

Публичные пути (`PUBLIC_PATHS`, `PUBLIC_PREFIXES` `:8-14`) без изменений. Тестирование: `proxy.ts` не импортируется Vitest-ом сейчас; чистые части (решение «нужен ли refresh», разбор payload, построение редиректа) вынести в `app/web/lib/session/*` и покрыть Vitest в Node; сам proxy покрывается матрицей `@proxy` и e2e D8.

---

### `app/web/lib/session/*` (service, request-response; D-13)

**Аналоги (консолидировать):** `lib/auth/refresh.ts` (single-flight), `lib/api-fetch.ts` (401 -> refresh -> retry), `lib/auth/fetchMe.ts`, `lib/auth/getServerMe.ts`, `lib/auth/loginRedirect.ts`, `login/LoginPageClient.tsx:16-36` (`safeRedirect`).

**Single-flight** (`lib/auth/refresh.ts` целиком, 17 строк, ядро цепочки):

```typescript
let refreshRequest: Promise<boolean> | null = null

export async function tryRefreshSession(): Promise<boolean> {
	if (refreshRequest) return refreshRequest

	refreshRequest = fetch('/api/auth/refresh', {
		method: 'POST',
		credentials: 'include',
	})
		.then((response) => response.ok)
		.catch(() => false)
		.finally(() => {
			refreshRequest = null
		})

	return refreshRequest
}
```

**Цепочка 401 -> refresh -> retry** (`lib/api-fetch.ts:10-21`):

```typescript
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
	const opts: RequestInit = { credentials: 'include', ...init }
	const response = await fetch(url, opts)
	if (response.status === 401) {
		const refreshed = await tryRefreshSession()
		if (!refreshed) throw new AuthExpiredError()
		const retry = await fetch(url, opts)
		if (retry.status === 401) throw new AuthExpiredError()
		return retry
	}
	return response
}
```

Публичный интерфейс `apiFetch`, `AuthExpiredError` (24 потребителя) сохранить (граница Phase 8); `fetchAuthMe`, `tryRefreshSession` переезжают в модуль. Из `fetchMe.ts:12-17` удаляется ветка «200 с `ok:false` -> refresh» (Express теперь отвечает 401). Удалить `lib/auth/fetchMe.ts` после переезда, потребители: `AuthProvider.tsx`, `LoginPageClient.tsx`, `InviteClient.tsx`.

**Шов (D-13):** транспорт сессии как интерфейс (`refresh(): Promise<boolean>`, `me(): Promise<Response>`, `logout()`), HTTP-адаптер и фейк для Vitest (Node, без DOM, `04-CONTEXT.md` Established Patterns).

**SSR-пользователь** (`lib/auth/getServerMe.ts:10-30`): `cache(async ...)` из `react`, `cookies()` из `next/headers`, `import 'server-only'`, `fetch(new URL('/api/auth/me', apiOrigin), { headers: { cookie: cookieStore.toString() }, cache: 'no-store', redirect: 'error' })`, `parseAuthMe(body)`. Удаляется ветка `getMeData` (`:25-26`), `API_ORIGIN` обязателен. Тест `lib/auth/getServerMe.test.ts` переписывается на транспорт модуля (D-18).

**`parseAuthMe`** (`lib/auth/authMePayload.ts`): добавить `accessExpiresAt` аддитивно (тип `AuthMe` `:3-20` и разбор; форма `asNullableString`/`asNullableNumber` `:27-33`). Контракт не ломается.

**Редирект и callback (D-13):** одна функция построения `/login?callbackUrl=...` и одна проверка callback вместо `proxy.ts:27-29`, `AuthGuard.tsx:48-54`, `loginRedirect.ts`, `LoginPageClient.tsx:16-36`. Правило: принимать только путь того же origin; `//host` и `/\host` отклонять (`decoded.startsWith('/')` сейчас пропускает `//evil.example`). Тест — расширить `lib/auth/loginRedirect.test.ts` (в HEAD) и перенести в `lib/session/redirect.test.ts`; кейсы `//evil.example`, `/\evil.example`, `/\\evil`, `https://evil`, `javascript:`, закодированные `%2F%2Fevil`.

**Карта «префикс маршрута -> права» (D-17):** один модуль, `can(perms, key)` из `@bio-exam/rbac` (`packages/rbac/src/rbac.ts:42-57`), НЕ `buildPermissionSet`. Ключи как в D-17; `PermissionKey` из `@bio-exam/rbac`.

---

### `app/web/components/providers/AuthProvider.tsx` (provider, event-driven)

**Аналог:** сам файл (156 строк).

Что сохраняется: форма контекста (`me`, `perms`, `loading`, `avatarVersion`, `refresh`, `can`, `canKey`, `:132-142`), перегрузка `can` (`:121-130`):

```typescript
function canOverload(a: unknown, b?: unknown): boolean {
	if (typeof a === 'string' && b === undefined) {
		return canRbac(perms, a as PermissionKey)
	}
	if (typeof a === 'string' && typeof b === 'string') {
		return canRbac(perms, a as PermissionDomain, b as ActionOf<PermissionDomain>)
	}
	return false
}
```

обработчик `storage` для `logout`/`auth-change`/`avatar-changed` (`:90-95`) и `visibilitychange` (`:97-106`) сохраняются между вкладками (Discretion). Что удаляется: эффект «миграции cookie» `:70-84` (голый `fetch('/api/auth/refresh')`, ключ `auth_refresh_cookie_migrated_v2`). Что меняется: опрос раз в 10 минут (`:108-114`) идёт в модуль веб-сессии через single-flight; добавляется проактивный refresh за 60 с до `accessExpiresAt` (таймер, пока вкладка видима, и сразу при возврате на вкладку после истечения, D-16); `useEffect` на `initialMe == null` (`:62-66`) остаётся (клиентская загрузка только без SSR-данных).

**Один экземпляр (D-15):** `AppLayout.tsx:27` (`<AuthProvider initialMe={me}>`, SSR `getServerMe`) остаётся; из `app/providers.tsx:29-31` обёртка удаляется (файл `app/providers.tsx` — смотреть, какие провайдеры остаются).

---

### `app/web/components/auth/AuthGuard.tsx`, layouts, гейты UI (component, request-response; D-17)

**Аналоги:** сами файлы; серверный `notFound()` как на `profile/[id]/page.tsx` и `admin/users/[id]/page.tsx` (нет права -> `notFound()`). Серверная проверка в layout каждого поддерева (RSC, до рендера): `const me = await getServerMe(); if (!me) redirect(...)`; затем `can(new Set(me.perms), key)`. Клиентский `AuthGuard` проверяет тем же списком из карты. Удалить: обход `isAdmin` (`AuthGuard.tsx:61-63`), общий `rbac.*` гейт (`admin/layout.tsx:4`), `roles.includes('admin')` в `profile/[id]/page.tsx:15`, `admin/users/[id]/page.tsx:42`, `DashboardClient.tsx:181-182`, `ProfileClient.tsx:109,241`. Заменить на проверки по D-17 (`tests.manage_assignments`, `can('tests','read')`, `users.edit`). Вид «нет доступа» — по `04-UI-SPEC.md` (approved).

---

### `scripts/auth-no-role-string-checks.test.mjs` (test, file-I/O; D-21)

**Аналог:** `scripts/exam-core-no-private-copies.test.mjs` (не в HEAD; `node:test`, без Vitest).

Каркас (`:1-12,150-185`): `REPO_ROOT` через `import.meta.url`; `SCAN_ROOTS = ['app/web', 'app/server/src']`; `SKIPPED_DIRS` (`node_modules`, `.next`, `.turbo`, `.vercel`, `dist`, `out`, `coverage`); `SOURCE_FILE`/`TEST_FILE` regex; `collectSources(relativeDir)` с рекурсивным `walk`; `isExempt(file, name)`; `escapeRegExp`; блок детектора `test('детектор находит ...')` (тест самого детектора), основной `test('в app/web ...')`, тест исключений D-19 «указывает на существующее объявление» (аналог: для D-04 исключений проверять, что файл и строка существуют: `routes/tests/index.ts:2471,2551`, `routes/rbac/index.ts:48,74,148`). Проверять (D-21): нет импорта `pg`, `jsonwebtoken`, чтения `DATABASE_URL`, `AUTH_JWT_SECRET` и `roles.includes(`/`isAdmin` для доступа в `app/web`; нет решений о доступе по строкам ролей в `app/server/src/routes`, `middleware`, `services`, исключения поимённо; `packages/rbac` не экспортирует `buildPermissionSet` (читать `packages/rbac/src/index.ts`).

Файл должен выбираться раннером `script-tests` в `yarn verify` (проверить шаблон имени `scripts/*.test.mjs` в `scripts/verify.mjs`: шаг `script-tests`, `:68-80`); `scripts/verify.mjs` не правится, если имя подходит под шаблон. Сам тест не должен содержать запрещённых литералов в виде, который его же сканер найдёт (сканируются только `app/web` и `app/server/src`, `scripts/` вне охвата).

---

### `packages/rbac` (config/словарь, transform)

**Аналог:** `packages/rbac/src/index.ts` (17 строк), `index.test.ts` (31 строка).

Удалить `buildPermissionSet` из экспорта `index.ts:7` (оставить `export { can } from './rbac'`) и из `rbac.ts:10-40`; `expandRole`, `expandGrants`, `expandDomainGrant` переезжают в `services/access-policy/policy.ts`. Оставляются: `can` (`rbac.ts:42-57`), `PERMISSION_DOMAINS`, `ROLE_REGISTRY`, `ROLE_KEYS`, `ROLES_LIST`, `roleDisplayName`, нормализаторы `normaliseRoleKeys`, `normaliseUserIdentifiers`, `normaliseRoleAccessMap`, `normaliseUserAccessMap`, `createAccessRule`, `accessRuleToSerializable`, `normaliseActionList`. Обновить ожидания `index.test.ts` (экспорт-список). Вызывающие `buildPermissionSet` из `@bio-exam/rbac`: `routes/auth/me.ts:1,31` (удаляется вместе с запасным набором), `getMeData.ts` (удаляется) — подтвердить `codegraph impact buildPermissionSet`. Пакет собирается `tsdown`, дистрибутив проверяет `scripts/check-rbac-dist.mjs`: после изменения экспортов прогнать `yarn workspace @bio-exam/rbac build` и `check-rbac-dist` (входит в `yarn verify`/`build` job, `ci.yml`).

---

## Shared Patterns

### Миграции: аддитивные, манифест, `when` (все планы с миграцией)
**Источник:** `app/server/drizzle/migrations-manifest.json`, `meta/_journal.json`, `scripts/check-migrations.mjs`, `scripts/check-migrations.test.mjs:137-160`.
**Применять к:** план 3 (0021), опционально план 4 (0022, если троттлинг отдельной миграцией). Одна миграция или две — Discretion; условие — обе аддитивны и проходят `check-migrations`. Каждый следующий `when` строго больше предыдущего; применённые миграции не править (AGENTS.md). На проде последней записью мигратора должна быть 0020 (`when` = `1784985600000`), проверка в `<specifics>` п. 3.

### Таблицы с RLS
**Источник:** `app/server/src/db/schema.ts:36-51`, `:601-624`.
**Применять к:** все новые таблицы (сессии, троттлинг): `.enableRLS()` + `denyDirectAccess: denyDirectAccessPolicy()` в массиве/объекте расширения таблицы.

### DB-тесты только на `test_*`
**Источник:** `app/server/src/test-support/test-database.ts`, `answer-keys-jsonb.test.ts`.
**Применять к:** все тесты фазы, которые трогают БД. Запуск `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test` (AGENTS.md); `DATABASE_URL` из `.env` для тестов не использовать. Нулевой прогон тестов — провал `yarn verify`.

### Токены и cookie
**Источник:** `routes/auth/login.ts:114-153`, `session.ts:40-59`.
**Применять к:** login, refresh, logout, смена пароля: только через модуль выдачи (`appendSetCookie`, без `res.setHeader('Set-Cookie', ...)` напрямую). Имена `bio_exam_session`, `refresh_token`; `Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure` в production.

### Ошибки HTTP
**Источник:** `lib/constants.js` (`ERROR_MESSAGES`, `:21-26`), `requirePerm.ts:13,17`.
**Применять к:** 401 `{ error: 'Unauthorized' }` (middleware) / `ERROR_MESSAGES.UNAUTHORIZED` (routes), 403 `{ error: 'Forbidden' }`, 429 с `Retry-After`, 500 через `next(e)`. Тексты 401/429 и их перевод — Discretion.

### Именование и стиль
**Источник:** `04-CONTEXT.md` «Общие правила», `AGENTS.md`.
**Применять к:** везде. Комментарии в код не писать. Табуляции, без точек с запятой, одинарные кавычки (как в существующих файлах); формат `oxfmt` (`yarn format`), форматирование отдельным коммитом от поведения (AGENTS.md). Env-примеры: удаление ключей из `app/server/.env.example` и `app/web/.env.example` синхронно с кодом (`scripts/check-env-contract.mjs`). Доки по-русски; `yarn ...` в документах должен существовать (`scripts/check-docs-commands.mjs`).

### Перед каждым планом
`codegraph impact <символ>` по меняемым символам, в конце `codegraph affected <файлы>` и `yarn verify` (D-22). Символы к `impact`: `buildPermissionSet`, `buildPermissionSetForUser`, `invalidateRBACCache`, `sessionOptional`, `sessionRequired`, `setSessionCookie`, `clearSessionCookie`, `requirePerm`, `requirePermKey`, `apiFetch`, `tryRefreshSession`, `fetchAuthMe`, `getServerMe`, `AuthProvider`, `useAuth`, `getMeData`, `loginRateLimiter`.

---

## No Analog Found

| Файл | Роль | Поток | Причина |
|---|---|---|---|
| `app/server/src/services/login-throttle/*.ts` | service | CRUD | В коде нет throttling-таблицы и прогрессивных окон: единственные соседи — in-memory `rateLimiter` и удаляемая блокировка. Брать D-11 из CONTEXT |
| `app/server/src/services/session/issue.ts`: условный атомарный захват refresh (`UPDATE ... RETURNING`) | service | CRUD | Сейчас `select` + `update` в транзакции без условия захвата (`refresh.ts:38-71`); атомарного паттерна на `used_at IS NULL ... RETURNING` в репозитории нет. Использовать `db.transaction` из `refresh.ts:60` как оболочку, условие по D-07 |
| `app/web/lib/session/*`: проактивный refresh по таймеру `accessExpiresAt` | service | event-driven | Нет таймеров refresh; ближайшее — интервал и `visibilitychange` в `AuthProvider.tsx:90-117` |
| `app/web/proxy.ts`: refresh при SSR с переносом `Set-Cookie` и подстановкой cookie в запрос RSC | middleware | request-response | Текущий `proxy` только пропускает/редиректит; перенос cookie описан только в `proxy.md:243-255` в `node_modules/next/dist/docs/` |
| Тест бэкфилла 0021 «до/после миграции» | test | batch | Нет миграций с данными, которые тест применяет по частям; `migrateTestDatabase` применяет цепочку целиком. Приём — в разделе миграции выше |
| Маршруты администратора «завершить все сеансы», «снять ограничение входа» + кнопки с подтверждением | controller/component | CRUD | Аналог по подписке прав — `requirePerm('users','edit')` в `routes/users/index.ts`; подтверждающий диалог — по `04-UI-SPEC.md` (не читался в этой карте, UI-контракт уже approved) |

## Metadata

**Analog search scope:** `app/server/src/{middleware,routes/auth,services/rbac,config,db,test-support}`, `app/server/drizzle`, `app/web/{proxy.ts,lib/auth,components/providers,components/AppLayout}`, `packages/rbac/src`, `e2e/{auth.setup.ts,fixtures,tests,playwright.config.ts}`, `scripts/`, `.planning/phases/02-dependency-security/baseline`.
**Files scanned:** ~40 (прочитаны целиком или по диапазонам; `routes/rbac/index.ts`, `public.ts`, `logout.ts`, `users/*`, `UI-SPEC` не читались: нужны планировщику точечно по номерам строк из `<code_context>`).
**Pattern extraction date:** 2026-10-04
