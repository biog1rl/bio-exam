---
phase: 05-attempt-integrity
plan: 05
subsystem: api
tags: [express, drizzle, postgres, attempts, concurrency, vitest]
status: complete
deferred_human_gate: true

requires:
  - phase: 05-03
    provides: "миграция 0022: closed_at, close_reason, частичный уникальный индекс test_sessions_open_uniq"
  - phase: 05-04
    provides: "services/attempt-sessions/access.ts (checkAttemptAccess) на /start и PATCH черновика"
  - phase: 07-01
    provides: "in-memory адаптер хранилища в тестах"
provides:
  - "services/attempt-sessions/sessions.ts: GRACE_PERIOD_MINUTES, startAttemptSession, saveSessionDraft, типы SessionInfo, StartAttemptSessionParams, SaveSessionDraftParams, SaveSessionDraftResult"
  - "POST /tests/:id/start и PATCH /tests/:id/sessions/:sessionId/answers делегируют в модуль сессий"
  - "startAuthApp(prefix, { env }) с восстановлением ключей после stop"
  - "attempt-races.test.ts и attempt-time-limit.test.ts на test_* внутри yarn verify"
affects: [05-06, 05-07, 07]

actuals:
  tokens: 6200
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Просрочка сессии в SQL: (${limit}::int IS NOT NULL AND now() > started_at + make_interval(mins => ${limit}::int + ${GRACE_PERIOD_MINUTES}::int)); лимит и льгота идут параметрами"
    - "Атомарный старт: SELECT … FOR UPDATE открытой сессии → UPDATE closed_at = now(), close_reason = 'expired' при просрочке → INSERT … ON CONFLICT (test_id, user_id) WHERE submitted_at IS NULL AND closed_at IS NULL DO NOTHING → повторное чтение"
    - "Черновик: SELECT … FOR UPDATE открытой сессии (id, test_id, user_id) → слияние mergeTelemetryMaps → UPDATE с draft_updated_at = now()"

key-files:
  created:
    - app/server/src/services/attempt-sessions/sessions.ts
    - app/server/src/routes/tests/attempt-races.test.ts
    - app/server/src/routes/tests/attempt-time-limit.test.ts
  modified:
    - app/server/src/services/attempt-sessions/index.ts
    - app/server/src/routes/tests/public.ts
    - app/server/src/test-support/auth-app.ts
    - app/server/src/routes/tests/attempt-known-defects.test.ts

key-decisions:
  - "Выборка открытой сессии на /start идёт с orderBy(started_at desc).limit(1).for('update'): при индексе 0022 строка одна, сортировка страхует от неожиданного второго ряда"
  - "Если после конфликта вставки повторное чтение не нашло открытую сессию, startAttemptSession бросает Error (500), а не создаёт сессию в обход индекса"
  - "В startAuthApp ключи options.env выставляются до TEST_DATABASE_URL: адрес scratch-базы нельзя перебить через options.env"
  - "Тест PATCH в чужую сессию назначает второго студента на тест, чтобы ответ 404 шёл из saveSessionDraft, а не 403 из checkAttemptAccess"

requirements-completed: [ATT-03, ATT-05]

duration: 30min
completed: 2026-10-04
---

# Phase 5 Plan 05: Атомарный /start и черновик, закрытие просроченной сессии Summary

`/start` и PATCH черновика перенесены в `services/attempt-sessions/sessions.ts` и выполняются в транзакции с `FOR UPDATE`. Старт вставляет сессию через `ON CONFLICT DO NOTHING` по `test_sessions_open_uniq`. Просроченную сессию теста с лимитом старт закрывает как `expired` и открывает новую; просрочка считается в SQL от `now()`, льгота передаётся параметром из `GRACE_PERIOD_MINUTES`. 8 параллельных `/start` дают одну открытую сессию, а 6 + 3 параллельных PATCH не теряют полей (5 раундов).

## Коммит

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве worktree `wt-phase-05` (ветка `gsd/phase-05`).

