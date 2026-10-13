---
phase: 04-authentication-and-web-session
reviewed: 2026-10-04T09:39:01Z
depth: deep
diff_range: bf332e6..208765e
files_reviewed: 38
files_reviewed_list:
  - app/server/drizzle/0021_auth_sessions.sql
  - app/server/src/config/auth.ts
  - app/server/src/db/schema.ts
  - app/server/src/lib/logger.ts
  - app/server/src/app.ts
  - app/server/src/middleware/auth/session.ts
  - app/server/src/middleware/auth/requirePerm.ts
  - app/server/src/routes/auth/login.ts
  - app/server/src/routes/auth/refresh.ts
  - app/server/src/routes/auth/logout.ts
  - app/server/src/routes/auth/me.ts
  - app/server/src/routes/auth/invites.ts
  - app/server/src/routes/users/index.ts
  - app/server/src/routes/users/profile.ts
  - app/server/src/routes/users/sessions.ts
  - app/server/src/routes/users/login-throttle.ts
  - app/server/src/routes/rbac/index.ts
  - app/server/src/routes/settings.ts
  - app/server/src/routes/search.ts
  - app/server/src/routes/tests/public.ts
  - app/server/src/services/access-policy/index.ts
  - app/server/src/services/access-policy/policy.ts
  - app/server/src/services/access-policy/grants-loader.ts
  - app/server/src/services/session/index.ts
  - app/server/src/services/session/tokens.ts
  - app/server/src/services/session/cookies.ts
  - app/server/src/services/login-throttle/index.ts
  - app/server/src/services/login-throttle/progression.ts
  - app/web/proxy.ts
  - app/web/lib/session/client.ts
  - app/web/lib/session/keep-alive.ts
  - app/web/lib/session/schedule.ts
  - app/web/lib/session/proxy-refresh.ts
  - app/web/lib/session/redirect.ts
  - app/web/lib/session/server.ts
  - app/web/components/providers/AuthProvider.tsx
  - app/web/components/auth/AuthGuard.tsx
  - app/web/app/(internal)/login/LoginPageClient.tsx
findings:
  critical: 1
  warning: 3
  info: 8
  total: 12
  blocker: 1
  major: 3
  minor: 7
  info_only: 1
status: issues_found
---

# Фаза 4: ревью кода

**Дата:** 2026-10-04T09:39:01Z
**Глубина:** deep, с трассировкой между модулями
**Диапазон:** `git diff bf332e6 208765e`, коммиты 6413c97 … 208765e. Коммит 692d5f5 в ревью не входит.
**Статус:** issues_found

## Итог

Смотрел серверный модуль сессий (ротация, окно повтора, replay, отзыв), троттлинг входа, access-policy, маршруты auth и users, миграцию 0021, а на стороне web — модуль `lib/session`, proxy, AuthProvider, keep-alive, AuthGuard, страницу логина и пакет rbac.

Прогоны тестов (без правок кода):
- `yarn workspace @bio-exam/web test`: 20 файлов, 430 тестов, зелёные.
- `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test`: 21 файл, 423 теста, зелёные.

Проверил и считаю корректными:
- атомарный захват `used_at`: при READ COMMITTED второй UPDATE ждёт блокировку строки, потом `classifyRepeat` видит зафиксированный `used_at`;
- три исхода refresh и окно `REFRESH_REUSE_WINDOW_MS`;
- отзыв при деактивации, он идёт в той же транзакции, что и PATCH;
- `computeAccess` и `GrantsLoader` закрыты при ошибке: у загрузчика нет catch, ошибка уходит в 500;
- кэш доступа на запрос через `WeakMap`;
- один refresh на несколько одновременных 401 (`pendingRefresh`);
- таймеры и подписки keep-alive и AuthProvider снимаются при размонтировании;
- бэкфилл в 0021;
- пакет rbac после удаления `buildPermissionSet`: экспорт `can` на месте, а `check-rbac-dist` и тест экспорта обновлены.

Главная проблема — обход `safeCallbackPath`. Защита от открытого редиректа объявлена результатом коммита 0dde2b8, но пропускает пути с dot-сегментами.

## Narrative Findings (AI reviewer)

### Сводная таблица

