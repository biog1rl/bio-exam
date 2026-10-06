# Phase 10: Notification journal and bell - Pattern Map

**Mapped:** 2026-10-06
**Files analyzed:** 22
**Analogs found:** 20 / 22

Все пути ниже относительно `/Users/kdvornichenko/bio-exam`. Все аналоги отслеживаются git (проверено для `routes/search.ts`, `services/attempt-sessions/access.ts`; остальные лежат в `app/server/src`, `app/web`, `e2e`, зеркал `.gsd` у них нет). Комментарии в коде не писать (правило проекта).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `app/server/src/db/schema.ts` (+2 таблицы) | model | CRUD | `testAssignments` в том же файле (стр. 575-593) | exact |
| `app/server/drizzle/0027_notification_journal.sql` + meta + `migrations-manifest.json` | migration | batch | `app/server/drizzle/0025_teacher_zones.sql`, запись 0026 в манифесте | exact |
| `app/server/src/services/notifications/index.ts` | service (barrel) | request-response | `app/server/src/services/attempt-sessions/index.ts` | exact |
| `.../notifications/record.ts` | service | CRUD (tx) | `scored-attempt/outcome.ts` (тип `DbTransaction`), RESEARCH Pattern 2 | role-match |
| `.../notifications/read.ts`, `cursor.ts` | service | CRUD | `routes/tests/admin/attempts.ts` (`AttemptsQuerySchema`), RESEARCH Pattern 3 | role-match |
| `.../notifications/kinds.ts` | utility (таблица видов) | transform | `services/attempt-sessions/access.ts` (`checkAttemptAccess`) как вызываемая | partial |
| `.../notifications/producers/test-assigned.ts` | service | CRUD (tx) | `removeAssignment` в `routes/tests/assignments.ts` | role-match |
| `app/server/src/routes/notifications.ts` | route | request-response | `app/server/src/routes/search.ts` | exact |
| `app/server/src/routes/index.ts` | route (mount) | - | сам файл, строки 20-30 | exact |
| `app/server/src/routes/tests/assignments.ts` (+`addAssignments`, 3 пути) | route/service | CRUD (tx) | `removeAssignment` там же | exact |
| `app/server/src/routes/users/index.ts` (410-430) | route | CRUD | `assignments.ts` POST `/` | exact |
| `app/server/route-inventory.txt` | config | - | перегенерация `routes:inventory` | exact |
| `app/server/src/**/notifications*.test.ts` | test | request-response | `routes/tests/attempt-access-revoke.test.ts` | exact |
| `app/web/lib/notifications/api.ts` | utility | request-response | `app/web/lib/tests/admin-api.ts` | exact |
| `app/web/lib/notifications/format.ts` (+test) | utility | transform | `app/web/lib/users/student-card.ts` (date-fns ru) | role-match |
| `app/web/components/notifications/NotificationBell.tsx`, `NotificationList.tsx` | component | request-response (SWR) | `app/web/components/Search/SearchButton.tsx` | role-match |
| `.../notifications/UnreadTitlePrefix.tsx` | component | event-driven | нет | none |
| `app/web/app/(internal)/(protected)/notifications/[id]/page.tsx` | component (shell) | - | `dashboard/page.tsx` | exact |
| `.../notifications/[id]/NotificationOpenClient.tsx` | component | request-response | `DashboardClient.tsx` / `TestLandingPageClient.tsx:60` (SWR-ключ) | role-match |
| `app/web/components/AppLayout/AppLayout.tsx` | component | - | сам файл, стр. 63-65 | exact |
| `app/web/lib/navigation/{paths.ts,crumbs.ts}` | config | - | `NON_PAGE_PATHS`, `LABEL_PATTERNS` (запись `/admin/attempts/[id]`) | exact |
| `e2e/tests/notifications.spec.ts`, `e2e/fixtures/seed.json`, `app/server/src/scripts/e2e-seed.ts` | test | request-response | `e2e/tests/attempt-review-pending.spec.ts` | role-match |

## Pattern Assignments

### `app/server/src/db/schema.ts` (model, CRUD)

**Analog:** `testAssignments`, `app/server/src/db/schema.ts:575-593`

```typescript
export const testAssignments = pgTable(
	'test_assignments',
	{
		testId: uuid('test_id').notNull().references(() => tests.id, { onDelete: 'cascade' }),
		assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
		assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		pk: primaryKey({ name: 'test_assignments_pkey', columns: [t.testId, t.userId] }),
		userIdx: index('test_assignments_user_idx').on(t.userId),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()
```

