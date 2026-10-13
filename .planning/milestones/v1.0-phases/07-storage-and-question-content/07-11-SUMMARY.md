---
phase: 07-storage-and-question-content
plan: 11
subsystem: users
tags: [users, rbac, privacy, directory, access-policy, d-07, d-20, d-21, d-22, priv-01, priv-02, priv-03]

requires:
  - phase: 07-storage-and-question-content
    provides: "07-05: характеризация GET /api/users и красная PRIV-user-gets-users"
  - phase: 07-storage-and-question-content
    provides: "07-03/07-08: links.ts (avatarUrl), ключи avatars/<userId>/ в users.avatar*"
  - phase: 07-storage-and-question-content
    provides: "services/access-policy/scope.ts (canReadUser, коммит 256aca8), реэкспорт из services/access-policy/index.ts"
provides:
  - "ROLE_REGISTRY.user.grants = {}: роль user без прав"
  - "GET /api/users/directory?q=&limit= под sessionRequired(): активные пользователи, семь ключей, ILIKE с экранированием"
  - "GET /api/users: avatar и avatarCropped через avatarUrl, строки фильтруются canReadUser(req, row.id), гейт requirePerm('users', 'read') на месте"
  - "directory.test.ts: матрица прав и полей D-22"
affects: [07-16, 07-17, "08 (D7, GET /api/users/:id)", "07.1 (учителя, зона ответственности)"]

actuals:
  tokens: 5186
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Поиск по пользователям: q.trim() ≥ 2, шаблон ILIKE с заменой \\, %, _ и escape '\\' через параметры drizzle sql"
    - "Полный DTO: глобальный гейт права плюс построчный canReadUser (Promise.all, порядок сохраняется, access кэшируется на запрос)"

key-files:
  created:
    - app/server/src/routes/users/directory.test.ts
  modified:
    - packages/rbac/src/roles.ts
    - packages/rbac/src/index.test.ts
    - app/server/src/routes/users/index.ts
    - app/server/src/routes/users/users-list.characterization.test.ts
    - app/server/src/services/access-policy/policy.test.ts
    - app/server/src/routes/auth/me-requirePerm-parity.test.ts
    - app/web/lib/session/route-permissions.test.ts

key-decisions:
  - "Точное совпадение name сравнивается без учёта регистра: lower(name) = lower(q)"
  - "Поиск по «first_name last_name» через concat_ws(' ', first_name, last_name): строка не превращается в NULL, если одна часть пустая"
  - "limit в /directory: Math.trunc(Number(limit)) || 10, затем в пределах 1…20; нечисловой и 0 → 10"
  - "q, переданный массивом (?q=a&q=b), считается пустым → 400"
  - "Сид parity_deny_user переведён на роль admin; в тесте добавлена проверка, что users.edit остаётся (deny снимает только users.read)"

requirements-completed: [PRIV-01, PRIV-02, PRIV-03]

coverage:
  - id: D1
    description: "Tracer: роль user → 403 на GET /api/users, 200 на /directory с семью ключами"
    requirement: PRIV-01
    verification:
      - kind: integration
        ref: "app/server/src/routes/users/users-list.characterization.test.ts#PRIV-user-gets-users"
        status: pass
      - kind: integration
        ref: "app/server/src/routes/users/directory.test.ts#user → 200, у каждого элемента ровно семь ключей"
        status: pass
    human_judgment: false
  - id: D2
    description: "Матрица прав и полей D-22 для /api/users и /directory"
    requirement: PRIV-03
    verification:
      - kind: integration
        ref: "app/server/src/routes/users/directory.test.ts"
        status: pass
      - kind: unit
        ref: "packages/rbac/src/index.test.ts#роль user без прав"
        status: pass
    human_judgment: false
  - id: D3
    description: "Экраны администратора на полном DTO под users.read"
    requirement: PRIV-02
    verification:
      - kind: integration
        ref: "app/server/src/routes/users/directory.test.ts#admin → 200 с полным набором полей"
        status: pass
    human_judgment: false
  - id: D4
    description: "Владельцы прав без users.read на проде, поведение web при 403, подтверждение D-20/D-21"
    requirement: PRIV-02
    verification: []
    human_judgment: true

