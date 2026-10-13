---
phase: 09-result-foundation-and-readers
reviewed: 2026-10-06T00:26:16Z
depth: standard
files_reviewed: 102
files_reviewed_list:
  - app/server/drizzle/0026_attempt_result_projection.sql
  - app/server/src/db/attempt-result-migration.test.ts
  - app/server/src/db/attempt-session-migration.test.ts
  - app/server/src/db/schema.ts
  - app/server/src/db/user-deletion-rule.test.ts
  - app/server/src/routes/tests/admin-attempts-list.test.ts
  - app/server/src/routes/tests/admin-open-type.test.ts
  - app/server/src/routes/tests/admin/attempts.ts
  - app/server/src/routes/tests/admin/question-types.ts
  - app/server/src/routes/tests/admin/shared.ts
  - app/server/src/routes/tests/attempt-readers-none.characterization.test.ts
  - app/server/src/routes/tests/attempt-readers-pending.test.ts
  - app/server/src/routes/tests/attempt-review.test.ts
  - app/server/src/routes/tests/attempt-submit.test.ts
  - app/server/src/routes/tests/attempt-time-limit.test.ts
  - app/server/src/routes/tests/public.ts
  - app/server/src/routes/tests/student-question-payload.test.ts
  - app/server/src/routes/tests/student-question-view.ts
  - app/server/src/routes/users/index.ts
  - app/server/src/scripts/e2e-seed.ts
  - app/server/src/services/access-policy/zone-store.test.ts
  - app/server/src/services/attempt-sessions/sessions.ts
  - app/server/src/services/attempt-sessions/submit.ts
  - app/server/src/services/question-content/move-remove.test.ts
  - app/server/src/services/scored-attempt/columns.ts
  - app/server/src/services/scored-attempt/facts.ts
  - app/server/src/services/scored-attempt/index.ts
  - app/server/src/services/scored-attempt/outcome.test.ts
  - app/server/src/services/scored-attempt/outcome.ts
  - app/server/src/services/scored-attempt/read.ts
  - app/server/src/services/scored-attempt/view.test.ts
  - app/server/src/services/scored-attempt/view.ts
  - app/server/src/services/search/database-search.ts
  - app/server/src/test-support/attempt-fixture.ts
  - app/web/app/(internal)/(protected)/admin/attempts/AdminAttemptsClient.tsx
  - app/web/app/(internal)/(protected)/admin/attempts/attempts-types.ts
  - app/web/app/(internal)/(protected)/admin/tests/question-types/QuestionTypesPageClient.tsx
  - app/web/app/(internal)/(protected)/admin/tests/question-types/[key]/QuestionTypeDetailsPageClient.tsx
  - app/web/app/(internal)/(protected)/admin/tests/scoring/ScoringSettingsPageClient.tsx
  - app/web/app/(internal)/(protected)/admin/tests/types/index.ts
  - app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx
  - app/web/app/(internal)/(protected)/tests/[topicSlug]/[testSlug]/TestLandingPageClient.tsx
  - app/web/components/progress/AttemptBarChart.tsx
  - app/web/components/tests/QuestionInput.tsx
  - app/web/components/tests/TestRunner.tsx
  - app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts
  - app/web/components/tests/attempt-lifecycle/lifecycle.ts
  - app/web/components/tests/attempt-lifecycle/testing.ts
  - app/web/components/tests/attempt-result/AttemptReviewLine.tsx
  - app/web/components/tests/attempt-result/ReviewStatusChip.tsx
  - app/web/components/tests/attempt-result/TeacherCheckedMark.tsx
  - app/web/components/tests/attempt-review/AttemptQuestionsList.tsx
  - app/web/components/tests/attempt-review/AttemptReviewHero.tsx
  - app/web/components/tests/attempt-review/AttemptReviewNav.tsx
  - app/web/components/tests/attempt-review/AttemptReviewSummary.tsx
  - app/web/components/tests/attempt-review/attempt-review-utils.test.ts
  - app/web/components/tests/attempt-review/attempt-review-utils.ts
  - app/web/components/tests/attempt-review/review-viewers.test.ts
  - app/web/components/tests/attempt-submit-flow.test.ts
  - app/web/components/tests/attempt-submit-flow.ts
  - app/web/components/tests/runner-result-card.test.ts
  - app/web/components/tests/runner-result-card.ts
  - app/web/components/users/UserProfileAssignmentsPage.tsx
  - app/web/lib/progress/attempt-chart.ts
  - app/web/lib/progress/my-attempts.test.ts
  - app/web/lib/progress/my-attempts.ts
  - app/web/lib/tests/admin-api.test.ts
  - app/web/lib/tests/admin-api.ts
  - app/web/lib/tests/api.ts
  - app/web/lib/tests/attempt-result-view.test.ts
  - app/web/lib/tests/attempt-result-view.ts
  - app/web/lib/tests/attempts-url.test.ts
  - app/web/lib/tests/attempts-url.ts
  - app/web/lib/tests/types.ts
  - app/web/lib/users/api.ts
  - e2e/fixtures/accounts.ts
  - e2e/tests/attempt-review-pending.spec.ts
  - e2e/tests/attempts-list.spec.ts
  - packages/exam-core/src/adapters/index.ts
  - packages/exam-core/src/adapters/open.ts
  - packages/exam-core/src/adapters/types.ts
  - packages/exam-core/src/answer-limits.test.ts
  - packages/exam-core/src/answer-limits.ts
  - packages/exam-core/src/answer.test.ts
  - packages/exam-core/src/attempt-result.test.ts
  - packages/exam-core/src/attempt-result.ts
  - packages/exam-core/src/authoring.test.ts
  - packages/exam-core/src/cases/answer.cases.ts
  - packages/exam-core/src/cases/authoring.cases.ts
  - packages/exam-core/src/cases/review.cases.ts
  - packages/exam-core/src/index.ts
  - packages/exam-core/src/invariants.test.ts
  - packages/exam-core/src/outcome.test.ts
  - packages/exam-core/src/outcome.ts
  - packages/exam-core/src/registry.test.ts
  - packages/exam-core/src/registry.ts
  - packages/exam-core/src/review.test.ts
  - packages/exam-core/src/scoring.test.ts
  - packages/exam-core/src/scoring.ts
  - scripts/check-exam-core-dist.mjs
  - scripts/check-migrations.mjs
  - scripts/exam-core-no-private-copies.test.mjs
