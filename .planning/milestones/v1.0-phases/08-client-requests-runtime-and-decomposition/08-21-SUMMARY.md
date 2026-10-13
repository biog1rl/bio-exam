---
phase: 08-client-requests-runtime-and-decomposition
plan: 21
subsystem: web/admin-settings (RBAC, боковое меню)
tags: [HTTP-02, D-06, D-07, D-08, D-09, swr, rbac, sidebar]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-04
    provides: request, RequestOutcome, RequestError, fetcherWith, failureMessage, MalformedBodyError, LoadErrorAlert, settingsKeys.chartRange
  - phase: 08-18
    provides: общий ключ '/api/rbac/roles' с useRoleTraits (тело как есть); гранты пользователя в lib/users/api.ts
provides:
  - lib/rbac/api.ts — rbacKeys.roles(), parseRbacRoles, rbacRolesFetcher, setRoleGrant; типы RbacRoleRow, RbacOverrideRow, RbacRolesResponse, RoleGrantBody
  - lib/settings/api.ts — settingsKeys.sidebar()/sidebarAll(), parseSidebarItems, getSidebarItems(signal?), getAllSidebarItems, saveSidebarItem(id | null, body), setSidebarItemActive, reorderSidebarItems, deleteSidebarItem; типы SidebarItem, SidebarItemInput, SidebarItemOrder, SidebarTarget
  - RBAC, настройка бокового меню и AppSidebar на модуле запросов; блоки ошибки загрузки на RBAC и настройке меню
affects: [08-22, 08-23, 08-28]

actuals:
  tokens: 8242
  tasks: 3
  commits: 0
plan_head_before: 46cde19413ae3ef701f9423319988e167e371cb4
plan_head_after: 46cde19413ae3ef701f9423319988e167e371cb4

tech-stack:
  added: []
  patterns:
    - "Загрузка без SWR с блоком ошибки: отказ хранится как new RequestError(outcome) (LoadErrorAlert понимает только RequestError), блок — только пока ни одна загрузка не удалась (loadedRef); auth/aborted оставляют экран как есть; «Повторить» вызывает тот же загрузчик без перевода экрана в «Загрузка...»"
    - "Публичный запрос в эффекте — AbortController, отмена в cleanup; отказ любого вида — состояние по умолчанию"

key-files:
  created:
    - app/web/lib/rbac/api.ts
    - app/web/lib/rbac/api.test.ts
  modified:
    - app/web/lib/settings/api.ts
    - app/web/lib/settings/api.test.ts
    - app/web/app/(internal)/(protected)/admin/settings/rbac/page.tsx
    - app/web/app/(internal)/(protected)/admin/sidebar/SidebarSettingsClient.tsx
    - app/web/components/AppSidebar.tsx

key-decisions:
  - "Запасной текст тоста записи RBAC — «Ошибка сохранения»: прежнего текста не было (страница бросала Error(res.text()) без тоста, отказ уходил в необработанное исключение); выбран текст соседнего экрана диапазона графика (решение исполнителя, автономно)"
  - "parseRbacRoles проверяет только конверт (массивы roles и overrides) и возвращает тот же объект; ROLE_TRAITS_URL не экспортирован, и role-traits.ts вне плана — совпадение строк ключей закреплено тестом, который читает исходник role-traits.ts"
  - "Пункты меню разворачиваются из { items } в массив (interfaces плана: RequestOutcome<SidebarItem[]>); ключи меню не общие с другими экранами, SWR для них не используется"
  - "saveSidebarItem(id | null, body): с id — PUT /api/sidebar/<id>, без id — POST /api/sidebar с order; видимость — отдельная setSidebarItemActive (PUT { isActive }); id кодируется encodeURIComponent"
  - "Запасные тексты записи меню — прежние тосты экрана: «Ошибка обновления порядка», «Ошибка сохранения», «Ошибка изменения видимости», «Ошибка удаления»; заданы в слое как fallbackMessage и повторены в failureMessage экрана"
  - "Перезагрузка списка после записи при уже загруженных пунктах блок не показывает и тост не даёт (правило 08-04 для ревалидации); блок — только при первой неудачной загрузке"
  - "Блок ошибки настройки меню стоит вместо карточки списка (Card), шапка с «Добавить пункт» остаётся; фокус после успешного повтора — h1 «Настройки сайдбара» (tabIndex -1)"
  - "AppSidebar: любой отказ — меню пустое (links остаётся []); console.error убран, aborted при размонтировании ничего не меняет"

metrics:
  duration: 10min
  completed: 2026-10-05
---

# Phase 8 Plan 21: RBAC, настройка бокового меню и боковое меню на модуле запросов Summary

