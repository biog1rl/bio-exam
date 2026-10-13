---
phase: 04-authentication-and-web-session
plan: 11
subsystem: auth
tags: [web-session, proxy, ssr-refresh, d8, d-14, d-18, vitest, playwright]
status: complete
deferred_human_gate: true

requires:
  - phase: 04-authentication-and-web-session
    provides: "04-10: один AuthProvider в AppLayout с initialMe из getServerMe, keep-alive, единый logout; 04-09: buildLoginRedirect, safeCallbackPath; 04-07: окно гонки refresh (reused → только access); 04-05/06: sid в access, ротация refresh"
provides:
  - "app/web/lib/session/access-token.ts: REFRESH_THRESHOLD_SEC = 60, decodeAccessPayload (sid, exp без проверки подписи), needsRefresh({ accessToken, hasRefresh, nowSec })"
  - "app/web/lib/session/api-origin.ts: requireApiOrigin() (API_ORIGIN читается при вызове, нет / невалиден / не http(s) → Error с текстом про API_ORIGIN), apiUrl(path)"
  - "app/web/lib/session/proxy-refresh.ts: refreshForProxy({ cookieHeader, fetchImpl }) → refreshed { setCookies, values } при 200, rejected только при 401, unavailable при сбое сети и любом другом ответе; без signal и таймаута"
  - "app/web/proxy.ts: async proxy с обновлением сессии при SSR, перенос Set-Cookie в ответ, подстановка новых cookie в запрос RSC, очистка cookie и редирект через buildLoginRedirect при 401"
  - "app/web/lib/session/server.ts: getServerMe = cache(...) только через Express, 401 → null, прочие отказы → ошибка"
  - "Поле контекста sessionError; асинхронный (protected)/layout.tsx бросает ошибку getServerMe внутрь границы app/error.tsx"
affects: [04-12, 04-13, 04-14]

actuals:
  tokens: 10800
  tasks: 3
  commits: 0
plan_head_before: ddc843ef399f30ac928a8e7afe46644f6c11c939
plan_head_after: ddc843ef399f30ac928a8e7afe46644f6c11c939

tech-stack:
  added: []
  patterns:
    - "Решение о refresh в proxy принимается по payload access без подписи; пользователь и права берутся только у Express"
    - "Значения из Set-Cookie Express декодируются (decodeURIComponent) до req.cookies.set: RequestCookies кодирует значение сам"
    - "Тело ответа fetch в серверном коде Next не отменяется с await: у патченного fetch тело может быть ветвью tee, и cancel одной ветви не завершается"

key-files:
  created:
    - app/web/lib/session/access-token.ts
    - app/web/lib/session/access-token.test.ts
    - app/web/lib/session/api-origin.ts
    - app/web/lib/session/proxy-refresh.ts
    - app/web/lib/session/server.ts
    - app/web/lib/session/server.test.ts
    - app/web/proxy.test.ts
  modified:
    - app/web/proxy.ts
    - app/web/components/AppLayout/AppLayout.tsx
    - app/web/app/(internal)/(protected)/layout.tsx
    - app/web/app/(internal)/(protected)/profile/page.tsx
    - app/web/app/(internal)/(protected)/profile/[id]/page.tsx
    - app/web/app/(internal)/(protected)/admin/users/[id]/page.tsx
    - app/web/components/providers/AuthProvider.tsx
    - app/web/components/auth/AuthGuard.tsx
    - e2e/tests/session.spec.ts
  deleted:
    - app/web/lib/auth/getServerMe.ts
    - app/web/lib/auth/getServerMe.test.ts

key-decisions:
  - "Решение исполнителя (автономно): requireApiOrigin вынесен в app/web/lib/session/api-origin.ts без server-only, его импортируют proxy-refresh.ts и server.ts; кроме пустого и неразбираемого значения отклоняется протокол не http(s)"
  - "Решение исполнителя (автономно): access-cookie для решения о refresh читается readSessionCookieValue по кандидатам getSessionCookieCandidates (R7); при 401 очищаются все кандидаты имени access и refresh_token"
  - "Решение исполнителя (автономно): при sessionError AuthGuard без requireAll/requireAny рендерит children без редиректа; гейт с правами при me = null по-прежнему отдаёт fallback. sessionError сбрасывается, когда клиентская загрузка me даёт определённый исход (ok или rejected)"
  - "Решение исполнителя (автономно): AppLayout ловит ошибку getServerMe через unstable_rethrow, чтобы служебные ошибки Next (динамическое использование cookies, redirect, notFound) не превращались в sessionError"
  - "Решение исполнителя (автономно): e2e D8 дополнительно проверяет, что после загрузки страницы в браузере снова есть bio_exam_session и что значение refresh_token сменилось, то есть обе строки Set-Cookie ротации из proxy дошли до браузера"

