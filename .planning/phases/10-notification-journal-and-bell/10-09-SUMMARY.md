---
phase: 10-notification-journal-and-bell
plan: 09
subsystem: api
tags: [notifications, publication, transactions, drizzle]
status: complete

requires:
  - phase: 10-notification-journal-and-bell
    provides: recordNotifications, visibleTestTitle с FOR SHARE, testAssignedInputs (план 10-02)
provides:
  - recordTestPublished и его реэкспорт из services/notifications
  - updateTestSettings: обе ветви в транзакции, событие test.assigned при переходе is_published false -> true
  - publish-notifications.test.ts
affects: [10-03, 10-04]

actuals:
  tokens: 12000
  tasks: 3
  commits: 0
plan_head_before: 92b4abf
plan_head_after: 92b4abf

key-files:
  created:
    - app/server/src/routes/tests/publish-notifications.test.ts
  modified:
    - app/server/src/services/notifications/producers/test-assigned.ts
    - app/server/src/services/notifications/index.ts
    - app/server/src/services/question-content/relocate.ts

key-decisions:
  - "D-18 вместо рекомендации RESEARCH Pattern 5: назначение черновика события не пишет, публикация (is_published false -> true) в своей транзакции пишет test.assigned каждому уже назначенному с тем же dedupe_key test.assigned:<testId>"
  - "Тест, опубликованный в выключенной теме, событий назначенным не даёт и после включения темы: решение (отложено), не ошибка"
  - "recordTestPublished единственное место модуля, читающее test_assignments (список получателей через tx, не проверка доступа)"

completed: 2026-10-06
---

# Phase 10 Plan 09: события публикации теста Summary

`PATCH /api/tests/:id/settings` при переходе `is_published` false -> true в транзакции публикации пишет `test.assigned` каждому уже назначенному ученику с названием на момент публикации; сбой записи события откатывает публикацию.

## Что сделано

- Task 1 (tracer): `recordTestPublished(tx, { testId, actorId })` в `producers/test-assigned.ts`: `visibleTestTitle` после обновления строки (видит опубликованное название, `null` для выключенной темы), получатели из `test_assignments` через `tx` без публикующего, без повторов, по возрастанию, входы через `testAssignedInputs`. Реэкспорт из `index.ts`. Ветка `updateTestSettings` без переноса переведена в `db.transaction` (прежнее условие `id/slug/topicId/version`, прежний 409 внутри колбэка).
- Task 2: ветка с переносом пишет событие внутри колбэка `relocateQuestionObjects` после `switchPointers` и обновления поисковых документов; сбой откатывает транзакцию, прежний `catch` удаляет скопированные объекты.
- Task 3: тесты отката (500, `is_published = false`, версия и slug прежние, событий нет; обе ветви) и гонки с `Client`, держащим `UPDATE tests`.

## CodeGraph

- `codegraph impact updateTestSettings` (сервер): 4 символа, `PATCH /:id/settings` в `routes/tests/admin/tests-core.ts` и `services/question-content/index.ts`; сигнатура и ответы не менялись.
- `codegraph affected` по файлам плана: серверные тесты `routes/tests/*`, `question-content/*`, `db/*`; прогнан весь серверный набор.

## Писатели tests.is_published и решение по каждому

- `updateTestSettings` (`relocate.ts`, единственный вызов `PATCH /api/tests/:id/settings`): единственный путь черновик -> опубликованный, событие пишется в обеих ветвях.
- `createTestWithQuestions` (`write.ts`, `POST /api/tests/save`): новая строка, назначений нет, производитель не нужен.
- `createReceiver` (`move.ts`): новая строка с `isPublished: false`, события нет.
- `scoring-rules.ts`, `update(tests)` в `write.ts` и `remove.ts`: публикацию не трогают.
- `scripts/e2e-seed.ts`, `scripts/bench/seed.ts`, фикстуры `test-support`: пишут `tests` напрямую, событий не создают.
- Пути восстановления из ZIP или импорта тестов в сервере нет (`export.ts` только читает).

## Проверки

- `publish-notifications.test.ts`: 9 passed (публикация назначенным, повторное сохранение, снятие и повторная публикация `ref_seq = 2`, публикующий назначен сам себе, выключенная тема, перенос с `assetsMoved`, откат обеих ветвей триггером, гонка).
- Мутационная проверка гонки: без `.for('share')` в `visibleTestTitle` случай гонки красный («назначение не дождалось блокировки строки теста»); код восстановлен.
- Пять файлов плана (`publish-notifications`, `assignment-notifications`, `relocate.test`, `question-relocation.characterization`, `teacher-zone-tests.matrix`): 206 passed.
- `node --test scripts/teacher-zone-guards.test.mjs scripts/attempt-integrity-guards.test.mjs`: 27 pass, 0 fail.
- Полный серверный набор под `with-test-db`: 96 файлов, 1899 тестов, все зелёные (на момент 10-02: 94 файла, 1857; прирост включает 10-03 и 9 тестов этого плана).
- `yarn verify`: `yarn verify: OK`.
- `10-plan-files.cjs check 10-09`: `10-09 changed only its files`.
- `grep -rl testAssignments app/server/src/services/notifications` вне `producers/test-assigned.ts` пуст; модульный `db` в производителе не импортируется.

## Deviations from Plan

None - plan executed exactly as written. Дополнительно (сверх плана) добавлен случай отката публикации в ветке с переносом. `actuals.commits: 0`: исполнитель не коммитит, изменения в рабочем дереве.

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей: маршрут, проверки доступа и ответы не менялись.
