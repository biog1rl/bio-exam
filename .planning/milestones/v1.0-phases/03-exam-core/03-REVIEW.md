---
phase: 03-exam-core
reviewed: 2026-10-04T02:57:33Z
depth: deep
files_reviewed: 80
files_reviewed_list:
  - .github/workflows/ci.yml
  - AGENTS.md
  - README.md
  - app/server/README.md
  - app/server/package.json
  - app/server/src/db/answer-keys-jsonb.test.ts
  - app/server/src/db/schema.ts
  - app/server/src/lib/tests/question-type-resolver.test.ts
  - app/server/src/lib/tests/question-type-resolver.ts
  - app/server/src/lib/tests/scoring.ts
  - app/server/src/routes/tests/exam-flow.test.ts
  - app/server/src/routes/tests/index.ts
  - app/server/src/routes/tests/public.ts
  - app/server/src/schemas/tests.test.ts
  - app/server/src/schemas/tests.ts
  - app/server/src/scripts/e2e-seed.ts
  - app/server/vercel-build.cjs
  - app/server/vercel-build.sh
  - app/web/package.json
  - app/web/vercel.json
  - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
  - app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx
  - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-utils.ts
  - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts
  - app/web/app/(internal)/(protected)/admin/tests/question-validation.test.ts
  - app/web/app/(internal)/(protected)/admin/tests/question-validation.ts
  - app/web/app/(internal)/(protected)/admin/tests/types/index.ts
  - app/web/components/tests/TestRunner.tsx
  - app/web/components/tests/attempt-review/QuestionAnswerReview.tsx
  - app/web/components/tests/attempt-review/attempt-review-utils.test.ts
  - app/web/components/tests/attempt-review/attempt-review-utils.ts
  - app/web/components/tests/telemetry.test.ts
  - app/web/components/tests/telemetry.ts
  - app/web/lib/tests/types.ts
  - e2e/tests/authoring.spec.ts
  - e2e/tests/review.spec.ts
  - packages/exam-core/package.json
  - packages/exam-core/tsconfig.json
  - packages/exam-core/tsdown.config.ts
  - packages/exam-core/vitest.config.ts
  - packages/exam-core/src/adapters/authoring-rules.ts
  - packages/exam-core/src/adapters/index.ts
  - packages/exam-core/src/adapters/matching.ts
  - packages/exam-core/src/adapters/multi-choice.ts
  - packages/exam-core/src/adapters/sequence-digits.ts
  - packages/exam-core/src/adapters/short-text.ts
  - packages/exam-core/src/adapters/single-choice.ts
  - packages/exam-core/src/adapters/types.ts
  - packages/exam-core/src/adapters/verdicts.ts
  - packages/exam-core/src/answer.test.ts
  - packages/exam-core/src/attempt-result.test.ts
  - packages/exam-core/src/attempt-result.ts
  - packages/exam-core/src/authoring-messages.ts
  - packages/exam-core/src/authoring.test.ts
  - packages/exam-core/src/authoring.ts
  - packages/exam-core/src/boundaries.test.ts
  - packages/exam-core/src/cases/answer.cases.ts
  - packages/exam-core/src/cases/authoring.cases.ts
  - packages/exam-core/src/cases/review.cases.ts
  - packages/exam-core/src/cases/scoring.cases.ts
  - packages/exam-core/src/content.test.ts
  - packages/exam-core/src/content.ts
  - packages/exam-core/src/index.ts
  - packages/exam-core/src/invariants.test.ts
  - packages/exam-core/src/normalize.ts
  - packages/exam-core/src/plural.test.ts
  - packages/exam-core/src/plural.ts
  - packages/exam-core/src/registry.test.ts
  - packages/exam-core/src/registry.ts
  - packages/exam-core/src/review.test.ts
  - packages/exam-core/src/review.ts
  - packages/exam-core/src/scoring.test.ts
  - packages/exam-core/src/scoring.ts
  - packages/exam-core/src/telemetry.test.ts
  - packages/exam-core/src/telemetry.ts
  - scripts/check-ci-workflow.mjs
  - scripts/check-exam-core-dist.mjs
  - scripts/e2e.mjs
  - yarn.lock
  - app/server/check-questions.ts
