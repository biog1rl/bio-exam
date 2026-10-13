---
phase: 03-exam-core
plan: 10
subsystem: web-admin-tests
tags: [exam-core, question-editor, validation, D5, EXAM-04, EXAM-07, D-09, D-13, D-17]
requires: [03-02, 03-04, 03-07]
provides:
  - "validateQuestion(question, questionTypes: QuestionTypeDefinition[] | undefined) через validateQuestionForSave пакета; undefined → null (P7)"
  - "getCreateQuestionsValidationError(questions, questionTypes) с префиксом 'Вопрос N: ' и строчной первой буквой"
  - "SWR глобальных типов /api/tests/question-types?includeInactive=true в useTestEditorModel (только режим создания)"
  - "admin/tests/types/index.ts: реестр — реэкспорт из @bio-exam/exam-core; normalizeQuestionForSave через toCanonicalKey; новое описание hamming_digits"
  - "QuestionEditor: acceptsMultipleShortAnswers через keyShapeFor(...) === 'text_variants'"
  - "e2e 'D5: a short answer with two accepted variants saves' — обычный тест с проверкой полей после повторного открытия"
affects: [03-09, 03-11]
tech-stack:
  added: []
  patterns:
    - "Web-проверка вопроса = пакет: тип из загруженного списка → TemplateConfig → toCanonicalKey → validateQuestionForSave"
    - "Список типов undefined (не загружен/ошибка) отличается от пустого списка: первый пропускает проверку, второй даёт «Тип вопроса не настроен в БД»"
key-files:
  created: []
  modified:
    - app/web/app/(internal)/(protected)/admin/tests/question-validation.ts
    - app/web/app/(internal)/(protected)/admin/tests/question-validation.test.ts
    - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
    - app/web/app/(internal)/(protected)/admin/tests/types/index.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-utils.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts
    - e2e/tests/authoring.spec.ts
decisions:
  - "Фикстура таблицы 03-02: type 'single_choice' → 'radio', 'multi_choice' → 'checkbox' (встроенные ключи пакета); ожидаемые тексты не менялись, старая validateQuestion поле type не читала"
  - "Строка таблицы 'шаблон не передан' (questionUiTemplate: undefined) вызывается с [] так же, как строка null: при найденном типе шаблон берётся из типа"
  - "SWR глобальных типов в useTestEditorModel запрашивается только в режиме создания (persistNewTest вызывается только там)"
metrics:
  duration: "~15 мин"
  completed: 2026-10-04
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 8800
  tasks: 2
  commits: 0
status: complete
deferred_human_gate: true
---

# Phase 3 Plan 10: редактор вопросов проверяет пакетом, D5 закрыт Summary

Страница вопроса и создание теста проверяют вопрос через `validateQuestionForSave` из `@bio-exam/exam-core` с конфигом типа (`uiTemplate`, `mistakeMetric`, `validationSchema`) и ключом после `toCanonicalKey`. Реестр web заменён реэкспортом из пакета. D5 закрыт: вопрос «Краткий ответ (несколько вариантов)» с двумя вариантами сохраняется. Vitest и e2e D5 стали обычными тестами.

Коммит не выполнялся (правило пользователя), изменения лежат в рабочем дереве. `commits: 0` при изменённом коде отражает это правило.

## Выполнено

**Task 1 (tracer): страница вопроса.**
- `question-validation.ts`: `validateQuestion(question, questionTypes)`. Если `questionTypes === undefined`, возвращает `null`. Тип ищется по `question.type`, конфиг: `uiTemplate = question.questionUiTemplate ?? type.uiTemplate`, `mistakeMetric` и `validationSchema` берутся из типа. Если тип не найден, конфиг `null`, и пакет возвращает `Тип вопроса не настроен в БД`. Собственных правил в модуле нет.
- `QuestionEditorPageClient.tsx`: вызывается `validateQuestion(nextQuestion, questionTypesData?.questionTypes)` без `?? []`. `questionTypesData` добавлен в зависимости `useCallback`. `toast.error` и ранний `return` до `apiFetch` не менялись. Локальная `normalizeDraftCorrect` заменена на `normalizeKeyValue` пакета: числовой ключ теперь приводится к строке.
- `question-validation.test.ts`: добавлен помощник `typeOf(key)` (`getBuiltinQuestionTypeByKey` + `isSystem: true`, `isActive: true`). Все вызовы `validateQuestion` получают второй аргумент. D5 для `validateQuestion` стал обычным тестом «D5: краткий ответ с двумя вариантами проходит проверку». Добавлены строки D-13 (`minOptions: 3` и два варианта → `Добавьте минимум 3 варианта ответа`, `maxOptions: 4` и пять вариантов → `Не более 4 вариантов ответа`) и строки P7 (`undefined` → `null`; корректный вопрос и `[]` → `Тип вопроса не настроен в БД`).
- `e2e/tests/authoring.spec.ts`: блок `D5: short answer with several accepted variants`, подготовка `D5 setup: …` без `@known-defect`, проверка `D5: a short answer with two accepted variants saves` — обычный `test`. После перезагрузки тест проверяет, что сохранены `type: short_answer_variants` и `correct = ['эксперимент','моделирование']`, затем открывает `/questions/<id>` и сверяет значения полей `Вариант 1` = `эксперимент`, `Вариант 2` = `моделирование`. Комментарии об ожидаемом падении удалены, D5 убран из шапки. Новых комментариев нет.
- Tracer-гейт (auto): `<verify>` Task 1 пройден за один прогон: vitest 29 passed + 1 expected fail (это `getCreateQuestionsValidationError` до Task 2), typecheck exit 0, `yarn e2e --grep D5` зелёный. После этого начат Task 2.

