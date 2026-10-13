---
phase: 03-exam-core
plan: 13
subsystem: exam-core-scoring
tags: [exam-core, scoring, tables, parity, EXAM-02, EXAM-03, EXAM-06, D-03, D-04, D-11, D-12, D-15]
requires: [03-05]
provides:
  - "cases/scoring.cases.ts: SINGLE_CHOICE_SCORING_CASES, MULTI_CHOICE_SCORING_CASES, MATCHING_SCORING_CASES, SHORT_TEXT_SCORING_CASES, SEQUENCE_SCORING_CASES (89 строк) и фикстура SCORING_TYPES_MAP"
  - "cases/answer.cases.ts: ANSWER_SHAPE_CASES (20 строк, 4 на шаблон)"
  - "Тесты пакета scoring.test.ts (таблицы), registry.test.ts, answer.test.ts"
  - "Паритет со старой серверной оценкой на всех пяти шаблонах: 18394 входа x 7 конфигов x 3 fallbackMaxPoints = 386274 комбинации"
affects: [03-06, 03-08]
tech-stack:
  added: []
  patterns:
    - "Строка таблицы оценки: { name, typeKey, key, answer, expected: ScoreQuestionResult }; harness всегда fallbackMaxPoints 0, тип берётся из SCORING_TYPES_MAP"
    - "Паритет: вход несёт template и metric, typeConfigsFor(template, metric) даёт 7 конфигов"
key-files:
  created:
    - packages/exam-core/src/cases/scoring.cases.ts
    - packages/exam-core/src/cases/answer.cases.ts
    - packages/exam-core/src/registry.test.ts
    - packages/exam-core/src/answer.test.ts
  modified:
    - packages/exam-core/src/scoring.test.ts
    - app/server/src/lib/tests/scoring-parity.test.ts
decisions:
  - "SCORING_TYPES_MAP сверх трёх названных в плане категорий содержит tiers_unsorted_fractional, one_mistake_clamped, one_mistake_fractional: серверный custom_sequence (correctPoints 3, tiers 1→2, 2→1) и граничные строки tiers (correctPoints 2, tiers 3→0.5, 1→1.5) — разные правила, сливать их нельзя"
  - "Строка «тип отсутствует в карте» не входит в *_SCORING_CASES: у неё нет шаблона, а 03-06 обходит эти массивы через countMistakes; она осталась отдельным test.each в scoring.test.ts с fallbackMaxPoints 3, 0, -2, NaN"
  - "builtin в typeConfigsFor — встроенный тип шаблона с метрикой входа; входы short_text генерируются под обе метрики, так покрыты оба встроенных типа short_answer и short_answer_variants"
metrics:
  duration: "~15 мин"
  completed: 2026-10-04
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 11750
  tasks: 2
  commits: 0
status: complete
deferred_human_gate: false
---

# Phase 3 Plan 13: таблицы оценки и формы ответа в exam-core, паритет на всех шаблонах Summary

Оценка пяти шаблонов закреплена 89 строками таблиц пакета (все 29 серверных сценариев, D2, D-11, D-12, границы tiers и перестановки), форма ответа и нормализация адаптеров — 20 строками `ANSWER_SHAPE_CASES`; паритет пакета с серверной `scoreQuestionByType` расширен на все шаблоны и зелёный на 386274 комбинациях.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. `commits: 0` при изменениях в коде отражает это правило.

## Выполнено

**Task 1: таблицы и тесты пакета.**

