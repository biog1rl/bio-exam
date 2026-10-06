---
phase: 04-authentication-and-web-session
plan: 10
subsystem: auth
tags: [web-session, auth-provider, keep-alive, d3, d-13, d-15, d-16, vitest, playwright]
status: complete
deferred_human_gate: true

requires:
  - phase: 04-authentication-and-web-session
    provides: "04-09: модуль app/web/lib/session (sessionClient.refreshOnce, loadMe, logout; refreshDelayMs; AuthMe.accessExpiresAt); 04-07: accessExpiresAt в ответах login, refresh, /api/auth/me"
provides:
  - "app/web/lib/session/keep-alive.ts: createKeepAlive({ refresh, onRefreshed, onSessionEnded, doc, now, setTimer, clearTimer }) → { update, stop }, REFRESH_RETRY_MS = 30_000"
  - "Один AuthProvider (в AppLayout с initialMe из getServerMe); из app/providers.tsx удалён; эффект миграции cookie удалён"
  - "useAuth().logout(): POST /api/auth/logout через sessionClient, me = null, событие logout в localStorage, window.location.assign('/login')"
  - "Страница логина берёт me из контекста, своих запросов сессии не делает"
  - "e2e D3 — обычный тест; обход addInitScript в newSessionContext удалён"
affects: [04-11, 04-12, 04-13, 04-14]

actuals:
  tokens: 7159
  tasks: 3
  commits: 0
plan_head_before: 0dde2b8dbb27ffbe02f2a58a5b5d8c27a2162d8c
plan_head_after: 0dde2b8dbb27ffbe02f2a58a5b5d8c27a2162d8c

tech-stack:
  added: []
  patterns:
    - "keep-alive держит один срок dueAt: обычный — за 60 с до accessExpiresAt (refreshDelayMs), повтор — now + REFRESH_RETRY_MS; таймер при скрытой вкладке ничего не делает, visibilitychange → visible при now >= dueAt запускает refresh сразу; флаг inFlight не даёт второго вызова"
    - "Провайдер создаёт keep-alive в эффекте и вызывает update() отдельным эффектом по me.accessExpiresAt; update идемпотентен (снимает и ставит таймер заново)"

key-files:
  created:
    - app/web/lib/session/keep-alive.ts
    - app/web/lib/session/keep-alive.test.ts
  modified:
    - app/web/components/providers/AuthProvider.tsx
    - app/web/app/providers.tsx
    - app/web/components/nav-user.tsx
    - app/web/app/(internal)/(protected)/profile/ProfileClient.tsx
    - app/web/app/(internal)/login/LoginPageClient.tsx
    - e2e/fixtures/exam.ts
    - e2e/tests/session.spec.ts
    - .planning/phases/01-verification-baseline/deferred-items.md

key-decisions:
  - "Решение исполнителя (автономно): logout() из контекста переходит на /login при любом исходе POST /api/auth/logout (sessionClient.logout не бросает); тост «Вы вышли из аккаунта» в nav-user показывается до вызова logout(). Тост ошибки выхода больше не показывается"
  - "Решение исполнителя (автономно): ключ logout в localStorage пишется и сразу удаляется, без setTimeout: полная навигация выгружает страницу раньше таймера"
  - "Решение исполнителя (автономно): исход ok у keep-alive с accessExpiresAt = null таймер не ставит (refreshDelayMs → null)"
  - "Решение исполнителя (автономно): perms в AuthProvider пересчитываются по me?.perms, а не по me: обновление срока access после refresh не пересоздаёт множество прав"

patterns-established:
  - "Проактивный refresh живёт в lib/session/keep-alive.ts с внедряемыми doc и таймерами; тест работает в Node без DOM через фейковый doc и vi.useFakeTimers"

requirements-completed: [AUTH-10, AUTH-09]
requirements-note: "AUTH-09 частично: модуль владеет текущим пользователем, выходом и проактивным refresh; остальное по AUTH-09 в 04-11…04-14"

