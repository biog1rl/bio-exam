---
phase: 10-notification-journal-and-bell
plan: 04
subsystem: api
tags: [notifications, deep-link, access-recheck, express]
status: complete

requires:
  - phase: 10-notification-journal-and-bell
    provides: ownedBy, KINDS, TEST_ASSIGNED_KIND, роутер /api/notifications (планы 10-02, 10-03)
provides:
  - openNotification, OpenResult (services/notifications/open.ts)
  - OpenContext, kindOpenHandler, обработчик open вида test.assigned (kinds.ts)
  - маршрут GET /api/notifications/:id/open
affects: [10-05, 10-07]

requirements-completed: [NOTIF-02, NOTIF-06]

actuals:
  tokens: 14000
  tasks: 3
  commits: 0

key-files:
  created:
    - app/server/src/services/notifications/open.ts
    - app/server/src/routes/notification-open.test.ts
  modified:
    - app/server/src/services/notifications/kinds.ts
    - app/server/src/services/notifications/index.ts
    - app/server/src/routes/notifications.ts
    - app/server/route-inventory.txt

key-decisions:
  - "Отметка прочтения идёт одним UPDATE ... RETURNING до проверки доступа и остаётся при любом исходе; обработчик вида после этого заново решает доступ"
  - "Любой отказ (чужое, нет события, не uuid, нет обработчика вида, не тот subject, 404 и 403 checkAttemptAccess) сводится в один ответ 403 { error: 'NO_ACCESS' }"
  - "Модуль не знает про Request: маршрут передаёт canReadTest: (testId) => canReadTest(req, testId)"
---

# Phase 10 Plan 04: глубокая ссылка уведомления Summary

`GET /api/notifications/:id/open` отмечает своё событие прочитанным и заново проверяет право на объект обработчиком вида (`checkAttemptAccess` для `test.assigned`); успех - 200 `{ href: '/tests/<topicSlug>/<slug>' }`, любой отказ - 403 ровно `{ error: 'NO_ACCESS' }`.

## Что сделано

- Task 1 (tracer): обработчик `open` вида `test.assigned` в `kinds.ts` (`OpenContext`, `kindOpenHandler`), `open.ts` (`openNotification`), маршрут `GET /:id/open` последним в `routes/notifications.ts`, реэкспорт в `index.ts`, перегенерированный `route-inventory.txt`, первый тест открытия назначенного теста.
- Task 2: тесты потери доступа (снятие назначения, снятие публикации, отключение темы, удаление теста), выхода из группы (D-09), чужого, несуществующего и неверного по формату id, неизвестного вида, персонала и субъекта не теста, 401. Правок `open.ts`/`kinds.ts` по итогам тестов не потребовалось.
- Task 3: охранные тесты, серверный набор, `yarn verify`, сверка файлов плана.

## CodeGraph

- `codegraph impact checkAttemptAccess` до правки: 11 затронутых символов (шесть маршрутов `routes/tests/public.ts`, `scripts/bench/run.ts`, реэкспорт в `attempt-sessions/index.ts`). Функция не менялась; добавлен один вызывающий - обработчик `open` в `services/notifications/kinds.ts`.
- `codegraph affected` по `kinds.ts`, `open.ts`, `routes/notifications.ts`: 42 файла, почти все - веб-файлы, совпавшие по общим именам (`tests`, `notifications`); серверный набор прогнан целиком.

## diff route-inventory.txt

```
+GET /api/notifications/:id/open  sessionRequired > <anonymous>
```

Строка вставлена после `POST /api/notifications/:id/read`, перед `GET /api/sidebar`.

## Расхождение критерия успеха 3 ROADMAP с D-09

Критерий 3 ROADMAP называет «student left the group» потерей права доступа к ссылке. По D-09 и по коду доступ даёт строка `test_assignments`, а не членство в группе: групповое назначение разворачивается в индивидуальные строки при назначении и после выхода ученика из группы остаётся. Тест `group leave keeps access while the assignment exists (D-09)` фиксирует фактическое поведение: после удаления строки `user_groups` открытие даёт 200 с `href`. Пути потери доступа, доказанные тестами: снятие назначения, снятие публикации, отключение темы, удаление теста; все дают одинаковый 403 `NO_ACCESS`, повторное назначение или возврат публикации снова даёт `href`.

## ADR-0006

ADR-0006 (`docs/adr/0006-enforce-authorization-by-construction.md`) сейчас черновик другой сессии и не затрагивался. При его принятии маршруты `/api/notifications/:id/*` (`read`, `open`) записываются как `self`: доступ ограничен владельцем события, а право на объект проверяет обработчик вида.

## Проверки

- `routes/notification-open.test.ts` + `route-inventory.snapshot.test.ts`: 13 тестов, зелёные (в файле открытия 11 тестов с учётом `test.each` из двух строк).
- `node --test scripts/attempt-integrity-guards.test.mjs scripts/teacher-zone-guards.test.mjs`: 27 pass, 0 fail, без правок охранных тестов.
- Серверный набор: 97 файлов, 1910 тестов, зелёные (до плана - 1899, 96 файлов).
- `yarn format:check`: зелёный. `yarn verify: OK`.
- `10-plan-files.cjs check 10-04`: `10-04 changed only its files`.

## Deviations from Plan

None - план выполнен как написан. Отличие в мелочи: в тесте персонала и субъекта не теста использован `test.each` с двумя строками вместо двух отдельных тестов (гигиена тестов).

## Known Stubs

None.

## Threat Flags

None: новая поверхность - один маршрут, описанный в threat_model плана (T-10-17 ... T-10-21).

## Файлы к коммиту

- app/server/src/services/notifications/open.ts (новый)
- app/server/src/services/notifications/kinds.ts
- app/server/src/services/notifications/index.ts
- app/server/src/routes/notifications.ts
- app/server/route-inventory.txt
- app/server/src/routes/notification-open.test.ts (новый)

## Self-Check: PASSED
