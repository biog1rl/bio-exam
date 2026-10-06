---
phase: 05-attempt-integrity
plan: 04
subsystem: api
tags: [express, drizzle, access-policy, attempts, vitest]
status: complete
deferred_human_gate: true

requires:
  - phase: precondition
    provides: "services/access-policy/scope.ts (canReadTest, canReviewAttempt, testScope)"
  - phase: 07-01
    provides: "порт хранилища и in-memory адаптер (services/storage/index.ts, adapters/memory.ts)"
  - phase: 05-01
    provides: "attempt-world.ts, attempt-known-defects.test.ts"
  - phase: 05-03
    provides: "миграции 0022/0023"
provides:
  - "Модуль services/attempt-sessions: findVisibleTest, isAssignedOrPrivileged, checkAttemptAccess, visibleTestsFilter, типы AttemptTest, AttemptAccess, AttemptAccessParams"
  - "Одно правило «назначен или привилегирован» на всех семи маршрутах попытки в public.ts; списки через testScope"
  - "attempt-access-matrix.test.ts: 5 профилей × 2 теста × 7 маршрутов и 404 для невидимых тестов"
affects: [05-05, 05-06, 07]

actuals:
  tokens: 5500
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "checkAttemptAccess({ testId, userId, canReadTest: () => canReadTest(req, testId) }) → { ok, test } | { ok: false, status: 404 | 403 }; маршрут отвечает через denyAttemptAccess(res, status)"
    - "Списки: where(and(..., visibleTestsFilter({ userId, scope }))) вместо innerJoin назначений; exists по test_assignments, OR inArray(topicIds) при непустом списке"

key-files:
  created:
    - app/server/src/services/attempt-sessions/access.ts
    - app/server/src/services/attempt-sessions/index.ts
    - app/server/src/routes/tests/attempt-access-matrix.test.ts
  modified:
    - app/server/src/routes/tests/public.ts
    - app/server/src/routes/tests/exam-flow.test.ts
    - app/server/src/routes/tests/attempt-known-defects.test.ts

key-decisions:
  - "Тип TestScope в access.ts импортирован как type-only из services/access-policy/index.js; модуль attempt-sessions не импортирует express и не вызывает hasPermission"
  - "Списки фильтруются коррелированным exists по test_assignments вместо innerJoin: при дубле назначения число вопросов не удваивается, наборы тестов прежние"
  - "Импорт testScope добавлен в public.ts в Task 2, где он используется (в Task 1 был бы неиспользуемым)"
  - "Матрица: для 403/404 строк сессия создаётся insertOpenSession, у допущенных берётся из ответа /start; в 404-строках вопрос реальный (addQuestion), тема неактивного теста вставлена напрямую в БД"

requirements-completed: [ATT-01, ATT-06]

duration: 25min
completed: 2026-10-04
---

# Phase 5 Plan 04: Одно правило доступа к попытке Summary

Модуль `services/attempt-sessions/access.ts` с правилом «назначен или привилегирован» по текущей БД (`canReadTest` из `access-policy/scope.ts` или строка `test_assignments`) охраняет чтение по slug и id, историю, график, `/start`, черновик и submit; списки фильтруются через `testScope` и `visibleTestsFilter`. N1 закрыт: неназначенный пользователь получает 403, невидимый тест — 404.

## Коммит

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве worktree `wt-phase-05` (ветка `gsd/phase-05`).

## Файлы к коммиту

- `app/server/src/services/attempt-sessions/access.ts` (новый)
- `app/server/src/services/attempt-sessions/index.ts` (новый)
- `app/server/src/routes/tests/attempt-access-matrix.test.ts` (новый)
- `app/server/src/routes/tests/public.ts` (изменён)
- `app/server/src/routes/tests/exam-flow.test.ts` (изменён)
- `app/server/src/routes/tests/attempt-known-defects.test.ts` (изменён)

## Предусловие

`scope ok`: `services/access-policy/scope.ts` есть, `index.ts` реэкспортирует `canReadTest`, `canReviewAttempt`, `testScope`; `services/storage/index.ts` и `adapters/memory.ts` есть. Отпечаток до правок: `.planning/commit-snapshots/before-05-04/fingerprint.json` (0 путей, дерево было чистым). `scope.ts` в плане не менялся.

## Задачи

### Task 1 (tracer): модуль доступа и `/start`

