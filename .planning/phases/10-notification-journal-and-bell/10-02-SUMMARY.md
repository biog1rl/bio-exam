---
phase: 10-notification-journal-and-bell
plan: 02
subsystem: api
tags: [notifications, assignments, drizzle, transactions]
status: complete

requires:
  - phase: 10-notification-journal-and-bell
    provides: recordNotifications, NotificationTx, таблицы журнала (план 10-01)
provides:
  - recordTestAssigned, TEST_ASSIGNED_KIND, testAssignedDedupeKey, внутренние visibleTestTitle и testAssignedInputs
  - addAssignments в routes/tests/assignments.ts для трёх путей назначения
  - серверные тесты событий назначения
affects: [10-09, 10-03, 10-04]

actuals:
  tokens: 14000
  tasks: 3
  commits: 0
plan_head_before: a1ceade074fbc80e37a304121f240e406eda42e3
plan_head_after: a1ceade074fbc80e37a304121f240e406eda42e3

key-files:
  created:
    - app/server/src/services/notifications/producers/test-assigned.ts
    - app/server/src/routes/tests/assignment-notifications.test.ts
  modified:
    - app/server/src/services/notifications/index.ts
    - app/server/src/routes/tests/assignments.ts
    - app/server/src/routes/users/index.ts

key-decisions:
  - "D-18 вместо рекомендации RESEARCH Pattern 5: событие назначения пишется только для видимого теста (tests.is_published и topics.is_active, чтение через tx); назначение черновика или теста в выключенной теме остаётся без события"
  - "visibleTestTitle читает строку теста с FOR SHARE (drizzle .for('share', { of: tests })) через tx: назначение, пока чужая публикация не зафиксирована, ждёт её и читает уже зафиксированную строку; сторона публикации и тест гонки - план 10-09"
  - "Общий построитель входов события для 10-09 называется testAssignedInputs(testId, testTitle, actorId, recipientIds); он только отображает получателей во входы, отбрасывание автора и повторов остаётся у вызывающего (recordTestAssigned)"
  - "addAssignments вставляет [...new Set(userIds)].sort() с onConflictDoNothing().returning({ userId }) и пишет событие только для реально вставленных строк"

duration: 25min
completed: 2026-10-06
---

# Phase 10 Plan 02: события назначения теста Summary

Три пути назначения теста (прямой, группой, из профиля) идут через одну транзакцию `addAssignments`: вставка назначений, затем событие `test.assigned` только для вставленных строк и только для опубликованного теста в активной теме.

## Что сделано

- Task 1 (tracer): `producers/test-assigned.ts` (`TEST_ASSIGNED_KIND`, `testAssignedDedupeKey`, `visibleTestTitle`, `testAssignedInputs`, `recordTestAssigned`), реэкспорт в `services/notifications/index.ts`, `addAssignments` в `assignments.ts`, `POST /api/tests/:testId/assignments` переведён на неё, tracer-тест.
- Task 2: групповой маршрут и `POST /api/users/:userId/test-assignments` переведены на `addAssignments` (ответы прежние, проверки `canWriteTest`, `canManageGroup`, `hasPermission`, `canAssign`, `canAssignMany` остались в теле обработчиков до вызова). Тесты: повтор, снятие и повторное назначение (`ref_seq` 2, `read_at` сброшен, `last_event_at` вырос, событие при снятии не тронуто), группа с одним уже назначенным (`assigned: 2`), профиль, назначающий = получатель, отключённый ученик, черновик (прямой и групповой пути, названия черновика в журнале нет), выключенная тема, учитель своей и чужой группы.
- Task 3: откат причины (вставка с `await`, до `throw` внутри транзакции видны строка назначения и событие), два параллельных одинаковых `POST` (`Promise.all`, одно событие, `ref_seq = 1`), сбой записи события триггером `test_fail_notification` (500, назначения нет, триггер и функция удаляются в `finally`).

## CodeGraph

- `codegraph impact removeAssignment`: 5 символов, затронуты `DELETE /api/users/:userId/test-assignments/:testId` в `routes/users/index.ts` и подключение в `routes/index.ts`; сигнатура не менялась.
- `codegraph impact assignmentsRouter`: `routes/tests/index.ts` (`USE /api/tests/:testId/assignments`) и `routes/index.ts`; порядок middleware и ответы не менялись.
- Обработчик `POST /:userId/test-assignments`: меняется только строка вставки.
- `codegraph affected` по `assignments.ts`, `users/index.ts`, `test-assigned.ts`: один тестовый файл (`assignments.ts`); серверный набор прогнан целиком.

## Проверки

- `assignment-notifications.test.ts`: 13 passed (11 в мире администратора, 2 в мире учителя).
- `teacher-zone-users.matrix.test.ts`: 94 passed.
- `node --test scripts/teacher-zone-guards.test.mjs scripts/attempt-integrity-guards.test.mjs`: 27 pass, 0 fail.
- Полный серверный набор под `with-test-db`: 94 файла, 1857 тестов, все зелёные. До плана: 93 файла, 1844 теста (после 10-01); +1 файл, +13 тестов.
- `yarn verify`: `yarn verify: OK`.
- `node .planning/phases/10-notification-journal-and-bell/10-plan-files.cjs check 10-02`: `10-02 changed only its files`.
- В журнале сервера при прогоне теста сбоя триггера виден ожидаемый `Request error` с `notification write failed`.
- `services/notifications` не читает `test_assignments` и не импортирует модульный `db`.

## Deviations from Plan

None - plan executed exactly as written. Замечание: `actuals.commits: 0`, `plan_head_after = plan_head_before`, потому что исполнитель по правилу пользователя не коммитит; изменения в рабочем дереве, коммитит ведущая сессия.

## Known Stubs

Нет.

## Threat Flags

Нет: новых сетевых поверхностей нет, маршруты и проверки доступа не менялись.

## Шаги пользователя

Нет.

## Файлы к коммиту

- `app/server/src/services/notifications/producers/test-assigned.ts` (новый)
- `app/server/src/services/notifications/index.ts`
- `app/server/src/routes/tests/assignments.ts`
- `app/server/src/routes/users/index.ts`
- `app/server/src/routes/tests/assignment-notifications.test.ts` (новый)

## Self-Check: PASSED

Все пять файлов существуют, серверный набор, охранные тесты, `yarn verify` и сверка файлов плана зелёные.
