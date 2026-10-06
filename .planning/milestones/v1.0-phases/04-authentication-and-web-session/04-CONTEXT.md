# Phase 4: Authentication and web session - Context

**Gathered:** 2026-10-04
**Status:** Ready for planning
**Mode:** автономный smart discuss. Пользователь недоступен; все решения ниже приняты автономно по рекомендованному варианту. Альтернативы — в `04-DISCUSSION-LOG.md`. Решения, которые меняют видимое поведение, API, прод-данные, env или порядок выкатки, перечислены в `<specifics>` → «Требует подтверждения пользователя»; фазу они не блокируют.

<domain>
## Phase Boundary

Доступ решает Express по текущему состоянию БД, сессии короткие и отзываемые, web показывает только то, что сказал Express.

- **Сервер.** Один модуль политики прав (роли + `inherits` + переопределения из БД) за швом загрузки грантов; через него идут все проверки Express и `/api/auth/me`. Access-токен короткий и привязан к серверной сессии (семейству refresh-токенов). Refresh одноразовый, захватывается атомарно, cookie ставятся после commit, повтор ловится на уровне семейства. Жёсткая блокировка аккаунта заменяется прогрессивным троттлингом (логин + IP) в PostgreSQL с путём восстановления. Выдача сессии (чтение cookie, выпуск токенов, Set-Cookie) живёт в одном модуле.
- **Web.** Один модуль веб-сессии: текущий пользователь при SSR и на клиенте, цепочка 401 → refresh → retry (несколько 401 дают один refresh), редирект на логин с `callbackUrl`, обновление сессии при SSR через `proxy.ts`. `AuthProvider` монтируется один раз. Гейты маршрутов UI берут права, которые проверяет Express, без обхода `isAdmin` и проверок по строкам ролей. `getMeData`, Next-маршрут `/api/auth/me`, пул `pg`, `jsonwebtoken`, `DATABASE_URL` и `AUTH_JWT_SECRET` уходят из `app/web`.

Требования: AUTH-01 … AUTH-12 (`.planning/REQUIREMENTS.md:47-58`). Источник: ADR-0001, `plans/003-auth-session-security.md`, `plans/011-architecture-deepening.md` §2 C5, C6, §3 «Выдача сессии на сервере», дефекты D3, D4, D8.

Видимое поведение меняется:
- выход завершает сессию сразу, смена пароля завершает остальные сеансы, снятие роли действует на следующем запросе;
- после 15 минут бездействия сессия обновляется незаметно (refresh), а не держится 30 дней на одном access-токене;
- пять неверных паролей больше не блокируют аккаунт на 30 минут; вместо этого растущие паузы для пары (логин, IP) и ответ 429;
- разделы `/admin/**` открываются по правам раздела, а не по `rbac.*` (для текущих ролей `admin` и `user` видимый доступ не меняется, D-17);
- открытие серверной страницы с истёкшим access-токеном и живым refresh-токеном не уводит на логин (D8).

Что НЕ входит:
- Проверка назначения в `/start`, `/submit`, PATCH черновика (N1 из фазы 3), правило «назначен или привилегирован» для всех операций попытки — Phase 5 (ATT-01). Фаза 4 только заменяет строковые проверки ролей в существующих местах (D-04).
- Перевод ~20 голых `fetch` и SWR-fetcher'ов на модуль запросов, типизированные запросы, `absoluteUrl` — Phase 8 (HTTP-01 … 04).
- Удаление `users.read` из роли `user`, минимальный DTO справочника — Phase 7 (PRIV-01 … 03).
- Внешние провайдеры, 2FA, новые роли (в т. ч. `teacher`), посторонние изменения RBAC — Out of Scope (`REQUIREMENTS.md:166`, `PROJECT.md:44`).
- Перенос API в route handlers Next, второй алгоритм прав в `packages/rbac` или `app/web` — Out of Scope (ADR-0001).
- Удаление колонок `users.failed_login_attempts`, `users.locked_until` и таблицы `rbac_page_rules` (деструктивные миграции).

</domain>

<decisions>
## Implementation Decisions

Все решения D-01 … D-24 приняты автономно (пользователь недоступен), рекомендованный вариант. У каждого стоит пометка **[авто]**.

Перенесено из предыдущих фаз (не переспрашивалось):
- **ADR-0001 (PROJECT D-01, locked).** База, JWT и вычисление прав только в `app/server`; web берёт пользователя и права из `/api/auth/me` и проверяет готовый список; `packages/rbac` — словарь; гейты UI по тем же правам, что проверяет Express.
- **PROJECT D-09 (resolved).** `getMeData`, Next `/api/auth/me` и пул `pg` удаляются в этой фазе после parity-тестов.
- **PROJECT Constraints.** Нет пути совместимости с 30-дневным bearer-доступом; авторизация по текущему состоянию БД; применённые миграции не правятся, drop/recreate — STOP.
- **ADR-0003.** Характеризационные тесты через интерфейс модуля до изменений. `yarn verify` зелёный перед закрытием фазы, нулевой прогон тестов — провал.
- **Phase 1 (01-09, D-16).** e2e входит один раз на аккаунт в `auth.setup.ts` и переиспользует `storageState`; известные дефекты фиксируются `test.fail()` и переключаются в фазе, которая их чинит.
- **Phase 2 (02-01, 02-03).** Ожидаемо падающие Vitest-проверки — константа по образцу `KNOWN_HOLES` с `test.fails`; матрица `@proxy` (`e2e/tests/proxy-protection.spec.ts`) — защита `proxy.ts`.
- **Phase 3.** Охранный тест репозитория по образцу `scripts/exam-core-no-private-copies.test.mjs`; поимённый список мест в `<code_context>` проверяет верификатор.
- **Общие правила.** Агенты не коммитят; границы планов — границы коммитов пользователя. БД-тесты только через `node scripts/with-test-db.mjs` (`test_*`, `BIO_EXAM_ISOLATED_ENV=1`). Новые миграции разрешены, применённые не правятся. Env-примеры только с плейсхолдерами. Комментарии в коде не пишутся. Доки по-русски.

