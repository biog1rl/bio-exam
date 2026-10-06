---
phase: 04-authentication-and-web-session
plan: 02
subsystem: testing
tags: [playwright, e2e, session, known-defects, d8, d3]
status: complete
deferred_human_gate: true

requires:
  - phase: 02-dependency-security
    provides: "e2e/tests/proxy-protection.spec.ts (матрица @proxy)"
  - phase: 01-verification-baseline
    provides: "yarn e2e, e2e/fixtures/accounts.ts (loginAccount, sessionAccount, E2E_PASSWORD), e2e/fixtures/exam.ts (studentPage, projectKey)"
provides:
  - "e2e/tests/session.spec.ts: помощник loginContext(browser, testInfo, role) — вход через POST /api/auth/login аккаунтом login-<роль>-<проект> в отдельном контексте без storageState"
  - "Три ожидаемых падения @known-defect: D8 (AUTH-11), D3 (AUTH-10), старый access после выхода (AUTH-04), у каждого отдельный тест подготовки"
  - "Обычный тест: роль user на /admin/users не видит заголовок «Пользователи» и таблицу"
affects: [04-06, 04-10, 04-11, 04-12]

actuals:
  tokens: 1320
  tasks: 2
  commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a

tech-stack:
  added: []
  patterns:
    - "Проверка известного дефекта в e2e: test.describe.serial, подготовка обычным тестом, в test.fail одно составное утверждение expect({...}).toEqual({...}), чтобы сообщение показывало фактические значения"
    - "Сценарии, которые вращают refresh или завершают сессию, входят через API своим аккаунтом login-<роль>-<проект>; общий storageState не трогают"

key-files:
  created:
    - e2e/tests/session.spec.ts
  modified: []

key-decisions:
  - "loginContext не ставит init-скрипт auth_refresh_cookie_migrated_v2 (в отличие от newSessionContext): D3 измеряется на свежем браузере, где срабатывают и /api/auth/me, и миграционный /api/auth/refresh"
  - "Пустая деструктуризация ({}, testInfo) заменена на test.info(): в спеке нет комментариев, а oxlint no-empty-pattern в соседнем auth.spec.ts глушится комментарием"

patterns-established:
  - "План, который чинит дефект, меняет test.fail на test в session.spec.ts; тело проверки не меняется"

requirements-completed: []

duration: 7min
completed: 2026-10-04
---

# Phase 4 Plan 02: e2e-регрессии сессии (D8, D3, AUTH-04, /admin/users) Summary

**D8 впервые воспроизведён в браузере: серверная страница `/profile/<логин>` с удалённым `bio_exam_session` и живым `refresh_token` проходит через навигацию на `/login?callbackUrl=…`. D3 и «старый access после выхода» закреплены как `test.fail` с `@known-defect`; роль `user` не видит раздел `/admin/users`.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** ~7 мин
- **Started:** 2026-10-04T06:28:06Z
- **Completed:** 2026-10-04T06:35:00Z
- **Tasks:** 2/2
- **Files created:** 1

## Accomplishments

- `loginContext`: контекст с `baseURL` и параметрами устройства проекта, без `storageState`; вход через `context.request.post('/api/auth/login')`, проверка статуса 200.
- D8 (tracer): подготовка passed, проверка — expected failure на обоих проектах. Tracer-гейт: `yarn e2e --grep D8` прогнан до расширения (`8 passed`, проверки D8 отмечены `✘` как ожидаемые падения).
- D3, AUTH-04: подготовки passed, проверки — expected failure на обоих проектах.
- `/admin/users` для роли `user`: passed на обоих проектах (фикстура `studentPage`, общий storageState).
- `yarn e2e` полностью: код 0, `122 passed`; ожидаемо падают только `@known-defect` (D1 и три новых, на каждом проекте).
- `yarn verify: OK`.

## Task Commits

Коммиты не выполнялись (правило пользователя), изменения в рабочем дереве:

1. **Task 1 (tracer): D8.**
2. **Task 2: D3, AUTH-04, /admin/users.**

## Файлы к коммиту

- `e2e/tests/session.spec.ts` (новый)

`.planning/commit-snapshots/before-04-02/fingerprint.json` и этот SUMMARY лежат в `.planning/`, который игнорируется git.

## Первое воспроизведение D8: навигации главного фрейма

Проба: временная замена `test.fail` на `test`, прогон `yarn e2e --grep "@session"`, затем файл восстановлен из копии (sha1 `b4b6b712…` до и после совпадает).

chromium-desktop, `/profile/student-desktop`:

```
http://127.0.0.1:64333/profile/student-desktop
-> http://127.0.0.1:64333/profile/student-desktop
-> http://127.0.0.1:64333/login?callbackUrl=%2Fprofile%2Fstudent-desktop
-> http://127.0.0.1:64333/profile/student-desktop
```

chromium-mobile, `/profile/student-mobile`: та же последовательность.

