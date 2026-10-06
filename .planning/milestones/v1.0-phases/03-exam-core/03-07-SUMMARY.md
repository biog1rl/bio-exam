---
phase: 03-exam-core
plan: 07
subsystem: exam-core-authoring
tags: [exam-core, authoring, validation, plural, EXAM-02, EXAM-03, EXAM-07, D-09, D-10, D-13, D5]
requires: [03-06]
provides:
  - "validateQuestionForSave({ config, promptText, content, key }) — одна проверка вопроса при сохранении, первая ошибка или null"
  - "AUTHORING_MESSAGES (16 текстов), minOptionsMessage, maxOptionsMessage, exactChoiceCountMessage"
  - "keyShapeFor(config) и toCanonicalKey({ uiTemplate, key }) (D-10)"
  - "pluralRu(n, forms)"
  - "TemplateAdapter.validateAuthoring и keyShape во всех пяти адаптерах (обязательные)"
  - "Типы TemplateConfig, KeyShape, AuthoringInput, ValidateQuestionForSaveInput"
  - "cases/authoring.cases.ts: SINGLE_CHOICE (25), MULTI_CHOICE (18), MATCHING (19), SHORT_TEXT (20), SEQUENCE (11), ORDER (18), SERVER_AUTHORING_RULES (37), KEY_SHAPE_CASES, TO_CANONICAL_KEY_CASES"
affects: [03-09, 03-10]
tech-stack:
  added: []
  patterns:
    - "Порядок правил: тип → формулировка → число вариантов/пар → пустые тексты → id → maxOptions → ключ → exactChoiceCount; возвращается первая ошибка"
    - "Минимум вариантов max(2, minOptions); validationSchema действует только для single_choice и multi_choice, exactChoiceCount — только для multi_choice (как на сервере)"
    - "Проверка строгая к сырой форме ключа; вызывающий код сначала приводит ключ через toCanonicalKey, потом проверяет"
    - "Строки таблиц помечены serverRules; тест требует отклоняющую строку для каждого правила SERVER_AUTHORING_RULES"
key-files:
  created:
    - packages/exam-core/src/authoring.ts
    - packages/exam-core/src/authoring-messages.ts
    - packages/exam-core/src/authoring.test.ts
    - packages/exam-core/src/adapters/authoring-rules.ts
    - packages/exam-core/src/cases/authoring.cases.ts
    - packages/exam-core/src/plural.ts
    - packages/exam-core/src/plural.test.ts
  modified:
    - packages/exam-core/src/adapters/types.ts
    - packages/exam-core/src/adapters/single-choice.ts
    - packages/exam-core/src/adapters/multi-choice.ts
    - packages/exam-core/src/adapters/matching.ts
    - packages/exam-core/src/adapters/short-text.ts
    - packages/exam-core/src/adapters/sequence-digits.ts
    - packages/exam-core/src/index.ts
    - scripts/check-exam-core-dist.mjs
decisions:
  - "Тексты и функции текстов с числом лежат в листовом модуле authoring-messages.ts (импортирует только plural.ts), authoring.ts их реэкспортирует: адаптеры импортируют тексты, authoring.ts импортирует адаптеры, иначе цикл импортов"
  - "Общая проверка вариантов выбора (минимум, пустые тексты, id, максимум) вынесена в adapters/authoring-rules.ts для single_choice и multi_choice; там же хелперы сторон сопоставления"
  - "Проверка строгая к сырому ключу: число для short_text и sequence_digits, число для single_choice и нестроковые элементы для multi_choice отклоняются; приведение — дело toCanonicalKey и QuestionKeyPayloadSchema до вызова (как IdSchema на сервере)"
  - "maxOptionsMessage склоняет через pluralRu(n, ['варианта','вариантов','вариантов']) по плану: 1 → «варианта», 5 → «вариантов», 21 → «варианта» (грамматически верно; UI-SPEC приводит примеры только для 1 и 5)"
  - "Неизвестный uiTemplate в config трактуется как ненастроенный тип (typeNotConfigured); keyShapeFor для него бросает ошибку"