### Политика прав и D4 (AUTH-01, AUTH-02, AUTH-03)
- **D-01 [авто]: один модуль политики на сервере.** Вход: реестр ролей (по умолчанию `ROLE_REGISTRY`, в тестах — синтетический) и снимок грантов пользователя; выход: множество `PermissionKey`. Алгоритм: роли из `user_roles` → разворот с `inherits` (циклы и неизвестные роли пропускаются) → `rbac_role_grants` allow/deny → `rbac_user_grants` allow/deny (пользователь сильнее роли). Шов: загрузчик грантов (`roles`, `roleGrants`, `userGrants`) с адаптерами Drizzle и in-memory. Через модуль идут `sessionOptional`/`sessionRequired`, `requirePerm`, `requirePermKey`, `/api/auth/me`, `routes/search.ts`, `GET /api/rbac/user/:id/grants` (`routes/rbac/index.ts:91-134` считает эффективные права сам — третий алгоритм) и проверки D-04. Форма API рассчитана на Phase 5: «назначен или привилегирован» (ATT-01) спрашивает модуль, а не роли. `packages/rbac` остаётся словарём: `buildPermissionSet` (`packages/rbac/src/rbac.ts:20-40`) переносится в серверный модуль и удаляется из экспорта пакета (`index.ts:7`, ожидания `index.test.ts`); `can` (проверка готового списка), реестр, домены, нормализаторы остаются.
- **D-02 [авто]: БД авторитетна всегда, один путь, fail-closed.** Роли берутся только из `user_roles`; access-JWT больше не несёт `roles` (claims: `sub`, `sid`, `login`), объединение `[...dbRoles, ...jwtRoles]` (`middleware/auth/session.ts:99`) удаляется. Флаги `AUTH_SESSION_ENFORCE_DB`, `RBAC_USE_DB_OVERRIDES`, `RBAC_DB_FAIL_OPEN` (`session.ts:64`, `services/rbac/rbac.ts:16-17`) удаляются: во всех средах поведение как сейчас в production (проверка в БД на каждом запросе, переопределения применяются, ошибка БД прав → ответ с ошибкой, без запасного набора). `/api/auth/me` теряет запасной `buildBasePermissionSet` (`routes/auth/me.ts:27-32`) и лишний `sessionOptional()` поверх app-уровня (`me.ts:13`). Deny из БД снимает право и у `admin` (как сейчас в production); защита конфигурации admin в `/api/rbac/*` (`routes/rbac/index.ts:48`, `:74`, `:148`) не меняется.
- **D-03 [авто]: межзапросные кэши удаляются.** `rolesCache` и `userCache` (5 минут на инстанс, `services/rbac/rbac.ts:15`, `:36-37`) на Vercel нельзя сбросить на других инстансах, а критерий 1 требует «следующий запрос». Вместо них — мемоизация принципала на время одного запроса: сессия, пользователь, роли и гранты читаются один раз за запрос. `invalidateRBACCache` и его вызовы (`routes/users/index.ts:177`, `:246`, `routes/rbac/index.ts:60`, `:82`, `:159`, `:180`) удаляются.
- **D-04 [авто]: D4 и проверки по строкам ролей в Express.**
  - `routes/tests/public.ts:303`, `:409` (`['admin','teacher']`, пропуск проверки назначения при чтении теста) → право `tests.read` через модуль.
  - `public.ts:152`, `:196` (`roles.includes('admin')`: все опубликованные тесты вместо назначенных) → `tests.read`.
  - `routes/settings.ts:25`, `:51` (`chart-default-range`) → `settings.manage`.
  - `services/search/database-search.ts:84` (`isPrivileged`) → ветка роли удаляется, остаются права (у admin есть `tests.write`).
  - Не меняются (не решения о доступе): SQL-фильтр `studentOnly` (`routes/tests/index.ts:2471`, `:2551`, «только студенты» в статистике) и защита конфигурации admin в `/api/rbac/*`. Роль `teacher` не добавляется (Out of Scope).
  Для ролей `admin` и `user` исход не меняется: admin проходит, user — по назначению. Меняется только для переопределений: пользователь с allow `tests.read` начинает проходить, admin с deny `tests.read` перестаёт. Исход каждого маршрута закрепляется тестом (admin; user с назначением; user без назначения; user с allow-переопределением; admin с deny).

### Сессии, токены и вход (AUTH-04, AUTH-05, AUTH-06, AUTH-07)
- **D-05 [авто]: модель сессии и одна аддитивная миграция 0021.** Новая таблица сессий (семейство refresh-токенов): `id`, `user_id` (FK cascade), `created_at`, `last_refreshed_at`, `revoked_at`, `revoke_reason`. `refresh_tokens` получает `session_id` (FK cascade, индекс) и `used_at`. Новая таблица троттлинга входа (D-11). Все новые таблицы — с `enableRLS()` и `denyDirectAccessPolicy()`, как остальные. Миграция только добавляет (никаких drop/rename), `migrations-manifest.json` и `check-migrations` принимают 0021. `users.failed_login_attempts`, `users.locked_until` и `idx_users_locked_until` (`db/schema.ts:87-88`, `:97`) остаются в схеме, код их больше не читает и не пишет. Access-JWT несёт `sid`; запрос принимается, если подпись и `exp` верны, сессия существует и не отозвана, пользователь существует и активен.
- **D-06 [авто]: сроки токенов и cookie.** Access — 900 с по умолчанию. `ACCESS_TOKEN_EXPIRES_SEC` остаётся, допустимый диапазон 60 … 3600; значение вне диапазона — ошибка при старте сервера (как проверка `AUTH_JWT_SECRET` в `config/auth.ts:10-14`); срок access больше не берётся из `SESSION_MAX_AGE_DAYS` (сейчас по умолчанию 30 дней, `routes/auth/login.ts:114`, `refresh.ts:49`). Refresh — 30 дней скользящим сроком, как сейчас (`REFRESH_TOKEN_EXPIRES_DAYS`, `SESSION_MAX_AGE_DAYS` без изменений). Имена cookie (`bio_exam_session`, `refresh_token`), `Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure` в production не меняются; `Max-Age` access-cookie равен сроку access. Refresh-cookie остаётся на `Path=/`: его читает `proxy.ts` (D-14). Новых env-ключей нет.
- **D-07 [авто]: refresh — атомарный захват, cookie после commit, окно повтора 30 с.**
  - В одной транзакции: условный захват токена (`used_at IS NULL`, не отозван, не истёк) с возвратом строки, проверка сессии (не отозвана) и пользователя (активен), вставка преемника, обновление `last_refreshed_at`. Cookie ставятся только после commit; ошибка транзакции → 500 без `Set-Cookie`. Два одновременных refresh дают ровно одного преемника.
  - Повтор уже использованного токена в течение 30 с после его захвата при живой сессии — гонка, а не атака (SSR-refresh в `proxy.ts` одновременно с клиентом, две вкладки, параллельные RSC-запросы): выдаётся только новый access-токен той же сессии, без нового refresh-токена и без отзыва.
  - Повтор позже 30 с или повтор токена, у которого уже использован и преемник, — replay: сессия отзывается целиком (`revoke_reason = 'replay'`), ответ 401, событие в лог. Окно — константа в коде, не env.
  - IP-лимитер на refresh (`rateLimiter` 10/мин, `refresh.ts:30`) снимается: токен — 512 бит случайности, повтор ловит семейство, а SSR-refresh из `proxy.ts` на Vercel идёт с адресов web и упирался бы в общий лимит.
  - Refresh выпускает токен тем же кодом, что login, поэтому claim `login` сохраняется (AUTH-07).
