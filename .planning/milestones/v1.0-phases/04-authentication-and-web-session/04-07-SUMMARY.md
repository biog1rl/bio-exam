---
phase: 04-authentication-and-web-session
plan: 07
subsystem: auth
tags: [session, refresh-rotation, replay, revocation, d-07, d-08, d-16, vitest, playwright]
status: complete
deferred_human_gate: true

requires:
  - phase: 04-authentication-and-web-session
    provides: "04-06: модуль services/session (openSession, rotateRefreshToken, revokeSession, endSession, loadSessionUser, SessionStoreError), access с sid, req.authUser.sessionId; 04-01: auth-app.ts, KNOWN_DEFECTS"
provides:
  - "REFRESH_REUSE_WINDOW_MS = 30_000; исходы rotateRefreshToken: rotated, reused, replay, rejected"
  - "revokeUserSessions(userId, { exceptSessionId?, reason }, tx?) — число отозванных сессий, токены отозванных сессий получают revoked_at"
  - "POST /api/users/:id/sessions/revoke (routes/users/sessions.ts) под users.edit, ответ { ok, revoked }"
  - "accessExpiresAt (ISO 8601 UTC) в ответах login, refresh (rotated и reused), /api/auth/me; req.authUser.accessExpiresAt"
  - "Отзыв сессий при смене пароля (кроме текущей) и деактивации"
  - "Удалён middleware/auth/basic-admin.ts и ключи ADMIN_LOGIN, ADMIN_PASSWORD_HASH, ADMIN_PASSWORD"
affects: [04-08, 04-10, 04-11, 04-12, 04-14]

actuals:
  tokens: 14500
  tasks: 3
  commits: 0
plan_head_before: 806c6d448c2fd89979959748a2de9a502dca5387
plan_head_after: 806c6d448c2fd89979959748a2de9a502dca5387

tech-stack:
  added: []
  patterns:
    - "Неудачный захват refresh классифицируется в той же транзакции: проигравший UPDATE ждёт блокировку строки, после commit победителя следующий SELECT видит used_at; окно и проверка использованного преемника считаются в SQL через now()"
    - "Коррелированный подзапрос в drizzle-select пишется с явным именем внешней таблицы: колонка через ${table.col} рендерится без квалификатора и привязывается к таблице подзапроса"
    - "Проверка содержимого лога req.log: vi.spyOn(logger, 'warn') на корневом pino-логгере, импортированном динамически после startAuthApp (дочерние логгеры pino-http наследуют warn по прототипу)"

key-files:
  created:
    - app/server/src/routes/users/sessions.ts
    - app/server/src/routes/auth/session-revocation.test.ts
  modified:
    - app/server/src/services/session/index.ts
    - app/server/src/routes/auth/refresh.ts
    - app/server/src/routes/auth/login.ts
    - app/server/src/routes/auth/me.ts
    - app/server/src/middleware/auth/session.ts
    - app/server/src/routes/users/profile.ts
    - app/server/src/routes/users/index.ts
    - app/server/src/routes/auth/refresh-rotation.test.ts
    - app/server/src/routes/auth/auth-known-defects.test.ts
    - app/server/.env.example
    - app/server/README.md
  deleted:
    - app/server/src/middleware/auth/basic-admin.ts

key-decisions:
  - "Решение исполнителя (автономно): reused и replay определяются только для токена, который не отозван, не истёк и привязан к живой сессии активного пользователя; иначе rejected без отзыва. Пользователь неактивен → rejected, а не replay"
  - "Решение исполнителя (автономно): смена пароля обновляет хэш и отзывает остальные сессии в одной транзакции (revokeUserSessions с tx)"
  - "Discretion: троттлинг входа к смене пароля не подключается, остаётся in-memory лимитер rateLimiter('password-change')"
  - "Discretion: basic-admin удалён — codegraph impact requireAdminBasic показал 0 вызывающих"

patterns-established:
  - "Сдвиг used_at в прошлое SQL-запросом в тесте вместо ожидания 30 с"

requirements-completed: []

duration: 25min
completed: 2026-10-04
---

# Phase 4 Plan 07: окно гонки refresh 30 с, replay с отзывом сессии, отзыв при смене пароля, деактивации и действием администратора Summary

**Повтор использованного refresh-токена в течение 30 с (если преемник ещё не использован) получает только новый access той же сессии. Более поздний повтор или повтор после использования преемника отзывает сессию с `replay` и пишет `refresh_replay` в лог без токенов. Смена пароля, деактивация и новый маршрут `POST /api/users/:id/sessions/revoke` отзывают сессии вместе с их refresh-токенами. login, refresh и `/api/auth/me` отдают `accessExpiresAt`. Мёртвый `basic-admin` удалён.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** ~25 мин
- **Completed:** 2026-10-04T07:35Z
- **Tasks:** 3/3
- **Files:** 2 созданы, 11 изменены, 1 удалён