- `cases/scoring.cases.ts`: тип `ScoringCase`, `SCORING_TYPES_MAP` (шесть встроенных типов из `BUILTIN_QUESTION_TYPES`, `custom_sequence`, `tiers_unsorted_fractional`, `one_mistake_clamped`, `one_mistake_fractional`, `broken_rule` с правилом `{}`; все дополнительные — `sequence_digits`), пять массивов: single_choice 7 строк, multi_choice 13, matching 11, short_text 17, sequence 41. Строки D2 из 03-05 перенесены в `SEQUENCE_SCORING_CASES`.
- `scoring.test.ts`: `describe` на шаблон с `test.each(...)('$name')` и проверкой, что `typeKey` каждой строки относится к шаблону таблицы; общая проверка по 89 строкам (`mistakesCount` целое ≥ 0 или `MISTAKES_UNSCORABLE`, `earnedPoints` в `[0, maxPoints]`, `isCorrect === (mistakesCount === 0)`, строк не меньше 80); «тип отсутствует» с fallbackMaxPoints 3, 0, -2, NaN; `broken_rule` с fallbackMaxPoints 0, 3, NaN (correctPoints 2, 3, 2); диспетчеризация `countMistakes` по шести метрикам из 03-05.
- `registry.test.ts`: корректное определение принимается; отклоняются minOptions > maxOptions, exactChoiceCount < minOptions, exactChoiceCount > maxOptions, single_choice с exactChoiceCount 2, метрика `hamming_digits` на `multi_choice` (каждая строка проверяет единственный `path` ошибки, база определения валидна); single_choice с exactChoiceCount 1 принимается; `templateForMetric` для шести метрик и покрытие `MISTAKE_METRICS`; `Object.keys(ALLOWED_MISTAKE_METRICS_BY_TEMPLATE)` равно `QUESTION_UI_TEMPLATES`.
- `cases/answer.cases.ts` и `answer.test.ts`: `ANSWER_SHAPE_CASES` по behavior плана (4 строки на шаблон); `answerSchema.safeParse(value).success === accepted` и `normalizeAnswer(value)` через `TEMPLATE_ADAPTERS`; все принятые адаптером значения принимает `AnswerValueSchema` (D-04); у каждого шаблона из `QUESTION_UI_TEMPLATES` не меньше трёх строк, есть принимаемая и отклоняемая форма.
- Для 03-06: у `broken_rule` правило `{}`, поэтому метрику строки берите через `normalizeScoringRule({ rule, template, fallbackMaxPoints: 0 }).mistakeMetric`, как это делает `scoreQuestionByType`, а не из `scoringRule.mistakeMetric`.
- `cases/*` в `index.ts` не экспортированы: runtime-экспорты пакета не менялись (42, dist-проверка зелёная).

**Task 2: паритет.** `TYPE_CONFIGS` заменён на `typeConfigsFor(template, metric)`: `builtin`, `tiers_unsorted_fractional`, `one_mistake_clamped`, `one_mistake_fractional`, `rule_empty` на шаблоне и метрике входа, `foreign_hamming` и `foreign_set_distance` на `single_choice`. Генераторы:

| Шаблон | Входы | Состав |
|--------|-------|--------|
| sequence_digits | 17448 | генератор 03-05 без изменений |
| single_choice | 28 | ключи `'a'`, `'b'`, `1`, `null` × ответы `'a'`, `'b'`, `'c'`, `1`, `'1'`, `null`, `['a']` |
| multi_choice | 323 | 15 непустых подмножеств a…d × 16 подмножеств, плюс `null`, `'a'`, `[1, 2]`, обратный порядок, повтор; числовые ключи; ключи `null`, `'a'`, `[]`, `{}`, `[null]` |
| matching | 211 | 6 биекций × 27 отображений, плюс неполное, `{}`, `null`, числовые значения, лишняя пара, значение `null`, массив; числовой ключ; ключи `{}`, `null`, массив, `{ l1: null }` |
| short_text | 384 | 12 ключей (`'Митоз'`, `3142`, `'3142'`, `'1.50'`, `'1.5'`, `1.5`, два набора, `[3142]`, `[]`, `''`, `null`) × 16 ответов × обе метрики |

Утверждения в тесте: пройдены все пять шаблонов, пары шаблон:метрика ровно шесть, у каждой 7 конфигов и два чужих на `single_choice`, входов > 15400, комбинаций > 320000. Таймаут 120 с.

## Числа паритета

Вывод теста: `паритет: входов 18394 (sequence_digits 17448, single_choice 28, multi_choice 323, matching 211, short_text 384), конфигов на вход 7, fallbackMaxPoints 3, комбинаций 386274`. Прогон около 0,9 с.

## Соответствие 29 серверных сценариев строкам таблиц