- `access.ts`: `AttemptTest` (10 полей прежнего select GET `/tests/:id`), `findVisibleTest` (опубликован, тема активна, иначе `null`), `isAssignedOrPrivileged` (сначала `await canReadTest()`, затем строка `test_assignments` пары, `limit(1)`), `checkAttemptAccess` (видимость → 404, затем привилегия или назначение → 403).
- `index.ts` реэкспортирует функции и типы.
- `public.ts`: `denyAttemptAccess(res, status)` (404 → `{ error: 'Test not found' }`, 403 → `{ error: 'Тест не назначен' }`); в `POST /tests/:id/start` выборка теста только по `isPublished` заменена `checkAttemptAccess` (теперь проверяется и активность темы).
- Матрица `/start` (10 строк) зелёная; `ATT-01-unassigned-start` убран из `KNOWN_DEFECTS`.
- Tracer-гейт: `attempt-access-matrix.test.ts` + `attempt-known-defects.test.ts` — `Tests 19 passed | 6 expected fail (25)`; typecheck сервера код 0, без `error TS`; `no storage shell in phase 5 tests`; acceptance по `from 'express'|hasPermission` в `access.ts` — код 0.

### Task 2: правило на остальных маршрутах, списки, полная матрица

- `visibleTestsFilter({ userId, scope })`: `undefined` при `scope.all`; иначе `exists(select 1 from test_assignments where test_id = tests.id and user_id = userId)`, через `or` с `inArray(tests.topicId, topicIds)` только при непустом `topicIds`.
- GET `/tests` и GET `/topics/:slug/tests`: `testScope(req)` + `visibleTestsFilter` в `where`; `$dynamic()` и ветка `innerJoin(testAssignments)` удалены; группировка и сортировка прежние.
- GET `/topics/:topicSlug/tests/:testSlug`: поиск по slug и fallback по UUID без изменений; инлайн-проверка заменена `withTransientDbRetry('public test assignment check', () => isAssignedOrPrivileged(...))` → `denyAttemptAccess(res, 403)`.
- GET `/tests/:id`: выборка и инлайн-проверка заменены `checkAttemptAccess`, дальше `access.test`.
- GET `/tests/:id/attempts/me`, `/tests/:id/chart-data`: `checkAttemptAccess` сразу после проверки `userId` (401 остаётся первым).
- PATCH черновика: `checkAttemptAccess` после разбора тела (400 первым), поиск сессии и слияние без изменений.
- POST submit: после разбора тела выборка `testRows` заменена `checkAttemptAccess`, поля берутся из `access.test`; остальная логика без изменений.
- Импорты `hasPermission` и `testAssignments` из `public.ts` удалены.
- Матрица: 10 тестов (профиль × тест), каждый проходит семь маршрутов по порядку (по slug, по id, `/attempts/me`, `/chart-data`, `/start`, PATCH `{ questionId, value: 'a' }`, submit `{ sessionId, clientAttemptId, answers: { [questionId]: 'b' } }`) и сравнивает весь список статусов; плюс неопубликованный тест и тест неактивной темы — 404 у admin на всех семи.
- `exam-flow.test.ts`: `createTest` вставляет `test_assignments` для `studentId`; ожидания не менялись, шапка с `vi.hoisted`/`vi.mock` не тронута.
- `ATT-01-unassigned-patch` и `ATT-01-unassigned-submit` убраны из `KNOWN_DEFECTS`.

### Task 3: гейты

- `yarn verify: OK` (server `559 passed | 4 expected fail (563)`, web `502 passed | 1 expected fail (503)`).
- `yarn e2e`: `132 passed`, код 0; `✘` только у `review.spec.ts:303` «D1 — fixed in Phase 5 (SCORE-03) … @known-defect» на chromium-desktop и chromium-mobile (ожидаемое падение `test.fail`, D-24).
- Отпечаток: `05-04 changed only its files`.

## Требования

ATT-01 закрыт полностью. ATT-06 закрыт в части доступа (матрица на `test_*` в `yarn verify`); остальные части ATT-06 закрывают 05-05, 05-06 и 05-11.

## KNOWN_DEFECTS

`attempt-known-defects.test.ts`: `ATT-02-expired-restart`, `ATT-02-no-session`, `ATT-04-double-attempt`, `SCORE-03-d1-key-change` (проверка `known defects: 4`). Три проверки ATT-01 — обычные зелёные тесты.

## Затронутые символы `public.ts` (для слияния с фазой 7)