| id | severity | файл:строка | кратко |
|---|---|---|---|
| CR-01 | BLOCKER | `app/web/lib/session/redirect.ts:20,31` | `safeCallbackPath('/.//evil.com')` возвращает `//evil.com`: открытый редирект после входа |
| CR-02 | MAJOR | `app/web/lib/session/schedule.ts:7`, `keep-alive.ts:88` | Задержка keep-alive без нижней границы: непрерывный цикл `POST /refresh` при TTL=60 или если часы клиента спешат |
| CR-03 | MAJOR | `app/server/src/routes/auth/invites.ts:208-220` | Принятие приглашения задаёт новый пароль активному пользователю и не отзывает его сессии |
| CR-04 | MAJOR | `app/server/src/lib/logger.ts:9`, `routes/auth/refresh.ts:22` | Подтверждено (deferred): Cookie с access и refresh попадает в лог, строка `refresh_replay` новая |
| CR-05 | MINOR | `app/server/src/services/session/index.ts:175,222` против `:255,260` и `:277,284` | Обратный порядок блокировок у ротации и отзыва: deadlock даёт 500, replay может остаться незамеченным |
| CR-06 | MINOR | `app/server/src/services/login-throttle/index.ts:66` против `:123,128` | Обратный порядок блокировок у `reserveAttempt` и `recordSuccess`: deadlock и 500 при параллельном входе |
| CR-07 | MINOR | `app/web/proxy.ts:55`, `components/auth/AuthGuard.tsx:45` | При исходе `unavailable` в proxy пользователя с живым refresh уводит на `/login` |
| CR-08 | MINOR | `app/web/components/providers/AuthProvider.tsx:114-118` | Сбой сети при выходе не обрабатывается: cookie остаются, страница логина возвращает пользователя назад |
| CR-09 | MINOR | `app/web/lib/session/server.ts:20-21` | При 401 и неуспешном статусе тело ответа не читается и не отбрасывается |
| CR-10 | MINOR | `app/server/src/config/auth.ts:51` | `REFRESH_TOKEN_EXPIRES_DAYS` не проверяется: при NaN каждый вход и refresh дают 500 |
| CR-11 | INFO | `app/web/lib/session/proxy-refresh.ts:35` | `apiUrl()` вызывается вне `try`: без `API_ORIGIN` proxy бросает исключение вместо `unavailable` |
| CR-12 | MINOR | `app/web/app/layout.tsx:45`, `components/AppLayout/AppLayout.tsx:75` | Подтверждено (deferred): два `Toaster`, каждый тост показывается дважды. Хуже не стало |

---

### CR-01: обход защиты callbackUrl через dot-сегменты (BLOCKER)

**Файл:** `app/web/lib/session/redirect.ts:20`, `:31`. Потребители: `app/web/app/(internal)/login/LoginPageClient.tsx:52` (`router.replace`) и `:124` (`window.location.assign`).

**Проблема.** Проверка `raw[1] === '/' || raw[1] === '\\'` смотрит на входную строку. После неё `new URL(raw, 'http://callback.invalid')` нормализует dot-сегменты: `.`, `..`, `%2e`, `%2e%2e`. Источник после нормализации остаётся `callback.invalid`, поэтому проверка `origin` проходит. Но собранный `pathname` начинается с `//`.

**Сценарий отказа.** Проверено запуском функции из репозитория:

```
safeCallbackPath('/.//evil.com')            -> '//evil.com'
safeCallbackPath('/%2e%2e//evil.com/path')  -> '//evil.com/path'
```

- Ссылка `/login?callbackUrl=%2F.%2F%2Fevil.com`: после успешного входа выполняется `window.location.assign('//evil.com')`, это переход на внешний домен.
- Если пользователь уже вошёл, переход случается сразу при открытии ссылки через `router.replace(callbackUrl)` в эффекте строки 52, без единого действия пользователя.

**Правка.** Проверить на `//` результат, а не вход, и добавить оба входа в `redirect.test.ts`:

```ts
const path = `${parsed.pathname}${parsed.search}${parsed.hash}`
if (path.startsWith('//') || path.startsWith('/\\')) return fallback
return path
```

---

### CR-02: keep-alive уходит в непрерывный цикл refresh (MAJOR)

**Файл:** `app/web/lib/session/schedule.ts:7`, `app/web/lib/session/keep-alive.ts:88`, `:113`. Связано с `app/server/src/config/auth.ts:10` (`ACCESS_TOKEN_TTL_MIN_SEC = 60`).

**Проблема.** `refreshDelayMs` возвращает `max(0, expiresAt − 60 s − nowClient)` и не имеет нижней границы. Срок `expiresAt` абсолютный и считается по часам сервера, `now` берётся с часов клиента. Задержка 0 после каждого успешного refresh означает мгновенный следующий `run()`: `inFlight` уже сброшен, таймер на 0 мс сразу вызывает `fire`.

