---
phase: 05-attempt-integrity
plan: 02
subsystem: web
tags: [vitest, snapshot, characterization, attempt-review, react]
status: complete
deferred_human_gate: false

requires:
  - phase: precondition
    provides: "services/access-policy/scope.ts (canReadTest, canReviewAttempt, testScope) и порт хранилища 07-01: проверка предусловия дала scope ok"
provides:
  - "getTextReview, getChoiceReview, getMatchingReview, ReviewInput, TextReviewModel, ChoiceReviewModel, MatchingReviewModel в attempt-review-utils.ts"
  - "review-viewers.test.ts: таблица 3 зрителя × 5 шаблонов × 3 исхода = 45 строк со снимком Vitest"
  - "__snapshots__/review-viewers.test.ts.snap, sha256 bd12834807fa60c5ff8b7659eb952344e4ffa9b5dead16672645dd5ba284e480"
affects: [05-10]

actuals:
  tokens: 12900
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Разбор попытки: чистая функция модели (attempt-review-utils.ts) + компонент, который только рисует модель; тон модели отображается в классы через Record<tone, string>"
    - "Снимок Vitest на таблице входов зрителя; isCorrect и earnedPoints строки считает scoreQuestionByType по BUILTIN_QUESTION_TYPES, тест проверяет исход строки"

key-files:
  created:
    - app/web/components/tests/attempt-review/review-viewers.test.ts
    - app/web/components/tests/attempt-review/__snapshots__/review-viewers.test.ts.snap
  modified:
    - app/web/components/tests/attempt-review/attempt-review-utils.ts
    - app/web/components/tests/attempt-review/QuestionAnswerReview.tsx
    - app/web/components/tests/attempt-review/attempt-review-utils.test.ts

key-decisions:
  - "Модель хранит тон строки ('correct' | 'missed' | 'wrong' | 'neutral' у выбора, 'correct' | 'wrong' | 'neutral' у сопоставления), классы задаются в компоненте таблицей тон → строка классов; строки классов прежние (решение исполнителя, автономно)"
  - "swapHint в модели уже означает «показать подсказку»: summaryText != null && hasSwap, как условие прежнего рендера"
  - "Props компонента = ReviewInput, сигнатура QuestionAnswerReview не изменилась"
  - "choiceLabel и answerMap перенесены в attempt-review-utils.ts как приватные функции; getChoiceOptionReviewRows не менялась, getChoiceReview строится поверх неё"
  - "Проверка исходника: в компоненте вызывается getTextReview( и выводится {review.summaryText}; вызов getSequenceReview( ищется в теле getTextReview (срез от export function getTextReview( до первой строки '}')"
  - "requirements-completed пуст: план закрепляет вывод разбора до переключения на вид; SCORE-02 и SCORE-04 закрывает 05-10"

requirements-completed: []

duration: 7min
completed: 2026-10-04
---

# Phase 5 Plan 02: Снимок разбора попытки до переключения на вид Summary

Логика трёх видов разбора вынесена из `QuestionAnswerReview.tsx` в чистые `getTextReview`, `getChoiceReview`, `getMatchingReview`; их вывод закреплён снимком Vitest на 45 строках (admin, student_with_key, student_without_key × пять шаблонов × три исхода). Видимый разбор не изменился: тексты, классы и порядок элементов те же, e2e потоков 2 и 3 зелёный на двух проектах.

## Коммит

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве worktree `wt-phase-05` (ветка `gsd/phase-05`).

Требования SCORE-02 и SCORE-04 из frontmatter плана не отмечать выполненными до 05-10: этот план только закрепляет вывод разбора, их также несут 05-07, 05-08, 05-09, 05-10, 05-11.

Файлы к коммиту (ровно пять файлов плана):

- `app/web/components/tests/attempt-review/attempt-review-utils.ts`
- `app/web/components/tests/attempt-review/QuestionAnswerReview.tsx`
- `app/web/components/tests/attempt-review/attempt-review-utils.test.ts`
- `app/web/components/tests/attempt-review/review-viewers.test.ts`
- `app/web/components/tests/attempt-review/__snapshots__/review-viewers.test.ts.snap`

## Задачи

| Задача | Тип | Итог |
| --- | --- | --- |
| 1. getTextReview, строки short_text и sequence_digits | tracer | 18 записей снимка, гейт трассера: `CI=true` прогон папки зелёный (33 теста), расширение продолжено |
| 2. getChoiceReview, getMatchingReview, строки single_choice, multi_choice, matching | auto | 45 записей, `computeVerdicts(` в компоненте нет, `CI=true` прогон папки зелёный (60 тестов) |
| 3. Гейты | auto | typecheck, `yarn verify: OK`, e2e `@flow2|@flow3` 10 passed, отпечаток `05-02 changed only its files` |