- **D-08 [авто]: отзыв.**
  - Logout отзывает текущую сессию (по `sid` access-токена или по refresh-cookie); access-токен этой сессии отклоняется уже на следующем запросе.
  - Смена пароля (`POST /api/users/profile/password`, `routes/users/profile.ts:116-163`) отзывает все остальные сессии пользователя, текущая продолжает работать.
  - Деактивация (`PATCH /api/users/:id` с `isActive=false`, `routes/users/index.ts:135-182`) отзывает все сессии пользователя; удаление пользователя удаляет их каскадом.
  - Новый маршрут администратора «завершить все сеансы пользователя» под правом `users.edit` отзывает все сессии.
  - Снятие роли сессии не отзывает: роль из БД действует на следующем запросе (D-02).
- **D-09 [авто]: существующие сессии при выкатке — без повторного входа.** Миграция 0021 создаёт по одной сессии на каждый действующий refresh-токен (не отозван, не истёк) с `id` сессии, равным `id` токена, и проставляет ему `session_id`. Старые access-JWT без `sid` отклоняются сразу: пути совместимости для 30-дневного access нет. Клиент (`apiFetch`) и `proxy.ts` (D-14) обновляют их по старому refresh-токену без повторного входа. Отозванные и истёкшие токены остаются без сессии и не принимаются. Это миграция с данными; альтернатива — принудительный выход всех — в «Требует подтверждения».
- **D-10 [авто]: один модуль выдачи сессии на сервере (AUTH-07).** В нём: чтение cookie, выпуск access и refresh, добавление `Set-Cookie` без перезаписи уже выставленных, очистка cookie. Login, refresh, logout и смена пароля идут через него. Удаляются три копии `readCookie` (`session.ts:25-38`, `refresh.ts:15-28`, `logout.ts:11-24`), три склейки Set-Cookie (`login.ts:135-153`, `refresh.ts:73-91`, `logout.ts:40-63`) и перезаписывающие `setSessionCookie`/`clearSessionCookie` (`session.ts:40-59`). Очистка refresh-cookie со старым путём `Path=/api/auth/refresh` (`logout.ts:49-56`) удаляется: путь сменился 2026-02-21 (`d0a0e41`), такие cookie истекли.
- **D-11 [авто]: троттлинг входа в PostgreSQL.**
  - Хранилище — таблица в БД (миграция 0021): Redis нет, память инстанса Vercel не общая. STOP плана 003 «нет общего хранилища» снят.
  - Считаются только неудачи; успешный вход сбрасывает пару (логин, IP). Корзины: пара (логин, IP) — основная; логин по всем IP — вторичная с низким потолком; IP по всем логинам — только при достоверном IP (D-12).
  - Прогрессия: в паре первые 5 неудач без паузы, дальше окно блокировки удваивается от 30 с до потолка 15 мин (пока IP не подтверждён — до 60 с, D-12). По логину (все IP) после 20 неудач окно до 60 с. Злоумышленник со своего IP закрывает только свою пару, владелец со своего IP ждёт не дольше потолка вторичной корзины.
  - Ответ при блокировке — 429 с `Retry-After`, одинаковый для существующих и несуществующих логинов; bcrypt не выполняется. Ключ логина — нормализованная строка (`toLowerCase().trim()`, как сейчас).
  - Удаляются: жёсткая блокировка (`login.ts:73-98`, ответ 403 `ACCOUNT_LOCKED`) и in-memory лимитер входа (`login.ts:55-69`, неиспользуемый `loginRateLimiter`, `middleware/rateLimiter.ts:101-105`; на Vercel он не общий).
  - Числа — константы в коде.
- **D-12 [авто]: восстановление и источник IP.**
  - Восстановление: окна ограничены потолком и истекают сами; маршрут администратора «снять ограничение входа» под `users.edit` удаляет записи по логину; runbook в `app/server/README.md` даёт оператору SQL на случай, когда ограничен сам администратор.
  - IP берёт одна функция модуля троттлинга. Какой заголовок даёт реальный IP клиента за rewrite Vercel (`app.ts:22` `trust proxy 1`, `next.config.ts:31-35` `beforeFiles`), устанавливают research и preview. Пока это не подтверждено, корзина «IP по всем логинам» выключена. Пара (логин, IP) при общем IP вырождается в корзину логина, и с потолком пары 15 минут атакующий держал бы владельца в 429 до 15 минут вопреки D-11. Поэтому до подтверждения потолок пары равен потолку корзины логина (60 с): одна константа в коде `IP_TRUSTED = false` выключает корзину IP и ограничивает пару 60 с; потолок пары 15 минут и корзина IP действуют только после проверки IP на preview и отдельной правки константы человеком.

### Веб-сессия, D3, D8 и гейты UI (AUTH-08 … AUTH-12)
- **D-13 [авто]: один модуль веб-сессии в `app/web/lib`.** Он отвечает за:
  - текущего пользователя при SSR (через `react.cache`, один запрос к Express на рендер) и на клиенте (контекст `AuthProvider`);
  - цепочку 401 → refresh → retry с single-flight: одна общая операция refresh на вкладку, несколько одновременных 401 дают один refresh;
  - редирект на логин с `callbackUrl`;
  - выход (сейчас две копии: `components/nav-user.tsx:41`, `profile/ProfileClient.tsx:213`).
  Шов — транспорт сессии с HTTP-адаптером к Express и фейком для тестов. `apiFetch`, `fetchAuthMe`, `tryRefreshSession` становятся частью модуля; ветка «200 с `ok:false` → refresh» (`lib/auth/fetchMe.ts:12-17`) удаляется: Express отвечает 401. Одна функция строит редирект и проверяет callback вместо трёх (`proxy.ts:27-29`, `AuthGuard.tsx:50-53`, `lib/auth/loginRedirect.ts`) и `safeRedirect` (`login/LoginPageClient.tsx:16-36`). Callback принимается только как путь того же origin. `//host` и `/\host` отклоняются: сейчас `decoded.startsWith('/')` пропускает `//evil.example`, это открытый редирект.
