---
phase: 03-exam-core
plan: 09
subsystem: server-question-save-validation
tags: [exam-core, server, validation, EXAM-04, EXAM-07, D-09, D-13, D-16, D-17, D5]
requires: [03-07, 03-08]
provides:
  - "validateQuestionWithType(question: { type; promptText; options?; matchingPairs?; correct }, typesMap) — обёртка: «неизвестный тип», «тип отключён», затем validateQuestionForSave пакета"
  - "QuestionSchema и SaveQuestionSchema без superRefine; OptionSchema, MatchingPairsSchema, QuestionKeyPayloadSchema из @bio-exam/exam-core"
  - "z.enum(QUESTION_UI_TEMPLATES) в CreateQuestionTypePayloadSchema и UpdateQuestionTypePayloadSchema"
  - "Тесты D-13: (POST), D-13 PATCH:, D-13 /save: и тест порядка ошибок в exam-flow.test.ts"
affects: [03-11]
tech-stack:
  added: []
  patterns:
    - "Сервер: zod проверяет форму payload и приводит id и ключ к строкам (QuestionKeyPayloadSchema), правила ключа и содержимого — один вызов validateQuestionForSave"
key-files:
  created: []
  modified:
    - app/server/src/lib/tests/question-type-resolver.ts
    - app/server/src/lib/tests/question-type-resolver.test.ts
    - app/server/src/schemas/tests.ts
    - app/server/src/schemas/tests.test.ts
    - app/server/src/routes/tests/index.ts
    - app/server/src/routes/tests/exam-flow.test.ts
decisions:
  - "Ключ на сервере приводится zod-схемой QuestionKeyPayloadSchema (числа → строки) до validateQuestionWithType; toCanonicalKey в обёртке не вызывается, ключ передаётся как есть (буквально по плану)"
  - "content.options и content.matchingPairs передаются в пакет приведением типа к QuestionContent: пакет проверяет id и text в рантайме (03-07)"
  - "OptionSchema и MatchingPairsSchema реэкспортируются из schemas/tests.ts, хотя других импортёров нет (codegraph impact): сохраняют типы Option и MatchingPairs файла"
  - "/save проверяет по глобальной карте типов, POST и PATCH — по карте теста с переопределениями; выравнивание не делалось (Discretion плана)"
metrics:
  duration: "~12 мин"
  completed: 2026-10-04
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 14900
  tasks: 2
  commits: 0
status: complete
deferred_human_gate: true
---

# Phase 3 Plan 09: проверка вопроса при сохранении на сервере через exam-core Summary

Все три маршрута сохранения вопроса (`POST /api/tests/:id/questions`, `PATCH /api/tests/:id/questions/:questionId`, `POST /api/tests/save`) проверяют вопрос одной функцией пакета `validateQuestionForSave` через `validateQuestionWithType`. zod в `schemas/tests.ts` проверяет только форму payload, ветвления по ключу типа нет, литералов шаблонов в CRUD типов нет. D-13 действует на сервере: пустые тексты вариантов, элементы сопоставления из пробелов и формулировка из пробелов отклоняются 400 на всех трёх маршрутах.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. `commits: 0` при изменениях в коде отражает это правило.

## Выполнено