duration: 20min
completed: 2026-10-04
status: complete
deferred_human_gate: true
plan_head_before: 35529b6
plan_head_after: 35529b6
---

# Phase 7 Plan 11: Справочник пользователей и права Summary

**Роль `user` больше не выдаёт `users.read` (`grants: {}`). Полный список `GET /api/users` остаётся экранам с `users.read`, отдаёт аватары через `avatarUrl` и пропускает строки через `canReadUser(req, row.id)`. Новый `GET /api/users/directory` под одной сессией ищет активных пользователей по имени и отдаёт ровно семь полей.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** около 20 мин
- **Completed:** 2026-10-04
- **Tasks:** 3 из 3 автоматических; Task 4 (blocking-human) записан в Deferred
- **Files:** 1 новый, 7 изменённых

## Accomplishments

- `packages/rbac/src/roles.ts`: у `user` `grants: {}`. Пакет пересобран (`yarn workspace @bio-exam/rbac build`), сервер и web читают `dist`.
- `packages/rbac/src/index.test.ts`: тест «роль user без прав» — `ROLE_REGISTRY.user.grants` равно `{}`, список действий роли пуст.
- `app/server/src/routes/users/index.ts`:
  - `GET /directory` объявлен сразу после `router.use('/', loginThrottleRouter)`, до `GET /` и до первого параметрического `PATCH /:id`. Подроутеры `sessions.ts` (`POST`) и `login-throttle.ts` (`DELETE`) `GET /directory` не объявляют.
  - Только `sessionRequired()`. `q` — строка после `trim`, короче 2 символов или не строка → 400 `{ error: 'Укажите не меньше 2 символов для поиска' }`. `limit` 1…20, по умолчанию 10.
  - `is_active = true` и `ILIKE` по `name`, `first_name`, `last_name`, `concat_ws(' ', first_name, last_name)`; `\`, `%`, `_` экранируются, шаблон уходит параметром, `escape '\'`. `login` в поиске не участвует.
  - Порядок: `lower(name) = lower(q)` → начало `name` → прочие; затем `name`, `id`.
  - Ответ `{ users: [{ id, name, firstName, lastName, initials, avatarColor, avatarCropped }] }`, `avatarCropped` через `avatarUrl`.
  - `GET /`: `avatar` и `avatarCropped` через `avatarUrl` (D-07, перешло из 07-08). Строки фильтруются `canReadUser(req, row.id)` через `Promise.all`, порядок сохраняется. `total` по-прежнему по всей таблице. Гейт `requirePerm('users', 'read')` на месте.
- `users-list.characterization.test.ts`: `KNOWN_DEFECTS` пуст, `PRIV-user-gets-users` обычная и зелёная.
- Тесты фазы 4 переключены (Task 2).

## Места `users.read` (Task 1, `rg`) и решение