- **D-14 [авто]: D8 — обновление сессии при SSR в `proxy.ts`.** Proxy в Next 16 работает в Node runtime и выполняется до `beforeFiles` rewrites (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:243-255`). Server Component cookie ставить не может, поэтому обновление идёт в proxy.
  - Когда условие срабатывает: страничный запрос (matcher без изменений), есть refresh-cookie, а access-cookie нет, он истекает в ближайшие 60 с или выпущен в старом формате без `sid`. Payload читается без проверки подписи и служит только для решения «нужен ли refresh»; секрета в web нет.
  - Что делает proxy: вызывает `POST {API_ORIGIN}/api/auth/refresh` с cookie запроса, переносит `Set-Cookie` в ответ и подставляет новые cookie в заголовок запроса для RSC (`NextResponse.next({ request: { headers } })`).
  - Refresh не удался → cookie очищаются, редирект на `/login?callbackUrl=…` функцией из D-13. Если RSC всё равно получает 401 (сессия отозвана при ещё живом access) — тот же редирект.
  - Матрица `@proxy` остаётся зелёной без изменения ожиданий: её запросы идут без cookie (в `proxy-protection.spec.ts` нет ни `refresh_token`, ни cookie сессии), а без cookie proxy по-прежнему редиректит на логин.
- **D-15 [авто]: D3 — один `AuthProvider`, ни одного лишнего запроса на загрузке.**
  - `AuthProvider` монтируется один раз в `AppLayout` с `initialMe` из SSR (`components/AppLayout/AppLayout.tsx:27`) и удаляется из `app/providers.tsx:29`.
  - Эффект «миграции cookie» (`AuthProvider.tsx:70-84`, голый `fetch('/api/auth/refresh')`, ключ `auth_refresh_cookie_migrated_v2`) удаляется, вместе с ним обход в e2e (`e2e/fixtures/exam.ts` `newSessionContext`, `addInitScript`) и запись в `phases/01-verification-baseline/deferred-items.md` закрывается.
  - Страница логина берёт `me` из контекста вместо собственного `fetchAuthMe` при загрузке (`LoginPageClient.tsx:68-75`) и после входа делает полную навигацию без повторных `/auth/me` (`:110-117`).
  - Опрос `/auth/me` раз в 10 минут и при возврате на вкладку (`AuthProvider.tsx:86-127`) переходит в модуль и идёт через single-flight цепочку.
  - На загрузке страницы с действующей сессией браузер не делает ни `/api/auth/me`, ни `/api/auth/refresh`; `/api/auth/me` вызывается один раз, на сервере.
- **D-16 [авто]: проактивное обновление до истечения.** Express добавляет `accessExpiresAt` в ответы login, refresh и `/api/auth/me` (аддитивно; разбор `parseAuthMe` и контракт не ломаются). Клиентский модуль обновляет сессию за 60 с до истечения, пока вкладка видима, и сразу при возврате на вкладку после истечения. Причина: ~20 голых `fetch` и SWR-fetcher'ов (`lib/fetcher.ts` и локальные) не обрабатывают 401 до Phase 8; при access в 15 минут они начали бы падать.
- **D-17 [авто]: гейты UI по правам Express.**
  - В модуле веб-сессии одна карта «префикс маршрута → права»:
    - `/admin/tests/**`, `/admin/attempts/**` → `tests.read`;
    - `/admin/users/**` → `users.edit` (не `users.read`: оно есть у роли `user` до PRIV-01, а раздел — управление);
    - `/admin/groups/**` → `groups.manage_groups`;
    - `/admin/settings/rbac/**` → `rbac.read`;
    - `/admin/settings/**`, `/admin/sidebar/**` → `settings.manage`;
    - корень `/admin` → любое из перечисленных.
  - Проверка идёт на сервере в layout каждого поддерева (RSC, до рендера) и тем же списком в клиентском `AuthGuard`.
  - Обход `isAdmin` в `AuthGuard` (`components/auth/AuthGuard.tsx:61-63`) и общий гейт `rbac.*` (`admin/layout.tsx:4`) удаляются.
  - Ручные `roles.includes('admin')` заменяются проверкой права:
    - `profile/[id]/page.tsx:15` и `admin/users/[id]/page.tsx:42` → `tests.manage_assignments` (`UserProfileAssignmentsPage` работает с назначениями);
    - `dashboard/DashboardClient.tsx:181-182` → `can('tests','read')`;
    - редактор аватара в `profile/ProfileClient.tsx:109`, `:241` → `users.edit`.
  - Правило выбора: для текущих ролей `admin` и `user` видимый доступ не меняется, роли `user` не открывается ни одна новая страница. Нет права → `notFound()`, как сейчас на `profile/[id]` и `admin/users/[id]`; вид — в UI-SPEC. Таблица `rbac_page_rules` и маршруты `/api/rbac/pages` web не читает; источником карты они не становятся (Deferred).
- **D-18 [авто]: удаление Next-дубликата (AUTH-08).** Удаляются:
  - `lib/auth/server/getMeData.ts`;
  - `app/api/auth/me/route.ts`: при заданном `API_ORIGIN` он и сейчас недостижим, `beforeFiles` rewrite `/api/:path*` срабатывает раньше файловых маршрутов;
  - `lib/env/server.ts` (импортирует его только `getMeData`) с ключами `NEXTAUTH_*`;
  - зависимости `pg`, `@types/pg`, `jsonwebtoken`, `@types/jsonwebtoken` из `app/web/package.json:86`, `:97`, `:133`, `:136`;
  - ключи `DATABASE_URL`, `PG_*`, `AUTH_JWT_SECRET`, `NEXTAUTH_*` из `app/web/.env.example`;
  - те же ключи из e2e-окружения web (`scripts/lib/e2e-web-env.mjs:51`, `:62-63`).
  `getServerMe` теряет ветку `getMeData` (`lib/auth/getServerMe.ts:25-26`); `API_ORIGIN` становится обязательным при работе web, без него — явная ошибка конфигурации, а не тихий `null`. `SESSION_COOKIE_NAME` в web остаётся (его читает `proxy.ts`). `getServerMe.test.ts` (Phase 1 D-19) переписывается на транспорт модуля.

### Порядок, тесты и выкатка
- **D-19 [авто]: тесты до изменений (ADR-0003).**
  - Характеризация через `app.ts` на `test_*`: login, refresh, logout, `/api/auth/me`, `requirePerm`. Тесты входят через `POST /api/auth/login` (настоящие cookie переживают смену формата токена). Режим проверок как в production: флаги D-02 задаются явно до импорта `app.ts`, как в e2e (`e2e/playwright.config.ts:73-74`).
  - Красные проверки помечаются ожидаемо падающими константой по образцу `KNOWN_HOLES` и переключаются в плане, который чинит:
    - роль снята после выдачи токена, а запрос проходит (AUTH-02);
    - после logout старый access-токен проходит (AUTH-04);
    - два параллельных refresh дают двух преемников (AUTH-05);
    - пять неудач с чужого IP блокируют владельца (AUTH-06);
    - пользователь с allow `tests.read` получает 403 на `public.ts:303` (D4);
    - при ошибке БД прав `/auth/me` и `requirePerm` расходятся (запасной набор).
  - e2e `test.fail`, D8 воспроизводится впервые (в `STATE.md` он «по отчёту»): новый вход через API в отдельном контексте → удалить access-cookie → `/profile/<login>` (серверная страница с `redirect` при `null`) уходит на `/login`. На `/dashboard` дефект не виден: клиент восстанавливается сам.
  - e2e `test.fail`, D3: на загрузке `/dashboard` с действующей сессией браузер делает `/api/auth/me`.
  - `test-support/http.ts` `sessionCookieFor` (подписывает голый JWT с ролями) переписывается в плане сессий: выпускает настоящую сессию через модуль D-10; `uploads.test.ts` и `exam-flow.test.ts` остаются зелёными.
- **D-20 [авто]: parity-тесты AUTH-08 = `/api/auth/me` ↔ `requirePerm`.** Тест на Express по фикстурам: `admin`; `user`; `user` + allow-переопределение; `user` + deny-переопределение; `admin` + deny в `rbac_role_grants`; роль с `inherits` на синтетическом реестре через in-memory адаптер. Для каждого `PermissionKey` множество `perms` из `/api/auth/me` совпадает с исходом `requirePermKey`. Отдельного сравнения `getMeData` с Express нет. Причины: в production web ходит в Express через `API_ORIGIN`, ветка `getMeData` работает только без него; добавлять `pg` в web-тесты перед удалением `pg` из web незачем. Отсутствие вызывающих подтверждают `codegraph impact` и охранный тест D-21.
- **D-21 [авто]: охранный тест репозитория.** По образцу `scripts/exam-core-no-private-copies.test.mjs` проверяет:
  - в `app/web` нет импорта `pg`, `jsonwebtoken`, чтения `DATABASE_URL`, `AUTH_JWT_SECRET` и проверок `roles.includes(`/`isAdmin` для доступа;
  - в `app/server/src/routes`, `middleware`, `services` нет решений о доступе по строкам ролей, исключения перечислены поимённо (D-04);
  - `packages/rbac` не экспортирует `buildPermissionSet`.
- **D-22 [авто]: порядок планов.** Каждый план начинается с `codegraph impact` по символам, которые меняет (plan 003 step 1), и заканчивается `codegraph affected` и `yarn verify`.
  1. Характеризация и красные тесты (D-19), e2e `test.fail` для D3 и D8.
  2. Модуль политики прав, шов загрузки грантов, D4, удаление кэшей и флагов, parity (D-01 … D-04, D-20).
  3. Миграция 0021 и модуль выдачи сессии: сессии, `sid`, refresh, logout, отзыв, существующие сессии, `sessionCookieFor` (D-05 … D-10).
  4. Троттлинг входа и восстановление (D-11, D-12).
  5. Модуль веб-сессии: D8 в proxy, D3, проактивный refresh, редирект (D-13 … D-16).
  6. Гейты UI, удаление Next-дубликата, охранный тест (D-17, D-18, D-21).
  Зависимости: 3 зависит от 2 (принцип запроса); 4 зависит от 3 (таблица в 0021); 5 зависит от 3 (`sid`, `accessExpiresAt`); 6 зависит от 2 и 5. Планы 4 и 5 друг от друга не зависят.
- **D-23 [авто]: e2e.**
  - Express в e2e получает `ACCESS_TOKEN_EXPIRES_SEC=3600` (верх диапазона D-06): общий `storageState` проектов desktop и mobile должен пережить прогон без вращения refresh-токена.
  - Сценарии, которые вращают refresh (D8, logout, повтор), входят своим входом через API в отдельном контексте.
  - Новые проверки:
    - D8: удалённый access-cookie, `/profile/<login>` открывается без `/login`;
    - D3: на загрузке нет клиентских `/api/auth/me` и `/api/auth/refresh`;
    - после logout подставленный вручную старый access-cookie даёт 401;
    - раздел `/admin/users` недоступен роли `user`.
  - `auth.setup.ts` (один вход на аккаунт) сохраняется. Лимит 5 входов в минуту из фазы 1 больше не действует (считаются только неудачи), счёт входов в e2e не ограничен. Флаги `AUTH_SESSION_ENFORCE_DB`, `RBAC_USE_DB_OVERRIDES` уходят из `e2e/playwright.config.ts:73-74`.
  - Перед закрытием фазы `yarn e2e` зелёный на `chromium-desktop` и `chromium-mobile` (вне `yarn verify`).
- **D-24 [авто]: выкатка — только описание, выполняет пользователь.**
  1. Read-only проверка `__drizzle_migrations` на проде.
  2. `yarn workspace @bio-exam/server drizzle:migrate` с 0021 на проде; миграция аддитивна, старый код с ней работает.
  3. Деплой server.
  4. Деплой web.
  5. Удаление `DATABASE_URL` и `AUTH_JWT_SECRET` из env web-проекта Vercel; проверка env server-проекта.
  Preview до прода: вход, refresh по истечении access (на preview — с укороченным `ACCESS_TOKEN_EXPIRES_SEC`), выход, D8, троттлинг, IP за rewrite (D-12). Агенты к проду не подключаются.

### Claude's Discretion
- Имена и раскладка модулей (`services/access-policy`, `lib/session` и т. п.), форма типов принципала и транспорта.
- Колонки таблицы сессий сверх перечисленных в D-05 (IP, user-agent), имя таблицы троттлинга, очистка старых записей троттлинга (при записи или не нужна при текущем объёме).
- Одна миграция 0021 или две (сессии и троттлинг); условие — обе аддитивны и проходят `check-migrations`. `drizzle-kit generate` даёт только DDL: бэкфилл D-09 дописывается в тот же SQL-файл вручную, после чего пересчитывается `migrations-manifest.json`; на пустой БД `check-migrations` бэкфилл ничего не делает, поэтому его проверяет отдельный DB-тест на `test_*` с заранее вставленными refresh-токенами.
- Как тест попадает «позже 30 с» для replay (D-07): сдвиг `used_at` в прошлое в `test_*` или часы, переданные модулю.
- Как именно проверяется истечение access в proxy (порог 60 с, разбор payload) и как подставляются cookie для RSC.
- Механика проактивного refresh (таймер, `visibilitychange`), сохранение событий `logout`/`auth-change`/`avatar-changed` между вкладками.
- Подключить тот же троттлинг к проверке старого пароля в `/api/users/profile/password` вместо in-memory лимитера (`profile.ts:119`).
- Удалить мёртвый `middleware/auth/basic-admin.ts` (вызовов нет) вместе с `ADMIN_LOGIN`, `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD` в `app/server/.env.example`, если `codegraph` это подтверждает (`ADMIN_BOOTSTRAP_*` остаются).
- Принимать ли кроме `callbackUrl` старые синонимы (`from`, `next`, `redirectTo`, `returnTo`, `redirect`, `LoginPageClient.tsx:50-61`).
- Тексты ответов 401/429 и их перевод на странице логина (сейчас сервер отдаёт английские строки, `lib/constants.ts:21-26`, а страница показывает их как есть).
- **UI-SPEC нужен, узкий** (`gsd-ui-phase` перед планированием): состояние 429 на странице логина с временем ожидания; вид «нет доступа» для разделов `/admin`; поведение при истёкшей или отозванной сессии; кнопки «завершить все сеансы» и «снять ограничение входа» в карточке пользователя с подтверждением.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Решения и охват
- `docs/adr/0001-express-owns-data-and-access-policy.md` — решение (обязательно).
- `docs/adr/0003-verification-before-refactoring.md` — характеризационные тесты до изменений.
- `plans/003-auth-session-security.md` — шаги 1-6, тест-план, STOP-условия.
- `plans/011-architecture-deepening.md` — §1 D3, D4, D8; §2 C5, C6; §3 «Выдача сессии на сервере»; §4 порядок.
- `plans/007-frontend-runtime.md` — шаг 1 (граница с Phase 8: модуль запросов строится поверх модуля сессии).
- `plans/010-module-decomposition.md` — шаг 4 (окончательное удаление Next-auth, выполняется здесь).
- `plans/beget-migration.md` §3.4 — web без DB-секрета и JWT-секрета; Phase 4 закрывает этот раздел.
- `plans/README.md` — «003 must land before 004/006».
- `.planning/ROADMAP.md` — Phase 4: цель, 5 критериев успеха, UI hint.
- `.planning/REQUIREMENTS.md` — AUTH-01 … AUTH-12 (`:47-58`), ATT-01 (`:62`, граница), PRIV-01 (`:105`, граница), HTTP-01/02 (`:111-112`, граница), Out of Scope (`:156-172`).
- `.planning/PROJECT.md` — locked D-01, resolved D-09, Constraints (Security, Data safety).
- `.planning/STATE.md` — Blockers/Concerns по Phase 4 (общее хранилище, D8 «по отчёту»), N1, Deferred Verification фаз 2 и 3.
- `.planning/phases/01-verification-baseline/deferred-items.md` — двойной refresh в `AuthProvider`.
- `.planning/phases/01-verification-baseline/01-SCHEMA-DIFF.md` — история `__drizzle_migrations` на проде (первая новая миграция после фазы 1).
- `.planning/phases/03-exam-core/03-CONTEXT.md` — образец решений, охранного теста и списка мест.

### Server
- `app/server/src/middleware/auth/session.ts`, `requirePerm.ts`, `basic-admin.ts`; `app/server/src/middleware/rateLimiter.ts`.
- `app/server/src/routes/auth/login.ts`, `refresh.ts`, `logout.ts`, `me.ts`, `index.ts`, `invites.ts`; `app/server/src/routes/index.ts` (монтирование `/auth/refresh`, `:22`).
- `app/server/src/services/rbac/rbac.ts`; `app/server/src/routes/rbac/index.ts`; `app/server/src/schemas/rbac.ts`.
- `app/server/src/routes/tests/public.ts` (`:152`, `:196`, `:303`, `:409`), `routes/settings.ts`, `routes/search.ts`, `services/search/database-search.ts`, `routes/users/index.ts`, `routes/users/profile.ts`.
- `app/server/src/config/auth.ts`, `lib/constants.ts`, `app.ts` (`trust proxy`, глобальный `sessionOptional`).
- `app/server/src/db/schema.ts` — `users` (`:56-101`), `roles`, `user_roles`, `rbac_*` (`:103-201`), `refresh_tokens` (`:602-624`).
- `app/server/drizzle/meta/_journal.json`, `migrations-manifest.json`, `scripts/check-migrations.mjs`.
- `app/server/src/test-support/http.ts`, `test-database.ts`; `routes/uploads.test.ts`, `routes/tests/exam-flow.test.ts`.
- `app/server/.env.example`, `scripts/check-env-contract.mjs`.

### Пакет
- `packages/rbac/src/{index,rbac,roles,domains,access}.ts`, `index.test.ts`; `scripts/check-rbac-dist.mjs`.

### Web
- `app/web/lib/auth/{getServerMe,fetchMe,refresh,authMePayload,loginRedirect,sessionCookie,validators}.ts`, `getServerMe.test.ts`, `loginRedirect.test.ts`, `sessionCookie.test.ts`.
- `app/web/lib/auth/server/getMeData.ts`, `app/web/app/api/auth/me/route.ts`, `app/web/lib/env/server.ts`.
- `app/web/lib/api-fetch.ts`, `app/web/lib/fetcher.ts`, `app/web/lib/tests/api.ts` (граница Phase 8).
- `app/web/proxy.ts`, `app/web/next.config.ts` (rewrites `beforeFiles`).
- `app/web/components/providers/AuthProvider.tsx`, `components/auth/AuthGuard.tsx`, `app/providers.tsx`, `components/AppLayout/AppLayout.tsx`, `components/nav-user.tsx`.
- `app/web/app/(internal)/login/LoginPageClient.tsx`, `app/(internal)/invite/[token]/InviteClient.tsx`.
- `app/web/app/(internal)/(protected)/admin/layout.tsx`, `admin/settings/rbac/layout.tsx`, `admin/page.tsx`, `admin/users/[id]/page.tsx`, `profile/[id]/page.tsx`, `profile/page.tsx`, `profile/ProfileClient.tsx`, `dashboard/DashboardClient.tsx`.
- `app/web/package.json`, `app/web/.env.example`.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` — runtime и порядок выполнения proxy, cookie и заголовки запроса.

### E2E и скрипты
- `e2e/auth.setup.ts`, `e2e/fixtures/accounts.ts`, `e2e/fixtures/exam.ts` (`newSessionContext`), `e2e/playwright.config.ts`.
- `e2e/tests/auth.spec.ts`, `proxy-protection.spec.ts`, `take-test.spec.ts`, `authoring.spec.ts`, `review.spec.ts`.
- `scripts/e2e.mjs`, `scripts/lib/e2e-web-env.mjs`, `scripts/exam-core-no-private-copies.test.mjs` (образец охранного теста), `scripts/verify.mjs`, `scripts/with-test-db.mjs`.

### Карта кода
- `.planning/codebase/ARCHITECTURE.md`, `CONVENTIONS.md` — сняты на `29563ff`, частично устарели; номера строк сверять с кодом.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `services/rbac/rbac.ts:62-141` — разворот ролей с allow/deny из БД; основа модуля D-01 (без кэшей, с `inherits`).
- `packages/rbac` — реестр, домены, `can`, нормализаторы; `ROLE_REGISTRY` сейчас без `inherits` (`roles.ts:18-31`), поэтому `inherits` проверяется на синтетическом реестре.
- `lib/auth/refresh.ts` — single-flight на вкладку; ядро цепочки D-13.
- `lib/auth/authMePayload.ts` `parseAuthMe` — разбор контракта `/api/auth/me`; поле `accessExpiresAt` добавляется аддитивно.
- `app/server/src/test-support/http.ts`, `test-database.ts`, `app.ts` (default export) — тесты маршрутов на `test_*`.
- `e2e/tests/proxy-protection.spec.ts` (матрица `@proxy`), `e2e/tests/auth.spec.ts` (вход и выход отдельным пользователем).
- `scripts/exam-core-no-private-copies.test.mjs` — образец охранного теста D-21.

### Established Patterns
- Сессия: `app.use(sessionOptional())` для всех запросов (`app.ts:91-92`), `sessionRequired()` на маршрутах, `requirePerm(domain, action)` перед обработчиком.
- Токены: access-JWT (`sub`, `roles`, `login` у login; `sub`, `roles` у refresh) в cookie `bio_exam_session`; refresh — 64 случайных байта, в БД sha256 (`refresh_tokens.token_hash`), cookie `refresh_token` на `Path=/`.
- Новые таблицы: `.enableRLS()` и `denyDirectAccessPolicy()`; миграции через `drizzle-kit generate`, манифест sha256, `check-migrations` в `yarn verify`.
- Флаги среды выбирают поведение: в production проверка БД, переопределения и fail-closed включены, в разработке и тестах — нет (`session.ts:64`, `rbac.ts:16-17`). D-02 оставляет одно поведение.
- Web-тесты Vitest в Node без DOM; Express-тесты через настоящий `app.ts`.

### Integration Points
- Express: `routes/index.ts:20-30` (монтирование), `app.ts:91-92`, все `requirePerm` (`routes/tests/index.ts`, `assignments.ts`, `users/index.ts`, `groups/index.ts`, `rbac/index.ts`, `sidebar/index.ts`, `auth/invites.ts`).
- Web: `AppLayout` (SSR `getServerMe`, `initialMe`), `proxy.ts` (все страничные запросы), `apiFetch` (24 потребителя), `getServerMe` (вызывают `AppLayout`, `profile/page.tsx`, `profile/[id]/page.tsx`, `admin/users/[id]/page.tsx`).
- Прод: Vercel web и server раздельно, миграции применяет пользователь (`drizzle:migrate`), `API_ORIGIN` задаёт rewrites (`next.config.ts:22-38`).

### Поимённый список мест (для верификатора)
Алгоритмы прав (остаётся один, D-01):
1. `packages/rbac/src/rbac.ts:20-40` `buildPermissionSet` (с `inherits`).
2. `app/server/src/services/rbac/rbac.ts:62-141` `buildPermissionSet`, `buildPermissionSetForUser` (без `inherits`, с кэшами).
3. `app/server/src/routes/rbac/index.ts:91-134` — эффективные права на месте.
4. `app/web/lib/auth/server/getMeData.ts:126-216` (с объединением ролей JWT).
5. `app/server/src/routes/auth/me.ts:27-32` — запасной набор по ролям.

Решения о доступе по строкам ролей (D-04, D-17):
6. `app/server/src/routes/tests/public.ts:152`, `:196`, `:303`, `:409`.
7. `app/server/src/routes/settings.ts:25`, `:51`.
8. `app/server/src/services/search/database-search.ts:84`.
9. `app/server/src/middleware/auth/session.ts:99` — объединение ролей БД и JWT.
10. `app/web/components/auth/AuthGuard.tsx:61-63` — обход `isAdmin`.
11. `app/web/app/(internal)/(protected)/profile/ProfileClient.tsx:109`, `profile/[id]/page.tsx:15`, `dashboard/DashboardClient.tsx:181`, `admin/users/[id]/page.tsx:42`.
12. `app/web/app/(internal)/(protected)/admin/layout.tsx:4` — `/admin/**` по `rbac.*`.
Остаются (не доступ): `routes/tests/index.ts:2471`, `:2551` (`studentOnly`), `routes/rbac/index.ts:48`, `:74`, `:148`.

Выдача сессии (D-10):
13. `readCookie`: `session.ts:25-38`, `refresh.ts:15-28`, `logout.ts:11-24`.
14. Склейка Set-Cookie: `login.ts:135-153`, `refresh.ts:73-91`, `logout.ts:40-63`; перезапись в `session.ts:40-59`.
15. Выпуск JWT: `login.ts:114-117`, `refresh.ts:49-50` (без `login`); `test-support/http.ts:9-14`.

Web-сессия (D-13 … D-15):
16. Refresh с повтором: `lib/api-fetch.ts:10-21` (по 401), `lib/auth/fetchMe.ts:19-32` (по 401 и по 200 с `ok:false`), `AuthProvider.tsx:70-84` (голый `fetch`).
17. Редирект на логин: `proxy.ts:27-29`, `AuthGuard.tsx:48-54`, `lib/auth/loginRedirect.ts`, `LoginPageClient.tsx:16-36` (`safeRedirect`).
18. Два `AuthProvider`: `app/providers.tsx:29`, `AppLayout.tsx:27`.
19. Выход: `components/nav-user.tsx:41`, `profile/ProfileClient.tsx:213`.

Next-дубликат (D-18):
20. `lib/auth/server/getMeData.ts`, `app/api/auth/me/route.ts`, `lib/env/server.ts`, `getServerMe.ts:25-26`, зависимости `pg`/`jsonwebtoken` в `app/web/package.json`, ключи в `app/web/.env.example` и `scripts/lib/e2e-web-env.mjs`.

Защита входа (D-11):
21. `login.ts:55-69` (in-memory лимитер 5/мин), `login.ts:73-98` (блокировка на 30 минут), `middleware/rateLimiter.ts:101-105` (`loginRateLimiter`, не используется), `refresh.ts:30` (лимитер refresh).

### Риски, найденные при разведке
- Голые `fetch` без обработки 401 при access в 15 минут — закрывает D-16 до Phase 8.
- Вращение refresh при общем `storageState` в e2e — закрывает D-23.
- Источник IP за rewrite Vercel не установлен — D-12, preview.
- Первая новая миграция после фазы 1: на проде история `__drizzle_migrations` для 0000-0013 хранит имена вместо sha256 и содержит лишнюю `0010_test_drafts`. Мигратор применяет записи с `when` больше последнего `created_at`, поэтому последней на проде должна быть 0020 (`when` = `1784985600000`). Проверка — в «Требует подтверждения».
- `app.use(sessionOptional())` выполняется на каждом запросе с cookie, в том числе `/healthz`. С проверкой сессии это 1-2 запроса к БД на запрос; кэш на время запроса (D-03) убирает повторы внутри запроса.

</code_context>

<specifics>
## Specific Ideas

### Требует подтверждения пользователя (фазу не блокирует)
1. **Сроки токенов и env server-проекта (D-06).** Access 15 минут вместо 30 дней, диапазон `ACCESS_TOKEN_EXPIRES_SEC` 60 … 3600 с ошибкой при старте вне его. До деплоя проверить env server-проекта Vercel: если `ACCESS_TOKEN_EXPIRES_SEC` задан больше 3600, сервер не стартует; `SESSION_MAX_AGE_DAYS` и `REFRESH_TOKEN_EXPIRES_DAYS` задают только срок refresh.
2. **Существующие сессии и миграция с данными (D-05, D-09).** 0021 создаёт сессии из действующих refresh-токенов, повторный вход не нужен. Альтернатива — не переносить и отозвать всё (все 31 пользователь входят заново; студент посреди теста попадёт на логин, черновик на сервере сохранится). Read-only на проде:
   ```sql
   SELECT count(*) AS active_refresh, count(DISTINCT user_id) AS users
   FROM refresh_tokens
   WHERE revoked_at IS NULL AND expires_at > now();
   ```
3. **Первая боевая миграция и порядок выкатки (D-24).** Перед `drizzle:migrate` read-only проверить, что последней записью мигратора на проде остаётся 0020:
   ```sql
   SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 3;
   ```
   Ожидание: верхняя строка с `created_at = 1784985600000` (0020). Иначе — стоп и решение по истории до применения 0021. Порядок: миграция → server → web → чистка env web.
4. **Окно повтора refresh и отзыв при replay (D-07).** Повтор использованного refresh-токена позже 30 с отзывает сессию: на этом устройстве пользователь выйдет. Это случится, например, если ответ refresh потерялся в сети и браузер остался со старым токеном. Потеря ответа ротации (оборванная навигация, перезагрузка во время холодного старта, RSC-prefetch) ведёт к выходу через ~15 минут, в том числе посреди работы: ответ `reused` в окне 30 с выдаёт только access, а следующий refresh по истечении access попадает в replay. Дизайн не меняется; клиент и proxy своего таймаута на refresh не ставят, чтобы не создавать таких обрывов самим. Нужно согласие на такую цену строгой ротации.
5. **Троттлинг вместо блокировки (D-11).** Вместо «5 неудач → 403 на 30 минут» и in-memory лимита 5/мин: паузы от 30 с до 15 мин для пары (логин, IP; до подтверждения источника IP — до 60 с, п. 6), до 60 с по логину, ответ 429 с `Retry-After`. Текущие блокировки (`locked_until` в будущем) перестают действовать при выкатке. Read-only:
   ```sql
   SELECT count(*) FROM users WHERE locked_until > now();
   ```
6. **Источник IP за Vercel (D-12).** На preview проверить, какой IP видит Express для двух разных клиентов через rewrite web → server. До подтверждения `IP_TRUSTED = false`: корзина «IP по всем логинам» выключена, потолок пары 60 с. Проверка — стоп-условие перед включением константы. Для Milestone 2 (nginx на VPS) проверка повторяется.
7. **Новые маршруты и поля API (D-08, D-12, D-16).** `accessExpiresAt` в ответах login, refresh, `/api/auth/me`; маршруты администратора «завершить все сеансы пользователя» и «снять ограничение входа» (право `users.edit`); refresh без IP-лимита; кнопки в карточке пользователя (UI-SPEC).
8. **Видимые последствия отзыва (D-08).** Выход завершает сессию сразу; смена пароля завершает все остальные сеансы, текущий остаётся; деактивация выкидывает пользователя на следующем запросе.
9. **Гейты `/admin` и замены `isAdmin` (D-04, D-17).** Для ролей `admin` и `user` доступ не меняется; меняется для переопределений из `rbac_user_grants` и `rbac_role_grants`. Перед выкаткой посмотреть, есть ли они на проде (read-only):
   ```sql
   SELECT role_key, domain, action, allow FROM rbac_role_grants ORDER BY 1, 2, 3;
   SELECT user_id, domain, action, allow FROM rbac_user_grants ORDER BY 1, 2, 3;
   ```
   Отдельно: редактор аватара показывается по `users.edit` (как сейчас — только admin), хотя Express разрешает загрузку аватара любому вошедшему. Показывать ли его всем — решение пользователя, в фазе поведение не меняется.
10. **`/api/auth/me` без запасного набора и fail-closed (D-02).** При ошибке БД прав `/api/auth/me` отвечает ошибкой вместо базовых прав по ролям; в разработке и тестах отказ при ошибке БД тоже включается.
11. **Env (D-02, D-18, Discretion).** Новых ключей нет. Из `app/server/.env.example` уходят `AUTH_SESSION_ENFORCE_DB`, `RBAC_USE_DB_OVERRIDES`, `RBAC_DB_FAIL_OPEN` (и `ADMIN_LOGIN`, `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD`, если удаляется `basic-admin.ts`); из `app/web/.env.example` — `DATABASE_URL`, `PG_*`, `AUTH_JWT_SECRET`, `NEXTAUTH_*`. В Vercel web-проекте после деплоя удалить `DATABASE_URL` и `AUTH_JWT_SECRET` (beget-migration §3.4); ключи, оставшиеся в Vercel server-проекте, безвредны.
12. **Preview Vercel (D-14, D-24).** Обновление сессии в `proxy.ts` на Vercel (Node runtime, перенос `Set-Cookie` с ответа Express), вход, выход, refresh после истечения access, D8 на `/profile/<login>`, ответ 429. Удобно объединить с отложенными preview фаз 2 и 3 (`STATE.md`, Deferred Verification).

### Прочее
- Рабочее дерево ветки `phase-1-verification` содержит незакоммиченные изменения фаз 2 и 3. До исполнения фазы 4 их нужно закоммитить по границам из `.planning/commit-snapshots/README.md`, иначе диффы фаз смешаются.
- D8 «по отчёту» (`STATE.md`): по коду он проявляется на серверных страницах, которые делают `redirect` при `getServerMe() === null` (`profile/[id]`, `admin/users/[id]`); клиентские страницы восстанавливаются через `fetchAuthMe`. Первый план воспроизводит его e2e-тестом (D-19).
- STOP плана 003 «нет общего хранилища» снят решением D-11 (PostgreSQL). STOP «путь совместимости сохраняет 30-дневный bearer» снят D-06 и D-09. STOP «ответы Next и Express нельзя сделать совместимыми без отдельной миграции» не срабатывает: web уже читает контракт Express (`parseAuthMe`), Next-ветка удаляется.
- Открытый редирект в `safeRedirect` (`//host`) закрывается в D-13 как часть модуля редиректа.

</specifics>

<deferred>
## Deferred Ideas

- Проверка назначения в `/start`, `/submit`, PATCH черновика (N1), правило «назначен или привилегирован» для всех операций попытки — Phase 5 (ATT-01); модуль политики D-01 — его основа.
- Перевод голых `fetch`, `lib/fetcher.ts` и локальных SWR-fetcher'ов на модуль запросов, удаление `swrConfig`/`swrOptions`, `absoluteUrl` — Phase 8 (HTTP-01 … 04).
- Удаление `users.read` из роли `user`, минимальный DTO справочника — Phase 7 (PRIV-01 … 03); после него гейт `/admin/users` можно пересмотреть.
- Миграция, удаляющая `users.failed_login_attempts`, `users.locked_until` и `idx_users_locked_until`, — отдельное решение (деструктивная).
- Таблица `rbac_page_rules` и маршруты `/api/rbac/pages` (web их не читает): удалить или сделать источником гейтов — отдельное решение (посторонние изменения RBAC вне фазы).
- Роль `teacher` или иные новые роли — Out of Scope (unrelated RBAC changes).
- Абсолютный предел жизни сессии, список своих устройств и выход с выбранного устройства — новая функциональность, требований нет.
- Внешние провайдеры, 2FA — Out of Scope.
- Фильтр `studentOnly` по строке роли в статистике администратора — классификация данных, а не доступ; пересмотреть вместе с аналитикой.
- Нормализация истории `__drizzle_migrations` на проде — Milestone 2 (`01-SCHEMA-DIFF.md`).
- Видимая кнопка открытия бокового меню на мобильных (выход недоступен касанием, Phase 1 `deferred-items.md`) — не требование AUTH; отдельная UI-правка.
- Показ редактора аватара всем пользователям — решение пользователя (`<specifics>` п. 9).

</deferred>

---

*Phase: 4-Authentication and web session*
*Context gathered: 2026-10-04 (autonomous smart discuss)*