findings:
  critical: 0
  warning: 3
  info: 6
  total: 9
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-10-04T02:57:33Z
**Depth:** deep
**Files Reviewed:** 80 (пакет `packages/exam-core/src` целиком: 13 исходников, 4 файла таблиц, 11 тестов)
**Status:** issues_found

## Summary

Ревью выноса доменной логики экзамена в `@bio-exam/exam-core` и перевода на него сервера и web. Правки фазы 2 (MDX, зависимости) в этот отчёт не входят.

BLOCKER не найдено. Три WARNING: два про устойчивость API пакета (необработанный неизвестный шаблон, `computeVerdicts` с метрикой чужого шаблона), один про разбор последовательности, где не учитывается сохранённый `isCorrect` (проявление D1). Остальное INFO.

Код не правился: `git status --short` после прогонов `yarn verify` и `yarn e2e` совпадает со снимком на начало ревью; сборочные артефакты лежат в игнорируемых каталогах.

### Что проверено и чем подтверждено

| Область | Результат | Как подтверждено |
|---|---|---|
| Паритет оценки submit | Совпадает. Тела `countMistakes` пяти адаптеров посимвольно повторяют старые `countRadio/ShortAnswer/ShortAnswerVariants/Sequence/Checkbox/MatchingMistakes` (`git show HEAD:app/server/src/lib/tests/scoring.ts:120-207`). `scoreByRule`, `normalizeRule` → `normalizeScoringRule`, `scoreQuestionByType` идентичны. `registry.ts` совпадает со старым `question-types.ts` (diff: только переименование типа и новые `QuestionTypeValidation`, `templateForMetric`). Выбор счётчика по метрике (`templateForMetric`) совпадает со старым `switch (metric)`. | Чтение кода и diff. Тест паритета удалён вместе с серверной копией (D-15), runtime-сверки старого и нового кода больше нет. |
| D-06 | `public.ts:779-815` пишет в `results` те же `isCorrect`, `points`, `earnedPoints`, `correctAnswer`. Сохранённые баллы не пересчитываются: web считает только вердикты и «Ошибок: N». | Чтение кода. |
| D-11 (`customType`) | Запись `JSON.stringify` → jsonb `string`, чтение без второго `JSON.parse` и через `db.select()`, и через `db.query.*.findMany()`. Все чтения ключа (`public.ts:755`, `index.ts:1013`, `:1318`, `:2386`, `:2433`, `:2702`) и все вставки (`index.ts:1483`, `:1782`, `:1903`, `e2e-seed.ts:155`) идут через колонку схемы. `onConflict` на `answer_keys` нет, `update(answerKeys)` трогает только `isActive`. `check-questions.ts` читает через ту же схему. drizzle-kit миграцию не предлагает. | Воспроизведение: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/db/answer-keys-jsonb.test.ts src/routes/tests/exam-flow.test.ts` → 92/92. `yarn verify` → `migrations: generate-no-diff: No schema changes`, `drizzle-check: Everything's fine`. |
| Утечка ключа | `public.ts:814` (`correctAnswer: isCorrect \|\| !showCorrectAnswer ? null : …`) без изменений; публичные маршруты ключ не отдают. Ячейки позиций рисуются только при `correctAnswer != null` (`attempt-review-utils.ts:94`), «Ошибок: N» только при `correctAnswer != null \|\| isCorrect` (`:84`), цифра ключа в sr-only только при видимом ключе. | Чтение кода; repro B (ключ скрыт, ответ неверен → `summaryText: null`, `parts: []`). |
| `isAnswered` в `TestRunner` | Правила совпадают со старой функцией для всех пяти шаблонов. | Чтение кода. |
| Проверка при сохранении | Web (`question-validation.ts`) и server (`validateQuestionWithType`) вызывают один `validateQuestionForSave`. Конфиг типа берётся из одного источника: редактор вопроса — `/question-types?testId=…` (с переопределениями, как POST/PATCH на сервере), создание теста — глобальные типы (как `/save`). D5 закрыт. | Чтение кода; e2e D5 (см. ниже). |
| Сборка и CI | Порядок rbac → exam-core → server/web в `vercel-build.cjs:39-46`, `vercel-build.sh`, `app/web/vercel.json`, `scripts/e2e.mjs:143-144`, `ci.yml:73-82` и `JOB_ORDER` в `check-ci-workflow.mjs`. `check-exam-core-dist.mjs` проходит: 57 экспортов в ESM и CJS, zod внешний, `.d.cts` на месте. В `yarn.lock` одна версия zod (3.25.76). | `node scripts/check-exam-core-dist.mjs`; `yarn verify: OK`. |
| Удаление копий (D-17) | В `app/server/src/lib/tests/scoring.ts` осталась только legacy-часть `TestScoringRules` (D-19 отложен); нормализация, счётчики и `scoreQuestionByType` удалены. В `question-type-resolver.ts` осталась только DB-часть и тонкий `validateQuestionWithType`, мёртвых помощников нет. | `git diff HEAD`. |
| Пакет | Циклов импорта нет (`scoring → adapters`, `review → scoring, adapters`, `authoring → adapters`; адаптеры не импортируют `scoring`, `review`, `authoring`). React, DOM и drizzle не импортируются, `lib: ["ES2022"]` без DOM, runtime-зависимость одна (zod). | Чтение импортов; `boundaries.test.ts`; `yarn workspace @bio-exam/exam-core test` → 490/490; typecheck server и web чистый. |
| e2e | `yarn e2e` на chromium-desktop и chromium-mobile: `108 passed (33.2s)`, выход 0. D2 (`review.spec.ts:187`, `:219`) и D5 (`authoring.spec.ts`) теперь обычные тесты и проходят на обоих проектах. Ожидаемо падает только D1 (`review.spec.ts:304`, `test.fail`, Phase 5). Сценарий WR-03 (последовательность + правка ключа после верного ответа) e2e не покрывает: D1 проверяет только `single_choice`. | `yarn e2e`. |