findings:
  critical: 1
  warning: 3
  info: 9
  total: 13
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-10-06T00:26:16Z
**Depth:** standard
**Files Reviewed:** 102
**Status:** issues_found

## Summary

Проверены миграция 0026, проекция результата (`computeAttemptOutcome`, `projectionOf`, `materializeAttemptOutcome`, `reconcileOutcomes`), серверные читатели (`attemptResultColumns`/`attemptResultSql`), входная проверка `ANSWERS_INVALID`, запреты типа `open`, `studentQuestionView` и все web-поверхности с «На проверке».

Основа сделана добротно. Все серверные читатели берут поля результата из `final_*`; каждый SQL-агрегат исключает `review_status = 'pending'`; `chart-data` пропускает `NULL`; `my-attempts` двигает смещение по `fetched`, а не по `collected`. На web нигде не нашлось `?? 0`, `clampPercent(null)` и вывода `NaN%`. В миграции порядок правильный: столбцы → заполнение → `SET NOT NULL` → CHECK, триггер пропускает обновления `session_id` и проекции, `users_created_by_fk` пересоздан с `SET NULL`. SQL поиска собирается из константных фрагментов, пользовательский ввод идёт через `$n`, инъекции нет.

Главный дефект в новой входной проверке SEC-04/N3: предел длины проверяется только у строковых значений текстовых шаблонов, поэтому его обходит любой ответ в форме массива или объекта, а у шаблонов с выбором ответа длина не ограничена совсем. Есть ещё два расхождения: сервер ограничивает `sequence_digits`, а клиент нет, и у открытого вопроса статус «На проверке» не зависит от статуса попытки.

## Critical Issues

### CR-01: Предел длины ответа (SEC-04/N3) обходится ответом не-строкой и ответом на вопрос с выбором

**File:** `packages/exam-core/src/answer-limits.ts:43-46` (вызовы: `app/server/src/services/scored-attempt/facts.ts:73-77`, `app/server/src/services/attempt-sessions/sessions.ts:132-145`; хранение как есть: `app/server/src/services/attempt-sessions/submit.ts:158`)