metrics:
  duration: "~6 мин"
  completed: 2026-10-04
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 17850
  tasks: 2
  commits: 0
status: complete
deferred_human_gate: false
---

# Phase 3 Plan 07: проверка вопроса при сохранении в exam-core Summary

`validateQuestionForSave` — одна проверка вопроса для web и server: пять адаптеров получили `validateAuthoring` и `keyShape`, тексты ошибок собраны в `AUTHORING_MESSAGES` дословно по UI-SPEC, тексты с числом склоняются через `pluralRu`. D5 закрыт в пакете: `short_text` + `compact_text_in_set` с ключом `['эксперимент', 'моделирование']` возвращает `null`.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. `commits: 0` при изменениях в коде отражает это правило.

## Выполнено

**Task 1 (tracer): short_text и единая точка проверки.** `adapters/types.ts`: `TemplateConfig`, `KeyShape`, `AuthoringInput`, методы `validateAuthoring` и `keyShape` в `TemplateAdapter` (в Task 1 опциональные). `authoring.ts`: `validateQuestionForSave` (config `null` или неизвестный шаблон → `Тип вопроса не настроен в БД`; `promptText.trim()` пустой → `Введите текст вопроса`; дальше `TEMPLATE_ADAPTERS[config.uiTemplate].validateAuthoring`), `keyShapeFor`. `shortTextAdapter`: `compact_text_in_set` — массив минимум из двух, каждый вариант непустая строка, без повторов после `normalizeCompactString`; иначе — непустая после trim строка. Tracer-гейт (auto): `<verify>` (test + typecheck) перезапущен после экспорта из `index.ts`, зелёный — расширение продолжено.

**Task 2 (TDD): выбор, сопоставление, последовательность, validationSchema, склонение.**
- `plural.ts`: `pluralRu` (последние две цифры 11–14 → третья форма; иначе 1 → первая, 2–4 → вторая, прочее → третья).
- `authoring-messages.ts`: `AUTHORING_MESSAGES`, `minOptionsMessage`, `maxOptionsMessage`, `exactChoiceCountMessage`.
- `adapters/authoring-rules.ts`: `validateChoiceOptions` (минимум `max(2, minOptions)` → пустые тексты → строковые уникальные id → `maxOptions`), `hasEmptyText`, `uniqueStringIds`, `readMatchingSides`. Поля `id`/`text` проверяются в рантайме, тип `QuestionContent` не считается гарантией.
- `single_choice`: ключ — непустая строка из id вариантов. `multi_choice`: непустой массив строк → каждый id из вариантов и без повторов → `exactChoiceCount`. `matching`: сторона-массив и минимум 2 слева и справа → пустые тексты → id → ключ-объект, все значения строки, каждый левый id (через `Object.hasOwn`) указывает на правый id из списка. `sequence_digits`: строка, после удаления пробелов только цифры.
- `toCanonicalKey`: `short_text` и `sequence_digits` — конечное число → строка; `sequence_digits` — пробелы убираются; остальное без изменений.
- Методы `validateAuthoring` и `keyShape` в интерфейсе стали обязательными.
- `scripts/check-exam-core-dist.mjs`: +8 runtime-экспортов (`AUTHORING_MESSAGES`, `exactChoiceCountMessage`, `keyShapeFor`, `maxOptionsMessage`, `minOptionsMessage`, `pluralRu`, `toCanonicalKey`, `validateQuestionForSave`), итого 57.

## Сверка текстов с UI-SPEC (таблица «Тексты»)

Тест `тексты совпадают с таблицей «Тексты» UI-SPEC` сравнивает значения с литералами.

