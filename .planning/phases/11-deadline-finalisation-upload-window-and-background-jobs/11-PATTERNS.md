# Phase 11: Deadline finalisation, upload window and background jobs - Pattern Map

**Mapped:** 2026-10-06
**Files analyzed:** 27 (новые и изменяемые)
**Analogs found:** 25 / 27

Все аналоги проверены как отслеживаемые git-файлы (`git ls-files` для `services/attempt-sessions`, `scripts/storage-reconcile.ts`, `index.ts`). Номера строк относятся к dev на 2026-10-06.

## File Classification

| Новый/изменяемый файл | Роль | Поток данных | Ближайший аналог | Качество |
|---|---|---|---|---|
| `app/server/src/services/attempt-sessions/deadline.ts` (new) | service | CRUD + транзакция | `services/attempt-sessions/submit.ts` | exact |
| `app/server/src/services/attempt-sessions/upload-window.ts` (new) | service/utility | request-response | `sessions.ts` (`sessionExpired`) | role-match |
| `app/server/src/services/attempt-sessions/submit.ts` (mod) | service | CRUD | сам файл | exact |
| `app/server/src/services/attempt-sessions/sessions.ts` (mod) | service | CRUD | сам файл | exact |
| `app/server/src/services/attempt-sessions/explanations.ts` (new, перенос) | service | transform | `routes/tests/public.ts:555-580` | exact |
| `app/server/src/routes/tests/public.ts` (mod: `/start`, PATCH, `/submit`, новый GET sessions/:sessionId) | route | request-response | `GET /tests/:id/attempts/me` (`:399`) | exact |
| `app/server/src/services/background-jobs/{registry,jobs,index}.ts` (new) | service | event-driven (таймер + advisory lock) | `services/question-content/asset-index.ts:92` (advisory lock), `reconcileOutcomes` | partial |
| `app/server/src/lib/shutdown.ts` (new) | utility | event-driven | `app/server/src/index.ts:15-43` | role-match |
| `app/server/src/index.ts` (mod) | config/entry | event-driven | сам файл | exact |
| `app/server/src/scripts/jobs-run.ts` (new) | script | batch | `scripts/storage-reconcile.ts` | exact |
| `app/server/package.json` (mod: `jobs:run`) | config | - | строка `storage:reconcile` | exact |
| `app/server/src/db/schema.ts` + `drizzle/0030_*.sql`, `_journal.json`, `migrations-manifest.json`, снимок (mod/new) | model/migration | CRUD | миграция `0029_drop_app_settings` | exact |
| `app/server/src/schemas/tests.ts`, `services/question-content/relocate.ts` (`updateTestSettings`) (mod) | schema/service | CRUD | поле `timeLimitMinutes` там же | exact |
| `packages/exam-core/src/{attempt-result,attempt-session}.ts` + `scripts/check-exam-core-dist.mjs` (mod) | model/contract | request-response | существующие схемы там же | exact |
| `app/server/src/services/scored-attempt/outcome.ts` (`repairOnly`) (mod) | service | batch | `reconcileOutcomes` | exact |
| `app/server/src/scripts/e2e-seed.ts`, `test-support/attempt-fixture.ts`, `attempt-world.ts` (mod) | test-support | CRUD | сами файлы | exact |
| `app/server/src/routes/tests/attempt-deadline.test.ts` (new) | test | integration | `attempt-time-limit.test.ts`, `attempt-races.test.ts` | exact |
| `app/server/src/services/background-jobs/*.test.ts`, `lib/shutdown.test.ts`, `upload-window.test.ts` (new) | test | integration/unit | `attempt-races.test.ts`, `test-support/http.ts:startTestServer` | role-match |
| `app/web/components/tests/attempt-lifecycle/{lifecycle,use-attempt-lifecycle}.ts(x)` (mod) | hook/module | event-driven | сами файлы | exact |
| `attempt-lifecycle/server-clock.ts`, `unsent.ts` (new, чистые) | utility | transform | `lib/drafts/question-draft-copy.ts` (`stableSerialize`) | role-match |
| `attempt-lifecycle/storage-keys.ts` (+`clearUserAttemptStorage`, ключ `test-unsent-`) (mod) | utility | file-I/O (localStorage) | `clearAttemptKeys` там же | exact |
| `components/tests/attempt-submit-flow.ts` (mod) | utility | transform | сам файл | exact |
| `app/web/lib/drafts/save-queue.ts` (CR-03) (mod) | service | event-driven | сам файл | exact |
| `app/web/lib/drafts/question-draft-copy.ts` (+`forgetUserQuestionDraftCopies`) (mod) | utility | file-I/O | `forgetQuestionDraftCopies` (`:62-75`) | exact |
| `app/web/lib/session/refresh-coordinator.ts` (new) + `client.ts` (mod) | service | event-driven | `client.ts:createSessionClient.refreshOnce` | role-match |
| `app/web/components/providers/AuthProvider.tsx` (`logout`) (mod) | provider | event-driven | `:115-130` | exact |
| `TestSettingsPanel.tsx`, `useTestEditorModel` (поле окна) (mod) | component | CRUD | поле лимита времени там же | exact |
| `e2e/tests/deadline-finalised.spec.ts` (new) | test | e2e | `e2e/tests/timed-attempt.spec.ts`, `submit-retry.spec.ts` | exact |