**Issue:** `findAnswerViolation` проверяет длину, только если `typeof value === 'string'` и у шаблона есть запись в `TEXT_LIMITS` (`short_text`, `sequence_digits`, `open`). При этом `SubmitAttemptRequestSchema` и `SaveAttemptDraftRequestSchema` принимают любой `AnswerValueSchema` (`string | string[] | Record<string,string>`) без ограничений размера. Поэтому:
- на вопрос `short_text`, `sequence_digits` или `open` ответ `["<9 МБ>"]` или `{ "a": "<9 МБ>" }` проходит проверку (адаптер нормализует его в `null`, вопрос считается неверным);
- на вопросы `single_choice`, `multi_choice` и `matching` строка или массив любой длины проходят всегда, у этих шаблонов нет предела.

Ответ сохраняется без изменений в `test_attempts.answers` (`submit.ts:158`, `answers: userAnswers`) и в `test_sessions.draft_answers` при каждом `PATCH` черновика. Единственная граница — `JSON_BODY_LIMIT` (`app.ts:22`, 10 МБ по умолчанию) на один запрос. Получается, что назначенный ученик может писать по ~10 МБ на сдачу и на каждое сохранение черновика, хотя фаза объявляет эту дыру закрытой (D-06/D-07).

**Fix:** проверять форму ответа схемой адаптера шаблона и ограничивать размер у всех шаблонов, а не только у строк текстовых:
```ts
import { getTemplateAdapter } from './adapters/index'

const MAX_ID_LENGTH = 200
const MAX_LIST_ITEMS = 64

function exceedsShape(template: QuestionUiTemplate, value: unknown): boolean {
	if (!getTemplateAdapter(template).answerSchema.safeParse(value).success) return true
	const parts = typeof value === 'string' ? [value] : Array.isArray(value) ? value : Object.entries(value as Record<string, string>).flat()
	if (parts.length > MAX_LIST_ITEMS) return true
	const limit = TEXT_LIMITS[template]?.limit ?? MAX_ID_LENGTH
	return parts.some((part) => typeof part !== 'string' || part.length > limit)
}
```
Для ответа неверной формы нужна отдельная причина (например, `answer_shape_invalid`) с 422 на сдаче и 400 на черновике. Плюс серверные тесты: массив на `short_text` и длинная строка на `single_choice` должны получать отказ.

## Warnings

### WR-01: `sequence_digits` ограничен на сервере (200), но не на клиенте; отказ черновика не виден, а на дедлайне ответы теряются

**File:** `app/web/components/tests/QuestionInput.tsx:88`, `packages/exam-core/src/answer-limits.ts:23-27`, `app/web/components/tests/attempt-lifecycle/lifecycle.ts:154`, `app/web/components/tests/attempt-lifecycle/save-indicator.ts:37`, `app/web/components/tests/attempt-lifecycle/lifecycle.ts:655-660`

**Issue:** `TEXT_LIMITS` относит `sequence_digits` к пределу 200 (причина `short_text_too_long`), а `<Input>`, общий для `short_text` и `sequence_digits`, ставит `maxLength` только при `template === 'short_text'`. Ученик может ввести больше 200 цифр, и тогда:
1. `PATCH` черновика получает 400 → `toSaveOutcome` возвращает `reject` → очередь удаляет запись, `saveIndicatorKind` показывает `saved`. Ученик видит «Сохранено», хотя на сервере ответа нет.
2. Сдача получает 422 с текстом «Краткий ответ не может быть длиннее 200 знаков» на вопросе-последовательности.
3. Если это автосдача по таймеру, `applySubmitFailure` возвращает ученика в `active` при `autoFired = true` и истёкшем таймере. Ручная сдача после окна `ATTEMPT_GRACE_PERIOD_MINUTES` получает `TIME_EXPIRED`, и все ответы попытки теряются.

D-06 называет предел 200 только для `short_text`.

**Fix:** одно правило на сервере и клиенте. Либо взять предел для поля из `exam-core`:
```tsx
maxLength={template === 'short_text' || template === 'sequence_digits' ? SHORT_TEXT_MAX_LENGTH : undefined}
```
либо убрать `sequence_digits` из `TEXT_LIMITS`. Отказ черновика (`queue.rejected`) должен давать в индикаторе отдельное состояние, а не `saved`.

### WR-02: Открытый вопрос всегда «На проверке», даже в попытке со статусом `graded`

**File:** `packages/exam-core/src/attempt-result.ts:102`, `app/server/src/services/scored-attempt/view.ts:63-74`

