---
phase: 04-authentication-and-web-session
plan: 06
subsystem: auth
tags: [session, jwt, refresh-rotation, cookies, logout, d-05, d-06, d-07, d-08, d-09, d-10, vitest, playwright]
status: complete
deferred_human_gate: true

requires:
  - phase: 04-authentication-and-web-session
    provides: "04-03: auth_sessions, refresh_tokens.session_id/used_at, бэкфилл 0021; 04-05: sessionOptional проверяет пользователя в БД, SessionUser = { id, login }; 04-01: auth-app.ts, характеризация, KNOWN_DEFECTS"
provides:
  - "Модуль app/server/src/services/session: readCookie, appendSetCookie, serializeSessionCookie, setSessionCookies, clearSessionCookies, ACCESS_COOKIE, REFRESH_COOKIE (cookies.ts); signAccessToken, verifyAccessToken, newRefreshToken, hashRefreshToken (tokens.ts); openSession, rotateRefreshToken, revokeSession, endSession, loadSessionUser, SessionStoreError (index.ts)"
  - "AUTH_CONFIG.accessTokenTtlSec (900 по умолчанию, 60…3600), AUTH_CONFIG.refreshTokenTtlDays, parseAccessTokenTtl"
  - "Access-JWT: sub, sid, login (без roles); запрос принимается только с живой сессией активного пользователя"
  - "req.authUser = { id, login, sessionId }; async sessionCookieFor({ id, login? }) выпускает настоящую сессию"
  - "refresh-rotation.test.ts и cookies.test.ts"
affects: [04-07, 04-08, 04-10, 04-14]

actuals:
  tokens: 10200
  tasks: 3
  commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a

tech-stack:
  added: []
  patterns:
    - "Модуль сессии не ставит cookie: маршрут вызывает setSessionCookies после возврата промиса (после commit)"
    - "Атомарный захват refresh: условный UPDATE … WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING в транзакции; отказ после захвата — откат через внутренний сигнал RotationRejected"
    - "Ошибки БД модуля оборачиваются в SessionStoreError с сообщением исходной ошибки pg, без текста запроса и параметров DrizzleQueryError (хэши не уходят в лог и в тело 500 вне production)"
    - "Очистка cookie в finally при выходе: ошибка запоминается, next(error) вызывается после finally, чтобы заголовки ещё не были отправлены"

key-files:
  created:
    - app/server/src/services/session/cookies.ts
    - app/server/src/services/session/tokens.ts
    - app/server/src/services/session/index.ts
    - app/server/src/services/session/cookies.test.ts
    - app/server/src/routes/auth/refresh-rotation.test.ts
    - .planning/phases/04-authentication-and-web-session/deferred-items.md
  modified:
    - app/server/src/config/auth.ts
    - app/server/src/middleware/auth/session.ts
    - app/server/src/routes/auth/login.ts
    - app/server/src/routes/auth/refresh.ts
    - app/server/src/routes/auth/logout.ts
    - app/server/src/test-support/http.ts
    - app/server/src/routes/uploads.test.ts
    - app/server/src/routes/tests/exam-flow.test.ts
    - app/server/src/routes/auth/auth-known-defects.test.ts
    - app/server/.env.example
    - e2e/playwright.config.ts
    - e2e/tests/session.spec.ts

key-decisions:
  - "Решение исполнителя (автономно): verifyAccessToken требует, чтобы sub и sid были UUID, и проверяет только HS256; иначе токен с подписью, но с не-UUID sid, дал бы 500 вместо анонимного запроса"
  - "Решение исполнителя (автономно): ошибки БД модуля сессии перевыбрасываются как SessionStoreError без параметров запроса (drizzle-orm 0.45 кладёт params в message DrizzleQueryError, а errorHandler вне production отдаёт message в теле 500)"
  - "Решение исполнителя (автономно): endSession отзывает и сессию из sid access-токена (в том числе истёкшего), и сессию refresh-токена, если они различаются, плюс ставит revoked_at самому refresh-токену по хэшу (покрывает старый токен без session_id); всё в одной транзакции"
  - "Решение исполнителя (автономно): отказ rotateRefreshToken после захвата (сессия отозвана, пользователь неактивен) откатывает транзакцию, used_at не расходуется"