## Pattern Assignments

### `services/attempt-sessions/deadline.ts` (service, CRUD)

**Analog:** `app/server/src/services/attempt-sessions/submit.ts` + `sessions.ts`

**Imports** (`sessions.ts:1-15`, `submit.ts:1-13`):
```typescript
import { ATTEMPT_GRACE_PERIOD_MINUTES, findAnswerViolation, type AnswerValue } from '@bio-exam/exam-core'
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { testAttempts, testSessions } from '../../db/schema.js'
```
Относительные пути с суффиксом `.js`, без alias.

**Условие просрочки** (`sessions.ts:52-54`): переиспользовать, не дублировать:
```typescript
export function sessionExpired(timeLimitMinutes: number | null): SQL<boolean> {
	return sql<boolean>`(${timeLimitMinutes}::int IS NOT NULL AND now() > ${testSessions.startedAt} + make_interval(mins => ${timeLimitMinutes}::int + ${ATTEMPT_GRACE_PERIOD_MINUTES}::int))`
}
```

**Шаг D-04, закрытие пустой сессии** (`submit.ts:107-112`, `closeExpiredSession`):
```typescript
await db.update(testSessions)
	.set({ closedAt: sql`now()`, closeReason: 'expired' })
	.where(and(eq(testSessions.id, testSessionId), isNull(testSessions.submittedAt), isNull(testSessions.closedAt)))
```

**Идемпотентность через результат** (`submit.ts:138-146`): `replayed`, если `stored.clientAttemptId === clientAttemptId`, иначе `conflict`. Для финализации `clientAttemptId = \`deadline:${sessionId}\``: `created`/`replayed` дают `finalized`, `conflict` даёт `submitted`, `closed` даёт `expired`.

**Правило:** не вызывать из `db.transaction` других функций (Pitfall 1). Финализация только из маршрута до входа в `startAttemptSession`/`saveSessionDraft`.

---

### `services/attempt-sessions/submit.ts` (mod: источник, `submittedAt`, `upload_closes_at`, `expectedDraft`)

**Точки правки:**
- `SubmitAttemptParams` (`:43-51`) получает `source`, `submittedAt`, `uploadWindow`, `expectedDraft`.
- Вставка (`:151-172`): `submitSource: 'client'` (`:167`) заменить параметром, добавить `submittedAt`, `uploadClosesAt`.
- Обновление сессии (`:184-194`): `submittedAt: sql\`now()\`` (`:187`) тоже брать параметром.
- Под `FOR UPDATE` (`:125-135`) добавить чтение `draftAnswers` для сверки по содержимому (`draft_changed`).

```typescript
.insert(testAttempts).values({
	testId, userId, sessionId: testSessionId, clientAttemptId, answers,
	results: scored.results, resultsVersion: scored.resultsVersion,
	...projectionOf(scored.outcome),
	passingScore: scored.passingScore,
	submitSource: 'client',
	gradedAt: null,
	telemetry: ...,
}).onConflictDoNothing().returning({ id: testAttempts.id })
```
Вызывающие (impact): `POST /submit` и `scripts/e2e-seed.ts:124,:335`; параметры сделать необязательными с умолчанием `'client'`/`now()`, чтобы сид не ломался.

---

### `services/attempt-sessions/sessions.ts` (mod)

- `startAttemptSession` (`:80-122`): ветка `:96-101` закрывает просроченную как `expired`. Оставить закрытие только для пустого черновика; непустой возвращает признак «нужна финализация».
- `saveSessionDraft` (`:147-169`): условие `.where(and(eq(testSessions.id, testSessionId), openSessionOf(testId, userId)))` дополнить `sql\`NOT ${sessionExpired(timeLimitMinutes)}\``. Добавить `timeLimitMinutes` в `SaveSessionDraftParams`.
- `toSessionInfo` (`:70-78`): добавить `serverNow`.

