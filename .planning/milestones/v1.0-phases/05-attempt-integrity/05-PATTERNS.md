# Phase 5: Attempt integrity - Pattern Map

**Mapped:** 2026-10-04
**Files analyzed:** 38 (новых и изменяемых; список по `05-CONTEXT.md` D-01...D-25, `<code_context>` и `05-UI-SPEC.md`)
**Analogs found:** 34 / 38 (4 без полного аналога, см. «No Analog Found»)

Статус аналогов в git. Фаза 4 исполняется параллельно, номера строк файлов фазы 4 не фиксировались, ссылки на них идут по символам.

- **Отслеживаются (tracked):** `app/server/src/services/session/{index,cookies,tokens}.ts`, `services/access-policy/*`, `test-support/{auth-app,http,test-database}.ts`, `db/session-backfill.test.ts`, `routes/auth/auth-known-defects.test.ts` (в HEAD есть `KNOWN_DEFECTS`, в рабочем дереве фаза 4 его правит), `routes/tests/{public,index,assignments,exam-flow.test,access-routes.test}.ts`, `drizzle/0021_auth_sessions.sql`, `drizzle/migrations-manifest.json`, `e2e/tests/review.spec.ts`, `e2e/fixtures/exam.ts`, весь `packages/exam-core/src`, весь `app/web/components/tests`.
- **Не в HEAD (untracked, фаза 4 в работе):** `app/server/src/services/login-throttle/*`. Единственный пример `FOR UPDATE SKIP LOCKED` и `ON CONFLICT ... DO UPDATE` на сыром SQL лежит там; как аналог брать форму, а не путь, и перепроверить после коммита фазы 4.
- Зеркал `.gsd/capabilities` в аналогах нет.
- Нумерация миграций: последняя в журнале `idx 21`, `0021_auth_sessions`, `when 1791095839799`. 0022 и 0023 должны иметь `when` больше этого значения; номер 0022 сверить после последней миграции фазы 4.

## File Classification

### Тесты и красные проверки (план 1)

| Новый/изменяемый файл | Роль | Поток данных | Ближайший аналог | Качество |
|---|---|---|---|---|
| `app/server/src/routes/tests/attempt-known-defects.test.ts` (`KNOWN_DEFECTS`, красные проверки D-21) | test | request-response | `app/server/src/routes/auth/auth-known-defects.test.ts` (HEAD, `:6`, `:15-19`) | exact |
| `app/server/src/routes/tests/attempt-characterization.test.ts` (доступ, лимит, повтор, утечка ключа через `app.ts`) | test | request-response + CRUD | `app/server/src/routes/tests/exam-flow.test.ts` и `access-routes.test.ts` | exact |
| `app/server/src/routes/tests/attempt-access-matrix.test.ts` (профили × маршруты, ATT-06) | test | request-response | `app/server/src/routes/tests/access-routes.test.ts:12-122,135-160` | exact |
| `app/server/src/routes/tests/attempt-races.test.ts` (параллельные `/start`, submit, PATCH) | test | request-response, конкуренция | `app/server/src/routes/auth/auth-known-defects.test.ts` (`AUTH-05-parallel-refresh`) | role-match |
| `app/server/src/db/attempt-session-migration.test.ts` (чистка 0022 на дубликатах, `results_version` 0023) | test | batch | `app/server/src/db/session-backfill.test.ts` | exact |
| `app/server/src/services/attempt-sessions/*.test.ts`, `services/scored-attempt/*.test.ts` | test | transform / CRUD | `services/access-policy/policy.test.ts`, `services/session/cookies.test.ts` | role-match |
| `app/web/components/tests/attempt-review/attempt-review-utils.test.ts` (таблица 3 зрителя × 5 шаблонов × 3 исхода) | test | transform | сам файл (`:24-60`) | exact |
| `e2e/tests/review.spec.ts` (D1 из `test.fail` в обычный тест) | test | e2e | сам файл (`:227-304`) | exact |
| `packages/exam-core/src/attempt-result.test.ts` (схемы конверта, фактов v1/v2, вида; `getQuestionStatus`) | test | transform | сам файл | exact |

### Сервер: миграции и схема (планы 2, 3)

| Файл | Роль | Поток | Аналог | Качество |
|---|---|---|---|---|
| `app/server/drizzle/0022_<имя>.sql` (колонки, чистка, 2 частичных индекса, `test_attempts.session_id`) | migration | batch | `drizzle/0021_auth_sessions.sql` (DDL, затем ручной `INSERT`/`UPDATE`) | exact |
| `app/server/drizzle/0023_<имя>.sql` (`results_version smallint NOT NULL DEFAULT 1`) | migration | batch | `0021` (`ADD COLUMN`), `0019_session_draft_telemetry.sql` | role-match |
| `drizzle/meta/_journal.json`, `meta/0022_snapshot.json`, `meta/0023_snapshot.json`, `migrations-manifest.json` | config | - | записи `idx 21` в `_journal.json` и манифесте | exact |
| `app/server/src/db/schema.ts` (`testSessions.closedAt/closeReason`, `testAttempts.sessionId/resultsVersion`, индексы) | model | CRUD | `testAttempts` и `testSessions` в том же файле (`foreignKey()` для цикла FK) | exact |

### Сервер: модули и маршруты (планы 2, 3)

| Файл | Роль | Поток | Аналог | Качество |
|---|---|---|---|---|
| `app/server/src/services/attempt-sessions/index.ts` (правило доступа D-01, `/start`, черновик, транзакция submit, идемпотентность) | service | CRUD + транзакции | `services/session/index.ts` (`guarded`, `db.transaction`, захват строки) и `services/access-policy/index.ts` (`hasPermission`) | exact (форма) |
| `app/server/src/services/scored-attempt/index.ts` (факты D-13, вид D-15, чтение v1 D-19) | service | transform | `services/access-policy/policy.ts` (чистая функция + шов) и `exam-core/review.ts` | role-match |
| `app/server/src/routes/tests/public.ts` (делегирование: чтение, `/start`, PATCH, submit, история, график) | controller | request-response | текущий `public.ts:302-316,408-420,571-900` | exact |
| `app/server/src/routes/tests/index.ts:2603-2735` (разбор админа через модуль) | controller | request-response | текущий обработчик | exact |
| `packages/exam-core/src/attempt-result.ts`, `index.ts` (конверт submit, факты v1/v2, вид, `getQuestionStatus`) | utility (контракт) | transform | сам файл + `telemetry.ts:3-9` (zod-схема + тип) | exact |

