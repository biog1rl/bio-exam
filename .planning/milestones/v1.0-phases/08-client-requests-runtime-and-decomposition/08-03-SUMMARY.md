---
phase: 08-client-requests-runtime-and-decomposition
plan: 03
subsystem: api
tags: [routes, inventory, characterization, DECOMP-01, express]
status: complete

requires:
  - phase: 08-01
    provides: чистое дерево и команда снимка 08-plan-files.cjs
provides:
  - помощник nameMiddleware и детерминированные имена фабрик middleware
  - обход стека Express 4.22 (routeInventory, decodeMountPath, inventoryText, firstDifference)
  - команда yarn workspace @bio-exam/server routes:inventory [--check]
  - снимок app/server/route-inventory.txt (119 строк) и строгий тест снимка в yarn verify
  - характеризация регистрации и порядка /api/tests (45 тестов)
affects: [08-06, 08-26, 08-27]

actuals:
  tokens: 9342
  tasks: 3
  commits: 0
plan_head_before: cbc658212a0d262aa4aef13f5b1da08a28e5709a
plan_head_after: cbc658212a0d262aa4aef13f5b1da08a28e5709a

tech-stack:
  added: []
  patterns:
    - "Имя замыкания middleware: nameMiddleware(fn, name) через Object.defineProperty, тот же объект и та же арность"
    - "Инвентарь: обход app._router.stack в глубину; маршрут — строка на метод; вложенный роутер раскрывается с префиксом без своей строки; прочие слои — USE префикс имя"
    - "Путь монтирования восстанавливается из layer.regexp и layer.keys формы path-to-regexp 0.1; незнакомая форма — исключение с regexp.source"
    - "Склейка путей: префикс + путь, путь '/' под префиксом даёт сам префикс (router.get('/') под /api/tests печатается как GET /api/tests)"

key-files:
  created:
    - app/server/src/lib/middleware-name.ts
    - app/server/src/lib/route-inventory.ts
    - app/server/src/lib/route-inventory.test.ts
    - app/server/src/scripts/routes-inventory.ts
    - app/server/route-inventory.txt
    - app/server/src/routes/route-inventory.snapshot.test.ts
    - app/server/src/routes/tests/registration.characterization.test.ts
  modified:
    - app/server/src/middleware/auth/requirePerm.ts
    - app/server/src/middleware/auth/session.ts
    - app/server/src/middleware/validateParams.ts
    - app/server/src/middleware/rateLimiter.ts
    - app/server/package.json

key-decisions:
  - "Имя лимитера: rateLimiter(<keyPrefix или ->,<maxAttempts>/<windowMs>ms), два места вызова различаются префиксом"
  - "multer остаётся multerMiddleware: сторонняя фабрика, места вызова вне файлов плана"
  - "Внутренние слои Express (query, expressInit) и именованные слои app.ts (helmetMiddleware, result от pino-http, corsMiddleware, jsonParser) входят в снимок как есть"
  - "Метод маршрута без method (route.all) печатается как ALL; путь маршрута не строкой — исключение"
  - "Снимок и --check используют один формат inventoryText и одно сравнение firstDifference из lib/route-inventory.ts"
  - "Тест снимка импортирует app.ts напрямую (без scratch-базы и миграций): обход не делает запросов, пул только закрывается"
  - "В лимитере замыкание вынесено в const limiter, чтобы не переиндентировать тело (diff 4 строки вместо 80)"

duration: ~25min
completed: 2026-10-05
---

# Phase 8 Plan 03: инвентарь маршрутов и характеризация регистрации (DECOMP-01) Summary

Детерминированные имена фабрик middleware через `nameMiddleware`, обход стека Express 4.22 с восстановлением префиксов из `layer.regexp`, снимок всего `app.ts` в `app/server/route-inventory.txt` (119 строк) со строгим тестом в `yarn verify` и 45 тестов характеризации регистрации и порядка `/api/tests`.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве worktree `gsd/phase-08`.

## Что сделано

- Task 1 (tracer): `lib/middleware-name.ts`, имена в `requirePerm`, `requirePermKey`, `sessionOptional`, `sessionRequired`, `validateUUID`, `rateLimiter`; `lib/route-inventory.ts` с `decodeMountPath`, `routeInventory`, `inventoryText`, `firstDifference`; тест без базы `lib/route-inventory.test.ts` (сервисы доступа и сессии подменены `vi.mock`, чтобы импорт фабрик не тянул `db/index.ts`). Шлюз tracer: `<verify>` повторён после реализации — 5 passed, затем расширение.
- Task 2: `scripts/routes-inventory.ts` (отказ вне `isIsolatedEnv()` до динамического импорта `app.js`, запись или `--check`, `pgPool.end()`, явный `process.exit`), скрипт `routes:inventory` в `package.json`, снимок, `routes/route-inventory.snapshot.test.ts`.
- Task 3: `routes/tests/registration.characterization.test.ts` через `startAuthApp('test_registration')`; все строки зелёные на текущем коде с первого прогона, расхождений с ожидаемым поведением нет.

