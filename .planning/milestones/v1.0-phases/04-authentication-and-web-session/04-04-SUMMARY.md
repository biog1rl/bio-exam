---
phase: 04-authentication-and-web-session
plan: 04
subsystem: auth
tags: [rbac, access-policy, express, parity, fail-closed, vitest]
status: complete
deferred_human_gate: true

requires:
  - phase: 04-authentication-and-web-session
    provides: "04-01: test-support/auth-app.ts, характеризация, KNOWN_DEFECTS (6 имён)"
provides:
  - "app/server/src/services/access-policy: computeAccess, isValidAction, createAccessPolicy, GrantsLoader, createDrizzleGrantsLoader, createInMemoryGrantsLoader, accessPolicy, requestAccess (мемоизация на req), hasPermission; типы RoleRegistry, GrantsSnapshot, AccessSet"
  - "Parity /api/auth/me ↔ requirePermKey для пяти фикстур и всех ключей PERMISSION_DOMAINS (D-20)"
  - "Fail-closed во всех средах: ошибка БД прав → 500 в /api/auth/me и requirePerm; AUTH-01-db-error — обычный тест"
affects: [04-05, 04-14, 05-attempts]

actuals:
  tokens: 6500
  tasks: 3
  commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a

tech-stack:
  added: []
  patterns:
    - "Права считает одна чистая функция computeAccess(registry, snapshot); загрузка грантов за швом GrantsLoader (Drizzle и in-memory)"
    - "requestAccess(req): промис прав кладётся в WeakMap<Request, …> на время запроса, межзапросных кэшей нет"
    - "createAccessPolicy живёт в policy.ts без импорта базы; index.ts реэкспортирует и создаёт accessPolicy на Drizzle-адаптере, поэтому табличные тесты идут без PostgreSQL"
    - "Членство в ролях проверяется через Set.has, не через roles.includes( (C8)"

key-files:
  created:
    - app/server/src/services/access-policy/policy.ts
    - app/server/src/services/access-policy/grants-loader.ts
    - app/server/src/services/access-policy/index.ts
    - app/server/src/services/access-policy/policy.test.ts
    - app/server/src/routes/auth/me-requirePerm-parity.test.ts
  modified:
    - app/server/src/middleware/auth/requirePerm.ts
    - app/server/src/routes/auth/me.ts
    - app/server/src/routes/search.ts
    - app/server/src/routes/rbac/index.ts
    - app/server/src/routes/users/index.ts
    - app/server/src/routes/auth/auth-known-defects.test.ts
    - app/server/src/test-support/auth-app.ts
    - app/server/.env.example
  deleted:
    - app/server/src/services/rbac/rbac.ts

key-decisions:
  - "AccessSet несёт исходный snapshot: GET /api/rbac/user/:id/grants берёт roles и userOverrides из снимка того же вызова accessFor, без второго запроса"
  - "rbac_role_grants применяются только к ролям, прямо назначенным пользователю (как в прежнем inArray по user_roles), не к ролям, полученным через inherits"
  - "Строки грантов с невалидной парой домен.действие пропускаются и в effective ответа /grants (раньше effective включал их как строки)"
  - "requirePerm/requirePermKey ловят ошибку загрузки прав и передают её в next(): Express 4 не обрабатывает отклонённый промис async-обработчика"
  - "RBAC_USE_DB_OVERRIDES убран из test-support/auth-app.ts уже в 04-04: проверка 'one permission module' сканирует все .ts в app/server/src; AUTH_SESSION_ENFORCE_DB остаётся до 04-05"

requirements-completed: []

duration: 10min
completed: 2026-10-04
---

# Phase 4 Plan 04: один модуль прав access-policy и parity /api/auth/me ↔ requirePermKey Summary

