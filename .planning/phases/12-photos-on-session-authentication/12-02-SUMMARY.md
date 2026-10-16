---
phase: 12-photos-on-session-authentication
plan: 02
subsystem: api
tags: [express, routes, route-inventory, guards, uploads]

requires:
  - phase: 12-photos-on-session-authentication
    provides: "12-01: правки uploads.test.ts (поиск исходника аватара)"
provides:
  - "Маршрут POST /api/tests/:id/assets удалён: файла, монтирования, строки снимка и записей охранных тестов нет"
affects: [12-04]

actuals:
  tokens: 1500
  tasks: 2
  commits: "не закоммичено"

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - app/server/src/routes/tests/index.ts
    - app/server/src/routes/uploads.test.ts
    - app/server/src/routes/tests/registration.characterization.test.ts
    - app/server/src/routes/tests/teacher-zone-tests.matrix.test.ts
    - app/server/route-inventory.txt
    - scripts/tests-router-composition.test.mjs
    - scripts/teacher-zone-guards.test.mjs
    - scripts/storage-no-private-access.test.mjs
    - .agents/skills/bio-exam-api/SKILL.md
  deleted:
    - app/server/src/routes/tests/admin/assets.ts

key-decisions:
  - "D-04 выполнено после сверки: вызовов маршрута в app/web и e2e нет, записи в KNOWN_UNCALLED нет, единственный потребитель файла — routes/tests/index.ts"

requirements-completed: [DEBT-01]

coverage:
  - id: D1
    description: "Маршрута POST /api/tests/:id/assets нет в коде и в снимке инвентаря, охранные тесты согласованы"
    requirement: DEBT-01
    verification:
      - kind: integration
        ref: "node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/uploads.test.ts src/routes/route-inventory.snapshot.test.ts"
        status: pass
      - kind: other
        ref: "node --test scripts/tests-router-composition.test.mjs scripts/teacher-zone-guards.test.mjs scripts/storage-no-private-access.test.mjs scripts/check-docs-structure.test.mjs scripts/api-routes-have-callers.test.mjs"
        status: pass
      - kind: other
        ref: "yarn verify"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-16
status: complete
---

# Phase 12 Plan 02: Удаление мёртвого маршрута POST /api/tests/:id/assets Summary

**Маршрут записи в общую `images/` без вызывающих удалён вместе с монтированием, строкой снимка инвентаря, тестами и записями трёх охранных тестов; на один маршрут загрузки с отказом 500 меньше**

## Performance

- **Duration:** около 6 мин
- **Started:** 2026-10-16T11:19:00Z
- **Completed:** 2026-10-16T11:25:00Z
- **Tasks:** 2 из 2
- **Files modified:** 10 (1 удалён, 9 изменены)

## Сверка до удаления (D-04)

- `rg -n "/assets" app/web e2e --glob '!**/*.test.ts'`: в web только `ASSETS_PATH = '/api/docs/assets'` (`app/web/lib/assets/api.ts:11`) и импорты `@/lib/assets/*`; в e2e — `/api/docs/assets/proxy`. Поиск `/tests/…/assets` в `app/web` и `e2e` — пусто.
- `rg -n "tests/:id/assets" scripts/api-routes-have-callers.test.mjs` — пусто, записи в `KNOWN_UNCALLED` нет.
- `codegraph impact assetsRouter` — символ не найден по имени (экспорт `router as assetsRouter`); `codegraph impact "POST /:id/assets"` — 1 символ, только маршрут в `routes/tests/admin/assets.ts:39`. `rg -ln "admin/assets"`: `app/server/src/routes/tests/index.ts` и `scripts/teacher-zone-guards.test.mjs`.

Вызовов не найдено, STOP не понадобился.

## Accomplishments

- `app/server/src/routes/tests/admin/assets.ts` удалён (`rm`); из `routes/tests/index.ts` убраны импорт и `router.use(assetsRouter)`, порядок остальных строк прежний.
- `uploads.test.ts`: убраны элемент `ROUTES` `tests/assets`, блок `describe('POST /api/tests/:id/assets')`, `testId` и сид раздела и теста, а также `studentCookie` с сидом ученика (использовались только удалённым блоком).
- Снимок инвентаря перегенерирован (126 строк), разница — одна удалённая строка:
  ```
  -POST /api/tests/:id/assets  validateUUID(id) > sessionRequired > requireTestWrite > multerMiddleware > <anonymous>
  ```
