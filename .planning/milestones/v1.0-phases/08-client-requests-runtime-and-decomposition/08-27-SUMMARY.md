---
phase: 08-client-requests-runtime-and-decomposition
plan: 27
subsystem: server/routes/tests (нарезка, часть 2, точка сборки)
tags: [DECOMP-02, D-29, D-31, D-32, ADR-0005, routes, decomposition, guards]
status: complete
deferred_human_gate: false

requires:
  - phase: 08-26
    provides: admin/shared.ts и шесть суброутеров начального отрезка, способ нарезки, правки охранных тестов
  - phase: 08-03
    provides: routes:inventory --check, registration.characterization.test.ts, route-inventory.snapshot.test.ts
  - phase: 08-09
    provides: разбор попытки на readQuestionTexts и questionMarkdownCandidates
  - phase: 08-17
    provides: обработчики экспорта prepare…Archive + sendArchive из export-response.ts
provides:
  - routes/tests/admin/tests-core.ts — testsCoreRouter (GET /:id, POST /save, PATCH /:id/settings)
  - routes/tests/admin/questions.ts — questionsRouter (5 маршрутов вопросов)
  - routes/tests/admin/tests-delete.ts — testsDeleteRouter (DELETE /:id)
  - routes/tests/admin/assets.ts — assetsRouter (upload, requireTestWrite, POST /:id/assets)
  - routes/tests/admin/export.ts — exportRouter (GET /:id/export, GET /topics/:slug/export)
  - routes/tests/admin/attempts.ts — attemptsRouter (GET /admin/dashboard, GET /admin/attempts, GET /admin/attempts/:attemptId и помощники зоны)
  - routes/tests/index.ts — точка сборки из 39 строк
  - scripts/tests-router-composition.test.mjs — охранный тест точки сборки D-32
affects: [08-28]

actuals:
  tokens: 15000
  tasks: 3
  commits: 0
plan_head_before: 068ee8e
plan_head_after: 068ee8e

tech-stack:
  added: []
  patterns:
    - "Точка сборки routes/tests/index.ts: импорты суброутеров, Router(), router.use(...) по порядку, export default router; новый суброутер admin/*.ts без монтирования ловит tests-router-composition"

key-files:
  created:
    - app/server/src/routes/tests/admin/tests-core.ts
    - app/server/src/routes/tests/admin/questions.ts
    - app/server/src/routes/tests/admin/tests-delete.ts
    - app/server/src/routes/tests/admin/assets.ts
    - app/server/src/routes/tests/admin/export.ts
    - app/server/src/routes/tests/admin/attempts.ts
    - scripts/tests-router-composition.test.mjs
  modified:
    - app/server/src/routes/tests/index.ts
    - scripts/attempt-integrity-guards.test.mjs
    - scripts/teacher-zone-guards.test.mjs
    - .agents/skills/bio-exam-api/SKILL.md

key-decisions:
  - "Помощники studentAttemptsInScope, studentNameIn, isEmptyScope перенесены в attempts.ts, upload и requireTestWrite — в assets.ts: у каждого один потребитель; admin/shared.ts не менялся (решение исполнителя, автономно)"
  - "Шапка /** API роуты для управления тестами */ и комментарий // Admin: test-side assignment endpoints остались в index.ts: строки не переносились; внутренние комментарии тел (два в разборе попытки, // 5MB в multer) перенесены дословно; заголовки разделов и строки // METHOD /api/tests/... не перенесены, как в 08-26 (решение исполнителя, автономно)"
  - "Охранный тест точки сборки дополнительно проверяет, что каждый export { router as <имя> } из routes/tests/admin смонтирован в index.ts (решение исполнителя, автономно: набор проверок только шире)"
  - "storage-no-private-access.test.mjs, bio-exam-data/SKILL.md и AGENTS.md не правились: testsRouterSource() уже склеивает index.ts и все файлы admin/, навык данных и таблица Routing называют каталог, а не index.ts"

requirements-completed: [DECOMP-02]

duration: 25min
completed: 2026-10-05
---

# Phase 08 Plan 27: нарезка оставшегося отрезка routes/tests/index.ts и точка сборки Summary

**Ядро тестов, вопросы, удаление теста, загрузка картинок, ZIP-экспорт, а также дашборд, список и разбор попыток вынесены дословно в шесть файлов `routes/tests/admin/*.ts`. `routes/tests/index.ts` стал точкой сборки из 39 строк, её проверяет новый охранный тест. Инвентарь маршрутов совпадает байт в байт, охранные тесты фаз 5, 7 и 07.1 переведены на новые файлы и ловят подмешанные нарушения.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Выполнено

