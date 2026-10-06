---
phase: 04-authentication-and-web-session
verified: 2026-10-04T17:45:00+07:00
status: passed
human_verification_confirmed: "2026-10-05, пользователь"
score: 5/5 must-haves verified
covered_files:
  - .planning/phases/04-authentication-and-web-session/04-01-PLAN.md
  - .planning/phases/04-authentication-and-web-session/04-01-SUMMARY.md
  - .planning/phases/04-authentication-and-web-session/04-02-PLAN.md
  - .planning/phases/04-authentication-and-web-session/04-02-SUMMARY.md
  - .planning/phases/04-authentication-and-web-session/04-03-PLAN.md
  - .planning/phases/04-authentication-and-web-session/04-03-SUMMARY.md
  - .planning/phases/04-authentication-and-web-session/04-04-PLAN.md
  - .planning/phases/04-authentication-and-web-session/04-04-SUMMARY.md
  - .planning/phases/04-authentication-and-web-session/04-05-PLAN.md
  - .planning/phases/04-authentication-and-web-session/04-05-SUMMARY.md
  - .planning/phases/04-authentication-and-web-session/04-06-PLAN.md
  - .planning/phases/04-authentication-and-web-session/04-06-SUMMARY.md
  - .planning/phases/04-authentication-and-web-session/04-07-PLAN.md
  - .planning/phases/04-authentication-and-web-session/04-07-SUMMARY.md
  - .planning/phases/04-authentication-and-web-session/04-08-PLAN.md
  - .planning/phases/04-authentication-and-web-session/04-08-SUMMARY.md
  - .planning/phases/04-authentication-and-web-session/04-09-PLAN.md
  - .planning/phases/04-authentication-and-web-session/04-09-SUMMARY.md
  - .planning/phases/04-authentication-and-web-session/04-10-PLAN.md
  - .planning/phases/04-authentication-and-web-session/04-10-SUMMARY.md
  - .planning/phases/04-authentication-and-web-session/04-11-PLAN.md
  - .planning/phases/04-authentication-and-web-session/04-11-SUMMARY.md
  - .planning/phases/04-authentication-and-web-session/04-12-PLAN.md
  - .planning/phases/04-authentication-and-web-session/04-12-SUMMARY.md
  - .planning/phases/04-authentication-and-web-session/04-13-PLAN.md
  - .planning/phases/04-authentication-and-web-session/04-13-SUMMARY.md
  - .planning/phases/04-authentication-and-web-session/04-14-PLAN.md
  - .planning/phases/04-authentication-and-web-session/04-14-SUMMARY.md
covered_digest: "v2:sha256:4eb31136b9d12d030321a2bbccb0215c118f496a5a287b2b7b4937c4924a5d9a"
code_basis:
  worktree: /private/tmp/claude-501/-Users-kdvornichenko-bio-exam/bde259ee-d6cb-4f21-8450-32718d096f81/scratchpad/wt-p4fix
  branch: gsd/phase-04-fix
  range: bf332e6..f68af13
  head: f68af13b8d2766fb846341e76cf1637b97210beb
  merged_into_dev: true
  note: "Файлы кода не входят в covered_files: коммиты ad13e1b и f68af13 есть только в ветке gsd/phase-04-fix, в основном дереве (dev, 256aca8) их нет. После слияния в dev covered_digest пересчитать через verification.fingerprint вместе с файлами кода."
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "SEC-07: absoluteUrl и x-forwarded-host"
    addressed_in: "Phase 8"
    evidence: "04-REVIEW-DISPOSITION.md «Отложено → Phase 8 (HTTP-04)»"
  - truth: "CR-09: чтение тела ответа в getServerMe"
    addressed_in: "Phase 8"
    evidence: "04-REVIEW-DISPOSITION.md «Отложено → Phase 8 (HTTP-04)», только вместе с yarn e2e"
  - truth: "Проверка isActive при выдаче приглашения, если teacher получит users.invite"
    addressed_in: "Phase 7.1"
    evidence: "04-REVIEW-DISPOSITION.md «Отложено → Phase 7.1»"
  - truth: "D1: проверка попытки администратором идёт по текущему ключу ответов (e2e @known-defect, test.fail)"
    addressed_in: "Phase 5"
    evidence: "e2e/tests/review.spec.ts:303 «D1 — fixed in Phase 5 (SCORE-03)»"