**Task 1 (tracer): `validateQuestionWithType` через `validateQuestionForSave`, D-13 в характеризации.**
- Precondition: `yarn workspace @bio-exam/exam-core build && node -e "…validateQuestionForSave==='function'…"` → exit 0.
- Шаг 4 выполнен первым: три теста `D-13 (меняется в 03-09):` переименованы в `D-13:` и переключены на 400 с неизменным числом строк `questions`; добавлены три `D-13 PATCH:` (в блоке PATCH: корректный вопрос создаётся POST, PATCH с некорректным содержимым → 400, строки `answer_keys` вопроса совпадают со снимком до PATCH) и три `D-13 /save:` (в блоке `/save`: набор из шести корректных вопросов, один заменён некорректным, новый slug → 400, теста с этим slug нет). Некорректное содержимое вынесено в константы `D13_EMPTY_OPTION_TEXT`, `D13_BLANK_LEFT_ITEM`, `D13_BLANK_PROMPT`; три POST-теста D-13 оставлены с прежними литералами payload.
- Красный прогон на прежнем резолвере — ниже.
- `question-type-resolver.ts`: параметр `question` получил `promptText: string`; после проверок «неизвестный тип» и «тип отключён» (тексты без изменений) вызывается `validateQuestionForSave({ config: { uiTemplate, mistakeMetric: scoringRule.mistakeMetric, validationSchema }, promptText, content: { options, matchingPairs }, key: question.correct })`. Удалены `stringIdsArray`, `isRecordOfStrings`, `hasDuplicates`, `normalizeCompactAnswer`, `validateOptionsCount`, `validateByTemplate`, `EMPTY_VALIDATION_SCHEMA`, импорт `MistakeMetric`. DB-часть не менялась. Вызовы в `routes/tests/index.ts` уже передавали объект с `promptText` (zod-данные), typecheck прошёл без правок вызовов.
- `question-type-resolver.test.ts`: `vi.mock` базы на месте; фикстуры получили `promptText`; ожидание пустого варианта — `AUTHORING_MESSAGES.shortTextVariantEmpty` через импорт (было `/непустых/`); в карту добавлен отключённый тип `sequence_disabled`; добавлены тесты «неизвестный ключ типа отклоняется до проверки пакетом» (`Неизвестный тип вопроса: no_such_type`) и «отключённый тип отклоняется до проверки пакетом» (`Тип вопроса отключён: Последовательность (отключена)`).
- Tracer-гейт (auto): `<verify>` Task 1 после правки резолвера — `Test Files 2 passed (2)`, `Tests 75 passed (75)`, проверка `d13 flipped` → exit 0, server typecheck → exit 0. После этого начат Task 2.

**Task 2: zod только для формы, тест порядка, шаблоны из пакета.**
- `schemas/tests.ts`: удалены `IdSchema`, локальные `OptionSchema`, `MatchingPairsSchema`, `CorrectAnswerSchema`, `hasDuplicateIds`, `normalizeCompactAnswer`; импорт `MatchingPairsSchema`, `OptionSchema`, `QuestionKeyPayloadSchema` из `@bio-exam/exam-core`, реэкспорт `OptionSchema` и `MatchingPairsSchema`. `QuestionSchema` и `SaveQuestionSchema` — `z.object` без `.superRefine`, поле `correct: QuestionKeyPayloadSchema`. `TestScoringRulesSchema` и `scoringRules` остались (D-19). `superRefine` у `SaveTestSchema` (публикация без вопросов) и `ReorderQuestionsSchema` не тронуты. Экспортируемые типы файла сохранены.
- `schemas/tests.test.ts`: удалены три теста правил ключа, добавлен тест «short_answer_variants со скалярным ключом проходит zod, правило ключа проверяет пакет». Было 13 тестов, стало 11.
- `routes/tests/index.ts`: `uiTemplate: z.enum(QUESTION_UI_TEMPLATES)` в `CreateQuestionTypePayloadSchema` и `.optional()` в `UpdateQuestionTypePayloadSchema`; параметр `uiTemplate` в `validateScoringRuleTemplateCompatibility` — `QuestionUiTemplate`. Логика `isMistakeMetricAllowedForTemplate`, `/save` и карты типов не менялись.
- `exam-flow.test.ts`: в блок «POST /api/tests/:id/questions: отказы» добавлен тест «radio с одним вариантом и ключом '': 400 с первой ошибкой по порядку пакета»: `body.error === minOptionsMessage(2)` (`Добавьте минимум 2 варианта ответа`), число строк `questions` не изменилось.

## codegraph

`codegraph impact validateQuestionWithType` — 7 символов: `question-type-resolver.ts` (`validateQuestionWithType:281`), `question-type-resolver.test.ts`, `routes/tests/index.ts` (маршруты `POST /api/tests/save:1379`, `POST /api/tests/:id/questions:1700`, `PATCH /api/tests/:id/questions/:questionId:1832`), `routes/index.ts`.

`codegraph impact validateByTemplate` — 7 символов: `validateByTemplate:184` → `validateQuestionWithType:281`, тот же тестовый файл и те же три маршрута.

`codegraph impact OptionSchema` / `MatchingPairsSchema` (серверные определения) — только `schemas/tests.ts` (`QuestionSchema`, `SaveTestSchema`, `SaveQuestionSchema`) и файл `routes/tests/index.ts` (импортирует схемы-потребители, не сами `OptionSchema`/`MatchingPairsSchema`). Внешних импортёров нет; реэкспорт оставлен для типов `Option`, `MatchingPairs`.