**Сценарий отказа.**
1. `ACCESS_TOKEN_EXPIRES_SEC=60`. Это значение разрешено валидатором, минимум равен 60. Каждый ответ refresh даёт `expiresAt = now + 60 s`, задержка 0, и вкладка шлёт `POST /api/auth/refresh` подряд, со скоростью RTT. Каждый запрос — ротация: INSERT в `refresh_tokens` и UPDATE `auth_sessions`. По той же причине `needsRefresh` в proxy (`exp − now ≤ 60`) ротирует токен на каждом запросе, который проходит через proxy.
2. При TTL по умолчанию (900 с) хватает того, что часы клиента спешат на 14 минут и больше. Тот же бесконечный цикл идёт с каждой открытой вкладки, пока она видима.

**Правка.**
- Нижняя граница задержки после успешного refresh, например `Math.max(REFRESH_RETRY_MS, …)` в `run()` для исхода `ok`.
- Лучше считать задержку от относительного срока: сервер отдаёт `accessExpiresIn`, либо клиент учитывает разницу с заголовком `Date`.
- Поднять `ACCESS_TOKEN_TTL_MIN_SEC` так, чтобы он был больше `REFRESH_LEAD_MS` и `REFRESH_THRESHOLD_SEC`, например до 120.

---

### CR-03: принятие приглашения меняет пароль без отзыва сессий (MAJOR)

**Файл:** `app/server/src/routes/auth/invites.ts:208-220`. Выдача приглашения существующему пользователю: `:101-107`.

**Проблема.** `POST /api/auth/invites` с `body.userId` выдаёт новую ссылку любому существующему пользователю, проверки `isActive` нет. `POST /api/auth/invites/accept` в транзакции записывает `passwordHash`, `login` и `isActive: true`, но `revokeUserSessions` не вызывает. По D-08 смена пароля завершает остальные сеансы. Здесь это второй путь смены пароля, и он требование обходит. `invites.ts` перечислен в области фазы (CONTEXT:215).

**Сценарий отказа.** Учётку активного пользователя скомпрометировали. Администратор выдаёт ему новую ссылку приглашения как сброс пароля, пользователь задаёт новый пароль. Сессия атакующего (refresh-токен в `auth_sessions`, `revoked_at IS NULL`) остаётся рабочей до истечения refresh, а при ротации — бессрочно.

**Правка.** В транзакции accept:

```ts
await revokeUserSessions(inv.userId, { reason: 'password_change' }, tx)
```

---

### CR-04: Cookie в логах pino-http (подтверждение отложенной находки, MAJOR)

**Файл:** `app/server/src/lib/logger.ts:9` (у `pinoHttp` нет `redact`), `app/server/src/app.ts` (`errorHandler`, `reqWithLog.log?.error`), `app/server/src/routes/auth/refresh.ts:22`.

**Вердикт:** подтверждено. Сериализатор `pino-std-serializers/lib/req.js:35,88` пишет `req.headers` целиком. Лог прогона серверных тестов:
- 17 строк `"cookie":"bio_exam_session=eyJ…"`;
- строки `refresh_replay` с `"cookie":"refresh_token=ed56b5e875f825e4552824e8b4f8e5c84a87dcb67bf408…"`.

Находка из `deferred-items.md` (04-06, 04-07). Хуже, чем до фазы: строку `refresh_replay` добавил 04-07, и она пишет в лог refresh-токен, предъявленный повторно. Если повтор шёл от легитимного клиента (потерянный ответ ротации, R4), это значение токена из того же семейства.

**Сценарий отказа.** Любой 4xx или 5xx через `errorHandler`, а также каждый replay, пишет в лог действующий access-JWT. Кто читает логи, может выдать себя за пользователя на 15 минут.

**Правка.** Как в `deferred-items.md`:

```ts
redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'], censor: '[redacted]' }
```

и тест, что строка `refresh_replay` не содержит значение cookie.

---

### CR-05: deadlock между ротацией и отзывом сессии (MINOR)

**Файл:** `app/server/src/services/session/index.ts`:
- ротация: `:175` (UPDATE строки токена), потом `:222` (UPDATE `auth_sessions.last_refreshed_at`);
- `revokeSession`: `:255` (UPDATE `auth_sessions`), потом `:260` (UPDATE `refresh_tokens` по `session_id`);
- `revokeUserSessions`: тот же порядок, `:277`, затем `:284`.