coverage:
  - id: D1
    description: "Один AuthProvider, ноль браузерных /api/auth/me и /api/auth/refresh на загрузке /dashboard с действующей сессией"
    requirement: AUTH-10
    verification:
      - kind: e2e
        ref: "e2e/tests/session.spec.ts#D3: a page load with a live session makes no browser /api/auth/me or /api/auth/refresh request @session"
        status: pass
    human_judgment: false
  - id: D2
    description: "keep-alive: refresh за 60 с до истечения при видимой вкладке, сразу при возврате после срока; rejected → onSessionEnded один раз; unavailable и сбой сети → повтор через 30 с без onSessionEnded"
    requirement: AUTH-09
    verification:
      - kind: unit
        ref: "app/web/lib/session/keep-alive.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Выход и вход: flow 1 (вход, выход через меню, редирект с защищённой страницы) зелёный на двух проектах"
    requirement: AUTH-09
    verification:
      - kind: e2e
        ref: "e2e/tests/auth.spec.ts @flow1"
        status: pass
    human_judgment: false
  - id: D4
    description: "Тост выхода не переживает полную навигацию на /login; видимое поведение выхода и проактивного refresh"
    verification: []
    human_judgment: true
    rationale: "Видимое поведение; UI-SPEC Поверхность 3 помечена как требующая подтверждения пользователя"

duration: 5min
completed: 2026-10-04
---

# Phase 4 Plan 10: Один AuthProvider, keep-alive и одна функция выхода Summary

**`AuthProvider` монтируется один раз в `AppLayout` с `initialMe` из SSR, эффект миграции cookie и обход в e2e удалены, D3 стал обычным зелёным тестом; модуль `keep-alive.ts` обновляет сессию за 60 с до `accessExpiresAt` и повторяет через 30 с при `unavailable`; выход — одна функция `useAuth().logout()`; страница логина берёт `me` из контекста.**

## Performance

- **Duration:** около 5 мин активной работы (без ожидания прогонов)
- **Started:** 2026-10-04T08:09:17Z
- **Completed:** 2026-10-04T08:14:00Z
- **Tasks:** 3/3
- **Files:** 9 путей в git (2 новых, 7 изменённых) и 1 документ в `.planning`

## Accomplishments

- `app/providers.tsx`: обёртка и импорт `AuthProvider` удалены. `SearchProvider` и его компоненты `useAuth` не вызывают (`rg -n "useAuth" app/web/components/Search app/web/app/providers.tsx` пуст). В `AppLayout.tsx` остался единственный `<AuthProvider initialMe={me}>`, файл не менялся.
- `AuthProvider.tsx`: эффект миграции cookie (`auth_refresh_cookie_migrated_v2`, голый `POST /api/auth/refresh`) удалён; загрузка `me` при монтировании только при `initialMe === undefined`, `loading` начально `initialMe === undefined`. Keep-alive создаётся в эффекте (`refresh = sessionClient.refreshOnce`, `onRefreshed` обновляет `me.accessExpiresAt`, `onSessionEnded` перечитывает `me` через `loadMe`: `rejected` → `me = null` и логин через `AuthGuard`, `unavailable` → `me` не меняется). Опрос раз в 10 минут, обработчики `storage` и `visibilitychange` сохранены и идут через `sessionClient.loadMe`. В контекст добавлен `logout()`.
- `keep-alive.ts`: `createKeepAlive` и `REFRESH_RETRY_MS = 30_000`; исключение `refresh` считается `unavailable`; задержка таймера ограничена `2_147_483_647` мс, ранний запуск перевзводит таймер.
- `nav-user.tsx`: `handleLogout` показывает тост `Вы вышли из аккаунта` и вызывает `logout()`; `apiFetch`, `AuthExpiredError`, `refresh`, работа с localStorage удалены. `ProfileClient.tsx`: `handleLogout` вызывает `logout()`; `AuthExpiredError` и `useRouter` удалены.
- `LoginPageClient.tsx`: `fetchMe`, `bootLoading`, `refresh()` и строка `Сессия не установилась…` удалены; при `me` — `LoaderComponent className="size-6 animate-spin"` и `router.replace(callbackUrl)`; без `me` — форма сразу; после успешного входа `window.location.assign(callbackUrl)`. Тексты ошибок, плейсхолдеры `Login`, `Пароль`, кнопка `Войти` не менялись.
- `e2e/fixtures/exam.ts`: `addInitScript` и комментарий над ним удалены, `newSessionContext` возвращает контекст напрямую. `e2e/tests/session.spec.ts`: D3 — `test('D3: a page load with a live session makes no browser /api/auth/me or /api/auth/refresh request @session')`, у подготовки снят `@known-defect`. `test.fail(` остался один (D8).
- `phases/01-verification-baseline/deferred-items.md`: пункт про эффект миграции — `status: closed`, строка о закрытии в 04-10.

## Task Commits

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве (ветка `dev`).