Порядок «сначала снимок, потом проверка без записи» соблюдён: `--update` выполнялся только при первом прогоне новых строк (18 в задаче 1, 27 в задаче 2), все последующие прогоны с `CI=true` без записи.

## Снимок

- Записей `exports[`: 45 (`review snapshots: 45`).
- sha256 `app/web/components/tests/attempt-review/__snapshots__/review-viewers.test.ts.snap`: `bd12834807fa60c5ff8b7659eb952344e4ffa9b5dead16672645dd5ba284e480`. 05-10 обязан оставить файл без изменений.
- Старые 18 записей не изменились при добавлении 27: `diff` копии снимка после задачи 1 с итоговым файлом содержит 0 удалённых строк и 819 добавленных.
- `CI=true yarn workspace @bio-exam/web vitest run components/tests/attempt-review`: `Tests 60 passed (60)`, строк `written` и `obsolete` нет.
- Строки student_without_key закрепляют T-5-04: у выбора нет подсветки и подписей кроме «Выбран», сводка только «Выбрано: N»; у сопоставления нет «Верных пар» и вердиктов, все строки нейтральные; у текста и последовательности `summaryText` только у верной последовательности («Ошибок: 0»), `cells` null, `correctLines` null.
- Ни одна строка таблицы не даёт `swapHint: true` (ответы таблицы заданы планом: частичная последовательность '2315', неверная '4132'); подсказку о перестановке покрывают тесты `getSequenceReview` в `attempt-review-utils.test.ts`.

## CodeGraph (D-23)

Индекс CodeGraph построен по основному дереву и отражает код до 05-01.

`codegraph impact getSequenceReview` — 5 затронутых символов:

- `attempt-review-utils.ts`: `getSequenceReview:79`
- `attempt-review-utils.test.ts` (файл)
- `QuestionAnswerReview.tsx`: `TextAnswerReview:195`, `QuestionAnswerReview:244`, файл

`codegraph impact QuestionAnswerReview` — 9 затронутых символов:

- `QuestionAnswerReview.tsx`: `QuestionAnswerReview:244`
- `attempt-review/AttemptQuestionsList.tsx`: `AttemptQuestionsList:16`, файл
- `components/tests/AttemptReview.tsx`: `AttemptReview:18`, файл
- `components/tests/TestRunner.tsx`: `TestRunner:145`, файл
- `app/(internal)/(protected)/tests/[topicSlug]/[testSlug]/start/TestPageClient.tsx`: `TestPageClient:14`, файл

Сигнатура `QuestionAnswerReview(props)` не изменилась (`Props = ReviewInput` с теми же полями), вызывающим правки не нужны.

`codegraph affected attempt-review-utils.ts QuestionAnswerReview.tsx attempt-review-utils.test.ts` — 3 файла: `QuestionAnswerReview.tsx`, `attempt-review-utils.test.ts`, `attempt-review-utils.ts`. Новый `review-viewers.test.ts` в индексе ещё отсутствует; все тесты папки `attempt-review` прогнаны.

## Гейты

- `yarn workspace @bio-exam/web typecheck`: exit 0.
- `yarn workspace @bio-exam/web lint`: exit 0, предупреждений по `attempt-review` нет.
- `yarn verify`: `yarn verify: OK`; web `502 passed | 1 expected fail (503)`, server `532 passed | 7 expected fail (539)`, exam-core `498 passed`.
- `yarn e2e --grep "@flow2|@flow3"`: `10 passed (11.3s)` на `chromium-desktop` и `chromium-mobile`.
- Отпечаток `.planning/commit-snapshots/before-05-02/fingerprint.json` (0 путей до правок): `05-02 changed only its files`.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

Нет.

## Threat Flags

Нет: план меняет только клиентский рендер и тесты, новой поверхности нет.

## Deferred human verification

Нет шагов для человека, кроме коммита пяти файлов плана.

## Self-Check: PASSED

- FOUND: app/web/components/tests/attempt-review/review-viewers.test.ts
- FOUND: app/web/components/tests/attempt-review/__snapshots__/review-viewers.test.ts.snap
- FOUND: изменения в attempt-review-utils.ts, QuestionAnswerReview.tsx, attempt-review-utils.test.ts (`git status`)
- Коммиты не проверялись: коммит не выполнялся по правилу пользователя.
