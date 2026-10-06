# Фаза 9: Основа результата и читатели - карта шаблонов

**Составлена:** 2026-10-06
**Файлов проанализировано:** 46 (новых и изменяемых)
**Аналогов найдено:** 43 / 46 (полный перечень читателей, строки и ловушки - в `09-RESEARCH.md`; здесь только что и откуда копировать)
**Источники аналогов:** только git-tracked исходники `dev@1962edd`; зеркал и установочных копий нет.

## Классификация файлов

| Новый / изменяемый файл | Роль | Поток данных | Ближайший аналог | Качество |
|-------------------------|------|--------------|------------------|----------|
| `packages/exam-core/src/adapters/open.ts` (новый) | adapter | transform | `packages/exam-core/src/adapters/short-text.ts` | exact |
| `packages/exam-core/src/adapters/index.ts`, `types.ts` (`KeyShape 'none'`) | registry / типы | transform | они же | exact |
| `packages/exam-core/src/registry.ts` (`open`, `manual`, `AUTO_SCORED_TEMPLATES`) | config | transform | он же (`:3-28`, `:231-237`) | exact |
| `packages/exam-core/src/scoring.ts` (ранний выход `manual`, `points = 3`) | utility | transform | он же, `scoreQuestionFacts` | exact |
| `packages/exam-core/src/attempt-result.ts` (`pending`, `ANSWERS_INVALID`, nullable итог, `reviewStatus`) | схема | request-response | он же (`:11-26`, `:83-92`, `:139-154`) | exact |
| `packages/exam-core/src/outcome.ts` (новый: `computeAttemptOutcome`, `projectionOf`) | utility | transform | формула `facts.ts:139-140` (переезжает) | role-match |
| `packages/exam-core/src/answer-limits.ts` (новый: константы, `findAnswerViolation`) | utility | transform | `adapters/authoring-rules.ts` (чистая проверка) | role-match |
| `packages/exam-core/src/{outcome,answer-limits}.test.ts` (новые) | test | transform | `registry.test.ts:90-102` (таблицы `test.each`) | role-match |
| Правка мета-тестов `exam-core` (шесть файлов) | test | transform | они же | exact |
| `scripts/check-exam-core-dist.mjs`, `scripts/exam-core-no-private-copies.test.mjs` | config / test | batch | они же | exact |
| `app/server/src/db/schema.ts` (`testAttempts`: проекция и CHECK) | model | CRUD | он же (`:477-520`, `resultsVersionCheck`) | exact |
| `app/server/drizzle/0026_*.sql` (+`0027_*.sql`), `meta/_journal.json`, `migrations-manifest.json` | migration | batch | `0022_attempt_sessions.sql`, `0020_short_answer_variants.sql` | exact |
| `app/server/src/db/attempt-result-migration.test.ts` (новый) | test | batch | `app/server/src/db/attempt-session-migration.test.ts` | exact |
| `app/server/src/db/user-deletion-rule.test.ts` (новый, PLAT-05) | test | batch | `attempt-session-migration.test.ts` (прямой SQL по временной базе) | role-match |
| `docs/adr/0006-enforce-authorization-by-construction.md` уже есть; правило удаления - в отдельный ADR | docs | - | `docs/adr/0005-decompose-by-concept.md` | exact |
| `app/server/src/services/scored-attempt/facts.ts` | service | transform | он же | exact |
| `app/server/src/services/scored-attempt/outcome.ts` (новый: `materializeAttemptOutcome`, `reconcileOutcomes`) | service | CRUD | `services/attempt-sessions/submit.ts` (транзакция `tx`) | role-match |
| `app/server/src/services/scored-attempt/columns.ts` (новый: `attemptResultColumns`, `RESULT_SQL`) | utility | CRUD | `routes/tests/admin/attempts.ts:92-114` (явные столбцы) | role-match |
| `app/server/src/services/scored-attempt/{read,view}.ts` | service | request-response | они же | exact |
| `app/server/src/services/attempt-sessions/submit.ts` | service | CRUD | он же | exact |
| `app/server/src/services/attempt-sessions/sessions.ts` (`saveSessionDraft`, 400) | service | CRUD | он же | exact |
| `app/server/src/routes/tests/admin/attempts.ts` | route | CRUD | он же | exact |
| `app/server/src/routes/tests/public.ts` (`attempts/me`, `chart-data`, submit 422, `studentQuestionView`) | route | request-response | он же | exact |
| `app/server/src/routes/users/index.ts` (профиль) | route | CRUD | он же | exact |
| `app/server/src/services/search/database-search.ts` | service | request-response | он же (`:406-431`) | exact |
| `app/server/src/routes/tests/admin/{question-types,shared}.ts` (защита `open`) | route | request-response | они же | exact |
| `app/server/src/test-support/insertAttemptFixture` (новый) | test-support | CRUD | `test-support/attempt-world.ts` + `admin-attempts-list.test.ts:60-72` | role-match |
| Серверные тесты: `attempt-readers-none.characterization`, `attempt-readers-pending`, `student-question-payload`, `admin-open-type`, `services/scored-attempt/outcome` | test | request-response | `routes/tests/admin-attempts-list.test.ts` | role-match |
| `app/web/lib/tests/attempt-result-view.ts` (новый) | utility | transform | `app/web/lib/progress/my-attempts.ts` (чистое отображение строки) | role-match |
| `app/web/components/tests/attempt-result/{ReviewStatusChip,TeacherCheckedMark,AttemptReviewLine}.tsx` (новые) | component | transform | `app/web/components/ui/badge.tsx` | role-match |
| `app/web/lib/tests/types.ts`, `lib/progress/{attempt-chart,my-attempts}.ts`, `AttemptBarChart.tsx` | model / utility | transform | они же | exact |
| `app/web/lib/tests/admin-api.ts`, `attempts-types.ts`, `AdminAttemptsClient.tsx` | component / API | request-response | они же (`StatTile`, `attemptsKey`) | exact |
| `app/web/components/tests/attempt-submit-flow.ts` (`answers-invalid`) | utility | request-response | он же (`classifySubmitFailure`, `BANNERS`) | exact |
| `app/web/components/tests/attempt-review/attempt-review-utils.ts`, `runner-result-card.ts` | utility | transform | они же | exact |
| `TestRunner.tsx`, `AttemptReviewHero.tsx`, `AttemptQuestionsList.tsx`, `AttemptReviewSummary.tsx`, `UserProfileAssignmentsPage.tsx`, `TestLandingPageClient.tsx`, `DashboardClient.tsx` | component | request-response | они же | exact |
| `QuestionInput` (`maxLength`), `ScoringSettingsPageClient.tsx`, `QuestionTypeDetailsPageClient.tsx` | component | request-response | они же | exact |
| `e2e/tests/attempt-review-pending.spec.ts` (новый), `e2e/fixtures/seed.json`, `scripts/e2e-seed.ts` | test | request-response | `e2e/tests/zero-weight.spec.ts` | role-match |
| `AGENTS.md`, `.agents/skills/{bio-exam-api,bio-exam-data}/SKILL.md`, `app/server/README.md` | docs | - | они же | exact |