patterns-established:
  - "Тест proxy в Vitest (Node): NextRequest из next/server, vi.stubGlobal('fetch'), vi.stubEnv; подстановка cookie в запрос проверяется по x-middleware-request-cookie и x-middleware-override-headers"

requirements-completed: [AUTH-11, AUTH-09]
requirements-note: "AUTH-09 частично: текущий пользователь при SSR и обновление сессии в proxy — в модуле веб-сессии; гейты UI и удаление Next-дубликата в 04-12…04-14"

coverage:
  - id: D1
    description: "proxy обновляет сессию при SSR: нет access / payload не разбирается / нет sid / exp − now ≤ 60 при живом refresh → POST {API_ORIGIN}/api/auth/refresh, перенос Set-Cookie, подстановка cookie в запрос RSC"
    requirement: AUTH-11
    verification:
      - kind: unit
        ref: "app/web/proxy.test.ts"
        status: pass
      - kind: unit
        ref: "app/web/lib/session/access-token.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "rejected только при 401: очистка cookie, редирект на /login?callbackUrl на защищённом пути, пропуск на /login и /invite; 403, 429, 5xx, 302, сбой сети → запрос проходит без изменения cookie"
    requirement: AUTH-11
    verification:
      - kind: unit
        ref: "app/web/proxy.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "D8 закрыт: /profile/<логин> с удалённым access-cookie и живым refresh открывается без /login, access-cookie снова в браузере, значение refresh_token в браузере сменилось (обе строки Set-Cookie ротации дошли)"
    requirement: AUTH-11
    verification:
      - kind: e2e
        ref: "e2e/tests/session.spec.ts#D8: a server page with an expired access token and a live refresh token opens without /login @session"
        status: pass
    human_judgment: false
  - id: D4
    description: "Матрица @proxy зелёная без изменения файла (sha256 совпадает с отпечатком до плана)"
    requirement: AUTH-11
    verification:
      - kind: e2e
        ref: "e2e/tests/proxy-protection.spec.ts @proxy"
        status: pass
    human_judgment: false
  - id: D5
    description: "getServerMe только через Express: 401 → null, ok:false / нет user.id → null, 403/500/502/сбой fetch/неразбираемый JSON → ошибка, API_ORIGIN нет или невалиден → ошибка без запроса"
    requirement: AUTH-09
    verification:
      - kind: unit
        ref: "app/web/lib/session/server.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "Ошибка getServerMe на защищённой странице показывает app/error.tsx, а не логин; react.cache повторяет отказ во втором вызове того же запроса"
    verification: []
    human_judgment: true
    rationale: "Компоненты в Vitest не рендерятся; мок cache — тождество, поэтому кэширование отказа не проверяется тестом (judgment). Вид страницы ошибки — UI-SPEC [авто], требует подтверждения пользователя"

duration: 18min
completed: 2026-10-04
---

# Phase 4 Plan 11: Обновление сессии в proxy при SSR и getServerMe в модуле веб-сессии Summary

**`proxy.ts` при живом refresh и отсутствующем, неразбираемом, старом (без `sid`) или истекающем в ближайшие 60 с access вызывает `POST {API_ORIGIN}/api/auth/refresh`, переносит `Set-Cookie` в ответ и подставляет новые cookie в запрос RSC; отказ 401 очищает cookie и ведёт на `/login?callbackUrl`, прочие отказы пропускают запрос. D8 стал обычным зелёным тестом. `getServerMe` переехал в `lib/session/server.ts`, работает только через Express и различает 401 (null) и сбой (ошибка, которая показывается через `app/error.tsx`).**

## Performance

- **Duration:** около 18 мин активной работы (без ожидания прогонов)
- **Started:** 2026-10-04T08:16:00Z
- **Completed:** 2026-10-04T08:34:20Z
- **Tasks:** 3/3
- **Files:** 18 путей в git (7 новых, 9 изменённых, 2 удалённых) и отпечаток в `.planning/commit-snapshots/before-04-11/`

