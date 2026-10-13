---
phase: 03-exam-core
plan: 11
subsystem: web-attempt-review
tags: [exam-core, attempt-review, sequence_digits, D2, EXAM-04, EXAM-06, D-06, D-07, D-08, D-17, D-18]
requires: [03-06, 03-09, 03-10]
provides:
  - "getSequenceReview({ studentAnswer, correctAnswer, isCorrect }) в attempt-review-utils.ts: visible, mistakes, summaryText ('Ошибок: N' или null), parts, showCells, hasSwap через computeVerdicts пакета"
  - "sequencePositionLabel(part, keyVisible): sr-only текст ячейки; цифра ключа только при keyVisible"
  - "Разбор sequence_digits в QuestionAnswerReview.tsx: «Ошибок: N», подсказка о соседней перестановке, ряд role=list «Разбор по позициям» с ячейками size-10"
  - "getChoiceOptionReviewRows через computeVerdicts (single_choice/multi_choice), answerIds = new Set(answerIdList(value)), formatAnswerLines через answerIdList/normalizeIdValue/normalizeIdRecord"
  - "MatchingAnswerReview: верные пары из частей computeVerdicts('matching')"
  - "TestRunner: isAnswered пакета вместо локальной функции"
  - "lib/tests/types.ts: QuestionUiTemplate из @bio-exam/exam-core (import type + реэкспорт)"
  - "e2e: помощник mistakesInReview, обычный тест 'D2: review error count equals the server error count'"
affects: []
tech-stack:
  added: []
  patterns:
    - "Разбор считает вердикты синхронно из уже загруженных данных; баллы и статус берутся из сохранённых results (D-06)"
    - "Текст «Ошибок: N» собирается только в getSequenceReview.summaryText; компонент его рендерит, тест читает исходник компонента и запрещает в нём литерал «Ошибок:» и прежнюю строку"
key-files:
  created: []
  modified:
    - app/web/components/tests/attempt-review/attempt-review-utils.ts
    - app/web/components/tests/attempt-review/attempt-review-utils.test.ts
    - app/web/components/tests/attempt-review/QuestionAnswerReview.tsx
    - app/web/components/tests/TestRunner.tsx
    - app/web/lib/tests/types.ts
    - e2e/tests/review.spec.ts
decisions:
  - "Строки характеризации getChoiceOptionReviewRows выбирают шаблон под форму данных: (['1'], null) и (['2'], ['1']) — multi_choice, (['1'], '1') — single_choice; адаптер пакета читает ответ и ключ строго по шаблону, сохранённые ответы и ключи сервера всегда в форме шаблона"
  - "sr-only текст ячейки вынесен в sequencePositionLabel (attempt-review-utils.ts), чтобы запрет показа цифры ключа при скрытом ключе (T-3-22) был под unit-тестом"
  - "resolveTemplate в TestRunner оставлена: она используется в рендере вопроса (строка ~714), план удаляет её только если она больше не нужна"
  - "MatchingAnswerReview: текст «правильная пара» по-прежнему берётся из answerMap(correctAnswer); из частей computeVerdicts берутся только число верных пар и признак верной пары"
metrics:
  duration: "~15 мин"
  completed: 2026-10-04
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 7200
  tasks: 2
  commits: 0
deferred_human_gate: true
status: complete
---

# Phase 3 Plan 11: разбор и прохождение на exam-core, D2 закрыт Summary

Разбор последовательности показывает «Ошибок: N» по `computeVerdicts` пакета (та же метрика, что у submit) и ряд ячеек вердиктов. `TestRunner`, разбор выбора и сопоставления и тип шаблона взяты из `@bio-exam/exam-core`. e2e D2 стал обычным тестом; частных копий из списка D-17 не осталось.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Выполнено

