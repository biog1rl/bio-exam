---
phase: 03-exam-core
plan: 02
subsystem: web-admin-tests
tags: [vitest, characterization, known-defect, question-editor, EXAM-07]
requires: []
provides:
  - "admin/tests/question-validation.ts: чистая validateQuestion(question: Question): string | null"
  - "question-validation.test.ts: константа KNOWN_DEFECTS и красное доказательство D5 внутри yarn verify"
affects: [03-10]
tech-stack:
  added: []
  patterns: ["KNOWN_DEFECTS + test.fails (как KNOWN_HOLES в фазе 2)"]
key-files:
  created:
    - app/web/app/(internal)/(protected)/admin/tests/question-validation.ts
    - app/web/app/(internal)/(protected)/admin/tests/question-validation.test.ts
  modified:
    - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
decisions:
  - "Из импорта страницы убраны isValidSequenceCorrectValue, normalizeShortTextCorrectValue и resolveQuestionTemplate: после выноса они на странице не используются"
metrics:
  commits: 0
  plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
  plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 9000
  tasks: 2
  commits: 0
status: complete
deferred_human_gate: false
---

# Phase 3 Plan 02: красный тест D5 и вынос validateQuestion Summary

Функция проверки страницы вопроса вынесена дословно в `admin/tests/question-validation.ts`; D5 (ключ-массив для `short_answer_variants` отклоняется проверкой сохранения) воспроизведён Vitest-тестом через `KNOWN_DEFECTS`/`test.fails`, внутри `yarn verify`.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. Поля `commits: 0` и `plan_head_*` во frontmatter отражают это: изменения в коде есть, но не закоммичены намеренно.

## Выполнено

**Task 1 (tracer).**
- Создан `question-validation.ts` (`export function validateQuestion`, импорты из `./types`, без `'use client'` и React).
- Из `QuestionEditorPageClient.tsx` удалено локальное определение (строки 114-167), добавлен `import { validateQuestion } from '../../../question-validation'`; неиспользуемые имена убраны из импорта `'../../../types'`.
- Сравнение тела: дифф удалённого блока страницы (строки 114-167 исходника) и нового модуля без `export` пуст (`diff` exit 0).
- Проверка отсутствия локального определения (`node -e` из плана) вернула 0.
- Тест: фикстура D5, `KNOWN_DEFECTS = new Set(['validateQuestion', 'getCreateQuestionsValidationError'])`, цикл по двум проверкам, сопутствующие обычные тесты (строковый `short_answer` даёт `null` в обеих функциях; пустая формулировка даёт `'Введите текст вопроса'` и `'Вопрос 1: введите текст вопроса'`).

**Проба test.fails -> test.** `validateQuestion` убран из `KNOWN_DEFECTS` временно: прогон покраснел на `assert.equal`, фактическое значение `'Укажите правильный краткий ответ'` (ожидалось `null`). Файл возвращён (`KNOWN_DEFECTS` содержит оба имени). Причина: `normalizeShortTextCorrectValue` возвращает `null` для массива. `getCreateQuestionsValidationError([d5])` по той же причине возвращает `'Вопрос 1: укажите правильный краткий ответ'`.

**Task 2.** Добавлена таблица «validateQuestion: текущий текст ошибки» на 22 строки (все пять шаблонов, ошибочные и корректные вопросы, включая нестандартные формы: `questionUiTemplate: undefined`, `options: null`, ключ-строка у `multi_choice`, ключ-массив у `matching`, ключ из пробелов у `short_text`, пустой ключ у `sequence_digits`).

## Расхождения текстов с UI-SPEC

Нет: все тексты таблицы совпадают с таблицей «Тексты» UI-SPEC. Отмечено отдельно (вне таблицы): `getCreateQuestionsValidationError` для `sequence_digits` возвращает `'Вопрос N: для последовательности используйте только цифры'` без слов «без пробелов», в отличие от `validateQuestion` и UI-SPEC; тестами этого плана не закреплено, 03-10 приводит к UI-SPEC.

## Проверки

- `yarn workspace @bio-exam/web vitest run question-validation.test.ts`: 24 passed, 2 expected fail (26).
- `yarn workspace @bio-exam/web typecheck`: exit 0.
- `yarn oxfmt` по трём файлам выполнен; `yarn verify`: `yarn verify: OK` (все 8 шагов passed, в том числе format-check).
- `git status --porcelain --untracked-files=all -- 'app/web/app/(internal)/(protected)/admin/tests'`: ровно три строки (изменённая страница и два новых файла).

## Deviations from Plan

None - plan executed exactly as written. Мелкое уточнение: в таблицу Task 2 добавлено больше строк, чем перечислено в плане (22 против 15+), как запас по краевым случаям.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности: перенос чистой функции без сетевых или файловых путей.

## Файлы к коммиту

- app/web/app/(internal)/(protected)/admin/tests/question-validation.ts
- app/web/app/(internal)/(protected)/admin/tests/question-validation.test.ts
- app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
- .planning/phases/03-exam-core/03-02-SUMMARY.md

## Self-Check: PASSED

Три файла кода существуют; `yarn verify: OK`; коммиты не создавались по правилу пользователя.