patterns-established:
  - "Тест сбоя транзакции: триггер BEFORE INSERT/UPDATE с RAISE EXCEPTION, создаётся и удаляется через pgPool в try/finally"

requirements-completed: []

duration: 22min
completed: 2026-10-04
---

# Phase 4 Plan 06: модуль выдачи сессии, access привязан к отзываемой сессии Summary

**Access-JWT теперь несёт `sub`, `sid`, `login`, живёт 900 с и принимается только при неотозванной сессии активного пользователя. Вход создаёт `auth_sessions` и первый refresh-токен в одной транзакции. Refresh атомарно захватывает токен (`used_at`) и ставит cookie только после commit. Выход отзывает сессию и все её токены, а cookie чистит в `finally`. Чтение cookie и склейка Set-Cookie остались в одном месте: в модуле `services/session`.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** ~22 мин
- **Completed:** 2026-10-04T07:20Z
- **Tasks:** 3/3
- **Files:** 5 созданы (+ deferred-items.md), 12 изменены

## Accomplishments

- `config/auth.ts`: `parseAccessTokenTtl(raw)`. Без значения 900. Принимается только строка из цифр в диапазоне 60…3600. Всё остальное (`''`, `'15m'`, `'59'`, `'3601'`, `'60.5'`, `' 900'`) даёт ошибку с именем `ACCESS_TOKEN_EXPIRES_SEC` при импорте, во всех средах. `refreshTokenTtlDays = REFRESH_TOKEN_EXPIRES_DAYS ?? SESSION_MAX_AGE_DAYS`. Геттер `sessionMaxAgeSec` остался, но его больше никто не читает.
- `services/session/cookies.ts`: в серверном дереве это единственное место, где вызывается `setHeader('Set-Cookie')` (через `appendSetCookie`, который дописывает к уже выставленным). Атрибуты: `Path=/; HttpOnly; SameSite=Lax; Max-Age`. `Secure` ставится только при `NODE_ENV=production` и вычисляется при каждом вызове. Очистка ставит `Max-Age=0` и только `Path=/`; старого пути `/api/auth/refresh` больше нет.
- `services/session/tokens.ts`: один выпуск access и для входа, и для refresh: `{ sub, sid, login, iat, exp }`, HS256, срок из конфига. `verifyAccessToken(token, { allowExpired })` возвращает `null`, если подпись неверна, токен истёк без `allowExpired` или `sub`/`sid` не UUID. Refresh-токен: 64 случайных байта, в БД хранится sha256.
- `services/session/index.ts`:
  - `openSession` создаёт сессию и первый токен в одной транзакции.
  - `rotateRefreshToken` захватывает токен условным UPDATE. Старому токену без `session_id` создаёт сессию с id токена (`ON CONFLICT DO NOTHING`). Проверяет сессию и пользователя, вставляет преемника, обновляет `last_refreshed_at` и выдаёт новый access с тем же `sid` и `login` из `users`.
  - `revokeSession` в одной транзакции ставит `revoked_at`/`revoke_reason` сессии и `revoked_at` всем её неотозванным токенам.
  - `endSession` выполняет выход.
  - `loadSessionUser` делает один запрос `auth_sessions` join `users`.
- `session.ts`: `sessionOptional` работает через модуль (`readCookie` → `verifyAccessToken` → `loadSessionUser`). Ошибка JWT даёт анонимный запрос, ошибка БД — `next(err)`. Локальные `readCookie`, `setSessionCookie`, `clearSessionCookie` и импорт `jsonwebtoken` удалены. `SessionUser = { id, login?, sessionId }`.
- `login.ts`: `openSession`, затем `setSessionCookies`. Удалены подпись JWT с ролями, ручная склейка Set-Cookie, импорты `jsonwebtoken`, `crypto`, `userRoles`, `refreshTokens`. Блокировка и лимитер входа не тронуты (это 04-08).
- `refresh.ts`: IP-лимитер снят. Нет cookie или исход `rejected` → 401 `ERROR_MESSAGES.UNAUTHORIZED`. `rotated` → cookie, `{ ok: true }`. Исключение → `next(e)`, то есть 500 без Set-Cookie. `console.error` удалён.
- `logout.ts`: `endSession(access, refresh)`; `clearSessionCookies` выполняется в `finally`. Ошибка передаётся в `next` уже после `finally`, иначе `errorHandler` отправил бы заголовки до очистки.
- `test-support/http.ts`: `sessionCookieFor` стал `async`, динамически импортирует модуль и открывает настоящую сессию. `uploads.test.ts` и `exam-flow.test.ts` изменены только в трёх строках вызова.

