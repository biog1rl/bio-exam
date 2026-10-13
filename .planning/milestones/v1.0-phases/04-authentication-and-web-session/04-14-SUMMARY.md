---
phase: 04-authentication-and-web-session
plan: 14
subsystem: auth
tags: [d-18, d-01, d-21, d-24, auth-08, auth-12, auth-01, web-env, rbac, guard-test, e2e-env, runbook]
status: complete
deferred_human_gate: true

requires:
  - phase: 04-authentication-and-web-session
    provides: "04-04: модуль access-policy на сервере и parity /api/auth/me ↔ requirePermKey; 04-05: охранный тест серверной части D-21; 04-11: getServerMe только через Express; 04-12: гейты разделов по карте прав; 04-13: экран 429 и блок «Сеансы и вход»"
provides:
  - "app/web без getMeData, Next-маршрута /api/auth/me, lib/env/server.ts и зависимостей pg, jsonwebtoken, @types/pg, @types/jsonwebtoken"
  - "app/web/.env.example только с API_ORIGIN, APP_ORIGIN, NEXT_PUBLIC_APP_ORIGIN, SESSION_COOKIE_NAME; env-contract без zodFile у web"
  - "packages/rbac — словарь: can, реестр, домены, нормализаторы; 13 рантайм-экспортов, buildPermissionSet и разворот ролей удалены"
  - "scripts/lib/e2e-web-env.mjs: buildWebEnv(env, { webDir }) с DATABASE_URL: '' и AUTH_JWT_SECRET: '' и пустой строкой для каждого ключа app/web/.env*; assertWebEnvClosed требует пустые значения этих двух ключей"
  - "scripts/auth-no-role-string-checks.test.mjs: D-21 целиком (сервер, web, package.json web, экспорт и исходники packages/rbac)"
  - "README: AUTH_JWT_SECRET и DATABASE_URL только в app/server/.env"
  - "CI: шаг Build web без DATABASE_URL и AUTH_JWT_SECRET"
  - "Runbook выкатки D-24 (Task 4) и сводный список отложенных проверок фазы 4"
affects: [phase-05, phase-07, phase-08]

actuals:
  tokens: 12600
  tasks: 3
  commits: 0
plan_head_before: 843cb67456a4cda3739e14e025d544cc6edf7461
plan_head_after: 843cb67456a4cda3739e14e025d544cc6edf7461

tech-stack:
  added: []
  removed: ["app/web: pg", "app/web: jsonwebtoken", "app/web: @types/pg", "app/web: @types/jsonwebtoken"]
  patterns:
    - "Окружение web в e2e закрывается пустыми строками: @next/env не перезаписывает заданный ключ, а Playwright webServer кладёт env поверх process.env раннера, поэтому '' перекрывает и .env разработчика, и AUTH_JWT_SECRET раннера"
    - "Охранный тест репозитория проверяет и исходники, и манифест: импорты, чтение process.env в трёх формах (точка, скобки, деструктуризация), список экспортов index.ts пакета"

key-files:
  created: []
  modified:
    - app/web/package.json
    - yarn.lock
    - app/web/.env.example
    - scripts/env-contract.config.json
    - packages/rbac/src/rbac.ts
    - packages/rbac/src/index.ts
    - packages/rbac/src/index.test.ts
    - scripts/check-rbac-dist.mjs
    - scripts/lib/e2e-web-env.mjs
    - scripts/lib/e2e-web-env.test.mjs
    - scripts/auth-no-role-string-checks.test.mjs
    - README.md
    - .github/workflows/ci.yml
    - scripts/check-ci-workflow.mjs
  deleted:
    - app/web/lib/auth/server/getMeData.ts
    - app/web/app/api/auth/me/route.ts
    - app/web/lib/env/server.ts

key-decisions:
  - "Решение исполнителя (автономно): buildWebEnv пустой строкой закрывает каждый ключ из app/web/.env*, которого нет в явном наборе, в том числе ключи, заданные в окружении раннера; значение из раннера в web не переносится"
  - "Решение исполнителя (автономно): assertWebEnvClosed больше не требует TEST_DATABASE_URL: он был нужен только для проверки равенства с DATABASE_URL web"
  - "Решение исполнителя (автономно): проверка SUPABASE_* в защите e2e не менялась (любое заданное значение, в том числе пустое, — нарушение), как было до плана"
  - "Решение исполнителя (автономно): по указанию оркестратора (squad C9) из шага CI «Build web» убраны DATABASE_URL и AUTH_JWT_SECRET; комментарий в check-ci-workflow.mjs про ci-build-secret приведён к факту (ci-smoke-secret)"
  - "Решение исполнителя (автономно): охранный тест web кроме правил плана ловит деструктуризацию DATABASE_URL/AUTH_JWT_SECRET из process.env, динамический import('pg'|'jsonwebtoken') и подпути 'jsonwebtoken/...'; проверяет манифест app/web/package.json; в packages/rbac/src запрещены идентификаторы buildPermissionSet и expand[A-Z]*"

