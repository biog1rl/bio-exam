---
phase: 04-authentication-and-web-session
plan: 12
subsystem: auth
tags: [web-session, rbac, route-gates, d-17, auth-12, next-layout, notFound, playwright, vitest]
status: complete
deferred_human_gate: true

requires:
  - phase: 04-authentication-and-web-session
    provides: "04-11: getServerMe только через Express (401 → null, сбой → ошибка), sessionError, асинхронный (protected)/layout.tsx; 04-10: один AuthProvider с perms и can; 04-09: модуль веб-сессии lib/session"
provides:
  - "app/web/lib/session/route-permissions.ts: Section, SECTION_PERMISSIONS (раздел → PermissionKey[], любое из), sectionForPath (самый длинный префикс по границе сегмента), canAccessSection через can из @bio-exam/rbac"
  - "app/web/lib/session/section-access.ts (server-only): requireSectionAccess(section) → me | null, нет права → notFound()"
  - "Серверные layout /admin, /admin/{tests,attempts,users,groups,sidebar,settings/chart,settings/rbac}; гейт в начале admin/settings/page.tsx"
  - "AuthGuard без обхода по роли admin и без requireAll/requireAny; проверка раздела только в гарде контента (redirectTo), при отказе рендерит children и один раз на набор прав вызывает router.refresh()"
affects: [04-13, 04-14]

actuals:
  tokens: 9000
  tasks: 3
  commits: 0
plan_head_before: 1c78296b139aabe1d8484fd92bfd5da47baa2105
plan_head_after: 1c78296b139aabe1d8484fd92bfd5da47baa2105

tech-stack:
  added: []
  patterns:
    - "Гейт раздела — асинхронный серверный layout поддерева: const me = await requireSectionAccess('<раздел>'); if (!me) return null; return children"
    - "notFound() из layout раздела ловит корневая граница app/not-found.tsx, которая рендерится внутри children гарда контента AppLayout"

key-files:
  created:
    - app/web/lib/session/route-permissions.ts
    - app/web/lib/session/route-permissions.test.ts
    - app/web/lib/session/section-access.ts
    - app/web/app/(internal)/(protected)/admin/users/layout.tsx
    - app/web/app/(internal)/(protected)/admin/tests/layout.tsx
    - app/web/app/(internal)/(protected)/admin/attempts/layout.tsx
    - app/web/app/(internal)/(protected)/admin/groups/layout.tsx
    - app/web/app/(internal)/(protected)/admin/sidebar/layout.tsx
    - app/web/app/(internal)/(protected)/admin/settings/chart/layout.tsx
  modified:
    - app/web/app/(internal)/(protected)/admin/layout.tsx
    - app/web/app/(internal)/(protected)/admin/settings/page.tsx
    - app/web/app/(internal)/(protected)/admin/settings/rbac/layout.tsx
    - app/web/components/auth/AuthGuard.tsx
    - app/web/components/AppSidebar.tsx
    - app/web/app/(internal)/(protected)/profile/[id]/page.tsx
    - app/web/app/(internal)/(protected)/admin/users/[id]/page.tsx
    - app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx
    - app/web/app/(internal)/(protected)/profile/ProfileClient.tsx
    - app/web/lib/session/server.test.ts
    - app/web/lib/session/client.test.ts
    - e2e/tests/session.spec.ts

key-decisions:
  - "Решение исполнителя (автономно): охранный тест модуля веб-сессии (client.test.ts, добавлен в 04-09 сверх behavior) запрещал во всех lib/session/*.ts импорт @bio-exam/rbac и вызов can(. D-17 помещает карту «раздел → право» в модуль веб-сессии, план требует can из @bio-exam/rbac. Для одного файла route-permissions.ts запрет сужен: по-прежнему нет jsonwebtoken, AUTH_JWT_SECRET, verify(, buildPermissionSet, ROLE_REGISTRY, PERMISSION_DOMAINS, а единственный импорт файла — import { can, type PermissionKey } from '@bio-exam/rbac'. Для остальных файлов модуля правило прежнее"
  - "Решение исполнителя (автономно): router.refresh() в гарде контента вызывается один раз на ключ «отсортированный список perms» (useRef); на первой загрузке раздела без права это тоже один лишний refresh, сервер повторно отвечает 404"
  - "Решение исполнителя (автономно): rbac.write без rbac.read больше не открывает /admin и /admin/settings/rbac (раньше гейт был rbac.read | rbac.write). Карта D-17 даёт этим разделам только rbac.read; для ролей admin и user ничего не меняется, затрагивает только переопределения"