## Файлы к коммиту

- `app/server/src/services/attempt-sessions/sessions.ts` (новый)
- `app/server/src/routes/tests/attempt-races.test.ts` (новый)
- `app/server/src/routes/tests/attempt-time-limit.test.ts` (новый)
- `app/server/src/services/attempt-sessions/index.ts` (изменён)
- `app/server/src/routes/tests/public.ts` (изменён)
- `app/server/src/test-support/auth-app.ts` (изменён)
- `app/server/src/routes/tests/attempt-known-defects.test.ts` (изменён)

## Предусловие и отпечаток

Отпечаток до правок: `.planning/commit-snapshots/before-05-05/fingerprint.json` (`fingerprint 05-05: 0 paths`, дерево чистое после c5513c9).

## Задачи

### Task 1 (tracer): атомарный `/start`

- `sessions.ts`: `GRACE_PERIOD_MINUTES = 2`; `sessionExpired(timeLimitMinutes)` — SQL-выражение `(${limit}::int IS NOT NULL AND now() > started_at + make_interval(mins => ${limit}::int + ${GRACE_PERIOD_MINUTES}::int))`. Лимит и льгота передаются параметрами, число в текст SQL не попадает (C6). Здесь же тип `SessionInfo` и `startAttemptSession` с алгоритмом из `tech-stack.patterns`. `startedAt` отдаётся ISO-строкой. Время в модуле не берётся из JS: нет ни `new Date(`, ни `Date.now(`.
- `index.ts` реэкспортирует `GRACE_PERIOD_MINUTES`, `startAttemptSession`, `SessionInfo`, `StartAttemptSessionParams`.
- `public.ts`: POST `/tests/:id/start` после `checkAttemptAccess` вызывает `res.json(await startAttemptSession({ testId, userId, timeLimitMinutes: access.test.timeLimitMinutes }))`. Прежние `findFirst` и `insert` удалены. Локальная `GRACE_PERIOD_MINUTES` в `public.ts` нужна submit и остаётся до 05-06.
- `attempt-time-limit.test.ts` (`test_attempt_time`):
  - сдвиг `started_at` на 11 минут — тот же s1 с черновиком;
  - сдвиг на 13 минут — новый s2 с пустым черновиком; у s1 `closed_at` не NULL, `close_reason = 'expired'`, `submitted_at` NULL, `draft_answers` сохранены; открытая сессия одна, всего строк две, попыток 0 (автосдачи нет);
  - тест без лимита, сдвиг на 10 дней — та же сессия.
- `ATT-02-expired-restart` удалён из `KNOWN_DEFECTS` и стал обычным зелёным тестом.
- Tracer-гейт: `attempt-time-limit` + `attempt-known-defects` + `exam-flow` — `Test Files 3 passed`, `Tests 87 passed | 3 expected fail (90)`. Typecheck сервера: код 0, `error TS` нет. Acceptance-проверка регулярным выражением (`new Date(`, `Date.now(`, число в `make_interval`) завершилась с кодом 0.

### Task 2 (TDD): черновик под блокировкой, `options.env`, гонки

- RED, до `saveSessionDraft`: прогон `attempt-races` и `attempt-time-limit` дал `Tests 2 failed | 7 passed (9)`. Упали два теста:
  - «PATCH в сессию, закрытую как expired, отвечает 404»: прежний PATCH проверял только `submitted_at` и отвечал 200;
  - «параллельные PATCH ответов и телеметрии не теряют ни одного поля»: в раунде 0 `draft_answers` не совпал с ожидаемым, поля потерялись.
- GREEN:
  - `saveSessionDraft({ testId, userId, testSessionId, questionId?, value?, telemetry? })` возвращает `'saved' | 'not_found'`. Блокирует строку `FOR UPDATE` по `id`, `testId`, `userId`, `submitted_at IS NULL`, `closed_at IS NULL`. Слияние прежнее: ответы по ключу вопроса, `draftLastQuestionId` только при ответе, телеметрия через `mergeTelemetryMaps` только при её наличии. `draft_updated_at = now()`.
  - PATCH в `public.ts` вызывает функцию, `'not_found'` отвечает 404 `{ error: 'Session not found or already submitted' }`. Прежние чтение, слияние и `update` удалены.
  - После правки 9 тестов из 9 зелёные.