requirements-completed: []
requirements-note: "AUTH-08, AUTH-12, AUTH-01 закрываются этим планом по коду; mark-complete не вызывался по правилу запуска"

duration: 9min
completed: 2026-10-04
---

# Phase 4 Plan 14: Удаление Next-дубликата авторизации, rbac как словарь, охранный тест D-21 и runbook выкатки Summary

**`app/web` больше не знает ни адреса базы, ни секрета JWT: `getMeData`, Next-маршрут `/api/auth/me`, `lib/env/server.ts` и зависимости `pg`/`jsonwebtoken` удалены, пример env и CI очищены, e2e закрывает эти ключи пустыми строками. `packages/rbac` стал словарём без `buildPermissionSet`. Охранный тест D-21 проверяет сервер, web и пакет. Выкатка D-24 описана и отложена на пользователя.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве (ветка `dev`).

## Performance

- **Duration:** около 9 мин по часам между первой записью и SUMMARY (без ожидания прогонов `yarn verify` и `yarn e2e`)
- **Started:** 2026-10-04T09:11:27Z
- **Completed:** 2026-10-04T09:20:00Z
- **Tasks:** 3/3 выполнены, Task 4 (`checkpoint:human-verify`, `gate="blocking-human"`) отложен
- **Files:** 17 путей в git (14 изменённых, 3 удалённых)

## Accomplishments

- **Task 1 (tracer).** Удалены `app/web/lib/auth/server/getMeData.ts`, `app/web/app/api/auth/me/route.ts`, `app/web/lib/env/server.ts` и опустевшие каталоги `lib/auth/server`, `app/api` (целиком), `lib/env`. Из `app/web/package.json` убраны `pg`, `jsonwebtoken`, `@types/pg`, `@types/jsonwebtoken`; `yarn install` удалил 4 строки из блока `@bio-exam/web@workspace` в `yarn.lock`, разрешения пакетов остались за сервером. `app/web/.env.example`: удалены разделы «База данных» и «Авторизация» (`DATABASE_URL`, `PG_*`, `AUTH_JWT_SECRET`, `NEXTAUTH_*`), шапка говорит, что web ходит только в Express по `API_ORIGIN`; `SESSION_COOKIE_NAME` перенесён в раздел «Сессия». У `app/web` в `scripts/env-contract.config.json` убран `zodFile`.
- **Task 2 (tdd).** `packages/rbac/src/rbac.ts`: удалены `expandDomainGrant`, `expandGrants`, `expandRole`, `buildPermissionSet` и ставший лишним импорт `./roles`; `can` и реэкспорт типов остались. `index.ts` экспортирует `{ can }`. `index.test.ts`: ровно 13 рантайм-имён (список без `buildPermissionSet`), `can` на явном наборе `users.read`. `check-rbac-dist.mjs`: эталон без `buildPermissionSet`, в шапке строка о фазе 4. `e2e-web-env.mjs`: `buildWebEnv(env, { webDir })` требует `SESSION_COOKIE_NAME`, `E2E_API_PORT`, `E2E_WEB_PORT`, задаёт `DATABASE_URL: ''`, `AUTH_JWT_SECRET: ''` и `''` для каждого ключа `webEnvFileKeys(webDir)` вне явного набора. `assertWebEnvClosed`: вместо проверок равенства с `TEST_DATABASE_URL`, защиты базы и маркера `e2e-only-` — `<KEY>: must be empty, app/web does not read it (ADR-0001)` для обоих ключей; `E2E_SECRET_MARKER`, `guardReason` и импорт `assertTestDatabaseUrl` удалены. `scripts/e2e.mjs` не менялся: он вызывает `buildWebEnv(childEnv)` с каталогом по умолчанию.
- **Task 3.** Охранный тест D-21 дополнен пятью тестами (детектор web на образцах, скан `app/web`, манифест web, детектор экспортов и разворота ролей, скан `packages/rbac`). README: `AUTH_JWT_SECRET` и `DATABASE_URL` только в `app/server/.env`, ключи базы и JWT из старого `app/web/.env` можно удалить. CI: шаг «Build web» с одним `API_ORIGIN`.

## codegraph impact (до удаления)