### Web (план 4)

| Файл | Роль | Поток | Аналог | Качество |
|---|---|---|---|---|
| `app/web/lib/tests/api.ts` (`submitPublicTestAnswers`, ошибка со статусом, `startTestSession`) | service | request-response | сам файл `:10-24,118-128` | exact |
| `app/web/lib/tests/types.ts` (`AttemptReviewData`, `SessionInfo`) | model | transform | сам файл `:70-91` | exact |
| `app/web/components/tests/TestRunner.tsx` (конверт, 403/409/422, плашка, диалоги, статус) | component | event-driven + request-response | сам файл `:240-282,463-513,737-751,911-936` | exact |
| `attempt-review/attempt-review-utils.ts`, `QuestionAnswerReview.tsx`, `AttemptQuestionsList.tsx`, `AttemptReview.tsx`, `AttemptReviewNav.tsx`, `AttemptReviewSummary.tsx` | component/utility | transform | сами файлы | exact |
| Пометка «ключ на момент сдачи не сохранён» в `AttemptQuestionsList.tsx` | component | transform | карточки `QuestionAnswerReview` (`rounded-2xl border ... p-4 text-sm`) и UI-SPEC «Разметка пометки» | role-match |

### Документация и охранный тест (план 5)

| Файл | Роль | Поток | Аналог | Качество |
|---|---|---|---|---|
| `scripts/attempt-integrity-guards.test.mjs` (нет догадок о ключе и статусе в `app/web`, нет чтения `answer_keys` и инлайн-назначений в `routes`) | test | file-I/O | `scripts/exam-core-no-private-copies.test.mjs` и `scripts/auth-no-role-string-checks.test.mjs` | exact |
| `app/server/README.md` (правила доступа, контракт submit) | docs | - | сам файл | exact |

## Pattern Assignments

### Миграции 0022 и 0023 (migration, batch)

**Analog:** `app/server/drizzle/0021_auth_sessions.sql`; бэкфилл проверяет `app/server/src/db/session-backfill.test.ts`.

**Порядок в SQL 0021** (DDL от `drizzle-kit generate`, затем вручную `INSERT`/`UPDATE` в конце файла; у 0022 чистка идёт между `ADD COLUMN` и `CREATE UNIQUE INDEX`):

```sql
ALTER TABLE "refresh_tokens" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_session_id" ON "refresh_tokens" USING btree ("session_id");--> statement-breakpoint
INSERT INTO "auth_sessions" ("id", "user_id", "created_at", "last_refreshed_at")
SELECT "id", "user_id", "created_at", "created_at"
FROM "refresh_tokens"
WHERE "revoked_at" IS NULL AND "expires_at" > now() AND "session_id" IS NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "refresh_tokens" SET "session_id" = "id"
WHERE ... AND EXISTS (SELECT 1 FROM "auth_sessions" s WHERE s."id" = "refresh_tokens"."id");
```

Применение к 0022 (D-06): каждый оператор отделён `--> statement-breakpoint`; чистка идемпотентна (`WHERE ... closed_at IS NULL`), правило отбора «оставить `started_at DESC, id DESC`» повторяет `row_number() OVER (PARTITION BY test_id, user_id ORDER BY started_at DESC, id DESC)` из `<specifics>` п. 2 CONTEXT. Таблицы не создаются, поэтому `ENABLE ROW LEVEL SECURITY` и `deny_direct_access` не нужны (уже есть у `test_sessions` и `test_attempts`).

**Журнал и манифест** (`drizzle/meta/_journal.json`, последняя запись; новые записи копируют форму, `when` строго больше):

```json
{ "idx": 21, "version": "7", "when": 1791095839799, "tag": "0021_auth_sessions", "breakpoints": true }
```

Манифест `migrations-manifest.json` хранит `idx`, `tag`, `sha256` файла, `when`; пересчитывается после ручной правки SQL. `scripts/check-migrations.mjs` сверяет журнал, манифест и файлы, сравнивает цепочку с `schema.ts` (`drizzle-kit generate` не должен создавать новый SQL), поэтому `schema.ts` обязан описывать те же индексы и FK.

**DB-тест чистки** (`session-backfill.test.ts`): копия каталога миграций до предыдущей, вставка строк, применение настоящим раннером, проверка.

```typescript
const MIGRATION_TAG = '0021_auth_sessions'
const MIGRATION_FILE = path.join(MIGRATIONS_FOLDER, `${MIGRATION_TAG}.sql`)

function prepareMigrationsUpTo0020(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-exam-backfill-drizzle-'))
	fs.cpSync(MIGRATIONS_FOLDER, dir, { recursive: true })
	const journalFile = path.join(dir, 'meta/_journal.json')
	const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8')) as { entries: Array<{ idx: number }> }
	journal.entries = journal.entries.filter((entry) => entry.idx <= 20)
	fs.writeFileSync(journalFile, JSON.stringify(journal, null, 2))
	for (const file of fs.readdirSync(dir)) {
		if (file.startsWith('0021_')) fs.rmSync(path.join(dir, file))
	}
	fs.rmSync(path.join(dir, 'meta/0021_snapshot.json'), { force: true })
	return dir
}

beforeAll(async () => {
	requireTestDatabaseUrl()
	scratch = await createScratchDatabase('test_auth_backfill')
	copyDir = prepareMigrationsUpTo0020()
	pool = new Pool({ connectionString: scratch.url })
	await migrate(drizzle(pool), { migrationsFolder: copyDir, migrationsSchema: 'public' })
	// вставка строк users / refresh_tokens через pool.query ...
	await migrateTestDatabase(scratch.url)
}, 120_000)
```

Для 0022 фильтр `entry.idx <= 21`, `file.startsWith('0022_')`; вставить `users`, `tests` (с `topics`), несколько открытых `test_sessions` одной пары с разными `started_at` и равными `started_at` (проверка `id DESC`), сданные сессии, сессии с общим `attempt_id`. Проверки: остаётся одна открытая сессия самой новой, остальные `close_reason = 'superseded'`, строки и `draft_*` не удалены, `test_attempts.session_id` у старых попыток `NULL`, повторный прогон чистки возвращает `rowCount === 0`:

```typescript
test('running the backfill statements again changes nothing', async () => {
	for (const statement of backfillStatements()) {
		const result = await db().query(statement)
		assert.equal(result.rowCount, 0, statement)
	}
})
```