human_verification:
  - test: "Слить gsd/phase-04-fix (ad13e1b, f68af13) в dev"
    expected: "dev содержит правки ревью; yarn verify на dev даёт yarn verify: OK"
    why_human: "Проверенный код лежит только в ветке worktree; коммиты и слияние делает пользователь"
  - test: "Runbook D-24, шаг 1: read-only SQL на проде (__drizzle_migrations, refresh_tokens активные, users.locked_until > now(), rbac_role_grants, rbac_user_grants)"
    expected: "Последняя миграция 0020 (created_at = 1784985600000); известны число сессий для бэкфилла, число действующих блокировок и список переопределений прав"
    why_human: "Агентам доступа к проду нет; checkpoint:human-verify gate=blocking-human в 04-03 Task 4 и 04-14 Task 4"
  - test: "Runbook D-24, шаг 4: drizzle:migrate с 0021 на проде до merge в master (и до push, если Preview смотрит в прод)"
    expected: "Последней записью мигратора стала 0021; count(*) auth_sessions примерно равен active_refresh из шага 1"
    why_human: "Запись в боевую базу выполняет только пользователь"
  - test: "Env Vercel server-проекта (Production и Preview): ACCESS_TOKEN_EXPIRES_SEC не задан или 60…3600; SESSION_MAX_AGE_DAYS и REFRESH_TOKEN_EXPIRES_DAYS, если заданы, целые 1…365; AUTH_SESSION_ENFORCE_DB, RBAC_USE_DB_OVERRIDES, RBAC_DB_FAIL_OPEN, ADMIN_LOGIN, ADMIN_PASSWORD_HASH, ADMIN_PASSWORD можно удалить; выяснить, куда смотрит DATABASE_URL в Preview"
    expected: "Сервер стартует (parseAccessTokenTtl и parseDays бросают ошибку на значениях вне диапазона)"
    why_human: "Настройки Vercel вне репозитория"
  - test: "Env Vercel web-проекта: после выкатки web удалить DATABASE_URL и AUTH_JWT_SECRET"
    expected: "Web собирается и работает без них (в app/web этих ключей нет, охранный тест D-21 зелёный)"
    why_human: "Настройки Vercel вне репозитория"
  - test: "Preview-чеклист: вход; refresh после истечения access при ACCESS_TOKEN_EXPIRES_SEC=60; выход и отказ старого access; D8 (удалить cookie bio_exam_session, открыть /profile/<логин>, нет /login, в ответе документа Set-Cookie bio_exam_session); 429 на логине с отсчётом; кнопки «Сеансы и вход»; 375px: логин длиной 32 символа переносится, у диалога нет горизонтального скролла, кнопки во всю ширину"
    expected: "Все пункты проходят на Vercel (Node runtime, перенос Set-Cookie из proxy)"
    why_human: "Поведение proxy.ts на Vercel и визуальная проверка; e2e покрывает только локальный стенд"
  - test: "Стоп-условие IP (D-12): на preview посмотреть, какой IP видит Express у двух разных клиентов за rewrite web → server"
    expected: "Пока адреса не подтверждены, IP_TRUSTED остаётся false (потолок пары 60 с, корзины по IP нет)"
    why_human: "Нужен реальный сетевой путь Vercel"
  - test: "Merge и откат: production-деплой server доходит до Ready раньше web; при откате сначала web, затем server через Instant Rollback, до и после отката UPDATE refresh_tokens SET revoked_at = used_at WHERE used_at IS NOT NULL AND revoked_at IS NULL"
    expected: "Нет окна, где новый web работает со старым server; откат не открывает уже использованные refresh-токены"
    why_human: "Операции на проде"
  - test: "Подтвердить решения [авто]: D-09 (бэкфилл сессий без повторного входа); fail-closed (ошибка БД прав или сессии даёт 500, а не базовые права); цена строгой ротации (потерянный ответ refresh даёт выход примерно через 15 минут); логин принимает только callbackUrl; CR-12: тост «Вы вышли из аккаунта» почти не виден после перехода на /login; редактор аватара по users.edit; rbac.write без rbac.read не открывает /admin; пункты UI-SPEC из 04-12 и 04-13"
    expected: "Пользователь принимает каждое решение или заводит правку"
    why_human: "Решения приняты автономно и требуют согласия пользователя; исполнитель их не одобрял"