- `codegraph impact getMeData` → 4 символа: `getMeData` (`app/web/lib/auth/server/getMeData.ts:126`), `GET` и маршрут `GET /web/app/api/auth/me` (`app/web/app/api/auth/me/route.ts:8`), файл `route.ts`. Других вызывающих нет.
- `codegraph impact env` (`app/web/lib/env/server.ts:26`) → 2 символа: константа `env` и файл `getMeData.ts`. `codegraph node app/web/lib/env/server.ts`: used by 1 file — `getMeData.ts`.
- `codegraph impact buildPermissionSet` (`packages/rbac/src/rbac.ts:33`) → 7 символов: `getMeData` и его файл, `GET` маршрута и его файл, `packages/rbac/src/index.ts`, `index.test.ts`. Вызывающих в `app/server` нет: у сервера свой разворот в `services/access-policy/policy.ts` (`expandRole` с реестром параметром).
- После удаления: `codegraph impact getMeData` → `Symbol "getMeData" not found`.
- `yarn why pg` и `yarn why jsonwebtoken` (и их `@types`) после удаления: только `@bio-exam/server@workspace:app/server`. Транзитивно web их не тянет.

## codegraph affected

- По файлам этого плана → 6 тестовых файлов: `app/web/app/(internal)/(protected)/admin/tests/layout.tsx` (индекс относит его к тестам по пути), `app/web/lib/session/route-permissions.test.ts`, `packages/rbac/src/index.test.ts`, `scripts/auth-no-role-string-checks.test.mjs`, `scripts/check-ci-workflow.test.mjs`, `scripts/lib/e2e-web-env.test.mjs`.
- По всем 131 путям фазы 4 (`git diff --name-only bf332e6 HEAD` плюс рабочее дерево; существующие файлы) → 58 файлов: 16 серверных тестов (`auth-characterization`, `auth-known-defects`, `login-throttle`, `me-requirePerm-parity`, `refresh-rotation`, `session-revocation`, `access-routes`, `exam-flow`, `uploads`, `policy`, `progression`, `cookies`, `session-backfill`, `answer-keys-jsonb`, `timestamps`, `storage.local`), 10 web-тестов (`session-actions`, `access-token`, `client`, `keep-alive`, `login-errors`, `redirect`, `route-permissions`, `schedule`, `server`, `proxy.test.ts`), e2e (`auth.setup.ts`, `fixtures/exam.ts`, `playwright.config.ts`, `auth.spec.ts`, `authoring.spec.ts`, `review.spec.ts`, `session.spec.ts`), `packages/rbac/src/index.test.ts`, скриптовые тесты (`auth-no-role-string-checks`, `check-ci-workflow`, `check-migrations`, `e2e-web-env`) и клиентские файлы под путём `tests/`. Все прогнаны в `yarn verify` и полном `yarn e2e`.

## Поимённый список мест CONTEXT `<code_context>` (пункты 1-21)