Хэш и `when` из манифеста сверяются тестом `the real migrator applies only 0021 and records its manifest sha256` (`:131-143`); копировать для 0022 и 0023. Для 0023 достаточно: вставленная до миграции строка получает `results_version = 1`.

**Схема `schema.ts`**: цикл FK `test_attempts.session_id` ↔ `test_sessions.attempt_id`. Образец явного FK без `.references()` в том же файле:

```typescript
testIdFk: foreignKey({
	name: 'test_attempts_test_id_fkey',
	columns: [t.testId],
	foreignColumns: [tests.id],
}).onDelete('cascade'),
```

Частичный уникальный индекс в стиле `userClientAttemptUniq`:

```typescript
userClientAttemptUniq: uniqueIndex('test_attempts_user_client_attempt_idx')
	.on(t.userId, t.clientAttemptId)
	.where(sql`${t.clientAttemptId} IS NOT NULL`),
```

---

### `services/attempt-sessions/index.ts` (service, CRUD в транзакции)

**Analog:** `app/server/src/services/session/index.ts` (захват строки в транзакции) плюс `services/access-policy/index.ts` (`hasPermission`).

**Imports и обёртка ошибок** (`session/index.ts:1-6,19,46-74`):

```typescript
import { and, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn()
	} catch (error) {
		throw storeError(error)
	}
}
```

Для фазы 5 ошибки домена (`403`, `404`, `409`, `422`) нужно возвращать как размеченный результат или классы-исключения, а не прятать в `SessionStoreError`: `guarded` оборачивать только неожиданные ошибки БД.

**Результат в виде размеченного объединения** (`session/index.ts:36-40,122-126`) — копировать форму для `SubmitOutcome`:

```typescript
export type RotationResult =
	| { outcome: 'rejected' }
	| ({ outcome: 'rotated' } & IssuedSession)
	| ...
type CaptureOutcome =
	| { kind: 'rotated'; owner: SessionOwner }
	| { kind: 'replay'; userId: string; sessionId: string }
	| { kind: 'rejected' }
```

**Транзакция с захватом, повторной проверкой и откатом через собственное исключение** (`session/index.ts:167-230`):

```typescript
class RotationRejected extends Error {}
...
try {
	result = await db.transaction(async (tx): Promise<CaptureOutcome> => {
		const [captured] = await tx
			.update(refreshTokens)
			.set({ usedAt: sql`now()` })
			.where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.usedAt), ...))
			.returning({ id: refreshTokens.id, ... })
		if (!captured) return classifyRepeat(tx, tokenHash)
		...
		if (!user) throw new RotationRejected()
	})
} catch (error) {
	if (error instanceof RotationRejected) return { outcome: 'rejected' }
	throw error
}
```

Для submit: `SELECT ... FOR UPDATE` сессии (в Drizzle `tx.select()...for('update')`; в дереве такого вызова нет, см. «No Analog Found»), затем ветвление «сдана → идемпотентность / закрыта → по `close_reason`: `expired` → 422, `superseded` → 404 / иначе вставка попытки и закрытие сессии». Просрочку по времени решает только предпроверка на входе (`precheckSubmit`, `now()` момента прихода запроса); условия по `now()` в транзакции после оценки нет, чтобы долгая оценка не превращала принятую отправку в 422 (ревью R2, R3; 05-06).

**Время часами БД** (`session/index.ts:128,175`): `sql\`now()\`` внутри транзакции, не `new Date()`. Образец окна: `const reuseWindow = sql\`now() - (${sql.raw(String(REFRESH_REUSE_WINDOW_MS))} * interval '1 millisecond')\``. Просрочка сессии с лимитом (D-05): сравнение `now() > started_at + (time_limit_minutes + GRACE_PERIOD_MINUTES) * interval '1 minute'` в SQL.

**Условный захват и `RETURNING`** (атомарный захват refresh, `:174-190`) — тот же приём для закрытия просроченной сессии: `UPDATE test_sessions SET closed_at = now(), close_reason = 'expired' WHERE ... closed_at IS NULL AND submitted_at IS NULL RETURNING id`.

**`INSERT ... ON CONFLICT DO NOTHING` по частичному индексу.** Ближайшие примеры: `onConflictDoNothing()` в `session/index.ts:194` и `routes/tests/public.ts:838` (идемпотентная вставка попытки по `(user_id, client_attempt_id)`). Для частичного индекса `(test_id, user_id) WHERE submitted_at IS NULL AND closed_at IS NULL` в цель конфликта нужен предикат (`onConflictDoNothing({ target: [testSessions.testId, testSessions.userId], where: sql\`submitted_at IS NULL AND closed_at IS NULL\` })`); повторное чтение после `DO NOTHING` обязательно, потому что `RETURNING` вернёт пусто.

**Правило доступа D-01** — вынести из двух инлайн-копий (`public.ts:302-316`, `:408-420`):

```typescript
const canReadAll = await hasPermission(req, 'tests.read')
if (!canReadAll) {
	const assignment = await db
		.select()
		.from(testAssignments)
		.where(and(eq(testAssignments.testId, test.id), eq(testAssignments.userId, userId)))
		.limit(1)
	if (assignment.length === 0) {
		return res.status(403).json({ error: 'Тест не назначен' })
	}
}
```

Порядок: тест виден (опубликован, `topics.isActive`; условие из `public.ts` submit: `and(eq(tests.id, testId), eq(tests.isPublished, true), eq(topics.isActive, true))` с `innerJoin(topics, ...)`) → 404 `{ error: 'Test not found' }`, затем право или назначение → 403. `hasPermission(req, 'tests.read')` импортировать из `../access-policy/index.js` и передавать `req` (мемоизация на запрос в `requestAccess`, `WeakMap<Request, ...>`). Модуль не должен знать Express: принять функцию `canReadAll: () => Promise<boolean>` либо `req`.

**Слияние черновика под блокировкой (D-10)**: текущий код PATCH (`public.ts:617-687`) читает, сливает в памяти, пишет без блокировки. Слияние оставить прежним, добавить `FOR UPDATE` и транзакцию:

```typescript
const nextDraft =
	questionId !== undefined && value !== undefined ? { ...existingDraft, [questionId]: value } : existingDraft
const nextTelemetry = mergeTelemetryMaps(session.draftTelemetry, telemetry)
await db.update(testSessions).set({
	...(questionId !== undefined ? { draftAnswers: nextDraft, draftLastQuestionId: questionId } : {}),
	...(telemetry !== undefined ? { draftTelemetry: nextTelemetry } : {}),
	draftUpdatedAt: new Date(),
}).where(eq(testSessions.id, sessionId))
```