## Задачи

1. **Task 1 (tracer).** Гейт до расширения:
   - `vitest run auth-characterization uploads exam-flow`: `Test Files 3 passed (3)`, `Tests 121 passed (121)`. Ожидания не менялись, включая «refresh после выхода → 401».
   - `typecheck`: rc=0.
   - Проверка печатает `one session issuer`.
2. **Task 2 (TDD).**
   - RED: `cookies.test.ts` и `refresh-rotation.test.ts` написаны до `endSession`. Прогон: `Tests 4 failed | 31 passed (35)`. Красными были ровно четыре строки выхода: отзыв сессии при выходе, выход с истёкшим access, выход только по access/только по refresh, ошибка БД при отзыве (выход ещё не трогал `auth_sessions`, поэтому вернул 200 вместо 500). Ротация, отказ транзакции, старый токен без `session_id`, отклонение access без `sid`, отозванной сессии и неактивного пользователя, claims и таблица cookie были зелёными уже после Task 1.
   - GREEN после `endSession` и переписанного `logout.ts`: `Tests 35 passed (35)`.
   - Затем `AUTH-04-logout` удалён из `KNOWN_DEFECTS`, а у названия снят суффикс «— исправляется в 04-06». `vitest run src/routes/auth src/services/session` → `Test Files 5 passed (5)`, `Tests 81 passed | 2 expected fail (83)`. Проверка печатает `known defects left: 2`.
3. **Task 3 (e2e).** У Express в e2e выставлен `ACCESS_TOKEN_EXPIRES_SEC: '3600'`. Проверка AUTH-04 стала обычным `test` с названием `AUTH-04: after logout the old access cookie is rejected @session`, у подготовки снят `@known-defect`. Проверка печатает `auth-04 flipped in e2e`. `yarn verify: OK`, `yarn e2e` rc=0.

## codegraph impact (начало плана)

- `setSessionCookie` (`session.ts:37`), 11 символов: `routes/auth/login.ts` (`POST /api/auth/login`), `routes/auth/refresh.ts` (`POST /api/auth/refresh`), `routes/auth/index.ts`, `routes/index.ts`; web-вызывающие маршрутов: `LoginPageClient.tsx` `handleSubmit`, `InviteClient.tsx` `accept`, `AuthProvider.tsx`, `lib/auth/refresh.ts` `tryRefreshSession`.
- `clearSessionCookie` (`session.ts:50`), 4 символа: `routes/auth/logout.ts` (`POST /api/auth/logout`), `routes/auth/index.ts`.
- `sessionCookieFor` (`test-support/http.ts:9`), 3 символа: `routes/tests/exam-flow.test.ts`, `routes/uploads.test.ts`.
- `sessionOptional` (`session.ts:69`), 18 символов: `sessionRequired`, `app.ts`, `index.ts`, `me-requirePerm-parity.test.ts` (входит через настоящий `/api/auth/login`, правок не потребовал), `routes/auth/invites.ts`, `routes/docs/assets.ts`, `routes/groups/index.ts`, `routes/rbac/index.ts`, `routes/search.ts`, `routes/settings.ts`, `routes/sidebar/index.ts`, `routes/tests/assignments.ts`, `routes/tests/index.ts`, `routes/tests/public.ts`, `routes/users/avatar.ts`, `routes/users/index.ts`, `routes/users/profile.ts`.
- Других выпусков JWT и Set-Cookie на сервере не было (`grep jwt.|Set-Cookie|refresh_token` по `app/server/src`).

## codegraph affected (конец плана, D-22)

По 11 файлам плана — 32 файла:
- серверные тесты: `auth-characterization`, `auth-known-defects`, `me-requirePerm-parity`, `refresh-rotation`, `access-routes`, `exam-flow`, `uploads`, `cookies.test.ts`;
- серверные модули: `routes/tests/assignments.ts`, `index.ts`, `public.ts`;
- 11 файлов `app/web/app/(internal)/(protected)/admin/tests/**`;
- `app/web/components/tests/MdxRenderer.tsx`, `TestRunner.tsx`, `app/web/lib/auth/getServerMe.test.ts`, `app/web/lib/tests/api.ts`;
- `e2e/fixtures/exam.ts`, `e2e/playwright.config.ts`, `e2e/tests/auth.spec.ts`, `authoring.spec.ts`, `review.spec.ts`, `session.spec.ts`.

