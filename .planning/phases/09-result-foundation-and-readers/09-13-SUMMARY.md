---
phase: 09-result-foundation-and-readers
plan: 13
subsystem: web-student-screens
tags: [attempt-result-view, pending, student, progress-chart, test-runner]
requires: ["09-12", "09-11", "09-10"]
provides:
  - "Панель результата TestRunner для попытки на проверке: «На проверке · предварительно X из Y» без процента и статуса"
  - "«до {points} балл.» в карточке вопроса со статусом pending"
  - "«Мои попытки» и таблица страницы теста: ветки pending и graded через attemptResultView"
  - "toProgressAttempt: ProgressAttempt | null; AttemptBarRow как объединение по kind"
affects: [09-14, 09-15, 09-16, 09-17]
tech-stack:
  added: []
  patterns:
    - "Читатели ученика берут результат только из attemptResultView; процент и вердикт — из kind 'final'"
    - "Смещение страниц считается по числу полученных строк, а не принятых"
key-files:
  created: []
  modified:
    - app/web/components/tests/TestRunner.tsx
    - app/web/app/(internal)/(protected)/tests/[topicSlug]/[testSlug]/TestLandingPageClient.tsx
    - app/web/lib/progress/my-attempts.ts
    - app/web/lib/progress/my-attempts.test.ts
    - app/web/lib/progress/attempt-chart.ts
    - app/web/components/progress/AttemptBarChart.tsx
decisions:
  - "attempt-chart.test.ts не менялся: существующие проверки percent number у attempt и null у gap остались верными, тип строк проверяет typecheck"
metrics:
  tasks: 3
  files: 6
status: complete
actuals:
  tokens: 14000
  tasks: 3
  commits: 0
plan_head_before: c5181ab
plan_head_after: c5181ab
---

# Phase 9 Plan 13: Экраны ученика и график прогресса: «на проверке» Summary

Ученик после сдачи попытки с открытым вопросом видит панель «На проверке · предварительно X из Y» без процента и статуса, а попытки на проверке не попадают на график прогресса и не искажают подсказку.

## Что сделано

- `TestRunner.tsx`: `resultView = attemptResultView(submitResult)`. Для `pending` панель `border-border bg-secondary` с `AttemptReviewLine audience="student"` и строкой «Процент и итог появятся после проверки учителем.»; для `final` прежние «Баллы/Процент/Статус» из вида. Карточка вопроса со статусом `pending` показывает «до {points} балл.». «Мои попытки»: none как раньше; pending — `{дата} / ` и `AttemptReviewLine`, без `truncate`; graded — как none плюс ` / ` и `TeacherCheckedMark`. Перенос новой попытки в список (`reviewStatus`, автобаллы) уже был сделан в 09-12, не дублировался.
- `TestLandingPageClient.tsx`: ячейка «% правильных» — pending: `AttemptReviewLine`; graded: процент и под ним `TeacherCheckedMark`; none: процент. `formatPercent(row.scorePercentage)` убран.
- `my-attempts.ts`: `toProgressAttempt` возвращает `null` для pending, поля берёт из вида; `loadTestAttempts` ведёт отдельный счётчик полученных строк для смещения и отбрасывает `null`, поэтому pending не зацикливают пагинацию (T-09-40).
- `attempt-chart.ts`: `AttemptBarRow` — объединение `attempt` (`percent: number`) и `gap` (`percent: null`). `AttemptBarChart.tsx`: `rowOf` возвращает только строку `attempt`, `?? 0` в подсказке удалён.
- `my-attempts.test.ts`: `test.each` по статусам none/graded/pending и проверка, что при 150 строках с каждой второй pending запросы идут со смещениями 0 и 100 и в результат попадает 75 попыток.

## Результаты проверок

- `codegraph impact`: toProgressAttempt → loadTestAttempts, loadMyProgressAttempts (внутри файла); loadMyProgressAttempts → StudentProgressSection, DashboardClient, my-attempts.test.ts; buildAttemptBars → AttemptBarChart, UserProfileAssignmentsPage, StudentProgressSection, attempt-chart.test.ts; TestRunner → TestPageClient, start/page.tsx.
- `codegraph affected`: attempt-chart.test.ts, my-attempts.test.ts, api.test.ts (users) и несколько файлов с прямыми ссылками; прогнано через `yarn verify`.
- `yarn workspace @bio-exam/web typecheck` — 0; `yarn workspace @bio-exam/web lint` — 0 (предупреждения только в чужих файлах); `vitest run lib/progress` — 38 passed.
- `node --test scripts/attempt-integrity-guards.test.mjs` — 13 pass, 0 fail.
- `yarn e2e tests/take-test.spec.ts tests/attempt-chart.spec.ts tests/zero-weight.spec.ts` — 18 passed, без failed и flaky.
- `yarn verify` — `yarn verify: OK`.
- `yarn exec oxfmt` по файлам плана выполнен; `format-check` внутри verify passed.

## Deviations from Plan

- Снимок `09-plan-files.cjs snapshot 09-13` (шаг 0 задачи 1) не снят перед правками, поэтому `check 09-13` не запускался (нет `before-09-13/fingerprint.json`). Вместо него сверен `git status --short`: изменены ровно шесть файлов из `files_modified`, кроме `attempt-chart.test.ts`, который не потребовал правок; чужой неотслеживаемый `docs/adr/0006-...` не тронут.
- `TestAttemptSummary` пока с `number` без `null` (контракт вводит 09-17), поэтому pending-строки в тесте приведены через `never`/`unknown`.

## Known Stubs

Нет.

## Self-Check: PASSED