---

# Фаза 4: Authentication and web session — отчёт о проверке

**Цель фазы:** Access is decided in one place (Express) from current DB state, sessions are short-lived and revocable, and the web only shows what Express says.
**Проверено:** 2026-10-04
**Статус:** human_needed
**Повторная проверка:** нет, первичная

**Код проверен в worktree** `scratchpad/wt-p4fix`, ветка `gsd/phase-04-fix`, HEAD `f68af13`, рабочее дерево чистое. **Эти коммиты (`ad13e1b`, `f68af13`) не слиты в `dev`**: основной HEAD `256aca8` их не содержит (`git merge-base --is-ancestor f68af13 HEAD` → нет). Слияние в `dev` — первый пункт ручной проверки.

## Достижение цели

### Наблюдаемые истины (ROADMAP success criteria)

| # | Критерий | Статус | Доказательства |
|---|---|---|---|
| 1 | Снятие роли или смена пароля видны на следующем запросе; logout делает access-токен недействительным, 30-дневного окна нет | ✓ VERIFIED | `sessionOptional` на каждом запросе вызывает `loadSessionUser(sid, userId)`: join `auth_sessions` + `users`, `revoked_at IS NULL`, `is_active`. Права берутся из `accessPolicy.accessFor` без кэша, только `WeakMap` на время запроса. Access содержит `sub`, `sid`, `login`, ролей нет. TTL 900 с, границы 60…3600 (`config/auth.ts`). Тесты: `AUTH-02-role-removed` (403 после снятия admin), «смена пароля отзывает остальные сессии… текущая продолжает работать», `AUTH-04-logout`, «logout с действующими cookie… старые access и refresh 401». e2e `AUTH-04: after logout the old access cookie is rejected` проходит на desktop и mobile. Смена пароля отзывает остальные сессии, текущая продолжает работать (D-08) |
| 2 | Два параллельных refresh дают одного преемника; replay отзывает семейство; сбой транзакции не ставит access-cookie | ✓ VERIFIED | `rotateRefreshToken`: атомарный `UPDATE … SET used_at WHERE used_at IS NULL … RETURNING`, проигравший уходит в `classifyRepeat`. В окне 30 с ответ `reused` даёт только access. После окна или при использованном преемнике — `revokeSession(…,'replay')`. Cookie ставятся после коммита. Тесты: `AUTH-05-parallel-refresh`, «пять параллельных refresh… ровно один преемник», «повтор позже 30 с: 401, сессия отозвана с replay», «отказ транзакции: 500 без Set-Cookie», NQ-02, CR-05 (без deadlock), NQ-03 |
| 3 | Неудачные входы замедляются троттлингом аккаунт+IP без блокировки на 30 минут; есть путь восстановления | ✓ VERIFIED | `login_throttle` в PostgreSQL, корзины `pair` и `login` (`ip` при `IP_TRUSTED`). Потолки: пара 60 с при `IP_TRUSTED=false`, логин 60 с. 429 с `Retry-After` до bcrypt. `users.locked_until` осталась в схеме, `login.ts` её не читает. Восстановление: `DELETE /api/users/:id/login-throttle` (`users.edit`), кнопка «Снять ограничение входа» и SQL-runbook в `app/server/README.md` («Снять ограничение входа»). Тесты: `AUTH-06-foreign-ip`, «общий IP: владелец ждёт не дольше 60 с», «12 одновременных неудач… не больше 6 ответов 401», «администратор снимает ограничение», e2e 429 на странице логина. SEC-04 — принятый риск, решение пользователя 2026-10-04 |
| 4 | `/api/auth/me` и `requirePerm` совпадают для ролей и переопределений; D4 закрыт; гейты UI по тому же списку прав, без обхода `isAdmin` | ✓ VERIFIED | Один модуль `services/access-policy` (шов `GrantsLoader`, адаптеры Drizzle и in-memory). Через него идут `requirePerm`/`requirePermKey`, `/api/auth/me`, search, `GET /api/rbac/user/:id/grants`. Тест `me-requirePerm-parity`: admin, user, user+allow, user+deny, admin+deny в `rbac_role_grants`, проверка по каждому `PermissionKey`. D4: `AUTH-03-d4-allow` и таблица исходов `access-routes.test.ts`. UI: одна карта `SECTION_PERMISSIONS`, `requireSectionAccess` в layout каждого поддерева `/admin`, тот же список в `AuthGuard`, обхода `isAdmin` нет. Охранный тест D-21 8/8. `/admin/users → users.edit` при `GET /api/users → users.read` — решение D-17, а не расхождение |
| 5 | SSR с истёкшим access и живым refresh обновляет сессию (D8); один `AuthProvider` и один `/api/auth/me` на загрузку (D3); несколько 401 дают один refresh; в `app/web` нет `pg`, `jsonwebtoken`, `DATABASE_URL`, `AUTH_JWT_SECRET`, `getMeData` и Next `/api/auth/me` удалены | ✓ VERIFIED | `proxy.ts`: `needsRefresh` и `refreshForProxy`, новый cookie уходит в запрос RSC и в `Set-Cookie`. `AuthProvider` смонтирован один раз (`AppLayout` из `app/layout.tsx`) с `initialMe` из `getServerMe` (React `cache`). `sessionClient.refreshOnce` — single-flight. `app/web/app/api/auth` нет, `lib/auth/server/getMeData.ts` нет, в `app/web/package.json` нет `pg` и `jsonwebtoken`. `codegraph node getMeData` → «not found». Тесты: e2e D8 и D3 (0 запросов `/api/auth/me` и `/api/auth/refresh` из браузера) на обоих проектах, «три одновременных 401 дают один refresh», охранный тест D-21 |