| Место | Что | Решение |
|---|---|---|
| `packages/rbac/src/roles.ts:28` | `user: { users: ['read'] }` | изменено на `grants: {}` (Task 1) |
| `packages/rbac/src/index.test.ts:28-30` | `can()` на готовом наборе `['users.read']` | остаётся: проверяет функцию `can`, а не роль |
| `app/server/src/services/access-policy/policy.test.ts:178` | `ROLE_REGISTRY` по умолчанию → `['users.read']` | переключено на `[]` (Task 2) |
| `policy.test.ts:20, 42, 73-74, 165` | локальный `REGISTRY` теста (`loopA`, `base`, `auditor`) | остаётся: не роль `user` пакета |
| `app/server/src/routes/auth/me-requirePerm-parity.test.ts:114` | `user` имеет `users.read` | переключено на «не имеет» (Task 2) |
| `me-requirePerm-parity.test.ts:50, 123-126` | deny `users.read` у `user` | сид `parity_deny_user` переведён на роль `admin`, тест переименован в «admin + deny users.read в rbac_user_grants: все ключи совпадают, users.read нет», добавлена проверка `users.edit` (Task 2) |
| `me-requirePerm-parity.test.ts:172` | `grants.roleKeys` = `['users.read']` | переключено на `[]` (Task 2) |
| `app/web/lib/session/route-permissions.test.ts:46-48` | набор роли `user` = `['users.read']` | переименован в «роль user без прав не открывает ни один раздел», ожидание `[]` (Task 2, C3) |
| `app/web/lib/session/server.test.ts:30, 149` | заготовленные `perms` в ответе `/api/auth/me` | остаётся: не читает `ROLE_REGISTRY` |
| `app/server/src/services/access-policy/scope-rules.ts:23` | `canReadUser` → `users.read` | остаётся (задел фазы «Учителя») |
| `app/server/src/services/access-policy/scope.test.ts:24, 41` | правило `canReadUser` | остаётся |
| `app/server/src/services/search/database-search.ts:89` | поиск `users` под `privileged && users.read` | не меняется (запрет плана) |
| `app/server/src/routes/users/index.ts:41-42` | `GET /` под `requirePerm('users', 'read')` | гейт остаётся, добавлен построчный `canReadUser` |

Других тестов, закреплявших `users.read` у роли `user`, нет.

## TDD (Task 2): порядок красный → зелёный

- После Task 1 и сборки `rbac`, до правки тестов фазы 4:
  - `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/access-policy/policy.test.ts src/routes/auth/me-requirePerm-parity.test.ts` → `Tests 3 failed | 28 passed (31)`:
    - «по умолчанию используется ROLE_REGISTRY пакета» — `expected [] to deeply equal [ 'users.read' ]`;
    - «user: все ключи совпадают» — `perms.has('users.read')` ложно;
    - «user + allow tests.read: переопределение видно отдельно…» — `roleKeys` `[]` вместо `['users.read']`.
  - `yarn workspace @bio-exam/web test` → `Tests 1 failed | 473 passed (474)`: «набор прав роли user (users.read) не открывает ни один раздел».
- После переключения: `Test Files 12 passed (12)`, `Tests 184 passed (184)` на сервере и `Tests 474 passed (474)` в web.
- `directory.test.ts` написан против уже готового маршрута (маршрут — часть tracer Task 1). Проверки различают поведение: без экранирования `q='%_'` совпал бы с любым непустым именем, и тест упал бы.
- Коммиты RED/GREEN не создавались (правило пользователя).

## codegraph impact (D-24)

`codegraph impact ROLE_REGISTRY` (индекс основного дерева) — 21 символ:

- `packages/rbac`: `roles.ts` (`ROLE_REGISTRY`, `ROLES_LIST`, `ROLE_KEYS`, `roleDisplayName`), `index.ts`, `access.ts`, `index.test.ts`;
- server: `routes/rbac/index.ts` (`GET /api/rbac/roles` отдаёт `grants: r.grants`, теперь `{}` у `user`), `routes/index.ts`, `services/access-policy/policy.ts`, `db/seed.ts`, `routes/users/index.ts`;
- web: `lib/session/route-permissions.test.ts`, `components/users/dialogs/EditUserDialog.tsx`, `InviteUserDialog.tsx`, `UserRowItem.tsx`, `UsersTable.tsx` (используют ключи и названия ролей, не гранты).

## codegraph affected (Task 3)

`codegraph affected packages/rbac/src/roles.ts app/server/src/routes/users/index.ts` — 16 файлов:

- server: `me-requirePerm-parity.test.ts`, `policy.test.ts`, `uploads.test.ts`, `routes/tests/{assignments,index,public}.ts`;
- web: `admin/tests/layout.tsx`, `components/tests/TestRunner.tsx`, `lib/session/client.test.ts`, `lib/session/route-permissions.test.ts`;
- `packages/rbac/src/index.test.ts`;
- e2e: `fixtures/exam.ts`, `tests/{auth,authoring,review,session}.spec.ts`.