Названия строк совпадают с названиями серверных тестов `app/server/src/lib/tests/scoring.test.ts`.

| # | Серверный тест | Таблица |
|---|----------------|---------|
| 1 | short_answer: совпадение без учёта регистра и пробелов | SHORT_TEXT_SCORING_CASES |
| 2 | short_answer: неверный ответ даёт 0 баллов | SHORT_TEXT_SCORING_CASES |
| 3 | short_answer_variants: любой из допустимых вариантов засчитывается | SHORT_TEXT_SCORING_CASES |
| 4 | short_answer_variants: ответ вне набора даёт 0 баллов | SHORT_TEXT_SCORING_CASES |
| 5 | sequence: точный ответ | SEQUENCE_SCORING_CASES |
| 6 | sequence: одна ошибка | SEQUENCE_SCORING_CASES |
| 7 | sequence: несколько ошибок | SEQUENCE_SCORING_CASES |
| 8 | sequence: перестановка соседних цифр | SEQUENCE_SCORING_CASES |
| 9 | sequence: перестановка несоседних цифр | SEQUENCE_SCORING_CASES |
| 10 | sequence из двух цифр: верна первая | SEQUENCE_SCORING_CASES |
| 11 | sequence из двух цифр: верна вторая | SEQUENCE_SCORING_CASES |
| 12 | sequence из двух цифр: цифры переставлены | SEQUENCE_SCORING_CASES |
| 13 | sequence из трёх цифр: точный ответ | SEQUENCE_SCORING_CASES |
| 14 | sequence из трёх цифр: неверна первая | SEQUENCE_SCORING_CASES |
| 15 | sequence из трёх цифр: неверна последняя | SEQUENCE_SCORING_CASES |
| 16 | sequence из трёх цифр: цифры переставлены | SEQUENCE_SCORING_CASES |
| 17 | matching: точное соответствие | MATCHING_SCORING_CASES |
| 18 | matching: одна ошибка | MATCHING_SCORING_CASES |
| 19 | matching: несколько ошибок | MATCHING_SCORING_CASES |
| 20 | checkbox: точный набор | MULTI_CHOICE_SCORING_CASES |
| 21 | checkbox: одна ошибка | MULTI_CHOICE_SCORING_CASES |
| 22 | checkbox: несколько ошибок | MULTI_CHOICE_SCORING_CASES |
| 23 | custom_sequence (tiers): точный ответ | SEQUENCE_SCORING_CASES |
| 24 | custom_sequence (tiers): одна ошибка | SEQUENCE_SCORING_CASES |
| 25 | VALID-01: sequence с числовым correctAnswer (JSONB) засчитывается | SEQUENCE_SCORING_CASES |
| 26 | VALID-01: sequence с числовым correctAnswer, неверный ответ | SEQUENCE_SCORING_CASES |
| 27 | checkbox с числовыми ID в correctAnswer | MULTI_CHOICE_SCORING_CASES |
| 28 | radio: верный вариант | SINGLE_CHOICE_SCORING_CASES |
| 29 | radio: неверный вариант | SINGLE_CHOICE_SCORING_CASES |

Серверные тесты проверяли только `earnedPoints` (и местами `isCorrect`); строки таблиц фиксируют полный результат `{ maxPoints, earnedPoints, isCorrect, mistakesCount }`, серверные значения баллов сохранены во всех 29 строках.

## Расхождения

Нет. Ни одно ожидание не подгонялось: все 89 строк, 20 строк формы ответа и паритет прошли на коде пакета из 03-05 без изменений пакета.

Поведение, которое стоит знать (перенесено с сервера дословно, план его не меняет): `single_choice` для неотвеченного или неразбираемого ответа и ключа возвращает 1 ошибку, а не `MISTAKES_UNSCORABLE`; таблица фиксирует `mistakesCount: 1`, 0 баллов, `isCorrect: false`.

## TDD Gate Compliance

