---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 16
subsystem: web/lib/session, web/providers
tags: [PLAT-03, D-19, web-locks, session-refresh, keep-alive]
requires: [11-15]
provides:
  - "Координатор обновления сессии на Web Locks с общей записью в localStorage (refresh-coordinator.ts)"
  - "Опция coordinator у createSessionClient: refreshOnce, цепочка 401 и loadMe идут через coordinate"
  - "SessionTransport.refresh(signal?) и предел 20 с на запрос refresh"
  - "Синхронизация keep-alive и me.accessExpiresAt между вкладками по событию storage"
  - "e2e PLAT-03: две вкладки одного контекста дают ровно один POST /api/auth/refresh"
affects: [11-17]
tech-stack:
  added: []
  patterns: ["seq общей записи, запомненный до отправки запроса, решает, нужен ли refresh после 401"]
key-files:
  created:
    - app/web/lib/session/refresh-coordinator.ts
    - app/web/lib/session/refresh-coordinator.test.ts
  modified:
    - app/web/lib/session/client.ts
    - app/web/lib/session/transport.ts
    - app/web/components/providers/AuthProvider.tsx
    - e2e/tests/session.spec.ts
decisions:
  - "coordinate(perform, seen?) получает seq, запомненный до отправки запроса, который вернул 401 (fetchWithSession, loadMe); keep-alive и refreshOnce передают undefined, и seq читается при вызове"
  - "Клиент получает объект coordinator ({ coordinate, readRecord }), а не голую функцию coordinate: seq до запроса читается через readRecord"
  - "Новый seq = max(seq записи, seen) + 1, чтобы после clear() запись не совпала с seq, запомненным вкладкой раньше"
  - "Отказ замка до входа в обработчик при отменённом сигнале ожидания (signal.aborted) — unavailable; иной отказ замка до входа — refresh без замка (прежнее поведение)"
  - "Удаление записи при выходе не добавлено: его делает 11-17 (PLAT-04) через SESSION_REFRESH_RECORD_KEY / clear()"
status: complete
metrics:
  duration: "~45 мин"
  completed: 2026-10-06
actuals:
  tokens: 6100
  tasks: 3
  commits: 0
plan_head_before: e58686f44fecd0a9443403164b7062e448bfa3c6
plan_head_after: e58686f44fecd0a9443403164b7062e448bfa3c6
---

# Phase 11 Plan 16: Одно обновление сессии на браузер (PLAT-03) Summary

Keep-alive, цепочка 401 и `loadMe` всех вкладок обновляют сессию под `navigator.locks.request('bio-exam:session-refresh')`; держатель замка после `ok` пишет в `localStorage['bio-exam:session-refresh']` запись `{ seq, accessExpiresAt, refreshedAt }`, а вкладка, чей запрос ушёл до этого обновления, под замком видит новый `seq` и возвращает `ok` со сроком из записи без запроса к серверу. Соседние вкладки по событию `storage` переносят keep-alive на новый срок.

## Что сделано