RBAC читает роли через `useSWR(rbacKeys.roles(), rbacRolesFetcher)` (строковый ключ `'/api/rbac/roles'`, тот же, что у `useRoleTraits`, фетчер `fetcherWith(parseRbacRoles)` отдаёт тело как есть) и пишет гранты через `setRoleGrant` с тостом `failureMessage` вместо сырого `res.text()`. Настройка меню и `AppSidebar` ходят через функции `lib/settings/api.ts`. При ошибке загрузки RBAC показывает блок «Не удалось загрузить роли и права» в `CardContent`, настройка меню — блок «Не удалось загрузить пункты меню» вместо списка и тоста; боковое меню приложения при отказе пустое, как раньше.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Выполнено

- **Task 1 (tracer): RBAC на слое с блоком ошибки.** `lib/rbac/api.ts`: `rbacKeys.roles()` → `'/api/rbac/roles'`; `parseRbacRoles` бросает `MalformedBodyError` на `{ error }` и чужие формы, иначе возвращает тот же объект; `rbacRolesFetcher` уровня модуля; `setRoleGrant` — `POST /api/rbac/grant` с прежним телом `{ roleKey, domain, action, allow }`. `rbac/page.tsx`: локальный `fetcher` и голый `fetch` удалены; `loadFailed = error !== undefined && data === undefined` проверяется раньше ветки «Загрузка…»; `LoadErrorAlert` с `focusTarget` = `CardTitle` «RBAC: роли и права» (`tabIndex={-1}`); тост записи — `failureMessage(outcome, 'Ошибка сохранения')`, пустая строка (auth) — без тоста. Tracer-гейт: `vitest run lib/rbac` и `typecheck` повторно зелёные до расширения.
- **Task 2: меню.** `lib/settings/api.ts` дополнен функциями меню; `SidebarSettingsClient.tsx` загружает через `getAllSidebarItems`, пишет через пять функций слоя (порядок, создание, правка, видимость, удаление), тост «Ошибка загрузки пунктов меню» убран; `AppSidebar.tsx` — `getSidebarItems(controller.signal)`, отмена при размонтировании. Локальные `interface SidebarItem` в обоих экранах заменены типом из слоя. Импорт `@/lib/api-fetch` из настройки меню убран.
- **Task 3:** `codegraph affected`, `yarn verify`, `yarn e2e`, сверка файлов.

Попутно (Rule 1): запись порядка, видимости и удаления раньше не проверяла `res.ok` и показывала успех при отказе сервера; теперь отказ даёт тост с прежним запасным текстом, порядок при отказе перечитывается с сервера, как раньше при исключении.

## codegraph

`codegraph impact` (индекс основного дерева, до правок):

```
=== codegraph impact AppSidebar
Impact of changing "AppSidebar" — 5 affected symbols:
function AppSidebar (tsx) — app/web/components/AppSidebar.tsx:26
app/web/components/AppLayout/AppLayout.tsx — function AppLayout:19, file AppLayout.tsx:1
app/web/app/layout.tsx — function RootLayout:30, file layout.tsx:1

=== codegraph impact SidebarSettingsClient
Impact of changing "SidebarSettingsClient" — 4 affected symbols:
function SidebarSettingsClient (tsx) — admin/sidebar/SidebarSettingsClient.tsx:122
app/web/app/(internal)/(protected)/admin/sidebar/page.tsx — function SidebarSettingsPage:8, route /web/app/admin/sidebar:1, file page.tsx:1

=== codegraph impact RbacSettingsPage
Impact of changing "RbacSettingsPage" — 2 affected symbols:
function RbacSettingsPage (tsx) — admin/settings/rbac/page.tsx:24, route /web/app/admin/settings/rbac:1
```

Внешний контракт трёх компонентов (экспорты, пропсы) не менялся; вызывающие (`AppLayout`, `RootLayout`, `admin/sidebar/page.tsx`) не затронуты.

`codegraph affected` по семи файлам плана:

```
Affected test files (2):
  app/web/lib/rbac/api.test.ts
  app/web/lib/settings/api.test.ts
```

## Проверки

| Команда | Итог |
|---------|------|
| `yarn workspace @bio-exam/web vitest run lib/rbac` | RED: `Failed to resolve import "./api"`, Test Files 1 failed, no tests; GREEN: 10 passed |
| `yarn workspace @bio-exam/web vitest run lib/settings` | RED: 20 failed / 8 passed (новые функции не экспортированы); GREEN: 28 passed |
| `yarn workspace @bio-exam/web typecheck` | exit 0 |
| `node -e …` (нет `const fetcher =`, голого `fetch(`, `lib/api-fetch` в трёх файлах) | `settings screens ok` |
| `yarn workspace @bio-exam/web lint` | exit 0; в `SidebarSettingsClient.tsx` 4 предупреждения — столько же, сколько у версии HEAD (проверено oxlint на копии HEAD) |
| `yarn verify` | `yarn verify: OK` (web 1360 tests / 70 files, server 1670 / 76, exam-core 605, rbac 9) |
| `yarn e2e` | 194 passed (1.7m), failed нет (chromium-desktop и chromium-mobile) |
| `node .planning/…/08-plan-files.cjs check 08-21` | `08-21 changed only its files` |