Ответы по закрытой или сданной сессии: 404 `{ error: 'Session not found or already submitted' }`; условие открытости теперь `isNull(submittedAt) AND isNull(closedAt)`.

**Именование:** в API `sessionId` — сессия попытки; в коде `testSessionId` / `attemptSessionId`, чтобы не путать с `req.authUser.sessionId` (сессия входа, фаза 4).

---

### `routes/tests/public.ts` (controller, request-response)

**Analog:** сам файл. Каркас обработчика не меняется, тело делегируется модулям.

**Imports** (`public.ts:1-34`) — оставить `Router`, `z`, `validateUUID`, `sessionRequired`, `ApiError`; убрать `scoreQuestionByType`, `SubmitResultSchema`, `answerKeys`, `testSessions`, прямые запросы.

**Каркас маршрута и обработка ошибок** (`public.ts:571-575,610-613`):

```typescript
router.post('/tests/:id/start', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const testId = req.params.id as string
		const userId = req.authUser!.id
		...
	} catch (e) {
		next(e)
	}
})
```

**Схема тела submit** сейчас (`:40-44`) с `clientAttemptId` опциональным; станет схемой конверта из `exam-core` с обязательными `sessionId` и `clientAttemptId`:

```typescript
const SubmitAnswersSchema = z.object({
	answers: z.record(z.string().uuid(), AnswerValueSchema),
	clientAttemptId: z.string().uuid().optional(),
	telemetry: TelemetryMapSchema.optional(),
})
```

Ошибка схемы остаётся `res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() })`.

**Ответы по D-03** (формат тел в текущем файле): `res.status(409).json({ error: 'TIME_EXPIRED_ALREADY_SUBMITTED', attemptId: session.attemptId })` заменяется на `{ error: 'ATTEMPT_ALREADY_SUBMITTED', attemptId }`; `res.status(422).json({ error: 'TIME_EXPIRED' })` остаётся.

**Оценка вне транзакции** (`public.ts:775-818`) переезжает в `scored-attempt`: карта типов `getQuestionTypeMapForTest({ testId, includeInactive: true })`, строки `questions`, активные ключи, `explanationText` из `readFirstMarkdown(buildQuestionMarkdownCandidates(...))`. Эти вспомогательные функции остаются в `public.ts` или выносятся вместе с оценкой; чтение хранилища строго до `db.transaction` (D-08 п. 2).

---

### `services/scored-attempt/index.ts` (service, transform)

**Analog:** `routes/tests/public.ts:775-818` (оценка), `packages/exam-core/src/review.ts` (`computeVerdicts`, `readKey`), `services/access-policy/policy.ts` (чистая функция + шов загрузки).

**Факты на вопрос (D-13)**: баллы и вердикты одним вызовом от одного ключа, ответа и метрики:

```typescript
const score = scoreQuestionByType({
	questionType: q.type,
	userAnswer,
	correctAnswer,
	fallbackMaxPoints: Number(q.points ?? 0),
	questionTypesMap,
})
```

`scoreQuestionByType` возвращает `{ maxPoints, earnedPoints, isCorrect, mistakesCount }` (`exam-core/src/scoring.ts:15-20,78-110`); для неизвестного типа вернёт `mistakesCount: MISTAKES_UNSCORABLE` (`Number.MAX_SAFE_INTEGER`, `adapters/types.ts:6`), поэтому `mistakes` в фактах брать через `resolveMistakes`-эквивалент: `counted < MISTAKES_UNSCORABLE ? counted : errorUnits(verdicts)` (`adapters/verdicts.ts:25-27`; `errorUnits` экспортируется из пакета, `resolveMistakes` нет). Инварианты D-13: `errorUnits(verdicts) === mistakes`, `isCorrect === (mistakes === 0)`.

**Вердикты** (`review.ts:23-37`):

```typescript
export function computeVerdicts(input: ComputeVerdictsInput): QuestionVerdicts   // { template, metric?, key, answer, content? }
export function readKey(input: { template; metric; raw }): AnswerValue | null
```

Тип вердиктов — размеченное объединение `{ template, mistakes, parts }` (`adapters/types.ts:41-46`); для хранения нужна zod-схема в `exam-core` (сейчас только TS-тип).

**Скрытие ключа сейчас** (`public.ts:815`), переезжает в построитель вида как единственное место:

```typescript
correctAnswer: isCorrect || !test.showCorrectAnswer ? null : correctAnswer,
```

**Подстановка текущего ключа (корень D1)**, удалить (`routes/tests/index.ts:2697-2713`):

```typescript
const resultsWithCorrectAnswers = Array.isArray(attempt.results)
	? (attempt.results as Array<Record<string, unknown>>).map((r) => ({
			...r,
			correctAnswer: r.correctAnswer ?? answerKeysMap.get(r.questionId as string) ?? null,
		}))
	: attempt.results
```

**Форма модуля с чистой функцией и швом**: `access-policy` отделяет чистое вычисление (`createAccessPolicy({ loader })`, `computeAccess`) от адаптера БД (`createDrizzleGrantsLoader(db)` / `createInMemoryGrantsLoader`), что позволяет табличные тесты без БД. Построитель вида `buildAttemptView(facts, viewer)` сделать чистой функцией; чтение `answer_keys` для версии 1 (D-19, `created_at <= submitted_at`, наибольший `version`) вынести в адаптер.

**Вид для трёх зрителей (D-15)**: таблица в CONTEXT; тест-матрица в Vitest: `viewer ∈ {admin, student_with_key, student_without_key}` × 5 шаблонов (`single_choice`, `multi_choice`, `matching`, `short_text`, `sequence_digits`) × `{верно, частично, неверно}`.

---

### Схемы в `packages/exam-core/src/attempt-result.ts` (utility, transform)

**Analog:** сам файл (`SubmitResultItemSchema`, `SubmitResultSchema`) и `telemetry.ts:3-18` (zod-схема + вывод типа + чистая функция).

**Текущее объявление** (замещается схемой вида):