`codegraph affected app/server/src/schemas/tests.ts app/server/src/routes/tests/index.ts app/server/src/lib/tests/question-type-resolver.ts` → 3 файла: `question-type-resolver.ts`, `routes/tests/index.ts`, `schemas/tests.test.ts`. `exam-flow.test.ts` и `question-type-resolver.test.ts` прогнаны отдельно (verify плана) и в `yarn verify`.

## Удалённые тесты схемы и их замены в пакете (03-07)

| Удалённый тест `schemas/tests.test.ts` | Строка-замена в `packages/exam-core/src/cases/authoring.cases.ts` | HTTP-отказ характеризации 03-01 |
|---|---|---|
| `short_answer_variants со скалярным ответом отклоняется` | short_text «скалярный ключ» | «short_answer_variants со строковым ключом» (таблица B) |
| `short_answer_variants с дублями вариантов отклоняется` | short_text «in_set: повтор после нормализации регистра и пробелов» | «short_answer_variants с повтором после нормализации» (таблица B) |
| `sequence с нецифровым ответом отклоняется` | sequence «буква в последовательности» | «sequence с ключом '12a4'» (таблица B, таблица F `/save`, PATCH `'12a4'`) |

После снятия `superRefine` эти HTTP-строки по-прежнему дают 400, теперь отказ возвращает пакет.

## Дифф ожиданий характеризации (`exam-flow.test.ts`)

Изменённые ожидания — только три POST-теста D-13:

```
- test('D-13 (меняется в 03-09): radio с пустым текстом одного варианта сейчас сохраняется', …
+ test('D-13: radio с пустым текстом одного варианта: 400, строк questions не прибавилось', …
- test('D-13 (меняется в 03-09): matching с текстом левого элемента из пробелов сейчас сохраняется', …
+ test('D-13: matching с текстом левого элемента из пробелов: 400, строк questions не прибавилось', …
- test('D-13 (меняется в 03-09): формулировка из одних пробелов сейчас сохраняется', …
+ test('D-13: формулировка из одних пробелов: 400, строк questions не прибавилось', …
  (в каждом)
- assert.equal(reply.status, 201)
- assert.equal(await questionCount(testId), before + 1)
+ assert.equal(reply.status, 400)
+ assert.equal(await questionCount(testId), before)
```

Добавлены: импорт `minOptionsMessage`, три константы D-13, помощник `expectPatchRejected` и три теста `D-13 PATCH:`, помощник `expectSaveRejected` и три теста `D-13 /save:`, тест порядка ошибок. Остальные ожидания не менялись; блок D-11 (03-08) не тронут. Таблицы B (отказы POST), C (`custom_multi_3`), F (`/save`), PATCH и все прочие остались зелёными без правок — `STOP` не потребовался.

## Красный прогон до правки резолвера

`node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/exam-flow.test.ts src/lib/tests/question-type-resolver.test.ts` на прежнем `validateByTemplate` → exit 1, `Tests 9 failed | 64 passed (73)`:

| Тест | Факт |
|---|---|
| `D-13:` radio с пустым текстом варианта | `201 !== 400` |
| `D-13:` matching, левый элемент из пробелов | `201 !== 400` |
| `D-13:` формулировка из пробелов | `201 !== 400` |
| `D-13 PATCH:` ×3 | `200 !== 400` |
| `D-13 /save:` ×3 | `201 !== 400` |

Других красных строк не было. После правки резолвера: `75 passed (75)`; после Task 2: `Test Files 3 passed (3)`, `Tests 87 passed (87)`.

## Проверки

- Task 1 `<automated>`: vitest 75 passed; `d13 flipped`; критерий «нет локальной проверки по шаблону» → exit 0.
- Task 2 `<automated>`: vitest (`schemas/tests.test.ts`, `exam-flow.test.ts`, `question-type-resolver.test.ts`) 87 passed; `ordering test present, superRefine removed`; `no template literals`.
- `cd app/server && node vercel-build.cjs` → `=== Build completed successfully! ===`, exit 0.
- `yarn workspace @bio-exam/server typecheck` → exit 0.
- `yarn verify` → `yarn verify: OK` (все 8 шагов passed; тесты: rbac 2, exam-core 490, web 179, server 241).
- `yarn e2e` → exit 0, `108 passed`, строки `failed` нет. Ожидаемые `test.fail` — только D1 и D2 (`review.spec.ts`) на `chromium-desktop` и `chromium-mobile`; D5 — обычный зелёный тест (03-10).
- `yarn oxfmt` по шести файлам плана; `format-check` в `yarn verify` passed.
- `git status --porcelain --untracked-files=all -- app/server/src`: файлы этого плана (`question-type-resolver.ts`, `question-type-resolver.test.ts`, `schemas/tests.ts`, `schemas/tests.test.ts`, `routes/tests/index.ts`, `?? routes/tests/exam-flow.test.ts`), файлы предыдущих планов фазы 3 (`db/schema.ts`, `lib/tests/scoring.ts`, удалённые `lib/tests/question-types.ts`, `scoring.test.ts`, `submit-result.ts`, `telemetry.ts`, `telemetry.test.ts`, `routes/tests/public.ts`, `scripts/e2e-seed.ts`, `?? db/answer-keys-jsonb.test.ts`) и остаток фазы 2 (`?? routes/uploads.test.ts`, `?? test-support/http.ts`, `?? lib/sharp-runtime.test.ts`). Все эти пути были в дереве до плана; других путей нет. Сборка `vercel-build.cjs` неотслеживаемых файлов не добавила.

