---
phase: 10-notification-journal-and-bell
plan: 03
subsystem: api
tags: [notifications, cursor-pagination, express, drizzle]
status: complete

requires:
  - phase: 10-notification-journal-and-bell
    provides: notificationEvents, recordNotifications, TEST_ASSIGNED_KIND (планы 10-01, 10-02)
provides:
  - ownedBy, listNotifications, countUnread, markRead, markAllRead (services/notifications/read.ts)
  - encodeCursor, decodeCursor, CursorPosition (cursor.ts)
  - notificationText, UNKNOWN_KIND_TEXT (kinds.ts)
  - маршруты GET /api/notifications, GET /api/notifications/unread-count, POST /api/notifications/read-all, POST /api/notifications/:id/read
affects: [10-04, 10-05, 10-06, 10-09]

requirements-completed: [NOTIF-02, NOTIF-06]

actuals:
  tokens: 11000
  tasks: 3
  commits: 0
plan_head_before: 3f89f7c
plan_head_after: 3f89f7c

key-files:
  created:
    - app/server/src/services/notifications/read.ts
    - app/server/src/services/notifications/cursor.ts
    - app/server/src/services/notifications/kinds.ts
    - app/server/src/routes/notifications.ts
    - app/server/src/routes/notifications.test.ts
  modified:
    - app/server/src/services/notifications/index.ts
    - app/server/src/routes/index.ts
    - app/server/route-inventory.txt

key-decisions:
  - "Курсор - base64url от JSON [last_event_at текстом с микросекундами, id]; сравнение строкой (last_event_at, id) < (ts::timestamptz, id::uuid), сортировка по столбцам таблицы, а не по to_char"
  - "Текст строки собирает сервер по таблице видов (Map), неизвестный вид и испорченные params дают запасной текст, а не 500"
  - "Чужой, несуществующий и не-uuid id в read дают один и тот же 404 { error: 'Not found' }; isValidUUID проверяется в сервисе, параметровый validateUUID не подключается"
---

# Phase 10 Plan 03: чтение журнала уведомлений Summary

Четыре маршрута `/api/notifications` (список по курсору, точное число непрочитанных, «прочитать», «прочитать все») поверх одной функции условия `ownedBy`, с текстом строки из таблицы видов на сервере.

## Что сделано

- Task 1 (tracer): `countUnread`, `routes/notifications.ts` с `GET /unread-count`, монтирование `router.use('/notifications', notificationsRouter)` после `/search`, перегенерированный `route-inventory.txt`, тест числа (11 у A, 2 у B, 401 без сессии).
- Task 2: `cursor.ts`, `kinds.ts`, `listNotifications` (выборка `limit + 1`, `lastEventAt` через `to_char` с микросекундами, порядок `desc(lastEventAt), desc(id)` по столбцам), `GET /` со схемой `NotificationsQuerySchema` и 400 `Invalid request` для неверных `limit` и `cursor`, реэкспорты в `index.ts`.
- Task 3: `markRead` (`coalesce(read_at, now())`, `false` для не-uuid без запроса), `markAllRead`, `POST /read-all` и `POST /:id/read` (404 `{ error: 'Not found' }`), тесты отказов, `read-all`, 401.

## CodeGraph

- `codegraph impact router --file app/server/src/routes/index.ts`: 2 затронутых символа - сам `router` и `USE /api` в `app/server/src/app.ts:93`. Существующие маршруты не менялись, добавлена одна строка `router.use`.
- `codegraph affected` по файлам плана: список содержит только веб-файлы-соседи по имени `router`/`notifications` (шум по общим именам) и серверные тесты; серверный набор прогнан целиком.

## diff route-inventory.txt

```
+GET /api/notifications  sessionRequired > <anonymous>
+GET /api/notifications/unread-count  sessionRequired > <anonymous>
+POST /api/notifications/read-all  sessionRequired > <anonymous>
+POST /api/notifications/:id/read  sessionRequired > <anonymous>
```

Строки вставлены после `GET /api/search`, перед `GET /api/sidebar`.

## План запроса списка (Task 2, шаг 7)

Индекс из `0027_notification_journal.sql` дословно:

```
CREATE INDEX "notification_events_recipient_feed_idx" ON "notification_events" USING btree ("recipient_id","last_event_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
```

`SET enable_seqscan = off;` на мигрированной одноразовой базе, `EXPLAIN` без курсора:

```
 Limit  (cost=0.15..8.17 rows=1 width=96)
   ->  Index Scan using notification_events_recipient_feed_idx on notification_events  (cost=0.15..8.17 rows=1 width=96)
         Index Cond: (recipient_id = '00000000-0000-4000-8000-000000000000'::uuid)
```

`EXPLAIN` с условием курсора:

```
 Limit  (cost=0.15..8.17 rows=1 width=96)
   ->  Index Scan using notification_events_recipient_feed_idx on notification_events  (cost=0.15..8.17 rows=1 width=96)
         Index Cond: ((recipient_id = '00000000-0000-4000-8000-000000000000'::uuid) AND (ROW(last_event_at, id) < ROW('2026-10-06 14:05:00.123456+00'::timestamp with time zone, '00000000-0000-4000-8000-000000000001'::uuid)))
```

Оба плана: `Index Scan using notification_events_recipient_feed_idx`, узла `Sort` нет. STOP не требуется.

## Проверки

- `routes/notifications.test.ts` и `routes/route-inventory.snapshot.test.ts`: 2 файла, 35 passed.
- Полный серверный набор под `with-test-db`: до плана 94 файла и 1857 тестов (после 10-02), после - 95 файлов и 1890 тестов, все зелёные (+1 файл, +33 теста).
- `yarn verify`: `yarn verify: OK`.
- `node .planning/phases/10-notification-journal-and-bell/10-plan-files.cjs check 10-03`: `10-03 changed only its files`.
- Критерии приёмки: `validateUUID` в `routes/notifications.ts` - 0; `ownedBy(` в `read.ts` - 5; `testAssignments` в `read.ts`, `cursor.ts`, `kinds.ts`, `routes/notifications.ts` - пусто.
- В журнале сервера при прогоне полного набора видны ожидаемые `Request error` соседних тестов (multer, отключённый тип вопроса).

## Deviations from Plan

None - plan executed exactly as written. Замечание: `actuals.commits: 0`, `plan_head_after = plan_head_before`, потому что исполнитель по правилу пользователя не коммитит; изменения в рабочем дереве, коммитит ведущая сессия. Тесты написаны сразу полным файлом после кода трёх задач (а не по задачам); итоговый набор проверок соответствует `<behavior>` и приёмке всех трёх задач.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности вне `<threat_model>`: все четыре маршрута под `sessionRequired()`, получатель берётся только из `req.authUser.id`, item собирается белым списком (T-10-12, T-10-13, T-10-15, T-10-16 покрыты тестами).

## Файлы к коммиту

- Создано: `app/server/src/services/notifications/read.ts`, `cursor.ts`, `kinds.ts`, `app/server/src/routes/notifications.ts`, `app/server/src/routes/notifications.test.ts`
- Изменено: `app/server/src/services/notifications/index.ts`, `app/server/src/routes/index.ts`, `app/server/route-inventory.txt`

## Self-Check: PASSED
