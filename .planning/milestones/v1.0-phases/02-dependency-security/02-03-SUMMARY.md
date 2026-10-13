---
phase: 02-dependency-security
plan: 03
subsystem: testing
tags: [playwright, e2e, next, proxy, middleware, security, characterization]

requires:
  - phase: 01-verification-baseline
    provides: "изолированный yarn e2e (одноразовая БД, сид, Express, next build + next start), проекты chromium-desktop/chromium-mobile"
  - phase: 02-dependency-security
    provides: "02-02: зелёные тесты загрузок и Sharp на текущих версиях"
provides:
  - "e2e/tests/proxy-protection.spec.ts: 34 API-теста Playwright @proxy (x2 проекта) на поведение app/web/proxy.ts до апгрейда Next"
  - "Таблица фактических статусов и Location proxy.ts на Next 16.2.1"
  - "sha256 спеки (сырой и нормализованный) для сверки в 02-06"
affects: [02-06, DEP-01, DEP-05]

actuals:
  tokens: 1284
  tasks: 2
  commits: 0

plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a

tech-stack:
  added: []
  patterns:
    - "API-запросы Playwright через фикстуру request без браузера и без storageState, maxRedirects: 0"
    - "Табличные тесты циклом по массивам вариантов, имена с подставленным путём"

key-files:
  created:
    - e2e/tests/proxy-protection.spec.ts
  modified: []

key-decisions:
  - "Обходов proxy.ts на Next 16.2.1 не найдено: test.fail в спеке нет, все 34 теста обычные"
  - "Формы /dashboard/ и //dashboard дают 308 на /dashboard (нормализация Next до proxy); тест проверяет второй шаг: 307 на /login?callbackUrl=/dashboard"
  - "//dashboard запрашивается абсолютным URL ${baseURL}//dashboard; что путь дошёл до Next сырым, подтверждено пробой: 308 совпадает с node:http с сырым path, а /dashboard даёт 307"
  - "Имена тестов на английском, как в существующих e2e/tests/*.spec.ts и как задано в плане"

patterns-established:
  - "Характеризационная матрица proxy: заголовки RSC/prefetch/subrequest, динамические сегменты, формы пути, публичные пути"

requirements-completed: []

coverage:
  - id: D1
    description: "Анонимный GET /dashboard получает 307 на /login?callbackUrl=/dashboard"
    requirement: DEP-05
    verification:
      - kind: e2e
        ref: "e2e/tests/proxy-protection.spec.ts#anonymous GET /dashboard redirects to /login with callbackUrl @proxy"
        status: pass
    human_judgment: false
  - id: D2
    description: "8 вариантов заголовков и query _rsc на /dashboard и /tests/biology/cell дают тот же 307 на /login"
    requirement: DEP-05
    verification:
      - kind: e2e
        ref: "yarn e2e --grep @proxy"
        status: pass
    human_judgment: false
  - id: D3
    description: "10 динамических маршрутов, 5 форм пути и шаблон, 2 публичных пути закреплены по факту"
    requirement: DEP-05
    verification:
      - kind: e2e
        ref: "yarn e2e --grep @proxy"
        status: pass
      - kind: e2e
        ref: "yarn e2e"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 03: Матрица защиты proxy.ts на Next 16.2.1 Summary

**34 API-теста Playwright `@proxy` без браузера закрепляют редирект `proxy.ts` на `/login` с `callbackUrl` для заголовков RSC/prefetch/`x-middleware-subrequest`, динамических сегментов и форм пути; обходов на Next 16.2.1 нет.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. `commits: 0` в frontmatter отражает это правило, а не незакоммиченную ошибку; `plan_head_before` и `plan_head_after` совпадают.

## Performance

- **Duration:** ~10 мин
- **Started:** 2026-10-03T14:45:23Z
- **Completed:** 2026-10-03T14:55:00Z
- **Tasks:** 2
- **Files modified:** 1 (новый)

## Accomplishments

- Срез (tracer): анонимный `GET /dashboard` -> 307, `Location: /login?callbackUrl=%2Fdashboard`. Зелёный в обоих проектах до расширения матрицы.
- Матрица: 1 + 16 (8 вариантов x 2 пути) + 10 + 5 + 2 = 34 теста на проект, 68 в двух проектах (+4 setup). `yarn e2e --grep @proxy`: 72 passed, код 0.
- Полный `yarn e2e`: 108 passed, 0 failed, код 0. Ожидаемо падающие D1, D2, D5 (`test.fail`) остались как были.
- `yarn verify`: `yarn verify: OK`.