```typescript
export const SubmitResultItemSchema = z.object({
	questionId: z.string().uuid(),
	isCorrect: z.boolean(),
	points: z.number(),
	earnedPoints: z.number(),
	userAnswer: z.unknown(),
	correctAnswer: z.unknown(),
	explanationText: z.string().nullable(),
})
export const SubmitResultSchema = z.object({
	attemptId: z.string().uuid(), submittedAt: z.string(), earnedPoints: z.number(), totalPoints: z.number(),
	scorePercentage: z.number(), passed: z.boolean(), results: z.array(SubmitResultItemSchema),
})
export type SubmitResult = z.infer<typeof SubmitResultSchema>
```

Новые схемы (D-16): конверт submit (`sessionId`, `clientAttemptId` — `z.string().uuid()`, `answers`, `telemetry`), хранимые факты v2, терпимая схема v1 (поля, которые писал старый код: `questionId`, `isCorrect`, `points`, `earnedPoints`, `userAnswer`, `correctAnswer`, `explanationText`; форма на проде проверяется запросом из `<specifics>` п. 7), вид с `status`, `keyVisible`, `mistakes`, `verdicts`. `AnswerValueSchema` уже определён в этом файле (`z.union([z.string(), z.array(z.string()), z.record(z.string(), z.string())])`).

**`getQuestionStatus` в пакете (D-17)**: правило в `attempt-review-utils.ts:163-169`:

```typescript
if (!result || result.points === 0) return null
if (result.isCorrect) return 'correct'
if (result.earnedPoints > 0) return 'partial'
return 'wrong'
```

В пакете возвращает `'ungraded' | 'correct' | 'partial' | 'wrong'` (`points === 0` проверяется первым, независимо от `isCorrect`).

**Экспорт**: добавить имена в `packages/exam-core/src/index.ts:34-35` (там сейчас `AnswerValueSchema, SubmitResultItemSchema, SubmitResultSchema` и типы). Охранный тест пакета `exam-core-no-private-copies.test.mjs` запрещает дубли правил вне пакета; после добавления проверить, что пакет собран во все места (`yarn verify`, шаг `check-exam-core-dist.mjs`).

**Тест схем** (`attempt-result.test.ts:1-40`): `assert.deepEqual(Schema.parse(value), value)` для принимаемых значений и таблица отклоняемых.

---

### Тесты гонок на `test_*` (test, request-response, конкуренция)

**Analog:** `routes/auth/auth-known-defects.test.ts`, блок `AUTH-05-parallel-refresh`; каркас приложения `test-support/auth-app.ts`.

**Каркас** (`auth-known-defects.test.ts:1-60`, `auth-app.ts:46-70`):

```typescript
import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'

beforeAll(async () => {
	ctx = await startAuthApp('test_auth_defects')
	ids.set(name, await seedUser(ctx, { login: name, roles, password: PASSWORD }))
	const { db, schema } = ctx
	const [topic] = await db.insert(schema.topics).values({ slug: 'defects-topic', title: 'Тема дефектов', isActive: true }).returning({...})
	await db.insert(schema.tests).values({ topicId: topic.id, slug: 'defects-free', title: '...', isPublished: true })
}, 60_000)
afterAll(async () => { await ctx?.stop() })
```

**Параллельные запросы и проверка числа строк**:

```typescript
const replies = await Promise.all([
	call(ctx, 'POST', '/api/auth/refresh', { cookies }),
	call(ctx, 'POST', '/api/auth/refresh', { cookies }),
])
assert.deepEqual(replies.map((reply) => reply.status), [200, 200])
assert.equal(await countRefreshTokens(userId('defect_refresh_user')), 2)
```

Для фазы 5: `Promise.all` из N вызовов `call(ctx, 'POST', \`/api/tests/public/tests/${id}/start\`, { cookies: jar })` → все 200, один `sessionId`, одна открытая строка (`SELECT count(*) FROM test_sessions WHERE test_id=$1 AND user_id=$2 AND submitted_at IS NULL AND closed_at IS NULL`; запросы через `ctx.pgPool.query`, как `countRefreshTokens`, `:24-30`). Тест индекса: прямая вставка второй открытой сессии через `ctx.pgPool.query` должна упасть на уникальном индексе (`23505`).

**Подготовка сессии пользователя**: `login(ctx, name, PASSWORD)` возвращает `{ status, jar }` (`CookieJar = Map<string,string>`); альтернатива для тестов без входа — `sessionCookieFor({ id })` из `test-support/http.ts` (теперь async, делает `openSession`).

**Пул `pg`**: `db/index.ts:52` `max: Number(process.env.PG_POOL_MAX ?? (isDev ? 2 : 20))`; `startAuthApp` не задаёт `PG_POOL_MAX` и сохраняет только `TEST_DATABASE_URL` (`ENV_KEYS = ['TEST_DATABASE_URL']`). Для N параллельных транзакций поднять `PG_POOL_MAX` до `N + 2` через `process.env` до `vi.resetModules()` (дополнить `ENV_KEYS`, чтобы значение восстанавливалось в `restoreEnv`). В `app/server/package.json` и vitest-конфиге `PG_POOL_MAX` не задаётся (grep пуст).

**Сдвиг времени**: `ctx.pgPool.query("UPDATE test_sessions SET started_at = now() - interval '...' WHERE id = $1")` (аналогично прямым `ALTER TABLE ... RENAME` через `pgPool` в `AUTH-01-db-error`).

---

### `attempt-known-defects.test.ts` (test, request-response)

**Analog:** `routes/auth/auth-known-defects.test.ts` (в HEAD).

```typescript
const KNOWN_DEFECTS = new Set(['AUTH-06-foreign-ip'])
...
function defectTest(id: string, title: string, fn: () => Promise<void>): void {
	const name = `${id}: ${title}`
	if (KNOWN_DEFECTS.has(id)) test.fails(name, fn)
	else test(name, fn)
}
```

Идентификаторы по D-21: `ATT-01-unassigned-start`, `ATT-01-unassigned-patch`, `ATT-01-unassigned-submit`, `ATT-02-no-session`, `ATT-04-double-attempt`, `SCORE-03-d1-key-change`, `SCORE-02-replay-raw-results`, `SCORE-04-zero-points-status`. Чинящий план удаляет свой id из множества; после этого тест становится обычным. Формулировки по-русски (`<id>: <заголовок>`). В рабочем дереве фаза 4 уже правит этот файл (возможно, `KNOWN_DEFECTS` пуст), форму брать из HEAD (`git show HEAD:app/server/src/routes/auth/auth-known-defects.test.ts`) или из текущей версии после коммита фазы 4. Статус при `points === 0` проверяется Vitest без DOM через чистую функцию (`getQuestionStatus` из `exam-core`), а красный вариант фиксирует расхождение `TestRunner` и разбора; формат красной проверки web — `test.fails` из `vitest` в `attempt-review-utils.test.ts`.