---

### `routes/tests/public.ts` (route, request-response)

**Analog для нового GET:** `GET /tests/:id/attempts/me` (`:399-407`)
```typescript
router.get('/tests/:id/attempts/me', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	...
	const access = await checkAttemptAccess({ testId, userId, canReadTest: () => canReadTest(req, testId) })
	if (!access.ok) return denyAttemptAccess(res, access.status)
```
Новый маршрут: `validateUUID('id'), validateUUID('sessionId'), sessionRequired()`, затем `checkAttemptAccess`, фильтр сессии по `userId` (`sessionOfPair`, `submit.ts:70`), чужая даёт 404 (`sessionNotFound(res)`). После правки обновить `route-inventory.txt` (`routes:inventory` через `with-test-db`).

**`/submit` ветка `expired`** (`:574-577`) сейчас:
```typescript
if (precheck.kind === 'expired') {
	await closeExpiredSession(sessionId)
	return timeExpired(res)
}
```
Заменить на `finalizeSessionByDeadline`: попытка есть, значит 409 через `attemptAlreadySubmitted` с расширенным телом (`submitSource`, `attempt` из `readAttemptView(id, viewer)`, `uploadClosesAt`, `serverNow`); пусто, значит `timeExpired(res)` как сейчас. Ветку `precheck.kind === 'submitted'` (`:566-570`) расширить тем же телом для `submit_source = 'deadline'`.

**`explanationReader`** (`:593-606`, лямбда `readExplanation`) и `buildQuestionMarkdownCandidates` вынести в `services/attempt-sessions/explanations.ts` (`explanationReaderFor(test)`), чтобы фон пользовался тем же.

**PATCH answers** (`:520-533`): перед `saveSessionDraft` вызвать финализацию просроченной, после неё ответ 404 `Session not found or already submitted`.

---

### `services/background-jobs/{registry,jobs,index}.ts` (service, event-driven)

**Analog (замок):** `services/question-content/asset-index.ts:92` (`pg_advisory_xact_lock(hashtext(key))` в транзакции). Форма из двух int, которую нужно использовать: `pg_try_advisory_xact_lock(ns::int, hashtext(name))` (RESEARCH Pattern 6, `runLocked`).

```typescript
return db.transaction(async (lockTx) => {
	const result = await lockTx.execute<{ locked: boolean }>(
		sql`SELECT pg_try_advisory_xact_lock(${JOB_LOCK_NAMESPACE}::int, hashtext(${job.name})) AS locked`
	)
	if (!result.rows[0]?.locked) return { skipped: 'locked' as const }
	return job.runOnce({ signal })
})
```
Работа задачи идёт другими соединениями пула (по транзакции на сессию). Цикл на `setTimeout` с `unref()`, не `setInterval`.

**`jobs.ts` / reconcile-outcomes:** обёртка над `reconcileOutcomes` в `services/scored-attempt/outcome.ts:164-209` с новым параметром `repairOnly: 'none'`.

**Нет прямого аналога для самого реестра:** в репозитории нет ни одного таймерного воркера (см. No Analog Found).

---

### `lib/shutdown.ts` (utility, event-driven)

**Analog:** `app/server/src/index.ts:15-43` (текущий `gracefulShutdown`: `server.close`, `pgPool.end()`, `setTimeout(...exit(0), 5000)`). Заменить на `createShutdown({ server, jobs, pool, drainMs: 25_000, log: logger, exit })` из RESEARCH (Code Examples, «Остановка»).

**Импорты и логгер** (`index.ts:5-8`):
```typescript
import app from './app.js'
import { pgPool } from './db/index.js'
import { DEFAULTS } from './lib/constants.js'
import logger from './lib/logger.js'
```
**Правило:** `index.ts` только связывает: `app.listen`, `jobs.start()`, `process.on('SIGTERM'|'SIGINT')`. Фоновые задачи нельзя импортировать из `app.ts`.

---

### `scripts/jobs-run.ts` (script, batch)

**Analog:** `app/server/src/scripts/storage-reconcile.ts` (целиком, 61 строка)