## Фактические статусы на Next 16.2.1

Все запросы без cookie, `maxRedirects: 0`, к `next start` из `yarn e2e`. Тело ответа 307/308 — только текст Location (10–112 байт), контента страницы нет.

### Заголовки и query (пути `/dashboard` и `/tests/biology/cell`)

| Вариант | Статус | Location |
|---|---|---|
| без заголовков | 307 | `/login?callbackUrl=<путь>` |
| `RSC: 1` | 307 | `/login?callbackUrl=<путь>` |
| `RSC: 1` + `Next-Router-Prefetch: 1` | 307 | `/login?callbackUrl=<путь>` |
| `RSC: 1` + `Next-Router-Segment-Prefetch: /_tree` | 307 | `/login?callbackUrl=<путь>` |
| `RSC: 1` + `Next-Router-State-Tree: <encoded tree>` | 307 | `/login?callbackUrl=<путь>` |
| `Next-Url: /dashboard` | 307 | `/login?callbackUrl=<путь>` |
| `x-middleware-subrequest: proxy:proxy:proxy:proxy:proxy` | 307 | `/login?callbackUrl=<путь>` |
| `x-middleware-subrequest: middleware:middleware:middleware:middleware:middleware` | 307 | `/login?callbackUrl=<путь>` |
| query `?_rsc=abc` | 307 | `/login?callbackUrl=<путь>`: Next вычищает `_rsc` из `search`, в callbackUrl его нет |

`<путь>`: `%2Fdashboard` или `%2Ftests%2Fbiology%2Fcell`. Ответа-конверта с `x-nextjs-redirect` нет ни на одном варианте: RSC-запросы получают обычный 307.

### Динамические маршруты

| Путь | Статус | callbackUrl |
|---|---|---|
| `/tests/biology` | 307 | `/tests/biology` (страницы нет, proxy срабатывает раньше 404) |
| `/tests/biology/cell` | 307 | `/tests/biology/cell` |
| `/tests/biology/cell?attempt=1` | 307 | `/tests/biology/cell?attempt=1` |
| `/profile/00000000-0000-4000-8000-000000000001` | 307 | тот же путь |
| `/admin` | 307 | `/admin` |
| `/admin/users/<uuid>` | 307 | тот же путь |
| `/admin/attempts/<uuid>` | 307 | тот же путь |
| `/admin/tests/biology/cell/questions/<uuid>` | 307 | тот же путь |
| `/admin/tests/biology/cell/questions/drafts/<uuid>` | 307 | тот же путь |
| `/admin/tests/question-types/single_choice` | 307 | тот же путь |

### Формы пути и шаблон

| Запрос | Как отправлен | Шаг 1 | Шаг 2 (по Location) |
|---|---|---|---|
| `/dashboard/` | `request.get('/dashboard/')` | 308, `Location: /dashboard` | 307, `/login?callbackUrl=%2Fdashboard` |
| `//dashboard` | `request.get(\`${baseURL}//dashboard\`)` | 308, `Location: /dashboard` | 307, `/login?callbackUrl=%2Fdashboard` |
| `/%64ashboard` | `request.get('/%64ashboard')` | 307, `/login?callbackUrl=%2F%2564ashboard` (proxy видит `/%64ashboard` без декодирования) | — |
| `/DASHBOARD` | `request.get('/DASHBOARD')` | 307, `/login?callbackUrl=%2FDASHBOARD` | — |
| `/tests/%5BtopicSlug%5D/%5BtestSlug%5D` | `request.get(...)` | 307, `/login?callbackUrl=%2Ftests%2F%255BtopicSlug%255D%2F%255BtestSlug%255D` | — |

Двойной слэш: `APIRequestContext` с абсолютным URL `${baseURL}//dashboard` не схлопывает путь. Проба сравнила три запроса: `node:http` с сырым path `//dashboard` -> 308 на `/dashboard`; Playwright с абсолютным URL -> тот же 308; относительный `/dashboard` -> 307. Значит, `//dashboard` дошёл до Next как есть; `node:http` в спеке не нужен.

### Публичные пути

| Путь | Статус | Location |
|---|---|---|
| `/login` | 200 | нет |
| `/invite/some-token` | 200 | нет |

### Обходы

Обходов proxy на Next 16.2.1 не найдено: ни один вариант не отдал 2xx на защищённый путь. `test.fail` с пометкой «fixed in Group 2 (DEP-01)» в спеке нет; в 02-06 нечего переключать, матрица должна остаться зелёной на 16.3 без правок.

