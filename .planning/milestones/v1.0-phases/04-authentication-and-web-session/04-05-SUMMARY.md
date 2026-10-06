---
phase: 04-authentication-and-web-session
plan: 05
subsystem: auth
tags: [rbac, access-policy, session, express, d4, d-21, fail-closed, vitest, playwright]
status: complete
deferred_human_gate: true

requires:
  - phase: 04-authentication-and-web-session
    provides: "04-04: services/access-policy (requestAccess, hasPermission), requirePerm с fail-closed; 04-01: test-support/auth-app.ts, характеризация, KNOWN_DEFECTS"
provides:
  - "sessionOptional: роли из JWT не читаются, флага AUTH_SESSION_ENFORCE_DB нет, пользователь проверяется в БД на каждом запросе; ошибка БД → next(err) → 500"
  - "SessionUser = { id, login }"
  - "public.ts (списки и чтение теста) по праву tests.read, settings.ts по requirePerm('settings', 'manage'), поиск: privileged = tests.write || groups.manage_groups"
  - "app/server/src/routes/tests/access-routes.test.ts: исходы маршрутов D-04 по профилям доступа"
  - "scripts/auth-no-role-string-checks.test.mjs с SERVER_EXCEPTIONS (охранный тест D-21, серверная часть)"
affects: [04-06, 04-14, 05-attempts]

actuals:
  tokens: 8200
  tasks: 3
  commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a

tech-stack:
  added: []
  patterns:
    - "Сессия: проверка подписи JWT (ошибка → анонимный запрос) отделена от чтения пользователя в БД (ошибка → next(err))"
    - "sessionRequired передаёт во вложенный sessionOptional настоящий обработчик: ошибка БД → 500, нет пользователя → 401, ровно один ответ"
    - "Решение о доступе в маршруте: await hasPermission(req, 'tests.read') или requirePerm(domain, action), строки ролей не участвуют"
    - "Охранный тест: построчный детектор + поимённые исключения (файл, фрагмент, число), исключение не может устареть молча"

key-files:
  created:
    - app/server/src/routes/tests/access-routes.test.ts
    - scripts/auth-no-role-string-checks.test.mjs
  modified:
    - app/server/src/middleware/auth/session.ts
    - app/server/src/routes/tests/public.ts
    - app/server/src/routes/settings.ts
    - app/server/src/routes/search.ts
    - app/server/src/services/search/database-search.ts
    - app/server/src/routes/auth/auth-known-defects.test.ts
    - app/server/src/test-support/auth-app.ts
    - app/server/.env.example
    - e2e/playwright.config.ts

key-decisions:
  - "Тест «ошибка БД при проверке сессии» проверяет ровно 500 (assert.equal), как написано в плане, а не >= 500"
  - "В access-routes.test.ts admin с deny tests.read и admin с deny tests.write+groups.manage_groups получают назначение теста access-assigned: так строки «только назначенные» проверяют непустой результат, а чтение без назначения проверяется на access-free"
  - "Детектор D-21 построчный: roles с .includes(/.some(, .includes(литерал роли), сравнение с литералом роли с любой стороны, литерал teacher, SQL roleKey} = '…'; литералы в образцах теста собраны через escape-последовательность юникода апострофа (U+0027)"

requirements-completed: []

duration: 12min
completed: 2026-10-04
---

# Phase 4 Plan 05: роли только из БД, D4 закрыт правом tests.read, охранный тест D-21 Summary

**`sessionOptional` больше не верит ролям из JWT и всегда проверяет пользователя в БД (ошибка базы → 500); `public.ts`, `settings.ts` и поиск решают доступ правами модуля `access-policy`; `SessionUser` = `{ id, login }`; исходы маршрутов D-04 закреплены таблицей по девяти профилям, а охранный тест не даёт вернуться проверкам по строкам ролей.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** ~12 мин
- **Completed:** 2026-10-04T07:05:26Z
- **Tasks:** 3/3
- **Files:** 2 созданы, 9 изменены