## Имена фабрик

| Фабрика | Имя |
|---------|-----|
| `requirePerm('tests','read')` | `requirePerm(tests.read)` |
| `requirePermKey('users.edit')` | `requirePermKey(users.edit)` |
| `validateUUID('testId')` / `validateUUID()` | `validateUUID(testId)` / `validateUUID(id)` |
| `sessionRequired()` | `sessionRequired` |
| `sessionOptional()` | `sessionOptional` |
| `rateLimiter({ maxAttempts: 5, windowMs: 60000, keyPrefix: 'invite-accept' })` | `rateLimiter(invite-accept,5/60000ms)` |
| `rateLimiter()` | `rateLimiter(-,5/60000ms)` |
| `upload.single('file')` (multer, не менялся) | `multerMiddleware` |

## codegraph impact (по индексу основного дерева: в worktree `.codegraph/` нет)

- `requirePerm`: 11 затронутых символов, 8 файлов маршрутов (`auth/invites`, `auth/index`, `docs/assets`, `routes/index`, `groups/index`, `rbac/index`, `settings`, `sidebar/index`) и далее.
- `requirePermKey`: 2 (сама функция и `auth/me-requirePerm-parity.test.ts`).
- `validateUUID`: 10 (`groups`, `routes/index`, `rbac`, `tests/assignments`, `tests/index`, `tests/public`, `users/index`, `users/login-throttle` и др.).
- `sessionRequired`: 18; `sessionOptional`: 20 (включая `app.ts`, `index.ts`).
- `rateLimiter`: 2 места вызова (`auth/invites.ts:236`, `users/profile.ts:132`), найдены поиском.
- Сигнатуры и логика фабрик не менялись; меняется только свойство `name` возвращаемой функции.

## codegraph affected

По файлам middleware, `app.ts`, `routes/index.ts`, `routes/tests/index.ts`: 74 файла, из них серверные тесты фаз 4-07.1 — `auth-characterization`, `auth-known-defects`, `login-throttle`, `me-requirePerm-parity`, `refresh-rotation`, `session-revocation`, `teacher-zone-*.matrix` (5), `docs/assets*`, `access-routes`, `attempt-*` (7), `exam-flow`, `question-content.characterization`, `question-relocation.characterization`, `uploads`, `users/*` (5), `services/access-policy/*`, `services/question-content/*`, `services/session/cookies`; web-клиенты админки тестов и e2e (`answer-durability`, `assets`, `auth`, `authoring`, `question-draft-durability`, `review`, `session`, `teacher-zone`). Новые файлы плана в индексе основного дерева отсутствуют. Все серверные тесты прошли в `yarn verify` без правок.

## Инвентарь