## Accomplishments

- `access-token.ts`: `decodeAccessPayload` разбирает среднюю часть JWT через `atob` с заменой алфавита и `TextDecoder` (`fatal`), без `Buffer`, подпись не проверяется. `needsRefresh`: без refresh → `false`; нет access, payload `null`, нет `sid` или `exp`, `exp − now ≤ 60` → `true`; `exp − now = 61` → `false`.
- `proxy-refresh.ts`: `refreshForProxy` шлёт `POST` с заголовком `cookie` запроса, `redirect: 'manual'`, `cache: 'no-store'`, без `signal`. 200 → `refreshed` со строками `getSetCookie()` и картой имя → значение (значение декодируется), 401 → `rejected`, любой другой статус (403, 429, 5xx, 3xx) и исключение `fetch` → `unavailable`. Ничего не логирует.
- `proxy.ts`: функция стала `async`; matcher и публичные пути (`/login`, `/invite`) без изменений. `refreshed` → `req.cookies.set` для полученных имён, `NextResponse.next({ request: { headers: new Headers(req.headers) } })`, каждая строка `Set-Cookie` через `response.headers.append`. `rejected` → на защищённом пути `NextResponse.redirect(new URL(buildLoginRedirect(pathname + search), req.url))`, на публичном `NextResponse.next()`; в обоих случаях `<имя>=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax` для всех кандидатов имени access и `refresh_token`. `unavailable` → `NextResponse.next()`. Без cookie — прежний редирект, теперь через `buildLoginRedirect`.
- `server.ts` (`import 'server-only'`): `getServerMe = cache(async () => …)`, URL из `requireApiOrigin()`, `cache: 'no-store'`, `redirect: 'error'`, cookie запроса; 401 → `null`; иной неуспешный статус → `Error('GET /api/auth/me failed with status N')`; сбой сети и неразбираемый JSON пробрасываются; 200 разбирается `parseAuthMe` (`ok:false`, нет `user.id` → `null`). Ветки `getMeData` нет. `isAuthenticated` удалена: вызывающих, кроме старого теста, не было.
- `lib/auth/getServerMe.ts` и `getServerMe.test.ts` удалены; `AppLayout.tsx`, `profile/page.tsx`, `profile/[id]/page.tsx`, `admin/users/[id]/page.tsx` импортируют `getServerMe` из `@/lib/session/server`.
- `AppLayout.tsx`: `getServerMe()` в `try/catch`, в `catch` сначала `unstable_rethrow(error)`, затем `sessionError = true`; провайдер получает `initialMe={null}` и `sessionError`. `(protected)/layout.tsx` асинхронный, `await getServerMe()` бросает ту же ошибку внутри сегмента, её показывает существующий `app/error.tsx` (вид не менялся).
- `AuthProvider.tsx`: проп и поле контекста `sessionError` (состояние, сбрасывается после определённого исхода клиентской загрузки `me`). `AuthGuard.tsx`: при `sessionError` нет редиректа на логин; гейт без требований прав рендерит `children`, гейт с `requireAll`/`requireAny` при `me = null` отдаёт `fallback`.
- `e2e/tests/session.spec.ts`: D8 — `test('D8: a server page with an expired access token and a live refresh token opens without /login @session')`, у подготовки снят `@known-defect`; навигации главного фрейма прикладываются к отчёту; добавлены проверки, что `bio_exam_session` снова в cookie браузера и что значение `refresh_token` после загрузки отличается от значения до неё (браузер на загрузке не вызывает `/api/auth/refresh`, это доказывает D3, поэтому сменить cookie может только `Set-Cookie` из proxy). `test.fail(` в файле не осталось.

## Task Commits

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве (ветка `dev`).

1. **Task 1 (tracer):** `access-token.ts`, `api-origin.ts`, `proxy-refresh.ts`, `proxy.ts`, `proxy.test.ts`, `access-token.test.ts`, D8 переключён.
2. **Task 2 (TDD):** `server.ts` с тестом, удаление `lib/auth/getServerMe*`, переключение четырёх потребителей.
3. **Task 3:** `sessionError` в `AppLayout`, `AuthProvider`, `AuthGuard`; асинхронный защищённый layout; полный прогон.