---

### HTTP-характеризация попыток (test, request-response + CRUD)

**Analog:** `routes/tests/exam-flow.test.ts` (сквозной путь, оценка по шаблонам, скрытие ключа, идемпотентность, черновик) и `routes/tests/access-routes.test.ts` (профили × маршруты).

**Хранилище в тестах фазы 5**: не подменяется. Новые тесты фазы (`attempt-world.ts` и все `attempt-*.test.ts`) не объявляют `vi.mock` хранилища и не импортируют оболочку `services/storage/storage.js`: в изолированном процессе (`BIO_EXAM_ISOLATED_ENV=1` задан в `app/server/vitest.config.ts`) без `STORAGE_DRIVER` модуль хранилища 07-01 выбирает in-memory адаптер, `POST /api/tests/:id/questions` пишет в него файлы вопроса, submit читает их оттуда же. Объект напрямую кладётся через порт 07-01: `const mem = await memoryStorage()` из `app/server/src/test-support/storage.ts` после `startAuthApp` (тот же реестр модулей), затем `mem.put(key, data, contentType)`, `mem.get(key)`, `mem.keys(prefix)`, `mem.reset()`. Шапку `vi.hoisted`/`vi.mock` в `exam-flow.test.ts` фаза 5 не трогает: её удаляет 07-16.

**Каркас `exam-flow.test.ts`** (`:1-60,60-118`): ручная подготовка `app.ts`:

```typescript
scratch = await createScratchDatabase('test_exam_flow')
await migrateTestDatabase(scratch.url)
previousTestDatabaseUrl = process.env.TEST_DATABASE_URL
process.env.TEST_DATABASE_URL = scratch.url
vi.resetModules()
const app = (await import('../../app.js')).default
dbModule = await import('../../db/index.js')
schema = await import('../../db/schema.js')
...
server = await startTestServer(app)
adminCookie = await sessionCookieFor({ id: admin.id })
studentCookie = await sessionCookieFor({ id: student.id })
```

**Хелперы** (`:120-160`): `request(method, path, body, cookie)`, `createTest({ showCorrectAnswer })`, `createQuestion(testId, payload)` (через `POST /api/tests/:id/questions`), `submit(testId, payload)`, `findResult(body, questionId)`, `keyRows(questionId)`.

**Перевод на новый конверт (D-21)**: `submit()` на `:163` шлёт ответы без `/start`; станет двухшаговым: `POST /tests/:id/start` → `sessionId`, затем `submit(testId, { sessionId, clientAttemptId: crypto.randomUUID(), answers })`. Смысл проверок сохранить. Тесты, подлежащие переводу: `:256-295` (сквозной), `:634-870` (оценка по шаблонам), `:875-896` (скрытие ключа), `:897-911` (идемпотентность), `:913-961` (черновик и телеметрия). В тесте идемпотентности (`:897-911`) проверка «second.body.results равно first.body.results» — после D-15 ответ повтора идёт через вид, сравнивать целиком тело.

**Проверка сохранённого результата** (`:276-294`): запрос строки `testAttempts` через `dbModule.db.select(...)`; после D-14 добавить `resultsVersion === 2`.

**Матрица доступа (`access-routes.test.ts`)**: профили (`:12-67`) покрывают ровно нужные для ATT-06: `admin`, `student` (назначен), `stranger`, `allow_tests_read`, `admin_deny_tests_read`. Копировать структуру `PROFILES` с `{ name, roles, grants, assigned }`, подготовку (`:120-148`) и таблицу `cases: Array<[Profile, TestKey, number]>` (`:150-170`):

```typescript
const cases: Array<[Profile, TestKey, number]> = [
	['admin', 'assigned', 200], ['admin', 'free', 200],
	['student', 'assigned', 200], ['student', 'free', 403],
	['stranger', 'assigned', 403], ['allow_tests_read', 'free', 200],
	['admin_deny_tests_read', 'free', 403], ['admin_deny_tests_read', 'assigned', 200],
]
for (const [name, key, status] of cases) {
	test(`по id: ${name}, тест ${key} → ${status}`, async () => {
		const reply = await call(ctx, 'GET', `/api/tests/public/tests/${testIdOf(key)}`, { cookies: jarOf(name) })
		assert.equal(reply.status, status)
	})
}
```

Расширить маршрутами `/start`, PATCH, submit, `/attempts/me`, `/chart-data`. Для PATCH и submit нужна открытая сессия: у `stranger` сессию создать прямой вставкой в `test_sessions` через `ctx.db` (иначе `/start` вернёт 403 раньше проверяемого маршрута).

**Утечка ключа (D-22)**: при `showCorrectAnswer = false` ни первый ответ, ни повтор не содержат ключа и вердиктов: сериализовать тело (`JSON.stringify(reply.body)`) и искать значение ключа как JSON-строку вместе с кавычками (`"2314"`, `"Митоз"`), помимо проверки `correctAnswer === null`, `verdicts === null`. Голую подстроку `2314` не искать: она бывает в hex UUID и в числе `scorePercentage`.

---

### Web: `lib/tests/api.ts` и `TestRunner.tsx` (service/component, request-response)

**Analog:** сами файлы.

**Ошибка со статусом** (`api.ts:10-24`, сейчас теряет статус):

```typescript
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await apiFetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
	if (!response.ok) {
		const text = await response.text()
		throw new Error(text || `HTTP ${response.status}`)
	}
	return (await response.json()) as T
}
```

Новая ошибка, несущая `status`, `code` (поле `error` тела) и `attemptId`, строится в этом же месте; `fetchJson` остальных функций поведения не меняет.

**Отправка** (`api.ts:118-128`): `clientAttemptId = crypto.randomUUID()` на каждый вызов (дефект D-09) заменяется параметрами `{ sessionId, clientAttemptId, answers, telemetry }`; возвращаемый тип — вид из `exam-core`.

**Разбор ошибки в `TestRunner`** (`:463-513`, текущая обработка по тексту тела):

