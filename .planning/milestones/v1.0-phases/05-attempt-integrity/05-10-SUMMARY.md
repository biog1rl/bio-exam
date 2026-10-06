---
phase: 05-attempt-integrity
plan: 10
subsystem: web
tags: [nextjs, react, exam-core, zod, vitest, playwright, attempt-review]
status: complete
deferred_human_gate: true

requires:
  - phase: 05-02
    provides: "снимок review-viewers.test.ts.snap (45 записей), модели getTextReview, getChoiceReview, getMatchingReview"
  - phase: 05-08
    provides: "AdminAttemptViewSchema и AdminAttemptView, GET /api/tests/admin/attempts/:attemptId отдаёт вид администратора"
  - phase: 05-09
    provides: "TestRunner рисует результат из вида submit (AttemptView), runnerResultCard по status"
provides:
  - "attempt-review-utils: модели разбора на AttemptQuestionView, getQuestionView, emptyQuestionView, filterQuestionsByStatus, getAdminReviewNote, ADMIN_REVIEW_NOTES, getCorrectLines"
  - "Разбор администратора: пометка role=note с KeyRound для ключа неизвестного и для вердиктов недоступных, карточка «Правильный ответ» у выбора и сопоставления без вердиктов"
  - "AttemptReviewData = AdminAttemptView; SubmitResultSchema, SubmitResultItemSchema, SubmitResult, SubmitResultItem удалены из exam-core"
affects: [05-11, 07]

estimate:
  tokens: 95000
  tasks: 3
actuals:
  tokens: 9600
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Подсветка выбора и сопоставления только при keyVisible и непустых verdicts вида; web не считает вердикты"
    - "Строки ключа для выбора и сопоставления — отдельная getCorrectLines вне моделей, чтобы форма моделей и снимок 05-02 не менялись"

key-files:
  created: []
  modified:
    - app/web/components/tests/attempt-review/attempt-review-utils.ts
    - app/web/components/tests/attempt-review/QuestionAnswerReview.tsx
    - app/web/components/tests/attempt-review/AttemptQuestionsList.tsx
    - app/web/components/tests/attempt-review/AttemptReviewNav.tsx
    - app/web/components/tests/attempt-review/AttemptReviewSummary.tsx
    - app/web/components/tests/attempt-review/AttemptReviewHero.tsx
    - app/web/components/tests/attempt-review/review-viewers.test.ts
    - app/web/components/tests/attempt-review/attempt-review-utils.test.ts
    - app/web/components/tests/attempt-review/AttemptQuestionsList.test.ts
    - app/web/components/tests/AttemptReview.tsx
    - app/web/components/tests/TestRunner.tsx
    - app/web/lib/tests/types.ts
    - app/web/lib/tests/api.ts
    - packages/exam-core/src/attempt-result.ts
    - packages/exam-core/src/index.ts
    - packages/exam-core/src/attempt-result.test.ts
    - scripts/check-exam-core-dist.mjs

key-decisions:
  - "Фильтр навигации вынесен в чистую filterQuestionsByStatus(questions, results, filter) в attempt-review-utils.ts, чтобы строку behavior «фильтр «Верно» не отбирает вопрос без вида» проверял unit-тест; AttemptReview.tsx вызывает её"
  - "QuestionStatus в attempt-review-utils.ts берётся из exam-core ('ungraded' | 'correct' | 'partial' | 'wrong'); помощники статуса принимают QuestionStatus | null"
  - "getSequenceReview возвращает mistakes: number | null (visible = mistakes != null)"
  - "Расхождение id/attemptId из 05-08 закрыто: AttemptReviewData = AdminAttemptView, поля id у типа нет; в коде разбора attempt.id не читался, typecheck зелёный"

requirements-completed: [SCORE-02, SCORE-04]

duration: 20min
completed: 2026-10-04
---

# Phase 5 Plan 10: Разбор попытки в web строится из вида сервера, результат объявлен один раз Summary