```typescript
import '../config/env.js'
import { pgPool } from '../db/index.js'
...
async function main(): Promise<void> {
	const args = process.argv.slice(2)
	const unknown = args.filter((arg) => !FLAGS.has(arg))
	if (unknown.length > 0) { throw new Error(`unknown arguments: ...`) }
	...
}
main()
	.catch((error: unknown) => {
		console.error(`${PREFIX} failed`, error)
		process.exitCode = 1
	})
	.finally(async () => {
		await pgPool.end().catch(() => undefined)
	})
```
Префикс лога `[jobs-run]`. Строгий разбор аргументов, неизвестное имя даёт код 1, `skipped: 'locked'` даёт код 75. `package.json`: `"jobs:run": "tsx src/scripts/jobs-run.ts"` рядом со `"storage:reconcile": "tsx src/scripts/storage-reconcile.ts"` (`package.json:21`).

---

### Серверные тесты

**Analog:** `routes/tests/attempt-time-limit.test.ts` (хелперы `createAttemptTest`, `addQuestion`, `assignTest`, `saveDraft`, `startSession`, `submitAttempt` из `test-support/attempt-world.ts`; локальный `shiftStartedAt` `:51-55` вынести в `attempt-world.ts`) и `attempt-races.test.ts`.

```typescript
ctx = await startAuthApp('test_attempt_races', { env: { PG_POOL_MAX: '12' } })
world = await seedAttemptWorld(ctx, 'races')
student = await seedStudent(world, 'races_student')
```
Сервисы импортировать динамически после `startAuthApp` (`type AttemptSessionsModule = typeof import('../../services/attempt-sessions/index.js')`, Pitfall 6). Тест остановки: `startTestServer(app)` из `test-support/http.ts:10`.

---

### Миграция 0030

**Analog:** `app/server/drizzle/0029_drop_app_settings.sql`, запись `idx: 29` в `meta/_journal.json`, `migrations-manifest.json` (sha256), снимок из `drizzle:generate`. Схема `tests` рядом с `timeLimitMinutes: integer('time_limit_minutes')`; `testAttempts` рядом с `submittedAt`/`submitSource`. CHECK по образцу `sql\`${t.submitSource} IN ('client', 'deadline')\``. `when` строго больше `1791268928915`. Не править применённые миграции.

---

### `packages/exam-core` (контракт)

**Analog:** `packages/exam-core/src/attempt-result.ts:11-24` (`SUBMIT_ERROR_CODES`, `SubmitAttemptRequestSchema` с `clientAttemptId: z.string().uuid()`), `attempt-session.ts` (`AttemptSessionSchema`). Только необязательные поля (`serverNow`, `uploadClosesAt`, `submitSource`, `attempt`) ради обратной совместимости (Pitfall 9). Новые рантайм-экспорты добавить в `EXPECTED_EXPORTS` в `scripts/check-exam-core-dist.mjs`. Первым планом, до серверных и web.

---

### `attempt-lifecycle/storage-keys.ts` (+ `clearUserAttemptStorage`, `test-unsent-`)

**Analog:** сам файл, `:16-23` и `clearAttemptKeys` (`:35-45`)
```typescript
export function attemptStorageKeys(testId: string, userId: string): AttemptStorageKeys {
	return {
		session: `test-session-${testId}-${userId}`,
		wal: `test-answers-wal-${testId}-${userId}`,
		frozen: `test-frozen-${testId}-${userId}`,
		clientAttemptId: clientAttemptIdKey(testId, userId),
	}
}
```
`clearUserAttemptStorage(storage, userId)`: обход с конца по образцу `forgetQuestionDraftCopies`. Хранилище приходит параметром (охранник `scripts/draft-durability-guards.test.mjs:309-316` разрешает литералы префиксов только внутри `attempt-lifecycle`; `test-unsent-` добавить одной строкой в `ATTEMPT_KEY_CHECKS`).

### `lib/drafts/question-draft-copy.ts` (+ `forgetUserQuestionDraftCopies`)

**Analog:** `forgetQuestionDraftCopies` `:62-75`
```typescript
const prefix = `${COPY_KEY_PREFIX}${draftId}-`
try {
	for (let index = storage.length - 1; index >= 0; index -= 1) {
		const key = storage.key(index)
		if (key !== null && key.startsWith(prefix)) storage.removeItem(key)
	}
} catch { return }
```
Для пользователя: условие `key.startsWith(COPY_KEY_PREFIX) && key.endsWith(\`-${userId}\`)`.

### `attempt-lifecycle/unsent.ts` (чистый)

**Analog:** `stableSerialize` (`question-draft-copy.ts:15`, не плодить третий `stableJson`). Готовый эскиз `unsentAnswers(wal, results)` в RESEARCH (Code Examples, «Сверка WAL»). Табличный юнит-тест.