Маршруты и middleware сервера не менялись — перегенерация `route-inventory.txt` не нужна.

## TDD Gate Compliance

Коммиты RED/GREEN не создавались (правило пользователя). Порядок соблюдён по сути: `lib/rbac/api.test.ts` написан и прогнан красным до создания `lib/rbac/api.ts`; тесты меню в `lib/settings/api.test.ts` прогнаны красными (20 failed) до добавления функций. Логи RED: scratchpad `08-21-red-rbac.txt`, `08-21-red-settings.txt`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Отказы записи меню показывались как успех**
- **Found during:** Task 2
- **Issue:** `apiFetch` не бросает на не-2xx; порядок, видимость и удаление не проверяли `res.ok` и давали тост успеха при отказе сервера.
- **Fix:** функции слоя возвращают `RequestOutcome`; при `!ok` — тост `failureMessage` с прежним запасным текстом, без тоста успеха.
- **Files modified:** `SidebarSettingsClient.tsx`, `lib/settings/api.ts`
- **Commit:** не выполнялся (правило пользователя)

**2. [Rule 1 - Bug] Отказ записи гранта RBAC — необработанное исключение**
- **Found during:** Task 1
- **Issue:** `onToggle` бросал `Error(await res.text())` в `try/finally` без `catch`: тоста не было, ошибка уходила в необработанный промис.
- **Fix:** `setRoleGrant` возвращает `RequestOutcome`, отказ — тост `failureMessage(outcome, 'Ошибка сохранения')`.
- **Files modified:** `rbac/page.tsx`, `lib/rbac/api.ts`
- **Commit:** не выполнялся

Остальное выполнено по плану.

## Threat Flags

Нет. Новых маршрутов, путей авторизации и доступа к файлам нет; T-8-48 закрыт (`failureMessage` вместо сырого `res.text()`).

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. **Блоки ошибки на 375px (Поверхность 1, backstop) — сводно в 08-28.** Шаги: открыть `/admin/settings/rbac` и `/admin/sidebar` под администратором с остановленным API (или с отказом `/api/rbac/roles`, `/api/sidebar/all` в DevTools → Network → Block request URL), ширина 375px. Ожидается: блок во всю ширину, «Повторить» во всю ширину высотой 44px, причина переносится, горизонтального скролла нет; после запуска API «Повторить» показывает таблицу ролей / список пунктов, фокус уходит на «RBAC: роли и права» / «Настройки сайдбара».
2. **Коммит файлов плана делает ведущая сессия** (список ниже).

## Передачи следующим планам

- 08-22/08-23 и любые экраны RBAC: роли — `rbacKeys.roles()` + `rbacRolesFetcher` из `@/lib/rbac/api` (тело как есть, кэш общий с `useRoleTraits`); если 08-23 переводит `role-traits.ts` на `rbacKeys.roles()`, тест `lib/rbac/api.test.ts` («та же строка, что ключ useRoleTraits») читает `const ROLE_TRAITS_URL = '...'` из исходника — обновить тест вместе с ним. Удаление гранта роли (`DELETE /api/rbac/grant`) веб не вызывает, функции для него нет.
- Меню: тип `SidebarItem` и функции — в `@/lib/settings/api`; `getSidebarItems(signal?)` разворачивает `{ items }` в массив. Права на пункты меню (`sidebar_items`) — Deferred 07.1, вид ошибки бокового меню приложения — ⚠ unresolved в UI-SPEC (меню пусто).
- Образец загрузки без SWR с блоком ошибки — `SidebarSettingsClient.loadItems`: отказ хранить как `new RequestError(outcome)`, иначе `LoadErrorAlert` покажет причину «нет связи» для любого отказа.
- 08-23: `@/lib/api-fetch` больше не импортирует `SidebarSettingsClient.tsx`.

## Файлы к коммиту

- `app/web/lib/rbac/api.ts` (новый)
- `app/web/lib/rbac/api.test.ts` (новый)
- `app/web/lib/settings/api.ts`
- `app/web/lib/settings/api.test.ts`
- `app/web/app/(internal)/(protected)/admin/settings/rbac/page.tsx`
- `app/web/app/(internal)/(protected)/admin/sidebar/SidebarSettingsClient.tsx`
- `app/web/components/AppSidebar.tsx`
- `.planning/phases/08-client-requests-runtime-and-decomposition/08-21-SUMMARY.md` (вне git worktree, общий `.planning`)

## Self-Check: PASSED

Файлы плана и SUMMARY на месте; коммитов нет по правилу пользователя (HEAD 46cde19 без изменений); сверка `08-21 changed only its files`.