**Task 2: создание теста, реестр, форма ключа.**
- `types/index.ts`: из `@bio-exam/exam-core` реэкспортируются `ALLOWED_MISTAKE_METRICS_BY_TEMPLATE`, `getAllowedMistakeMetricsForTemplate`, `isMistakeMetricAllowedForTemplate as isMetricAllowedForTemplate`, `createDefaultScoringRuleForTemplate as createDefaultQuestionTypeScoringRule` и типы `MistakeMetric`, `QuestionUiTemplate`, `QuestionTypeScoringRule`, `QuestionTypeValidation as QuestionTypeValidationSchema`, `ScoringFormula as DynamicScoringFormula`. `QuestionTypeTier = NonNullable<QuestionTypeScoringRule['tiers']>[number]`. Удалены `normalizeSequenceCorrectValue`, `normalizeShortTextCorrectValue` и `isValidSequenceCorrectValue`. `normalizeQuestionForSave` теперь вызывает `toCanonicalKey` с шаблоном вопроса. Описание `hamming_digits` дополнено правилом соседней перестановки. Legacy (`ScoringFormula`, `QuestionScoringRule`, `TestScoringRules`, `createDefaultScoringRules`) и web-интерфейс `QuestionTypeDefinition` с `hasOverride/override` не тронуты. Импорты на страницах типов и оценивания не менялись.
- `test-editor-utils.ts`: `getCreateQuestionsValidationError(questions, questionTypes)` вызывает `validateQuestion` для каждого вопроса и возвращает `Вопрос ${i + 1}: ` + текст пакета со строчной первой буквой. Собственного ветвления по шаблонам больше нет.
- `useTestEditorModel.ts`: добавлен SWR `/api/tests/question-types?includeInactive=true` с тем же `fetcher`. В `persistNewTest` уходит `questionTypesData?.questionTypes` без `?? []`, зависимость добавлена в `useCallback`.
- `QuestionEditor.tsx`: `acceptsMultipleShortAnswers` вычисляется через `keyShapeFor(...) === 'text_variants'`. Вёрстка не менялась.
- `question-validation.test.ts`: `KNOWN_DEFECTS` и ветка `test.fails` удалены. D5 для `getCreateQuestionsValidationError` — обычный тест. Добавлены строки префикса `Вопрос 1: добавьте минимум 2 варианта ответа` и P7: `undefined` → `null`, `[]` → `Вопрос 1: тип вопроса не настроен в БД`.

## Таблица 03-02

Все ожидаемые тексты таблицы 03-02 сохранены и проходят через пакет. Поменялось только то, что предусмотрел план: сняты `KNOWN_DEFECTS` и `test.fails`, D5 переведён в обычные тесты. Строк, покрасневших по другой причине, нет. Две правки фикстуры описаны в разделе «Отклонения».

## Проверки