Разбор попытки в web больше не угадывает, виден ли ключ, и не считает вердикты. Модели `getTextReview`, `getChoiceReview` и `getMatchingReview` берут `keyVisible`, `correctAnswer`, `verdicts`, `mistakes`, `isCorrect` и `earnedPoints` из `AttemptQuestionView`. `TestRunner` передаёт в `QuestionAnswerReview` вид из ответа submit, разбор администратора передаёт вид из `AdminAttemptView`. Статус вопроса везде читается из `status` вида. `AttemptReviewData` теперь равен `AdminAttemptView`, а `SubmitResultSchema` удалён из пакета. Для старых попыток разбор администратора показывает пометки из UI-SPEC. Снимок 45 записей 05-02 не изменился.

## Коммит

Коммит не выполнялся (правило пользователя), изменения лежат в рабочем дереве worktree `wt-phase-05` (ветка `gsd/phase-05`).

## Файлы к коммиту

Все 17 файлов изменены, новых нет:
- `app/web/components/tests/attempt-review/attempt-review-utils.ts`
- `app/web/components/tests/attempt-review/QuestionAnswerReview.tsx`
- `app/web/components/tests/attempt-review/AttemptQuestionsList.tsx`
- `app/web/components/tests/attempt-review/AttemptReviewNav.tsx`
- `app/web/components/tests/attempt-review/AttemptReviewSummary.tsx`
- `app/web/components/tests/attempt-review/AttemptReviewHero.tsx`
- `app/web/components/tests/attempt-review/review-viewers.test.ts`
- `app/web/components/tests/attempt-review/attempt-review-utils.test.ts`
- `app/web/components/tests/attempt-review/AttemptQuestionsList.test.ts`
- `app/web/components/tests/AttemptReview.tsx`
- `app/web/components/tests/TestRunner.tsx`
- `app/web/lib/tests/types.ts`
- `app/web/lib/tests/api.ts`
- `packages/exam-core/src/attempt-result.ts`
- `packages/exam-core/src/index.ts`
- `packages/exam-core/src/attempt-result.test.ts`
- `scripts/check-exam-core-dist.mjs`

## Отпечаток и снимок

- Отпечаток до правок: `.planning/commit-snapshots/before-05-10/fingerprint.json`, вывод `fingerprint 05-10: 0 paths` (дерево чистое после 96dbd9a).
- Проверка после плана: `05-10 changed only its files`.
- sha256 `__snapshots__/review-viewers.test.ts.snap`:
  - до плана: `bd12834807fa60c5ff8b7659eb952344e4ffa9b5dead16672645dd5ba284e480`;
  - после Task 1: `snapshot unchanged`;
  - после Task 2: `snapshot unchanged`;
  - после Task 3: `bd12834807fa60c5ff8b7659eb952344e4ffa9b5dead16672645dd5ba284e480`, совпадает со значением в 05-02-SUMMARY.md.
- Все прогоны vitest шли с `CI=true` и без `--update`.

## Задачи

### Task 1 (tracer): модели разбора на виде

- `ReviewInput = { question, studentAnswer, view: AttemptQuestionView }`.
- Выбор и сопоставление подсвечиваются только при `view.keyVisible && view.verdicts != null` (внутренняя `verdictsShown`). От этого же флага зависят тон, подписи строк, разбивка «из них верно» и «Верных пар: X / N».
- `getChoiceOptionReviewRows(question, verdicts)` берёт строки из частей вердиктов.
- Сопоставление: текст правильной пары берётся из `expected` части по `leftId`. В адаптере `matching.ts` `expected` — id правого элемента, поэтому `rightText` даёт тот же текст, что раньше давал ключ.
- `getTextReview`: тон, суффикс, `cellsKeyVisible` и `correctLines` считаются по правилам 05-02 из `view.isCorrect`, `view.earnedPoints` и `view.correctAnswer`. `getSequenceReview({ verdicts, mistakes, correctAnswer })` вызывается только у `sequence_digits`, поэтому у `short_text` `summaryText` всегда null.
  - `summaryText = mistakes != null ? 'Ошибок: ' + mistakes : null`.
  - Ячейки показываются при `correctAnswer != null`, `mistakes > 0` и хотя бы одной части с `given`.
