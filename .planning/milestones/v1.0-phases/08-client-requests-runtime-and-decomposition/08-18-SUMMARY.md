---
phase: 08-client-requests-runtime-and-decomposition
plan: 18
subsystem: web/users (экран «Пользователи», правка пользователя, права пользователя)
tags: [HTTP-02, D-06, D-08, D-09, swr, users, rbac]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-04
    provides: request, requestJson, fetcherWith, failureMessage, LoadErrorAlert
  - phase: 08-11
    provides: usersKeys, parseUserEnvelope, revokeUserSessions, clearLoginThrottle
  - phase: 08-13
    provides: groupsKeys.list(), groupsListFetcher (тело как есть)
provides:
  - lib/users/api.ts — parseUsersList, usersListFetcher, userGrantsKey, parseUserGrants, userGrantsFetcher, updateUser, setUserGroups, deleteUser, setUserGrant, removeUserGrant; типы UsersList, PatchUserBody, GrantsResponse, UserGrantTarget, UserGrantBody
  - UsersClient — блок «Не удалось загрузить пользователей» вместо UsersTable
  - UserGrantsDialog — блок «Не удалось загрузить права пользователя» в теле диалога
  - EditUserDialog — строка «Не удалось загрузить группы», выключенный триггер групп, инвалидация byLogin
affects: [08-19, 08-21, 08-23]

actuals:
  tokens: 8000
  tasks: 3
  commits: 0
plan_head_before: 03d234161b7093bd375f4c379438442859d10617
plan_head_after: 03d234161b7093bd375f4c379438442859d10617

tech-stack:
  added: []
  patterns:
    - "Ключи SWR строками из usersKeys / groupsKeys / userGrantsKey, условный ключ — `cond ? key : null`; фетчеры fetcherWith(parse) уровня модуля"
    - "Блок ошибки загрузки — только при `error !== undefined && data === undefined`, фокус возврата — ref заголовка с tabIndex={-1}"
    - "Действия диалогов: RequestOutcome → failureMessage(outcome, запасной); пустая строка (auth/aborted) — без текста и тоста"

key-files:
  created: []
  modified:
    - app/web/lib/users/api.ts
    - app/web/lib/users/api.test.ts
    - app/web/lib/users/role-traits.ts
    - app/web/app/(internal)/(protected)/admin/users/UsersClient.tsx
    - app/web/components/users/UsersTable.tsx
    - app/web/components/users/dialogs/EditUserDialog.tsx
    - app/web/components/users/dialogs/UserGrantsDialog.tsx

key-decisions:
  - "Отказ переключателя в UserGrantsDialog: toast.error(failureMessage(outcome)) без запасного текста (в UI-SPEC его нет; тексты — из Поверхности 2), при auth/aborted тоста нет, mutate() не вызывается — переключатель остаётся по данным кэша (решение исполнителя, автономно)"
  - "Запасные тексты EditUserDialog — только существовавшие: сохранение профиля без запасного (раньше `HTTP N`, теперь `Запрос отклонён (код N).`/`Ошибка сервера (код N).`), группы — «Не удалось обновить группу», удаление — «Не удалось удалить пользователя»"
  - "Признак переопределений строится по data грантов: при ошибке первой загрузки data нет — признак не показывается; при ошибке ревалидации поверх загруженных данных признак остаётся (консервативно: предупреждение о сбросе прав не прячется)"
  - "Порядок 07.1 сохранён: при отказе setUserGroups после успешного updateUser кэши не инвалидируются и диалог остаётся открытым, как раньше"
  - "После сохранения инвалидируются usersKeys.list(), userGrantsKey(id) и usersKeys.byLogin для прежнего и нового логина (Set, пустые пропускаются)"
  - "removeUserGrant принимает UserGrantTarget без allow, setUserGrant — UserGrantBody с allow (уточнение сигнатуры из interfaces плана)"

metrics:
  duration: 25min
  completed: 2026-10-05
---

# Phase 8 Plan 18: «Пользователи», правка пользователя и права пользователя на доменном слое Summary

