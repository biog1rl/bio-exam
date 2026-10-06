---
phase: 04-authentication-and-web-session
plan: 09
subsystem: auth
tags: [web-session, single-flight, refresh, open-redirect, callbackUrl, d-13, d-16, vitest, playwright]
status: complete
deferred_human_gate: true

requires:
  - phase: 04-authentication-and-web-session
    provides: "04-07: accessExpiresAt в ответах login, refresh, /api/auth/me; 04-06: серверная сессия с ротацией refresh"
provides:
  - "app/web/lib/session/transport.ts: SessionTransport (me, refresh, logout, request), httpTransport на fetch того же origin с credentials: 'include'"
  - "app/web/lib/session/client.ts: createSessionClient, sessionClient, apiFetch, AuthExpiredError; refreshOnce (single-flight) и loadMe с исходами ok | rejected (только 401) | unavailable (сеть, 5xx, прочие ответы); fetchWithSession, logout, redirectToLogin"
  - "app/web/lib/session/redirect.ts: buildLoginRedirect, safeCallbackPath, DEFAULT_CALLBACK_PATH"
  - "app/web/lib/session/schedule.ts: REFRESH_LEAD_MS = 60_000, refreshDelayMs (основа D-16 для 04-10)"
  - "AuthMe.accessExpiresAt (строка или null) из верхнего уровня /api/auth/me"
  - "Удалены lib/auth/fetchMe.ts, lib/auth/refresh.ts, lib/auth/loginRedirect.ts и loginRedirect.test.ts"
affects: [04-10, 04-12, 04-13, 04-14]

actuals:
  tokens: 10200
  tasks: 3
  commits: 0
plan_head_before: 1eea6b8a35779210c99f2f54c7012750e54b6f7e
plan_head_after: 1eea6b8a35779210c99f2f54c7012750e54b6f7e

tech-stack:
  added: []
  patterns:
    - "Клиент сессии собирается фабрикой createSessionClient({ transport, navigate, currentPath }); window читается только внутри navigate и currentPath, поэтому модуль импортируется в Node и серверных компонентах"
    - "Тело каждого отброшенного ответа (401 от me, ответ refresh с ошибкой, исходный 401 перед повтором, ответ logout) дочитывается через discard(): иначе Chromium держит запрос открытым и networkidle не наступает"
    - "Тесты клиента идут через фейковый транспорт с очередями ответов и отложенным промисом для refresh; одновременность проверяется без опоры на порядок микрозадач"

key-files:
  created:
    - app/web/lib/session/transport.ts
    - app/web/lib/session/client.ts
    - app/web/lib/session/redirect.ts
    - app/web/lib/session/schedule.ts
    - app/web/lib/session/client.test.ts
    - app/web/lib/session/redirect.test.ts
    - app/web/lib/session/schedule.test.ts
  modified:
    - app/web/lib/api-fetch.ts
    - app/web/lib/auth/authMePayload.ts
    - app/web/components/providers/AuthProvider.tsx
    - app/web/components/auth/AuthGuard.tsx
    - app/web/app/(internal)/login/LoginPageClient.tsx
    - app/web/app/(internal)/(protected)/profile/[id]/page.tsx
    - app/web/app/(internal)/(protected)/admin/users/[id]/page.tsx
  deleted:
    - app/web/lib/auth/fetchMe.ts
    - app/web/lib/auth/refresh.ts
    - app/web/lib/auth/loginRedirect.ts
    - app/web/lib/auth/loginRedirect.test.ts