- `auth-app.ts`: `startAuthApp(prefix, options: StartAuthAppOptions = {})`, тип `{ env?: Record<string, string> }`. Ключи `options.env` входят в карту `previous` до присвоения и выставляются до `vi.resetModules()`. `restoreEnv` возвращает их при `stop` и при ошибке старта. Вызовы без `options` не изменились, тесты `src/routes/auth` зелёные.
- `attempt-races.test.ts` (`test_attempt_races`, `PG_POOL_MAX: '12'`):
  - 8 параллельных `/start` × 5 раундов на новых тестах: один sessionId, одна открытая строка;
  - прямая вставка второй открытой сессии через `pgPool` отклонена с `code === '23505'`;
  - 8 параллельных `/start` поверх просроченной сессии × 5 раундов: один новый sessionId, прежняя сессия закрыта как `expired`, открытая одна, всего строк две;
  - 6 PATCH ответов и 3 PATCH телеметрии одним `Promise.all` × 5 раундов: `draft_answers` содержит все 6 ответов, `draft_telemetry` совпадает с `mergeTelemetryMaps(...отправленные)`. Максимумы полей у трёх телеметрий разные.
- `attempt-time-limit.test.ts`, строки PATCH:
  - просроченная, но не закрытая сессия — 200, ответ записан;
  - закрытая как `expired` — 404, черновик не изменился;
  - сессия другого назначенного студента — 404, черновик не записан.
- Проверка Task 2 (`attempt-races`, `attempt-time-limit`, `exam-flow`, `src/routes/auth`): `Test Files 9 passed (9)`, `Tests 187 passed (187)`. `no storage shell in phase 5 tests`. Typecheck: код 0.
- Стабильность: `src/routes/tests` прогнан трижды подряд, каждый раз `Tests 145 passed | 3 expected fail (148)`.

### Task 3: гейты

- `yarn verify: OK`: server `569 passed | 3 expected fail (572)`, web `502 passed | 1 expected fail (503)`, exam-core `498 passed`, rbac `2 passed`.
- `yarn e2e`: `132 passed`, код 0. `✘` только у `review.spec.ts:303` «D1 — fixed in Phase 5 (SCORE-03) … @known-defect» на chromium-desktop и chromium-mobile. Это ожидаемое падение `test.fail` (D-24).
- Проверка отпечатка: `05-05 changed only its files`.

## Требования

ATT-03 и ATT-05 закрыты. ATT-06 закрыт в части гонок и лимита времени: тесты на `test_*` идут в `yarn verify`. Остальные части ATT-06 закрывают 05-06 и 05-11.

## KNOWN_DEFECTS

`attempt-known-defects.test.ts`: `ATT-02-no-session`, `ATT-04-double-attempt`, `SCORE-03-d1-key-change`, ровно три id. `ATT-02-expired-restart` теперь обычный зелёный тест.

## Затронутые символы `public.ts` (для слияния с фазой 7)

- Импорт из `services/attempt-sessions/index.js`: добавлены `saveSessionDraft` и `startAttemptSession`.
- POST `/tests/:id/start`: тело после `checkAttemptAccess` заменено одним вызовом `startAttemptSession`.
- PATCH `/tests/:id/sessions/:sessionId/answers`: после `checkAttemptAccess` вызывается `saveSessionDraft`. Удалены два комментария прежнего блока.
- Не тронуты: `SaveDraftAnswerSchema`, константа `GRACE_PERIOD_MINUTES` и вся логика submit. Импорты `desc`, `isNull`, `mergeTelemetryMaps` по-прежнему используются в submit и `/attempts/me`.

## CodeGraph (D-23)