## TDD Gate Compliance

- **Tracer gate (Task 1):** `HUMAN_VERIFY_MODE` по умолчанию `end-of-phase`, `<verify>` только автоматический. После Task 1: `vitest run proxy.test.ts lib/session` → `Test Files 6 passed (6)`, `Tests 140 passed (140)`; `yarn e2e --grep "D8|@proxy|@session"` → `86 passed (10.2s)`, D8 зелёный на `chromium-desktop` и `chromium-mobile`; проверка плана печатает `d8 flipped, matrix untouched`. Только после этого начат Task 2.
- **Task 1, проверка мутациями:** `rejected` при любом статусе ≥ 400 вместо только 401 → `4 failed | 20 passed (24)`; без `req.cookies.set` (cookie не подставляются в запрос) → `3 failed | 21 passed (24)`. После возврата кода (`cmp` с копией) → `24 passed`.
- **Task 2 RED:** `server.test.ts` написан до модуля. `vitest run lib/session` → `Test Files 1 failed | 5 passed (6)`, `Tests 19 failed | 116 passed (135)`, причина `Cannot find module '/lib/session/server'`.
- **Task 2, промежуточный шаг:** после создания `server.ts`, пока страница профиля ещё импортировала старый модуль, `5 failed | 130 passed (135)` (403/500/502/сбой/JSON давали редирект на логин через старый `getServerMe`). После переключения потребителей и удаления старого модуля — GREEN.
- **Task 2 GREEN:** `Test Files 6 passed (6)`, `Tests 135 passed (135)`; вместе с `proxy.test.ts` — `Tests 159 passed (159)`.
- **Task 2, проверка мутацией:** 403 как `null` вместо ошибки → `1 failed | 18 passed (19)`; после возврата (`cmp`) зелёный.
- **Кэш отказа (Task 3 шаг 4):** мок `react.cache` — тождество, поэтому повтор той же ошибки при втором вызове в запросе тестом не проверяется. Judgment: `cache` из `react` в серверных компонентах мемоизирует и отклонённый промис; `(protected)/layout.tsx` получает тот же отказ без второго запроса к Express.

## codegraph impact (до правок)

- `proxy` (`app/web/proxy.ts:16`): 1 символ, внешних вызывающих нет (точка входа Next).
- `getSessionCookieCandidates` (`lib/auth/sessionCookie.ts:3`): 8 символов — `readSessionCookieValue`, `proxy.ts` (`SESSION_COOKIE_CANDIDATES`, `proxy`), `sessionCookie.test.ts`, `lib/auth/server/getMeData.ts` (`getMeData`). Функция не менялась; `proxy.ts` теперь вызывает её при каждом запросе вместо константы модуля.
- `getServerMe` (`lib/auth/getServerMe.ts:10`): 15 символов — `isAuthenticated`, `profile/[id]/page.tsx` (`ProfileByIdPage`), `admin/users/[id]/page.tsx` (`AdminUserPageRedirect`), `profile/page.tsx` (`ProfilePage`), `components/AppLayout/AppLayout.tsx` (`AppLayout`), `app/layout.tsx` (`RootLayout`). `isAuthenticated` вызывал только удалённый тест.

## codegraph affected (после правок, D-22)

По файлам плана — 9 файлов: `lib/session/access-token.test.ts`, `proxy.test.ts`, `e2e/fixtures/exam.ts`, `e2e/tests/auth.spec.ts`, `authoring.spec.ts`, `review.spec.ts`, `session.spec.ts`, клиентские `QuestionEditor.tsx` и `TestRunner.tsx` (транзитивно через `AuthProvider`). `lib/session/server.test.ts` индекс ещё не показал (новый файл). Все прогнаны в `yarn verify` и полном `yarn e2e`.

## e2e D8: навигации после правки

`yarn e2e --grep "D8" --reporter=json`, вложение `D8 main frame navigations`:

- `chromium-desktop` (passed): `http://127.0.0.1:60085/profile/student-desktop` → `http://127.0.0.1:60085/profile/student-desktop`
- `chromium-mobile` (passed): `http://127.0.0.1:60085/profile/student-mobile` → `http://127.0.0.1:60085/profile/student-mobile`

Навигаций на `/login` нет, итоговый путь — `/profile/<логин>`, `bio_exam_session` снова в cookie контекста, значение `refresh_token` сменилось. После добавления проверки ротации `yarn e2e --grep "D8|@session"` → `18 passed (8.2s)`.