1. **Task 1 (tracer):** один `AuthProvider`, эффект миграции удалён, обход в e2e удалён, D3 переключён.
2. **Task 2 (TDD):** `keep-alive.ts` с тестом, keep-alive и `logout()` в провайдере, одна функция выхода.
3. **Task 3:** страница логина на контексте, полный прогон.

## TDD Gate Compliance

- **Tracer gate (Task 1):** `HUMAN_VERIFY_MODE` по умолчанию `end-of-phase`, `<verify>` только автоматический. После Task 1 все три проверки: `typecheck` → exit 0; `yarn e2e --grep "D3|@flow1|@smoke"` → `16 passed (10.9s)`, D3 зелёный на `chromium-desktop` и `chromium-mobile`; проверка печатает `one AuthProvider`. Только после этого начат Task 2.
- **Task 2 RED:** `keep-alive.test.ts` (14 тестов по behavior и сверх: идущий refresh при возврате на вкладку, повторный `update` с тем же сроком, срок уже прошёл) написан до модуля. `vitest run lib/session` → `Test Files 1 failed | 3 passed (4)`, `Tests 75 passed (75)`, причина `Cannot find module './keep-alive'`.
- **Task 2 GREEN:** `Test Files 4 passed (4)`, `Tests 89 passed (89)`.
- **Проверка мутациями:** при `unavailable` вместо повтора вызывать `onSessionEnded` → `3 failed | 11 passed (14)`; запуск refresh по таймеру без проверки видимости → `2 failed | 12 passed (14)`. После возврата кода (`cmp` с копией) → `89 passed`.

## codegraph impact (до правок)

- `AuthProvider` (`components/providers/AuthProvider.tsx:35`): 7 символов — `app/providers.tsx` (`Providers`), `components/AppLayout/AppLayout.tsx` (`AppLayout`), `app/layout.tsx` (`RootLayout`).
- `useAuth` (`AuthProvider.tsx:157`): 36 символов — `components/auth/AuthGuard.tsx`, `components/AppSidebar.tsx`, `admin/settings/rbac/layout.tsx`, `admin/layout.tsx`, `components/users/UsersTable.tsx`, `admin/users/UsersClient.tsx`, `admin/settings/rbac/page.tsx`, `dashboard/DashboardClient.tsx`, `dashboard/page.tsx`, `login/LoginPageClient.tsx`, `login/page.tsx`, `components/tests/TestRunner.tsx`, `tests/[topicSlug]/[testSlug]/start/TestPageClient.tsx`, `profile/ProfileClient.tsx`, `profile/page.tsx`, `components/nav-user.tsx`, `AppLayout.tsx`. Публичный интерфейс контекста не сужен, добавлен только `logout`.
- `Providers` (`app/providers.tsx:17`): 5 символов — `AppLayout`, `RootLayout`.

## codegraph affected (после правок, D-22)

По файлам плана — 39 файлов: web-тесты `lib/session/client.test.ts`, `lib/session/keep-alive.test.ts`, `lib/auth/getServerMe.test.ts`; e2e `fixtures/exam.ts`, `tests/auth.spec.ts`, `authoring.spec.ts`, `review.spec.ts`, `session.spec.ts`; серверные тесты auth и маршрутов тестов (транзитивно через `e2e/fixtures`); клиентские потребители `apiFetch` (редактор тестов, `TestRunner.tsx`, `lib/tests/api.ts`). Все прогнаны в `yarn verify` и полном `yarn e2e`.

## Verification

- `yarn workspace @bio-exam/web typecheck` → exit 0.
- `yarn workspace @bio-exam/web vitest run lib/session` → `Tests 89 passed (89)`.
- Проверки плана печатают `one AuthProvider`, `one logout`, `login uses context`.
- `yarn verify` → `yarn verify: OK` (web `278 passed`, server `423 passed`, exam-core `498 passed`, rbac `2 passed`; `format-check`, `lint-typecheck-test`, `migrations`, `script-tests` passed).
- `yarn e2e` (полный) → exit 0, `Running 122 tests`, `122 passed (39.6s)`. Ожидаемые падения `test.fail` — только D1 (`review.spec.ts:303`) и D8 (`session.spec.ts:51`) на `chromium-desktop` и `chromium-mobile`. D3 (`session.spec.ts:86`) зелёный на обоих проектах. В 04-09 при тех же 122 тестах ожидаемых падений было 6 (D1, D8, D3).
- `oxlint` по файлам плана: одно предупреждение `react(set-state-in-effect)` в `ProfileClient.tsx:114` — существующий код, не тронут (вне объёма).