key-decisions:
  - "Discretion: страница логина читает только callbackUrl; синонимы from, next, redirectTo, returnTo, redirect больше не принимаются. Все генераторы редиректа в репозитории (proxy.ts, AuthGuard, серверные страницы) пишут callbackUrl"
  - "Решение исполнителя (автономно): loadMe после успешного refresh снова получил 401 от me → rejected (как fetchWithSession), без навигации"
  - "Решение исполнителя (автономно): logout возвращает boolean: true при 2xx и 401, false при другом ответе или сбое сети; исключений не бросает"
  - "Решение исполнителя (автономно): AuthProvider при исходе unavailable снимает loading и не трогает me, avatarVersion и lastAuthUpdate"
  - "Решение исполнителя (автономно, Rule 1): клиент дочитывает тела отброшенных ответов; без этого 401 от /api/auth/me оставался незавершённым запросом и e2e D8 падал по таймауту вместо ожидаемого падения"

patterns-established:
  - "Один модуль веб-сессии app/web/lib/session: транспорт, клиент, редирект, расписание; потребители импортируют из него, а не из lib/auth"

requirements-completed: [AUTH-09]

coverage:
  - id: D1
    description: "Single-flight refresh: три одновременных 401 дают один refresh и по одному повтору; после завершения refresh следующий 401 запускает новый"
    requirement: AUTH-09
    verification:
      - kind: unit
        ref: "app/web/lib/session/client.test.ts#три одновременных 401 дают один refresh и по одному повтору"
        status: pass
    human_judgment: false
  - id: D2
    description: "Три исхода refresh и loadMe: навигация на /login?callbackUrl только при rejected (401), при 500/502/403/429 и сбое сети навигации нет и возвращается исходный 401"
    requirement: AUTH-09
    verification:
      - kind: unit
        ref: "app/web/lib/session/client.test.ts#refresh 500: unavailable, навигации нет, вызовы получают исходный 401"
        status: pass
      - kind: unit
        ref: "app/web/lib/session/client.test.ts#сбой сети при refresh: unavailable, навигации нет, возвращается исходный 401"
        status: pass
    human_judgment: false
  - id: D3
    description: "safeCallbackPath закрывает открытый редирект: //host, /\\host, схемы, управляющие символы и обратный слэш дают /dashboard"
    requirement: AUTH-09
    verification:
      - kind: unit
        ref: "app/web/lib/session/redirect.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "apiFetch и AuthExpiredError доступны по @/lib/api-fetch как реэкспорт модуля; 25 потребителей не менялись"
    requirement: AUTH-09
    verification:
      - kind: unit
        ref: "app/web/lib/session/client.test.ts#импорт без window не падает, apiFetch идёт через fetch того же origin"
        status: pass
      - kind: e2e
        ref: "yarn e2e (122 passed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Синонимы callback не принимаются; потеря несохранённых данных форм при навигации на логин"
    verification: []
    human_judgment: true
    rationale: "Видимое поведение помечено в CONTEXT и UI-SPEC как требующее подтверждения пользователя"

duration: 19min
completed: 2026-10-04
---

# Phase 4 Plan 09: Модуль веб-сессии Summary

**Модуль `app/web/lib/session` с транспортом и фейком: single-flight refresh, цепочка 401 → refresh → повтор, три исхода `ok | rejected | unavailable` (на логин ведёт только 401 от refresh), одна функция редиректа и `safeCallbackPath`, который закрывает открытый редирект `//host`. `apiFetch` стал реэкспортом модуля, `fetchMe.ts`, `refresh.ts`, `loginRedirect.ts` удалены.**

## Performance

- **Duration:** около 19 мин активной работы (без ожидания прогонов)
- **Started:** 2026-10-04T07:40:08Z
- **Completed:** 2026-10-04T07:59:00Z
- **Tasks:** 3/3
- **Files:** 18 путей в рабочем дереве (7 новых, 7 изменённых, 4 удалённых)

## Accomplishments