**Эффективные права считает одна чистая функция `computeAccess` за швом `GrantsLoader`; `requirePerm`, `requirePermKey`, `/api/auth/me`, `/api/search` и `GET /api/rbac/user/:id/grants` берут их через `requestAccess`/`accessFor`. Кэши, флаги `RBAC_*` и запасной набор удалены, отказ БД прав даёт 500, parity доказан по всем ключам.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** ~10 мин
- **Completed:** 2026-10-04T06:52:46Z
- **Tasks:** 3/3
- **Files:** 5 созданы, 8 изменены, 1 удалён

## Accomplishments

- `services/access-policy/policy.ts`: `computeAccess` разворачивает роли снимка с `inherits` по переданному реестру (общий `seen` защищает от циклов, неизвестные роли пропускаются), `'*'` разворачивается во все действия домена, затем `rbac_role_grants` только для ролей из снимка (`Set.has`), результат `rolePermissions`, затем `rbac_user_grants` поверх, результат `permissions`. Невалидные пары пропускаются на каждом шаге. `roles` = `normaliseRoleKeys(snapshot.roles)`.
- `grants-loader.ts`: Drizzle-адаптер делает три прежних запроса без try/catch (ошибка уходит наверх); in-memory адаптер отдаёт копию снимка или пустой снимок.
- `index.ts`: `accessPolicy` на Drizzle, `requestAccess(req)` мемоизирует промис на запрос через `WeakMap` (с проверкой `userId`), без пользователя отклоняется; `hasPermission`.
- `requirePerm.ts`: общий `permissionGuard`; 401 без `authUser.id`, 403 без права, ошибка загрузки → `next(error)` → 500.
- `me.ts`: без `sessionOptional()` (глобальный в `app.ts`), без `buildBasePermissionSet` и отдельного запроса ролей; форма ответа прежняя.
- `routes/rbac/index.ts`: третий алгоритм в `GET /user/:id/grants` заменён на `accessPolicy.accessFor(userId)`; ключи ответа `roles`, `roleKeys`, `userOverrides`, `effective` прежние; четыре вызова `invalidateRBACCache` удалены; проверки admin (`roleKey === 'admin'`, пользователь-админ) не тронуты.
- `routes/users/index.ts`: два вызова `invalidateRBACCache` и ставшая ненужной переменная `rolesChanged` удалены вместе с устаревшими комментариями при них.
- `routes/search.ts`: `roles` и `permissions` из `requestAccess(req)`.
- `services/rbac/rbac.ts` удалён (каталог `services/rbac` пуст и удалён).
- `.env.example`: строки `RBAC_USE_DB_OVERRIDES` и `RBAC_DB_FAIL_OPEN` с комментариями удалены; `check-env-contract: OK`.

## Задачи

1. **Task 1 (tracer): модуль и parity.** Tracer-гейт: оба `<verify>` прогнаны end-to-end до расширения: parity + характеризация `Tests 32 passed (32)` (27 характеризации без изменения ожиданий + 5 parity), `typecheck` rc=0, проверка `me.ts` без `buildPermissionSet` rc=0.
2. **Task 2 (TDD): табличные тесты.** Тесты написаны по behavior на синтетическом реестре (`base`, `editor`, `auditor` с `ghost`, `loopA` ↔ `loopB`, `owner` с `'*'`). RED: модуль из Task 1 уже существовал, поэтому RED показан на мутанте `policy.ts` (убран `seen`, `roleGrants` без фильтра по ролям пользователя, `userGrants` применены до копии в `permissions`): `Tests 5 failed | 19 passed (24)`, в том числе `RangeError: Maximum call stack size exceeded` на цикле. Файл возвращён из копии, sha256 до и после совпал (`ec6ce9c8…f03f65a4`). GREEN: `Tests 24 passed (24)`. Тест не импортирует `db/index`.
3. **Task 3: перевод маршрутов, удаление старого модуля, AUTH-01-db-error.** `Tests 65 passed | 5 expected fail (70)` по `src/routes/auth src/services/access-policy`; `one permission module`; `yarn verify: OK`.

## codegraph impact (D-22, начало плана)

