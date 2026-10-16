---
phase: 13-token-qr-and-phone-page
plan: 04
subsystem: web
tags: [nextjs, proxy, app-router, public-paths, auth-guard]

requires:
  - phase: 13-token-qr-and-phone-page
    provides: "13-01 (линия web, содержательной зависимости нет)"
provides:
  - "app/web/lib/navigation/public-paths.ts: isPublicPath, isAnonymousPage, ANONYMOUS_PAGE_HEADER — один список публичных путей с точным сравнением"
  - "анонимная оболочка на /photo-upload: без getServerMe, AuthProvider, меню, шапки, поиска; proxy без refresh"
  - "AuthGuard hideOnPublicPath: меню, шапка и SearchDialog не рисуются на /login и /invite (клиентская проверка пути)"
affects: [13-06, 13-07, 13-08]

actuals:
  tokens: 6500
  tasks: 2
  commits: 0

tech-stack:
  added: []
  patterns:
    - "proxy ставит заголовок запроса анонимной страницы сам и всегда снимает входящий; серверный AppLayout читает его через headers()"

key-files:
  created:
    - app/web/lib/navigation/public-paths.ts
    - app/web/lib/navigation/public-paths.test.ts
  modified:
    - app/web/proxy.ts
    - app/web/proxy.test.ts
    - app/web/components/AppLayout/AppLayout.tsx
    - app/web/components/auth/AuthGuard.tsx
    - app/web/lib/session/client.ts
    - app/web/lib/session/client.test.ts
    - app/web/lib/navigation/sections.test.ts
    - e2e/tests/proxy-protection.spec.ts

key-decisions:
  - "/login и /invite — префиксы с точным сравнением (=== p || startsWith(p + '/')), /photo-upload — только точное совпадение, подпутей нет"
  - "ANONYMOUS_PAGE_HEADER = x-bio-anonymous-page, значение '1'; AppLayout проверяет наличие, входящий proxy снимает на любом пути"
  - "AuthGuard: пропсы skipPaths/skipPathPrefixes убраны (других вызывающих нет), пропуск по isPublicPath; новый проп hideOnPublicPath для обёрток меню, шапки и SearchDialog"
  - "isAuthPage в lib/session/client.ts удалена, redirectToLogin вызывает isPublicPath напрямую"

patterns-established:
  - "Новый публичный путь добавляется только в lib/navigation/public-paths.ts; proxy, AuthGuard и клиент сессии читают его оттуда"

requirements-completed: [QR-01, QR-04]

coverage:
  - id: D1
    description: "Один модуль публичных путей: открыты /login, /invite/abc, /photo-upload; закрыты /invites, /users, /photo-upload-x, /photo-upload/abc, /loginx, /"
    requirement: QR-01
    verification:
      - kind: unit
        ref: "app/web/lib/navigation/public-paths.test.ts"
        status: pass
      - kind: unit
        ref: "app/web/proxy.test.ts#proxy: анонимная страница /photo-upload"
        status: pass
    human_judgment: false
  - id: D2
    description: "proxy на /photo-upload сразу passThrough без refreshForProxy, ставит свой заголовок; подложенный заголовок на других путях до layout не доходит"
    requirement: QR-04
    verification:
      - kind: unit
        ref: "app/web/proxy.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "/photo-upload без входа и с сессией ученика: не редирект на /login, статус ниже 500, нет [data-sidebar], нет /api/auth/me при загрузке и visibilitychange; /photo-upload-x уводит на /login"
    requirement: QR-04
    verification:
      - kind: e2e
        ref: "e2e/tests/proxy-protection.spec.ts (chromium-desktop и chromium-mobile)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Вход, приглашение и навигация не сломаны: оболочка появляется после входа"
    verification:
      - kind: e2e
        ref: "e2e/tests/auth.spec.ts, e2e/tests/navigation.spec.ts"
        status: pass
      - kind: unit
        ref: "app/web/lib/session/client.test.ts, app/web/lib/navigation/sections.test.ts"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-10-17
status: complete
---

# Phase 13 Plan 04: один модуль публичных путей и анонимная оболочка Summary

**Публичные пути собраны в `lib/navigation/public-paths.ts` с точным сравнением. `/photo-upload` проходит proxy без refresh и рисуется без `getServerMe`, `AuthProvider`, меню и поиска (заголовок `x-bio-anonymous-page` от proxy). На `/login` и `/invite` меню, шапка и поиск скрываются клиентской проверкой пути**