- `transport.ts`: `SessionTransport` и `httpTransport` (`GET /api/auth/me` с `cache: 'no-store'`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `request` с `credentials: 'include'`).
- `client.ts`: `createSessionClient` с `refreshOnce` (общий промис на вкладку, сброс в `finally`, своего таймаута и `AbortSignal` нет), `fetchWithSession`, `loadMe` (через `parseAuthMe`, без навигации), `logout`, `redirectToLogin` (флаг «уже навигировали» ставится только при реальной навигации, на `/login` и `/invite` навигации нет). `sessionClient` по умолчанию: `httpTransport`, `window.location.assign`, текущий путь с query. `apiFetch = (url, init) => sessionClient.fetchWithSession(url, init)`.
- `redirect.ts`: `buildLoginRedirect` в том же формате, что у proxy (`URLSearchParams`); `safeCallbackPath(raw, fallback = '/dashboard')`: один ведущий `/`, второй символ не `/` и не `\`, без `\` и управляющих символов, разбор относительно `http://callback.invalid` сохраняет origin, результат `pathname + search + hash`.
- `schedule.ts`: `REFRESH_LEAD_MS = 60_000`, `refreshDelayMs(accessExpiresAt, nowMs)`: задержка до момента за 60 с до истечения, не меньше 0; `null`, если срока нет или строка не разбирается.
- `authMePayload.ts`: поле `accessExpiresAt: string | null` с верхнего уровня ответа.
- Потребители: `AuthProvider` (`ok` → `me`, `rejected` → `null`, `unavailable` → `me` не меняется, `loading` снимается), `AuthGuard` (`buildLoginRedirect`; обход `isAdmin` и `requireAny` не тронуты, это 04-12), `LoginPageClient` (`sessionClient.loadMe`, `safeCallbackPath(searchParams.get('callbackUrl'))`, `safeRedirect` и синонимы удалены), `profile/[id]/page.tsx` и `admin/users/[id]/page.tsx` (`buildLoginRedirect` из `@/lib/session/redirect`).

## Task Commits

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве worktree `wt-04-09` (ветка `gsd/04-09`).

1. **Task 1 (tracer):** транспорт, клиент, редирект, `apiFetch` поверх модуля.
2. **Task 2 (TDD):** таблица открытого редиректа, `accessExpiresAt` в `parseAuthMe`, `refreshDelayMs`.
3. **Task 3:** потребители на модуле, удаление `fetchMe.ts`, `refresh.ts`, `loginRedirect.ts`.

## TDD Gate Compliance

- **Task 1 (tracer, тест до кода):** `client.test.ts` написан до модуля. RED: `Test Files 1 failed`, `Cannot find module './client'`. GREEN: `Tests 40 passed (40)`. Проверка мутациями: без single-flight (`if (true)` вместо `if (!pendingRefresh)`) красных 7 тестов, с навигацией при `unavailable` красных 5; после возврата кода `40 passed`.
- **Tracer gate (auto):** после зелёного Task 1 весь `<verify>` повторён: `vitest run lib/session` → `40 passed`, `typecheck` → 0, проверка печатает `three refresh outcomes`. Только после этого начат Task 2.
- **Task 2 (tdd="true"):** `redirect.test.ts`, `schedule.test.ts`, строки `parseAuthMe` и `loadMe` с `accessExpiresAt` в `client.test.ts` написаны до кода. RED: `Test Files 2 failed | 4 passed`, `Tests 3 failed | 80 passed (83)` (`Cannot find module './schedule'`, три строки `accessExpiresAt`). Таблица `redirect.test.ts` сразу зелёная: `redirect.ts` по плану написан в Task 1 (шаг 3). GREEN: `Tests 87 passed (87)`.
- **Rule 1 (дочитывание тел):** шесть тестов «тела отброшенных ответов дочитываются» написаны до исправления. RED: `Tests 5 failed | 70 passed (75)` (шестой, «при unavailable исходный 401 возвращается непрочитанным», зелёный и до, и после). GREEN: `75 passed`.

## codegraph impact (D-22, до правок)