| # | Место | Статус |
|---|---|---|
| 1 | `packages/rbac/src/rbac.ts:20-40` `buildPermissionSet` | Удалено (04-14). Пакет экспортирует 13 имён, охранный тест запрещает `buildPermissionSet` и `expand*` в `packages/rbac/src` |
| 2 | `app/server/src/services/rbac/rbac.ts:62-141` `buildPermissionSet`, `buildPermissionSetForUser`, кэши | Удалено: каталога `services/rbac` нет; алгоритм один — `services/access-policy/policy.ts` (04-04), кэшей нет |
| 3 | `app/server/src/routes/rbac/index.ts:91-134` эффективные права на месте | Стало вызовом модуля: `accessPolicy.accessFor(userId)`, `effective: Array.from(access.permissions)` |
| 4 | `app/web/lib/auth/server/getMeData.ts:126-216` | Удалено (04-14) |
| 5 | `app/server/src/routes/auth/me.ts:27-32` запасной набор | Удалено; `/api/auth/me` берёт права через `requestAccess` (04-04), `buildBasePermissionSet` в коде нет |
| 6 | `routes/tests/public.ts:152`, `:196`, `:303`, `:409` | Стало вызовом модуля: `hasPermission(..., 'tests.read')` (04-05) |
| 7 | `routes/settings.ts:25`, `:51` | Стало `requirePerm('settings', 'manage')` (04-05) |
| 8 | `services/search/database-search.ts:84` | Ветка роли удалена: `isPrivileged` смотрит только права `tests.write` / `groups.manage_groups` (04-05) |
| 9 | `middleware/auth/session.ts:99` объединение ролей БД и JWT | Удалено: роли только из `user_roles`, access-JWT без `roles` (04-05, 04-06) |
| 10 | `AuthGuard.tsx:61-63` обход `isAdmin` | Удалено (04-12); охранный тест запрещает `isAdmin` в `app/web` |
| 11 | `ProfileClient.tsx:109`, `profile/[id]/page.tsx:15`, `DashboardClient.tsx:181`, `admin/users/[id]/page.tsx:42` | Стало проверкой права: `users.edit`, `tests.manage_assignments`, `can('tests','read')`, `tests.manage_assignments` (04-12) |
| 12 | `admin/layout.tsx:4` `/admin/**` по `rbac.*` | Стало `requireSectionAccess('admin')` по карте `route-permissions.ts` (04-12) |
| — | `routes/tests/index.ts:2471`, `:2551` (`studentOnly`), `routes/rbac/index.ts:48`, `:74`, `:148` | Остались как поимённые исключения: `SERVER_EXCEPTIONS` охранного теста, 5 строк |
| 13 | `readCookie` ×3 (`session.ts`, `refresh.ts`, `logout.ts`) | Одна функция `services/session/cookies.ts:15`, маршруты её импортируют (04-06) |
| 14 | склейка Set-Cookie ×3, перезапись в `session.ts:40-59` | Стало `setSessionCookies` / `clearSessionCookies` модуля `services/session` (04-06) |
| 15 | выпуск JWT `login.ts`, `refresh.ts`, `test-support/http.ts` | Один `signAccessToken` в `services/session/tokens.ts`; `test-support/http.ts` выпускает настоящую сессию через `openSession` (04-06) |
| 16 | refresh с повтором `api-fetch.ts`, `fetchMe.ts`, `AuthProvider.tsx:70-84` | `lib/api-fetch.ts` реэкспортирует `apiFetch` модуля `lib/session/client`; `fetchMe.ts` нет; `AuthProvider` грузит `me` через `sessionClient.loadMe()`, голого `fetch` refresh нет (04-09, 04-10) |
| 17 | редирект на логин `proxy.ts`, `AuthGuard.tsx`, `loginRedirect.ts`, `safeRedirect` | Одна функция `buildLoginRedirect` в `lib/session/redirect.ts` (proxy и `AuthGuard`), `loginRedirect.ts` и `safeRedirect` удалены (04-09) |
| 18 | два `AuthProvider` | Один, в `AppLayout.tsx:36` с `initialMe` (04-10) |
| 19 | выход `nav-user.tsx:41`, `ProfileClient.tsx:213` | Оба вызывают общий `logout()` модуля (04-10) |
| 20 | Next-дубликат: `getMeData.ts`, `app/api/auth/me/route.ts`, `lib/env/server.ts`, `getServerMe.ts:25-26`, `pg`/`jsonwebtoken` в `package.json`, ключи в `.env.example` и `e2e-web-env.mjs` | Удалено: файлы и зависимости (04-14), `getServerMe` только через Express в `lib/session/server.ts` (04-11), ключи из примера удалены, в e2e они пустые строки и защита требует пустоту (04-14) |
| 21 | `login.ts:55-69` лимитер 5/мин, `login.ts:73-98` блокировка 30 мин, `loginRateLimiter`, `refresh.ts:30` | Удалено (04-06, 04-08): троттлинг в PostgreSQL `services/login-throttle`; `rateLimiter` остался только на смене пароля и приёме приглашения (не вход) |

## Task Commits

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

1. **Task 1 (tracer): удаление Next-дубликата и зависимостей web.** Tracer gate (`HUMAN_VERIFY_MODE` по умолчанию `end-of-phase`, `<verify>` только автоматический): typecheck и `vitest` web зелёные, сборка web по `buildCommand` с `DATABASE_URL=''` и `AUTH_JWT_SECRET=''` (перекрывают локальный `app/web/.env`) → exit 0, `yarn e2e --grep "@flow1|@session"` → `28 passed (19.8s)`. Tracer verified end-to-end — expanding.
2. **Task 2 (tdd): rbac без алгоритма прав, защита окружения web в e2e.**
3. **Task 3: охранный тест D-21, README, финальный прогон.**

## TDD Gate Compliance

- **rbac RED:** `index.test.ts` переписан до правки пакета → `Tests 2 failed | 1 passed (3)` (`экспортирует ровно 13 рантайм-имён`, `пакет не разворачивает роли в права`). GREEN после правки `rbac.ts`/`index.ts` → `3 passed`. Затем отдельный тест `'buildPermissionSet' in rbac` убран: его покрывает точный список 13 имён, а литерал в `packages/rbac/src` ломал приёмочную проверку `rg` плана. Итог — `Tests 2 passed (2)`.
- **check-rbac-dist RED:** сборка без правки эталона → `rbac dist FAILED: ESM: нет экспортов buildPermissionSet; CJS: …`. GREEN после правки эталона → `rbac dist OK: index.js, index.cjs, index.d.ts, index.d.cts; 13 экспортов в ESM и CJS`.
- **e2e-web-env RED:** тест переписан до модуля → `pass 14, fail 7`. GREEN → `pass 21, fail 0`.
- **Охранный тест, проверка мутацией:** временный `app/web/lib/zz-mutation.ts` (`import jwt from 'jsonwebtoken'`, `process.env.AUTH_JWT_SECRET`, `me.roles.includes('admin')`) и возврат `buildPermissionSet` в экспорт `index.ts` → `pass 6, fail 2`, все три строки файла названы с правилом. После удаления файла и возврата `index.ts` из копии → `pass 8, fail 0`.
- RED/GREEN-коммиты не делались по правилу пользователя.