- `app/web/lib/session/refresh-coordinator.ts`: `SESSION_REFRESH_LOCK`, `SESSION_REFRESH_RECORD_KEY`, `REFRESH_LOCK_TIMEOUT_MS = 20_000`, `RefreshRecord`, `RefreshLocks`, `RefreshCoordinatorDeps`, `RefreshCoordinator`, `parseRefreshRecord`, `createRefreshCoordinator`, `browserRefreshCoordinator`.
  - `coordinate(perform, seen?)`: без `locks` или `storage` — `perform()`. Иначе `seenSeq = seen ?? seq записи ?? 0`, замок с `signal: timeoutSignal(20 000)`. Под замком: запись есть и `seq !== seenSeq` → `{ kind: 'ok', accessExpiresAt }` из записи; иначе `perform()`, при `ok` запись `{ seq: max(seq записи, seenSeq) + 1, accessExpiresAt, refreshedAt: now() }`. `rejected`/`unavailable` запись не меняют.
  - Отказ `locks.request` до входа в обработчик при `signal.aborted` → `unavailable` (keep-alive повторит через `REFRESH_RETRY_MS`). Проверка идёт по сигналу, а не по имени ошибки: по спецификации Web Locks запрос отклоняется причиной отмены сигнала, а у `AbortSignal.timeout` это `TimeoutError`, не `AbortError`. Другой отказ замка до входа → `perform()` без замка; ошибка изнутри обработчика пробрасывается как без координатора.
  - Чтение, запись и удаление записи — в `try`; разбор проверяет типы (`seq` — неотрицательное целое, `accessExpiresAt` — строка или `null`, `refreshedAt` — конечное число).
  - `browserRefreshCoordinator()` безопасен вне браузера (`typeof navigator`/`typeof window`, `window.localStorage` в `try`); без `localStorage` замок не используется.
- `transport.ts`: `refresh(signal?)` передаёт `signal` в `fetch`.
- `client.ts`: `performRefresh` шлёт refresh с `AbortSignal.timeout(REFRESH_LOCK_TIMEOUT_MS)` (сбой по пределу → `unavailable`); опция `coordinator`; `refreshAfter(seen)` — прежняя дедупликация `pendingRefresh` вокруг `coordinator.coordinate(performRefresh, seen)` или `performRefresh()`; `fetchWithSession` и `loadMe` запоминают `seq` до запроса; `refreshOnce()` = `refreshAfter(undefined)`. Экспорт `sessionRefreshCoordinator = browserRefreshCoordinator()`, им создаётся `sessionClient`.
- `AuthProvider.tsx`: в обработчике `storage` ключ `SESSION_REFRESH_RECORD_KEY` → `sessionRefreshCoordinator.readRecord()`; при непустом `accessExpiresAt` — `keepAliveRef.current?.update(...)` и `setMe` с новым `accessExpiresAt` (тот же вид, что `onRefreshed`). Ключи `logout`, `auth-change`, `avatar-changed` обрабатываются как раньше.
- Запись координации хранит только `seq`, `accessExpiresAt`, `refreshedAt`; токены остаются в куках `HttpOnly` (T-11-49). Проверяется тестом «замок и запись называются bio-exam:session-refresh, запись без токенов».

## Задачи

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Координатор обновления — две вкладки, один запрос | не коммитится (режим worktree) | refresh-coordinator.ts, refresh-coordinator.test.ts |
| 2 | Подключение к refreshOnce, предел запроса, синхронизация keep-alive | не коммитится | client.ts, transport.ts, AuthProvider.tsx, refresh-coordinator.test.ts |
| 3 | e2e двух вкладок, серверные тесты ротации, ворота | не коммитится | e2e/tests/session.spec.ts |

## Сценарий e2e и счётчики

`e2e/tests/session.spec.ts`, `test.describe.serial('PLAT-03: one refresh for several tabs @session')`:

1. Setup: `loginContext(browser, testInfo, 'user')` — отдельная сессия входа через API, общий storageState не трогается.
2. Две страницы контекста открывают `/dashboard`, ждут `networkidle` и кнопку колокольчика в шапке.
3. Счётчик `context.on('request')`: `POST` с путём `/api/auth/refresh`. Затем `context.clearCookies({ name: 'bio_exam_session' })`.
4. `Promise.all` кликов по колокольчику на обеих страницах (открытие поповера → `mutate()` счётчика непрочитанных и загрузка списка через модуль запросов → `apiFetch`); ожидание ответа `GET /api/notifications/unread-count` со статусом 200 на каждой странице и `networkidle`.
5. Проверки: `refreshRequests` длины 1; переходов главного фрейма на `/login` нет; обе страницы на `/dashboard`; `context.request.get('/api/auth/me')` — 200.