## Task Commits

1. **Task 1: Сквозной путь proxy (tracer)** — коммит не выполнялся (правило пользователя), изменения в рабочем дереве
2. **Task 2: Матрица заголовков, динамических параметров и форм пути** — коммит не выполнялся (правило пользователя), изменения в рабочем дереве

## Files Created/Modified

Готово к коммиту:

- `e2e/tests/proxy-protection.spec.ts` — новый: хелперы `expectLoginRedirect`, `expectNotServed`, `expectNormalizedToLogin`, массивы `HEADER_VARIANTS`, `DYNAMIC_ROUTES`, `PATH_FORMS_TO_LOGIN`, тег `@proxy`

Не изменены: `app/web/proxy.ts`, существующие спеки, untracked-файлы прошлых планов (sha256 сверены до и после: `app/web/lib/mdx/untrusted.test.ts`, `app/server/src/routes/uploads.test.ts`, `app/server/src/lib/sharp-runtime.test.ts`, `app/server/src/test-support/http.ts` — OK).

`git status --porcelain --untracked-files=all -- e2e app/web/proxy.ts` печатает ровно `?? e2e/tests/proxy-protection.spec.ts`.

## TDD (Task 2)

Спека характеризационная: поведение `proxy.ts` уже есть, правка кода не предполагалась, поэтому классического RED нет. Вместо него шла фаза обнаружения: временная проба `e2e/tests/zz-probe-0203.spec.ts` сняла статус, Location, `x-nextjs-redirect` и начало тела по всем вариантам (включая `node:http` с сырым path). После этого фактические значения закреплены в матрице (GREEN: 72 passed). Проба удалена до финальных проверок. RED/GREEN-коммиты не делались (правило пользователя).

## Decisions Made

- Обходов нет, поэтому все тесты обычные `test(`; форма `test.fail('<вариант> — fixed in Group 2 (DEP-01) @proxy @known-defect', …)` не понадобилась.
- 308 для `/dashboard/` и `//dashboard` не считается обходом: Location ведёт на `/dashboard`, а следующий шаг закреплён как 307 на `/login`.
- Статусы закреплены константами `LOGIN_REDIRECT_STATUS = 307` и `NORMALIZE_REDIRECT_STATUS = 308`: если 16.3 поменяет коды, 02-06 увидит это падением.
- Для `/invite/some-token` закреплён 200 без Location (строже, чем «не редирект на /login»).
- `requirements-completed: []` оставлен пустым намеренно: DEP-05 закрывается при верификации фазы, а не этим планом (указание оркестратора).

## Deviations from Plan

- **Имена тестов на английском.** В указаниях оркестратора было «имена тестов по-русски, как в существующих `e2e/tests/*.spec.ts`», но все существующие спеки и сам план используют английские имена; оставлены английские. Пометка « — fixed in Group 2 (DEP-01)» не понадобилась, поэтому на нормализацию 02-06 это не влияет.
- **Временная проба.** Для снятия фактических значений создавался и удалялся `e2e/tests/zz-probe-0203.spec.ts`; в рабочем дереве его нет.

**Total deviations:** 0 auto-fixed (Rules 1–3 не применялись).

## Issues Encountered

- Первая версия `expectNotServed` использовала `not.toBeGreaterThanOrEqual(200)`, что ошибочно отклоняло бы 3xx; до запуска заменено на проверку класса статуса `Math.floor(status / 100) !== 2`.

## User Setup Required

None — внешних сервисов нет.

## Next Phase Readiness

- 02-06 после апгрейда Next до 16.3 прогоняет `yarn e2e --grep @proxy` и сверяет спеку по хешам ниже. Так как `test.fail` нет, сырой и нормализованный хеши должны совпасть с записанными без изменений.
- Блокеров нет.

## sha256

```
9dece94752d11da7a1806745b35a6e411a3377cd020b8e68276cf11e5a13b7bf  e2e/tests/proxy-protection.spec.ts
d6db8482fe2f8aca8fadc5f89e2be8ffe745c7ce226ec8c4a9c53b7d439ad55b  e2e/tests/proxy-protection.spec.ts#normalized
```

## Self-Check: PASSED

- FOUND: `e2e/tests/proxy-protection.spec.ts`
- Проверка плана по sha256: `sha256 recorded`; матрица: `proxy matrix ok`
- Коммитов нет по правилу пользователя, сверять нечего

---
*Phase: 02-dependency-security*
*Completed: 2026-10-03*