## Назначения шаблонов

### `packages/exam-core/src/adapters/open.ts` (adapter, transform)

**Аналог:** `packages/exam-core/src/adapters/short-text.ts`

**Импорты** (строки 1-7):
```typescript
import { z } from 'zod'

import { AUTHORING_MESSAGES } from '../authoring-messages'
import { normalizeCompactString, normalizeIdValue } from '../normalize'
import { ALLOWED_MISTAKE_METRICS_BY_TEMPLATE } from '../registry'
import { MISTAKES_UNSCORABLE, type TemplateAdapter } from './types'
import { resolveMistakes } from './verdicts'
```

**Основной шаблон** (строки 43-75): объект `TemplateAdapter<string>` с полями `template`, `metrics: ALLOWED_MISTAKE_METRICS_BY_TEMPLATE.<шаблон>`, `answerSchema: z.string()`, `normalizeAnswer`, `countMistakes`, `verdicts`, `isAnswered` (`typeof answer === 'string' && answer.trim().length > 0`), `readKey`, `validateAuthoring`, `keyShape(metric)`. Для `open`: `answerSchema: z.string()`, `countMistakes` возвращает `MISTAKES_UNSCORABLE`, `readKey` возвращает `null`, `keyShape` возвращает `'none'`, `verdicts` не должен вызываться (бросает).

**Регистрация** (`adapters/index.ts:9-15`): запись в `TEMPLATE_ADAPTERS: Record<QuestionUiTemplate, TemplateAdapter>` и реэкспорт в строке 21 вместе с остальными адаптерами; `KeyShape` в `adapters/types.ts:61` получает `'none'`.

---

### `packages/exam-core/src/registry.ts` (config, transform)

**Аналог:** он же. Каждый `Record<QuestionUiTemplate, …>` обязан получить ключ `open`, иначе не соберётся.

`registry.ts:3-9`, `:12-19`, `:22-28`: добавить `'open'` последним в `QUESTION_UI_TEMPLATES`, `'manual'` последним в `MISTAKE_METRICS`, `open: ['manual']` последним в `ALLOWED_MISTAKE_METRICS_BY_TEMPLATE` (порядок ключей сверяет `registry.test.ts:98-100`: `Object.keys(...)` равно `[...QUESTION_UI_TEMPLATES]`). `AUTO_SCORED_TEMPLATES` - новый экспорт рядом; перебирающие мета-тесты переводятся на него (Ловушка 2 исследования). `BUILTIN_QUESTION_TYPES` получает запись `open` с правилом `{ formula: 'exact_match', mistakeMetric: 'manual', correctPoints: 3 }`. `createDefaultScoringRuleForTemplate` (`:231-237`) учит `open`.

---

### `packages/exam-core/src/scoring.ts` (utility, transform)

**Аналог:** он же, `scoreQuestionFacts` (`scoring.ts:120-160`):
```typescript
const metric = normalizeScoringRule({ rule: typeConfig.scoringRule, template, fallbackMaxPoints }).mistakeMetric
...
if (rawKey == null) return { ...base, mistakes: null, key: null, verdicts: null }
```
Добавить до `scoreQuestionByType` явную ветку `metric === 'manual'`: `points: 3`, `earnedPoints: 0`, `isCorrect: false`, `mistakes/key/verdicts: null`, независимо от `rawKey`.

---

### `packages/exam-core/src/attempt-result.ts` (схема, request-response)

**Аналог:** он же.