- `apiFetch` (`app/web/lib/api-fetch.ts:10`): 139 затронутых символов. Файлы-потребители (25, импорт `@/lib/api-fetch` не менялся): `admin/sidebar/SidebarSettingsClient.tsx`, `admin/settings/chart/ChartSettingsPageClient.tsx`, `admin/tests/TestsClient.tsx`, `admin/tests/question-types/QuestionTypesPageClient.tsx`, `admin/tests/question-types/[key]/QuestionTypeDetailsPageClient.tsx`, `admin/tests/[topicSlug]/TopicTestsClient.tsx`, `admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx`, `.../questions/new/NewQuestionDraftPageClient.tsx`, `admin/tests/components/test-editor/useTestEditorModel.ts`, `admin/tests/components/test-editor/test-editor-api.ts`, `admin/tests/components/TopicFormDialog.tsx`, `admin/tests/scoring/ScoringSettingsPageClient.tsx`, `dashboard/DashboardClient.tsx`, `profile/ProfileClient.tsx`, `components/nav-user.tsx`, `components/groups/GroupSheet.tsx`, `components/groups/DeleteGroupDialog.tsx`, `components/users/AvatarUpload.tsx`, `components/users/dialogs/InviteUserDialog.tsx`, `UserGrantsDialog.tsx`, `ReinviteUserDialog.tsx`, `EditUserDialog.tsx`, `components/users/UserProfileAssignmentsPage.tsx`, `lib/tests/api.ts`, `lib/search/api.ts`.
- `tryRefreshSession` (`lib/auth/refresh.ts:3`): 91 символ; прямые вызывающие `lib/api-fetch.ts` (`apiFetch`) и `lib/auth/fetchMe.ts` (`fetchAuthMe`), остальное транзитивно через `apiFetch`.
- `fetchAuthMe` (`lib/auth/fetchMe.ts:19`): 9 символов; `components/providers/AuthProvider.tsx` (`fetchMeOnce`, `refresh`), `app/(internal)/login/LoginPageClient.tsx` (`fetchMe`, `handleSubmit`, `LoginPage`), `app/(internal)/login/page.tsx`.
- `buildLoginRedirectPath` (`lib/auth/loginRedirect.ts:1`): 8 символов; `loginRedirect.test.ts`, `profile/[id]/page.tsx` (`ProfileByIdPage`), `admin/users/[id]/page.tsx` (`AdminUserPageRedirect`).
- После Task 3 `rg` по `tryRefreshSession|fetchAuthMe|buildLoginRedirectPath|loginRedirect|lib/auth/fetchMe|lib/auth/refresh` в `app/web` и `e2e`: вызывающих нет.

## codegraph affected (после правок)

`codegraph affected` по изменённым и удалённым файлам: 22 файла, в том числе тесты `app/web/lib/auth/getServerMe.test.ts`, `app/web/lib/auth/loginRedirect.test.ts` (удалён, заменён `lib/session/redirect.test.ts`), `app/server/src/routes/tests/exam-flow.test.ts`, e2e `e2e/fixtures/exam.ts`, `e2e/tests/auth.spec.ts`, `authoring.spec.ts`, `review.spec.ts`; остальное — клиентские потребители `apiFetch` (`TestRunner.tsx`, `lib/tests/api.ts`, редактор тестов). Индекс CodeGraph построен по основному дереву, новых файлов `lib/session/*` в нём нет. Web-тесты прогнаны в `yarn workspace @bio-exam/web test` и `yarn verify`, e2e — полным `yarn e2e`.

## Verification