**Экран «Пользователи», `UsersTable`, `EditUserDialog`, `UserGrantsDialog` и `useRoleTraits` ходят в API только через `lib/users/api.ts`, `lib/groups/api.ts` и `requestJson`: ошибка списка — блок «Не удалось загрузить пользователей» вместо пустой таблицы, ошибка прав — блок в диалоге, ошибка групп в правке — строка под выключенным триггером; после сохранения обновляется и шапка `/profile/<login>`.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Выполнено

### Task 1 (tracer, TDD): список пользователей через слой и блок ошибки

- Снимок `08-plan-files.cjs snapshot 08-18` — `fingerprint 08-18 0 paths` (дерево чистое, HEAD 03d2341).
- RED: в `api.test.ts` добавлены тесты `parseUsersList`/`usersListFetcher`, `userGrantsKey`/`parseUserGrants`/`userGrantsFetcher`, `setUserGrant`/`removeUserGrant`, `updateUser`/`setUserGroups`/`deleteUser`. Прогон `vitest run lib/users` — `Tests 16 failed | 66 passed (82)` (лог `scratchpad/08-18-red.log`, функций ещё не было).
- GREEN: функции в `lib/users/api.ts`:
  - `parseUsersList` — `rows` массив и `total` число, возвращает то же тело (ключ `'/api/users'` общий с `GroupSheet`, который читает его через `swrFetcher`);
  - `parseUserGrants` — массивы `roles`, `roleKeys`, `userOverrides`, `effective`, тело как есть;
  - `usersListFetcher`, `userGrantsFetcher` — `fetcherWith(parse…)` на уровне модуля;
  - `userGrantsKey(id)` = `/api/rbac/user/<id>/grants` (id через `encodeURIComponent`, для UUID строка прежняя);
  - `updateUser` — `PATCH /api/users/<id>`; `setUserGroups` — `PATCH /api/users/<id>/group` с `{ groupIds }`; `deleteUser` — `DELETE /api/users/<id>`; `setUserGrant` — `POST /api/rbac/user/grant` `{ userId, domain, action, allow }`; `removeUserGrant` — `DELETE /api/rbac/user/grant` `{ userId, domain, action }`.
  - `vitest run lib/users` — 5 файлов, 82 passed.
- `UsersClient.tsx`: `useSWR(usersKeys.list(), usersListFetcher)`, `useSWR(groupsKeys.list(), groupsListFetcher)`; `loadFailed = error !== undefined && data === undefined` → `LoadErrorAlert` «Не удалось загрузить пользователей» вместо `UsersTable` целиком, «Повторить» — `mutate()`, `h1` «Пользователи» — `ref` + `tabIndex={-1}` (`focusTarget`). Фильтр групп при ошибке `/api/groups` не рендерится (`allGroups` пуст), список работает. Локальный `fetcher` с мёртвой веткой 401 и тип `Group` удалены.
- При отказе `auth` блок не рисуется (`LoadErrorAlert` → `null`) и `UsersTable` не рендерится до перехода на вход — тот же паттерн, что в `GroupsClient` (08-13).
- `UsersTable.tsx`: `mutate(usersKeys.list())`.
- Шлюз tracer: `vitest run lib/users` 82 passed, `yarn workspace @bio-exam/web typecheck` — exit 0.

### Task 2: правка пользователя, права пользователя, признаки ролей