- `yarn workspace @bio-exam/exam-core build && yarn workspace @bio-exam/web vitest run question-validation.test.ts lifecycle.test.ts` → 2 files, 36 passed. Отдельно `question-validation.test.ts` → 33 passed.
- `yarn workspace @bio-exam/web typecheck`: exit 0, строк `error TS` нет.
- `yarn workspace @bio-exam/web lint`: exit 0. Новых ошибок нет, предупреждения в изменённых файлах остались прежние.
- Проверки `node -e` из плана: `validateQuestion calls have 2 args`, `d5 flipped`, `web registry copies removed`, проверка `questionTypes ?? []` в `useTestEditorModel.ts` → exit 0.
- Прод-сборка web (`vercel.json` buildCommand с ci-окружением): exit 0, `✓ Compiled successfully`.
- `yarn format:check` чистый. `yarn verify` → `yarn verify: OK`.
- `yarn e2e --grep D5`: 8 passed (4 логина setup и D5 на обоих проектах: `D5 setup` и `D5: a short answer with two accepted variants saves` на chromium-desktop и chromium-mobile), exit 0.
- Полный `yarn e2e`: 108 passed, exit 0. Ожидаемые падения `@known-defect` в `review.spec.ts` (D1, D2) остались как были, их не трогали.
- `git status --porcelain -- 'app/web/app/(internal)/(protected)/admin/tests' e2e/tests/authoring.spec.ts` показывает только файлы этого плана и 03-02 (8 путей, список ниже).

### `codegraph affected`

```
Affected test files (6):

  app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
  app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx
  app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-utils.ts
  app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts
  app/web/app/(internal)/(protected)/admin/tests/question-validation.ts
  app/web/app/(internal)/(protected)/admin/tests/types/index.ts
```

CodeGraph принимает исходники под `admin/tests/` за тестовые файлы (по слову `tests` в пути). Поэтому дополнительно выполнен `rg` по `*.test.ts(x)` в `app/web`: эти модули импортирует только `question-validation.test.ts`. Он и `lifecycle.test.ts` прогнаны.

## Deviations from Plan

**1. [Rule 3 — блокирующее] В фикстуре таблицы 03-02 `type` заменены на встроенные ключи.** `base.type` был `'single_choice'`, а строки multi — `'multi_choice'`. Встроенных типов с такими ключами нет, поэтому через `typeOf(row.question.type)` они давали бы `Тип вопроса не настроен в БД`. Ключи заменены на `'radio'` и `'checkbox'`. Ожидаемые тексты не менялись: старая `validateQuestion` поле `type` не читала.

**2. [Решение исполнителя (автономно)] Строка `шаблон не передан` (`questionUiTemplate: undefined`) вызывается с `[]`.** План велел так поступить со строкой `null`, но для `undefined` причина та же: `??` берёт шаблон из найденного типа. Ожидаемый текст `Тип вопроса не настроен в БД` сохранён, новых строк не добавлено.

**3. [Решение исполнителя (автономно)] SWR глобальных типов в `useTestEditorModel` выполняется только в режиме создания** (`isCreateMode ? url : null`). `persistNewTest` вызывается только при `!isEditingExisting`, поэтому на странице редактирования существующего теста лишнего GET нет.

**4. [Дополнение] e2e D5 после перезагрузки проверяет и данные API** (`type`, `correct`), а затем поля формы.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности. Добавлен один GET к уже существующему `/api/tests/question-types`. T-3-20: web вызывает ту же функцию пакета, что и сервер. T-3-21: при `undefined` проверка пропускается (строки P7 в тесте).

## Deferred human verification

- CONTEXT `<specifics>` п. 4 (D-13): редактор теперь отклоняет вопросы вне `validationSchema` типа ещё до отправки (например, пользовательский тип с `minOptions: 3` и двумя вариантами → `Добавьте минимум 3 варианта ответа`). Шаги: открыть `/admin/tests/question-types`, создать или выбрать тип `multi_choice` с `minOptions: 3`, в любом тесте создать вопрос этого типа с двумя вариантами, нажать «Сохранить вопрос» и подтвердить, что такое поведение ожидаемо. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Коммит изменений делает пользователь (правило пользователя), исполнитель не коммитил.

## Файлы к коммиту

- app/web/app/(internal)/(protected)/admin/tests/question-validation.ts (новый, из 03-02)
- app/web/app/(internal)/(protected)/admin/tests/question-validation.test.ts (новый, из 03-02)
- app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
- app/web/app/(internal)/(protected)/admin/tests/types/index.ts
- app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx
- app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-utils.ts
- app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts
- e2e/tests/authoring.spec.ts
- .planning/phases/03-exam-core/03-10-SUMMARY.md

## Self-Check: PASSED

Все восемь файлов кода на месте. `question-validation.ts` содержит `validateQuestionForSave`, `types/index.ts` содержит `@bio-exam/exam-core`, `authoring.spec.ts` содержит `D5`, `QuestionEditor.tsx` содержит `keyShapeFor`. `yarn verify: OK`, `yarn e2e` зелёный. Коммитов нет по правилу пользователя (HEAD 7a6f95a).