- `buildPermissionSet`: две определения. Серверная (`services/rbac/rbac.ts:62`), 17 символов: `buildPermissionSetForUser`; `routes/rbac/index.ts` (`GET /api/rbac/user/:id/grants:91`); `routes/index.ts`; `app/web/lib/auth/server/getMeData.ts` (`getMeData:126`), `app/web/lib/auth/getServerMe.ts`, `app/web/app/api/auth/me/route.ts` (через пакетную, удаляется в 04-14); `routes/auth/me.ts` (`GET /api/auth/me:13`); `routes/search.ts` (`GET /api/search:18`); `middleware/auth/requirePerm.ts` (`requirePerm:10`, `requirePermKey:23`).
- `buildPermissionSetForUser` (`services/rbac/rbac.ts:112`), 18 символов: `routes/auth/me.ts`, `routes/auth/index.ts`, `routes/search.ts`, `routes/index.ts`, `middleware/auth/requirePerm.ts`, и через `requirePerm` файлы `routes/auth/invites.ts`, `routes/groups/index.ts`, `routes/rbac/index.ts`, `routes/sidebar/index.ts`, `routes/tests/assignments.ts`, …
- `requirePerm` (`requirePerm.ts:10`), 10 символов: `routes/auth/invites.ts`, `routes/auth/index.ts`, `routes/groups/index.ts`, `routes/index.ts`, `routes/rbac/index.ts`, `routes/sidebar/index.ts`, `routes/tests/assignments.ts`, `routes/tests/index.ts`, `routes/users/index.ts`.
- `requirePermKey` (`requirePerm.ts:23`): вызывающих вне файла нет (теперь использует parity-тест).
- `invalidateRBACCache` (`services/rbac/rbac.ts:39`), 11 символов: `routes/rbac/index.ts` (`POST /api/rbac/grant:41`, `DELETE /api/rbac/grant:67`, `POST /api/rbac/user/grant:137`, `DELETE /api/rbac/user/grant:167`), `routes/users/index.ts` (`PATCH /api/users/:id:135`, `DELETE /api/users/:id:235`), `routes/index.ts`, `app/web/.../admin/settings/rbac/page.tsx` (`onToggle:39`, через HTTP).
- `isValidAction` (`services/rbac/rbac.ts:45`), 6 символов: `routes/rbac/index.ts` (`POST /api/rbac/user/grant`, `POST /api/rbac/grant`), `routes/index.ts`, `admin/settings/rbac/page.tsx` (через HTTP).
- После удаления `services/rbac/rbac.ts` ссылок на `services/rbac` в `app/server/src`, `app/web`, `scripts`, `e2e` нет.

## codegraph impact computeAccess (verification)

`computeAccess` (`policy.ts:86`), 5 символов: `createAccessPolicy` (`policy.ts:100`), `policy.test.ts`, `index.ts` (`accessPolicy:24`). Вызовов вне модуля и его тестов нет.

## codegraph affected (D-22, конец плана)

По изменённым файлам, 11 тестовых/затронутых файлов: `routes/auth/auth-characterization.test.ts`, `routes/auth/auth-known-defects.test.ts`, `routes/auth/me-requirePerm-parity.test.ts`, `services/access-policy/policy.test.ts`, `routes/tests/assignments.ts`, `routes/tests/index.ts`, `app/web/components/tests/TestRunner.tsx`, `e2e/fixtures/exam.ts`, `e2e/tests/auth.spec.ts`, `e2e/tests/authoring.spec.ts`, `e2e/tests/review.spec.ts`. Серверные прогнаны в `yarn verify`; e2e в план не входит и не запускался (Express в e2e уже работал с `RBAC_USE_DB_OVERRIDES=1`, поведение при исправной базе то же).

## KNOWN_DEFECTS после плана