patterns-established:
  - "Таблица карты разделов в Vitest: набор прав роли строится из ROLE_REGISTRY раскрытием '*' по PERMISSION_DOMAINS прямо в тесте, без buildPermissionSet"

requirements-completed: [AUTH-12]

coverage:
  - id: D1
    description: "Карта D-17: sectionForPath по 15 путям (включая /admin-x → null, /admin/unknown → admin, /admin/settings/rbac → rbac); набор admin открывает все разделы, набор user (users.read) ни одного, tests.read → tests, attempts, admin; rbac.read → rbac, admin"
    requirement: AUTH-12
    verification:
      - kind: unit
        ref: "app/web/lib/session/route-permissions.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Роль user на /admin/users видит PAGE NOT FOUND, URL /admin/users, шапка AppLayout на месте, заголовка «Пользователи» и таблицы нет (после router.refresh() гарда)"
    requirement: AUTH-12
    verification:
      - kind: e2e
        ref: "e2e/tests/session.spec.ts#role user does not see the /admin/users section @session"
        status: pass
    human_judgment: false
  - id: D3
    description: "9 серверных гейтов разделов /admin со своим ключом, клиентского AuthGuard в них нет, общего settings/layout.tsx нет"
    requirement: AUTH-12
    verification:
      - kind: test
        ref: "проверка плана Task 2 → 9 section gates"
        status: pass
    human_judgment: false
  - id: D4
    description: "В app/web нет проверок по строкам ролей, обхода isAdmin, requireAny/requireAll (кроме разрешённого settings/rbac/page.tsx)"
    requirement: AUTH-12
    verification:
      - kind: test
        ref: "проверка плана Task 3 → no role checks in web"
        status: pass
    human_judgment: false
  - id: D5
    description: "/profile/[id] решает по tests.manage_assignments, а не по roles: роль admin без права → not-found, роль user с правом → страница"
    requirement: AUTH-12
    verification:
      - kind: unit
        ref: "app/web/lib/session/server.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "Администратор открывает /admin и разделы как раньше (flow 1, authoring, review, полный e2e)"
    requirement: AUTH-12
    verification:
      - kind: e2e
        ref: "e2e/tests/auth.spec.ts @flow1; полный yarn e2e"
        status: pass
    human_judgment: false
  - id: D7
    description: "Право снято, пока пользователь в разделе: гард контента вызывает router.refresh(), сервер отвечает 404 в те же children"
    verification: []
    human_judgment: true
    rationale: "Снятие права посреди сессии e2e не воспроизводит (нужна смена rbac-переопределения и опрос me); ветка отказа гарда проверена мутацией на первой загрузке. Вид — UI-SPEC [авто], требует подтверждения пользователя"

duration: 9min
completed: 2026-10-04
---

# Phase 4 Plan 12: Гейты UI по правам Express (D-17, AUTH-12) Summary

**Одна карта «раздел → право» в `lib/session/route-permissions.ts`, серверная проверка `requireSectionAccess` в layout каждого поддерева `/admin` (нет права → `notFound()` и существующая страница 404 без смены URL), тот же список в гарде контента `AuthGuard` без обхода по роли admin, а проверки по строкам ролей в страницах и клиентах заменены правами `tests.manage_assignments`, `tests.read`, `users.edit`.**

## Performance

- **Duration:** около 9 мин активной работы (без ожидания прогонов)
- **Started:** 2026-10-04T08:41:00Z
- **Completed:** 2026-10-04T08:50:30Z
- **Tasks:** 3/3
- **Files:** 21 путь в git (9 новых, 12 изменённых)

## Accomplishments