Генерация: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server routes:inventory`. Файл — 119 строк. Начало:

```
USE / query
USE / expressInit
USE / helmetMiddleware
USE / requestId
USE / result
USE / corsMiddleware
USE / jsonParser
USE / sessionOptional
GET /healthz  <anonymous>
GET /healthz/db  <anonymous>
```

- Все 40 маршрутов `routes/tests/index.ts` присутствуют (40 строк `/api/tests…` без `/public/` и `/:testId/assignments`).
- Порядок: `/api/users` → `/api/auth` → `/api/rbac` → `/api/search` → `/api/sidebar` → `/api/tests` (в том числе `/api/tests/:testId/assignments/...`) → `/api/tests/public/...` → `/api/settings` → `/api/groups` → `/api/docs/assets` → `USE / errorHandler`.
- `--check` на испорченном снимке: код 1, `line 50: expected "GET /api/tests/topics  sessionRequired > <anonymous>", got "GET /api/tests/topics  sessionRequired > requirePerm(tests.read) > <anonymous>"`; без `BIO_EXAM_ISOLATED_ENV=1` — отказ и код 1 до импорта приложения.

## Характеризация `/api/tests` (45 тестов, все зелёные)

- `GET /api/tests/topics` → 200 `{ topics }`; `GET /api/tests/not-a-uuid` → 400 `Invalid UUID format: id` (и без сессии тоже 400: `validateUUID` раньше `sessionRequired`); `GET /api/tests/public` → 400 от `GET /:id`.
- `GET /api/tests/public/tests` → 200 `{ tests }` публичного роутера.
- `/admin/dashboard`, `/admin/attempts`, `GET /:id` → 200.
- Вопросы: `PUT …/questions/reorder` `{questionIds: []}` → 400 с полем `questionIds`; с полным набором → 200 `{ ok: true }`; `PATCH …/questions/:questionId` `{}` → 400 с полем `type`; `PATCH …/questions/reorder` → 400 `Invalid UUID format: questionId`; `PUT …/questions/<uuid>` → 404.
- Монтирование: `GET /:testId/assignments` и `GET /:testId/question-drafts` → 200; `GET /not-a-uuid/assignments` → 400 `Invalid UUID format: testId`.
- 401 без сессии и 403 без права: темы, тесты, типы вопросов, правила баллов, дашборд, попытки — у `student` и у `admin` с deny `tests.read`; черновики, вопросы (reorder), ассеты, экспорт теста, назначения — у `student`; экспорт темы — 401 и 403 у `student`.

## TDD

- RED (Task 1): `vitest run src/lib/route-inventory.test.ts` — `Test Files 1 failed`, `Tests no tests`: модули `./middleware-name.js` и `./route-inventory.js` отсутствовали.
- GREEN: `Tests 5 passed (5)`.
- Тесты Task 2 и Task 3 — снимок и характеризация текущего поведения, по определению зелёные на текущем коде.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности: команда `routes:inventory` отказывает вне изолированного окружения (T-8-06), снимок с именами `requirePerm(...)` и характеризация 401/403 закрывают T-8-05.

## Проверки

- `yarn workspace @bio-exam/server vitest run src/lib/route-inventory.test.ts` — 5 passed.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server routes:inventory --check` — `routes:inventory --check: OK`.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/route-inventory.snapshot.test.ts` — 2 passed.
- Однострочник проверки снимка — `inventory ok 120`.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/registration.characterization.test.ts` — 45 passed.
- `yarn workspace @bio-exam/server typecheck` — без ошибок; `lint` — только старые предупреждения.
- `yarn verify` — `yarn verify: OK` (server 65 файлов тестов, web 52, exam-core 12, rbac 1).
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-03` — `08-03 changed only its files`.

## Файлы к коммиту

- app/server/package.json
- app/server/route-inventory.txt
- app/server/src/lib/middleware-name.ts
- app/server/src/lib/route-inventory.ts
- app/server/src/lib/route-inventory.test.ts
- app/server/src/middleware/auth/requirePerm.ts
- app/server/src/middleware/auth/session.ts
- app/server/src/middleware/rateLimiter.ts
- app/server/src/middleware/validateParams.ts
- app/server/src/routes/route-inventory.snapshot.test.ts
- app/server/src/routes/tests/registration.characterization.test.ts
- app/server/src/scripts/routes-inventory.ts
- .planning/phases/08-client-requests-runtime-and-decomposition/08-03-SUMMARY.md

## Передачи между планами

- 08-06 и любой план, меняющий маршрут или middleware в цепочке: перегенерировать `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server routes:inventory` и положить `git diff app/server/route-inventory.txt` в SUMMARY; иначе падает `route-inventory.snapshot.test.ts` в `yarn verify`.
- 08-26, 08-27 (нарезка): `routes:inventory --check` должен пройти без перегенерации (пустой diff). Новые суброутеры, смонтированные через `router.use('/префикс', sub)`, разворачиваются без своей строки; но `router.use(middleware)` внутри суброутера даёт новую строку `USE`, а смена порядка регистрации меняет порядок строк. Новые фабрики middleware именовать через `nameMiddleware` из `lib/middleware-name.ts`.
- Тест `route-inventory.snapshot.test.ts` проверяет порядок `/healthz` < `/api/users` < `/api/tests/topics` < `/api/tests/:id` < `/api/tests/:testId/assignments` < `/api/tests/public/tests` по точным строкам; при переименовании цепочек этих маршрутов правится и он.
- Нарезка 08-26/08-27: `GET /api/tests/public` (без второго сегмента) сейчас отвечает 400 от `validateUUID` маршрута `GET /:id` роутера тестов, потому что `/tests` смонтирован раньше `/tests/public`; перестановка `/:id` или монтирования `/tests/public` меняет этот ответ и роняет строку характеризации.
- Характеризация `registration.characterization.test.ts` — эталон 401/403 и порядка для нарезки; при нарезке не правится.

## Состояние планирования

- STATE.md, ROADMAP.md и REQUIREMENTS.md не менялись (как в 08-01 и 08-02): общий `.planning` у параллельных worktree, отметку DECOMP-01 и продвижение плана делает оркестратор.

## Deferred human verification

- Нет шагов пользователя. Коммит файлов плана делает ведущая сессия.

## Self-Check: PASSED