Итог: 2 из 2 проектов (`chromium-desktop`, `chromium-mobile`) зелёные; `--repeat-each 5` — 34 passed. Отрицательный контроль: без `coordinator` в `sessionClient` тот же тест падает на обоих проектах с `Received length: 2` (два `POST /api/auth/refresh`), после возврата строки — зелёный.

## Остаточный риск: прокси Next

Обновление в прокси Next (`app/web/proxy.ts`, при переходе по странице с истёкшим access-токеном) идёт на сервере Next, вне замка Web Locks, и запись координации не обновляет. С ним может пересечься только первый же refresh клиента в пределах `REFRESH_REUSE_WINDOW_MS` (30 с); такой повтор сервер отвечает `reused` (новый access без ротации), сессия не отзывается (RESEARCH Pattern 9). `proxy.ts` не менялся. `matcher` прокси по-прежнему исключает `api`, поэтому `/api/*` получают 401 от Express и refresh делает клиент.

## CodeGraph

- `codegraph impact createSessionClient`: `sessionClient`, `apiFetch` (`client.ts`), `AuthProvider.tsx`, `client.test.ts` (`scenario`). `client.test.ts` не менялся и зелёный.
- `codegraph affected` по `refresh-coordinator.ts`, `client.ts`, `transport.ts`, `AuthProvider.tsx`: 181 файл (весь клиентский путь запросов через `apiFetch`: страницы админки тестов, редактор, `TestRunner`, тесты `lib/assets`, `lib/drafts`, `test-editor-api` и серверные тесты маршрутов через e2e-связи). Поэтому прогнаны полный `yarn workspace @bio-exam/web test` и `yarn verify`.

## Проверки

| Проверка | Итог |
| -------- | ---- |
| `yarn workspace @bio-exam/web vitest run lib/session` | 8 files, 195 passed |
| `yarn workspace @bio-exam/web test` | до: 97 files / 1532 tests; после: 98 files / 1545 tests, все passed |
| `yarn workspace @bio-exam/web typecheck` | 0 ошибок |
| `yarn workspace @bio-exam/web lint` | exit 0, в файлах плана предупреждений нет |
| `node --test scripts/web-requests-guards.test.mjs` | pass 4, fail 0 |
| `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/auth/refresh-rotation.test.ts` | 23 passed (в том числе хотфикс 6f8642c) |
| `yarn workspace @bio-exam/web build && yarn editor:budget` | оба маршрута редактора: raw 2 607 884, gzip 730 059 при бюджете raw 2 732 396, gzip 769 896 — `editor bundle OK`, бюджет не менялся |
| `yarn e2e tests/session.spec.ts tests/login-401.spec.ts` | 38 passed (до и после правки п. 4 отклонений) |
| `yarn verify` (повтор после правки п. 4 отклонений) | `yarn verify: OK` (web 98 / 1545, server 103 / 2027, exam-core 15 / 745, rbac 2 / 37) |
| `yarn verify` (первый прогон) | `yarn verify: OK` (все шаги passed; web 98 files / 1545 tests, server 103 / 2027, exam-core 15 / 745, rbac 2 / 37) |
| `11-plan-files.cjs check 11-16` | не запускался: в режиме worktree проверку делает ведущая сессия |

- `git diff --stat HEAD -- app/server/src/routes/auth app/server/src/services/session app/web/lib/session/client.test.ts` пуст.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] seq запоминается до отправки запроса, а не при вызове refresh**
- **Found during:** Task 1-2 (разбор e2e до написания)
- **Issue:** при `seen`, прочитанном в момент вызова `refreshOnce`, запрос, ушедший со старой кукой, чей 401 пришёл уже после чужого (или своего) обновления, читает новый `seq`, под замком видит тот же `seq` и шлёт второй refresh. Открытие колокольчика даёт два запроса на вкладку (счётчик и список), поэтому «ровно один refresh» зависел бы от времени ответа (T-11-48: «проверка seq убирает лишние ротации»).
- **Fix:** `coordinate(perform, seen?)`; `fetchWithSession` и `loadMe` читают `seq` до отправки запроса и передают его; keep-alive вызывает `refreshOnce()` без `seen`. Клиент получает объект `coordinator` с `coordinate` и `readRecord` вместо голой функции `coordinate` из `<interfaces>`.
- **Files modified:** refresh-coordinator.ts, client.ts
- **Commit:** нет (режим worktree)