- Начало: `08-plan-files.cjs snapshot 08-27` (`fingerprint 08-27 0 paths`, дерево было чистым), копия исходного `index.ts` (635 строк) сохранена в scratchpad, `routes:inventory --check` до правок — OK.
- Task 1 (tracer): строки 392–633 исходного `index.ts` (три помощника зоны и три маршрута `/admin/...`) перенесены в `admin/attempts.ts`, в `index.ts` на их месте `router.use(attemptsRouter)` после `router.use('/:testId/assignments', assignmentsRouter)`. `tsc --noEmit` — 0, `routes:inventory --check` — OK. `attempt-integrity-guards.test.mjs`: константа `TESTS_ROUTES` заменена на `ADMIN_ATTEMPT_ROUTES = 'app/server/src/routes/tests/admin/attempts.ts'` в `adminReviewViolations` и в пробе `copyWith`, ожидаемый путь в пробе — `admin/attempts.ts`. 13/13 pass. Проверка тела по `ADMIN_REVIEW_ROUTE` и границе `\nrouter.` работает как раньше: разбор попытки — последний маршрут файла, строка пробы попадает в его тело.
- Task 2: по одному отрезку в порядке регистрации — `tests-core.ts` (строки 70–149), `questions.ts` (151–283), `tests-delete.ts` (285–300), `assets.ts` (302–350), `export.ts` (352–387, `/:id/export`, затем `/topics/:slug/export`). После каждого файла: `oxfmt`, проверка дословности, `tsc --noEmit` (0), `routes:inventory --check` (OK, все пять стадий). Затем `index.ts` переписан как точка сборки.
- Дословность проверена скриптом: для каждого отрезка текст исходных строк без строк `// ` с нулевым отступом (и без пустых строк) входит в текст суброутера целиком, включая помощники до первой регистрации (`upload`, `requireTestWrite`, `studentAttemptsInScope`, `studentNameIn`, `isEmptyScope`). Импорт в суброутерах — только используемые имена; `answerKeys` никуда не перенесён (он не использовался).
- `teacher-zone-guards.test.mjs`: константа `TESTS_ROUTES` и её строка `ROUTE_FILES` удалены (в `index.ts` нет регистраций), добавлены шесть констант суброутеров и строки `ROUTE_FILES` (`router: 'router'`, `mount: '/api/tests'`); записи `INVENTORY` для `/admin/attempts/:attemptId`, `/admin/dashboard`, `/admin/attempts` указывают на `admin/attempts.ts`. `INVENTORY.length` = 45.
- `storage-no-private-access.test.mjs` не правился: `testsRouterSource()` склеивает `index.ts` и все не-тестовые файлы `routes/tests/admin/`, новые файлы подхватились сами; правило `routesTests` обходит `routes/tests` рекурсивно. `EXCEPTIONS` пуст. Импорта `services/storage` нет ни в одном файле `routes/tests` (`assets.ts` импортирует `services/assets`, это разрешено, `export.ts` и `export-response.ts` — `services/question-content`).
- `scripts/tests-router-composition.test.mjs` (новый, 4 теста): в `index.ts` нет `router.get|post|put|patch|delete|all|options|head(`, импортов `../../db/index|schema`, `drizzle-orm`, `services/storage`, `services/question-content`; не больше 80 строк; есть `export default router`; каждый `export { router as <имя> }` из `routes/tests/admin` смонтирован через `router.use(<имя>)`. Две встроенные пробы на временных копиях: подмешанные четыре импорта и обработчик дают ровно 5 нарушений с номерами строк; удлинённая копия без `export default` и без `router.use(exportRouter)` даёт нарушения длины, экспорта и монтирования.
- Task 3: `bio-exam-api/SKILL.md` — строка о маршрутах попытки указывает на `admin/attempts.ts`, новый раздел «Маршруты тестов»: точка сборки и её охранный тест, список суброутеров, `shared.ts`, место монтирования назначений и `public.ts`, значимость порядка (`GET /:id` с `validateUUID` отвечает 400 на односегментный путь после него, подтверждено `registration.characterization.test.ts`), снимок `route-inventory.txt` и команда `routes:inventory`, доставка ZIP через `export-response.ts` поверх `streamArchive`/`archiveToBuffer`, ядро `services/storage/zip.ts`. Все пути существуют: `check-docs-structure` и `check-docs-commands` — 23/23 pass, `check-docs-commands: OK`.

## Размер index.ts

