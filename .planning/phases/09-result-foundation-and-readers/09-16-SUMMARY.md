---
phase: 09-result-foundation-and-readers
plan: 16
subsystem: web-dashboard
tags: [dashboard, attempt-result-view, pending, averageScore-null, dead-code, DEBT-02]
requires: ["09-12", "09-09", "09-10"]
provides:
  - "DashboardClient: средний и лучший результат ученика только по попыткам с итогом, «—» при их отсутствии"
  - "Карточки последней попытки и два списка последних попыток через attemptResultView, у pending метка вместо полосы и процента"
  - "AdminDashboardAttempt = AttemptResultFields & {...}: nullable-поля результата, reviewStatus, автобаллы"
affects: [09-17]
tech-stack:
  added: []
  patterns:
    - "Читатель не проверяет scorePercentage == null сам: ветвление по view.kind"
key-files:
  created: []
  modified:
    - app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx
decisions:
  - "Закомментированный блок «Динамика результатов» удалён вместе с семью неиспользуемыми объектами; вернуть его можно из истории git: коммит f77e8ab (HEAD при исполнении 4e84aea)"
  - "bestAttempt заменён на bestPercent: в разметке использовался только процент"
  - "Карточка последней попытки у pending: AttemptReviewLine стоит на месте полосы, ниже отдельной строкой дата (процентной строки нет)"
metrics:
  tasks: 2
  completed: 2026-10-06
status: complete
actuals:
  tokens: 9000
  tasks: 2
  commits: 0
plan_head_before: 4e84aeae0c82614c1bf41844a5a84f192b7d9aba
plan_head_after: 4e84aeae0c82614c1bf41844a5a84f192b7d9aba
---

# Phase 9 Plan 16: Дашборд с попытками на проверке Summary

Дашборд ученика и проверяющего читает результат через `attemptResultView`: попытки на проверке не входят в средний и «лучший» результат, не рисуют полосу `width: NaN%`, а в карточках и списках показывают «На проверке» с автобаллами. Семь неиспользуемых объектов и закомментированный блок удалены. Изменения в рабочем дереве, не закоммичены (правило пользователя: коммитит ведущая сессия), поэтому `commits: 0`.

## Выполнено

- **Task 1 (tracer):** удалены `Area`, `AreaChart` из импорта recharts, `studentChartConfig`, `adminStudentChartConfig`, `studentProgress`, `groupedTests`, `adminStudentScores` и закомментированный JSX-блок «Динамика результатов». Тип `AdminDashboardAttempt` теперь `AttemptResultFields & {...}`. Карточка «последняя попытка» проверяющего: `final` по `view.percent`, `pending` — `AttemptReviewLine audience="staff"` вместо полосы и процента, дата остаётся.
- **Task 2:** `averageScore` ученика — среднее `view.percent` по `final`, `null` при пустом наборе, показ по `=== null`, настоящий 0 % виден как «0%»; `bestPercent` — максимум по `final`; `completedTotal` не изменён (считает все сданные). Карточка ученика и оба списка («Последние попытки» до 6, «Последние попытки студентов» до 5): у pending `ReviewStatusChip` и `ArrowRight` без плашки, полоса не рисуется, строка даты «{дата} · предварительно X из Y» / «{дата} · авто X из Y» (хелпер `reviewDateLine`, без автобаллов только дата). У `none` и `graded` разметка прежняя; `TeacherCheckedMark` в дашборд не добавлен. Плитка проверяющего «средний балл» уже читала `averageScore != null` и показывает «—» при `null`, без правки.

## Проверки

- oxlint до правок (7 предупреждений `no-unused-vars`): `Area` (21:10), `AreaChart` (21:16), `studentChartConfig` (97), `adminStudentChartConfig` (104), `studentProgress` (230), `groupedTests` (240), `adminStudentScores` (268). После: пустой вывод, exit 0.
- `codegraph impact DashboardClient`: 3 символа (`DashboardClient`, `DashboardPage`, маршрут `/web/app/dashboard`). `codegraph affected` по файлу: тестовых файлов нет.
- `yarn workspace @bio-exam/web typecheck`: exit 0. `yarn workspace @bio-exam/web lint`: exit 0, предупреждения только в других файлах (`ScoringSettingsPageClient`, `SearchDialog`, `TestRunner`, `set-state-in-effect`, существовали раньше).
- `yarn e2e tests/navigation.spec.ts`: 34 passed, без failed и flaky (контраст и переполнение дашборда).
- `yarn verify: OK` (все восемь шагов passed).
- `09-plan-files.cjs check 09-16`: `09-16 changed only its files`.
- grep: `adminStudentScores|studentProgress|groupedTests|studentChartConfig` = 0; `averageScore ?` = 0; `attemptResultView` = 6; `AttemptReviewLine` ≥ 1.
- Файл отформатирован `yarn exec oxfmt`.

## Deviations from Plan

None - plan executed exactly as written. Отметка: расширенной проверки отображения pending в браузере нет (e2e навигации не создаёт попыток на проверке); ветки pending покрыты типами и общим `attemptResultView` с тестами из 09-12.

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей: T-09-44 и T-09-45 закрыты (карточки через `attemptResultView`, среднее по `final`, `null` → «—»).

## Файлы к коммиту

- `app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx`

## Self-Check: PASSED