## Warnings

### WR-01: Неизвестный шаблон роняет `isAnswered`, `computeVerdicts`, `readKey` и `keyShapeFor`

**File:** `packages/exam-core/src/review.ts:25`, `:40`, `:48-49`; `packages/exam-core/src/adapters/index.ts:17-19`; вызов в рендере `app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx:54-58`
**Issue:** `getTemplateAdapter(template)` возвращает `undefined` для строки вне реестра, и вызывающий код сразу берёт у результата метод. `authoring.ts:16` защищает тот же поиск через `Object.hasOwn`, а `review.ts` нет. Старый `TestRunner.isAnswered` для неизвестного шаблона возвращал `false`, старый `QuestionEditor` просто сравнивал метрику.
Сценарий: `question_types.ui_template` — свободный `text` без CHECK (`schema.ts:336`, миграция `0008_question_types.sql:10`). Шаблон проверяется по `z.enum` только в CRUD типов. Если строка в БД вне пяти шаблонов (ручная правка или будущий шаблон при старом web), то:
- `isAnswered` в `TestRunner` (`:341-349`, `:842-846`) падает с TypeError на рендере, и страница прохождения не открывается;
- `keyShapeFor` в `QuestionEditor` бросает `Неизвестный шаблон вопроса` на рендере, и редактор не открывается.
Воспроизведено на `dist`: `isAnswered({template:'essay'})` → `Cannot read properties of undefined (reading 'isAnswered')`; `computeVerdicts({template:'essay'})` → `reading '0'`; `keyShapeFor` → `Неизвестный шаблон вопроса: essay`.
Уверенность: механизм подтверждён воспроизведением. Достижимость низкая: штатный API такой строки не создаёт.
**Fix:**
```ts
export function isAnswered(input: { template: QuestionUiTemplate | null | undefined; answer: unknown; content?: QuestionContent | null }): boolean {
	if (!input.template || !Object.hasOwn(TEMPLATE_ADAPTERS, input.template)) return false
	return TEMPLATE_ADAPTERS[input.template].isAnswered(input.answer, input.content ?? {})
}
```
Такой же guard нужен в `readKey` (вернуть `null`) и `computeVerdicts` (бросить понятную ошибку или вернуть пустые вердикты). В `QuestionEditor` либо проверять шаблон до `keyShapeFor`, либо сделать `keyShapeFor` безопасной и возвращать `null`.

### WR-02: `computeVerdicts` с метрикой чужого шаблона смешивает два адаптера