Тесты server, web и rbac прошли в `yarn verify`. В `e2e` нет обращений к `/api/users` и `users.read` (`rg`). `yarn e2e` не входит в `yarn verify` и не запускался.

## Вызывающие `/api/users` в web (PRIV-02)

`rg -n "/api/users['\x60?]" app/web --glob '!node_modules'`:

| Файл | Использование | Экран |
|---|---|---|
| `app/(internal)/(protected)/admin/users/UsersClient.tsx:25` | `useSWR('/api/users')` | администратор, список пользователей |
| `components/groups/GroupSheet.tsx:46` | `useSWR('/api/users')`, поиск по `login`, статус | администратор, карточка группы |
| `admin/tests/components/test-editor/useTestEditorModel.ts:97` | `useSWR('/api/users')`, `login`, `isActive` | администратор, редактор теста |
| `components/users/UserProfileAssignmentsPage.tsx:106` | `useSWR('/api/users')`, поиск по `login` | администратор, назначения пользователя |
| `app/(internal)/(protected)/admin/users/[id]/page.tsx:19` | серверный fetch | администратор, карточка пользователя |
| `components/users/dialogs/EditUserDialog.tsx:237, 269`, `ReinviteUserDialog.tsx:57`, `UsersTable.tsx:57` | `mutate('/api/users')` | инвалидация кэша |
| `lib/session/client.test.ts:473` | тест `apiFetch` | тест |

Все вызывающие — экраны администратора на полном DTO. Студенческого вызывающего нет, минимальный DTO не расширялся. Вызывающих `/api/users/directory` в web пока нет.

## Решения исполнителя (автономно)

1. Точное совпадение `name` без учёта регистра (`lower(name) = lower(q)`), как и сам поиск `ILIKE`.
2. ФИО ищется через `concat_ws(' ', first_name, last_name)`: при пустой части строка не становится `NULL`.
3. `limit`: `Math.trunc(Number(limit)) || 10`, затем 1…20. `limit=0` и нечисловое значение дают 10.
4. `q`, переданный массивом, считается пустым → 400.
5. Тест «admin + deny users.read» дополнен проверкой `users.edit`: deny снимает только `users.read`, остальные права роли `admin` на месте.

## Deviations from Plan

None - plan executed exactly as written. Решения выше уточняют детали, которых нет в плане.

## Verification

- Task 1 (tracer):
  - `yarn workspace @bio-exam/rbac test` → `Tests 3 passed (3)`;
  - `yarn workspace @bio-exam/rbac build` → `Build complete`;
  - `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/users/users-list.characterization.test.ts` → `Tests 4 passed (4)`, без `expected fail`. Gate tracer: перепрогон зелёный, расширение продолжено.
- Task 2:
  - `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/users src/routes/auth src/services/access-policy` → `Test Files 12 passed (12)`, `Tests 184 passed (184)`; отдельно `directory.test.ts` → `Tests 21 passed (21)`;
  - `yarn workspace @bio-exam/web test` → `Test Files 22 passed (22)`, `Tests 474 passed (474)`;
  - структурная проверка → `directory and scope ok`.
- Task 3:
  - `yarn verify` → `yarn verify: OK`, шаги `lockfile`, `env-contract`, `docs-commands`, `ci-workflow`, `format-check`, `lint-typecheck-test`, `migrations`, `script-tests` — `passed`. Тесты: server 37 файлов, `801 passed | 5 expected fail (806)`; web 474; exam-core 498; rbac 3;
  - сверка с отпечатком `.planning/commit-snapshots/before-07-11/fingerprint.json` (0 путей до плана) → `07-11 changed only its files`.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. **Все переопределения прав на проде, только чтение, до выкатки:**
   ```sql
   SELECT role_key, domain, action, allow FROM rbac_role_grants ORDER BY 1, 2, 3;
   SELECT user_id, domain, action, allow FROM rbac_user_grants ORDER BY 1, 2, 3;
   ```
   Переопределения могут вернуть `users.read` роли `user` или выдать права, которым нужен список пользователей.