## Accomplishments

- `session.ts`: удалены `enforceDbSessionCheck`, чтение `payload.roles`, объединение ролей JWT и БД. `verifiedUserId(token)` проверяет подпись (ошибка → `null` → анонимный запрос). Затем один запрос `users` по id; нет или неактивен → `authUser = null`; ошибка запроса → `next(error)`. `sessionRequired` передаёт во вложенный `sessionOptional` обработчик `proceed`: ошибка → `next(error)`, нет пользователя → 401, иначе `next()`. `readCookie`, `setSessionCookie`, `clearSessionCookie` не тронуты (их переносит 04-06).
- `settings.ts`: оба маршрута `chart-default-range` — `sessionRequired(), requirePerm('settings', 'manage')`; ручные проверки удалены; запасной ответ `month` прежний.
- `public.ts`: четыре проверки роли (`GET /tests`, `GET /topics/:slug/tests`, `GET /topics/:topicSlug/tests/:testSlug`, `GET /tests/:id`) заменены на `await hasPermission(req, 'tests.read')`; `'teacher'` удалён; два существующих комментария «admin/teacher» приведены к факту «право tests.read». Тексты ответов прежние. `/start`, `/submit`, PATCH черновика не тронуты (Phase 5).
- `database-search.ts`: `SearchAccess` без `roles`, импорт `RoleKey` удалён, `isPrivileged` = `tests.write || groups.manage_groups`. `search.ts` роли не передаёт.
- `auth-app.ts`: `ENV_KEYS = ['TEST_DATABASE_URL']`, выставление `AUTH_SESSION_ENFORCE_DB` удалено.
- `.env.example`: строка `AUTH_SESSION_ENFORCE_DB` с комментарием удалена (`check-env-contract: OK`). `e2e/playwright.config.ts`: `AUTH_SESSION_ENFORCE_DB` и `RBAC_USE_DB_OVERRIDES` удалены из env Express, существующий комментарий исправлен на «проверка сессий и прав в БД работает всегда, как в production».

## Задачи

1. **Task 1 (tracer): роли только из БД.** Между Task 1 и Task 2 `SessionUser.roles` заполнялся только из `user_roles` (C4 squad-ревью). Tracer-гейт до расширения: `vitest run src/routes/auth` → `Test Files 3 passed (3)`, `Tests 44 passed | 4 expected fail (48)` (характеризация без изменения ожиданий, `AUTH-02-role-removed` обычный и зелёный, новый тест 500 зелёный, `AUTH-03-d4-allow` ещё ожидаемо падал); проверка печатает `roles from db only`; `typecheck` rc=0, `error TS` нет. Дополнительно прогнаны тесты, которые подписывают cookie через `sessionCookieFor` мимо `auth-app.ts` и раньше шли без проверки в БД: `exam-flow.test.ts` + `uploads.test.ts` → `Tests 94 passed (94)` (оба сидят `users.isActive = true` и `user_roles`).
2. **Task 2 (TDD): D4 и таблица исходов.** RED: `access-routes.test.ts` написан до правок `public.ts`/поиска → `Tests 9 failed | 30 passed (39)`. Красные ровно строки переопределений: чтение по slug и id для `allow_tests_read`/free (ожидалось 200) и `admin_deny_tests_read`/free (ожидалось 403), оба списка для `allow_tests_read` и `admin_deny_tests_read`, поиск `admin_deny_search`. Строки настроек были зелёными уже после Task 1 (settings.ts переведён там), поиск `allow_tests_write` был зелёным и раньше (`isPrivileged` уже учитывал `tests.write`). GREEN: после правок `vitest run src/routes/tests/access-routes.test.ts src/routes/auth` → `Test Files 4 passed (4)`, `Tests 84 passed | 3 expected fail (87)`. Промежуточный прогон до снятия пометки показал `AUTH-03-d4-allow` как failed у `test.fails` (то есть дефект исправлен), после переноса в обычный `test` — зелёный. `typecheck` rc=0; проверка печатает `session user without roles`; `grep "'teacher'" app/server/src` пусто.
3. **Task 3: охранный тест D-21, флаги.** `node --test scripts/auth-no-role-string-checks.test.mjs` → `pass 3`, `fail 0`. `grep AUTH_SESSION_ENFORCE_DB|RBAC_USE_DB_OVERRIDES` по `app/server e2e scripts` пусто. `yarn verify: OK`. `yarn e2e` зелёный.