В worktree нет `.codegraph/`, поэтому команды выполнены в основном дереве по индексу, собранному до фазы 5.

- `codegraph impact testSessions`: `schema.ts` (`testSessions:495`, `testSessionsRelations:782`), `routes/tests/public.ts`, `routes/index.ts`. Новый потребитель — `services/attempt-sessions/sessions.ts`.
- `codegraph impact mergeTelemetryMaps`:
  - `exam-core/telemetry.ts`, `telemetry.test.ts`, `exam-core/index.ts`;
  - `public.ts`: маршруты PATCH `/answers` и POST `/submit`;
  - web: `TestRunner.tsx` (`hydrateFromServerSession`, `restoreSession`, `startUntimedSession`, `handleConfirmStart`, `handleRetake`), `TestPageClient.tsx`, `components/tests/telemetry.ts`.
  - Функция не менялась, в PATCH вызов перенесён в `sessions.ts`.
- `codegraph affected` по семи файлам плана, 13 файлов:
  - `routes/auth`: `auth-characterization`, `auth-known-defects`, `login-throttle`, `me-requirePerm-parity`, `refresh-rotation`, `session-revocation`;
  - `routes/tests`: `access-routes`, `attempt-known-defects`, `attempt-races`, `attempt-time-limit`, `public.ts`;
  - `access-policy/scope.test.ts`, `storage/storage-memory-default.test.ts`.
  - Все прогнаны в `yarn verify` и зелёные; `src/routes/auth` и `src/routes/tests` дополнительно прогнаны отдельно.

## Deviations from Plan

### Решения исполнителя (автономно)

1. **Дополнительные экспортируемые типы.** `StartAttemptSessionParams`, `SaveSessionDraftParams`, `SaveSessionDraftResult`, `StartAuthAppOptions` описывают параметры и результат новых функций. На поведение не влияют.
2. **Порядок env в `startAuthApp`.** Ключи `options.env` выставляются до `TEST_DATABASE_URL`, чтобы опция не могла подменить адрес scratch-базы.
3. **Дополнительные проверки в тестах.**
   - Лимит: при просрочке не создаётся попытка (запрет автосдачи); у пары после рестарта ровно две строки (строки не удаляются).
   - Гонки: всего строк одна после параллельного старта и две после старта поверх просроченной сессии; 5 раундов и для просроченной сессии.

Других отклонений нет.

## TDD Gate Compliance

Порядок соблюдён по сути, без коммитов (правило пользователя). Сначала `options.env` и тесты Task 2, затем прогон RED (2 failed | 7 passed), затем `saveSessionDraft` и GREEN (9/9). Гонки `/start` до правки PATCH были уже зелёными, потому что `/start` атомарен с Task 1 (tracer). Это ожидаемо и отражено в плане.

## Known Stubs

Нет.

## Threat Flags

Нет: новых маршрутов нет.
- T-5-11: `FOR UPDATE` и `ON CONFLICT`, тесты 8 × 5 и 23505.
- T-5-12: просрочка считается от `now()` в SQL.
- T-5-13: слияние под `FOR UPDATE`, тест 6 + 3 × 5.
- T-5-14: выборка по `test_id` и `user_id`, на чужую сессию 404.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. CONTEXT `<specifics>` п. 3 на живом окружении. `/start` закрывает просроченную сессию теста с лимитом и открывает новую; автосдачи нет; черновик закрытой сессии остаётся в строке. Число застрявших сессий на проде пользователь узнаёт read-only SQL из п. 3 (записан в 05-03 Task 4).
2. Коммит семи файлов плана делает пользователь (оркестратор).

## Self-Check: PASSED

- Есть новые файлы `sessions.ts`, `attempt-races.test.ts`, `attempt-time-limit.test.ts`. Изменены `index.ts`, `public.ts`, `auth-app.ts`, `attempt-known-defects.test.ts` (`git status`).
- Комментариев в новых и изменённых строках нет.
- Коммитов нет по правилу пользователя.