**Счёт:** 5/5 истин подтверждено, без поведения, не подтверждённого тестом (0).

### Отложенные пункты

| # | Пункт | Где | Доказательство |
|---|---|---|---|
| 1 | SEC-07: `absoluteUrl` и `x-forwarded-host` | Phase 8 (HTTP-04) | 04-REVIEW-DISPOSITION «Отложено» |
| 2 | CR-09: чтение тела в `getServerMe` | Phase 8 (HTTP-04) | 04-REVIEW-DISPOSITION «Отложено» |
| 3 | `isActive` при выдаче приглашения, если `teacher` получит `users.invite` | Phase 7.1 | 04-REVIEW-DISPOSITION «Отложено» |
| 4 | D1 (`review.spec.ts:303`, `test.fail`) | Phase 5 (SCORE-03) | e2e помечен `@known-defect` |

### Требуемые артефакты

| Артефакт | Назначение | Статус | Детали |
|---|---|---|---|
| `app/server/src/services/access-policy/{policy,grants-loader,index}.ts` | Единый расчёт прав | ✓ VERIFIED | `computeAccess` с `inherits`, role grants, user grants; используется в `requirePerm.ts`, `me.ts`, search, rbac |
| `app/server/src/services/session/{index,tokens,cookies}.ts` | Выдача, ротация и отзыв сессий | ✓ VERIFIED | `openSession`, `rotateRefreshToken`, `revokeSession`, `revokeUserSessions`, `endSession`, `loadSessionUser` |
| `app/server/src/services/login-throttle/*` | Троттлинг входа | ✓ VERIFIED | `reserveAttempt` и `recordSuccess` в `login.ts` |
| `app/server/drizzle/0021_auth_sessions.sql` | Таблицы `auth_sessions`, `login_throttle`, поля `refresh_tokens` | ✓ VERIFIED | Шаг `migrations` в `yarn verify` пройден; `session-backfill.test.ts` зелёный |
| `app/server/src/routes/users/{sessions,login-throttle}.ts` | Маршруты администратора | ✓ VERIFIED | Под `users.edit`, покрыты тестами |
| `app/web/lib/session/{client,transport,server,redirect,keep-alive,access-token,proxy-refresh,route-permissions,section-access}.ts` | Модуль веб-сессии | ✓ VERIFIED | `httpTransport` и фейковый `SessionTransport` в `client.test.ts:47` |
| `app/web/proxy.ts` | Обновление сессии при SSR (D8) | ✓ VERIFIED | `proxy.test.ts` и e2e D8 |
| `app/web/components/providers/AuthProvider.tsx`, `components/auth/AuthGuard.tsx` | Один провайдер, гейт без `isAdmin` | ✓ VERIFIED | Одно место монтирования; `canAccessSection` |
| `scripts/auth-no-role-string-checks.test.mjs` | Охранный тест D-21 | ✓ VERIFIED | 8/8, входит в шаг `script-tests` |
| Удалены: `middleware/auth/basic-admin.ts`, `services/rbac/rbac.ts`, `packages/rbac/src/rbac.ts`, `app/web/app/api/auth/me/route.ts`, `lib/auth/server/getMeData.ts`, `lib/env/server.ts` | — | ✓ VERIFIED | Отсутствуют в HEAD |