**Коды ошибок** (строки 11-26) - расширить тем же способом:
```typescript
export const SUBMIT_ERROR_CODES = {
	alreadySubmitted: 'ATTEMPT_ALREADY_SUBMITTED',
	timeExpired: 'TIME_EXPIRED',
} as const

export const SubmitAttemptErrorSchema = z.object({
	error: z.enum([SUBMIT_ERROR_CODES.alreadySubmitted, SUBMIT_ERROR_CODES.timeExpired]),
	attemptId: z.string().uuid().nullable().optional(),
})
```
Добавить `answersInvalid: 'ANSWERS_INVALID'` в объект и в `z.enum`, поле `reason` и `limit` в схему.

**Статус вопроса** (строки 83-92): `QuestionStatusSchema = z.enum(['ungraded','correct','partial','wrong'])` получает `'pending'`; `questionStatus(input)` получает необязательное `template` и ветку `template === 'open' → 'pending'` до правила `points === 0`. Тест `attempt-result.test.ts:200-203` сверяет `options` целиком: обновить.

**Вид попытки** (`AttemptViewSchema` `:139-147`, `AdminAttemptViewSchema` `:149-154`): `scorePercentage` и `passed` становятся `nullable`, добавляются `reviewStatus`, `earnedPoints` nullable, `autoEarnedPoints`, `autoTotalPoints`. Эти схемы разбирает `readAdminAttemptView` через `parse` (`read.ts:112`): неполное значение даёт 500.

---

### `packages/exam-core/src/outcome.ts` (utility, transform)

**Аналог:** формула, которая переезжает из `app/server/src/services/scored-attempt/facts.ts:139-140`. Повторить побайтно:
```typescript
const scorePercentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0
const passed = passingScore == null ? true : scorePercentage >= Number(passingScore)
```
Сигнатура и правила - в `09-RESEARCH.md`, раздел «Функция итога» (вес 0 даёт 0 %, порога нет даёт `true`, балл открытого зажат `0..3`). `projectionOf(outcome)` возвращает значения столбцов проекции; её применяют INSERT в `submit.ts` и UPDATE в `materializeAttemptOutcome`. Каждый новый экспорт вносится в `EXPECTED_EXPORTS` в `scripts/check-exam-core-dist.mjs` (функция `diffNames` падает и на лишних) и в список имён `scripts/exam-core-no-private-copies.test.mjs`.

**Тест** (`outcome.test.ts`): таблица `test.each` по образцу `registry.test.ts:90-92`:
```typescript
test.each(metricTemplateRows)('templateForMetric: $metric → $template', (row) => {
	assert.equal(templateForMetric(row.metric), row.template)
})
```
(в `exam-core` имена `$name`, импорт `assert from 'node:assert/strict'`; в web - `%s`).

---

### `packages/exam-core/src/answer-limits.ts` (utility, transform)

**Аналог:** `adapters/authoring-rules.ts` - чистая проверка, возвращающая причину или `null`; такой же стиль у `validateAuthoring` в `short-text.ts:60-65` (`string | null`). Экспорты: `SHORT_TEXT_MAX_LENGTH = 200`, `OPEN_TEXT_MAX_LENGTH = 5000`, `findAnswerViolation({ answers, questions })` с причинами `short_text_too_long | open_text_too_long | foreign_question | unknown_question_type`. Длина - `String.length`. Те же константы импортирует web для `maxLength` (`QuestionInput`) и для текстов баннера.

---

### `app/server/drizzle/0026_*.sql` (+ `0027_*.sql`), манифест (migration, batch)

**Аналог 1 (заполнение):** `app/server/drizzle/0022_attempt_sessions.sql`
```sql
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "session_id" uuid;--> statement-breakpoint
...
UPDATE "test_sessions" SET "closed_at" = now(), ... ;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_session_id_test_sessions_id_fk" FOREIGN KEY (...) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_close_reason_check" CHECK ("test_sessions"."close_reason" IN ('expired', 'superseded'));
```
Порядок: `ADD COLUMN` (nullable) → `UPDATE` существующих строк → `SET NOT NULL` → `ADD CONSTRAINT ... CHECK`. Файл начинается с `SET LOCAL lock_timeout = '5s';--> statement-breakpoint`. Готовые формы столбцов, CHECK и UPDATE - в `09-RESEARCH.md`, раздел «Заполнение и CHECK в миграции».

**Аналог 2 (сид типа):** `app/server/drizzle/0020_short_answer_variants.sql`: `INSERT INTO "question_types" ("key","title","description","ui_template","validation_schema","scoring_rule","is_system","is_active") VALUES (...)`. Отличие: для `open` брать `ON CONFLICT ("key") DO NOTHING`, а не `DO UPDATE SET ... "is_active" = EXCLUDED."is_active"` (иначе перезапишет включение фазы 17); `is_active = false`, `scoring_rule = '{"formula":"exact_match","mistakeMetric":"manual","correctPoints":3}'::jsonb`.

**Манифест** (`app/server/drizzle/migrations-manifest.json`, конец файла, правится вручную; писателя нет):
```json
{
  "idx": 25,
  "tag": "0025_teacher_zones",
  "file": "0025_teacher_zones.sql",
  "sha256": "2dbe45923c68da464f82c01c3c9cb9a486db4d9cab8246142a35f8011f50099b",
  "when": 1791139459249,
  "breakpoints": true
}
```
Новая запись: `idx: 26`, `sha256` файла (`shasum -a 256`), `when` строго больше `1791139459249` и равен значению в `meta/_journal.json`. Затем `node scripts/check-migrations.mjs`. Триггер `BEFORE UPDATE` на факты (D-19) в отпечаток схемы не входит; CHECK обязан быть описан и в `schema.ts`.