## Verification

- `yarn workspace @bio-exam/web vitest run proxy.test.ts lib/session` → `Test Files 7 passed (7)`, `Tests 159 passed (159)`.
- `yarn workspace @bio-exam/web typecheck` → exit 0.
- Проверки плана печатают `d8 flipped, matrix untouched` и `server me via express only`; `rg -n "sessionError"` находит использование в `AuthGuard.tsx` и `AppLayout.tsx`.
- sha256 `e2e/tests/proxy-protection.spec.ts` в конце совпадает с отпечатком до плана (`9dece947…13b7bf`).
- `yarn verify` (последний прогон, после правки D8) → `yarn verify: OK` (web `334 passed`, server `423 passed`, exam-core `498 passed`, rbac `2 passed`; `format-check`, `lint-typecheck-test`, `migrations`, `script-tests` passed).
- `yarn e2e` (полный, до добавления проверки ротации в D8) → exit 0, `Running 122 tests`, `122 passed (39.0s)`. Ожидаемо падает только D1 (`review.spec.ts:303`, `@known-defect`) на `chromium-desktop` и `chromium-mobile`. D8 (`session.spec.ts:51`) и D3 зелёные на обоих проектах. В 04-10 ожидаемых падений было 4 (D1 и D8).
- Сборка web по `buildCommand` из `app/web/vercel.json` с плейсхолдерами env → exit 0, `Failed to compile` и `Invalid server env` в выводе нет, `ƒ Proxy (Middleware)` в списке маршрутов.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Зависание SSR на `await response.body?.cancel()`**
- **Found during:** Task 3, полный `yarn e2e`
- **Issue:** два прогона подряд падали `Timed out waiting 120000ms from config.webServer`: проверка готовности `GET /login` не получала ответа. Первая версия `server.ts` при 401 и неуспешном статусе делала `await response.body?.cancel()`. В серверных компонентах `fetch` патчен Next, тело ответа может быть ветвью `tee`, а `cancel` одной ветви не завершается, пока не отменена вторая. Рендер `/login` (в `AppLayout` без cookie Express отвечает 401) ждал бесконечно. В Vitest патча нет, поэтому юнит-тесты были зелёные, а e2e после Task 1 (до `server.ts`) проходил.
- **Fix:** `server.ts` тело при 401 и ошибке не трогает (как старый `getServerMe`). В `proxy-refresh.ts` отмена тела тоже не ожидается: `response.body?.cancel().catch(() => undefined)`.
- **Files modified:** `app/web/lib/session/server.ts`, `app/web/lib/session/proxy-refresh.ts`
- **Verification:** после правки полный `yarn e2e` → `122 passed`, повторный `yarn verify: OK`, сборка web exit 0.

### Прочее

- `app/web/lib/session/api-origin.ts` — файл вне `files_modified`; план разрешает вынести `requireApiOrigin` в него («вынеси в `lib/session/api-origin.ts` или в этот файл»).
- `access-token.test.ts` написан в Task 1 вместе с модулем (таблица `decodeAccessPayload` и `needsRefresh`), в Task 2 переносить нечего.
- В `proxy.test.ts` сверх behavior: `302` от Express → `unavailable`; декодирование значения из `Set-Cookie`; истёкший access без refresh-cookie → refresh не вызывается; `API_ORIGIN` не задан, но refresh не нужен → proxy работает.
- В `server.test.ts` сверх behavior: `502` с текстовым телом, `API_ORIGIN` с протоколом `ftp:`, модуль экспортирует только `getServerMe`.
- В e2e D8 добавлены вложение с навигациями, проверка cookie `bio_exam_session` и проверка смены значения `refresh_token` после загрузки (решение исполнителя, записано в key-decisions).
- `AppLayout.tsx`: существующий JSX-комментарий над `AuthProvider` не тронут; в старом `getServerMe.test.ts` были комментарии, в `server.test.ts` их нет.
- Не отклонение: запуск `root-pin.sh` отклонён правами; корень проверен `git rev-parse --show-toplevel` = `/Users/kdvornichenko/bio-exam`, запись только по абсолютным путям внутри корня.

## Threat Flags