## Deviations from Plan

### Прочее

- `app/web/components/AppLayout/AppLayout.tsx` в `files_modified`, но правка не понадобилась: в нём уже единственный `<AuthProvider initialMe={me}>` с `me` из `getServerMe()`.
- `newSessionContext` возвращает `browser.newContext(...)` напрямую: после удаления `addInitScript` промежуточная переменная не нужна.
- В `keep-alive.test.ts` четыре теста сверх behavior (идущий refresh при возврате на вкладку, повторный `update`, прошедший срок, константа).
- Не отклонение: запуск `root-pin.sh` отклонён правами; по правилам исполнения корень проверен `git rev-parse --show-toplevel` = `/Users/kdvornichenko/bio-exam`, запись только по абсолютным путям внутри корня.
- Существующие комментарии внутри удалённых блоков (`AuthProvider` эффект миграции, `handleLogout`, `LoginPageClient`) ушли вместе с кодом; новых комментариев нет.

## Threat Flags

Новой поверхности сверх `<threat_model>` нет. T-4-35: один провайдер, эффект миграции удалён, refresh из браузера только через `sessionClient.refreshOnce`; e2e D3 обычный тест. T-4-36: выход идёт через `sessionClient.logout()` (отзыв на сервере, 04-06) и событие `logout` в localStorage. T-4-37: цель после входа — `safeCallbackPath`. T-4-SC: установок пакетов нет.

Наблюдение: если полный `yarn e2e` когда-нибудь превысит ~14 минут, контексты, которые делят `storageState` одного аккаунта, по keep-alive начнут ротировать один и тот же refresh и попадут под отзыв семейства при повторе (04-06). Сейчас прогон ~40 с.

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

- **Выход.** Меню пользователя → `Выйти`: тост `Вы вышли из аккаунта` показывается до полной навигации и на `/login` не виден (раньше был клиентский переход, тост переживал его). При сбое `POST /api/auth/logout` тоста ошибки больше нет: переход на `/login` выполняется всегда; если cookie живы, страница логина сразу вернёт на `/dashboard`. Подтвердить, что так допустимо.
- **UI-SPEC «Поверхность 3», [авто] требует подтверждения.** Проактивный refresh без лоадера и тоста: оставить вкладку открытой на 15+ минут, убедиться, что сессия живёт без перехода на логин; скрыть вкладку дольше срока access, вернуться — содержимое не перерисовывается, перехода на логин нет.
- **Страница логина с истёкшим access и живым refresh.** Клиент больше не проверяет сессию сам: при `getServerMe() = null` форма показывается сразу. Случай истёкшего access на серверной странице закрывает D8 (план 04-11, proxy); до него такой пользователь увидит форму входа.
- **Коммит.** Файлы плана коммитит оркестратор или пользователь.

## Files to commit

Новые:
- `app/web/lib/session/keep-alive.ts`
- `app/web/lib/session/keep-alive.test.ts`

Изменённые:
- `app/web/components/providers/AuthProvider.tsx`
- `app/web/app/providers.tsx`
- `app/web/components/nav-user.tsx`
- `app/web/app/(internal)/(protected)/profile/ProfileClient.tsx`
- `app/web/app/(internal)/login/LoginPageClient.tsx`
- `e2e/fixtures/exam.ts`
- `e2e/tests/session.spec.ts`

Вне git: `.planning/phases/01-verification-baseline/deferred-items.md`, этот SUMMARY.

`git status --porcelain --untracked-files=all` показывает ровно эти 9 путей, все из `files_modified` плана.

## Next Phase Readiness

- 04-11 (D8 в proxy): клиентская сторона больше не делает своих запросов сессии на загрузке; D8 остаётся `test.fail`.
- 04-12 снимает обход `isAdmin` в `AuthGuard`; 04-13 меняет загрузку и тексты страницы логина (`sr-only` `Вход…`, 429).
- 04-14: локальный режим `getServerMe` без `API_ORIGIN` отдаёт `accessExpiresAt = null`, keep-alive в нём таймер не ставит.

## Self-Check: PASSED

- `keep-alive.ts` и `keep-alive.test.ts` существуют; проверки плана печатают `one AuthProvider`, `one logout`, `login uses context`.
- Коммитов нет по правилу пользователя: `plan_head_before` = `plan_head_after` = `0dde2b8dbb27ffbe02f2a58a5b5d8c27a2162d8c`, изменения в рабочем дереве.