- `EditUserDialog.tsx`:
  - гранты — `useSWR(enabled && user ? userGrantsKey(user.id) : null, userGrantsFetcher)`; признак переопределений — по `data` (при ошибке первой загрузки не показывается);
  - группы — `useSWR(open ? groupsKeys.list() : null, groupsListFetcher)`, `parseInviteGroups` оставлен (берёт `owner` для `groupItemSuffix`); `groupsFailed` → блок «Группа» рендерится, триггер `disabled`, `Popover` не открывается, под триггером `<p className="text-xs text-destructive">Не удалось загрузить группы</p>`. При выключенном триггере выбор не меняется, `groupIdsChanged` ложно — `setUserGroups` не вызывается, членство не стирается (T-8-43);
  - сохранение — `updateUser`, затем при изменении групп `setUserGroups` (порядок и условия 07.1); тексты — `failureMessage(outcome[, запасной])`, пустой текст (auth/aborted) — без строки ошибки;
  - после сохранения — `mutate(usersKeys.list())`, `mutate(userGrantsKey(id))`, `mutate(usersKeys.byLogin(...))` для прежнего и нового логина;
  - удаление — `deleteUser`, запасной «Не удалось удалить пользователя», затем `mutate(usersKeys.list())`;
  - «Сеансы и вход» — `revokeUserSessions` / `clearLoginThrottle`, ветвление как в `UserProfileAssignmentsPage` (`actionErrorText(kind, outcome.status ?? 0)`, при auth/aborted тоста нет);
  - тип `GrantsResponse` и локальный `fetcher` удалены, импорт `@/lib/api-fetch` (`AuthExpiredError`, `apiFetch`) убран.
- `UserGrantsDialog.tsx`: `useSWR(enabled && userId ? userGrantsKey(userId) : null, userGrantsFetcher)`; ошибка без данных — `LoadErrorAlert` «Не удалось загрузить права пользователя» в теле диалога вместо таблицы переключателей, «Повторить» — `mutate()`, `DialogTitle` — `ref` + `tabIndex={-1}`; запись — `setUserGrant` / `removeUserGrant`, отказ — тост `failureMessage(outcome)`.
- `role-traits.ts`: `fetchRoleTraits(url)` = `requestJson<unknown>(url)` без `parse`; ключ `'/api/rbac/roles'` и `parseRoleTraits` в хуке не менялись, при ошибке — запасные признаки, как раньше. `role-traits.test.ts` не менялся (сигнатура та же).
- `<automated>` Task 2: `vitest run lib/users` — 82 passed; проверка пяти файлов — `user screens ok`.

### Task 3: codegraph affected, verify, e2e, сверка