- `route-permissions.ts` (без React и `server-only`): `SECTION_PERMISSIONS` — `tests`/`attempts` → `tests.read`, `users` → `users.edit`, `groups` → `groups.manage_groups`, `rbac` → `rbac.read`, `settings`/`sidebar` → `settings.manage`, `admin` → любое из пяти. `sectionForPath` перебирает префиксы от длинного к короткому и сравнивает `pathname === prefix || pathname.startsWith(prefix + '/')`. `canAccessSection(perms, section)` — `some` по ключам раздела через `can` из `@bio-exam/rbac`.
- `section-access.ts` (`server-only`): `requireSectionAccess` берёт `getServerMe()` (кэш запроса, тот же вызов, что в `AppLayout` и `(protected)/layout.tsx`); `null` → `null` (layout ничего не рендерит, гард контента уводит на `/login?callbackUrl=<путь>`), нет права → `notFound()`, сбой `getServerMe` пробрасывается в `app/error.tsx`.
- `admin/layout.tsx` стал асинхронным серверным layout с `requireSectionAccess('admin')`, клиентский гейт `rbac.*` удалён. Новые layout: `users`, `tests`, `attempts`, `groups`, `sidebar`, `settings/chart`. `settings/rbac/layout.tsx` переписан на `requireSectionAccess('rbac')`. `settings/page.tsx` проверяет `'settings'` в начале страницы; общего `settings/layout.tsx` нет. Вложенных `not-found.tsx` нет.
- `AuthGuard.tsx`: удалены обход по роли admin, пропсы `requireAll`/`requireAny`, JSDoc к пропсам и импорты `PermissionKey`, `RoleKey`. Раздел вычисляется только при `redirectTo` (гард контента); при `me` и отказе по разделу гард рендерит `children` и в эффекте вызывает `router.refresh()` один раз на ключ отсортированного списка `perms`. Редирект при отсутствии `me`, ветка `sessionError` и `fallback` гардов сайдбара и шапки не изменились. `return null` остался только на `loading`.
- `profile/[id]/page.tsx` и `admin/users/[id]/page.tsx`: `can(new Set(me.perms), 'tests.manage_assignments')` вместо `roles.includes('admin')`. `DashboardClient.tsx`: `canReadTests = can('tests', 'read')`, импорт `RoleKey` удалён. `ProfileClient.tsx`: редактор аватара и ширина колонки по `can('users', 'edit')`. `AppSidebar.tsx`: удалён закомментированный блок с `AuthGuard requireAny`.
- `server.test.ts`: вместо «без роли admin» три сценария — `roles: ['user'], perms: ['tests.read']` → not-found; `roles: ['admin']` без `tests.manage_assignments` → not-found; `roles: ['user'], perms: ['tests.manage_assignments']` → страница.
- `e2e/tests/session.spec.ts`: тест `role user does not see the /admin/users section` после `networkidle` ждёт видимый `PAGE NOT FOUND` и хотя бы один `header`; путь `/admin/users`, нет заголовка `Пользователи` и таблицы.

## Task Commits

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве (ветка `dev`).

1. **Task 1 (tracer):** карта, `requireSectionAccess`, гейты `/admin` и `/admin/users`, ожидание `PAGE NOT FOUND` в e2e.
2. **Task 2:** серверные гейты `tests`, `attempts`, `groups`, `sidebar`, `settings/chart`, `settings/rbac`, `settings/page.tsx`.
3. **Task 3:** `AuthGuard`, страницы и клиенты по правам, `server.test.ts`, шапка в e2e, сужение охранного теста, полный прогон.

## Tracer gate и проверка мутацией

- **Tracer gate (Task 1):** `HUMAN_VERIFY_MODE` по умолчанию `end-of-phase`, `<verify>` только автоматический. `vitest run lib/session/route-permissions.test.ts` → `Tests 20 passed (20)`; `yarn e2e --grep "@session|@flow1"` → `24 passed (14.7s)`: `role user does not see the /admin/users section` и `admin logs in, opens /admin and logs out @flow1` зелёные на `chromium-desktop` и `chromium-mobile` со старым `AuthGuard`. Только после этого начат Task 2.
- **Task 3 после правки `AuthGuard`:** `yarn e2e --grep "role user does not see the /admin/users section"` → `6 passed (5.9s)` (4 setup + тест на двух проектах).
- **Мутация:** в `AuthGuard` добавлено `if (sectionDenied) return null` перед последним `return` → тот же прогон `2 failed | 4 passed`, `expect(locator).toBeVisible() failed` по `PAGE NOT FOUND` на обоих проектах. Файл восстановлен из копии, `cmp` совпал.

## codegraph impact (до правок)

- `AuthGuard` (`components/auth/AuthGuard.tsx:28`): 10 символов — `AppSidebar` (`components/AppSidebar.tsx:26`, только закомментированный блок), `AppLayout` (`components/AppLayout/AppLayout.tsx:18`, три экземпляра: сайдбар, шапка, контент с `redirectTo`), `RootLayout` (`app/layout.tsx:30`), `RBACLayout` (`admin/settings/rbac/layout.tsx:3`), `AdminLayout` (`admin/layout.tsx:3`) и их файлы. `requireAll`/`requireAny` передавали только `AdminLayout` и `RBACLayout`, оба переписаны.
- `AdminLayout` (`admin/layout.tsx:3`): 1 символ, внешних вызывающих нет (файловая конвенция Next).