## Таблица access-routes.test.ts

Профили (сид `seedUser`, переопределения прямыми строками `rbac_user_grants`): `admin`; `student` (user, назначен `access-assigned`); `stranger` (user); `allow_tests_read`; `allow_settings_manage`; `allow_tests_write` (user + allow); `admin_deny_tests_read` (admin + deny `tests.read`, назначен `access-assigned`); `admin_deny_settings_manage`; `admin_deny_search` (admin + deny `tests.write` и `groups.manage_groups`, назначен `access-assigned`).

| Маршрут | Исходы |
|---|---|
| чтение теста по slug и по id | admin assigned/free 200; student assigned 200, free 403; stranger assigned 403; allow_tests_read free 200; admin_deny_tests_read free 403, assigned 200 |
| `GET /api/tests/public/tests`, `/topics/:slug/tests` | admin оба; student assigned; stranger пусто; allow_tests_read оба; admin_deny_tests_read только assigned |
| `GET`/`PUT /api/settings/chart-default-range` | admin 200; student 403; allow_settings_manage 200; admin_deny_settings_manage 403 |
| `GET /api/search?scope=tests` | admin оба, `/admin/tests/`; student assigned, `/tests/`; stranger пусто; allow_tests_write оба, `/admin/tests/`; admin_deny_search assigned, `/tests/` |

Для admin и user исходы совпадают с таблицей C характеризации 04-01 (её ожидания не менялись и зелёные).

## Охранный тест D-21 (сервер)

Сканирует не тестовые исходники `app/server/src/routes`, `middleware`, `services`. `SERVER_EXCEPTIONS` (5 мест): `routes/tests/index.ts` — `${userRoles.roleKey} = 'admin'` ×2 (studentOnly); `routes/rbac/index.ts` — `if (roleKey === 'admin')` ×2 и `rs.some((r) => r.role === 'admin')` ×1 (защита конфигурации admin). Тесты: детектор на 8 нарушающих и 6 допустимых образцах; скан без нарушений вне исключений (≥30 файлов); каждое исключение есть ровно в заявленном числе строк и ловится детектором, сумма 5. До записи теста `grep` по детектору нашёл ровно эти пять мест.

## codegraph impact (начало плана)

- `sessionOptional` (`session.ts:66`), 18 символов: `sessionRequired`, `app.ts` (глобально, `app.use(sessionOptional())` перед `/healthz` и `/api`), `index.ts`, `me-requirePerm-parity.test.ts`, `routes/auth/invites.ts`, `routes/docs/assets.ts`, `routes/groups/index.ts`, `routes/rbac/index.ts`, `routes/search.ts`, `routes/settings.ts`, `routes/sidebar/index.ts`, `routes/tests/assignments.ts`, `routes/tests/index.ts`, `routes/tests/public.ts`, `routes/users/avatar.ts`, `routes/users/index.ts`, `routes/users/profile.ts`.
- `sessionRequired` (`session.ts:111`), 16 символов: `routes/auth/invites.ts`, `routes/auth/index.ts`, `routes/docs/assets.ts`, `routes/index.ts`, `routes/groups/index.ts`, `routes/rbac/index.ts`, `routes/search.ts`, `routes/settings.ts`, `routes/sidebar/index.ts`, `routes/tests/assignments.ts`, `routes/tests/index.ts`, `routes/tests/public.ts`, `routes/users/avatar.ts`, `routes/users/index.ts`, `routes/users/profile.ts`.
- `SessionUser` (`session.ts:11`), 2 символа: само объявление и `Request.authUser`. Читатели `authUser.roles` до плана: `settings.ts` ×2, `public.ts` ×4; после плана — нет.
- Путь вложенного вызова `sessionOptional` из `sessionRequired` в приложении срабатывает только если глобальный `sessionOptional` не отработал (в `app.ts` он стоит до всех роутеров); в пробных приложениях тестов (parity) он основной.