5 имён: `AUTH-02-role-removed`, `AUTH-03-d4-allow`, `AUTH-04-logout`, `AUTH-05-parallel-refresh`, `AUTH-06-foreign-ip`. `AUTH-01-db-error` — обычный `test` с названием `AUTH-01-db-error: при недоступной rbac_user_grants …` (суффикс «— исправляется в 04-04» убран), тело проверки не менялось; при `RENAME rbac_user_grants` `/api/auth/me` и `/api/rbac/roles` отвечают 500 (в логе прогона `DrizzleQueryError … relation "rbac_user_grants" does not exist` из `me.ts:20` и `requirePerm.ts:15`). `AUTH-02` остаётся красным: `/api/settings/chart-default-range` по-прежнему верит `authUser.roles` с объединением ролей JWT (чинит 04-05).

## Parity (D-20)

Пробное приложение: `express()` + `express.json()` + `sessionOptional()` + `GET /probe/:key` → `requirePermKey(key)`; модули middleware импортируются после `startAuthApp` (тот же экземпляр базы). Для каждой фикстуры: вход через `POST /api/auth/login`, `GET /api/auth/me`, затем 12 ключей `PERMISSION_DOMAINS` пробой тем же cookie; расхождений нет.

| Фикстура | Отдельная проверка |
|---|---|
| `parity_admin` (admin) | `perms` = все 12 ключей |
| `parity_user` (user) | есть `users.read`, нет `tests.read` |
| `parity_allow_user` (user + allow `tests.read`) | есть `tests.read` |
| `parity_deny_user` (user + deny `users.read`) | нет `users.read` |
| `parity_role_deny_admin` (admin + `rbac_role_grants` admin/settings/manage/deny) | нет `settings.manage`, есть `rbac.read` |

C7: строка role-deny вставляется только в последнем parity-тесте, после проверки чистого admin, и удаляется в `finally`; отдельные пользователи для allow и deny.

Дополнительно (критерий Task 3): `GET /api/rbac/user/:id/grants` для admin и для user + allow: ключи ровно `effective`, `roleKeys`, `roles`, `userOverrides`; у admin `roleKeys` и `effective` = все ключи, `userOverrides` пуст; у user + allow `roles = ['user']`, `roleKeys = ['users.read']`, `userOverrides = [{ tests, read, true }]`, `effective` совпадает с `perms` из `/api/auth/me`.

## Verification

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/auth/me-requirePerm-parity.test.ts src/routes/auth/auth-characterization.test.ts`: `Tests 32 passed (32)` (до добавления двух тестов /grants).
- `yarn workspace @bio-exam/server typecheck`: rc=0.
- `yarn workspace @bio-exam/server vitest run src/services/access-policy/policy.test.ts`: `Tests 24 passed (24)`.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/auth src/services/access-policy`: `Test Files 4 passed (4)`, `Tests 65 passed | 5 expected fail (70)`.
- Проверка плана печатает `one permission module`.
- `grep "roles.includes(" app/server/src/services/access-policy`: совпадений нет.
- `node scripts/check-env-contract.mjs`: `check-env-contract: OK`.
- `yarn verify`: `yarn verify: OK` (все шаги passed; server `311 passed | 5 expected fail (316)`; предупреждения lint server — 5 старых, ни одного в файлах плана).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `RBAC_USE_DB_OVERRIDES` убран из `test-support/auth-app.ts`**
- **Found during:** Task 3, пробный прогон проверки `one permission module` до правок
- **Issue:** проверка плана ищет `RBAC_USE_DB_OVERRIDES` во всех `.ts` под `app/server/src`, а шаг 7 плана оставлял флаг в помощнике до 04-05; иначе проверка не проходит
- **Fix:** из `ENV_KEYS` и из выставления перед импортом `app.js` удалён только `RBAC_USE_DB_OVERRIDES` (код его больше не читает); `AUTH_SESSION_ENFORCE_DB` оставлен, его читает `session.ts`. Проверка 04-05 (`exit(3)`, отсутствие обоих флагов в помощнике) после этого по-прежнему выполнима: 04-05 удалит оставшийся `AUTH_SESSION_ENFORCE_DB`
- **Files modified:** `app/server/src/test-support/auth-app.ts`
- **Commit:** не выполнялся (правило пользователя)