- `yarn workspace @bio-exam/web vitest run lib/session` → `Tests 75 passed (75)`.
- `yarn workspace @bio-exam/web vitest run lib/session lib/auth` → зелёный (в Task 2 `87 passed`).
- `yarn workspace @bio-exam/web typecheck` → exit 0 (до первого прогона собраны `@bio-exam/rbac` и `@bio-exam/exam-core` через `yarn turbo run build`, без этого `TS2307` по `dist`).
- `yarn workspace @bio-exam/web test` → `Test Files 12 passed`, `Tests 264 passed (264)`.
- Проверки плана печатают `three refresh outcomes` и `one redirect function`.
- `yarn verify` → `yarn verify: OK` (все шаги, в том числе `format-check`, `lint-typecheck-test`, `migrations`).
- `yarn e2e` (полный) → exit 0, `122 passed (42.3s)`. Ожидаемые падения `test.fail` по 3 на `chromium-desktop` и `chromium-mobile`: D1 (`review.spec.ts:303`), D8 (`session.spec.ts:51`), D3 (`session.spec.ts:86`). `@flow1`, `@proxy`, `@session`, `@smoke` зелёные.
- `yarn workspace @bio-exam/web lint`: в файлах плана предупреждений нет.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Незавершённые запросы `/api/auth/me` с ответом 401**
- **Found during:** Task 3, полный `yarn e2e`.
- **Issue:** D8 (`session.spec.ts:51`, `test.fail`) падал не утверждением за ~1 с, а таймаутом 30 с на `page.waitForLoadState('networkidle')`; Playwright считает таймаут неожиданным падением, `yarn e2e` давал exit 1. Бисекция: базовый код (HEAD) — D8 за 1.1 с, exit 0; только старый `LoginPageClient` — таймаут остаётся; плюс старый `AuthProvider` — exit 0. Отладочный сценарий со слушателями `request`/`requestfinished` показал два вечно открытых `GET /api/auth/me`: `loadMe` получал 401 и не читал тело, Chromium не завершал запрос, `networkidle` не наступал. Старый `fetchAuthMe` всегда вызывал `response.json()`.
- **Fix:** функция `discard(response)` в `client.ts` дочитывает тело (`arrayBuffer()`, без ожидания) у каждого отброшенного ответа: 401 и прочие ошибки от `me`, ответ `refresh` с ошибкой, исходный 401 перед повтором, 401 повтора, ответ `logout`. При `unavailable` исходный 401 возвращается вызывающему непрочитанным.
- **Files modified:** `app/web/lib/session/client.ts`, `app/web/lib/session/client.test.ts`.
- **Verification:** шесть тестов `bodyUsed`; отладочный сценарий: `PENDING []`; D8 снова падает утверждением за 1.1 с; полный `yarn e2e` exit 0.
- **Commit:** не выполнялся (правило пользователя).

Временный отладочный spec `e2e/tests/zz-debug.spec.ts` удалён. На время бисекции файлы плана сохранялись в архив в scratchpad, базовые версии писались через `git show HEAD:<path> > <path>`. После возврата контрольная сумма `git diff` + `git status` + `lib/session/*` совпала с сохранённой (`b944a9de…`).

### Прочее

- Строки `parseAuthMe` из behavior Task 2 лежат в `lib/session/client.test.ts` (`describe('parseAuthMe')`): отдельного `authMePayload.test.ts` в списке файлов плана нет.
- В `client.test.ts` добавлены тесты сверх behavior: импорт модуля по умолчанию без `window`, `apiFetch` через заглушку `fetch` (401 → refresh → повтор с `credentials: 'include'`), навигация через `window.location.assign` с текущим путём и query, проверка исходников `lib/session/*` на отсутствие `jsonwebtoken`, `AUTH_JWT_SECRET`, `@bio-exam/rbac`, `can(` и `verify(` (запрет «второго алгоритма прав», проверка `test`).
- Не отклонение: строки 22 и 35 общего файла правил (вызов `roadmap.update-plan-progress` и `state.*`, `root-pin.sh` с корнем основного дерева) написаны для исполнения в основном дереве. По разделу worktree и `<binding_rules>` gsd-tools не вызывались, корень проверялся `git rev-parse --show-toplevel` = путь `wt-04-09`.

## Threat Flags