| | строк |
|---|---|
| до 08-26 (c4db666) | 1759 |
| до 08-27 (068ee8e) | 635 |
| после | 39 |
| новые admin/*.ts | 619 (attempts 250, questions 147, tests-core 92, assets 65, export 42, tests-delete 27) |

Предупреждений lint сервера стало 5 вместо 6: ушло неиспользуемое `answerKeys` из `index.ts`. Остальные пять были до плана.

## codegraph

CodeGraph не инициализирован в worktree; команды запускались по индексу основного дерева (код до 08-26), новые файлы `admin/*.ts` в индекс не попали.

`codegraph impact` до правок:

- `studentAttemptsInScope`, `studentNameIn`, `isEmptyScope` — только `GET /api/tests/admin/dashboard` и `GET /api/tests/admin/attempts`, файл `routes/tests/index.ts` и импортирующий его `routes/index.ts`. Единственный потребитель — отрезок попыток, поэтому помощники лежат в `attempts.ts`.
- `requireTestWrite` — только `routes/tests/index.ts` (маршрут `POST /:id/assets`), поэтому лежит в `assets.ts`.
- `upload` — три разных константы (`routes/docs/assets.ts`, `routes/users/avatar.ts`, `routes/tests/index.ts`); константа маршрутов тестов используется только в `POST /:id/assets`.
- Обработчик разбора попытки анонимный; его зависимости (`canReviewAttempt`, `readAdminAttemptView`, `readQuestionTexts`, `questionMarkdownCandidates`, `getQuestionTypeMapForTest`) не менялись, менялся только файл.

`codegraph affected` по файлам нарезки (`routes/tests/index.ts`, `admin/{attempts,tests-core,questions,tests-delete,assets,export,shared,topics}.ts`, четыре охранных теста) выводит 13 файлов:

- `scripts/attempt-integrity-guards.test.mjs`, `scripts/storage-no-private-access.test.mjs`, `scripts/teacher-zone-guards.test.mjs`, `scripts/tests-router-composition.test.mjs` — ожидаемые.
- `routes/tests/index.ts` и восемь `routes/tests/admin/*.ts` — не тесты: codegraph относит файлы каталога `tests/` к тестам и возвращает их же (как в 08-26).

Маршрутные тесты codegraph не находит: `startAuthApp` загружает `app.js` динамическим `import()`. Ожидаемый набор собран через `rg "startAuthApp|app.js'"` в `app/server/src/**/*.test.ts` — 48 файлов. Маршрутные и сервисные тесты (`vitest run src/routes src/services`, включая `registration.characterization.test.ts`, `route-inventory.snapshot.test.ts`, `access-routes`, `teacher-zone-tests.matrix`, тесты попыток, экспорта, `exam-flow`) — 63 файла, 1545 тестов passed. Неожиданных тестов нет.

## Инвентарь маршрутов

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server routes:inventory --check` — `routes:inventory --check: OK` до правок, после attempts.ts, после каждого из пяти файлов Task 2 и после переписанной точки сборки.
- `git diff --stat -- app/server/route-inventory.txt` — пусто. `git diff b19a400 -- app/server/route-inventory.txt` (коммит 08-06, строки D-11) — 0 строк: после D-11 снимок не менялся.
- Команда без `--check` не запускалась. `registration.characterization.test.ts` и тесты маршрутов не правились.

## Подмешанные нарушения

Временно правились реальные файлы: копии в scratchpad, правка, `node --test` четырёх охранных тестов, возврат копий, `cmp` подтвердил совпадение всех пяти файлов. Правки:

- `admin/attempts.ts`: `canReviewAttempt(req, attemptId)` → `probeCall(req, attemptId)` и строка `const probeKeys = answerKeys` в теле разбора;
- `admin/export.ts`: `requirePerm('tests', 'read')` в регистрации `GET /:id/export`;
- `admin/questions.ts`: `requirePerm('tests', 'write')` в регистрации `PUT /:id/questions/reorder`;
- `admin/assets.ts`: `import { storageService } from '../../../services/storage/index.js'`;
- `index.ts`: `router.get('/probe', (req, res) => res.json({}))` после `router.use(attemptsRouter)`.

Результат: 9 тестов упали, 28 прошли. Пойманы:

- attempt-integrity: `admin/attempts.ts:183: answerKeys в обработчике разбора…` и `admin/attempts.ts: обработчик '/admin/attempts/:attemptId' не вызывает canReviewAttempt(`;
- teacher-zone: `admin/attempts.ts: GET /api/tests/admin/attempts/:attemptId (объектный маршрут): обработчик не вызывает canReviewAttempt(` (и в основном тесте, и лишней строкой во встроенной пробе);
- storage: `admin/assets.ts:4: импорт services/storage в routes/tests`, `PUT /:id/questions/reorder: requirePerm(`, `GET /:id/export: requirePerm(`;
- tests-router-composition: `index.ts:38: регистрация обработчика router.<метод>(…`.