### Проверка связей

| Откуда | Куда | Через | Статус |
|---|---|---|---|
| `requirePerm.ts` | `access-policy` | `requestAccess(req)` | WIRED |
| `routes/auth/me.ts` | `access-policy` | `requestAccess(req)` → `roles`, `perms` | WIRED |
| `middleware/auth/session.ts` | `services/session` | `verifyAccessToken` + `loadSessionUser` | WIRED |
| `routes/auth/refresh.ts` | `services/session` | `rotateRefreshToken` → `setSessionCookies` после коммита | WIRED |
| `routes/auth/logout.ts` | `services/session` | `endSession` → `revokeSession(…,'logout')`, очистка cookie в `finally` | WIRED |
| `routes/users/profile.ts`, `users/index.ts`, `auth/invites.ts` | `revokeUserSessions` | смена пароля, деактивация, accept приглашения (CR-03) | WIRED (тесты в `session-revocation.test.ts`) |
| `proxy.ts` | Express `/api/auth/refresh` | `refreshForProxy` + `apiUrl` (`API_ORIGIN`) | WIRED |
| `AppLayout.tsx` | `AuthProvider` | `initialMe` из `getServerMe`, `sessionError` из заголовка `x-session-refresh` | WIRED |
| `admin/**/layout.tsx` | `route-permissions` | `requireSectionAccess(section)` → `notFound()` | WIRED |

### Поток данных (уровень 4)

| Артефакт | Данные | Источник | Реальные данные | Статус |
|---|---|---|---|---|
| `AuthProvider` | `me`, `perms` | SSR `getServerMe` → Express `/api/auth/me` → `accessPolicy` → Drizzle | да | ✓ FLOWING |
| `/api/auth/me` | `perms` | `createDrizzleGrantsLoader(db)` (`user_roles`, `rbac_role_grants`, `rbac_user_grants`) | да | ✓ FLOWING |

### Поведенческие проверки

| Поведение | Команда | Результат | Статус |
|---|---|---|---|
| Web: модуль сессии, proxy, redirect, keep-alive, гейты | `yarn workspace @bio-exam/web test` (в worktree, HEAD f68af13, запущено проверяющим) | 20 файлов, 454 теста passed | ✓ PASS |
| Сервер: auth, access-policy, session, login-throttle, access-routes, logger, backfill | `node scripts/with-test-db.mjs yarn workspace @bio-exam/server vitest run src/routes/auth src/services/access-policy src/services/session src/services/login-throttle src/routes/tests/access-routes.test.ts src/lib/logger.test.ts src/db/session-backfill.test.ts` (запущено проверяющим) | 12 файлов, 223 теста passed | ✓ PASS |
| Охранный тест D-21 | `node --test scripts/auth-no-role-string-checks.test.mjs` (запущено проверяющим) | 8/8 | ✓ PASS |
| Полный гейт | `yarn verify` (лог `scratchpad/verify-p4fix.log`, 17:20) | `yarn verify: OK`, все 8 шагов passed | ✓ PASS (по логу) |
| e2e | `yarn e2e` (лог `scratchpad/e2e-p4fix.log`, 17:22) | 132 passed; `✘` только D1 `@known-defect` (`test.fail`) | ✓ PASS (по логу) |