| Правило UI-SPEC | Ключ | Текст в пакете | Совпадает |
|---|---|---|---|
| Тип не настроен | `typeNotConfigured` | `Тип вопроса не настроен в БД` | да |
| Пустая формулировка | `promptEmpty` | `Введите текст вопроса` | да |
| Выбор: мало вариантов (по умолчанию) | `minOptionsMessage(2)` | `Добавьте минимум 2 варианта ответа` | да |
| Выбор: пустой текст варианта | `choiceOptionEmpty` | `Заполните все варианты ответа` | да |
| `single_choice`: ключ не выбран | `singleKeyMissing` | `Выберите правильный ответ` | да |
| `multi_choice`: ключ пуст | `multiKeyMissing` | `Выберите правильные ответы` | да |
| Сопоставление: мало пар | `matchingTooFew` | `Добавьте минимум 2 пары для сопоставления` | да |
| Сопоставление: пустой элемент | `matchingItemEmpty` | `Заполните все элементы сопоставления` | да |
| Сопоставление: нет ключа | `matchingKeyMissing` | `Укажите правильные соответствия` | да |
| `short_text`, `compact_text_equal`: пустой | `shortTextKeyMissing` | `Укажите правильный краткий ответ` | да |
| `compact_text_in_set`: меньше двух | `shortTextVariantsTooFew` | `Укажите минимум два допустимых ответа` | да |
| `compact_text_in_set`: пустой вариант | `shortTextVariantEmpty` | `Заполните все допустимые ответы` | да |
| `compact_text_in_set`: повтор | `shortTextVariantsDuplicate` | `Допустимые ответы не должны повторяться` | да |
| `sequence_digits`: не цифры | `sequenceDigitsOnly` | `Для последовательности используйте только цифры без пробелов` | да |
| `minOptions` (N) | `minOptionsMessage` | `Добавьте минимум 3 варианта ответа`, `… 5 вариантов …`, `… 1 вариант …`, `… 21 вариант …` | да |
| `maxOptions` (N) | `maxOptionsMessage` | `Не более 1 варианта ответа`, `Не более 4 вариантов ответа`, `Не более 5 вариантов ответа` | да (21 → `варианта`, см. решения) |
| `exactChoiceCount` (N) | `exactChoiceCountMessage` | `Отметьте ровно 1 правильный ответ`, `… 2 правильных ответа`, `… 5 правильных ответов` | да |

## Тексты для правил вне UI-SPEC

| Ключ | Текст | Правило |
|---|---|---|
| `choiceIdsInvalid` | `Варианты ответа должны иметь уникальные id` | id варианта не строка или повтор |
| `multiKeyUnknown` | `Выберите правильные ответы из списка вариантов` | элемент ключа не из вариантов или повтор |
| `matchingIdsInvalid` | `Элементы сопоставления должны иметь уникальные id` | id элемента не строка или повтор слева/справа |

Тест `в текстах нет слов correct, left, right` проверяет все значения `AUTHORING_MESSAGES` и тексты с числом для 0, 1, 2, 5, 11, 21 (`/\b(correct|left|right)\b/i`; `id` допустим).

## Соответствие серверных правил строкам таблиц (T-3-13)

Строки помечены полем `serverRules`; тест `каждое серверное правило имеет отклоняющую строку` падает, если у правила из `SERVER_AUTHORING_RULES` нет отклоняющей строки, и если помеченная строка проходит.