**Issue:** `questionStatus` возвращает `'pending'` для любого факта с `template === 'open'` и не смотрит на статус попытки. `buildQuestionView` не передаёт ни `reviewStatus`, ни итоговые оценки, поэтому в проверенной попытке (её засевает e2e-сид с `grade` через `materializeAttemptOutcome`) шапка показывает итоговый процент и «проверено учителем», а список вопросов (`AttemptQuestionsList`), колонка «на проверке» в `AttemptReviewSummary`, фильтр навигации `navFiltersFor`, карточка `TestRunner` и подпись «до 3 балл.» по-прежнему говорят «На проверке». Сумма баллов по вопросам (0 за открытый) не сходится с итогом в шапке. Это противоречие внутри контракта, и в фазе 15 оно перейдёт на настоящие проверенные попытки.

**Fix:** передавать в `buildAttemptView` оценки открытых вопросов и выводить статус из них:
```ts
function buildQuestionView(fact: ReadableFact, viewer: AttemptViewer, grades: ReadonlyMap<string, number>): AttemptQuestionView {
	const grade = fact.template === 'open' ? grades.get(fact.questionId) : undefined
	const earnedPoints = grade ?? fact.earnedPoints
	const status = fact.template === 'open' && grade !== undefined
		? questionStatus({ points: fact.points, isCorrect: grade === fact.points, earnedPoints })
		: questionStatus(fact)
	return { ...base, earnedPoints, status }
}
```
Если до фазы 15 оценок нет нигде, закрепить в `AttemptViewSchema` правило «`status: 'pending'` у вопроса только при `reviewStatus: 'pending'`» и записать это ограничение, чтобы фаза 15 не унаследовала противоречие молча.

### WR-03: В разборе проверяющего у открытого вопроса пометка «Ключ на момент сдачи не сохранён»

**File:** `app/web/components/tests/attempt-review/attempt-review-utils.ts:179-184` (вывод: `AttemptQuestionsList.tsx:44`, `:83-90`)

**Issue:** `getAdminReviewNote` возвращает `'key-unknown'` для любого вопроса с `keyVisible === false`. У открытого вопроса ключа нет по замыслу (`KeyShape = 'none'`, `readKey() → null`, `discloseKey` даёт `keyVisible: false`), поэтому у каждого открытого ответа в попытке на проверке (сид `attempt-review-pending`) учитель видит пометку «Ключ на момент сдачи не сохранён. Показаны ответ студента и сохранённые баллы.». Пометка неверная и сбивает с толку.

**Fix:**
```ts
export function getAdminReviewNote(view: AttemptQuestionView | null): AdminReviewNote | null {
	if (!view || view.status === 'pending') return null
	if (!view.keyVisible) return 'key-unknown'
	if (view.verdicts == null) return 'verdicts-unavailable'
	return null
}
```
Плюс проверка в `attempt-review-utils.test.ts` или `review-viewers.test.ts`, что у вопроса `pending` пометки нет.

## Info

### IN-01: Факты сдачи передаются в `submitAttempt` дважды

**File:** `app/server/src/services/attempt-sessions/submit.ts:17-26`, `app/server/src/routes/tests/public.ts:615-633`, `app/server/src/scripts/e2e-seed.ts:332-341`

**Issue:** `ScoredAttemptFacts` содержит и `outcome.submitted.*`, и плоские `earnedPoints/totalPoints/scorePercentage/passed`. `submitAttempt` читает только `outcome.submitted`, а вызывающие заполняют оба набора. Два источника одного факта могут разойтись.

**Fix:** убрать плоские поля из `ScoredAttemptFacts` (и из `ScoreSubmissionResult`), оставить `outcome`.

### IN-02: Профиль ученика пишет «нет попыток», когда в периоде есть попытки на проверке

**File:** `app/web/components/users/UserProfileAssignmentsPage.tsx:735-751`

**Issue:** «Нет данных за выбранный период» и «Нет попыток за выбранный день» показываются, когда `chartAttempts` пуст, даже если в `periodAttempts` есть попытки на проверке (их отфильтровывает `userAttemptToProgress`).

**Fix:** при `periodAttempts.length > 0 && chartAttempts.length === 0` показывать «Попытки за период ещё на проверке».

### IN-03: Карточка «На проверке: N» считает всю зону, а список под ней по умолчанию только с активными учениками

**File:** `app/server/src/routes/tests/admin/attempts.ts:193-200`, `app/web/app/(internal)/(protected)/admin/attempts/AdminAttemptsClient.tsx:374-379`

**Issue:** `pendingTotal` считается по `visible` без фильтра `status` (так задумано, D-10). Но список по умолчанию идёт со `status=active`, поэтому нажатие на карточку с N может показать меньше N строк (попытки отключённых учеников не видны). Соседние «пройдено» и «средний результат» считаются по отфильтрованной выборке.