**Task 1 (tracer): разбор последовательности через пакет**
- До правок `yarn e2e --grep D2`: exit 0, `8 passed (4.8s)`, два ожидаемых `✘` у `D2 — fixed in Phase 3 (EXAM-06) … @known-defect` (chromium-desktop и chromium-mobile), setup зелёный на обоих проектах.
- `attempt-review-utils.ts`: `getSequenceReview` и `sequencePositionLabel`. `visible = correctAnswer != null || isCorrect`. Ключ: `correctAnswer`, иначе ответ студента при `isCorrect`, иначе `null`. `mistakes` = `computeVerdicts(...).mistakes`, `showCells = correctAnswer != null && mistakes > 0 && есть часть с given`.
- Тесты behavior зелёные: 1234/1243 → `Ошибок: 1`, `[correct, correct, swapped, swapped]`; верный ответ при скрытом ключе → `Ошибок: 0` без ячеек; скрытый ключ и неверный ответ → `visible false`, `summaryText null`; `''` и `null` → `Ошибок: 4` без ячеек; 20 цифр → 4 correct + 16 extra, `Ошибок: 16`; числовой ключ 1243 работает как строка.
- Проверка исходника компонента через `node:fs` (путь от `import.meta.url`): нет «Совпало позиций», нет литерала «Ошибок:», есть `getSequenceReview(` и `{sequenceReview.summaryText}`.
- Характеризация `getChoiceOptionReviewRows(…, ['1'], null)` → `['incorrect-selected', 'neutral', 'neutral']` прошла на старой реализации до правок Task 2. Первый прогон: 13 passed, красной была только проверка исходника компонента (ожидаемо, компонент ещё не менялся).
- `QuestionAnswerReview.tsx`, `TextAnswerReview`: строка совпавших позиций удалена. Выводятся `<p className="mt-2 text-xs">{sequenceReview.summaryText}</p>` и при `hasSwap` `Соседняя перестановка считается одной ошибкой.` (`mt-1 text-xs`). При `showCells` рисуется ряд `role="list" aria-label="Разбор по позициям" className="mt-3 flex flex-wrap gap-2"` с ячейками `role="listitem"`, классами и цветами UI-SPEC, пиктограммами `Check`/`X`/`ArrowLeftRight`/`Minus`, цифрой в `aria-hidden` и sr-only текстом. `keyVisible` для sr-only передаётся явно как `correctAnswer != null`. Заголовок и цвет карточки по сохранённым `isCorrect` и `earnedPoints` не менялись.
- `e2e/tests/review.spec.ts`: flow 3 ждёт `'Ошибок: 0'`; `positionsMatched` с комментарием заменён на `mistakesInReview` (`/Ошибок: (\d+)/`, понятная ошибка, если строки нет); describe `D2: two sequence error counts`; у setup убран `@known-defect`; длина ключа заменена проверкой подсказки о перестановке; проверка стала обычным `test('D2: review error count equals the server error count')`. Удалены комментарии про ожидаемое падение D2, шапка описывает только D1. `serverMistakesFromPoints` и блок D1 не тронуты.

**Task 2: прохождение, выбор и сопоставление, тип шаблона**
- `codegraph impact`: `isAnswered` (TestRunner.tsx:69) → `TestRunner`, `TestPageClient`; `answerIds` → `getChoiceOptionReviewRows`, `ChoiceAnswerReview`, `QuestionAnswerReview`, `AttemptQuestionsList.test.ts`, `attempt-review-utils.test.ts`; `getChoiceOptionReviewRows` → `ChoiceAnswerReview`, оба теста; `formatAnswerLines` → `TextAnswerReview`, `AttemptQuestionsList.test.ts`. `codegraph affected` по четырём файлам вернул только сами изменённые файлы (индекс отстаёт от правок); тесты выбраны по `impact`: `components/tests` целиком.
- `TestRunner.tsx`: локальная `isAnswered` удалена, оба вызова: `isAnswered({ template: question.questionUiTemplate, answer: answers[question.id], content: { options, matchingPairs } })` из пакета.
- `attempt-review-utils.ts`: `answerIds = new Set(answerIdList(value))`. `getChoiceOptionReviewRows` строит статусы из частей `computeVerdicts` (`selected_correct`/`missed` → `correct`, `selected_wrong` → `incorrect-selected`, `neutral` → `neutral`); ключ `null` уходит в пакет как `null`, части строятся по `content.options`; для шаблона вне выбора все строки `neutral`. `formatAnswerLines` разбирает значения через `normalizeIdValue`, `answerIdList`, `normalizeIdRecord`; проверок `typeof` в файле нет.
- `QuestionAnswerReview.tsx`, `MatchingAnswerReview`: `matched` и `pairCorrect` берутся из частей `computeVerdicts({ template: 'matching', key: correctAnswer ?? null, … content: { matchingPairs } })`; N остаётся `pairs.left.length`; тексты и классы прежние.
- `lib/tests/types.ts`: собственное объединение литералов удалено; `QuestionUiTemplate` в `import type { … } from '@bio-exam/exam-core'` и в реэкспорте.

## Проверки