## Verification

| Проверка | Итог |
|---|---|
| `yarn workspace @bio-exam/web typecheck && yarn workspace @bio-exam/web test` | exit 0; `Test Files 18 passed (18)`, `Tests 394 passed (394)` |
| сборка web по `buildCommand` (`API_ORIGIN`, `SESSION_COOKIE_NAME`, `NEXT_IGNORE_INCORRECT_LOCKFILE`, `NEXT_TELEMETRY_DISABLED`) | exit 0, `✓ Compiled successfully`, `ƒ Proxy (Middleware)`, `Failed to compile` и `Invalid server env` нет; повтор с `DATABASE_URL=''` и `AUTH_JWT_SECRET=''` (маскируют локальный `.env`) тоже exit 0 |
| `node scripts/check-env-contract.mjs && yarn install --immutable` | `check-env-contract: OK`, lockfile совпадает |
| проверка Task 1 | `web has no db and no jwt` |
| `yarn workspace @bio-exam/rbac test && … build && node scripts/check-rbac-dist.mjs` | `2 passed`, `rbac dist OK … 13 экспортов` |
| `node --test scripts/lib/e2e-web-env.test.mjs` | `pass 21`, `fail 0` |
| `rg -n "buildPermissionSet\|expandRole" packages/rbac/src` | ничего не находит |
| `node --test scripts/auth-no-role-string-checks.test.mjs` | `pass 8`, `fail 0` |
| `node scripts/check-ci-workflow.mjs`, `node --test scripts/check-ci-workflow.test.mjs` | `check-ci-workflow: OK`, `pass 31` |
| `yarn verify` | `yarn verify: OK`, все 8 шагов `passed`; web `394 passed`, server `423 passed`, exam-core `498 passed`, rbac `3 passed` (после прогона лишний тест убран, `2 passed`, `yarn format:check` зелёный), script-tests `147 pass` |
| `cd app/server && node vercel-build.cjs` | exit 0, `=== Build completed successfully! ===` |
| `yarn e2e` (полный) | exit 0, `Running 126 tests`, `126 passed (58.0s)`; `next-env-guard: OK` перед `next build` и перед `next start`. ✘ только у `D1 — fixed in Phase 5 (SCORE-03) … @known-defect` (`review.spec.ts:303`) на `chromium-desktop` и `chromium-mobile` (ожидаемый `test.fail`) |

`rg` по не тестовым исходникам `app/web`: импортов `pg`/`jsonwebtoken`, чтения `process.env.DATABASE_URL`/`AUTH_JWT_SECRET`, `isAdmin`, `roles.includes(`/`roles?.includes(`/`roles.some(` нет (0 совпадений до добавления правил охранного теста).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Устаревшие сгенерированные типы Next ссылались на удалённый маршрут**
- **Found during:** Task 1, `typecheck` и сборка web
- **Issue:** `tsc --noEmit` и `next build` падали на `.next/dev/types/validator.ts(314,39): error TS2307: Cannot find module '../../../app/api/auth/me/route.js'`. Файл сгенерировал прежний `next dev`, `tsconfig.json` включает `.next/**/types`. Каталог в `.gitignore`, на чистом checkout (CI, Vercel) его нет.
- **Fix:** удалён только сгенерированный каталог `app/web/.next/dev/types` (`next dev` создаёт его заново); `.next/types` пересоздала сборка.
- **Files modified:** нет файлов в git

**2. [Указание оркестратора, squad C9] CI «Build web» без `DATABASE_URL` и `AUTH_JWT_SECRET`**
- Файлы вне `files_modified`: `.github/workflows/ci.yml` (две строки env шага удалены), `scripts/check-ci-workflow.mjs` (существующий комментарий `ci-build-secret` → `ci-smoke-secret`, значение из шага smoke). Политика CI и её тест зелёные: шаг web проверяется только по `run: yarn workspace @bio-exam/web build`.

### Прочее

- `scripts/e2e.mjs` не менялся (`buildWebEnv(childEnv)` берёт каталог по умолчанию). При запуске `next start` Playwright кладёт `env` webServer поверх `process.env` раннера, поэтому `AUTH_JWT_SECRET: ''` перекрывает секрет Express раннера; защита на старте (`--check`) это подтверждает в полном e2e.
- В `e2e-web-env.test.mjs` сверх behavior: `TEST_DATABASE_URL` и `AUTH_JWT_SECRET` раннера не попадают в окружение web; отсутствие `DATABASE_URL`/`AUTH_JWT_SECRET` в окружении тоже нарушение. CLI `--check` на реальном `app/web` по-прежнему допускает оба исхода: `.env` разработчика с ключом `SUPABASE_*` даёт нарушение и при пустом значении, и строгая проверка связала бы `yarn verify` с локальным файлом.
- Существующие комментарии в изменённых файлах не трогались, кроме удалённого вместе с кодом комментария `lib/env/server.ts требует это имя до Phase 4` в `buildWebEnv` и шапок `e2e-web-env.mjs`/`check-rbac-dist.mjs`, которые план предписывает привести к факту. Новых комментариев в коде нет.
- Читающих Git-команд сверх `status`/`diff`/`log`/`rev-parse` не выполнялось, кроме одного случайного `git stash list` (только чтение, состояние не менялось) и `git rm --dry-run --cached` (сухой прогон, индекс не менялся).