Логи `yarn verify` и `yarn e2e` записаны раньше коммитов (17:20 и 17:22, коммиты 17:25). Содержимое совпадает: `git diff ad13e1b f68af13` — только две удалённые строки `AppLayout.tsx` (CR-12), которые были в рабочем дереве во время прогонов (04-REVIEW-FIX). Рабочее дерево worktree чистое. e2e проверяющий не перезапускал: в рамках задачи разрешены только `with-test-db` и тесты web.

### Пробы

Пробы не объявлены, `scripts/*/tests/probe-*.sh` нет.

### Покрытие требований

| Требование | Планы | Статус | Доказательства |
|---|---|---|---|
| AUTH-01 | 04-01, 04-04, 04-14 | ✓ SATISFIED | `access-policy` с `GrantsLoader` (Drizzle и in-memory), `inherits`; через модуль идут `requirePerm`, `/me`, search, rbac grants; `policy.test.ts`, parity |
| AUTH-02 | 04-01, 04-05 | ✓ SATISFIED | Роли только из `user_roles`, в access их нет; `AUTH-02-role-removed`; deny перекрывает admin (`admin + deny settings.manage`) |
| AUTH-03 | 04-01, 04-05 | ✓ SATISFIED | `AUTH-03-d4-allow`, таблица `access-routes.test.ts`; охранный тест не видит ролевых решений, кроме трёх перечисленных исключений (фильтр статистики и защита конфигурации admin) |
| AUTH-04 | 04-01…03, 04-06, 04-07, 04-13 | ✓ SATISFIED | access 15 минут с `sid`; отзыв при logout, смене пароля, деактивации, accept приглашения, маршрутом администратора; старый формат без `sid` → 401 |
| AUTH-05 | 04-01, 04-03, 04-06, 04-07 | ✓ SATISFIED | Атомарный захват, один преемник, cookie после коммита, replay отзывает сессию |
| AUTH-06 | 04-01, 04-03, 04-08, 04-13 | ✓ SATISFIED | Троттлинг в PostgreSQL, 429 + `Retry-After`, маршрут снятия, runbook; SEC-04 принят пользователем |
| AUTH-07 | 04-01, 04-06, 04-07 | ✓ SATISFIED | `readCookie` один (`services/session/cookies.ts:15`), слияние `Set-Cookie` одно (`appendSetCookie`); тест «после refresh login сохраняется» |
| AUTH-08 | 04-04, 04-14 | ✓ SATISFIED | `getMeData`, Next-маршрут и пул удалены; `codegraph node getMeData` → not found; D-21 |
| AUTH-09 | 04-09…04-11 | ✓ SATISFIED | `createSessionClient` с `httpTransport` и фейковым транспортом в тестах; single-flight; один редирект с безопасным `callbackUrl` (CR-01 закрыт) |
| AUTH-10 | 04-02, 04-10 | ✓ SATISFIED | Один `AuthProvider`; e2e D3 |
| AUTH-11 | 04-02, 04-11 | ✓ SATISFIED | `proxy.ts`; e2e D8 |
| AUTH-12 | 04-02, 04-12, 04-14 | ✓ SATISFIED | `SECTION_PERMISSIONS`, `requireSectionAccess`, `AuthGuard` без `isAdmin`; e2e «role user does not see /admin/users» |

Сиротских требований нет: все 12 AUTH-* заявлены планами.

### Найденные антипаттерны

| Файл | Строка | Шаблон | Уровень | Влияние |
|---|---|---|---|---|
| — | — | TBD/FIXME/XXX/TODO/HACK в изменённых файлах | — | не найдено |
| `app/server/src/services/access-policy/policy.ts` | `computeAccess` | Строки `rbac_role_grants` применяются только к собственным ролям пользователя, к унаследованным через `inherits` не применяются | ℹ️ Info | В `ROLE_REGISTRY` сейчас нет `inherits` между `admin` и `user`, поведение не меняется; учесть в Phase 7.1 (teacher) |
| `app/server/src/db/schema.ts:88` | — | `users.locked_until` остался | ℹ️ Info | Код входа его не читает; прежние блокировки перестают действовать (runbook шаг 1) |
| `app/web/.env.example:7` | — | Упоминание `DATABASE_URL` и `AUTH_JWT_SECRET` в комментарии | ℹ️ Info | Это не чтение; охранный тест D-21 проверяет чтение |
| `deferred-items.md` | — | Нет `public/img/not-found.png`; неиспользуемые переменные в `DashboardClient.tsx` | ℹ️ Info | Вне области фазы |
| SEC-04 | — | Посторонний может сериями держать вход в чужой аккаунт закрытым (окна по 60 с) | ℹ️ Info | Принятый риск, решение пользователя 2026-10-04; восстановление — кнопка «Снять ограничение входа» |