## codegraph affected (после правок)

По 21 изменённому пути — 5 файлов: `app/web/lib/session/client.test.ts`, `route-permissions.test.ts`, `server.test.ts`, `e2e/tests/session.spec.ts` и `admin/tests/layout.tsx` (индекс относит его к тестам по пути `tests/`). Все прогнаны в `yarn verify` и полном `yarn e2e`.

## Verification

- `yarn workspace @bio-exam/web vitest run lib/session` → `Test Files 7 passed (7)`, `Tests 157 passed (157)`.
- `yarn workspace @bio-exam/web typecheck` → exit 0.
- Проверка Task 2 → `9 section gates`. Проверка Task 3 → `no role checks in web`. В `AuthGuard.tsx` `return null` только на `loading`.
- `yarn verify` → `yarn verify: OK` (все шаги `passed`; web `356 passed`, server `423 passed`, exam-core `498 passed`, rbac `2 passed`).
- `yarn e2e` (полный) → exit 0, `Running 122 tests`, `122 passed (37.9s)`. Ожидаемо падает только D1 (`review.spec.ts:303`, `@known-defect`) на `chromium-desktop` и `chromium-mobile`, как в 04-11. flow 1 (admin открывает `/admin`), authoring, review и session зелёные под admin и user.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Охранный тест модуля веб-сессии запрещал карту прав в `lib/session`**
- **Found during:** Task 3, прогон `vitest run lib/session`
- **Issue:** `client.test.ts` › `модуль веб-сессии не принимает решений о правах и не знает секрета JWT` проверяет все `lib/session/*.ts` регэкспом `/jsonwebtoken|AUTH_JWT_SECRET|@bio-exam\/rbac|\bcan\(|verify\(/` и упал на `route-permissions.ts`. Тест добавлен исполнителем 04-09 сверх behavior; D-17 явно помещает карту «раздел → право» в модуль веб-сессии, а план 04-12 требует `can` из `@bio-exam/rbac` по пути `lib/session/route-permissions.ts` (artifacts и key_links).
- **Fix:** для `route-permissions.ts` проверка стала `/jsonwebtoken|AUTH_JWT_SECRET|verify\(|buildPermissionSet|ROLE_REGISTRY|PERMISSION_DOMAINS/` плюс утверждение, что единственная строка импорта файла — `import { can, type PermissionKey } from '@bio-exam/rbac'`. Остальные файлы модуля проверяются прежним регэкспом (`section-access.ts` проходит его). Файл вне `files_modified`.
- **Files modified:** `app/web/lib/session/client.test.ts`
- **Verification:** `vitest run lib/session` → `157 passed`; `yarn verify: OK`.

### Прочее

- `route-permissions.test.ts` сверх behavior: пустой набор прав не открывает ни один раздел; проверка, что набор роли `user` из `ROLE_REGISTRY` равен `['users.read']`.
- `server.test.ts` сверх шага 5: сценарий «роль admin без `tests.manage_assignments` → not-found» (поле `roles` не решает в обе стороны).
- Не отклонение: запуск `root-pin.sh` отклонён правами; корень проверен `git rev-parse --show-toplevel` = `/Users/kdvornichenko/bio-exam`, запись только по путям внутри корня.
- Вне области, записано в `deferred-items.md`: нет файла `app/web/public/img/not-found.png` (Next пишет `isn't a valid image` при каждом 404, картинка не видна; `app/not-found.tsx` план менять запрещает); предупреждения oxlint `no-unused-vars` в `DashboardClient.tsx`, существовавшие до плана.

## Допущения UI-SPEC, оставшиеся unresolved

Из `04-UI-SPEC.md` (Applicable state considerations: 3 unresolved), переносятся без изменения:

1. **error — отзыв сессии посреди теста.** `TestRunner` ходит голыми `fetch`, 401 при отзыве не ведёт на логин до Phase 8 (HTTP-01…04); ответы сохраняются в WAL и на сервере и восстанавливаются после входа. Истечение access закрывает D-16.
2. **partial — несохранённые данные формы при навигации на логин.** Теряются при отказе refresh (401): отзыв, 30 дней бездействия, потеря ответа ротации (выход примерно через 15 минут); сбой сети или сервера на логин не ведёт. [авто] требует подтверждения.
3. **empty — карточки разделов на `/admin` и ссылки быстрого входа на дашборде при частичных правах.** Не фильтруются по карте: для ролей `admin` и `user` вид не меняется, пользователь с отдельным allow-переопределением увидит карточку, ведущую на 404. Фильтрация — отдельная правка (допущение планировщика 04-12).