Дополнительно: `denyDirectAccessPolicy()` (стр. 45-53), jsonb default `.default(sql\`'{}'::jsonb\`)` (стр. 301), индекс `.desc()` (стр. 310), частичный `.where(sql\`...\`)` (стр. 510). Скелет таблиц дан в 10-RESEARCH Pattern 1. Побочный эффект: новые FK на `users` автоматически попадают в `app/server/src/db/user-deletion-rule.test.ts` (разрешены правила `c` и `n`; `recipient_id` cascade, `actor_id` set null подходят).

### Миграция 0027

**Analog:** `app/server/drizzle/0025_teacher_zones.sql` (ENABLE ROW LEVEL SECURITY, FK `ON DELETE cascade ON UPDATE no action`, `CREATE POLICY "deny_direct_access" ... USING (false) WITH CHECK (false)`). Генерация: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server drizzle:generate --name notification_journal`. Вручную: запись в `app/server/drizzle/migrations-manifest.json` (idx 27, sha256 через `shasum -a 256`, `when` строго больше `1791239364196`, `breakpoints: true`). Применённую 0026 не трогать.

### `services/notifications/index.ts` (barrel)

**Analog:** `app/server/src/services/attempt-sessions/index.ts`

```typescript
export {
	checkAttemptAccess,
	findVisibleTest,
	type AttemptAccess,
	type AttemptAccessParams,
} from './access.js'
export { saveSessionDraft, startAttemptSession, type SessionInfo } from './sessions.js'
```
Импорты внутри сервера с суффиксом `.js`, барель единственный вход (ADR-0005). Маршруты и `assignments.ts` импортируют только из `services/notifications/index.js`.

### `producers/test-assigned.ts` и `addAssignments`

**Analog:** `routes/tests/assignments.ts:15-30` (`removeAssignment` экспортируется и используется из `users/index.ts`), текущие вставки без tx:

`assignments.ts:113-114`:
```typescript
const adminId = req.authUser!.id
await db.insert(testAssignments).values({ testId, userId, assignedBy: adminId }).onConflictDoNothing()
```
`assignments.ts:153-157` (групповой, `.returning` уже есть):
```typescript
const inserted = await db
	.insert(testAssignments)
	.values(assignees.map((userId) => ({ testId, userId, assignedBy: adminId })))
	.onConflictDoNothing()
	.returning({ id: testAssignments.userId })