## Threat Flags

Новой поверхности сверх `<threat_model>` нет. T-4-48: файлы и зависимости web удалены, ключи из примера и CI убраны, охранный тест D-21 запрещает их возврат. T-4-49: `getMeData` и `buildPermissionSet` удалены, тест запрещает их и проверки по ролям в web. T-4-50: в e2e значения обоих ключей пустые, тексты нарушений без значений (тест приманок). T-4-51, T-4-52: runbook ниже, `IP_TRUSTED` не менялся. T-4-SC: только удаление зависимостей, `yarn install --immutable` зелёный.

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель ничего не выполнял на проде, не коммитил, не пушил, не деплоил, не менял env в Vercel и ничего не одобрял.

### Runbook выкатки фазы 4 (Task 4, D-24)

Шаги строго по порядку, каждый следующий — после успеха предыдущего.

1. **Read-only на проде, до любых записей.**
   - `SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 3;` — последней должна быть 0020, `created_at = 1784985600000`. Иначе стоп и решение по истории до применения 0021.
   - `SELECT count(*) AS active_refresh, count(DISTINCT user_id) AS users FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > now();` — столько сессий создаст бэкфилл 0021.
   - `SELECT count(*) FROM users WHERE locked_until > now();` — эти блокировки при выкатке перестанут действовать.
   - `SELECT role_key, domain, action, allow FROM rbac_role_grants ORDER BY 1, 2, 3;` и `SELECT user_id, domain, action, allow FROM rbac_user_grants ORDER BY 1, 2, 3;` — переопределения, для которых меняется доступ.
2. **Env server-проекта Vercel (Production и Preview).** `ACCESS_TOKEN_EXPIRES_SEC` не задан или в диапазоне 60…3600 (иначе сервер не стартует). `AUTH_SESSION_ENFORCE_DB`, `RBAC_USE_DB_OVERRIDES`, `RBAC_DB_FAIL_OPEN`, `ADMIN_LOGIN`, `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD` больше не читаются (можно удалить). Выяснить, на какую базу смотрит `DATABASE_URL` server-проекта в среде Preview: прод или отдельная база.
3. **Коммиты.** Фазы 2 и 3 и планы 04-01…04-13 уже закоммичены оркестратором в `dev`; файлы 04-14 (список ниже) коммитит оркестратор или пользователь. Без push. Если по шагу 2 preview смотрит в прод, push откладывается до конца шага 4: push сразу поднимает preview-деплой ветки, а без 0021 новый server падает на первом входе (нет `auth_sessions`, `login_throttle`).
4. **Миграция 0021 на проде.** `yarn workspace @bio-exam/server drizzle:migrate` — до merge в master и, если preview смотрит в прод, до push ветки. 0021 аддитивна, текущий прод-код с ней работает. Повторно read-only: последней записью мигратора стала 0021; `SELECT count(*) FROM auth_sessions;` равно `active_refresh` из шага 1 (с поправкой на входы между шагами). Затем push ветки, PR в master, зелёный CI на HEAD; merge пока не делается. Если preview смотрит в отдельную базу, push, PR и CI можно сделать до миграции, но миграция на проде всё равно предшествует merge.
5. **Preview ветки** (вместе с отложенными preview фаз 2 и 3, `STATE.md` → Deferred Verification). Если preview смотрит в прод — проверки 429 и «Завершить все сеансы» / «Снять ограничение входа» только на тестовых учётках. Проверки:
   - вход;
   - refresh после истечения access (на preview `ACCESS_TOKEN_EXPIRES_SEC=60`);
   - выход и отклонение старого access;
   - D8: войти, удалить в DevTools cookie `bio_exam_session`, открыть `/profile/<логин>` — страница без `/login`, в ответе документа `Set-Cookie` с `bio_exam_session` (04-11);
   - ответ 429 на странице логина с обратным отсчётом;
   - кнопки блока «Сеансы и вход» в карточке пользователя;
   - визуально на 375px: подтверждение для логина длиной 32 символа (`«{login}»` переносится, у диалога нет горизонтального скролла, тост переносится); в блоке «Сеансы и вход» каждая кнопка на своей строке во всю ширину, подписи не обрезаны (04-13).