## Performance

- **Duration:** около 20 мин
- **Tasks:** 2 из 2
- **Files modified:** 10 (2 новых, 8 изменённых)

## Accomplishments

- `public-paths.ts`: `isPublicPath` (путь без `?`/`#`; `/login`, `/invite` — `=== p || startsWith(p + '/')`; `/photo-upload` — только точное), `isAnonymousPage` (точное `/photo-upload`), `ANONYMOUS_PAGE_HEADER`.
- `proxy.ts`: свои `PUBLIC_PATHS`/`PUBLIC_PREFIXES` с опасным `startsWith(prefix)` убраны. `forwardedHeaders` снимает входящий `ANONYMOUS_PAGE_HEADER` вместе с `x-session-refresh`, `passThrough` переписывает заголовки и при его наличии. На анонимной странице первым шагом `NextResponse.next` со своим заголовком, без `needsRefresh`/`refreshForProxy`: чужая сессия на телефоне не поворачивается и cookie не чистятся.
- `AppLayout.tsx`: при заголовке анонимной страницы возвращает только `children` до `getServerMe`; литерал `<AuthProvider` один. Остальные пути — прежняя разметка; обёртки меню, шапки и `SearchDialog` — `AuthGuard hideOnPublicPath`.
- `AuthGuard.tsx`: пропуск по `isPublicPath(pathname)`; на публичном пути с `hideOnPublicPath` — `fallback`, иначе `children`. Пропсы `skipPaths`/`skipPathPrefixes` убраны.
- `client.ts`: `AUTH_PAGE_PREFIXES` и `isAuthPage` убраны, `redirectToLogin` проверяет `isPublicPath`.
- `sections.test.ts`: `'/photo-upload'` в `NOT_LISTED`.

## codegraph impact

Индекс основного checkout (`/Users/kdvornichenko/bio-exam/.codegraph`; в worktree каталога нет, код этих символов на HEAD тот же):

```
Impact of changing "AuthGuard" — 5 affected symbols:
function AuthGuard (tsx) — app/web/components/auth/AuthGuard.tsx:21
app/web/components/auth/AuthGuard.tsx      function AuthGuard:21
app/web/components/AppLayout/AppLayout.tsx function AppLayout:21, file AppLayout.tsx:1
app/web/app/layout.tsx                     function RootLayout:28, file layout.tsx:1

Impact of changing "isAuthPage" — 4 affected symbols:
function isAuthPage (typescript) — app/web/lib/session/client.ts:42
app/web/lib/session/client.ts  function isAuthPage:42, redirectToLogin:103, expire:111, createSessionClient:62
```

Вызывающий `AuthGuard` один (`AppLayout`), поэтому пропсы `skipPaths`/`skipPathPrefixes` убраны. `isAuthPage` использовалась только внутри `client.ts`.

## Проверки

- Tracer-ворота после задачи 1: `yarn workspace @bio-exam/web test proxy.test.ts public-paths.test.ts` — 52 passed; `node --test scripts/auth-single-session-helpers.test.mjs` — 6/6; `yarn e2e e2e/tests/proxy-protection.spec.ts` — 94 passed (оба проекта).
- После задачи 2: `yarn workspace @bio-exam/web test lib/session/client.test.ts lib/navigation proxy.test.ts` — 8 файлов, 139 passed; весь web — 109 файлов, 1776 passed; `typecheck` — 0; `lint` — 0, предупреждения только старые (`useTestEditorModel.ts`); `yarn e2e e2e/tests/proxy-protection.spec.ts e2e/tests/auth.spec.ts e2e/tests/navigation.spec.ts` — 130 passed (1,1 мин).
- `node --test scripts/auth-single-session-helpers.test.mjs scripts/web-requests-guards.test.mjs` — 10/10; `yarn format:check` — OK.
- Критерии приёмки: `PUBLIC_PREFIXES|startsWith(prefix)` в `proxy.ts` нет; `<AuthProvider` в `AppLayout.tsx` — 1; `ANONYMOUS_PAGE_HEADER` в `proxy.ts` и `AppLayout.tsx`; `AUTH_PAGE_PREFIXES|skipPathPrefixes` в `app/web/lib` и `app/web/components` нет; `'/photo-upload'` в `sections.test.ts`.