## Deviations from Plan

**1. [Решение исполнителя (автономно)] Приведение типа содержимого в обёртке.** `options` и `matchingPairs` в сигнатуре остаются `unknown`, в пакет передаются как `QuestionContent['options']` / `QuestionContent['matchingPairs']`. Пакет проверяет `id` и `text` в рантайме (03-07), поэтому приведение не ослабляет проверку.

**2. [Решение исполнителя (автономно)] Ключ не проходит `toCanonicalKey` в обёртке.** План передаёт `key: question.correct`. Числа в id и ключе приводит к строкам `QuestionKeyPayloadSchema` в zod до вызова (как раньше `IdSchema`); пробелы в последовательности пакет убирает сам. Числовые строки характеризации (checkbox с числовыми id в `schemas/tests.test.ts`, таблица C) зелёные.

**3. [Дополнение] Тесты PATCH сравнивают все строки `answer_keys` вопроса со снимком до PATCH** (`deepEqual`), это покрывает и активный ключ, и число строк.

## Known Stubs

Нет.

## Threat Flags

Нет: новых сетевых точек, путей доступа и схем нет. T-3-18: все три маршрута вызывают `validateQuestionWithType` до транзакции, правила D-13 закреплены отказами на POST, PATCH и `/save`. T-3-19: проверка идёт по шаблону и метрике типа, пользовательские ключи типов проверяются так же, как встроенные (таблица C зелёная).

## Deferred human verification

- **D-13 на сервере (CONTEXT `<specifics>` п. 4).** Новое на сервере: (а) вопрос с пустым текстом варианта, с элементом сопоставления из пробелов или с формулировкой из пробелов теперь получает 400 на `POST /api/tests/:id/questions`, `PATCH /api/tests/:id/questions/:questionId` и `POST /api/tests/save` (раньше сохранялся); (б) тексты ошибок API теперь тексты пакета (как в редакторе), прежние серверные тексты (`Нужно минимум 2 варианта ответа`, `Минимум вариантов: N` и т. п.) больше не возвращаются. Проверка `validationSchema` типа была на сервере и раньше, она не меняется по сути. Сохранённые вопросы и ключи не перепроверяются и не переписываются (D-12): правила действуют при следующем сохранении. Шаги для пользователя: подтвердить, что такое ужесточение и смена текстов ошибок API допустимы; при желании открыть в редакторе существующий вопрос с пустым вариантом и убедиться, что сохранение без исправления отклоняется с понятным текстом. **Не выполнено, ждёт пользователя; исполнитель не одобрял.**
- Коммит изменений — за пользователем (правило пользователя), исполнитель не коммитил.

## Файлы к коммиту

- app/server/src/lib/tests/question-type-resolver.ts
- app/server/src/lib/tests/question-type-resolver.test.ts
- app/server/src/schemas/tests.ts
- app/server/src/schemas/tests.test.ts
- app/server/src/routes/tests/index.ts (вместе с правками 03-08 и предыдущих планов в том же файле)
- app/server/src/routes/tests/exam-flow.test.ts (новый с 03-01, ещё не отслеживается)

## Self-Check: PASSED

Все шесть файлов на месте; `question-type-resolver.ts` содержит `validateQuestionForSave`, `schemas/tests.ts` — `QuestionKeyPayloadSchema`, `routes/tests/index.ts` — `z.enum(QUESTION_UI_TEMPLATES)`. Коммитов нет по правилу пользователя (HEAD 7a6f95a не менялся).