---

### `app/server/src/db/schema.ts` (model, CRUD)

**Аналог:** `testAttempts` (`schema.ts:477-520`); столбцы объявляются в том же стиле (`real('...')`, `smallint`, `timestamp('...', { withTimezone: true })`), ограничения - как `resultsVersionCheck`:
```typescript
resultsVersionCheck: check('test_attempts_results_version_check', sql`${t.resultsVersion} IN (1, 2)`),
```
`results_version` и его CHECK не трогать. Новые столбцы: `reviewStatus` (`text`, default `'none'`), `finalEarnedPoints`, `finalScorePercentage`, `finalPassed` (nullable), `gradedAt`, `passingScore`, `autoTotalPoints`, `submitSource`; CHECK-и проекции описываются через `check(...)` здесь же (иначе падают этапы 2 и 4 `check-migrations`). Генерация: `yarn workspace @bio-exam/server drizzle:generate`, затем ручная правка SQL до применения.

---

### `app/server/src/db/attempt-result-migration.test.ts` (test, batch)

**Аналог:** `app/server/src/db/attempt-session-migration.test.ts`

**Импорты и константы** (строки 1-24):
```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
...
import {
	createScratchDatabase,
	migrateTestDatabase,
	requireTestDatabaseUrl,
	type ScratchDatabase,
} from '../test-support/test-database.js'

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))
const LAST_APPLIED_IDX = 21
```
Для новой миграции `LAST_APPLIED_IDX = 25`: временная база, миграции до 0025, вставка попыток со старыми столбцами, затем `migrateTestDatabase(scratch.url)`; проверки: `review_status = 'none'`, `final_*` равны фактам, `auto_total_points = total_points`, хэш в `__drizzle_migrations` равен sha256 манифеста (образец в строках 219-224 исходного теста), CHECK отвергает `pending` с итогом и `none` без итога (23514), `open` засеян с `is_active = false`.

---

### `app/server/src/db/user-deletion-rule.test.ts` (test, batch) - PLAT-05

**Аналог:** подключение к базе - как в `attempt-session-migration.test.ts` (`requireTestDatabaseUrl`, `Pool` из `pg`). Тело теста - запрос к каталогу:
```sql
SELECT conrelid::regclass, conname, confdeltype
FROM pg_constraint WHERE confrelid = 'users'::regclass AND contype = 'f'
```
Правила: `confdeltype IN ('c','n')` кроме списка `LEGACY_EXCEPTIONS = [['users','created_by']]` (`users_created_by_fk`, `schema.ts:95-99`, без `onDelete`); у столбцов с `set null` `attnotnull = false`; FK на `test_sessions` и `test_attempts` тоже `c`/`n`; поведенческий случай - удаление пользователя с попыткой, сессией, назначением, группой и авторством теста. Правило записывается в новый ADR с шапкой как у `docs/adr/0005-decompose-by-concept.md` (`status: Accepted`, `date: 2026-10-06`, затем заголовок и раздел «Решение»); `docs/adr/0006-enforce-authorization-by-construction.md` уже занят другим ADR, поэтому номер правила удаления определяет планировщик (следующий свободный).

---

### `app/server/src/services/scored-attempt/facts.ts` (service, transform)

**Аналог:** он же. Подсчёт баллов и формула (`facts.ts:96-142`):
```typescript
totalPoints += scored.points
earnedPoints += scored.earnedPoints
...
const scorePercentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0
const passed = passingScore == null ? true : scorePercentage >= Number(passingScore)
return { ok: true, facts, earnedPoints, totalPoints, scorePercentage, passed }
```
Заменить две строки формулы вызовом `computeAttemptOutcome({ facts, finalScores: new Map(), passingScore })`; результат расширить полями проекции. Входная проверка встаёт после загрузки типов:
```typescript
const questionTypesMap = await getQuestionTypeMapForTest({ testId, includeInactive: true })
for (const q of questionRows) {
	if (!questionTypesMap[q.type]) return { ok: false, reason: 'type_not_configured', type: q.type }
}
```
(`facts.ts:66-69`; вызов `findAnswerViolation` сюда же, новый вариант `ScoreSubmissionResult` с причиной нарушения по образцу `{ ok: false; reason: 'type_not_configured'; type: string }`, строка 38).

---

### `app/server/src/services/attempt-sessions/submit.ts` (service, CRUD)

**Аналог:** он же. INSERT четырёх столбцов (`submit.ts:143-161`):
```typescript
const [inserted] = await tx
	.insert(testAttempts)
	.values({
		testId, userId, sessionId: testSessionId, clientAttemptId, answers,
		results: scored.results, resultsVersion: scored.resultsVersion,
		earnedPoints: scored.earnedPoints, totalPoints: scored.totalPoints,
		scorePercentage: scored.scorePercentage, passed: scored.passed,
		telemetry: Object.keys(mergedTelemetry).length > 0 ? mergedTelemetry : null,
	})
	.onConflictDoNothing()
	.returning({ id: testAttempts.id })
```
Добавить `...projectionOf(...)` в тот же `.values` (CHECK немедленный, отдельный UPDATE после INSERT невозможен). Тип `ScoredAttemptFacts` (`:11-18`) расширяется. После INSERT других UPDATE фактов нет: `.update(testAttempts)` в коде отсутствует.