Итоговый путь — `/profile/<логин>`: после `/login` браузер возвращается на страницу. Утверждение падает на промежуточной навигации на `/login`: `navigations: ["…/login?callbackUrl=%2Fprofile%2Fstudent-<проект>"]` при ожидании `[]`. Это и есть D8 из CONTEXT (D-19, «по отчёту» в `STATE.md`): расхождения с описанием нет, пользователь видит переход через форму входа. Порт в URL — порт web конкретного прогона.

## D3: фактические счётчики на загрузке `/dashboard`

Та же проба, свежий контекст после входа через API (ключа миграции в `localStorage` нет):

| Проект | `/api/auth/me` | `/api/auth/refresh` |
|---|---|---|
| chromium-desktop | 2 | 2 |
| chromium-mobile | 2 | 1 |

Число refresh-запросов между прогонами может отличаться (эффект миграции cookie в `AuthProvider` срабатывает один или два раза); утверждение `{ me: 0, refresh: 0 }` падает в любом случае.

## AUTH-04: статус после выхода

`POST /api/auth/logout` → 200; затем `GET /api/auth/me` только со старым `bio_exam_session` (подставлен через `addCookies`) → **200** при ожидании 401, на обоих проектах. Совпадает с серверной проверкой `AUTH-04-logout` из 04-01.

## /admin/users для роли user

URL остаётся `/admin/users`, заголовка `Пользователи` и `table` нет (count 0): `AuthGuard` с `requireAny={['rbac.read','rbac.write']}` отдаёт `fallback = null`. Текст `PAGE NOT FOUND` не проверяется: вид 404 добавляет 04-12.

## Сводки Playwright

- `yarn e2e --grep "D8"`: код 0, `8 passed` (4 setup + 2 подготовки + 2 ожидаемых падения).
- Проба `yarn e2e --grep "@session"` с `test` вместо `test.fail`: `6 failed`, `12 passed` — каждая из трёх проверок на каждом проекте краснеет на утверждении о правильном поведении.
- `yarn e2e --grep "@session|@proxy|@flow1"`: код 0, `92 passed`, 6 строк `✘` — только три новые проверки на двух проектах.
- `yarn e2e`: код 0, `122 passed`, 8 строк `✘` — D1 (`review.spec.ts:303`) и D8, D3, AUTH-04 на двух проектах.
- `yarn verify: OK`.
- Проверка формы спека: `session spec: 3 known defects`.
- Сверка с отпечатком: `04-02 changed only its files`.

## codegraph (D-22)

- `codegraph impact getServerMe` — 15 символов: `isAuthenticated` (`lib/auth/getServerMe.ts`), `ProfileByIdPage` (`profile/[id]/page.tsx`), `AdminUserPageRedirect` (`admin/users/[id]/page.tsx`), `ProfilePage` (`profile/page.tsx`), `AppLayout` (`components/AppLayout/AppLayout.tsx`), `RootLayout` (`app/layout.tsx`).
- `codegraph impact proxy` — 1 символ: `proxy` (`app/web/proxy.ts`), вызывающих в индексе нет (точка входа Next).
- `codegraph affected e2e/tests/session.spec.ts` — 1 файл: `e2e/tests/session.spec.ts`.

## Deviations from Plan

### Решения исполнителя (автономно)

**1. Пустая деструктуризация заменена на `test.info()`**
- **Found during:** Task 1
- **Issue:** `async ({}, testInfo)` нарушает `no-empty-pattern`; в `auth.spec.ts` правило глушится комментарием, а комментарии в коде запрещены правилом пользователя.
- **Fix:** проверки D8 и AUTH-04 берут `test.info()`, как `review.spec.ts`.
- **Files modified:** `e2e/tests/session.spec.ts`

**2. Без init-скрипта ключа миграции в `loginContext`**
- План описывает `loginContext` «как `newSessionContext`, но без `storageState`»; init-скрипт `auth_refresh_cookie_migrated_v2` не перенесён, чтобы D3 видел поведение свежего браузера. На результат D8 и AUTH-04 это не влияет.

**3. Корневая защита**
- Запуск `root-pin.sh` отклонён правами; заменён проверкой `git rev-parse --show-toplevel` = `/Users/kdvornichenko/bio-exam`, запись только по абсолютным путям внутри корня (предусмотрено правилами исполнения).

Иначе план выполнен как написан. Код приложения, сид, конфигурация Playwright и существующие спеки не менялись.

## Known Stubs

Нет.

## Deferred human verification

- Коммит `e2e/tests/session.spec.ts` делает пользователь. Не выполнено, ждёт пользователя; исполнитель не одобрял.

## Self-Check: PASSED

- FOUND: `e2e/tests/session.spec.ts`
- FOUND: `.planning/commit-snapshots/before-04-02/fingerprint.json`
- Коммитов нет по правилу пользователя; `HEAD` до и после — `7a6f95a`.