- `getQuestionView(questionId, results)` и `emptyQuestionView(questionId)`. Пустой вид: `keyVisible false`, `isCorrect false`, баллы 0, `status 'ungraded'`, остальные поля null.
- `TestRunner`: `view={questionResult}`. Свойства `correctAnswer`, `isCorrect`, `earnedPoints`, `showCorrectAnswer` удалены.
- `AttemptQuestionsList`: `view ?? emptyQuestionView(question.id)`.
- `review-viewers.test.ts`: те же 15 строк, 3 зрителя и 45 имён тестов. На вход идёт вид, собранный в тесте из `scoreQuestionFacts` по правилу D-15, статус через `questionStatus`.
  - admin: `keyVisible true`, `correctAnswer = key`.
  - student_with_key: `correctAnswer = isCorrect ? null : key`.
  - student_without_key: при верном ответе `mistakes 0` и `verdicts` только если `allPartsCorrect`, иначе null.
- `attempt-review-utils.test.ts` и `AttemptQuestionsList.test.ts` переведены на новые сигнатуры, ожидаемые значения прежние. Вердикты для входа считаются в тесте через `computeVerdicts` пакета. Тест «сохранённый isCorrect при другом текущем ключе» больше не имеет смысла: ключ теперь приходит с сервера. Он заменён тестом «верный ответ при видимом ключе даёт Ошибок: 0 без ячеек» с теми же ожиданиями. В тест исходника добавлены проверки, что в `QuestionAnswerReview.tsx` и `attempt-review-utils.ts` нет `computeVerdicts(`.
- Гейт Task 1:
  - `CI=true yarn workspace @bio-exam/web vitest run components/tests`: `Test Files 7 passed`, `Tests 119 passed (119)`;
  - typecheck: код 0, ошибок нет;
  - `snapshot unchanged`, `no web verdicts`.
- Tracer-гейт: `<verify>` прогнан полностью и зелёный, после этого начат Task 2.

### Task 2 (TDD): статус из вида, пометки, одна схема результата

- RED: 9 тестов по behavior дописаны в `attempt-review-utils.test.ts` до реализации. Первый прогон: `Tests 5 failed | 16 passed (21)`, причины `filterQuestionsByStatus is not a function` и отсутствие `getAdminReviewNote`, `getCorrectLines`, `ADMIN_REVIEW_NOTES`. Строки getTextReview (ключ неизвестен, short_text при `mistakes 1`, ключ известен без вердиктов) прошли сразу: это поведение уже дал Task 1.
- GREEN, `attempt-review-utils.ts`:
  - удалены `QuestionResult` и `getQuestionStatus`. Тип `QuestionStatus` берётся из `@bio-exam/exam-core`. `getStatusLabel`, `getStatusClass`, `getStatusDotClass` принимают `QuestionStatus | null`, `'ungraded'` и null дают «Без оценки» и прежний нейтральный класс;
  - `getAdminReviewNote(view)`: null → null, `keyVisible false` → `'key-unknown'`, `verdicts null` → `'verdicts-unavailable'`, иначе null. `ADMIN_REVIEW_NOTES` содержит оба текста UI-SPEC дословно;
  - `getCorrectLines(question, view)` возвращает `formatAnswerLines` ключа только при `keyVisible`, `verdicts == null`, `correctAnswer != null` и `status !== 'correct'`. В модели выбора и сопоставления новых ключей нет;
  - `filterQuestionsByStatus(questions, results, filter)`.
- `QuestionAnswerReview.tsx`: у выбора и сопоставления после списка рисуется отдельный блок `mt-4` «Правильный ответ» по `getCorrectLines`. Карточка `CorrectAnswerCard` общая с текстом и последовательностью, классы UI-SPEC те же.
- `AttemptQuestionsList.tsx`:
  - статус `view?.status ?? null`;
  - бейдж баллов только при наличии вида;
  - после `QuestionAnswerReview` и до телеметрии стоит `<p role="note" …>` с `KeyRound` (`aria-hidden="true"`) и текстом `ADMIN_REVIEW_NOTES[getAdminReviewNote(view)]`;
  - у вопроса без вида пометки нет (C4: «Без оценки», без баллов).