Таблицы характеризуют уже перенесённое в 03-05 поведение, поэтому первый прогон зелёный (210 passed); классический RED невозможен без порчи кода. Красность таблиц доказана пробами чувствительности: файл копировался в scratchpad, менялся `sed`, после прогона возвращался `cp` с подтверждением `cmp`; после всех проб пакет пересобран, тесты пакета и паритет снова зелёные. RED/GREEN-коммиты не выполнялись (правило пользователя).

| Проба | Изменение | Результат |
|-------|-----------|-----------|
| 1 | `sequence-digits.ts`: `correctSequence.length > 3` → `>= 3` | красные 2 строки: «sequence из трёх цифр: цифры переставлены», «перестановка в ключе из трёх цифр 123/132» |
| 2 | `normalize.ts`: убран `.toLowerCase()` в `normalizeCompactString` | красные 6: строка формы ответа short_text, 4 строки SHORT_TEXT, диспетчеризация `compact_text_equal` |
| 3 | `multi-choice.ts`: `Math.max(missing, extra)` → сумма | красные 3: «checkbox: одна ошибка», «checkbox: несколько ошибок», диспетчеризация `set_distance` |
| 4 | `matching.ts`: удалена проверка пустого ключа (с пересборкой dist) | паритет красный: `matching:pair_mismatch_count, builtin, fallbackMaxPoints 0, ответ {"l1":"r1"}, ключ {}` |

## Проверки

- `yarn workspace @bio-exam/exam-core test`: 7 файлов, 210 passed.
- `yarn workspace @bio-exam/exam-core typecheck`: код 0; `lint`: код 0.
- `yarn workspace @bio-exam/exam-core build && yarn workspace @bio-exam/server vitest run src/lib/tests/scoring-parity.test.ts src/lib/tests/scoring.test.ts`: 2 файла, 30 passed.
- `node scripts/check-exam-core-dist.mjs`: `exam-core dist OK: index.js, index.cjs, index.d.ts, index.d.cts; 42 экспортов в ESM и CJS`.
- `yarn verify`: `yarn verify: OK` (exam-core 210 passed; server 248 passed и 6 expected fail; web 170 passed и 2 expected fail).
- `git diff --quiet HEAD -- app/server/src/lib/tests/scoring.ts app/server/src/lib/tests/scoring.test.ts app/server/src/lib/tests/question-types.ts`: код 0.
- `git status --porcelain --untracked-files=all -- app/server/src/lib/tests`: три удаления 03-12 и `?? scoring-parity.test.ts`, больше ничего.
- Комментариев в новых и изменённых файлах нет.
- `yarn oxfmt` прогнан только по файлам плана.

## Deviations from Plan

**1. [Решение исполнителя (автономно)] Дополнительные типы в `SCORING_TYPES_MAP`** — `tiers_unsorted_fractional`, `one_mistake_clamped`, `one_mistake_fractional`: границы tiers и ограничение oneMistakePoints требуют своих правил, отличных от серверного `custom_sequence`. Добавление аддитивно.

**2. [Решение исполнителя (автономно)] «Тип отсутствует в карте» вне `*_SCORING_CASES`** — у такой строки нет шаблона, а 03-06 обходит массивы через `countMistakes` по метрике типа. Проверка оставлена отдельным `test.each` в `scoring.test.ts`.

**3. [Дополнение] Сверх behavior** в таблицах есть строки: порядок и повтор в multi_choice, лишняя пара и `null` в значении matching, нестроковые элементы и пустой набор вариантов short_text, пробелы, числовой ответ и дробный числовой ключ sequence, `broken_rule` с разными fallbackMaxPoints; в registry — положительные контроли.

## Known Stubs

Нет.

## Threat Flags

Нет: план меняет только тесты. T-3-27 закрыт паритетом на всех шаблонах и пробой 4.

## Deferred human verification

Нет.

## Файлы к коммиту

- `packages/exam-core/src/cases/scoring.cases.ts`
- `packages/exam-core/src/cases/answer.cases.ts`
- `packages/exam-core/src/scoring.test.ts`
- `packages/exam-core/src/registry.test.ts`
- `packages/exam-core/src/answer.test.ts`
- `app/server/src/lib/tests/scoring-parity.test.ts`

## Self-Check: PASSED