- Охранные тесты: порог `exported.length >= 11`; `ASSET_ROUTES` и её запись в `ROUTE_FILES` убраны; пара `['post', '/:id/assets']` убрана из `SCOPED_ROUTES`. Навык `bio-exam-api` не перечисляет `assets.ts`.

## Task Commits

Не закоммичено (коммитит ведущая сессия).

1. **Task 1: маршрут удалён по цепочке** — не закоммичено
2. **Task 2: охранные тесты и навык** — не закоммичено

## Проверки

- Tracer: `uploads.test.ts` и `route-inventory.snapshot.test.ts` — 2 файла, 17 тестов, зелёные.
- `node --test` пяти охранных тестов: 39 из 39, `fail 0`.
- Первый `yarn verify`: `FAILED at lint-typecheck-test`, 4 падения в двух файлах вне списка плана (см. отклонение 1). После правки: эти два файла — 187 тестов, зелёные; повторный `yarn verify: OK` (server 2048, web 1649, exam-core 745, rbac 37; у сервера на 11 тестов меньше, чем после 12-03: 7 в `uploads.test.ts`, 2 в `registration.characterization.test.ts`, 2 в `teacher-zone-tests.matrix.test.ts`).
- Критерии приёмки: файла нет (`test -e` код 1); `tests/:id/assets` в снимке — 0; `exported.length >= 11` — 1; `admin/assets.ts` в `teacher-zone-guards` — 0; `'/:id/assets'` в `storage-no-private-access` — 0; разница снимка — одна строка `-`.
- `codegraph affected app/server/src/routes/tests/index.ts app/server/src/routes/uploads.test.ts`: `routes/tests/index.ts`, `routes/uploads.test.ts`.

## Files Created/Modified

- Удалён: `app/server/src/routes/tests/admin/assets.ts`.
- Изменены: `app/server/src/routes/tests/index.ts`, `app/server/src/routes/uploads.test.ts`, `app/server/src/routes/tests/registration.characterization.test.ts`, `app/server/src/routes/tests/teacher-zone-tests.matrix.test.ts`, `app/server/route-inventory.txt`, `scripts/tests-router-composition.test.mjs`, `scripts/teacher-zone-guards.test.mjs`, `scripts/storage-no-private-access.test.mjs`, `.agents/skills/bio-exam-api/SKILL.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ещё два теста вызывали удалённый маршрут**
- **Found during:** Task 2 (`yarn verify`)
- **Issue:** `registration.characterization.test.ts` (строка таблицы «ассеты»: 401 без сессии, 403 у ученика) и `teacher-zone-tests.matrix.test.ts` (`POST /api/tests/:tX/assets`: teacherA 400, teacherB 403) получали 404. В восьми точках касания плана их не было.
- **Fix:** строка «ассеты» и строка матрицы удалены; остальные ожидания не менялись.
- **Files modified:** `app/server/src/routes/tests/registration.characterization.test.ts`, `app/server/src/routes/tests/teacher-zone-tests.matrix.test.ts`
- **Verification:** оба файла 187/187, `yarn verify: OK`.

**2. Сид ученика в `uploads.test.ts`**
- После удаления блока `studentCookie` и сид ученика стали не нужны и удалены вместе с `testId` (план называл `testId` и связанный сид).

**Total deviations:** 1 исправление (Rule 3) и одна чистка по смыслу шага 3.
**Impact on plan:** цель D-04 не менялась.

## Issues Encountered

Нет, кроме отклонения 1.

## Не проверено

Ничего сверх `yarn verify`; e2e не запускался (план его не требует, вызовов маршрута в e2e нет).

## Next Phase Readiness

- 12-04: остались два маршрута загрузки с голым фильтром multer — `POST /api/docs/assets` и `POST /api/users/avatar`; в `uploads.test.ts` массив `ROUTES` теперь из двух элементов, ожидания 500 на `text/plain` и «File too large» прежние (их переписывает 12-04).

## Предлагаемое сообщение коммита

`refactor: Удалил мёртвый маршрут POST /api/tests/:id/assets: файл, монтирование, строка снимка маршрутов, его тесты и записи в охранных тестах и навыке`

---
*Phase: 12-photos-on-session-authentication*
*Completed: 2026-10-16*

## Self-Check: PASSED

- MISSING (ожидаемо): app/server/src/routes/tests/admin/assets.ts — удалён планом
- FOUND: app/server/route-inventory.txt без строки маршрута
- Коммиты: не закоммичено (по правилу)