## Threat Flags

Новой поверхности сверх `<threat_model>` нет. T-4-42: проверка в серверном layout до рендера, данные разделов по-прежнему закрывает `requirePerm` в Express; e2e 404 для роли user зелёный. T-4-43: отказ — тот же `notFound()`, что у несуществующего адреса, URL не меняется. T-4-44: обход `isAdmin` и `requireAny`/`requireAll` удалены, проверка `no role checks in web` зелёная. T-4-SC: установок пакетов нет.

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

- **CONTEXT `<specifics>` п. 9 (web).** Гейты `/admin` и замены `isAdmin`: для ролей `admin` и `user` доступ не меняется, меняется для переопределений из `rbac_user_grants` и `rbac_role_grants`. Перед выкаткой посмотреть (read-only), есть ли такие переопределения на проде. Редактор аватара показывается по `users.edit` (как сейчас только администратору); показывать ли его всем — решение пользователя.
- **UI-SPEC [авто], требует подтверждения.** «Нет доступа» = существующая страница 404 (`404-error`, `PAGE NOT FOUND`); при снятом праве — `router.refresh()` и тот же 404 вместо пустой области (до ответа сервера виден прежний экран раздела); корень `/admin` для роли user теперь 404 вместо пустой области под шапкой.
- **`rbac.write` без `rbac.read`** больше не открывает `/admin` и `/admin/settings/rbac` (по карте D-17). Подтвердить, что таких переопределений нет или что это ожидаемо.
- **Коммит.** Файлы плана коммитит оркестратор или пользователь.

## Files to commit

Новые:
- `app/web/lib/session/route-permissions.ts`
- `app/web/lib/session/route-permissions.test.ts`
- `app/web/lib/session/section-access.ts`
- `app/web/app/(internal)/(protected)/admin/users/layout.tsx`
- `app/web/app/(internal)/(protected)/admin/tests/layout.tsx`
- `app/web/app/(internal)/(protected)/admin/attempts/layout.tsx`
- `app/web/app/(internal)/(protected)/admin/groups/layout.tsx`
- `app/web/app/(internal)/(protected)/admin/sidebar/layout.tsx`
- `app/web/app/(internal)/(protected)/admin/settings/chart/layout.tsx`

Изменённые:
- `app/web/app/(internal)/(protected)/admin/layout.tsx`
- `app/web/app/(internal)/(protected)/admin/settings/page.tsx`
- `app/web/app/(internal)/(protected)/admin/settings/rbac/layout.tsx`
- `app/web/app/(internal)/(protected)/admin/users/[id]/page.tsx`
- `app/web/app/(internal)/(protected)/profile/[id]/page.tsx`
- `app/web/app/(internal)/(protected)/profile/ProfileClient.tsx`
- `app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx`
- `app/web/components/auth/AuthGuard.tsx`
- `app/web/components/AppSidebar.tsx`
- `app/web/lib/session/server.test.ts`
- `app/web/lib/session/client.test.ts` (вне `files_modified`, см. Deviations)
- `e2e/tests/session.spec.ts`

Вне git (`.planning` в `.gitignore`): этот SUMMARY, дополнение `deferred-items.md`.

`git status --porcelain --untracked-files=all` показывает ровно эти 21 путь.

## Next Phase Readiness

- 04-13: гард контента по-прежнему уводит на `/login?callbackUrl` при `me = null`; страница логина вне `/admin`, карта её не затрагивает.
- 04-14: охранный тест «нет проверок по ролям» может опираться на проверку `no role checks in web`; в `lib/session` единственный файл с `@bio-exam/rbac` — `route-permissions.ts` (закреплено в `client.test.ts`).

## Self-Check: PASSED

- Все 9 новых файлов существуют; проверки плана печатают `9 section gates` и `no role checks in web`; `yarn verify: OK`; полный `yarn e2e` exit 0 (только D1 `@known-defect`).
- Коммитов нет по правилу пользователя: `plan_head_before` = `plan_head_after` = `1c78296b139aabe1d8484fd92bfd5da47baa2105`, изменения в рабочем дереве.