## Accomplishments

- `services/session/index.ts`:
  - `REFRESH_REUSE_WINDOW_MS = 30_000`, константа в коде, из env не читается.
  - `rotateRefreshToken`: если условный захват не нашёл строку, `classifyRepeat` в той же транзакции ищет токен по хэшу (не отозван, не истёк). Нет токена, нет `session_id`, токен не использован, сессия отозвана или пользователь неактивен → `rejected`. `used_at > now() - 30 s` и нет токена этой сессии с `created_at` позже и `used_at IS NOT NULL` → `reused`: новый access той же сессии, `last_refreshed_at` не меняется, refresh не выпускается. Иначе `revokeSession(sessionId, 'replay', tx)` → `replay` с `userId` и `sessionId`. Захват по-прежнему ставит только `used_at`.
  - `revokeUserSessions(userId, { exceptSessionId?, reason }, tx?)`: `UPDATE auth_sessions … RETURNING id`, затем `revoked_at` неотозванным токенам этих сессий (R3). Возвращает число отозванных сессий. Без `tx` открывает свою транзакцию. Ошибки оборачиваются в `SessionStoreError`.
- `refresh.ts`: `rotated` → обе cookie; `reused` → только access-cookie (R4: окно отдаёт только access, дизайн не менялся); `replay` → `req.log?.warn?.({ userId, sessionId, event: 'refresh_replay' }, …)` и 401; `rejected` → 401. Тело 200 — `{ ok: true, accessExpiresAt }`.
- `login.ts`: тело `{ ok: true, accessExpiresAt }`.
- `session.ts`: `SessionUser.accessExpiresAt?: Date | null` из `exp` проверенного access; `me.ts` отдаёт верхнеуровневое `accessExpiresAt`.
- `profile.ts`: смена пароля в одной транзакции обновляет хэш и вызывает `revokeUserSessions(userId, { exceptSessionId: req.authUser.sessionId, reason: 'password_change' }, tx)`.
- `users/index.ts`: в транзакции `PATCH /:id` при `body.isActive === false` — `revokeUserSessions(id, { reason: 'deactivated' }, tx)`. `isActive: true` и смена ролей сессии не отзывают. `sessionsRouter` смонтирован через `router.use('/', …)` до маршрутов `/:id`.
- `routes/users/sessions.ts`: `POST /:id/sessions/revoke` → `validateUUID('id')`, `sessionRequired()`, `requirePerm('users', 'edit')`; 404 `ERROR_MESSAGES.USER_NOT_FOUND`; ответ `{ ok: true, revoked }`, повтор `{ ok: true, revoked: 0 }`. Других данных о сессиях ответ не раскрывает.
- `basic-admin.ts` удалён; из `app/server/.env.example` удалены `ADMIN_LOGIN`, `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD` с комментарием, `ADMIN_BOOTSTRAP_*` на месте.
- `app/server/README.md`, «Правила доступа»: серверная сессия, access с `sid` и сроком `ACCESS_TOKEN_EXPIRES_SEC` (900 по умолчанию, 60…3600), `accessExpiresAt`, одноразовый скользящий refresh `REFRESH_TOKEN_EXPIRES_DAYS`, окно 30 с и replay, четыре пути отзыва, роли и права из БД на каждом запросе через `src/services/access-policy`, ошибка базы прав → ошибка. Новых команд `yarn …` нет.

## Задачи

1. **Task 1 (tracer).**
   - RED: обновлённый последовательный повтор и пять новых проверок окна/replay, плюс AUTH-05 без `test.fails`: `Tests 7 failed | 25 passed | 1 expected fail (33)`. Зелёной уже была проверка «повтор токена из отозванной сессии: 401».
   - Первый GREEN: 1 красный — «преемник уже использован» давал 200. Причина: drizzle отрендерил `${refreshTokens.sessionId}` внутри `EXISTS (… FROM refresh_tokens successor …)` без имени таблицы, колонка привязалась к `successor`. Подзапрос переписан с `refresh_tokens.session_id` / `refresh_tokens.created_at`.
   - Проверка плана сначала вернула код 3: литерал `'AUTH-05-parallel-refresh'` остался аргументом `defectTest`. Проверка переписана в обычный `test('AUTH-05-parallel-refresh: два одновременных refresh одним токеном дают ровно одного преемника', …)`.
   - Гейт tracer: `vitest run refresh-rotation auth-known-defects auth-characterization` → `Test Files 3 passed (3)`, `Tests 59 passed | 1 expected fail (60)`; проверка печатает `reuse window 30s`. Характеризация 04-01 не менялась.
