---
phase: 08-client-requests-runtime-and-decomposition
plan: 06
subsystem: api
tags: [users, lookup, HTTP-03, D-11, D7, teacher-zone]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-03
    provides: снимок route-inventory.txt и команда routes:inventory
provides:
  - app/server/src/routes/users/user-rows.ts — userZoneFilter, selectUserRows, serializeUserRow, типы UserRowScope и RawUserRow
  - GET /api/users/:id → { user: UserRow }
  - GET /api/users/by-login/:login → { user: UserRow }
affects: [08-11, 08-28]

actuals:
  tokens: 6200
  tasks: 3
  commits: 0
plan_head_before: cface540bf24545b76eaf83ccb2a946e073b7cd3
plan_head_after: cface540bf24545b76eaf83ccb2a946e073b7cd3

tech-stack:
  added: []
  patterns:
    - "Строка пользователя (GET /, GET /:id, GET /by-login/:login) — один запрос selectUserRows и один сериализатор serializeUserRow; фильтр зоны, подпись createdByName и группы в зоне выводятся внутри selectUserRows из UserRowScope = UserScope"
    - "Scope строки всегда await userScope(req) из шва; литерала { all: true } в routes/users нет"
    - "Поиск по логину: trim(), точное совпадение, затем lower(login) = lower(param) только при единственной строке (limit 2)"

key-files:
  created:
    - app/server/src/routes/users/user-rows.ts
    - app/server/src/routes/users/user-lookup.test.ts
  modified:
    - app/server/src/routes/users/index.ts
    - app/server/src/routes/users/teacher-zone-users.matrix.test.ts
    - scripts/teacher-zone-guards.test.mjs
    - app/server/route-inventory.txt

key-decisions:
  - "Решение исполнителя (автономно): serializeUserRow(row) принимает одну строку, без параметра scope. Всё, что зависит от scope (createdByName, группы в зоне, фильтр зоны), считается в SQL внутри selectUserRows; параметр scope у сериализатора остался бы неиспользованным"
  - "Решение исполнителя (автономно): фильтр зоны (exists в user_groups по scope.groupIds + studentOnlyFilter) вынесен в userZoneFilter(scope) и применяется внутри selectUserRows через and(where, userZoneFilter(scope)); GET / берёт тот же userZoneFilter для count, ранний выход при пустом groupIds в GET / сохранён. Поиск по id и логину защищён и canReadUser, и фильтром зоны"
  - "Текст 404 — литерал 'Пользователь не найден' в routes/users/index.ts (константа USER_NOT_FOUND модуля), lib/constants.ts не трогается: ERROR_MESSAGES.USER_NOT_FOUND = 'User not found' используют PATCH и DELETE"
  - "GET /by-login/:login: canReadUser(req, row.id) вызывается после поиска; при не найденной строке ответ 404 только при hasGlobalZone, иначе 403"

duration: ~25min
completed: 2026-10-05
---

# Phase 8 Plan 06: поиск пользователя по id и по логину на общем сериализаторе строки списка (HTTP-03) Summary

`GET /api/users/:id` и `GET /api/users/by-login/:login` отвечают `{ user }` той же строкой, что `GET /api/users` (один запрос `selectUserRows` и один `serializeUserRow` на три маршрута, scope из `userScope(req)`); 150-й пользователь за пределами первой страницы находится по id и по логину в другом регистре; учитель видит своего ученика с телом, равным строке своего списка, на чужого и несуществующего получает 403.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Что сделано

### Task 1 (tracer): общий сериализатор и GET /api/users/:id
- `user-rows.ts`: из обработчика `GET /` дословно вынесены запрос строки (select, два leftJoin, groupBy, orderBy) и `rows.map` → `selectUserRows({ where, scope, limit, offset })` и `serializeUserRow(row)`; ветки `scope.all` / `scope.groupIds` для `createdByName` и групп сохранены; фильтр зоны — `userZoneFilter(scope)`.
- `GET /` вызывает `userZoneFilter(scope)` для count и `selectUserRows({ scope, limit, offset })`; форма ответа `{ rows, users, total }` не изменилась (`users-list.characterization.test.ts` зелёный без правок).
- `GET /:id`: `validateUUID('id'), sessionRequired(), requirePerm('users', 'read')`; первой строкой обработчика `canReadUser(req, id)` → 403; `scope = await userScope(req)`; нет строки → `404 { error: 'Пользователь не найден' }`; иначе `{ user: serializeUserRow(row) }`. Регистрация — сразу после `GET /` (после `/directory`, `/profile`, `/avatar`, `sessionsRouter`, `loginThrottleRouter`), до `PATCH /:id`.
- Tracer gate: `<verify>` задачи 1 перезапущен после задачи — 15/15 зелёные, расширение продолжено.