6. **Стоп-условие IP (D-12).** Какой IP видит Express для двух разных клиентов за rewrite web → server на preview. Только если адреса различаются и совпадают с реальными адресами клиентов, человек отдельной правкой включает `IP_TRUSTED` в `app/server/src/services/login-throttle/progression.ts` (тесты, коммит, редеплой server). Иначе константа остаётся `false` (потолок пары 60 с, корзины по IP нет). Для Milestone 2 (nginx) проверку повторить.
7. **Merge в master.** До merge web-проект Vercel настроен так, чтобы production-деплой web не стал активным сам: Ignored Build Step на коммит merge или отключённое автопродвижение с ручным Promote. Production-деплой server доходит до статуса Ready, вход на проде через старый web работает; только после этого — сборка или Promote production-деплоя web.
8. **После выкатки web.** Удалить `DATABASE_URL` и `AUTH_JWT_SECRET` из env web-проекта Vercel (CONTEXT `<specifics>` п. 11, beget-migration §3.4), проверить env server-проекта.
9. **Откат, если нужен.** В обратном порядке — сначала web, потом server, через Instant Rollback Vercel на предыдущий production-деплой, не пересборкой (после шага 8 старый web без `DATABASE_URL` и `AUTH_JWT_SECRET` не соберётся). Прежний код server смотрит только на `refresh_tokens.revoked_at` и принял бы токены, уже использованные при ротации, поэтому сразу перед Instant Rollback server на проде выполняется `UPDATE refresh_tokens SET revoked_at = used_at WHERE used_at IS NOT NULL AND revoked_at IS NULL;`, и тот же запрос — сразу после отката (ловит токены, захваченные в промежутке). Токены отозванных сессий уже несут `revoked_at` (04-06, 04-07). 0021 не откатывается: она аддитивна.
10. **Подтверждения решений, принятых автономно:** CONTEXT `<specifics>` п. 1-12 и пункты UI-SPEC с пометкой [авто] (сводка по планам ниже).

### Отложенные пункты планов 04-01…04-13

- **04-01, 04-02.** Коммит файлов планов (выполнен оркестратором, пользователю — просмотр).
- **04-03.** Read-only запросы `__drizzle_migrations` и `refresh_tokens` (runbook шаг 1); подтвердить D-09 — перенос действующих сессий без повторного входа (альтернатива — отозвать всё, все входят заново); база `DATABASE_URL` server-проекта в Preview (шаг 2). Применение 0021 — шаг 4.
- **04-04.** CONTEXT п. 10: `/api/auth/me` без запасного набора, fail-closed во всех средах (ошибка БД прав → 500 вместо базовых прав по ролям) — подтвердить.
- **04-05.** CONTEXT п. 9 (сервер): переопределения из `rbac_user_grants`/`rbac_role_grants` теперь влияют на тесты, настройки, поиск — read-only запросы шага 1. CONTEXT п. 11: `AUTH_SESSION_ENFORCE_DB`, `RBAC_USE_DB_OVERRIDES`, `RBAC_DB_FAIL_OPEN` не читаются. Fail-closed сессии: при ошибке БД любой запрос с cookie сессии получает 500 — подтвердить.
- **04-06.** CONTEXT п. 1: access 15 минут, `ACCESS_TOKEN_EXPIRES_SEC` только 60…3600 (шаг 2). CONTEXT п. 7: refresh без IP-лимита. Старые access без `sid` отклоняются, пользователей спасает refresh по старому токену. Решить, когда закрывать утечку cookie в логе ошибок (`deferred-items.md`, 04-06 и 04-07: `redact` в `pinoHttp`).
- **04-07.** CONTEXT п. 4: повтор refresh позже 30 с отзывает сессию; потеря ответа ротации ведёт к выходу примерно через 15 минут, в том числе посреди работы — нужно согласие на цену строгой ротации. CONTEXT п. 7: `accessExpiresAt` в ответах login, refresh, `/api/auth/me`; `POST /api/users/:id/sessions/revoke` под `users.edit`. CONTEXT п. 8: видимые последствия отзыва. CONTEXT п. 11: `ADMIN_LOGIN`, `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD` убрать из env server-проекта, если заданы.
- **04-08.** CONTEXT п. 5: троттлинг вместо блокировки (паузы пары 30–60 с при `IP_TRUSTED = false`, до 15 мин после включения; по логину до 60 с; 429 с `Retry-After`); read-only `locked_until` (шаг 1). CONTEXT п. 6: стоп-условие IP (шаг 6). CONTEXT п. 7: `DELETE /api/users/:id/login-throttle` под `users.edit` — подтвердить.
- **04-09.** Страница логина принимает только `callbackUrl` (`from`, `next`, `redirectTo`, `returnTo`, `redirect` не читаются): проверить `/login?next=/tests` при живой сессии → `/dashboard`, подтвердить, что внешних ссылок с этими параметрами нет. UI-SPEC «Поверхность 3» [авто]: при отказе refresh (401) полная навигация на логин, несохранённые данные форм теряются. `callbackUrl` кодируется через `URLSearchParams` (пробел как `+`).
- **04-10.** Выход: тост «Вы вышли из аккаунта» не виден после полной навигации, при сбое logout тоста ошибки нет — подтвердить. Проактивный refresh без лоадера и тоста: вкладка открыта 15+ минут, скрытая вкладка дольше срока access — без перехода на логин. Страница логина при `getServerMe() = null` показывает форму сразу.
- **04-11.** Preview D8 на Vercel (runbook шаг 5). UI-SPEC [авто]: ошибка базы прав на защищённой странице показывает `app/error.tsx` (`Something went wrong!`, `Try again`), а не логин; после редиректа proxy на `/login` баннера «сессия завершена» нет. CONTEXT п. 4 (потеря ответа ротации) — как в 04-07.
- **04-12.** CONTEXT п. 9 (web): гейты `/admin` и замены `isAdmin` меняют доступ только для переопределений; редактор аватара по `users.edit` — показывать ли его всем решает пользователь. UI-SPEC [авто]: «нет доступа» = существующая страница 404; при снятом праве `router.refresh()` и тот же 404; корень `/admin` для роли user — 404. `rbac.write` без `rbac.read` больше не открывает `/admin` и `/admin/settings/rbac` — подтвердить. Нерешённые состояния UI-SPEC: отзыв сессии посреди теста (`TestRunner` на голых `fetch` до Phase 8), потеря несохранённых данных формы при навигации на логин, карточки разделов `/admin` и ссылки дашборда не фильтруются по карте.
- **04-13.** UI-SPEC [авто]: высота кнопок 36px; web читает только заголовок `Retry-After`; тексты по коду ответа, `ERROR_MESSAGES` сервера не переводятся; `AlertDialog` для подтверждений; состояние ограничения входа не показывается; «Завершить все сеансы» выключена на своём аккаунте; блок в карточке пользователя, а не на `/profile/<логин>`; описание к успеху смены пароля. Backstop 375px — runbook шаг 5.
- **`deferred-items.md` фазы 4** (вне требований, решение пользователя): cookie в логе ошибок и в строке `refresh_replay` (04-06, 04-07); нет `public/img/not-found.png` (04-12); неиспользуемые переменные в `DashboardClient.tsx` (04-12); два `Toaster` — тосты двоятся (04-13, `app/web/app/layout.tsx` и `components/AppLayout/AppLayout.tsx`; этот план их не трогал).
- **04-14.** Удаление `DATABASE_URL` и `AUTH_JWT_SECRET` из env web-проекта Vercel (runbook шаг 8). Разработчикам: ключи `DATABASE_URL`, `PG_*`, `AUTH_JWT_SECRET`, `NEXTAUTH_*` в локальном `app/web/.env` больше не нужны (README). Каталог `app/web/.next/dev/types` удалён как устаревший; `next dev` создаст его заново.