2. **Task 2 (TDD).**
   - RED: `session-revocation.test.ts` написан до реализации: `Tests 6 failed | 1 passed (7)`. Зелёной была только «смена ролей без isActive сессии не отзывает».
   - GREEN: `vitest run src/routes/auth src/routes/users src/services/session` → `Test Files 6 passed (6)`, `Tests 95 passed | 1 expected fail (96)`; `typecheck` rc=0. Характеризация и parity 04-04 зелёные без изменения ожиданий.
3. **Task 3.** `basic-admin` удалён, README переписан, полный прогон ниже.

## codegraph impact

- `rotateRefreshToken` (`services/session/index.ts`), 6 символов: `routes/auth/refresh.ts` (`POST /api/auth/refresh`), `routes/index.ts`; web: `components/providers/AuthProvider.tsx` `AuthProvider`, `lib/auth/refresh.ts` `tryRefreshSession`. Web читает только статус и cookie; новое поле тела аддитивно.
- `PATCH /api/users/:id` (`routes/users/index.ts:134`): 1 символ, вызывающих в графе нет; в web вызывается из `components/users/dialogs/EditUserDialog.tsx` (два `PATCH`).
- `POST /api/users/profile/password` (`routes/users/profile.ts:117`): 1 символ; в web — `app/(internal)/(protected)/profile/ProfileClient.tsx:192`.
- `requireAdminBasic` (`middleware/auth/basic-admin.ts:15`): 1 символ (сама функция), вызывающих нет. `rg` по репозиторию (без `node_modules`, `.planning`) после удаления: `ADMIN_LOGIN|ADMIN_PASSWORD_HASH|ADMIN_PASSWORD|basic-admin|requireAdminBasic|adminUser` — 0 совпадений.

## codegraph affected (D-22)

По 8 исходным файлам плана — 31 файл:
- серверные тесты: `auth-characterization`, `auth-known-defects`, `me-requirePerm-parity`, `refresh-rotation`, `session-revocation`, `access-routes`, `exam-flow`, `uploads`, `cookies.test.ts`;
- серверные модули: `routes/tests/assignments.ts`, `index.ts`, `public.ts`;
- 11 файлов `app/web/app/(internal)/(protected)/admin/tests/**`, `app/web/components/tests/MdxRenderer.tsx`, `TestRunner.tsx`, `app/web/lib/auth/getServerMe.test.ts`, `app/web/lib/tests/api.ts`;
- `e2e/fixtures/exam.ts`, `e2e/tests/auth.spec.ts`, `authoring.spec.ts`, `review.spec.ts`.

Серверные и web-файлы прогнаны в `yarn verify`, e2e — в `yarn e2e`.

## KNOWN_DEFECTS после плана

1 имя: `AUTH-06-foreign-ip` (до 04-08). `AUTH-05-parallel-refresh` — обычный зелёный `test`.