| Серверное правило | Отклоняющая строка таблицы |
|---|---|
| `QuestionSchema`: `promptText` min(1) | short_text «пустая формулировка» |
| `validateByTemplate` choice: не массив / меньше 2 | single «варианты отсутствуют», «один вариант» |
| `validateByTemplate` choice: id не строка | single «id варианта не строка» |
| `validateByTemplate` choice: повтор id | single/multi «повтор id вариантов» |
| `validateOptionsCount`: minOptions | single «minOptions 3: 2 варианта (N−1) отклоняются», multi «minOptions 3: 2 варианта отклоняются» |
| `validateOptionsCount`: maxOptions | single «maxOptions 4: 5 вариантов (N+1) отклоняются», multi «maxOptions 4: 5 вариантов отклоняются» |
| `validateByTemplate` single: ключ не строка / не из вариантов | single «ключ null», «ключ не из вариантов», «ключ массив» |
| `validateByTemplate` multi: не массив строк / пустой | multi «пустой список верных», «ключ строка вместо списка», «нестроковый элемент ключа» |
| `validateByTemplate` multi: id не из вариантов | multi «элемент ключа не из вариантов» |
| `validateByTemplate` multi: повтор | multi «повтор в ключе» |
| `validateByTemplate` multi: exactChoiceCount | multi «exactChoiceCount 2: 1 верный (N−1)», «… 3 верных (N+1)» |
| `validateByTemplate` matching: нет left/right | matching «пары отсутствуют» |
| `validateByTemplate` matching: меньше 2 слева или справа | matching «один элемент слева», «один элемент справа» |
| `validateByTemplate` matching: id не строка | matching «id элемента не строка» |
| `validateByTemplate` matching: повтор id | matching «повтор id слева» |
| `validateByTemplate` matching: ключ не объект строк | matching «ключ массив», «ключ строка», «значение пары не строка» |
| `validateByTemplate` matching: левый без правого | matching «ключ пустой объект», «левый элемент без пары», «правый элемент не из списка» |
| `validateByTemplate` short_text in_set: меньше двух / нестроковый / пустой | short_text «in_set: один вариант», «скалярный ключ», «пустой вариант», «нестроковый вариант» |
| `validateByTemplate` short_text in_set: повтор | short_text «in_set: повтор после нормализации регистра и пробелов» |
| `validateByTemplate` short_text equal: не строка / пустая | short_text «equal: пустая строка», «строка из пробелов», «массив вместо строки», «число до приведения» |
| `validateByTemplate` sequence: не строка | sequence «число до приведения», «массив цифр» |
| `validateByTemplate` sequence: не цифры | sequence «буква в последовательности» |
| `QuestionSchema` radio/checkbox: меньше 2 | single «один вариант», multi «один вариант» |
| `QuestionSchema` radio/checkbox: повтор id | single/multi «повтор id вариантов» |
| `QuestionSchema` radio: ключ не из вариантов | single «ключ не из вариантов» |
| `QuestionSchema` checkbox: не массив / пустой | multi «пустой список верных», «ключ строка вместо списка» |
| `QuestionSchema` checkbox: повтор | multi «повтор в ключе» |
| `QuestionSchema` checkbox: id не из вариантов | multi «элемент ключа не из вариантов» |
| `QuestionSchema` matching: меньше 2 | matching «один элемент слева» |
| `QuestionSchema` matching: повтор id | matching «повтор id слева» |
| `QuestionSchema` matching: ключ не объект | matching «ключ массив», «ключ строка» |
| `QuestionSchema` matching: левый без правого | matching «ключ пустой объект», «левый элемент без пары», «правый элемент не из списка» |
| `QuestionSchema` short_answer: не строка / пустая | short_text «equal: пустая строка», «строка из пробелов», «массив вместо строки» |
| `QuestionSchema` short_answer_variants: не массив / меньше двух / пустой | short_text «in_set: один вариант», «скалярный ключ», «пустой вариант» |
| `QuestionSchema` short_answer_variants: повтор | short_text «in_set: повтор (сервер: … с дублями вариантов отклоняется)» |
| `QuestionSchema` sequence: не строка | sequence «массив цифр» |
| `QuestionSchema` sequence: не цифры | sequence «буква в последовательности» |