## Task Commits

1. **Task 1 (tracer): /photo-upload проходит proxy и рисуется без оболочки** — не закоммичено
2. **Task 2: AuthGuard, isAuthPage и реестр разделов из одного модуля** — не закоммичено

## Files Created/Modified

- `app/web/lib/navigation/public-paths.ts` — список публичных путей, анонимная страница, имя заголовка
- `app/web/lib/navigation/public-paths.test.ts` — `test.each` открытых и закрытых путей
- `app/web/proxy.ts` — модуль путей, анонимная ветка, снятие подложенного заголовка
- `app/web/proxy.test.ts` — `/photo-upload` без refresh, подмена заголовка, закрытые `/invites`, `/users`, `/photo-upload-x`, `/photo-upload/abc`, `/loginx`
- `app/web/components/AppLayout/AppLayout.tsx` — анонимная ветка, `hideOnPublicPath` у обёрток оболочки
- `app/web/components/auth/AuthGuard.tsx` — `isPublicPath`, `hideOnPublicPath`
- `app/web/lib/session/client.ts`, `client.test.ts` — `isPublicPath`; `/photo-upload` без навигации, `/photo-upload-x` с навигацией на `/login`
- `app/web/lib/navigation/sections.test.ts` — `/photo-upload` в `NOT_LISTED`
- `e2e/tests/proxy-protection.spec.ts` — `/photo-upload` без редиректа и статус ниже 500, `/photo-upload-x` на `/login`, страница без `[data-sidebar]` и без `/api/auth/me` для анонима и для ученика с сессией

## Decisions Made

- `/photo-upload` добавлен в `test.each` «без cookie», но не в «refresh 401 на публичном пути»: на этой странице refresh не вызывается, cookie не чистятся; это проверяет отдельный describe.
- `SearchDialog` теперь внутри `AuthGuard hideOnPublicPath`: раньше монтировался всегда, теперь только с сессией (или при `sessionError`) и не на публичных путях. `navigation.spec.ts` зелёный.
- Обёртки меню и шапки на `/login` и `/invite` скрыты и при наличии `me` (раньше меню мелькало, пока `LoginPageClient` уводил вошедшего на `callbackUrl`). Так задумано планом.
- e2e страницы проверяет кроме анонима контекст ученика со `storageState` (T-13-18): старая оболочка показала бы ему меню, новая — нет.

## Deviations from Plan

Нет. План выполнен как написан; расширение e2e на контекст ученика — в пределах `<action>` п. 5.

## Issues Encountered

- Тест «подложенный заголовок до layout не доходит» на `/login` без cookie сначала упал: когда в запросе только удаляемый заголовок, список переопределённых заголовков пуст. Добавлен `accept: 'text/html'`, как в соседнем тесте `%s без cookie`.

## User Setup Required

None.

## Next Phase Readiness

Ограничения для 13-06 (страница телефона):

- **Клиентская навигация из голой оболочки.** Анонимная ветка `AppLayout` возвращает только `children`; корневой layout в App Router при клиентском переходе не перерисовывается, поэтому `next/link` или `router.push` с `/photo-upload` в приложение оставит дерево без `AuthProvider`, а `useAuth()` без провайдера бросает `useAuth must be used within <AuthProvider>`. На странице телефона ссылки в приложение — только обычным `<a>` (полная загрузка) или никаких. Сейчас, пока страницы нет, на `/photo-upload` рисуется 404 с «На главную» (`Link`) и «Назад» (`router.back`/`push`): эти кнопки там до 13-06 упадут в границу ошибок. Вывод из устройства App Router, в браузере не проверялся.
- **Прокрутка.** У корневого `<html>` стоит `style={{ overflow: 'hidden' }}`, а `MainScrollArea` в анонимной ветке нет: страница телефона даёт свой контейнер прокрутки (например `<main className="h-dvh overflow-y-auto">`).
- `Toaster` остаётся в корневом layout и на анонимной странице есть.

## Self-Check: PASSED

- FOUND: app/web/lib/navigation/public-paths.ts, app/web/lib/navigation/public-paths.test.ts
- Коммитов нет по правилам фазы (не закоммичено), изменения в рабочем дереве worktree.

---
*Phase: 13-token-qr-and-phone-page*
*Completed: 2026-10-17*