### Требуется ручная проверка

Ничего из списка не выполнено и не одобрено проверяющим.

1. **Слияние в dev.** Слить `gsd/phase-04-fix` (`ad13e1b`, `f68af13`) в `dev`, затем `yarn verify` на `dev`. Без этого фаза в основной ветке не включает правки ревью (CR-01…CR-12, SEC-01…SEC-06).
2. **Runbook D-24, шаг 1: read-only SQL на проде.** Запросы: `__drizzle_migrations` (последней должна быть 0020), активные `refresh_tokens`, `users.locked_until > now()`, `rbac_role_grants`, `rbac_user_grants`. Источник: checkpoint `blocking-human` в 04-03 Task 4 и 04-14 Task 4.
3. **Миграция 0021 на проде.** Применить до merge в master (и до push, если Preview смотрит в прод), затем повторить проверку мигратора и `auth_sessions`.
4. **Env server-проекта Vercel.**
   - `ACCESS_TOKEN_EXPIRES_SEC` не задан или в диапазоне 60…3600.
   - `*_DAYS`, если заданы, — целые 1…365.
   - Удалить ключи, которые код больше не читает: `AUTH_SESSION_ENFORCE_DB`, `RBAC_*`, `ADMIN_*`.
   - Выяснить, на какую базу смотрит `DATABASE_URL` в Preview.
5. **Env web-проекта Vercel.** После выкатки web удалить `DATABASE_URL` и `AUTH_JWT_SECRET`.
6. **Preview-чеклист.**
   - вход;
   - refresh при `ACCESS_TOKEN_EXPIRES_SEC=60`;
   - выход и отказ старого access;
   - D8 на `/profile/<логин>` с `Set-Cookie` в ответе документа;
   - 429 с обратным отсчётом;
   - блок «Сеансы и вход»;
   - вёрстка на 375px.
7. **Стоп-условие IP (D-12).** Посмотреть, какой IP видит Express за rewrite. До подтверждения `IP_TRUSTED` остаётся `false`.
8. **Merge и откат.**
   - Production server доходит до Ready раньше web.
   - Откат: сначала web, затем server через Instant Rollback.
   - До и после отката выполнить `UPDATE refresh_tokens SET revoked_at = used_at …`.
9. **Подтверждение решений [авто].**
   - D-09: бэкфилл сессий;
   - fail-closed 500 при ошибке БД прав или сессии;
   - цена строгой ротации: потеря ответа refresh даёт выход примерно через 15 минут;
   - логин принимает только `callbackUrl`;
   - тост выхода почти не виден (CR-12);
   - редактор аватара по `users.edit`;
   - `rbac.write` без `rbac.read`;
   - пункты UI-SPEC из 04-12 и 04-13.

### Итог по пробелам

Пробелов, блокирующих цель, нет. Все пять критериев ROADMAP и все двенадцать требований AUTH подтверждены кодом в HEAD `f68af13`. Поведенческие критерии подтверждены тестами, которые проверяющий перезапустил: web 454, серверные auth 223, D-21 8/8. `yarn verify: OK` и e2e (132 passed) взяты из логов прогона на том же содержимом. Статус `human_needed`: код не слит в `dev`, а выкатка D-24, env Vercel, preview и подтверждение автономных решений остаются за пользователем.

---

_Verified: 2026-10-04T17:45:00+07:00_
_Verifier: Claude (gsd-verifier)_

## Закрытие

2026-10-05. Код фазы работает на проде (`bio-exam.ru`, свой сервер, ветка `master`). Пункты раздела «Человеческая проверка» пользователь подтвердил как выполненные; пункты про preview Vercel заменены работой на своём сервере.