## Файлы к коммиту

Изменённые:
- `.github/workflows/ci.yml`
- `README.md`
- `app/web/.env.example`
- `app/web/package.json`
- `yarn.lock`
- `packages/rbac/src/index.test.ts`
- `packages/rbac/src/index.ts`
- `packages/rbac/src/rbac.ts`
- `scripts/auth-no-role-string-checks.test.mjs`
- `scripts/check-ci-workflow.mjs`
- `scripts/check-rbac-dist.mjs`
- `scripts/env-contract.config.json`
- `scripts/lib/e2e-web-env.mjs`
- `scripts/lib/e2e-web-env.test.mjs`

Удалённые:
- `app/web/app/api/auth/me/route.ts`
- `app/web/lib/auth/server/getMeData.ts`
- `app/web/lib/env/server.ts`

Вне git (`.planning` в `.gitignore`): этот SUMMARY, `.planning/STATE.md`, `.planning/ROADMAP.md` (gsd-tools).

`git status --porcelain --untracked-files=all` показывает ровно эти 17 путей.

## Next Phase Readiness

- Phase 5 (ATT-01): правило «назначен или привилегирован» спрашивает модуль `access-policy`; `packages/rbac` отдаёт только словарь и `can`.
- Phase 7 (PRIV-01): после удаления `users.read` у роли `user` охранный тест и карта разделов не меняются.
- Phase 8 (HTTP-01…04): модуль запросов строится поверх `lib/session/client`.

## Self-Check: PASSED

- Удалённые файлы отсутствуют, проверка печатает `web has no db and no jwt`; `codegraph impact getMeData` → `not found`.
- `yarn verify: OK`, обе прод-сборки и `rbac dist OK`, полный `yarn e2e` `126 passed` (✘ только D1 `@known-defect`).
- Коммитов нет по правилу пользователя: `plan_head_before` = `plan_head_after` = `843cb67456a4cda3739e14e025d544cc6edf7461`, изменения в рабочем дереве.