**File:** `packages/exam-core/src/review.ts:23-32`
**Issue:** части вердикта считает адаптер `input.template`, а `mistakes` перезаписывается вызовом `countMistakes(metric, …)`, который выбирает адаптер по `templateForMetric(metric)`. Когда `metric` не входит в `adapter.metrics`, части и число ошибок приходят из разных адаптеров, и инвариант «все части верны ⇔ ошибок 0» ломается. Пример: `computeVerdicts({ template: 'short_text', metric: 'hamming_digits', key: '12', answer: '21' })` → `parts: [{ kind: 'wrong' }]` (одна единица ошибки от short_text), `mistakes: 2` (последовательностный счётчик: длина ≤ 3, две несовпавшие позиции); `errorUnits(parts) = 1 ≠ mistakes`. Кроме того, перезапись дублирует `resolveMistakes`, который каждый адаптер уже вызвал в своём `verdicts`.
Сейчас `metric` не передаёт ни один вызов на web (`attempt-review-utils.ts:62`, `:87`, `QuestionAnswerReview.tsx:112`), поэтому дефект скрытый: функция экспортирована как публичный API пакета.
Уверенность: высокая, расхождение воспроизведено на `packages/exam-core/dist`.
**Fix:**
```ts
export function computeVerdicts(input: ComputeVerdictsInput): QuestionVerdicts {
	const adapter = getTemplateAdapter(input.template)
	const metric = input.metric && adapter.metrics.includes(input.metric) ? input.metric : defaultMistakeMetricForTemplate(input.template)
	return adapter.verdicts({ metric, key: input.key, answer: input.answer, content: input.content ?? {} })
}
```

### WR-03: Разбор последовательности не учитывает сохранённый `isCorrect`, когда ключ подставлен из текущего (проявление D1)

**File:** `app/web/components/tests/attempt-review/attempt-review-utils.ts:84-95`; источник ключа `app/server/src/routes/tests/index.ts:2708-2712`
**Issue:** у верных ответов сервер хранит `correctAnswer: null` (`public.ts:814`), а разбор администратора подставляет ТЕКУЩИЙ активный ключ (`index.ts:2711`). `getSequenceReview` берёт этот ключ и считает ошибки заново, не глядя на `isCorrect`. Разбор matching и выбора в той же ситуации опирается на сохранённый `isCorrect` (`QuestionAnswerReview.tsx:122`, `:134`, `:36-37`, `:51`), последовательность нет.
Сценарий: студент ответил `1243` на ключ `1243` (сохранено `isCorrect: true`, 2/2). Администратор меняет ключ на `1234`. В разборе попытки получается: заголовок «Ответ студента · верно» на зелёной карточке, рядом «Ошибок: 1», подсказка о перестановке и ряд ячеек с двумя янтарными `swapped`. Это противоречит UI-SPEC («при isCorrect … ячеек нет, так как Ошибок: 0», заголовок по сохранённому `isCorrect`) и D-06.
Воспроизведено вызовом функции: `getSequenceReview({ studentAnswer: '1243', correctAnswer: '1234', isCorrect: true })` → `summaryText: 'Ошибок: 1'`, `showCells: true`, `hasSwap: true`.
Корень (подстановка текущего ключа) — известный D1, его чинит Phase 5 (SCORE-03). Защитить эту ветку можно уже сейчас одной строкой, как в соседних ветках. До фазы 5 «Совпало позиций» в этой ситуации тоже показывало расхождение.
Уверенность: высокая (воспроизведено на уровне функции; e2e D1 покрывает только `single_choice`).
**Fix:**
```ts
const key = input.isCorrect ? input.studentAnswer : input.correctAnswer
const visible = input.correctAnswer != null || input.isCorrect
```
С этим при `isCorrect` число ошибок всегда 0 и ячеек нет. Пометить в тесте `attempt-review-utils.test.ts` строкой «isCorrect + другой ключ → Ошибок: 0».

## Info

### IN-01: Клиентская проверка выключается целиком, пока не загружены типы вопросов