Серверные и web-файлы прогнаны в `yarn verify`, e2e — в `yarn e2e`.

## KNOWN_DEFECTS после плана

2 имени: `AUTH-05-parallel-refresh` (до 04-07) и `AUTH-06-foreign-ip` (до 04-08). `AUTH-05-parallel-refresh` по-прежнему ожидаемо падает: при атомарном захвате два параллельных refresh дают `[200, 401]`, а проверка ждёт `[200, 200]`. `AUTH-04-logout` теперь обычный зелёный `test`.

## Verification

- Task 1: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/auth/auth-characterization.test.ts src/routes/uploads.test.ts src/routes/tests/exam-flow.test.ts` → `Tests 121 passed (121)`. `typecheck` rc=0. Проверка печатает `one session issuer`.
- Task 2: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/auth src/services/session` → `Test Files 5 passed (5)`, `Tests 81 passed | 2 expected fail (83)`. Проверка печатает `known defects left: 2`.
- `yarn verify` → `yarn verify: OK`:
  - все 8 шагов `passed`;
  - server: `Test Files 18 passed`, `Tests 390 passed | 2 expected fail (392)`;
  - web: `190 passed`; exam-core: `498 passed`;
  - script-tests: `pass 137`, `fail 0`;
  - lint server: 5 предупреждений, все старые (`app.ts:14`, `login.ts:9` — неиспользуемый `loginRateLimiter`, который был и раньше, только сдвинулся по строкам; `public.ts:19`, `backfill-question-search.ts:2`, `storage.ts:528`).
  - Первый прогон `yarn verify` упал на `typecheck`: фейковый `Response` в `cookies.test.ts` не подходил под `Pick<Response, …>`. Функции cookie переведены на структурный тип `CookieTarget`, второй прогон зелёный.
- `yarn e2e` → rc=0, `122 passed (38.9s)`. Ожидаемые падения `test.fail` — по 3 на каждом из проектов `chromium-desktop` и `chromium-mobile`, всего 6: D1 (`review.spec.ts:303`), D8 (`session.spec.ts:51`), D3 (`session.spec.ts:86`). AUTH-04 (`session.spec.ts:123`) теперь обычный и зелёный на обоих проектах. Неожиданных падений и 401 у тестов на `student-<проект>` после `auth.spec.ts` нет. Значит, рассуждение T3 об общем `storageState` подтвердилось: эффект миграции cookie захватывает refresh-токен, сессию не отзывает, а access живёт 3600 с.
- Проверка e2e печатает `auth-04 flipped in e2e`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Параметры запроса в ошибках БД модуля**
- **Found during:** Task 1 (проверка prohibition о токенах в логах)
- **Issue:** `DrizzleQueryError` в drizzle-orm 0.45.3 кладёт в `message` текст запроса и `params` (в том числе хэш refresh-токена). `errorHandler` пишет `err` в лог, а вне production отдаёт `message` в теле 500.
- **Fix:** функции модуля обёрнуты в `guarded()`. Ошибка перевыбрасывается как `SessionStoreError` с сообщением исходной ошибки pg и её `code`. В логе прогона видно только `session store: blocked by test_block_…`.
- **Files modified:** `app/server/src/services/session/index.ts`

**2. [Rule 2 - Correctness] Проверка формата sub/sid**
- **Found during:** Task 1
- **Issue:** подписанный токен с `sid`, который не является UUID, дал бы ошибку `invalid input syntax for type uuid` в `loadSessionUser`, то есть 500 вместо анонимного запроса.
- **Fix:** `verifyAccessToken` возвращает `null`, если `sub` или `sid` не UUID; алгоритм ограничен HS256.
- **Files modified:** `app/server/src/services/session/tokens.ts`

**3. [Rule 1 - Bug] Порядок next(e) и finally в logout**
- **Found during:** Task 1 (до записи кода)
- **Issue:** `next(e)` внутри `catch` синхронно вызывает `errorHandler`, тот отправляет ответ, и `clearSessionCookies` в `finally` упал бы с `ERR_HTTP_HEADERS_SENT`.
- **Fix:** ошибка запоминается, cookie чистятся в `finally`, `next(error)` вызывается после блока. Тест с триггером подтверждает, что ответ 500 несёт обе cookie с `Max-Age=0`.
- **Files modified:** `app/server/src/routes/auth/logout.ts`