---

### `app/server/src/services/scored-attempt/outcome.ts` (service, CRUD)

**Аналог:** транзакционный стиль `submit.ts` (`tx`, `eq(testAttempts.id, …)`, `sql` фрагменты). `materializeAttemptOutcome(tx, { attemptId, latestScores })` читает факты попытки через `read.ts`, считает `computeAttemptOutcome`, пишет `projectionOf` UPDATE-ом; `reconcileOutcomes` для `none` сверяет четыре фактовых столбца (D-17), а не пересчёт по `passing_score`. Загрузчик оценок передаётся параметром (фазы 12 и 15 подставят свой).

---

### `app/server/src/services/scored-attempt/{read,view}.ts` и `columns.ts` (service, request-response)

**Аналог:** `read.ts:63-96`:
```typescript
async function readAttemptRow(attemptId: string) {
	const [row] = await db
		.select({
			id: testAttempts.id,
			...
			earnedPoints: testAttempts.earnedPoints,
			totalPoints: testAttempts.totalPoints,
			scorePercentage: testAttempts.scorePercentage,
			passed: testAttempts.passed,
			results: testAttempts.results,
			...
		})
		.from(testAttempts)
```
```typescript
function summaryOf(row: AttemptRow): AttemptSummary {
	return { id: row.id, submittedAt: row.submittedAt.toISOString(), earnedPoints: row.earnedPoints, totalPoints: row.totalPoints, scorePercentage: row.scorePercentage, passed: row.passed }
}
```
`attemptResultColumns` (новый, `columns.ts`) - объект Drizzle-столбцов, который подставляют `read.ts` и все серверные читатели: `final_*` под именами `earnedPoints`, `scorePercentage`, `passed`, плюс `reviewStatus`, `autoEarnedPoints`, `autoTotalPoints`. `RESULT_SQL` - параллельный SQL-фрагмент для сырого запроса поиска. `testAttempts.results` разрешено читать только в `services/scored-attempt` (охрана `RESULTS_READ_CHECKS` в `scripts/attempt-integrity-guards.test.mjs`).

---

### `app/server/src/routes/tests/admin/attempts.ts` (route, CRUD)

**Аналог:** он же.

**Схема запроса** (строки 35-44) - добавить рядом со `status`:
```typescript
status: z.enum(['active', 'inactive', 'all']).default('all'),
review: z.enum(['all', 'pending', 'graded']).default('all'),
```
**Фильтры** (`:48-67`): `if (query.status !== 'all') filters.push(eq(users.isActive, query.status === 'active'))`, рядом `if (query.review !== 'all') filters.push(eq(testAttempts.reviewStatus, query.review))`.

**Агрегаты** (`:81-90`, `:117-126`, `:173-183`): убрать `coalesce(..., 0)`, читать `final_*`, явный `review_status <> 'pending'`:
```typescript
averageScore: sql<number>`coalesce(round(avg(${testAttempts.scorePercentage})::numeric, 1), 0)::float`,
passedAttempts: sql<number>`count(*) filter (where ${testAttempts.passed})::int`,
```
Приведение `Number(counts?.averageScore ?? 0)` (`:132,142,244`) превращает `null` в 0: заменить.

**Охват** (`:185-189`):
```typescript
const [scopeCounts] = await db
	.select({ total: sql<number>`count(*)::int` })
	.from(testAttempts)
	.innerJoin(tests, eq(tests.id, testAttempts.testId))
	.where(visible)
```
сюда же `pendingTotal: sql<number>\`count(*) filter (where ${testAttempts.reviewStatus} = 'pending')::int\``. Пустая зона (`:159-169`): `summary: { passed: 0, averageScore: null, pendingTotal: 0 }`.

---

### `app/server/src/routes/tests/public.ts` (route, request-response)

**Аналог:** он же.
- `chart-data` (`:474-489`): добавить `review_status <> 'pending'` в условия, читать `final_score_percentage`, убрать `Math.round(a.scorePercentage ?? 0)`.
- `attempts/me` (`:424-431`): `attemptResultColumns`; `pending` остаются в списке.
- Submit (`:596-632`): `if (!scored.ok)` получает ветку нарушения (422 `ANSWERS_INVALID`) по образцу существующих ответов; `500 Question type is not configured` (`:616`) заменяется на 422 `unknown_question_type`.
- Вопросы ученику (`:282-334`, `:350-398`): блок `questionsWithTexts` продублирован дословно, оба выбирают явные столбцы `id, type, order, points, options, matchingPairs, promptPath`. Вынести в `studentQuestionView` с белым списком полей, тест точного набора ключей. `GET`-списки, бросающие `Question type is not configured` (`:316`, `:380`), не трогать.

---

### `app/server/src/routes/tests/admin/{question-types,shared}.ts` (route, request-response)