- `AttemptReviewNav`, `AttemptReviewSummary`, `AttemptReviewHero`, `AttemptReview.tsx`: `results: AttemptQuestionView[]` идёт прямо из `attempt.results` без приведения. Статус читается как `getQuestionView(...)?.status`, счётчик верных в шапке — `status === 'correct'`.
- `types.ts`: `export type AttemptReviewData = AdminAttemptView`. Прежнее объявление с `id` и `results: unknown[]` удалено вместе с комментарием над ним. Страница `/admin/attempts/[id]` импортирует `AttemptReviewData` как раньше.
- `api.ts`: удалён `fetchAttemptReview` и его импорт `AttemptReviewData`. `rg` показал, что функцию никто не вызывал.
- exam-core:
  - `SubmitResultItemSchema`, `SubmitResultSchema`, `SubmitResult`, `SubmitResultItem` удалены из `attempt-result.ts` и `index.ts`;
  - из `attempt-result.test.ts` удалены 11 тестов `SubmitResult*` и проверка `SubmitResultSchema.safeParse(view)` в тесте `AttemptViewSchema`;
  - `EXPECTED_EXPORTS`: 72 → 70.
- Гейт Task 2:
  - `exam-core dist OK: … 70 экспортов в ESM и CJS`;
  - web `components/tests`: `Tests 128 passed (128)`;
  - typecheck: код 0;
  - `one result schema on web`, `snapshot unchanged`.
- `rg -n "SubmitResult" app packages e2e scripts` находит:
  - `scripts/exam-core-no-private-copies.test.mjs` (список запрещённых копий);
  - комментарий в `e2e/fixtures/exam.ts:37`;
  - чужие имена `setSubmitResult` (состояние `TestRunner`) и `PrecheckSubmitResult` (сервер). Это не схема результата.

### Task 3: гейты

- `yarn verify: OK`, все восемь шагов `passed`:
  - server: `Tests 658 passed (658)` в 35 файлах;
  - exam-core: `599 passed`, то есть 610 минус 11 удалённых тестов `SubmitResult*`;
  - web: `563 passed` в 24 файлах, ожидаемых падений нет;
  - rbac: `2 passed`;
  - script-tests: `pass 147`, `fail 0`;
  - lint изменённых файлов без предупреждений.
- `yarn e2e`: `132 passed (58.0s)`, код 0, ни одного `✘`. Потоки 2 и 3, D1 и D2 зелёные на chromium-desktop и chromium-mobile, ожидаемых падений нет.
- Отпечаток: `05-10 changed only its files`.

## CodeGraph (D-23)

В worktree нет `.codegraph/`. Команды выполнены в основном дереве по индексу до фазы 5 (только чтение).

- `codegraph impact QuestionAnswerReview`: 9 символов. Затронуты `AttemptQuestionsList`, `AttemptReview`, `TestRunner` и `TestPageClient.tsx` (страница прохождения теста). Все проверены typecheck и e2e @flow2/@flow3.
- `codegraph impact getChoiceOptionReviewRows`: 6 символов. Это `ChoiceAnswerReview`, `QuestionAnswerReview`, `AttemptQuestionsList.test.ts` и `attempt-review-utils.test.ts`.
- `codegraph impact getSequenceReview`: 5 символов. Это `TextAnswerReview`, `QuestionAnswerReview` и `attempt-review-utils.test.ts`.
- `codegraph impact getQuestionStatus`: 12 символов. Это `AttemptQuestionsList`, `AttemptReview`, `SummaryColumn`, `AttemptReviewSummary`, `AttemptReviewNav` и страница `admin/attempts/[id]/page.tsx`. Все вызовы переведены на `status` вида, сама функция удалена.
- `codegraph affected` по 17 файлам плана дал 25 файлов:
  - server: `question-type-resolver.ts`, `routes/tests/public.ts`;
  - web admin: `QuestionEditorPageClient.tsx`, `QuestionEditor.tsx`, `question-validation.ts`, `admin/tests/types/index.ts`;
  - web разбора: 13 файлов плана;
  - exam-core: `answer.test.ts`, `attempt-result.test.ts`, `authoring.test.ts`, `invariants.test.ts`, `review.test.ts`, `scoring.test.ts`.
  - Всё прошло в `yarn verify`.

## Deviations from Plan

Отклонений от списка файлов нет.

### Решения исполнителя (автономно)