| Проверка | Результат |
|---|---|
| `yarn workspace @bio-exam/exam-core build && yarn workspace @bio-exam/web vitest run components/tests/attempt-review` | 2 files, 14 passed |
| `yarn workspace @bio-exam/web vitest run components/tests` | 3 files, 18 passed |
| `yarn workspace @bio-exam/web typecheck` | exit 0 |
| `yarn e2e --grep "D2\|flow 3"` после Task 1 | exit 0, `12 passed (8.7s)`, `✘` нет; `D2: review error count equals the server error count` ✓ на chromium-desktop и chromium-mobile |
| Гейт `d2 flipped` | `d2 flipped` |
| Гейт `review switched` | `review switched` |
| Проверка списка D-17 | `D-17: no private copies (19 positions checked, 20 = legacy D-19)` |
| `import type` в `lib/tests/types.ts` содержит `QuestionUiTemplate` | exit 0 |
| `git diff --quiet HEAD -- …/AttemptQuestionsList.test.ts` | exit 0 (не изменён, зелёный) |
| Прод-сборка web (`vercel.json` buildCommand) | exit 0, `✓ Compiled successfully` |
| Прод-сборка server (`node vercel-build.cjs`) | exit 0, `=== Build completed successfully! ===` |
| `yarn verify` | `yarn verify: OK` |
| `yarn e2e` полный | exit 0, `108 passed (33.3s)`; ожидаемо падают только `D1 — fixed in Phase 5 (SCORE-03) … @known-defect` на chromium-desktop (#55) и chromium-mobile (#107) |

`git status --porcelain --untracked-files=all -- app/web/components/tests app/web/lib/tests e2e/tests`: файлы этого плана (`TestRunner.tsx`, `QuestionAnswerReview.tsx`, `attempt-review-utils.ts`, `attempt-review-utils.test.ts`, `lib/tests/types.ts`, `review.spec.ts`), файлы прежних планов фазы 3 (`telemetry.ts`, `telemetry.test.ts`, `authoring.spec.ts`) и остаток фазы 2 (` M MdxRenderer.tsx`, `?? e2e/tests/proxy-protection.spec.ts`). Других путей нет.

## Deviations from Plan

None - plan executed exactly as written.

## Замечания исполнения

- `root-pin.sh` отклонён правами; по правилу исполнения заменён проверкой `git rev-parse --show-toplevel` = `/Users/kdvornichenko/bio-exam`, все записи шли по абсолютным путям внутри корня.
- Подсказка о перестановке выводится с `mt-1` (как `mt-1 text-xs` у подписей пар): план задаёт только «тем же размером», в шкале UI-SPEC `mt-1` уже используется в том же файле.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности. T-3-22: ячейки требуют `correctAnswer != null`, sr-only цифра ключа только при `keyVisible = correctAnswer != null`; оба правила под unit-тестами (`getSequenceReview` при скрытом ключе, `sequencePositionLabel(…, false)`). T-3-23: D2 до правки подтверждён ожидаемым падением, после — зелёный обычный тест; D1 не тронут. T-3-24: заголовок, статус и баллы из сохранённых results.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. **R2 / CONTEXT `<specifics>` п. 1 (D-05, D-06): метрика последовательности и старые попытки.** Подтвердить правило «соседняя перестановка — одна ошибка только при длине больше 3, несоседняя — две». Попытки до деплоя `04c621c` (2026-07-25) оценены без исключения для перестановки: админский разбор такой попытки покажет «Ошибок: 1» при сохранённых 0 баллах. Оценка сверху, read-only на проде, дату деплоя подставляет пользователь:
   ```sql
   SELECT count(*)
   FROM test_attempts ta
   CROSS JOIN LATERAL jsonb_array_elements(ta.results) r
   JOIN questions q ON q.id = (r->>'questionId')::uuid
   JOIN question_types qt ON qt.key = q.type
   WHERE qt.ui_template = 'sequence_digits'
     AND ta.submitted_at < '<дата деплоя 04c621c>'
     AND (r->>'earnedPoints')::numeric = 0
     AND length(regexp_replace(r->>'userAnswer', '\s', '', 'g')) > 3;
   ```
   Решение для таких попыток: пояснения в интерфейсе фаза не добавляет, политика — Phase 5 (SCORE-05).
2. **CONTEXT `<specifics>` п. 2 (D-08): текст разбора.** Студенты и администраторы видят «Ошибок: N» с подсветкой позиций вместо прежней строки совпавших позиций; описание метрики `hamming_digits` в админке изменено (03-10). Подтвердить.
3. **CONTEXT `<specifics>` п. 6: preview-деплой Vercel** после фазы (web и server Ready, `/healthz`, прохождение теста и разбор последовательности) вместе с отложенным preview фазы 2.
4. **Визуальная проверка overflow (backstop, UI-SPEC).** На ширине 375px ответ из 20 и более цифр при видимом ключе (ячейки `extra`) переносится в несколько рядов без горизонтальной прокрутки и не перекрывает строку «Ошибок: N». Шаги: в тесте с последовательностью ответить 20+ цифрами, открыть разбор администратора `/admin/attempts/<id>` и разбор студента в DevTools 375px.

## Файлы к коммиту

- app/web/components/tests/attempt-review/attempt-review-utils.ts
- app/web/components/tests/attempt-review/attempt-review-utils.test.ts
- app/web/components/tests/attempt-review/QuestionAnswerReview.tsx
- app/web/components/tests/TestRunner.tsx
- app/web/lib/tests/types.ts (вместе с правками 03-04 в том же файле)
- e2e/tests/review.spec.ts
- .planning/phases/03-exam-core/03-11-SUMMARY.md

Логи: `scratchpad/e2e-d2-before.log`, `scratchpad/e2e-d2-after.log`, `scratchpad/verify-03-11.log`, `scratchpad/e2e-full-03-11.log`.

## Self-Check: PASSED

Все шесть файлов на месте; HEAD 7a6f95a не менялся (коммиты не выполнялись по правилу пользователя).