```
Целевой вид: `addAssignments(testId, userIds, assignedBy)` с `db.transaction`, `.returning({ userId: testAssignments.userId })`, затем `recordTestAssigned(tx, ...)` (полный код в RESEARCH Pattern 5). Правила: видимость и название теста читать через `tx` (`tests` ⋈ `topics`, `is_published`, `is_active`, строка теста `FOR SHARE`), не `db` (пул dev = 2) и не `findVisibleTest`; невидимый тест — без события (D-18), публикация пишет событие уже назначенным через `recordTestPublished` в транзакции `updateTestSettings` (план 10-09); в обработчиках оставить вызовы `canAssign(` / `canAssignMany(` (охранный тест `scripts/teacher-zone-guards.test.mjs` ищет их подстрокой); ответы `{ ok: true }` и `{ ok: true, assigned: n }` не менять; routes/ вне маршрутов назначения не читают `test_assignments` (`scripts/attempt-integrity-guards.test.mjs` сканирует только `app/server/src/routes`); в services/notifications его читает только `recordTestPublished` (список получателей при публикации, D-18). Транзакцию с `tx` типом объявить в модуле (аналог типа `DbTransaction` в `services/scored-attempt/outcome.ts:9`, но не импортировать оттуда).

### `kinds.ts` и `open` (обработчик вида `test.assigned`)

**Analog:** `services/attempt-sessions/access.ts:59-64` и вызов в `routes/tests/public.ts:350`.

```typescript
export async function checkAttemptAccess(params: AttemptAccessParams): Promise<AttemptAccess> {
	const test = await findVisibleTest(params.testId)
	if (!test) return { ok: false, status: 404 }
	if (!(await isAssignedOrPrivileged(params))) return { ok: false, status: 403 }
	return { ok: true, test }
}
```
Успех несёт `test.topicSlug` и `test.slug` для `href`. Вызов: `checkAttemptAccess({ testId, userId, canReadTest: () => canReadTest(req, testId) })` (`canReadTest` из `services/access-policy/index.js`). Модуль уведомлений получает `canReadTest: (testId) => Promise<boolean>` из маршрута, `Request` не принимает.

### `routes/notifications.ts` (route, request-response)

**Analog:** `app/server/src/routes/search.ts:1-35`

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { sessionRequired } from '../middleware/auth/session.js'

const router = Router()

const SearchQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(25).optional().default(10),
})

router.get('/', sessionRequired(), searchRateLimiter, async (req, res, next) => {
	try {
		const parsed = SearchQuerySchema.safeParse(req.query)
		if (!parsed.success) {
			return res.status(400).json({ error: 'Invalid search query', details: parsed.error.flatten() })
		}
		const user = req.authUser!
		...
	} catch (err) { next(err) }
})
export default router
```
Копировать: default export роутера, `sessionRequired()`, `safeParse`, 400 `{ error: 'Invalid request', details }`, `try/catch -> next(err)`, получатель только `req.authUser!.id`. Не копировать `rateLimiter` (RESEARCH: не добавлять). НЕ использовать `validateUUID('id')` на `/:id/*` (даёт 400, нужен 404 для `read` и 403 `NO_ACCESS` для `open`); проверка формата через `isValidUUID` из `middleware/validateParams.js`. Порядок: `GET /`, `GET /unread-count`, `POST /read-all`, `POST /:id/read`, `GET /:id/open`. Монтирование в `routes/index.ts`: добавить `import notificationsRouter from './notifications.js'` (в алфавитном блоке импортов) и `router.use('/notifications', notificationsRouter)` рядом с `router.use('/search', searchRouter)`. Лимит: `z.coerce.number().int().min(1).max(50).default(20)`, образец `AttemptsQuerySchema` в `routes/tests/admin/attempts.ts:40`.

### Серверные тесты (test, request-response)

**Analog:** `app/server/src/routes/tests/attempt-access-revoke.test.ts:1-45`

```typescript
import { afterAll, beforeAll, describe, test } from 'vitest'
import { seedAttemptWorld, assignTest, type AttemptWorld } from '../../test-support/attempt-world.js'
import { cookieHeader, login, seedUser, startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

beforeAll(async () => {
	ctx = await startAuthApp('test_attempt_revoke')
	world = await seedAttemptWorld(ctx, 'revoke')
}, 60_000)
afterAll(async () => { await ctx?.stop() })

async function loginAs(userLogin: string): Promise<string> {
	const reply = await login(ctx, userLogin, world.password)
	assert.equal(reply.status, 200, `login ${userLogin}`)
	return cookieHeader(reply.jar)
}
```
`call(ctx, method, path, { cookies, body })` из `auth-app.ts:144`. `assignTest` (attempt-world.ts:133) пишет напрямую в таблицу и событий не создаёт, это нужно: события создают только маршруты, тесты назначений идут через `POST /api/tests/:id/assignments`. Покрыть: откат (ни назначения, ни события), повтор и ref_seq+1 после снятия, self-assign (D-08), курсор с микросекундами и страницами по 1, чужой id (404/403 одинаково), неизвестный вид, потеря доступа (снятие назначения, снятие публикации; «выход из группы» доступа не снимает, D-09).

### `app/web/lib/notifications/api.ts`

**Analog:** `app/web/lib/tests/admin-api.ts:1-20`

```typescript
import { MalformedBodyError, request, type RequestFailure, type RequestOutcome } from '@/lib/http/request'
import { fetcherWith } from '@/lib/http/swr'
```
Загрузчик: `requestJson<T>(url, { parse })` (`lib/http/request.ts:167`), `fetcherWith(parse)` (`lib/http/swr.ts:7`). Охранный тест `scripts/web-requests-guards.test.mjs`: ключ SWR только строкой, не массивом; без локальных `const ...Fetcher =` (кроме `fetcherWith(`); `apiFetch` не вызывать вне `lib/http`. Ключ как `notifications/unread-count/${userId}` (образец `test-summary/${topicSlug}/${testSlug}` в `TestLandingPageClient.tsx:60`), загрузка функцией `loadUnreadCount()`. `openNotification` возвращает `{ kind: 'ok', href } | { kind: 'no_access' } | { kind: 'failed', failure }` и ветвит `403 + NO_ACCESS` до `failureMessage`.

### `app/web/components/notifications/NotificationBell.tsx`

**Analog:** `app/web/components/Search/SearchButton.tsx:1-40` (`'use client'`, `Button size="icon" variant="outline"`, `Tooltip`, lucide-иконка) и `components/ui/popover.tsx` (`Popover`, `PopoverTrigger`, `PopoverContent`). Пользователь: `useAuth().me.id`; `useSWR(me ? key : null, loadUnreadCount, { refreshInterval: 60_000, refreshWhenHidden: false, revalidateOnFocus: true })`. Ссылки строк `<Link href={`/notifications/${id}`} prefetch={false}>`.

### `AppLayout.tsx` (modify)

`app/web/components/AppLayout/AppLayout.tsx:63-65`:
```tsx
<div className="ml-auto flex h-full shrink-0 items-center gap-unit-mob tab-sm:gap-unit">
	<SearchButton />
</div>
```
Добавить `<NotificationBell />` перед `<SearchButton />` (внутри `AuthGuard`, значит только у вошедших). `AppLayout` серверный, колокольчик `'use client'`.

### Страница `/notifications/[id]`

**Analog:** `app/web/app/(internal)/(protected)/dashboard/page.tsx`
```tsx
import DashboardClient from './DashboardClient'
export const metadata = { title: 'Главная' }
export default function DashboardPage() { return <DashboardClient /> }
```
Тонкая серверная оболочка + клиентский компонент, `open` только из клиентского эффекта (не из SSR и не prefetch). `metadata.title = 'Уведомление'`. Состояния: `AccessDeniedState`, `LoadErrorAlert`, `Skeleton`. `router.replace(href)` только если `isInternalHref(href)` (`^\/(?![\/\\])`).

### Навигация

`app/web/lib/navigation/paths.ts:3-8` `NON_PAGE_PATHS`: добавить `/^\/notifications$/`. `crumbs.ts` `LABEL_PATTERNS`: `{ pattern: /^\/notifications\/[^/]+$/, label: 'Уведомление' }` по образцу записи `/admin/attempts/[id]`. `NAV_SECTIONS` не менять (`sections.test.ts` пропускает пути с `[…]`).

### e2e

**Analog:** `e2e/tests/attempt-review-pending.spec.ts` (ученик из сида, контраст и переполнение на 375/768/1280), сид: `e2e/fixtures/seed.json`, `e2e/fixtures/accounts.ts`, `app/server/src/scripts/e2e-seed.ts` (пишет `test_assignments` напрямую, события через маршрут не создаются: в e2e события создавать вызовом API назначения). Проверять: значок и «9+», префикс заголовка `(N) ` после навигации, «Прочитать все», «Нет доступа» после снятия назначения.

## Shared Patterns

### Транзакция причины
**Source:** RESEARCH Pattern 5 + `db.transaction` из `app/server/src/db/index.ts`. `recordNotification(s)` принимает только `tx`; внутри транзакции только `tx`, не `db`.

### «Своё событие» по конструкции
Одна функция условия `recipient_id = $userId` во всех пяти запросах чтения (список, счётчик, read, read-all, open); чужой и несуществующий id дают один результат.

### Конверт ошибок и сессия
`sessionRequired()` (`middleware/auth/session.js`: 401 `{ error: 'Unauthorized' }`); 400 `{ error: 'Invalid request', details: parsed.error.flatten() }`; `catch (err) { next(err) }`. Отказ `open`: ровно `{ error: 'NO_ACCESS' }`.

### Курсор
Не из `Date`: `to_char(last_event_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`, курсор `base64url(JSON([text, id]))`, разбор zod, запрос `limit + 1`.

### Пакетный INSERT
`ON CONFLICT (recipient_id, dedupe_key) DO UPDATE SET ref_seq = ref_seq + 1, last_event_at = now(), read_at = NULL`; вход дедуплицировать по паре и сортировать по `recipientId` (иначе ошибка PG «cannot affect row a second time»).

### Охранные тесты репозитория
`scripts/teacher-zone-guards.test.mjs`, `scripts/attempt-integrity-guards.test.mjs`, `scripts/web-requests-guards.test.mjs`, `app/server/src/routes/route-inventory.snapshot.test.ts` (перегенерировать `routes:inventory`, `app/server/route-inventory.txt`). Новых env-ключей нет.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `components/notifications/UnreadTitlePrefix.tsx` | component | event-driven | `document.title` нигде в web не пишется; брать RESEARCH Pattern 7 (`MutationObserver` по `document.head`, `withTitlePrefix` снимает `^\(\d+\+?\) `, запись только при изменении строки). Поведение Next 16 проверять e2e |
| `services/notifications/kinds.ts` (таблица видов) | utility | transform | Реестра «вид → обработчик» в коде нет; ближайшее по духу `checkAttemptAccess`, структура из RESEARCH Pattern 4 |

## Metadata

**Analog search scope:** `app/server/src/{db,routes,services,test-support}`, `app/web/{components,lib,app}`, `e2e`, `scripts`, `app/server/drizzle`
**Pattern extraction date:** 2026-10-06
**Примечание:** RESEARCH.md прочитан до строки 427 из 663 (Pitfalls 1-2); остальные разделы (Pitfalls 3+, Validation, Open Questions) планировщику читать самому.