### Task 2: GET /api/users/by-login/:login, отказы, матрица учителя
- `GET /by-login/:login`: `sessionRequired(), requirePerm('users', 'read')`; `trim()`; `selectUserRows` с `eq(users.login, login)`, затем `lower(users.login) = lower(login)` с `limit: 2`, строка берётся только если она одна; нет строки → `hasGlobalZone(req) ? 404 : 403`; есть → `canReadUser(req, row.id) ? { user } : 403`.
- Матрица 07.1 расширена строками (`KNOWN_DEFECTS` не изменился, пустой):
  - teacherA `GET /users/:id s1 body`, `GET /users/by-login s1 body`: 200, тело глубоко равно `{ user: <строка s1 из GET /api/users?limit=500 под teacherA> }`, группы только G.
  - teacherA `GET /users/:id createdByName`: приглашённый учителем ученик, тело равно строке списка учителя, `createdByName` — имя без логина.
  - admin `GET /users/:id s1 body`: тело равно строке списка администратора.
  - `GET /users/:id s1`: adminNoZone 403, s1 403, readUsers 403, readUsersAll 200; `GET /users/by-login s1`: adminNoZone 403, s1 403, admin 200.
  - `GET /users/:id s3` и `GET /users/by-login s3`: teacherA 403, teacherB 200, admin 200, readUsers 403.
  - `GET /users/:id missing` и `GET /users/by-login missing`: teacherA 403, readUsers 403, adminNoZone 403, admin 404, readUsersAll 404.

### Task 3: охранный тест зон, снимок инвентаря, проверки
- `teacher-zone-guards.test.mjs`: в `INVENTORY` добавлены `route(USER_ROUTES, 'get', '/:id', COARSE, ['canReadUser('])` и `route(USER_ROUTES, 'get', '/by-login/:login', COARSE, ['canReadUser(', 'hasGlobalZone('])`; `assert.equal(INVENTORY.length, 45)` вместо 43. Исключений не добавлено.
- Снимок перегенерирован, diff — ровно две строки (ниже).

## Поведение на несуществующем пользователе по профилям

| Профиль | GET /api/users/<несуществующий uuid> | GET /api/users/by-login/<несуществующий> |
|---|---|---|
| admin (zone.all) | 404 `{ error: 'Пользователь не найден' }` | 404 `{ error: 'Пользователь не найден' }` |
| readUsersAll (users.read + zone.all) | 404 | 404 |
| teacherA | 403 `{ error: 'Forbidden' }` | 403 |
| readUsers (users.read без zone.all) | 403 | 403 |
| adminNoZone (zone.all deny) | 403 | 403 |
| admin с deny users.read | 403 (requirePerm) | 403 (requirePerm) |
| без cookie | 401 `{ error: 'Unauthorized' }` | 401 |
| id не UUID | 400 (validateUUID) | — |

Логины с регистром (admin): `Ivan.Petrov` находится по `Ivan.Petrov`, `ivan.petrov`, `%20Ivan.Petrov%20`; при `Dup.User` и `dup.user` точное написание находит своего, `DUP.USER` → 404.

## TDD

- RED: `user-lookup.test.ts` (11 тестов D7 по id и логину) написан до кода; прогон — 11 failed (`Cannot GET /api/users/<id>`), характеризация списка 4 passed.
- GREEN: после `user-rows.ts` и двух маршрутов — 15/15 passed.
- Строки матрицы дописаны после кода; проверено, что они ловят откат R3: временная подмена scope в `GET /:id` на `{ all: true }` и отключение `canReadUser` в by-login дали 2 failed (`teacherA GET /users/:id s1 body` — группы G и GA, `teacherA GET /users/:id createdByName` — подпись с логином); файл восстановлен из копии, повторный прогон зелёный.
- Коммиты RED/GREEN не выполнялись (правило пользователя).

## codegraph impact (начало плана, индекс основного дерева)

```
Impact of changing "canReadUser" — 5 affected symbols:
constant canReadUser — app/server/src/services/access-policy/scope.ts:22
app/server/src/routes/users/index.ts: route GET /api/users/:userId/test-assignments:431
app/server/src/routes/index.ts
app/server/src/services/access-policy/index.ts

Impact of changing "userScope" — 11 affected symbols:
constant userScope — app/server/src/services/access-policy/scope.ts:28
app/server/src/routes/search.ts: route GET /api/search:16
app/server/src/routes/users/index.ts: route GET /api/users:116
app/server/src/routes/tests/assignments.ts: function memberIdsInScope:45
app/web/app/(internal)/(protected)/admin/users/UsersClient.tsx: UsersClient:26
app/web/components/users/UserProfileAssignmentsPage.tsx: UserProfileAssignmentsPage:145
app/server/src/routes/index.ts, app/server/src/services/access-policy/index.ts
```

Функции шва не менялись; новые вызывающие — `GET /:id` и `GET /by-login/:login`.

## codegraph affected (конец плана)

```
Affected test files (3):
  app/server/src/routes/users/teacher-zone-users.matrix.test.ts
  app/server/src/routes/users/user-lookup.test.ts
  scripts/teacher-zone-guards.test.mjs
```

Индекс построен по основному дереву, где `user-rows.ts` ещё нет; `route-inventory.snapshot.test.ts` и `users-list.characterization.test.ts` (зависят от `routes/users/index.ts` через `app.ts`) прогнаны отдельно и в `yarn verify`.