- `yarn verify` — `yarn verify: OK` (web 1288, server 1670; все 8 шагов passed; лог `scratchpad/08-18-verify.log`).
- `yarn e2e` — 194 passed, 0 failed (chromium-desktop и chromium-mobile, в том числе `teacher-zone.spec.ts` шаг 4 с `dialog.getByLabel('Группа')` и `user-lookup.spec.ts`; лог `scratchpad/08-18-e2e.log`). Строки `[WebServer] ⨯ Error: Server request for /admin/attempts/not-a-uuid failed: status 400` — штатный вывод сценария страниц сервера.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-18` — `08-18 changed only its files`.

## codegraph

Индекс построен по основному дереву, в worktree индекса нет; команды запускались из `/Users/kdvornichenko/bio-exam`.

`codegraph impact` (до правок):
- `UsersClient` — 3 символа: `UsersClient`, `UsersPage` (`admin/users/page.tsx`), маршрут `/web/app/admin/users`.
- `EditUserDialog` — 9 символов: `UsersTable`, `UsersClient`, `UserProfileAssignmentsPage`, `ProfileByIdPage` (`profile/[id]/page.tsx`).
- `UserGrantsDialog` — 7 символов: `EditUserDialog`, `UsersTable`, `UserProfileAssignmentsPage`.
- `useRoleTraits` — 7 символов: `InviteUserDialog` (`AdminInviteForm`, `InviteUserDialog`), `EditUserDialog` (`RoleZoneAlert`, `EditUserDialog`).

`codegraph affected` по шести исходным файлам плана → `app/web/lib/users/role-traits.test.ts`. Тесты `lib/users/api.test.ts` (прямой импорт `api.ts`) и все web-тесты прошли в `yarn verify`.

## Проверки

- `yarn workspace @bio-exam/web vitest run lib/users` — 5 файлов, 82 passed.
- `yarn workspace @bio-exam/web typecheck` — exit 0.
- `yarn workspace @bio-exam/web lint` — новых предупреждений нет (`react(set-state-in-effect)` в `EditUserDialog.tsx` — существовавший эффект инициализации формы).
- Проверка пяти файлов на локальный `fetcher`, голый `fetch(` и `lib/api-fetch` — `user screens ok`.
- `oxfmt` по каждому файлу с `./`; `format-check` в `yarn verify` — passed.
- `yarn verify` — `yarn verify: OK`.
- `yarn e2e` — 194 passed.
- `08-plan-files.cjs check 08-18` — `08-18 changed only its files`.

## TDD Gate Compliance

RED (16 красных тестов на отсутствующие функции слоя) → GREEN (82 passed) по сути; RED/GREEN-коммиты не делались по правилу пользователя. REFACTOR не понадобился.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Отказ переключателя прав больше не уходит необработанным исключением**
- **Found during:** Task 2
- **Issue:** `toggle` в `UserGrantsDialog` бросал `Error(await res.text())` из обработчика `onCheckedChange` — необработанное отклонение промиса, пользователь ничего не видел.
- **Fix:** исход `setUserGrant`/`removeUserGrant` → `toast.error(failureMessage(outcome))`, при auth/aborted тоста нет.
- **Files modified:** `app/web/components/users/dialogs/UserGrantsDialog.tsx`

**2. Сигнатура `removeUserGrant`** — `UserGrantTarget` (`userId`, `domain`, `action`) вместо общего `UserGrantBody`: тело `DELETE` как раньше, без `allow`.

Иначе план выполнен как написан.

## Threat Flags

Новой поверхности нет. T-8-43: триггер групп выключен при ошибке загрузки, выбор не меняется, `setUserGroups` не вызывается. T-8-44: права в web только для показа (принят). T-8-SC: установок пакетов нет.

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. Блок ошибки на «Пользователях» и в диалоге «Права пользователя» на ширине 375px (Поверхность 1, backstop): блок во всю ширину, причина переносится, «Повторить» 44px во всю ширину ниже `mob`. Сводно в 08-28.
2. Коммит файлов плана делает ведущая сессия.

## Передачи следующим планам

- 08-19 (`ReinviteUserDialog`, свой профиль): инвалидация списка — `mutate(usersKeys.list())`; строка та же, кэш общий с `UsersClient` (`usersListFetcher`, тело как есть). Функции правки пользователя — в `lib/users/api.ts` (`updateUser`, `PatchUserBody` = `UserPatch` из `edit-user-form.ts`).
- 08-21 (RBAC): ключ `'/api/rbac/roles'` общий с `useRoleTraits`, который кладёт в кэш тело ответа без преобразования (`requestJson` без `parse`) — фетчер экрана RBAC для этого ключа тоже должен возвращать тело как есть. Гранты пользователя: `userGrantsKey(id)`, `userGrantsFetcher`, `GrantsResponse`, `setUserGrant`, `removeUserGrant` — в `lib/users/api.ts`; `POST/DELETE /api/rbac/user/grant` больше нигде в web не вызываются напрямую.
- 08-23: `EditUserDialog`, `UserGrantsDialog`, `UsersClient`, `UsersTable`, `role-traits.ts` не импортируют `@/lib/api-fetch` и не используют `fetch(`. `UserProfileAssignmentsPage` передаёт в `EditUserDialog` свой `onSaved` (инвалидация `byLogin` и списка) — диалог теперь и сам инвалидирует эти ключи; дублирование безвредно, при чистке можно убрать из страницы.

## Файлы к коммиту

- `app/web/lib/users/api.ts`
- `app/web/lib/users/api.test.ts`
- `app/web/lib/users/role-traits.ts`
- `app/web/app/(internal)/(protected)/admin/users/UsersClient.tsx`
- `app/web/components/users/UsersTable.tsx`
- `app/web/components/users/dialogs/EditUserDialog.tsx`
- `app/web/components/users/dialogs/UserGrantsDialog.tsx`

## Self-Check: PASSED

- Изменённые файлы на месте (7, `git status --porcelain` совпадает со списком выше); `role-traits.test.ts` (необязательный) не менялся.
- Коммитов нет по правилу пользователя: `commits: 0`, HEAD до и после 03d234161b7093bd375f4c379438442859d10617, изменения в рабочем дереве.