Отклонения по правилам исполнения:

- `root-pin.sh` отклонён правами. Вместо него проверено, что `git rev-parse --show-toplevel` = `/Users/kdvornichenko/bio-exam`; запись шла только по абсолютным путям внутри корня.
- Коммиты RED/GREEN не делались (правило пользователя). Последовательность соблюдена по сути: 4 красных теста до `endSession`.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: info-disclosure (pre-existing) | `app/server/src/lib/logger.ts`, `app/server/src/app.ts` | При ошибке запроса `errorHandler` логирует `req` целиком, включая заголовок `Cookie` со значениями `bio_exam_session` и `refresh_token` (`pinoHttp` без `redact`). Так было и до плана, файлы вне `files_modified`. Модуль и маршруты сами токены не пишут. Записано в `deferred-items.md` с предлагаемой правкой `redact`. Prohibition «токены и значения cookie не пишутся в логи» для модуля выполнен; для логгера приложения нет. |

T-4-16…T-4-20 закрыты тестами `refresh-rotation.test.ts`. T-4-22 принят: IP-лимитер refresh снят.

## Deferred human verification

- CONTEXT `<specifics>` п. 1 (часть): access теперь 15 минут; `ACCESS_TOKEN_EXPIRES_SEC` принимается только в диапазоне 60…3600, иначе сервер не стартует. До деплоя проверить env server-проекта Vercel: значение `ACCESS_TOKEN_EXPIRES_SEC` больше 3600 (прежний пример в `.env.example` был 3600, старый код по умолчанию брал 30 дней) остановит сервер. Пункт входит в чек-лист выкатки 04-14. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- CONTEXT `<specifics>` п. 7 (часть): refresh больше без IP-лимита. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- После деплоя все access-токены старого формата (без `sid`) отклоняются. Пользователей спасает refresh по старому токену: сессию даёт бэкфилл 0021 или ветка «токен без session_id». Откат — редеплой прежнего сервера; прежний код отклонит токены отозванных сессий, потому что `revokeSession` ставит им `revoked_at`. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Web (`app/web/lib/auth/server/getMeData.ts`) ещё сам проверяет JWT без `sid` и без проверки сессии; это убирает 04-14. Браузерные `/api/*` идут в Express через `rewrites.beforeFiles`, поэтому e2e AUTH-04 проверяет сервер. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Решить, когда закрывать утечку cookie в логе ошибок (`deferred-items.md`). Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Коммит файлов плана делает пользователь. Не выполнено, ждёт пользователя; исполнитель не одобрял.

## Файлы к коммиту

Новые:
- `app/server/src/services/session/cookies.ts`
- `app/server/src/services/session/tokens.ts`
- `app/server/src/services/session/index.ts`
- `app/server/src/services/session/cookies.test.ts`
- `app/server/src/routes/auth/refresh-rotation.test.ts`

Изменённые:
- `app/server/src/config/auth.ts`
- `app/server/src/middleware/auth/session.ts`
- `app/server/src/routes/auth/login.ts`
- `app/server/src/routes/auth/refresh.ts`
- `app/server/src/routes/auth/logout.ts`
- `app/server/.env.example`
- `e2e/playwright.config.ts`
- `app/server/src/test-support/http.ts`, `app/server/src/routes/uploads.test.ts`, `app/server/src/routes/tests/exam-flow.test.ts` (файлы фаз 1–3, ещё не закоммичены)
- `app/server/src/routes/auth/auth-known-defects.test.ts` (файл 04-01, ещё не закоммичен)
- `e2e/tests/session.spec.ts` (файл 04-02, ещё не закоммичен)

`.planning/` (SUMMARY, `deferred-items.md`) игнорируется git.

## Known Stubs

Нет.

## Self-Check: PASSED

- FOUND: `app/server/src/services/session/cookies.ts`, `tokens.ts`, `index.ts`, `cookies.test.ts`
- FOUND: `app/server/src/routes/auth/refresh-rotation.test.ts`
- Коммиты: 0 (правило пользователя), HEAD не менялся (7a6f95a)