**Fix:** подписать карточку «по всей зоне» или при нажатии ставить `status: 'all'` вместе с `review: 'pending'`.

### IN-04: Черновик проверяет вопрос до проверки сессии: 400 раньше 404 и лишние запросы

**File:** `app/server/src/services/attempt-sessions/sessions.ts:132-145`

**Issue:** запрос вопроса и `getQuestionTypeMapForTest` выполняются до того, как транзакция найдёт сессию. Для закрытой или чужой сессии с чужим `questionId` ответ 400 `foreign_question` вместо 404, и на каждое сохранение уходят два лишних запроса.

**Fix:** сначала проверить сессию (или проверять внутри транзакции после `SELECT ... FOR UPDATE`), потом ответ.

### IN-05: `chart-data` читает `final_score_percentage` напрямую, а не через `attemptResultColumns`

**File:** `app/server/src/routes/tests/public.ts:471`

**Issue:** правило фазы — «все серверные читатели берут поля результата через один экспорт». Здесь `testAttempts.finalScorePercentage` указан напрямую, как и `testAttempts.finalScorePercentage`/`finalPassed` в агрегатах `admin/attempts.ts:91-94`, `:125-127`, `:183-186`. Поведение верное, но шов обойдён.

**Fix:** `scorePercentage: attemptResultColumns.scorePercentage`, `attemptResultColumns.passed` в фильтрах агрегатов.

### IN-06: `materializeAttemptOutcome` переписывает `graded_at` при каждом пересчёте, `repairFromFacts` пишет вне транзакции

**File:** `app/server/src/services/scored-attempt/outcome.ts:71`, `:129-139`, `:196-199`

**Issue:** повторная материализация уже проверенной попытки (например, починка в `reconcileOutcomes`) ставит `graded_at = now()` заново, и время проверки теряется. `repairFromFacts` обновляет строку без `FOR UPDATE` и без транзакции, поэтому может перезаписать результат параллельного писателя (появится в фазе 15). Кроме того, `reconcileOutcomes({ repair: true })` с загрузчиком без оценок переводит каждую `graded`-строку обратно в `pending`.

**Fix:** при пересчёте сохранять `graded_at`, если попытка уже была `graded` (`coalesce(graded_at, now())`); `repairFromFacts` делать через `db.transaction` с `FOR UPDATE`; не чинить `graded`, если загрузчик не вернул оценок этой попытки.

### IN-07: `ON CONFLICT ("key") DO NOTHING` молча оставляет свой тип с ключом `open`

**File:** `app/server/drizzle/0026_attempt_result_projection.sql:53`

**Issue:** если в базе уже есть кастомный тип с ключом `open` (ключ админ задаёт сам), сид пропускается. Тогда системного неактивного `open` в базе нет, а под этим ключом лежит чужой, возможно активный тип с другим шаблоном; `getBuiltinQuestionTypeByKey('open')` и фаза 17 будут считать его системным.

**Fix:** перед выкаткой проверить запросом сверки `SELECT key, ui_template, is_system FROM question_types WHERE key = 'open'` и добавить это в runbook; в следующей миграции можно падать явно, если строка `open` есть, но `ui_template <> 'open'`.

### IN-08: Длина считается в кодовых единицах UTF-16, а не в знаках

**File:** `packages/exam-core/src/answer-limits.ts:44`

**Issue:** `value.length` считает эмодзи и символы вне BMP за 2. Сейчас это совпадает с `maxLength` браузера, но счётчик «4 100 / 5 000» из D-08 (фаза 14) по `[...value].length` разойдётся с сервером.

**Fix:** зафиксировать единицу подсчёта в `exam-core` одной функцией (`answerLength(value)`) и использовать её на сервере и в счётчике.

### IN-09: В ответе `ANSWERS_INVALID` нет вопроса, который нарушил правило

**File:** `app/server/src/routes/tests/public.ts:85-91`, `app/web/components/tests/attempt-submit-flow.ts:69-90`

**Issue:** `AnswerViolation.questionId` вычисляется, но в тело ответа не попадает. Баннер «Сократите ответ» не говорит, какой это вопрос, и клиент не может перейти к нему.

**Fix:** добавить `questionId` в `answersInvalidBody` и `SubmitAttemptErrorSchema`, а в `TestRunner` переводить позицию на этот вопрос.

---

_Reviewed: 2026-10-06T00:26:16Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