После возврата файлов: 37/37 pass (`tests-router-composition`, `teacher-zone-guards`, `storage-no-private-access`, `attempt-integrity-guards`).

## Проверки

- `routes:inventory --check` — OK (см. выше).
- `node --test scripts/tests-router-composition.test.mjs scripts/teacher-zone-guards.test.mjs scripts/storage-no-private-access.test.mjs scripts/attempt-integrity-guards.test.mjs` — pass 37, fail 0.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes src/services` — 63 файла, 1545 тестов passed.
- Проверка точки сборки `node -e …` из Task 2 — 39 строк, обработчиков нет.
- `node --test scripts/check-docs-structure.test.mjs scripts/check-docs-commands.test.mjs` — 23/23 pass.
- `yarn verify` — `yarn verify: OK`, все восемь шагов passed. Тесты: server 77 файлов / 1675, web 79 / 1430, exam-core 12 / 605, rbac 1 / 9 passed; script-tests pass 217, fail 0.
- `yarn e2e` — exit 0, `196 passed (1.6m)` (Playwright, chromium-desktop, изолированная база `test_e2e_*`).
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-27` — `08-27 changed only its files`.

## Deviations from Plan

- В `ROUTE_FILES` охранного теста зон добавлены все шесть новых файлов, хотя записи `INVENTORY` есть только у `admin/attempts.ts`. Так проверка «в файле есть регистрации» и копирование в пробе охватывают все суброутеры (как `tests-by-slug.ts` в 08-26).
- Охранный тест точки сборки проверяет и монтирование каждого суброутера `admin/` — сверх списка плана.
- Других отклонений нет: обработчики, пути и middleware не менялись, `public.ts`, `export-response.ts`, `admin/shared.ts` не тронуты.

## Threat Flags

Нет: новых маршрутов, middleware и путей нет. T-8-62 закрыт инвентарём байт в байт после каждого файла и характеризацией регистрации; T-8-63 — охранными тестами на новых файлах, пробами на подмешанных нарушениях и новым тестом точки сборки.

## Known Stubs

Нет.

## Deferred human verification

Шагов пользователя нет. Коммит файлов плана делает ведущая сессия.

## Передачи следующим планам

- 08-28: `routes/tests/index.ts` — точка сборки из 39 строк; порядок `router.use`: topics, tests-list, question-types, scoring-rules, tests-by-slug, question-drafts, tests-core, questions, tests-delete, assets, export, `/:testId/assignments`, attempts. Новый маршрут `/api/tests` добавляется в подходящий файл `routes/tests/admin/` или новым суброутером с `router.use` в `index.ts` (иначе падает `tests-router-composition`); маршрут, middleware или порядок меняются только с перегенерацией снимка `routes:inventory`.
- 08-28: экспорт — `admin/export.ts` (`prepare…Archive` + `sendArchive` из `export-response.ts`); разбор попытки — `admin/attempts.ts` (`readQuestionTexts`, `questionMarkdownCandidates(..., 'prompt.md')`). Повтор замеров `08-BENCHMARKS.md` код маршрутов не затрагивает.
- Все: охранный тест разбора попытки читает `admin/attempts.ts` (`ADMIN_ATTEMPT_ROUTES`); в `teacher-zone-guards.test.mjs` констант `TESTS_ROUTES` больше нет, файлы `/api/tests` перечислены поимённо — новый суброутер с маршрутом зоны добавляется туда константой, строкой `ROUTE_FILES` и записью `INVENTORY`.
- Все: `routes/tests/public.ts` не резался (Deferred фазы).

## Файлы к коммиту

- app/server/src/routes/tests/admin/tests-core.ts (новый)
- app/server/src/routes/tests/admin/questions.ts (новый)
- app/server/src/routes/tests/admin/tests-delete.ts (новый)
- app/server/src/routes/tests/admin/assets.ts (новый)
- app/server/src/routes/tests/admin/export.ts (новый)
- app/server/src/routes/tests/admin/attempts.ts (новый)
- app/server/src/routes/tests/index.ts
- scripts/tests-router-composition.test.mjs (новый)
- scripts/attempt-integrity-guards.test.mjs
- scripts/teacher-zone-guards.test.mjs
- .agents/skills/bio-exam-api/SKILL.md

## Self-Check: PASSED

Все 7 новых файлов на месте, 4 изменённых файла в списке плана, повторные `routes:inventory --check` (OK) и сверка `08-plan-files.cjs check 08-27` (`08-27 changed only its files`) после `yarn verify` и `yarn e2e` прошли. HEAD прежний (068ee8e), коммиты не выполнялись (правило пользователя).