**Аналог:** `shared.ts:16-24`:
```typescript
export function validateScoringRuleTemplateCompatibility(params: {
	uiTemplate: QuestionUiTemplate
	scoringRule: z.infer<typeof QuestionTypeScoringRuleSchema>
}): string | null {
	if (!isMistakeMetricAllowedForTemplate(params.uiTemplate, params.scoringRule.mistakeMetric)) {
		return 'Способ подсчёта ошибок не подходит к формату ответа этого типа вопроса'
	}
	return null
}
```
Расширить: для шаблона `open` любое `scoringRuleOverride` отклоняется. В `question-types.ts`: `POST /question-types` (`:127`) отклоняет `uiTemplate === 'open'`; `PATCH /question-types/:key` (`:182`) отклоняет `isActive: true` и правило, отличное от `{ exact_match, manual, 3 }` для `open` (сохранение неизменённых значений проходит). Создание вопроса `open` уже блокирует `validateQuestionWithType` (`if (!resolvedType.isActive) return \`Тип вопроса отключён: ...\``).

---

### `app/server/src/services/search/database-search.ts` (service, request-response)

**Аналог:** он же, `:406-431` (сырой SQL, параметры `$1…$4`). Три места, где процент и `passed` читаются из фактовых столбцов:
```sql
(te.title || ' · ' || round(ta.score_percentage::numeric)::text || '%') as title,
concat_ws(' · ', top.title, ${student}, case when ta.passed then 'Сдано' else 'Не сдано' end, ta.submitted_at::date::text) as subtitle,
...
concat_ws(' ', te.title, top.title, ${studentMatch}, ta.score_percentage::text, ta.submitted_at::date::text) ilike $2 ...
```
Заменить на `ta.final_score_percentage` (NULL у `pending`, `concat_ws` его пропускает, «85» её не найдёт) и ветку `case when ta.review_status = 'pending' then 'На проверке' when ta.final_passed then 'Сдано' else 'Не сдано' end`; в `title` процент только при `review_status <> 'pending'`. Новая ветка статическая, значения остаются параметризованными. Характеризация: `services/search/database-search.test.ts` (расшифровка запросов по `categoryOf(sqlText)`) и `routes/search-results.characterization.test.ts`.

---

### Серверные тесты читателей и `insertAttemptFixture` (test, request-response)

**Аналог:** `app/server/src/routes/tests/admin-attempts-list.test.ts`. Прямая вставка попытки (`:60-72`), которая ломается от строгого CHECK и переходит на общий помощник:
```typescript
const result = await ctx.pgPool.query<{ id: string }>(
	`INSERT INTO test_attempts (test_id, user_id, answers, results, earned_points, total_points, score_percentage, passed, submitted_at)
	VALUES ($1, $2, '{}', '{}', $3, 100, $3, $4, $5) RETURNING id`,
	[input.testId, input.userId, input.score, input.passed, input.submittedAt]
)
```
Ожидаемая сводка тоже считается прямым SQL (`expectedSummary`, `:74-85`: `coalesce(round(avg(ta.score_percentage)::numeric, 1), 0)::float`): после фазы `averageScore: number | null`, без `pending`. Запуск мира: `ctx = await startAuthApp('test_attempts_list')`, `w = await seedTeacherZoneWorld(ctx, 'atl')` (`test-support/auth-app.ts`, `test-support/teacher-zone-world.ts`). Остальные три фикстуры, вставляющие попытки (Ловушка 1): `services/question-content/move-remove.test.ts:155`, `services/access-policy/zone-store.test.ts:158`, `routes/tests/attempt-review.test.ts:78`. Сид вопросов для HTTP-сдачи: `test-support/attempt-world.ts` (`ATTEMPT_QUESTIONS: Record<AttemptQuestionType, Json>`).

---

### `app/web/lib/tests/attempt-result-view.ts` (utility, transform)

**Аналог:** `app/web/lib/progress/my-attempts.ts:14-28` - чистая функция «строка API в вид»:
```typescript
function toProgressAttempt(test: ProgressTest, row: TestAttemptSummary): ProgressAttempt {
	return { attemptId: row.id, ..., scorePercentage: row.scorePercentage, passed: row.passed }
}
```
Контракт вида - `09-UI-SPEC.md`, раздел «Данные для интерфейса» (`AttemptResultView = pending | final`). `toProgressAttempt` для `pending` возвращает `null`, `loadMyProgressAttempts` отбрасывает `null` (цикл `for (const row of page.rows) collected.push(...)`, `:34-35`). `clampPercent(null)` и `?? 0` запрещены; `TestAttemptSummary` (`lib/tests/types.ts:62-69`) получает `scorePercentage: number | null`, `passed: boolean | null`, `earnedPoints: number | null`, `reviewStatus`, `autoEarnedPoints`, `autoTotalPoints`; компилятор покажет все места. Тест - таблица `test.each` с `%s` (юнит только для логики с вариантами).

---

### `app/web/components/tests/attempt-result/{ReviewStatusChip,TeacherCheckedMark,AttemptReviewLine}.tsx` (component, transform)

**Аналог:** `app/web/components/ui/badge.tsx`:
```tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils/cn'

function Badge({ className, variant, ...props }: BadgeProps) {
	return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
```
Базовые классы Badge: `inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ...`; `ReviewStatusChip` переопределяет их списком из `09-UI-SPEC.md`, Поверхность 1 (`variant="secondary"`, `gap-1 rounded-full border-dashed border-secondary-foreground/40 px-2 py-1 font-medium whitespace-nowrap hover:bg-secondary`, пиктограмма `Clock3 size-3.5 aria-hidden`). `cn` - из `@/lib/utils/cn`. `components/ui/*` не править. Готовый JSX всех трёх компонентов дан в UI-SPEC (Поверхность 1).

