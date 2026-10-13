---
phase: 09-result-foundation-and-readers
plan: 09
subsystem: admin-attempts-readers
tags: [attempts-list, dashboard, review-filter, pending, averageScore-null]
requires: ["09-06"]
provides:
  - "Параметр review=all|pending|graded у GET /api/tests/admin/attempts"
  - "summary.pendingTotal в списке попыток, зона целиком, независимо от фильтров"
  - "Поля reviewStatus, autoEarnedPoints, autoTotalPoints в строках списка и latestAttempts дашборда через attemptResultColumns"
  - "averageScore: number | null в сводке списка, сводке дашборда и dailyActivity"
  - "Web принимает averageScore null: parseAdminAttempts, attempts-types.ts, AdminAttemptsClient, DashboardClient"
affects: [09-10, 09-12, 09-16, phase-14, phase-15]
tech-stack:
  added: []
  patterns:
    - "SQL-агрегаты результата с явным review_status <> 'pending' и без coalesce у среднего"
key-files:
  created: []
  modified:
    - app/server/src/routes/tests/admin/attempts.ts
    - app/server/src/routes/tests/admin-attempts-list.test.ts
    - app/web/lib/tests/admin-api.ts
    - app/web/lib/tests/admin-api.test.ts
    - app/web/app/(internal)/(protected)/admin/attempts/attempts-types.ts
    - app/web/app/(internal)/(protected)/admin/attempts/AdminAttemptsClient.tsx
    - app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx
decisions:
  - "pendingTotal считается в том же запросе, что scopeTotal (под visible), поэтому не зависит от review, status, темы, ученика, даты и поиска"
  - "Приведение среднего вынесено в nullableNumber: null остаётся null, прежнее Number(x ?? 0) убрано"
metrics:
  tasks: 3
  completed: 2026-10-06
status: complete
actuals:
  tokens: 45000
  tasks: 3
  commits: 0
plan_head_before: 4bb4a1828ca45d609da31ed866760761b5532642
plan_head_after: 4bb4a1828ca45d609da31ed866760761b5532642
---

# Phase 9 Plan 09: Список попыток и дашборд знают «на проверке» Summary

Список попыток админа, его сводка и дашборд читают результат через `attemptResultColumns`, фильтруют по `review`, считают `pendingTotal` по всей зоне и не включают попытки на проверке в средние и «пройдено»; web в том же наборе изменений терпит `averageScore: null`. Изменения в рабочем дереве, не закоммичены (правило пользователя: коммитит ведущая сессия). `yarn verify: OK`.

## codegraph impact (до правок)

- `studentAttemptsInScope`: 4 символа, оба маршрута `GET /admin/attempts` и `GET /admin/dashboard` в одном файле. Сигнатура не менялась.
- `attemptFilters`: 3 символа, только `GET /admin/attempts`. Сигнатура не менялась, добавлен фильтр `review`.

## codegraph affected

38 затронутых файлов (серверные маршруты tests, web-клиенты админки, e2e-фикстуры и спеки, `editor.ssr.test.ts`). Запускались: `admin-attempts-list.test.ts`, `attempt-readers-none.characterization.test.ts`, `teacher-zone-tests.matrix.test.ts`, `lib/tests/admin-api.test.ts`, затем весь `yarn verify` (серверные и web-тесты целиком).

## Что сделано

- Task 1 (tracer): `AttemptsQuerySchema` += `review: z.enum(['all', 'pending', 'graded']).default('all')`; `attemptFilters` добавляет `eq(testAttempts.reviewStatus, query.review)` при не-`all`; строки списка берут `...attemptResultColumns`. Тест засеивает через `insertAttemptFixture` (режим `outcomeFacts`: radio 1 из 1 и открытый на 3 балла) четыре попытки: pending и graded (оценка 2, итог 3 из 4, 75 %) в зоне учителя, pending в чужой теме, pending неактивного ученика.
- Task 2: сводка списка и дашборда считает `passed` и `averageScore` по `final_*` с `review_status <> 'pending'`, `coalesce` у среднего убран; `scopeCounts` += `pendingTotal`; пустая зона списка `{ passed: 0, averageScore: null, pendingTotal: 0 }`, пустая зона дашборда `averageScore: null`; `latestAttempts` дашборда через `attemptResultColumns`; `totalAttempts` и `attempts` за день считают все попытки.
- Task 3: `parseAdminAttempts` принимает `averageScore` числом или `null`; тип сводки и дашборда `number | null`; плитки среднего в `AdminAttemptsClient` и `DashboardClient` показывают «—» при `null`.

## Таблица «запрос → none / pending / graded»

| Запрос (админ) | none | pending | graded |
| -------------- | ---- | ------- | ------ |
| без `review` / `review=all` | все обычные, порядок по дате | входят в список (3 в зоне админа), `scorePercentage/passed/earnedPoints` null, автобаллы заполнены | входит (75 %, пройдено, 3 из 4) |
| `review=pending` | нет | 3 (учитель темы X видит 2) | нет |
| `review=graded` | нет | нет | 1 |
| `review=pending&status=inactive` | нет | только попытка неактивного ученика | нет |
| `review=pending&status=active` | нет | остальные 2 | нет |
| `review=graded&status=inactive` | нет | нет | пусто |
| `summary.pendingTotal` при любом фильтре | - | 3 для админа, 2 для учителя темы X | - |
| средний балл и «пройдено» | считаются | не входят | считаются |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Засеяно четыре попытки вместо трёх**
- **Found during:** Task 1
- **Issue:** для случая `review=pending` вместе с `status=inactive` нужна pending-попытка неактивного ученика; три попытки из плана пересечение не покрывают.
- **Fix:** добавлена четвёртая попытка (pending, зона учителя, `inactiveStudent`); ожидание существующего теста `status` теперь сортированный набор из двух id (`inactiveAttemptId`, `pendingInactiveAttemptId`). Суммарные числа в существующих тестах (`BULK + 6` и др.) выражены константами `SEEDED_*` и `REVIEW_ADDED_*`; тест темы Y и поиска «Раздел Y» ожидает 3 вместо 2.
- **Files modified:** app/server/src/routes/tests/admin-attempts-list.test.ts

Иных отклонений нет. Зона из одной pending-попытки проверена на свежем учителе в отдельном `describe`, стоящем последним в файле, чтобы его попытка не влияла на глобальные счётчики админа.

## Known Stubs

Нет.

## Threat Flags

Нет. Охват зоны (`testScope`, `studentAttemptsInScope`) не менялся: `review` добавляется к `attemptFilters` внутри `visible`, `pendingTotal` считается под тем же `visible` (T-09-28 покрыт тестом зоны учителя), `review` проходит через `z.enum` и `eq()` (T-09-29), `coalesce` убран, зона из одних pending даёт `averageScore: null` (T-09-31).

## Замечания

- В фазе 9 graded = проверено, без различия учителя и системного нуля (до фазы 15); фильтр `review=graded` это учитывает.
- Типы строк в web (`earnedPoints`, `scorePercentage`, `passed` как `number`/`boolean`) не менялись по плану: новые поля и null у строк подхватывают 09-12 и 09-16. До фазы 14 pending-попыток в продукте нет.
- `yarn typecheck` web и server чистые; `yarn verify: OK` с первого прогона; охранные скрипты (`attempt-integrity-guards`, `teacher-zone-guards`) вошли в `script-tests` и зелёные; сверка `09-09 changed only its files`.

## Self-Check: PASSED