1. **`filterQuestionsByStatus` в `attempt-review-utils.ts`.** В плане фильтр стоит строкой behavior («фильтр «Верно» не отбирает вопрос без вида»), а сам фильтр жил в `useMemo` внутри `AttemptReview.tsx`. Чтобы его можно было проверить unit-тестом, он вынесен в чистую функцию в файле плана. В `AttemptReviewNav` фильтр строк остался прежним сравнением `status !== navFilter` по статусу вида.
2. **Тест «сохранённый isCorrect при другом текущем ключе» заменён.** Web больше не видит текущий ключ, поэтому сценарий в web не воспроизводится. Ожидания (`Ошибок: 0`, без ячеек) теперь проверяются на виде с верным ответом и видимым ключом.
3. **Тон карточки «Ответ студента» при неизвестном ключе считается по `view.isCorrect`, как в снимке 05-02.** `status === 'correct'` и `isCorrect` расходятся только у вопроса с 0 баллов (`ungraded`). Правило снимка не менялось.
4. **Удалённые проверки отказа `SubmitResultSchema` не перенесены на `AttemptViewSchema`.** Отказ `AttemptViewSchema` и `AttemptQuestionViewSchema` уже проверяют существующие тесты пакета.

### Сверка `id` / `attemptId` из 05-08

`AttemptReviewData` теперь алиас `AdminAttemptView`: поле называется `attemptId`, поля `id` нет. В коде разбора и на странице `/admin/attempts/[id]` `attempt.id` не читается. `attempt.id` в `TestRunner` относится к `TestAttemptSummary`, а не к разбору. Web typecheck зелёный.

## TDD Gate Compliance

Коммиты не выполнялись (правило пользователя).
- RED (Task 2): `Tests 5 failed | 16 passed (21)`, падения из-за отсутствующих `filterQuestionsByStatus`, `getAdminReviewNote`, `getCorrectLines`, `ADMIN_REVIEW_NOTES`.
- GREEN: `Tests 128 passed (128)` по `components/tests`.
- REFACTOR: карточка «Правильный ответ» вынесена в общий `CorrectAnswerCard`. Тесты оставались зелёными, снимок не изменился.

## Known Stubs

Нет.

## Threat Flags

Новых поверхностей нет: API не менялся, web только читает вид.
- T-5-32: web не вычисляет ключ и вердикты. `computeVerdicts(` в web-коде разбора нет, проверка `one result schema on web` зелёная.
- T-5-33: снимок 45 записей прошёл без изменения файла, sha256 совпадает.
- T-5-34: пометки UI-SPEC стоят вместо пустого места. «Правильный ответ» и вердикты берутся только из вида, статус и баллы — сохранённые.
- T-5-SC: установок пакетов нет, `lucide-react` уже был (`KeyRound`).

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. UI-SPEC **[авто] требует подтверждения**: текст «Разбор по частям недоступен: правила проверки изменились после сдачи. Показаны ключ на момент сдачи и сохранённые баллы.» и новое размещение карточки «Правильный ответ» у выбора и сопоставления (отдельный блок `mt-4` под списком вариантов или пар). Пометка появляется в двух случаях. Первый: пересчёт версии 1 не совпал с сохранёнными баллами. Второй: ключ известен, но у вопроса нет настроенного типа, и `legacyFact` из 05-08 тогда отдаёт `keyVisible true` и `verdicts null`. При подтверждении текста стоит учесть оба случая.
2. UI-SPEC backstop: на ширине 375px открыть `/admin/attempts/<id>` старой попытки (версия 1, ключ до сдачи неизвестен) и проверить:
   - текст пометки переносится;
   - пиктограмма `KeyRound` стоит у первой строки;
   - у карточки вопроса нет горизонтального скролла.
3. Коммит 17 файлов плана делает пользователь (оркестратор).

## Self-Check: PASSED

- `git status` показывает 17 изменённых путей, все из списка плана. Новых и удалённых файлов нет.
- Снимок не изменён, sha256 `bd12834807fa60c5ff8b7659eb952344e4ffa9b5dead16672645dd5ba284e480`.
- В добавленных строках нет комментариев (`git diff -U0` проверен на `//` и `/*`).
- `yarn verify: OK`; `yarn e2e`: 132 passed.
- Коммитов нет по правилу пользователя.