Новой поверхности сверх `<threat_model>` нет. T-4-32 (открытый редирект) закрыт `safeCallbackPath` и таблицей тестов, синонимы не читаются. T-4-33 (шторм refresh) закрыт single-flight и тестом трёх одновременных 401. T-4-34: модуль передаёт `perms` как есть, проверка исходников в тесте. T-4-SC: установок пакетов нет.

## Known Stubs

Нет. `schedule.ts` пока не подключён к `AuthProvider`: подключение проактивного refresh — задача 04-10 по плану.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

- **Discretion, синонимы callback.** Страница логина принимает только `callbackUrl`; `from`, `next`, `redirectTo`, `returnTo`, `redirect` больше не читаются. Проверка: открыть `/login?next=/tests` при живой сессии — переход на `/dashboard`, а не на `/tests`. Подтвердить, что внешних ссылок с этими параметрами нет.
- **UI-SPEC «Поверхность 3», [авто] требует подтверждения.** При отказе refresh (401) клиент делает полную навигацию на `/login?callbackUrl=…`, несохранённые данные форм (редактор вопроса, `EditUserDialog`) теряются. Сбой сети или сервера при refresh навигации не вызывает. Потеря ответа ротации (оборванная навигация, перезагрузка во время холодного старта, RSC-prefetch) ведёт к выходу примерно через 15 минут, в том числе посреди работы (CONTEXT `<specifics>` п. 4).
- **AuthGuard.** `redirectTo` теперь только включает редирект, адрес строит `buildLoginRedirect` (всегда `/login`); единственное использование — `AppLayout` с `redirectTo="/login"`. Кодирование `callbackUrl` сменилось с `encodeURIComponent` на `URLSearchParams` (пробел как `+`), как у proxy.
- **Коммит.** Файлы плана коммитит оркестратор или пользователь.

## Files to commit (от корня worktree)

Новые:
- `app/web/lib/session/transport.ts`
- `app/web/lib/session/client.ts`
- `app/web/lib/session/redirect.ts`
- `app/web/lib/session/schedule.ts`
- `app/web/lib/session/client.test.ts`
- `app/web/lib/session/redirect.test.ts`
- `app/web/lib/session/schedule.test.ts`

Изменённые:
- `app/web/lib/api-fetch.ts`
- `app/web/lib/auth/authMePayload.ts`
- `app/web/components/providers/AuthProvider.tsx`
- `app/web/components/auth/AuthGuard.tsx`
- `app/web/app/(internal)/login/LoginPageClient.tsx`
- `app/web/app/(internal)/(protected)/profile/[id]/page.tsx`
- `app/web/app/(internal)/(protected)/admin/users/[id]/page.tsx`

Удалённые:
- `app/web/lib/auth/fetchMe.ts`
- `app/web/lib/auth/refresh.ts`
- `app/web/lib/auth/loginRedirect.ts`
- `app/web/lib/auth/loginRedirect.test.ts`

`git status --porcelain --untracked-files=all` в worktree показывает ровно эти 18 путей, все из `files_modified` плана.

## Next Phase Readiness

- 04-10 получает `sessionClient.refreshOnce` (исход `ok` несёт `accessExpiresAt`), `refreshDelayMs` и `me.accessExpiresAt` для проактивного refresh, а также единственный `AuthProvider`. Эффект миграции cookie в `AuthProvider` (голый `POST /api/auth/refresh` мимо single-flight) остаётся до 04-10.
- 04-12 снимает обход `isAdmin` в `AuthGuard`; 04-13 меняет загрузку и тексты страницы логина.

## Self-Check: PASSED

- Все 7 новых файлов существуют, 4 удалённых отсутствуют (проверка плана `one redirect function`).
- Коммитов нет по правилу пользователя: `plan_head_before` = `plan_head_after` = `1eea6b8a35779210c99f2f54c7012750e54b6f7e`, изменения в рабочем дереве worktree.