```typescript
} catch (error) {
	if (error instanceof Error) {
		const body = tryParseJson(error.message)
		if (body?.error === 'TIME_EXPIRED_ALREADY_SUBMITTED') {
			setExpiredAttemptId((body as { attemptId?: string }).attemptId ?? null)
			setShowTimeExpiredDialog(true)
			return
		}
	}
	console.error('Failed to submit test answers:', error)
	setSubmitError('Не удалось сохранить ответы. Попробуйте еще раз.')
	if (isAutoSubmit) { setFrozen(false); localStorage.removeItem(frozenKey) }
} finally { setSubmitting(false) }
```

Расширить: выбор по `error.status` и `error.code` по таблице UI-SPEC (403, 404, 409 `ATTEMPT_ALREADY_SUBMITTED`, 422 `TIME_EXPIRED`, остальное — прежняя плашка). Очистка локального состояния после успеха уже есть (`:489-493`): `debouncedSaveAnswer.cancel(); setSession(null); localStorage.removeItem(frozenKey/walKey/sessionKey)`; добавить ключ `clientAttemptId` (по образцу `sessionKey`, форма по UI-SPEC).

**Диалоги** (`:911-936`) — существующий `Dialog` 409 (`showTimeExpiredDialog`, `expiredAttemptId`): заменить заголовок и описание, кнопки `К результатам` (с `window.location.reload()`) / `Закрыть` остаются. Новый диалог 422 строить по образцу `AlertDialog` «Начать тест?» (открыт без `onOpenChange`, см. `TestRunner.tsx` вокруг блока `AlertDialogAction` «Всё равно завершить», `:905`, и диалога старта).

**Старт сессии при открытии** (`:240-282`): `restoreSession` и `startUntimedSession` с `catch { /* graceful degradation */ }`; ветка «работаем без сессии» убирается, `/start` повторяется внутри `doSubmit`. `hydrateFromServerSession(serverSession)` — точка, где сравнивать `sessionId` с закэшированным и сбрасывать `walKey`, `frozenKey`, `clientAttemptId`.

**Статус карточки** (`:737-751`): тернарный по `isCorrect`/`earnedPoints`; заменить на `status` из вида, добавить нейтральный вариант:

```tsx
className={questionResult.isCorrect ? 'rounded border border-emerald-200 bg-emerald-50 p-3 text-sm'
	: questionResult.earnedPoints > 0 ? 'rounded border border-amber-200 bg-amber-50 p-3 text-sm'
	: 'rounded border border-rose-200 bg-rose-50 p-3 text-sm'}
```

Новый вариант `ungraded`: `rounded border bg-muted/30 p-3 text-sm`, подпись `Без оценки` (UI-SPEC, Поверхность 2). Видимость ключа (`:759`): `correctAnswer={test.showCorrectAnswer ? questionResult.correctAnswer : null}` и `showCorrectAnswer={test.showCorrectAnswer}` удаляются, вместо них `keyVisible`, `correctAnswer`, `verdicts` из вида.

**Тип результата** `ResultByQuestion` (`TestRunner.tsx:48-58`) удаляется в пользу типа пакета.

**Плашка ошибки** (`submitError`): существующий `<section>` с классами rose; разметка по UI-SPEC (`role="alert"` у текста, `flex-wrap`, `text-sm`).

---

### Web: разбор администратора (component, transform)

**Analog:** `attempt-review-utils.ts`, `QuestionAnswerReview.tsx`, `AttemptQuestionsList.tsx`, `AttemptReview.tsx`.

**Тип результата** (`attempt-review-utils.ts:12-18`, удаляется):

```typescript
export type QuestionResult = { questionId: string; isCorrect: boolean; points: number; earnedPoints: number; correctAnswer?: unknown }
export type QuestionStatus = 'correct' | 'partial' | 'wrong' | null
```

`AttemptReview.tsx:20` `(attempt.results as QuestionResult[]) ?? []` и `lib/tests/types.ts:84` `results: unknown[]` заменяются типом вида из пакета.

**Догадки о видимости ключа, подлежащие удалению:**

- `getSequenceReview` (`attempt-review-utils.ts:79-95`): `visible = correctAnswer != null || isCorrect`, `key = isCorrect ? studentAnswer : correctAnswer`, `computeVerdicts({ template: 'sequence_digits', ... })`. Вход станет `{ keyVisible, mistakes, verdicts, ... }` из вида; текст `Ошибок: N` и условия `showCells`, `hasSwap` сохраняются.
- `QuestionAnswerReview.tsx:35,110`: `const keyVisible = correctAnswer != null || (showCorrectAnswer && isCorrect)`.
- `QuestionAnswerReview.tsx:111-…` (`MatchingAnswerReview`): локальный `computeVerdicts({ template: 'matching', key: correctAnswer ?? null, answer: studentAnswer })`.
- `QuestionAnswerReview.tsx:197-232` (`TextAnswerReview`): ветки по `correctAnswer == null`, цвет карточки по `isCorrect`/`earnedPoints`, суффиксы ` · верно` / ` · частично` / ` · неверно`.
- `AttemptQuestionsList.tsx:79`: `showCorrectAnswer={true}` с `correctAnswer={result?.correctAnswer}`.

Входные свойства `QuestionAnswerReview` (`:14-21`) заменить: `{ question, studentAnswer, view }` либо раскрытые `keyVisible`, `correctAnswer`, `verdicts`, `status`. Подписи вариантов остаются (`choiceLabel`, `:23-28`).

**Статус вопроса** (`attempt-review-utils.ts:163-169`) выносится в пакет; `getStatusLabel` (`:171-176`: `Верно`, `Частично`, `Неверно`, `Без оценки`) принимает `'ungraded'`; `NAV_FILTERS` (`:23-28`) без изменений.

**Тесты утилит** (`attempt-review-utils.test.ts`): Vitest без DOM, `node:assert/strict`, названия по-русски; существующие проверки (`:24-60` `getSequenceReview` при видимом и скрытом ключе) фиксируют вывод до переключения (D-18) и служат образцом таблицы входов:

```typescript
test('getSequenceReview: верный ответ при скрытом ключе даёт Ошибок: 0 без ячеек', () => { ... })
test('getSequenceReview: неверный ответ при скрытом ключе ничего не показывает', () => { ... })
```

Тест `QuestionAnswerReview выводит summaryText как есть ...` (`:108`) читает исходник файла (`readFileSync`) — после переписывания проверить, что он остаётся осмысленным.