- Импорты: `type Response` из `express`; из `db/schema.js` убран `testAssignments` (импорт свёрнут в одну строку); `hasPermission` заменён на `canReadTest, testScope`; новый импорт `checkAttemptAccess, isAssignedOrPrivileged, visibleTestsFilter` из `services/attempt-sessions/index.js`. Импорт `storageService` из `services/storage/storage.js` не тронут.
- Новая функция `denyAttemptAccess` перед `withTransientDbRetry`.
- Обработчики: GET `/tests`, GET `/topics/:slug/tests`, GET `/topics/:topicSlug/tests/:testSlug` (блок проверки назначения), GET `/tests/:id` (выборка теста и проверка), GET `/tests/:id/attempts/me`, GET `/tests/:id/chart-data`, POST `/tests/:id/start` (выборка теста), PATCH `/tests/:id/sessions/:sessionId/answers`, POST `/tests/:id/submit` (выборка теста).
- Не тронуты: `buildQuestionMarkdownCandidates`, `readFirstMarkdown`, блоки чтения промптов в обработчиках по slug и по id, логика submit после выборки теста.

## CodeGraph (D-23)

В worktree нет `.codegraph/`; команды выполнены в основном дереве (индекс построен до фазы 5).

- `codegraph impact hasPermission`: `access-policy/index.ts` (`hasPermission`), `access-policy/scope.ts` (константа `scope`), `routes/tests/public.ts` — маршруты GET `/tests`, GET `/topics/:slug/tests`, GET `/topics/:topicSlug/tests/:testSlug`, GET `/tests/:id`; `routes/index.ts`. После плана `public.ts` из этого списка выходит.
- `codegraph impact canReadTest`: `AccessScope::canReadTest` (`scope-rules.ts:10`) → `scope.test.ts`; константа `canReadTest` (`scope.ts:8`) → `access-policy/index.ts`. Новый вызывающий — `public.ts` (семь маршрутов попытки).
- `codegraph node app/server/src/routes/tests/public.ts`: 901 строка, 21 символ, используется `routes/index.ts`.
- `codegraph affected` по шести файлам плана: `attempt-access-matrix.test.ts`, `attempt-known-defects.test.ts`, `exam-flow.test.ts`, `public.ts`. Дополнительно прогнаны `access-routes.test.ts`, `auth-characterization.test.ts`, `auth-known-defects.test.ts` (бьют в те же маршруты): зелёные без изменений.

## Проверки

- Task 1: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/attempt-access-matrix.test.ts src/routes/tests/attempt-known-defects.test.ts` — `Tests 19 passed | 6 expected fail (25)`.
- Task 2: тот же запуск плюс `exam-flow.test.ts`, `access-routes.test.ts`, `auth-characterization.test.ts`, `auth-known-defects.test.ts` — `Test Files 6 passed (6)`, `Tests 176 passed | 4 expected fail (180)`.
- `yarn workspace @bio-exam/server typecheck`: код 0, `error TS` нет.
- `rg`-проверка доступа: `attempt access via scope`.
- `rg`-проверка оболочки хранилища: `no storage shell in phase 5 tests`.
- Проверка множества: `known defects: 4`.
- `yarn verify: OK`; `yarn e2e`: `132 passed` (D1 ожидаемо `✘`).
- Отпечаток: `05-04 changed only its files`.
- Комментариев в новых и изменённых строках нет (в `public.ts` удалены два старых комментария вместе с заменёнными блоками проверки).

## Deviations from Plan

### Решения исполнителя (автономно)

**1. Импорт `testScope` перенесён в Task 2**
- План (Task 1 п. 4) велел импортировать `canReadTest` и `testScope`; в Task 1 `testScope` не используется, импорт добавлен в Task 2 вместе с правкой списков. Итог совпадает с планом.

**2. Тип `AttemptAccessParams` экспортирован дополнительно**
- Общий тип параметров `isAssignedOrPrivileged` и `checkAttemptAccess`; реэкспорт из `index.ts`. `testAssignments` встречается только в `access.ts`.

Других отклонений нет.

## Known Stubs

Нет.

## Threat Flags

Нет: новых маршрутов и поверхностей нет; T-5-08, T-5-09, T-5-10 закрыты правилом и матрицей.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. CONTEXT `<specifics>` п. 4 на живом окружении: неназначенный пользователь без `tests.read` получает 403 на `/start`, PATCH черновика, submit, `/attempts/me` и `/chart-data`; снятие назначения посреди попытки даёт 403 на черновик и submit.
2. Read-only SQL `attempts_without_assignment` из CONTEXT `<specifics>` п. 4 — выполняет пользователь.
3. Коммит шести файлов плана делает пользователь (оркестратор).

## Self-Check: PASSED

- Файлы `access.ts`, `index.ts`, `attempt-access-matrix.test.ts` существуют; `public.ts`, `exam-flow.test.ts`, `attempt-known-defects.test.ts` изменены (`git status`).
- Коммитов нет по правилу пользователя.