**2. [Rule 3 - Blocking] Роль в e2e — `'user'`, а не `'student'`**
- **Found during:** Task 3
- **Issue:** `RoleKey` в `e2e/fixtures/accounts.ts` — `'user' | 'admin' | 'teacher'`; `'student'` не прошёл бы typecheck.
- **Fix:** `loginContext(browser, testInfo, 'user')`, как в соседних тестах `session.spec.ts`.

**3. [Rule 2] Ошибка замка, отличная от AbortError, не теряет refresh**
- **Found during:** Task 1
- **Issue:** план описывает только отмену ожидания; другая ошибка `locks.request` (до входа в обработчик) иначе всплыла бы из `refreshOnce`.
- **Fix:** такая ошибка ведёт к `perform()` без замка (прежнее поведение); случай есть в табличном тесте.

**4. [Rule 1 - Bug] Предел ожидания замка распознаётся по сигналу, а не по имени AbortError**
- **Found during:** финальная проверка
- **Issue:** первая версия переводила в `unavailable` только ошибку с именем `AbortError`. В браузере `locks.request` при отмене отклоняется причиной сигнала (`TimeoutError` у `AbortSignal.timeout`), поэтому через 20 с ожидания вкладка ушла бы в ветку «refresh без замка» — ровно несериализованный refresh (T-11-50, T-11-48). Подменный `LockManager` в тесте бросал `AbortError` и ошибку не видел.
- **Fix:** сигнал ожидания хранится в переменной, в `catch` до входа в обработчик проверяется `signal.aborted`; подменный `LockManager` отклоняется `signal.reason`, как по спецификации.
- **Files modified:** refresh-coordinator.ts, refresh-coordinator.test.ts

### Допущение о браузерах

`AbortSignal.timeout` используется в `client.ts` и `browserRefreshCoordinator`. `browserslist` в репозитории не задан, действуют цели Next по умолчанию (Chrome/Edge/Firefox 111+, Safari 16.4+), где `AbortSignal.timeout` и Web Locks есть. В браузере без `AbortSignal.timeout` синхронная ошибка внутри `try` дала бы `unavailable` на каждый refresh.

### Проверка в браузере

Проверка в браузере — e2e Playwright (Chromium, профили desktop и mobile) с двумя вкладками одного контекста; ручная проверка во встроенном браузере не проводилась.

### Не сделано по правилам worktree

- `node .planning/phases/.../11-plan-files.cjs check 11-16` не запускался (11-EXEC-RULES, режим worktree).
- Удаление записи координации при выходе оставлено плану 11-17, который это явно делает (`SESSION_REFRESH_RECORD_KEY`, `clear()`).

## Файлы к коммиту

- `app/web/lib/session/refresh-coordinator.ts` (новый)
- `app/web/lib/session/refresh-coordinator.test.ts` (новый)
- `app/web/lib/session/client.ts`
- `app/web/lib/session/transport.ts`
- `app/web/components/providers/AuthProvider.tsx`
- `e2e/tests/session.spec.ts`
- `.planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-16-SUMMARY.md`

## Self-Check: PASSED

- Файлы `refresh-coordinator.ts`, `refresh-coordinator.test.ts` существуют; изменения `client.ts`, `transport.ts`, `AuthProvider.tsx`, `session.spec.ts` в рабочем дереве.
- Коммитов нет по правилам фазы (режим worktree): `commits: 0`, HEAD = `e58686f` до и после.