**2. [Rule 3 - Blocking] Проверка AUTH-01-db-error переведена с `defectTest('AUTH-01-db-error', …)` на `test('AUTH-01-db-error: …', …)`**
- **Found during:** Task 3, проверка `one permission module`
- **Issue:** регулярное выражение `'AUTH-01-db-error'` находило первый аргумент вызова `defectTest`, хотя имя уже ушло из `KNOWN_DEFECTS`
- **Fix:** вызов заменён на обычный `test` с тем же итоговым названием (`${id}: ${title}`), тело не менялось; это и есть «обычный `test`» из шага 7
- **Files modified:** `app/server/src/routes/auth/auth-known-defects.test.ts`

### Решения исполнителя (автономно)

- `requirePerm`/`requirePermKey` перехватывают ошибку `requestAccess` и отдают её в `next(error)` (шаг 5 плана: ошибка → обработчик ошибок, 500); в Express 4 отклонённый промис async-обработчика иначе не доходит до обработчика.
- `AccessSet` дополнен полем `snapshot` (план перечислял `roles`, `rolePermissions`, `permissions`): маршрут `/grants` должен вернуть `roles` и `userOverrides` «из снимка», а повторный запрос был бы вторым путём к данным.
- `createAccessPolicy` определён в `policy.ts` (без базы) и реэкспортирован из `index.ts`: Task 2 гоняется без PostgreSQL.
- `rbac_role_grants` применяются к ролям, назначенным пользователю напрямую, как в прежнем коде; на ролях из `inherits` не применяются. В `ROLE_REGISTRY` `inherits` нет, на production не влияет.

### Отклонения по правилам исполнения

- `root-pin.sh` отклонён правами (первая команда с ним отклонена целиком); заменён проверкой `git rev-parse --show-toplevel` = `/Users/kdvornichenko/bio-exam`, запись только по абсолютным путям внутри корня.
- `services/rbac/rbac.ts` удалён `rm`, без `git rm`.

## Deferred human verification

- CONTEXT `<specifics>` п. 10: `/api/auth/me` без запасного набора; при ошибке БД прав пользователь видит ошибку (500) вместо базовых прав по ролям, в разработке и тестах тоже. Шаги: подтвердить, что fail-closed во всех средах приемлем. Не выполнено, ждёт пользователя; исполнитель не одобрял. Фазу не блокирует.
- Коммит файлов плана делает пользователь. Шаги: просмотреть файлы из списка ниже и закоммитить. Не выполнено, ждёт пользователя; исполнитель не одобрял.

## Файлы к коммиту

Новые:
- `app/server/src/services/access-policy/policy.ts`
- `app/server/src/services/access-policy/grants-loader.ts`
- `app/server/src/services/access-policy/index.ts`
- `app/server/src/services/access-policy/policy.test.ts`
- `app/server/src/routes/auth/me-requirePerm-parity.test.ts`

Изменённые:
- `app/server/src/middleware/auth/requirePerm.ts`
- `app/server/src/routes/auth/me.ts`
- `app/server/src/routes/search.ts`
- `app/server/src/routes/rbac/index.ts`
- `app/server/src/routes/users/index.ts`
- `app/server/src/routes/auth/auth-known-defects.test.ts` (файл из 04-01, ещё не закоммичен)
- `app/server/src/test-support/auth-app.ts` (файл из 04-01, ещё не закоммичен; отклонение 1, вне `files_modified`)
- `app/server/.env.example`

Удалённый:
- `app/server/src/services/rbac/rbac.ts`

Этот SUMMARY лежит в `.planning/` (игнорируется git).

## Known Stubs

Нет.

## Self-Check: PASSED

- FOUND: `app/server/src/services/access-policy/policy.ts`, `grants-loader.ts`, `index.ts`, `policy.test.ts`
- FOUND: `app/server/src/routes/auth/me-requirePerm-parity.test.ts`
- DELETED: `app/server/src/services/rbac/rbac.ts`
- Коммиты: 0 (правило пользователя), HEAD не менялся (7a6f95a)