Новой поверхности сверх `<threat_model>` нет. T-4-38: payload access без подписи влияет только на `needsRefresh`; пользователь и права приходят из `/api/auth/me`. T-4-39: callback строится из `req.nextUrl.pathname + search` функцией `buildLoginRedirect`; на логине его принимает `safeCallbackPath`. T-4-40: proxy подставляет только полученные cookie (тест «окно гонки»). T-4-41: в `proxy.ts` и `proxy-refresh.ts` нет логирования. T-4-SC: установок пакетов нет.

Наблюдение: если `API_ORIGIN` не задан, любой страничный запрос с refresh-cookie, которому нужен refresh, падает в proxy с ошибкой конфигурации (по плану). Запросы без refresh-cookie и с живым access проходят как раньше.

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

- **Preview Vercel (CONTEXT `<specifics>` п. 12, часть).** Обновление сессии в `proxy.ts` на Vercel (Node runtime, перенос `Set-Cookie` с ответа Express): войти, удалить в DevTools cookie `bio_exam_session`, открыть `/profile/<логин>` — страница открывается без `/login`, в ответе документа есть `Set-Cookie` с `bio_exam_session`. Шаг входит в preview-чек-лист 04-14.
- **Потеря ответа ротации (CONTEXT `<specifics>` п. 4).** Если ответ refresh из proxy не дошёл до браузера (оборванная навигация, перезагрузка на холодном старте, RSC-prefetch), браузер остаётся со старым refresh-токеном; через ~15 минут следующий refresh попадает в replay и сессия завершается, в том числе посреди работы. Дизайн не меняется, таймаут в proxy не добавлен. Нужно согласие на эту цену (C6).
- **UI-SPEC [авто], требует подтверждения.** Ошибка базы прав (`/api/auth/me` отвечает 5xx или недоступен) на защищённой странице показывает `app/error.tsx` (`Something went wrong!`, `Try again`), а не логин; сайдбар и шапка при этом рендерятся без данных пользователя. После редиректа proxy на `/login` баннера «сессия завершена» нет.
- **Коммит.** Файлы плана коммитит оркестратор или пользователь.

## Files to commit

Новые:
- `app/web/lib/session/access-token.ts`
- `app/web/lib/session/access-token.test.ts`
- `app/web/lib/session/api-origin.ts`
- `app/web/lib/session/proxy-refresh.ts`
- `app/web/lib/session/server.ts`
- `app/web/lib/session/server.test.ts`
- `app/web/proxy.test.ts`

Изменённые:
- `app/web/proxy.ts`
- `app/web/components/AppLayout/AppLayout.tsx`
- `app/web/app/(internal)/(protected)/layout.tsx`
- `app/web/app/(internal)/(protected)/profile/page.tsx`
- `app/web/app/(internal)/(protected)/profile/[id]/page.tsx`
- `app/web/app/(internal)/(protected)/admin/users/[id]/page.tsx`
- `app/web/components/providers/AuthProvider.tsx`
- `app/web/components/auth/AuthGuard.tsx`
- `e2e/tests/session.spec.ts`

Удалённые:
- `app/web/lib/auth/getServerMe.ts`
- `app/web/lib/auth/getServerMe.test.ts`

Вне git: `.planning/commit-snapshots/before-04-11/proxy-protection.sha256`, этот SUMMARY.

`git status --porcelain --untracked-files=all` показывает ровно эти 18 путей.

## Next Phase Readiness

- 04-12 снимает обход `isAdmin` в `AuthGuard`; ветка `sessionError` стоит до него и от него не зависит. Страница `/profile/[id]` всё ещё проверяет роль `admin`; фикстура администратора в `server.test.ts` уже содержит `tests.manage_assignments`.
- 04-13: страница логина при живом refresh и истёкшем access теперь получает `me` из SSR (proxy обновил cookie до рендера) и сразу уходит на callback.
- 04-14: `lib/auth/server/getMeData.ts` больше никто из `getServerMe` не вызывает; `API_ORIGIN` обязателен для SSR и для refresh в proxy.

## Self-Check: PASSED

- Все 7 новых файлов существуют, 2 удалённых отсутствуют; проверки плана печатают `d8 flipped, matrix untouched` и `server me via express only`.
- Коммитов нет по правилу пользователя: `plan_head_before` = `plan_head_after` = `ddc843ef399f30ac928a8e7afe46644f6c11c939`, изменения в рабочем дереве.