### `components/tests/attempt-submit-flow.ts` (mod)

`STORAGE_KEYS_BY_EVENT` (`:92-102`) и `classifySubmitFailure` (`:104-116`) расширить:
```typescript
if (error.status === 409 && error.code === SUBMIT_ERROR_CODES.alreadySubmitted) {
	return { kind: 'already-submitted', attemptId: error.attemptId }
}
```
Добавить исход `finalized` (при `submitSource: 'deadline'` и разобранном `attempt`) и событие хранилища без `wal`. `time-expired` и `already-submitted` сейчас стирают `ALL_ATTEMPT_KEYS` (D-14 меняет).

### `lib/session/refresh-coordinator.ts` (new) + `client.ts` (mod)

**Analog:** `lib/session/client.ts` `createSessionClient`: `performRefresh()` и дедупликация `pendingRefresh` в `refreshOnce()`. Типы `RefreshOutcome` (`kind: 'ok' | 'rejected' | 'unavailable'`). Коордиатор принимает `locks`, `storage`, `now`, `perform` как швы (чистый, тестируемый), `refreshOnce` вызывает его; `fetchWithSession` (`:`) продолжает вызывать `refreshOnce`. Без `navigator.locks` прежний путь.

### `AuthProvider.tsx` (`logout`)

**Analog:** `:115-130`
```typescript
const logout = useCallback(async () => {
	if (!(await sessionClient.logout())) return false
	...
	localStorage.setItem('logout', Date.now().toString())
	localStorage.removeItem('logout')
```
Добавить очистку для `me.id` до события `logout` и повтор очистки на `pagehide` с `{ once: true }`. Тот же вызов в обработчике `storage` (`:126-129`, ключ `logout`).

### e2e `deadline-finalised.spec.ts`

**Analog:** `e2e/tests/timed-attempt.spec.ts` (`page.clock`), `submit-retry.spec.ts` (`page.route` + `route.fulfill`, `context.setOffline`). Сид через `app/server/src/scripts/e2e-seed.ts` (+просроченная сессия с черновиком); фоновые задачи в e2e работают (`tsx src/index.ts`, пул 2).

## Shared Patterns

### Идемпотентность и «ровно одна попытка»
**Источник:** `submit.ts:125-146,174-182` + уникальные индексы `test_attempts_session_id_uniq`, `test_attempts_user_client_attempt_idx`. **Применять:** `finalizeSessionByDeadline`, `/submit`, фон. Опираться на `FOR UPDATE` и индексы, не на advisory lock.

### Доступ ученика к попытке
**Источник:** `routes/tests/public.ts:350,405` (`checkAttemptAccess` + `denyAttemptAccess`). **Применять:** новый GET судьбы сессии.

### Ошибки маршрутов
`try { ... } catch (e) { next(e) }`, ответы через хелперы `sessionNotFound`, `attemptAlreadySubmitted`, `timeExpired`, `answersInvalidBody` (`public.ts`).

### Пул и таймауты
`db/index.ts:52-57`: `max` 2 в dev, `statement_timeout` 10 с. Все тесты гонок с `PG_POOL_MAX: '12'`.

### Только необязательные поля в контрактах
Старая вкладка читает только `error` и `attemptId` (`web/lib/tests/api.ts:39-56`).

### Стиль
Без комментариев в коде, относительные импорты с `.js` на сервере, `@/` alias в web, табы, без точек с запятой.

## No Analog Found

| Файл | Роль | Поток | Причина |
|---|---|---|---|
| `services/background-jobs/registry.ts` | service | таймерный цикл + stop | В репозитории нет ни одного фонового воркера; брать RESEARCH Pattern 6 и фрагмент замка из `asset-index.ts:92` |
| `lib/shutdown.ts` (оркестрация дренажа) | utility | event-driven | Есть только упрощённый `gracefulShutdown` в `index.ts`; брать RESEARCH Pattern 7 |
| Web Locks в `refresh-coordinator.ts` | service | event-driven | `navigator.locks` нигде не используется; брать RESEARCH Pattern 9 |

## Metadata

**Analog search scope:** `app/server/src/{services/attempt-sessions,routes/tests,scripts,test-support}`, `app/server/src/index.ts`, `app/web/{lib/session,lib/drafts,components/tests,components/providers}`, `packages/exam-core/src`, `e2e/tests`
**Files scanned:** ~25 (кроме них опорные строки RESEARCH.md, прочитанные в нём verbatim)
**Pattern extraction date:** 2026-10-06