---

### `app/web/app/(internal)/(protected)/admin/attempts/AdminAttemptsClient.tsx`, `attempts-types.ts`, `lib/tests/admin-api.ts` (component, request-response)

**Аналог:** они же.

**Плитка** (`AdminAttemptsClient.tsx:58-66`) - геометрия для `ReviewTile`:
```tsx
function StatTile({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof FileText }) {
	return (
		<div className="rounded-3xl border border-border/70 bg-secondary/65 p-4">
			<Icon className="mb-4 size-5 text-primary" />
			<p className="font-serif text-3xl leading-none">{value}</p>
			<p className="mt-2 text-sm text-muted-foreground">{label}</p>
		</div>
	)
}
```
Сетка плиток `:263-266` (четыре `StatTile`: `всего в базе`, `показано`, `пройдено`, `тем`): `ReviewTile` встаёт между `пройдено` и `тем`. Верхний ряд фильтров (`:271-277`): `<div className="mb-3 max-w-xs"><UserStatusFilter ... onChange={(status) => updateUrlFilters({ status, student: null })} /></div>` - сюда `Select` «Проверка» по UI-SPEC, ключ `review` в `updateUrlFilters`.

**Типы** (`attempts-types.ts:20-29`): `summary: { passed: number; averageScore: number }` → `{ passed: number; averageScore: number | null; pendingTotal: number }`. **Парсер** (`admin-api.ts:145-155`): сейчас `typeof summary.averageScore !== 'number'` дает `MalformedBodyError`; принять `null`; обновить `admin-api.test.ts:542-557`. **Ключ SWR** (`admin-api.ts:93-106`, `attemptsKey`): `review` в `AttemptsFilters`, при `all` параметр не отправляется. Мок e2e `e2e/tests/attempts-list.spec.ts` (`summary: { passed: 0, averageScore: 50 }`) дополняется.

---

### `app/web/components/tests/attempt-submit-flow.ts` (utility, request-response)

**Аналог:** он же, `classifySubmitFailure` (`:70-79`):
```typescript
export function classifySubmitFailure(error: unknown): SubmitFailure {
	if (!(error instanceof AttemptRequestError)) return { kind: 'retry' }
	if (error.status === 409 && error.code === SUBMIT_ERROR_CODES.alreadySubmitted) {
		return { kind: 'already-submitted', attemptId: error.attemptId }
	}
	if (error.status === 422 && error.code === SUBMIT_ERROR_CODES.timeExpired) return { kind: 'time-expired' }
	if (error.status === 403) return { kind: 'not-assigned' }
	if (error.status === 404) return { kind: 'not-found' }
	return { kind: 'retry' }
}
```
Ветка `answers-invalid` (`status === 422 && code === SUBMIT_ERROR_CODES.answersInvalid`) встаёт после `404` и до `return { kind: 'retry' }`; порядок остальных не меняется. Тексты баннеров - в `BANNERS`/`SUBMIT_FLOW_TEXT` того же файла (`bannerFor(banner)`, `:90-92`), числа 200 и 5 000 берутся из констант `exam-core`. Тест: `components/tests/attempt-lifecycle/lifecycle-submit.test.ts` (`setupLifecycle`, `fakeAttemptApi`, `requestError`, `settle` из `./testing`). Черновик отвечает 400, а не 422: `toSaveOutcome` (`lifecycle.ts:145-151`) отправляет 400 в `reject`, всё остальное, кроме 403/404, в `retry`.

---

### `app/web/components/tests/attempt-review/attempt-review-utils.ts`, `runner-result-card.ts` (utility, transform)

**Аналог:** они же.
```typescript
export function getStatusLabel(status: QuestionStatus | null) {
	if (status === 'correct') return 'Верно'
	if (status === 'partial') return 'Частично'
	if (status === 'wrong') return 'Неверно'
	return 'Без оценки'
}
export function getStatusClass(status: QuestionStatus | null) {
	...
	return 'border-border/70 bg-secondary/60 text-muted-foreground'
}
export function getStatusDotClass(status: QuestionStatus | null) {
	...
	return 'bg-muted-foreground/35'
}
```
(`attempt-review-utils.ts:350-370`). Добавить ветку `pending`: метка `На проверке`, класс `border-border/70 bg-secondary text-secondary-foreground`, точка `bg-muted-foreground/35`. `runner-result-card.ts:5`: `const CARDS: Record<QuestionStatus, RunnerResultCard>` перестанет компилироваться без записи `pending`; тест `runner-result-card.test.ts:21-26` использует `'pending'` как неизвестный статус - заменить на другое значение (`'skipped'`).

---

### `DashboardClient.tsx` (component, request-response)

**Аналог:** он же. Удаляются семь неиспользуемых объектов (вывод oxlint): `Area`, `AreaChart` (импорт, `:21`), `studentChartConfig` (`:96`), `adminStudentChartConfig` (`:103`), `studentProgress` (`:228`), `groupedTests` (`:238`), `adminStudentScores` (`:266`). Два из них читают `scorePercentage`. Условие `averageScore ? … : '—'` (`:340`) прячет настоящие 0 %: перевести на проверку `null`. Остальные читатели (`:75-78, 85, 92, 221, 224, 233, 271, 323, 341, 387, 392, 407, 412, 480, 487, 521`) переходят на `attempt-result-view.ts` и `AttemptReviewLine`.