## codegraph affected (конец плана)

По `session.ts`, `settings.ts`, `public.ts`, `search.ts`, `database-search.ts`, `auth-app.ts` — 26 файлов: `routes/auth/auth-characterization.test.ts`, `routes/auth/auth-known-defects.test.ts`, `routes/auth/me-requirePerm-parity.test.ts`, `routes/tests/access-routes.test.ts`, `routes/tests/assignments.ts`, `routes/tests/index.ts`, `routes/tests/public.ts`, 12 файлов `app/web/app/(internal)/(protected)/admin/tests/**`, `app/web/components/tests/MdxRenderer.tsx`, `app/web/components/tests/TestRunner.tsx`, `app/web/lib/auth/getServerMe.test.ts`, `app/web/lib/tests/api.ts`, `e2e/fixtures/exam.ts`, `e2e/tests/auth.spec.ts`, `e2e/tests/authoring.spec.ts`, `e2e/tests/review.spec.ts`. Серверные и web прогнаны в `yarn verify`, e2e — в `yarn e2e`.

## KNOWN_DEFECTS после плана

3 имени: `AUTH-04-logout`, `AUTH-05-parallel-refresh`, `AUTH-06-foreign-ip`. `AUTH-02-role-removed` и `AUTH-03-d4-allow` — обычные `test` (суффикс «— исправляется в 04-05» убран, тела проверок не менялись). Добавлен обычный тест «ошибка БД при проверке сессии»: при `ALTER TABLE users RENAME TO users_off` (возврат в `finally`) `GET /api/auth/me` с действующей cookie → 500 (в логе прогона `relation "users" does not exist` из `session.ts`).

## Verification

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/auth` (Task 1): `Tests 44 passed | 4 expected fail (48)`.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/access-routes.test.ts src/routes/auth` (Task 2): `Test Files 4 passed (4)`, `Tests 84 passed | 3 expected fail (87)`.
- `yarn workspace @bio-exam/server typecheck`: rc=0, `error TS` нет (после Task 1 и Task 2).
- Проверки плана печатают `roles from db only` и `session user without roles`.
- `node --test scripts/auth-no-role-string-checks.test.mjs`: `pass 3`, `fail 0`.
- `yarn verify`: `yarn verify: OK`; server `Test Files 16 passed`, `Tests 354 passed | 3 expected fail (357)`; web `190 passed`; exam-core `498 passed`; script-tests `pass 137`, `fail 0`; lint server 5 предупреждений — те же старые (`storage.ts`, `login.ts`, `backfill-question-search.ts`, `app.ts`, неиспользуемый `appSettings` в `public.ts:19` до плана), ни одного нового.
- `yarn e2e`: rc=0, `122 passed`, ожидаемые падения `@known-defect` (по 4 на каждом из двух проектов `chromium-desktop`, `chromium-mobile`, всего 8 `test.fail`): D1 (`review.spec.ts:303`), D8 (`session.spec.ts:51`), D3 (`session.spec.ts:86`), AUTH-04 (`session.spec.ts:123`). Неожиданных падений нет.

## Deviations from Plan

None - план выполнен как написан. Отклонения только по правилам исполнения:

- `root-pin.sh` отклонён правами; заменён проверкой `git rev-parse --show-toplevel` = `/Users/kdvornichenko/bio-exam`, запись только по абсолютным путям внутри корня.
- TDD-коммиты RED/GREEN не делались (правило пользователя); последовательность соблюдена по сути: `access-routes.test.ts` прогнан красным (9 failed) до правок `public.ts`/поиска.