Перенесённые проходящие строки серверных тестов: `schemas/tests.test.ts` — radio допустим (single «два варианта и ключ из списка»), short_answer (short_text «equal: непустой ответ проходит»), short_answer_variants (D5), sequence `'2314'`, checkbox с числовыми id после приведения через `OptionSchema`/`QuestionKeyPayloadSchema` (multi, ключ `['1','3']`), кастомный тип (multi, ключ `['1','2']`); отклоняющие — скалярный ключ вариантов, дубли `['Эксперимент',' эксперимент ']`, `'23a4'`. `question-type-resolver.test.ts` — непустые варианты проходят (D5), `['эксперимент', '']` отклоняется (`Заполните все допустимые ответы`). Серверные тесты не менялись.

Добавлено сверх сервера (D-13, объединение): пустые тексты вариантов и элементов сопоставления, формулировка из пробелов, отклонение сырого числа как ключа до приведения.

## Покрытие

- Таблицы: single_choice 25, multi_choice 18, matching 19, short_text 20, sequence_digits 11, порядок 18; `authoring.test.ts` + `plural.test.ts` — 147 тестов.
- Границы (edge EXAM-02 boundary): `minOptions: 3` — 2 отклоняются, 3 и 4 проходят; `maxOptions: 4` — 3 и 4 проходят, 5 отклоняются; `exactChoiceCount: 2` — 1 и 3 отклоняются, 2 проходят; `minOptions` 0 и 1 → минимум 2; формы 1/5 для всех трёх текстов.
- Порядок: строки с двумя нарушениями для каждой соседней пары шагов (тип/формулировка, формулировка/число, число/ключ, число/пустой текст, минимум/exactChoiceCount, пустой текст/id, пустой текст/максимум, id/максимум, id/ключ, максимум/ключ, максимум/exactChoiceCount, ключ/exactChoiceCount, пары/ключ, пустой элемент/id, id/ключ сопоставления).
- `pluralRu`: 0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111, 112.
- `keyShapeFor`: шесть строк D-10. `toCanonicalKey`: `' 23 14 '` → `'2314'`, `3142` → `'3142'` (sequence и short_text), `['a','b']` и `'b'` без изменений, `null`/`NaN` без изменений.

Пробы (временные правки, откатаны копированием сохранённых файлов, после отката 490/490 зелёные):
- A: id проверяются раньше пустых текстов и минимум без `max(2, …)` → 2 failed: `minOptions 1: минимум остаётся 2`, `пустой текст и повтор id: первым пустой текст`.
- B: `exactChoiceCount` проверяется только снизу → 2 failed: `exactChoiceCount 2: 3 верных (N+1) отклоняются`, `exactChoiceCount 1: форма «правильный ответ»`.

## TDD Gate Compliance

Коммиты RED/GREEN не выполнялись (правило пользователя), последовательность соблюдена по сути:
- Task 1 RED: таблица `SHORT_TEXT_AUTHORING_CASES` и тест при заглушках `validateQuestionForSave`/`keyShapeFor` → 21 failed | 343 passed, причина `validateQuestionForSave не реализован` / `keyShapeFor не реализован`. GREEN: 364 passed.
- Task 2 RED: все таблицы, `plural.test.ts`, тесты текстов и покрытия при заглушках `pluralRu`, текстов с числом, `toCanonicalKey` и без `validateAuthoring` у четырёх адаптеров → 119 failed | 371 passed. GREEN: 490 passed.
- REFACTOR: не потребовался.

## Проверки

- `yarn workspace @bio-exam/exam-core test` → 11 files, 490 passed.
- `yarn workspace @bio-exam/exam-core typecheck` → exit 0; `lint` → exit 0; `yarn oxfmt --check packages/exam-core scripts/check-exam-core-dist.mjs` → чисто.
- `yarn workspace @bio-exam/exam-core build && node scripts/check-exam-core-dist.mjs` → `exam-core dist OK: index.js, index.cjs, index.d.ts, index.d.cts; 57 экспортов в ESM и CJS`.
- `yarn verify` → `yarn verify: OK` (exam-core 490 passed; `app/server/src/lib/tests/scoring-parity.test.ts` зелёный).
- `git status --porcelain -- app | shasum` и `git diff -- app | shasum` совпадают со снимком до плана (`858230de…`, `591036fc…`): план не тронул `app/`, включая `question-validation.test.ts`, `schemas/tests.test.ts`, `question-type-resolver.test.ts`. `QuestionTypeDefinitionSchema` не менялся.
- `boundaries.test.ts` зелёный: новые модули импортируют только относительные пути.