---

### `e2e/tests/attempt-review-pending.spec.ts` (test, request-response)

**Аналог:** `e2e/tests/zero-weight.spec.ts`:
```typescript
import {
	adminReviewSections, createOwnTest, deleteOwnTest, expect, isSubmitRequest, projectKey, test,
	type OwnQuestion, type SubmitPayload,
} from '../fixtures/exam'
...
test('SCORE-04: ... @score04', async ({ adminPage, studentPage: page }, testInfo) => {
	const own = await createOwnTest(adminPage, page, { prefix: `zero-${projectKey(testInfo)}`, questions: QUESTIONS })
	try { ... } finally { ... }
```
Фикстуры (`adminPage`, `studentPage`, `createOwnTest`, `projectKey`) - из `e2e/fixtures/exam`. Сид попыток `pending` - блок `attempts` в `e2e/fixtures/seed.json` и вставка в `scripts/e2e-seed.ts`; поле `correct` в `SeedQuestion` для `open` необязательное. Прогон на desktop и mobile (`Pixel 7`), 375 px.

---

## Общие шаблоны

### Один источник формулы итога
**Источник:** `app/server/src/services/scored-attempt/facts.ts:139-140` (переезжает в `packages/exam-core/src/outcome.ts`)
**Применять к:** `facts.ts`, `outcome.ts` (сервер), любая сверка `reconcileOutcomes`; копий формулы в SQL, маршрутах и web нет (ADR-0002).

### Единственный список столбцов результата
**Источник:** новый `services/scored-attempt/columns.ts` (`attemptResultColumns`, `RESULT_SQL`), образец явного выбора столбцов - `routes/tests/admin/attempts.ts:92-114`
**Применять к:** `admin/attempts.ts` (дашборд, список, деталь), `public.ts` (`attempts/me`, `chart-data`), `routes/users/index.ts:340-356` (поля `:347-350`), `database-search.ts` (`RESULT_SQL`), `read.ts`. В каждом агрегате явный `review_status <> 'pending'`.

### Миграция с заполнением
**Источник:** `app/server/drizzle/0022_attempt_sessions.sql` + запись манифеста + `schema.ts` (все три в одном изменении)
**Применять к:** 0026/0027. Применённые миграции не правятся; триггер и функции в отпечаток `scripts/lib/schema-fingerprint.mjs` не входят, CHECK, индексы и столбцы входят.

### `number | null` без приведения
**Источник:** `app/web/lib/progress/attempt-chart.ts:92-94,107` (`clampPercent(value: number)`), `AttemptBarChart.tsx:177` (`formatPercent(row.percent ?? 0)`)
**Применять к:** всем web-читателям. `?? 0`, `clampPercent(null)`, `Number(null)` запрещены; метки только из трёх компонентов `attempt-result/*`.

### Построение тестов
**Источник:** `registry.test.ts:90-102` (таблицы `test.each`, `node:assert/strict`), `admin-attempts-list.test.ts` (мир `startAuthApp` + `seedTeacherZoneWorld`), `attempt-session-migration.test.ts` (временная база)
**Применять к:** всем новым тестам. БД-тесты только через `node scripts/with-test-db.mjs`; без структурных охранников и текстовых проверок исходников; охрана `RESULTS_READ_CHECKS` не нарушается.

### Пакет `exam-core` и сборка
**Источник:** `scripts/check-exam-core-dist.mjs` (`EXPECTED_EXPORTS`, точное сравнение)
**Применять к:** каждому новому экспорту пакета; перед одиночным `vitest run` сервера собрать `yarn workspace @bio-exam/exam-core build`.

## Аналог не найден

| Файл | Роль | Поток данных | Причина |
|------|------|--------------|---------|
| `app/server/src/db/user-deletion-rule.test.ts` (каталог FK) | test | batch | Тестов, читающих `pg_constraint`, в репозитории нет; брать форму из `09-RESEARCH.md` («Правило удаления пользователя»), подключение - как в `attempt-session-migration.test.ts` |
| Триггер `BEFORE UPDATE` на факты `test_attempts` (D-19) | migration | event-driven | Триггеров в миграциях нет; писать вручную в SQL 0026/0027 (в отпечаток схемы не входит), тест - один интеграционный (UPDATE фактов отвергнут) |
| `studentQuestionView` (белый список полей) | utility | transform | Сейчас блок `questionsWithTexts` продублирован дословно в `public.ts:282-334` и `:350-398`; готовой общей функции нет |

## Метаданные

**Область поиска аналогов:** `packages/exam-core/src`, `app/server/{src,drizzle}`, `app/web/{app,components,lib}`, `e2e`, `scripts`, `docs/adr`
**Прочитано ключевых файлов:** 30 (полный перечень читателей с номерами строк - `09-RESEARCH.md`, «Verified Facts»)
**Дата извлечения шаблонов:** 2026-10-06
**Замечание о ADR:** `docs/adr/0006-enforce-authorization-by-construction.md` в рабочем дереве уже есть (не отслеживается git). Исследование называло правило удаления «ADR-0006»: занять следующий свободный номер, чтобы не перезаписать чужой файл.