**Проблема.** Ротация берёт блокировки в порядке «токен → сессия», отзыв — в порядке «сессия → токены».

**Сценарий отказа.** Транзакция T1 ротирует B: держит строку B и ждёт строку сессии на `:222`. Транзакция T2 в это время делает одно из трёх: `classifyRepeat`, который распознал replay токена A той же сессии; смену пароля; «Завершить все сеансы». T2 держит строку сессии и ждёт B на `:260`. PostgreSQL обрывает одну транзакцию с 40P01, клиент получает 500.
- Если жертва — T2-replay: ротация B проходит, сессия не отозвана, атакующий получает 500 вместо 401. Replay обнаружится только на его следующей попытке.
- Если жертва — T2-администратор: в карточке пользователя появляется тост об ошибке.

Окно — несколько миллисекунд, ошибка редкая.

**Правка.** Привести порядок к одному. В `revokeSession` и `revokeUserSessions` сначала обновлять `refresh_tokens`, потом `auth_sessions`. Для `revokeUserSessions` id сессий сначала выбрать через `SELECT … FOR UPDATE` из `auth_sessions` в порядке id, затем отзывать токены и сессии. Другой вариант — в ротации первым шагом взять `SELECT … FOR UPDATE` строки сессии.

---

### CR-06: deadlock между reserveAttempt и recordSuccess (MINOR)

**Файл:** `app/server/src/services/login-throttle/index.ts:66` (INSERT … ON CONFLICT по отсортированным ключам `login:…` < `pair:…`) против `:123` (DELETE `pair`), затем `:128` (UPDATE `login`).

**Проблема.** `reserveAttempt` блокирует сначала строку `login`, потом `pair`. `recordSuccess` — сначала `pair`, потом `login`.

**Сценарий отказа.** Два одновременных входа с одним логином и IP: две вкладки, повтор запроса скриптом или прокси. Запрос 1 уже в `recordSuccess`: удалил `pair` и ждёт `login`. Запрос 2 в `reserveAttempt` заблокировал `login` и ждёт `pair`. Один из них получает 500 вместо входа или 401. Между двумя транзакциями идёт bcrypt (~100 мс), это расширяет окно.

**Правка.** В `recordSuccess` идти в том же порядке, что `bucketKeys`: сначала UPDATE `login`, затем DELETE `pair`. Либо одним запросом с `ORDER BY bucket_key FOR UPDATE`.

---

### CR-07: исход `unavailable` в proxy ведёт на страницу логина (MINOR)

**Файл:** `app/web/proxy.ts:55`, `app/web/components/AppLayout/AppLayout.tsx`, `app/web/components/providers/AuthProvider.tsx` (при `initialMe === null` клиент не загружает `me`), `app/web/components/auth/AuthGuard.tsx:45`.

**Проблема.** Срок cookie access равен TTL, поэтому после истечения браузер её не шлёт и proxy делает refresh. Если Express на refresh ответил 5xx, 429 или таймаутом, proxy пропускает запрос дальше (`NextResponse.next()`). SSR `GET /api/auth/me` без access получает 401, `getServerMe` возвращает `null`, а `sessionError = false`. AuthProvider со значением `initialMe = null` сам refresh не пробует. AuthGuard контента сразу выполняет `router.replace('/login?callbackUrl=…')`.

**Сценарий отказа.** Кратковременный сбой refresh при живом refresh-токене приводит к переходу на `/login`. Это противоречит решению R5: «без навигации при `unavailable`». Ситуация самоисправляется только тогда, когда на `/login` proxy удачно обновит токен.

**Правка.** Передавать исход `unavailable` из proxy в SSR, например заголовком запроса `x-session-refresh: unavailable`, и в `AppLayout` ставить `sessionError = true`. Либо в AuthProvider при `initialMe === null` и наличии refresh один раз вызывать `loadMe()` до решения AuthGuard.

---

### CR-08: сбой выхода не обрабатывается (MINOR)

**Файл:** `app/web/components/providers/AuthProvider.tsx:114-118`.

**Проблема.** `sessionClient.logout()` возвращает `false` при сетевой ошибке, но результат игнорируется, и сразу выполняется `window.location.assign('/login')`.

**Сценарий отказа.** Обрыв сети в момент нажатия «Выйти»:
1. cookie не очищены, сессия на сервере жива;
2. на `/login` SSR получает `me`, и `LoginPageClient` (`:52`) возвращает пользователя на `/dashboard`;
3. в `nav-user.tsx` при этом уже показан тост «Вы вышли из аккаунта».