## Deviations from Plan

**1. [Rule 3 / решение исполнителя (автономно)] Новый файл `src/authoring-messages.ts`.** Адаптеры импортируют тексты, `authoring.ts` импортирует адаптеры: тексты в `authoring.ts` дали бы цикл импортов (тот же приём, что `adapters/verdicts.ts` в 03-06). `authoring.ts` реэкспортирует `AUTHORING_MESSAGES` и три функции текстов, публичный API как в плане.

**2. [Rule 2 / решение исполнителя (автономно)] Новый файл `adapters/authoring-rules.ts`.** Одна реализация шагов «минимум → пустые тексты → id → максимум» для `single_choice` и `multi_choice` и хелперы сторон сопоставления, чтобы порядок проверок не разошёлся между адаптерами.

**3. [Дополнение] Типы `AuthoringInput` и `ValidateQuestionForSaveInput`** экспортированы из пакета (для 03-09 и 03-10).

**4. [Дополнение] Таблица связи с сервером в коде.** `SERVER_AUTHORING_RULES` и поле `serverRules` у строк вместо прозы: соответствие проверяется тестом.

## Наблюдения исполнителя

- Сервер сегодня принимает числовые id и ключи: `QuestionSchema` приводит их к строкам до `validateByTemplate`. Пакет к сырому числу строг, поэтому в 03-09 и 03-10 ключ нужно привести (`toCanonicalKey`, `QuestionKeyPayloadSchema`/`OptionSchema`) до `validateQuestionForSave`.
- `toCanonicalKey` не приводит числовые элементы массивов `multi_choice` и `short_text` (по behavior плана); на сервере это делает `QuestionKeyPayloadSchema`.
- Порядок шагов отличается от сервера: сервер проверял id раньше максимума и не проверял пустые тексты; в пакете порядок плана, закреплён `ORDER_AUTHORING_CASES`.

## Known Stubs

Нет.

## Threat Flags

Нет: новых сетевых точек, путей доступа и схем нет. T-3-13 закрыт тестом покрытия серверных правил; T-3-14: тексты не содержат данных вопроса и ключа, только число из конфигурации типа.

## Deferred human verification

Нет человеческих шагов в плане. Коммит изменений — за пользователем (правило пользователя), исполнитель не коммитил.

## Файлы к коммиту

- packages/exam-core/src/authoring.ts (новый)
- packages/exam-core/src/authoring-messages.ts (новый)
- packages/exam-core/src/authoring.test.ts (новый)
- packages/exam-core/src/adapters/authoring-rules.ts (новый)
- packages/exam-core/src/cases/authoring.cases.ts (новый)
- packages/exam-core/src/plural.ts (новый)
- packages/exam-core/src/plural.test.ts (новый)
- packages/exam-core/src/adapters/types.ts
- packages/exam-core/src/adapters/single-choice.ts
- packages/exam-core/src/adapters/multi-choice.ts
- packages/exam-core/src/adapters/matching.ts
- packages/exam-core/src/adapters/short-text.ts
- packages/exam-core/src/adapters/sequence-digits.ts
- packages/exam-core/src/index.ts
- scripts/check-exam-core-dist.mjs

(`packages/exam-core/` и `scripts/check-exam-core-dist.mjs` целиком ещё не отслеживаются git, они появились в планах 03-01…03-13.)

## Self-Check: PASSED

Все перечисленные файлы на месте; `authoring.ts` содержит `export function validateQuestionForSave` и вызов `validateAuthoring`, `plural.ts` — `export function pluralRu`. Коммитов нет по правилу пользователя (HEAD 7a6f95a не менялся).