**Пометка «ключ на момент сдачи не сохранён»** (UI-SPEC): `<p role="note" className="mt-4 flex items-start gap-2 rounded-2xl border border-dashed ...">` после `QuestionAnswerReview`, до блока телеметрии в `AttemptQuestionsList.tsx` (телеметрия — `:80-…` в том же компоненте). Иконка `KeyRound` из `lucide-react` (импорты lucide уже есть в `QuestionAnswerReview.tsx:3`, форма: `import { ArrowLeftRight, Check, Minus, X, type LucideIcon } from 'lucide-react'`).

---

### `e2e/tests/review.spec.ts` D1 (test, e2e)

**Analog:** сам файл, блок `known defect D1` (`:227-304`) и `e2e/fixtures/exam.ts`.

Блок состоит из подготовки (`D1 setup ... @known-defect`) и одного `test.fail(...)`:

```typescript
test.fail(
	'D1 — fixed in Phase 5 (SCORE-03): admin review of an earlier attempt is unchanged @known-defect',
	async () => {
		const reviewTest = seedTest(projectKey(test.info()), 'review-d1')
		const after = await adminReviewSections(adminPage!, attemptId, reviewTest.questions.length)
		expect(after, 'admin review of an earlier attempt after the answer key was corrected').toEqual(before)
	}
)
```

Переход (D-20): `test.fail(` → `test(`, убрать `@known-defect` и `known defect` из названий (`test.describe.serial('known defect D1: ...` и `D1 setup ... @known-defect`), удалить комментарий-обоснование «Ожидаемо падает…» и комментарий подготовки «сервер хранит correctAnswer … только у неверных». Переименовать по образцу соседних блоков (`D2` выше: `test('D2: review error count equals the server error count', ...)`). Пока блок не закрыт целиком, фаза не закрывается (`yarn e2e` без ожидаемых падений, D-24).

**Контракт тела submit в фикстуре** `e2e/fixtures/exam.ts:36-50` (`SubmitPayload`, поля результата) расширить `status`, `keyVisible`, `mistakes`, `verdicts`; `takeTest` (`:163-190`) использует `page.waitForResponse(...isSubmitResponse...)` и `response.json()`, менять не нужно, пока UI шлёт конверт сам.

---

## Shared Patterns

### Единая проверка «назначен или привилегирован»
**Source:** `routes/tests/public.ts:302-316,408-420` (две инлайн-копии) → модуль `services/attempt-sessions`.
**Apply to:** чтение по slug и id, `/start`, PATCH, submit, `/attempts/me`, `/chart-data`.
Охранный тест плана 5: в `routes/` нет `from(testAssignments)` вне `assignments.ts` и модуля.

### Права
**Source:** `services/access-policy/index.ts` (`hasPermission(req, 'tests.read')`, мемоизация `WeakMap<Request, RequestEntry>` на запрос). Админ-разбор остаётся под `requirePerm('tests', 'read')` (`routes/tests/index.ts` `/admin/attempts/:attemptId`).

### Ошибки маршрутов
**Source:** `routes/tests/public.ts` — `try { ... } catch (e) { next(e) }`; домен-ответы `res.status(N).json({ error: '...' })`; для неожиданных — `ApiError.internal('...')` из `../../lib/errors.js`.

### Транзакция и время БД
**Source:** `services/session/index.ts` (`db.transaction(async (tx) => ...)`, `sql\`now()\``, `.returning(...)`, `onConflictDoNothing()`).
**Apply to:** `/start`, PATCH, submit. Время не брать `new Date()`.

### Схемы и типы через `exam-core`
**Source:** `packages/exam-core/src/attempt-result.ts`, `telemetry.ts`. Web и сервер импортируют из `@bio-exam/exam-core`; приватных копий нет (`scripts/exam-core-no-private-copies.test.mjs`).

### Тестовая инфраструктура
**Source:** `test-support/auth-app.ts` (`startAuthApp`, `seedUser`, `login`, `call`), `test-support/http.ts` (`sessionCookieFor`, `startTestServer`), `test-support/test-database.ts` (`requireTestDatabaseUrl`, `createScratchDatabase`, `migrateTestDatabase`). БД-тесты только через `node scripts/with-test-db.mjs ...` (`test_*`).

### Миграции
**Source:** `drizzle/0021_auth_sessions.sql`, `check-migrations.mjs`. Применённые не правятся; новые номера; `when` возрастает; SQL бэкфилла дописывается вручную, манифест пересчитывается.

### Без комментариев и по-русски
Комментарии в коде не писать; названия тестов, доки и тексты UI — по-русски (проектное правило, `CLAUDE.md`).

## No Analog Found

| File / приём | Role | Data Flow | Reason |
|---|---|---|---|
| `SELECT ... FOR UPDATE` через Drizzle (`.for('update')`) | service | CRUD | В tracked-коде нет; единственное `FOR UPDATE SKIP LOCKED` на сыром SQL в untracked `services/login-throttle/index.ts:82-90` (фаза 4). Использовать `tx.select()...for('update')` по документации Drizzle или `tx.execute(sql\`... FOR UPDATE\`)` по форме login-throttle |
| `onConflictDoNothing({ target, where })` по частичному уникальному индексу | service | CRUD | Есть только вызовы без цели (`session/index.ts:194`, `public.ts:838`) и с `target` без `where` (`scripts/bootstrap-admin.ts:71`, `routes/rbac/index.ts:55` для `onConflictDoUpdate`) |
| Вид для трёх зрителей, zod-схема вердиктов, адаптер чтения v1 | service / schema | transform | В кодовой базе нет версионированного хранимого формата: есть только TS-тип `QuestionVerdicts` (`adapters/types.ts:41-46`); строить по форме `access-policy` (чистая функция + шов) и `exam-core/review.ts` |
| Гонки с N параллельными транзакциями и поднятым `PG_POOL_MAX` | test | concurrency | Параллельные запросы есть только в `AUTH-05-parallel-refresh` (2 запроса, пул по умолчанию); `PG_POOL_MAX` в тестах нигде не выставляется |

## Metadata

**Analog search scope:** `app/server/src` (`services`, `routes/tests`, `routes/auth`, `db`, `test-support`), `app/server/drizzle`, `packages/exam-core/src`, `app/web/lib/tests`, `app/web/components/tests`, `e2e`, `scripts`.
**Files scanned:** около 45 (прочитаны целиком или по диапазонам; номера строк снимались с рабочего дерева 2026-10-04, для файлов фазы 4 диапазоны не фиксировались).
**Pattern extraction date:** 2026-10-04