2. **Условие выкатки (07-16 Task 4 п. 1).** Владельцы `tests.read`, `tests.write`, `tests.manage_assignments` или `groups.manage_groups` без `users.read` и без роли `admin`, только чтение:
   ```sql
   WITH p AS (
     SELECT ur.user_id, g.domain, g.action, g.allow
     FROM user_roles ur JOIN rbac_role_grants g ON g.role_key = ur.role_key
     UNION ALL
     SELECT user_id, domain, action, allow FROM rbac_user_grants
   )
   SELECT u.id, u.login, array_agg(DISTINCT p.domain || '.' || p.action) AS perms
   FROM users u JOIN p ON p.user_id = u.id
   WHERE p.allow
     AND (p.domain, p.action) IN (('tests', 'read'), ('tests', 'write'), ('tests', 'manage_assignments'), ('groups', 'manage_groups'))
     AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role_key = 'admin')
     AND NOT EXISTS (SELECT 1 FROM p q WHERE q.user_id = u.id AND q.domain = 'users' AND q.action IN ('read', '*') AND q.allow)
   GROUP BY u.id, u.login
   ORDER BY u.login;
   ```
   После выкатки у таких пользователей список пользователей в карточке группы и в назначениях теста приходит с 403. Непустой результат — решение пользователя до выкатки: выдать им `users.read` переопределением или принять пустой список в этих экранах.
3. **Web при 403 от `/api/users`:** `components/groups/GroupSheet.tsx` (`fetch().then((r) => r.json())` без проверки статуса) и `test-editor/useTestEditorModel.ts` (ошибка SWR для `/api/users` не выводится) молча показывают пустой список; `components/users/UserProfileAssignmentsPage.tsx` показывает «Не удалось загрузить пользователя». Файлы вне плана; вывод ошибки вместо пустого списка — отдельная задача по решению пользователя из п. 2 (ревью R8).
4. **Подтвердить D-20 и D-21:** `GET /api/users` для роли `user` — 403; `GET /api/users/directory` для любого вошедшего с минимальными полями. Альтернатива — без справочника совсем: эндпоинт удаляется, критерий успеха 5 переформулируется.
5. **Пересмотр гейта `/admin/users`** (`users.edit`, Phase 4 D-17) — Deferred CONTEXT, вне фазы.
6. **Коммит файлов плана** делает пользователь или оркестратор (список ниже).

## Known Stubs

Нет.

## Threat Flags

Новая поверхность — `GET /api/users/directory` — описана в `<threat_model>` плана.

- T-7-25 закрыт: `users.read` снят с роли, `PRIV-user-gets-users` обычная и зелёная, матрица D-22 в `directory.test.ts`.
- T-7-26 закрыт: ровно семь ключей (сравнение отсортированного списка ключей), только активные, `login` в поиске не участвует.
- T-7-27 закрыт: `q` не короче 2 символов, `limit` не больше 20, без `q` — 400.
- T-7-28 закрыт: `\`, `%`, `_` экранируются, запрос параметризован; тесты `%_` и обратного слеша.
- T-7-SC: установок пакетов нет.

## Файлы к коммиту

```
packages/rbac/src/roles.ts
packages/rbac/src/index.test.ts
app/server/src/routes/users/index.ts
app/server/src/routes/users/directory.test.ts                    (новый)
app/server/src/routes/users/users-list.characterization.test.ts
app/server/src/services/access-policy/policy.test.ts
app/server/src/routes/auth/me-requirePerm-parity.test.ts
app/web/lib/session/route-permissions.test.ts
```

## Self-Check: PASSED

- `directory.test.ts` существует; `git status --porcelain --untracked-files=all` показывает ровно 8 путей плана.
- Коммитов нет по правилу пользователя (`plan_head_before` = `plan_head_after` = 35529b6).