Пользователь думает, что вышел, хотя сессия осталась, — опасно на общем компьютере.

**Правка.** При `false` не уходить со страницы и показать ошибку. Либо пустить переход через серверный путь, который очищает cookie (proxy), и только потом слать событие `logout` в другие вкладки.

---

### CR-09: тело ответа SSR `/api/auth/me` не читается (MINOR)

**Файл:** `app/web/lib/session/server.ts:20`, `:21`.

**Проблема.** При 401 (`return null`) и при неуспешном статусе (`throw`) тело ответа undici не читается и не отбрасывается. Это нарушает правило фазы «тело всегда прочитано или отброшено». Зависание из 04-11 вызывал `cancel()` одной ветви `tee`. Чтение ветви до конца не зависает. Сейчас ответ 401 приходит на каждую анонимную отрисовку, включая каждый показ `/login`.

**Сценарий отказа.** На маленьком JSON undici, скорее всего, успевает буферизовать тело и отпустить сокет. Остаётся неочищенный поток, который освобождается только сборщиком мусора. При ответе с телом больше `highWaterMark` (страница ошибки прокси на 5xx) сокет удерживается до GC.

**Правка.**

```ts
if (response.status === 401) { await response.text().catch(() => undefined); return null }
if (!response.ok) { await response.text().catch(() => undefined); throw new Error(…) }
```

---

### CR-10: `REFRESH_TOKEN_EXPIRES_DAYS` без проверки (MINOR)

**Файл:** `app/server/src/config/auth.ts:51`. Тот же код у `SESSION_MAX_AGE_DAYS` на `:24`.

**Проблема.** Ключ введён в этой фазе. `ACCESS_TOKEN_EXPIRES_SEC` проверяется (`parseAccessTokenTtl`), а `Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? …)` — нет.

**Сценарий отказа.** `REFRESH_TOKEN_EXPIRES_DAYS=30d` даёт NaN. Тогда `refreshExpiresAt()` возвращает Invalid Date, drizzle при сериализации бросает RangeError, и каждый `POST /login` и каждый refresh отвечают 500. Cookie получает `Max-Age=NaN`. Старт сервера проходит, ошибка всплывает только на первом входе.

**Правка.** Парсер по образцу `parseAccessTokenTtl`: целое число, разумный диапазон, при ошибке — fail-fast на старте.

---

### CR-11: `apiUrl()` вне `try` в proxy-refresh (INFO)

**Файл:** `app/web/lib/session/proxy-refresh.ts:35`.

**Проблема.** `requireApiOrigin()` бросает исключение, если `API_ORIGIN` не задан или некорректен. Вызов стоит до `try`, поэтому исключение уходит из `proxy()`.

**Сценарий отказа.** На неверно настроенном окружении (preview без `API_ORIGIN`) каждый запрос с истёкшим access получает 500 из proxy, а не `unavailable`. Это ошибка конфигурации, но поведение отличается от задуманного трёхисходного контракта.

**Правка.** Перенести `apiUrl(...)` внутрь `try` и возвращать `{ kind: 'unavailable' }`.

---

### CR-12: два Toaster (подтверждение отложенной находки, MINOR)

**Файл:** `app/web/app/layout.tsx:45` и `app/web/components/AppLayout/AppLayout.tsx:75`.

**Вердикт:** подтверждено. Корневой layout оборачивает `children` в `AppLayout` и рядом монтирует второй `<Toaster />`. Оба подписаны на глобальное состояние `sonner` без `toasterId`, поэтому каждый `toast.*` показывается дважды. Оба экземпляра были и в `bf332e6`, то есть фаза это не ухудшила. Новые тосты фазы (действия «Сеансы и вход», тост выхода в `nav-user.tsx`) дублируются так же.

**Правка.** Удалить `<Toaster />` из `app/layout.tsx` или из `AppLayout.tsx`. Если нужен один глобальный, оставить его в корневом layout.

---

## Отложенные кандидаты из `deferred-items.md`

| кандидат | вердикт | где в отчёте |
|---|---|---|
| pino-http логирует Cookie (нет `redact`) | подтверждено, есть строка в логе тестов; строка `refresh_replay` новая | CR-04 |
| Два `Toaster`, тосты дважды | подтверждено; было до фазы, хуже не стало | CR-12 |

---

_Reviewed: 2026-10-04T09:39:01Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