### Решения исполнителя (автономно)

- Тест «ошибка БД → 500» проверяет ровно 500 (как в плане), обработчик ошибок `app.ts` отдаёт 500 для не-операционных ошибок.
- Профили с deny у admin получают назначение `access-assigned`, чтобы проверка «только назначенные» не была тривиально пустой; случай «назначений нет — ни одного» покрыт профилем `stranger`.
- В образцах охранного теста кавычки собраны через escape-последовательность юникода апострофа (U+0027), так что файл теста сам не содержит литералов, которые ловит детектор.

### Факты для следующих планов

- Флаги `AUTH_SESSION_ENFORCE_DB`/`RBAC_USE_DB_OVERRIDES` в `scripts/e2e.mjs` и `scripts/lib/e2e-web-env.mjs` не найдены: поиск по всему репозиторию (без `node_modules`, `.planning`) до правок нашёл их только в `session.ts`, `auth-app.ts`, `app/server/.env.example`, `e2e/playwright.config.ts`; после плана — нигде в `app/server`, `e2e`, `scripts`.
- `routes/auth/login.ts` и `routes/auth/refresh.ts` по-прежнему кладут `roles` в JWT, `test-support/http.ts` (`sessionCookieFor`) принимает `roles`; сервер это поле больше не читает. Файлы вне `files_modified` плана, оставлены намеренно для 04-06/04-14.

## Threat Flags

Нет новых поверхностей. T-4-13, T-4-14, T-4-15 закрыты: роли JWT не читаются; доступ по праву модуля с таблицей исходов и охранным тестом; ошибка БД сессии → 500.

## Deferred human verification

- CONTEXT `<specifics>` п. 9 (сервер): для ролей admin и user доступ не меняется; меняется для переопределений (allow/deny в `rbac_user_grants`, `rbac_role_grants` теперь влияют на тесты, настройки и поиск). Шаги: до выкатки read-only на проде `SELECT role_key, domain, action, allow FROM rbac_role_grants ORDER BY 1, 2, 3;` и `SELECT user_id, domain, action, allow FROM rbac_user_grants ORDER BY 1, 2, 3;`. Не выполнено, ждёт пользователя; исполнитель не одобрял. Фазу не блокирует.
- CONTEXT `<specifics>` п. 11 (часть): `AUTH_SESSION_ENFORCE_DB`, `RBAC_USE_DB_OVERRIDES`, `RBAC_DB_FAIL_OPEN` больше не читаются; оставшиеся в Vercel server-проекте значения безвредны, их можно удалить. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Поведение fail-closed сессии: при ошибке БД любой запрос с cookie сессии получает 500 (раньше — анонимный запрос в разработке и тестах). Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Коммит файлов плана делает пользователь. Не выполнено, ждёт пользователя; исполнитель не одобрял.

## Файлы к коммиту

Новые:
- `app/server/src/routes/tests/access-routes.test.ts`
- `scripts/auth-no-role-string-checks.test.mjs`

Изменённые:
- `app/server/src/middleware/auth/session.ts`
- `app/server/src/routes/tests/public.ts`
- `app/server/src/routes/settings.ts`
- `app/server/src/routes/search.ts`
- `app/server/src/services/search/database-search.ts`
- `app/server/src/routes/auth/auth-known-defects.test.ts` (файл из 04-01, ещё не закоммичен)
- `app/server/src/test-support/auth-app.ts` (файл из 04-01, ещё не закоммичен)
- `app/server/.env.example`
- `e2e/playwright.config.ts`

Этот SUMMARY лежит в `.planning/` (игнорируется git).

## Known Stubs

Нет.

## Self-Check: PASSED

- FOUND: `app/server/src/routes/tests/access-routes.test.ts`
- FOUND: `scripts/auth-no-role-string-checks.test.mjs`
- Коммиты: 0 (правило пользователя), HEAD не менялся (7a6f95a)