**File:** `app/web/app/(internal)/(protected)/admin/tests/question-validation.ts:22`
**Issue:** `if (questionTypes === undefined) return null`: пока SWR не вернул `/api/tests/question-types` или после ошибки запроса пропускаются все проверки, включая пустую формулировку и D5. Старый `validateQuestion` работал без списка типов. Для POST/PATCH вопроса сервер отвечает тем же текстом адаптера (`{ error }`), и пользователь видит его в toast. Для `/save` (`index.ts:1400-1409`) текст лежит в `details.fieldErrors`, а `readApiError` (`test-editor-api.ts:5-7`) читает только `error`, поэтому показывается общий `ERROR_MESSAGES.BAD_REQUEST`. Это деградация, а не неверное сохранение: сервер проверяет тем же адаптером.
**Fix:** без списка типов проверять хотя бы то, что не зависит от конфига (формулировку и `question.questionUiTemplate` с метрикой по умолчанию), или блокировать кнопку сохранения до загрузки типов. В `readApiError` читать `details.fieldErrors.questions[0]`.

### IN-02: Смена типа в редакторе проверяет метрику напрямую, мимо адаптера

**File:** `app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx:97`
**Issue:** `acceptsMultipleShortAnswers` (`:54-58`) берёт форму ключа из `keyShapeFor`, а `handleTypeChange` сравнивает `mistakeMetric === 'compact_text_in_set'` сам. D-09 требует, чтобы форма ключа шла из адаптера. Сейчас результат одинаковый.
**Fix:** `keyShapeFor({ uiTemplate: template, mistakeMetric: selectedType.scoringRule.mistakeMetric }) === 'text_variants'`.

### IN-03: Сервер не приводит ключ к каноничной форме перед записью

**File:** `app/server/src/routes/tests/index.ts:1486`, `:1785`, `:1906`; `app/server/src/lib/tests/question-type-resolver.ts:167-179`
**Issue:** web вызывает `toCanonicalKey` до проверки и записи (`question-validation.ts:24`, `types/index.ts:250-256`), сервер нет. Прямой вызов API с `correct: "12 34"` для `sequence_digits` проходит проверку (`sequence-digits.ts:96` убирает пробелы только для проверки) и сохраняется с пробелом. Оценка и разбор пробел терпят (`normalizeDigitsSequence`), но админка показывает `12 34`, и D-10 («каноничная форма ключа») на сервере не выполняется. Поведение было и до фазы.
**Fix:** в `validateQuestionWithType` или перед `insert(answerKeys)` записывать `toCanonicalKey({ uiTemplate, key: data.correct })`.

### IN-04: Форматирование ответа matching стало «всё или ничего»

**File:** `app/web/components/tests/attempt-review/attempt-review-utils.ts:132-138`
**Issue:** `normalizeIdRecord` возвращает `null`, если хоть одно значение не строка и не число. Тогда весь ответ превращается в «Нет ответа». Старый код форматировал каждую пару отдельно (`String(map[left.id])`). Текущий submit-контракт (`AnswerValueSchema`) значений `null` не пропускает, так что затронуты только исторические или ручные данные.
**Fix:** читать пары через `answerMap` и `normalizeIdValue` поштучно, как `readGivenPairs` в `adapters/matching.ts:10-18`.

### IN-05: Устаревший комментарий в e2e после D-11

**File:** `e2e/tests/review.spec.ts:292`
**Issue:** «Сервер хранит однозначный числовой ключ числом: JSONB отдаёт 1, а не "1"». После D-11 API отдаёт `"1"`. Проверка через `String(...)` проходит, но комментарий описывает старое поведение.
**Fix:** заменить проверкой `toBe('1')` без `String()` и убрать комментарий, чтобы e2e закреплял D-11.

### IN-06: `check-exam-core-dist.mjs` работает только в CI

**File:** `scripts/check-exam-core-dist.mjs`; `scripts/verify.mjs:68` (шага нет)
**Issue:** проверку `dist` (файлы, совпадение экспортов ESM и CJS, внешний zod) запускает только job `build` в `ci.yml:79-80`; `yarn verify` её не вызывает. Так же устроена `check-rbac-dist.mjs`. Новый экспорт без правки `EXPECTED_EXPORTS` локально пройдёт `yarn verify` и упадёт только в CI. Отдельно: `exports["."].types` указывает на `index.d.ts` и для `require`, а сгенерированный `index.d.cts` не используется. У rbac так же; для текущих потребителей (ESM, `moduleResolution: Bundler`) это безвредно.
**Fix:** добавить оба `check-*-dist.mjs` в `yarn verify` после `lint-typecheck-test` (turbo к этому моменту уже собрал `dist`); при желании `exports["."].require.types: "./dist/index.d.cts"`.

---

_Reviewed: 2026-10-04T02:57:33Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