## Diff снимка инвентаря (D-29)

```diff
diff --git a/app/server/route-inventory.txt b/app/server/route-inventory.txt
index dd6237a..c2dd6fc 100644
--- a/app/server/route-inventory.txt
+++ b/app/server/route-inventory.txt
@@ -16,6 +16,8 @@ POST /api/users/:id/sessions/revoke  validateUUID(id) > sessionRequired > <anony
 DELETE /api/users/:id/login-throttle  validateUUID(id) > sessionRequired > <anonymous>
 GET /api/users/directory  sessionRequired > <anonymous>
 GET /api/users  sessionRequired > requirePerm(users.read) > <anonymous>
+GET /api/users/:id  validateUUID(id) > sessionRequired > requirePerm(users.read) > <anonymous>
+GET /api/users/by-login/:login  sessionRequired > requirePerm(users.read) > <anonymous>
 PATCH /api/users/:id  validateUUID(id) > sessionRequired > requirePerm(users.edit) > <anonymous>
 PATCH /api/users/:id/group  validateUUID(id) > sessionRequired > requirePerm(users.edit) > <anonymous>
 DELETE /api/users/:id  validateUUID(id) > sessionRequired > requirePerm(users.edit) > <anonymous>
```

Проверка плана: `inventory diff ok`.

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/users/user-lookup.test.ts src/routes/users/users-list.characterization.test.ts` — 2 files, 15 passed.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/users` — 6 files, 163 passed.
- `node --test scripts/teacher-zone-guards.test.mjs` — pass 12, fail 0.
- `grep "all: true"` в `routes/users/index.ts` и `routes/users/user-rows.ts` — пусто; комментариев в новых и изменённых строках нет.
- `yarn verify` в worktree — шаги lockfile, env-contract, docs-commands, ci-workflow, format-check, lint-typecheck-test, migrations, script-tests passed; server 66 files / 1588 tests, web 57 / 1126, exam-core 12 / 605, rbac 1 / 9; последняя строка `yarn verify: OK`.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-06` — `08-06 changed only its files`.

## Self-Check: PASSED

Файлы `user-rows.ts`, `user-lookup.test.ts` на месте; изменены только шесть файлов allow-list плана; HEAD cface54 не менялся (коммитов нет по правилу пользователя).

## Deviations from Plan

### Решения исполнителя

**1. Сериализатор без параметра scope**
- **Где:** Task 1, `user-rows.ts`
- **Что:** в `<interfaces>` плана `serializeUserRow(row, scope)`; scope в сериализации не участвует (всё зависящее от scope считается в SQL `selectUserRows`), поэтому сигнатура `serializeUserRow(row)`. Scope маршрутов поиска по-прежнему только `await userScope(req)` (R3), что закреплено строками матрицы.

**2. Фильтр зоны внутри selectUserRows**
- **Где:** Task 1, `user-rows.ts`, `index.ts`
- **Что:** выражение фильтра зоны вынесено вместе с запросом в `userZoneFilter(scope)` и применяется внутри `selectUserRows`. Для `GET /` результат тот же (тот же фильтр в count и в запросе строк), для поиска — дополнительная защита к `canReadUser`.

Остальное — по плану.

## Known Stubs

Нет.

## Threat Flags

Нет: новые маршруты описаны в `<threat_model>` плана (T-8-13, T-8-14, T-8-15, T-8-67), смягчения реализованы и закреплены тестами.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

- Коммит файлов плана делает ведущая сессия (список файлов ниже).
- Выкатка: server раньше web (D-35) — сводно в 08-28.
- Read-only проверка на проде, сколько логинов не нормализовано (решение R7), — запрос из 08-28, выполняет пользователь.

## Файлы к коммиту

- app/server/src/routes/users/user-rows.ts (новый)
- app/server/src/routes/users/user-lookup.test.ts (новый)
- app/server/src/routes/users/index.ts
- app/server/src/routes/users/teacher-zone-users.matrix.test.ts
- scripts/teacher-zone-guards.test.mjs
- app/server/route-inventory.txt

## Передачи следующим планам

- 08-11: `GET /api/users/<id>` → `{ user: UserRow }` (та же форма, что элемент `rows` в `GET /api/users`); 401 без сессии, 403 `{ error: 'Forbidden' }` для чужого и для несуществующего у учителя, 404 `{ error: 'Пользователь не найден' }` только при zone.all, 400 на не-UUID. `GET /api/users/by-login/<login>` — та же форма; логин кодировать `encodeURIComponent`, сервер делает `trim()` и поиск без учёта регистра только при единственном совпадении.
- Любой план, меняющий строку пользователя: правка только в `routes/users/user-rows.ts` (`selectUserRows` / `serializeUserRow`), она сразу действует на три маршрута; scope передавать только из `userScope(req)`.
- 08-26/08-27: в инвентаре `teacher-zone-guards.test.mjs` теперь 45 маршрутов; `GET /api/users/:id` зарегистрирован до `PATCH /:id`, `GET /by-login/:login` — сразу после него.