## Verification

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/auth src/routes/users src/services/session` → `Tests 95 passed | 1 expected fail (96)`.
- `yarn verify` → `yarn verify: OK`, все 8 шагов `passed`:
  - server: `Test Files 19 passed`, `Tests 404 passed | 1 expected fail (405)`;
  - web `190 passed`, exam-core `498 passed`, rbac `2 passed`, script-tests `pass 137`, `fail 0`;
  - lint server: 5 предупреждений, web: 66, ошибок 0; число предупреждений сервера то же, что после 04-06.
- `yarn e2e` → rc=0, `122 passed (38.9s)`. Ожидаемые падения `test.fail` — по 3 на `chromium-desktop` и `chromium-mobile`: D1 (`review.spec.ts:303`), D8 (`session.spec.ts:51`), D3 (`session.spec.ts:86`). Неожиданных падений и 401 нет, значит общий `storageState` не попал в replay (лог Express в вывод `yarn e2e` не попадает, поэтому вывод сделан по результатам тестов).
- `cd app/server && node vercel-build.cjs` → `=== Build completed successfully! ===`.
- `rg -n "ADMIN_LOGIN|ADMIN_PASSWORD_HASH|ADMIN_PASSWORD=" app/server` → ничего.
- `git status --porcelain --untracked-files=all` — только файлы из `files_modified` плана.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Коррелированный подзапрос преемника**
- **Found during:** Task 1 (GREEN)
- **Issue:** drizzle рендерит колонку из `${refreshTokens.sessionId}` в select без квалификатора, внутри `EXISTS (… FROM refresh_tokens successor …)` она привязалась к `successor`, и проверка «преемник использован» всегда была ложной.
- **Fix:** в подзапросе явные `refresh_tokens.session_id`, `refresh_tokens.created_at`.
- **Files modified:** `app/server/src/services/session/index.ts`

**2. [Rule 3 - Blocking] AUTH-05 как обычный test**
- **Found during:** Task 1 (проверка плана, код 3)
- **Issue:** при `defectTest('AUTH-05-parallel-refresh', …)` литерал оставался в файле, проверка плана его запрещает.
- **Fix:** `test('AUTH-05-parallel-refresh: …', …)`, тело проверки не менялось.
- **Files modified:** `app/server/src/routes/auth/auth-known-defects.test.ts`

Отклонения по правилам исполнения:
- `root-pin.sh` отклонён правами. Вместо него проверено, что `git rev-parse --show-toplevel` = `/Users/kdvornichenko/bio-exam`; запись шла по абсолютным путям внутри корня.
- Коммиты RED/GREEN не делались (правило пользователя). Последовательность соблюдена по сути: 7 красных до реализации Task 1, 6 красных до реализации Task 2.

## Threat Flags

Новой поверхности сверх `<threat_model>` нет. T-4-23…T-4-26 закрыты тестами `refresh-rotation.test.ts` и `session-revocation.test.ts`. Существующая утечка cookie в лог `pinoHttp` (`deferred-items.md`) не тронута. Объект события `refresh_replay` содержит только `userId`, `sessionId`, `event`, тест проверяет отсутствие в нём токенов и хэшей. Но строка пишется через `req.log`, а это дочерний логгер `pinoHttp` с привязкой `req`, поэтому в строку попадает `req.headers.cookie` со значениями `bio_exam_session` и повторённого `refresh_token`. Код не менялся: план предписывает `req.log?.warn?.(…)`, правка `redact` отложена до ревью фазы; пункт дописан в `deferred-items.md`.

## Deferred human verification

- CONTEXT `<specifics>` п. 4: повтор refresh позже 30 с отзывает сессию. Потерянный ответ ротации (оборванная навигация, перезагрузка на холодном старте, RSC-prefetch) оставляет браузер со старым refresh-токеном; ответ `reused` в окне 30 с даёт только access, а следующий refresh после истечения access (~15 мин) попадает в replay, и пользователь выходит на этом устройстве, в том числе посреди работы. Дизайн не менялся. Нужно согласие на такую цену строгой ротации. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- CONTEXT `<specifics>` п. 7: поле `accessExpiresAt` в ответах login, refresh, `/api/auth/me`; маршрут `POST /api/users/:id/sessions/revoke` под `users.edit`. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- CONTEXT `<specifics>` п. 8: выход завершает сессию сразу; смена пароля завершает остальные сеансы; деактивация выкидывает на следующем запросе. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- CONTEXT `<specifics>` п. 11 (часть): из `app/server/.env.example` удалены `ADMIN_LOGIN`, `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD`; до деплоя убрать их из env server-проекта Vercel, если заданы (код их больше не читает). Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Коммит файлов плана делает пользователь. Не выполнено, ждёт пользователя; исполнитель не одобрял.

## Файлы к коммиту

Новые:
- `app/server/src/routes/users/sessions.ts`
- `app/server/src/routes/auth/session-revocation.test.ts`

Изменённые:
- `app/server/src/services/session/index.ts`
- `app/server/src/routes/auth/refresh.ts`
- `app/server/src/routes/auth/login.ts`
- `app/server/src/routes/auth/me.ts`
- `app/server/src/middleware/auth/session.ts`
- `app/server/src/routes/users/profile.ts`
- `app/server/src/routes/users/index.ts`
- `app/server/src/routes/auth/refresh-rotation.test.ts`
- `app/server/src/routes/auth/auth-known-defects.test.ts`
- `app/server/.env.example`
- `app/server/README.md`

Удалённые:
- `app/server/src/middleware/auth/basic-admin.ts`

`.planning/` игнорируется git.

## Known Stubs

Нет.

## Self-Check: PASSED

- FOUND: `app/server/src/routes/users/sessions.ts`, `app/server/src/routes/auth/session-revocation.test.ts`
- DELETED: `app/server/src/middleware/auth/basic-admin.ts`
- Коммиты: 0 (правило пользователя), HEAD не менялся (806c6d4)
