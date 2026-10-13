---
phase: 08-client-requests-runtime-and-decomposition
plan: 26
subsystem: server/routes/tests (нарезка, часть 1)
tags: [DECOMP-02, D-29, D-31, ADR-0005, routes, decomposition]
status: complete
deferred_human_gate: false

requires:
  - phase: 08-03
    provides: routes:inventory --check, route-inventory.snapshot.test.ts, registration.characterization.test.ts
  - phase: 08-06
    provides: инвентарь охранного теста зон из 45 маршрутов
  - phase: 08-09
    provides: разбор попытки на readQuestionTexts (в отрезке части 2, не тронут)
  - phase: 08-17
    provides: обработчики экспорта prepare…Archive + sendArchive (в отрезке части 2, не тронуты)
provides:
  - routes/tests/admin/shared.ts — validateScoringRuleTemplateCompatibility, ensureGlobalScoringRules, syncQuestionPointsForTestByTypeConfig
  - routes/tests/admin/topics.ts — topicsRouter (6 маршрутов тем)
  - routes/tests/admin/tests-list.ts — testsListRouter (GET /)
  - routes/tests/admin/question-types.ts — questionTypesRouter (8 маршрутов, включая переопределения теста)
  - routes/tests/admin/scoring-rules.ts — scoringRulesRouter (4 маршрута)
  - routes/tests/admin/tests-by-slug.ts — testsBySlugRouter (GET /by-slug/:topicSlug/:testSlug)
  - routes/tests/admin/question-drafts.ts — questionDraftsRouter (5 маршрутов и помощники черновиков)
  - охранные тесты фаз 7 и 07.1 читают index.ts и файлы routes/tests/admin
affects: [08-27, 08-28]

actuals:
  tokens: 22000
  tasks: 3
  commits: 0
plan_head_before: c4db6660ffef408fdc657ee998b9bb5f675999fa
plan_head_after: c4db6660ffef408fdc657ee998b9bb5f675999fa

tech-stack:
  added: []
  patterns:
    - "Суброутер отрезка: файл с локальным `const router = Router()`, полные пути, `export { router as <имя>Router }`; в index.ts — `router.use(<имя>Router)` без префикса на исходном месте"
    - "Монтирование без префикса не даёт строки в инвентаре: walk раскрывает слой fast_slash с префиксом /api/tests"

key-files:
  created:
    - app/server/src/routes/tests/admin/shared.ts
    - app/server/src/routes/tests/admin/topics.ts
    - app/server/src/routes/tests/admin/tests-list.ts
    - app/server/src/routes/tests/admin/question-types.ts
    - app/server/src/routes/tests/admin/scoring-rules.ts
    - app/server/src/routes/tests/admin/tests-by-slug.ts
    - app/server/src/routes/tests/admin/question-drafts.ts
  modified:
    - app/server/src/routes/tests/index.ts
    - scripts/teacher-zone-guards.test.mjs
    - scripts/storage-no-private-access.test.mjs

key-decisions:
  - "Схемы zod остаются в своих суброутерах (каждая нужна одному отрезку); в shared.ts — три помощника, включая validateScoringRuleTemplateCompatibility, как требует must_haves (решение исполнителя, автономно)"
  - "Внутренние комментарии тел обработчиков перенесены дословно (2 в topics.ts, 1 в tests-list.ts); заголовки разделов и строки `// METHOD /api/tests/...` не перенесены (решение исполнителя, автономно)"
  - "Неиспользуемый импорт answerKeys в index.ts оставлен: он был до плана, его читает проба attempt-integrity-guards"

requirements-completed: []

duration: 45min
completed: 2026-10-05
---

# Phase 08 Plan 26: нарезка начального отрезка routes/tests/index.ts Summary

**Темы, список тестов, типы вопросов с переопределениями, правила баллов, by-slug и черновики вынесены дословно в семь файлов `routes/tests/admin/*.ts`. Суброутеры монтируются через `router.use(...)` на исходных местах. Инвентарь маршрутов совпадает байт в байт, `index.ts` сократился с 1759 до 635 строк.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Выполнено

- DECOMP-02 закрывается вместе с 08-27 (часть 2), поэтому `requirements-completed` пуст.
- Task 1 (tracer): `admin/shared.ts` и `admin/topics.ts`, в `index.ts` на месте тем стоит `router.use(topicsRouter)`. `routes:inventory --check` — OK, характеризация регистрации и снимок инвентаря — 2 файла, 47 тестов passed.
- Task 2: по одному отрезку в порядке регистрации — `tests-list.ts`, `question-types.ts`, `scoring-rules.ts`, `tests-by-slug.ts`, `question-drafts.ts`. После каждого файла — `tsc --noEmit` (0) и `routes:inventory --check` (OK, все шесть стадий). Затем из `index.ts` убраны ставшие лишними импорты; предупреждений lint сервера, как и до плана, 6, и все они были до плана.
- Порядок монтирования в `index.ts`: `topicsRouter`, `testsListRouter`, `questionTypesRouter`, `scoringRulesRouter`, `testsBySlugRouter`, `questionDraftsRouter`, затем без изменений `GET /:id` и всё остальное.
- Дословность проверена скриптом: в каждом суброутере текст от первой регистрации до `export {}` совпадает с исходным отрезком без строк `// ` с нулевым отступом. Локальные схемы и помощники совпадают с исходными строками. Тела функций в `shared.ts` такие же, к объявлению добавлен только `export`.
- `teacher-zone-guards.test.mjs`: в `ROUTE_FILES` шесть файлов суброутеров (`router: 'router'`, `mount: '/api/tests'`; `shared.ts` не входит, в нём нет регистраций). Записи `INVENTORY` перенесённых маршрутов указывают на новые файлы, `INVENTORY.length` = 45. Проба C7 подменяет регистрацию `PUT /topics/:id/teachers` в копии `admin/topics.ts`, и первая ожидаемая строка начинается с `app/server/src/routes/tests/admin/topics.ts: PUT /api/tests/topics/:id/teachers`.
- `storage-no-private-access.test.mjs`: `testsRouterSource()` склеивает `index.ts` и все не-тестовые файлы `routes/tests/admin/` по списку каталога (если файлов нет, тест падает). `registrations` и `scopeGateViolations` с прежней сигнатурой получают склеенный текст, поэтому порог «мало регистраций» считается по всем файлам вместе.

## Размер index.ts

| | строк |
|---|---|
| до (c4db666) | 1759 |
| после | 635 |
| admin/*.ts | 1179 (shared 73, topics 174, tests-list 55, question-types 426, scoring-rules 153, tests-by-slug 31, question-drafts 267) |

## codegraph

`codegraph impact` (индекс основного дерева, до плана):

- `ensureGlobalScoringRules` — `POST /save`, `PATCH /:id/settings` (остаются в index.ts), `GET /scoring-rules/global`, `GET`/`PUT /scoring-rules/tests/:id`. Используется больше чем в одном месте, поэтому лежит в `shared.ts`; `index.ts` импортирует его оттуда.
- `syncQuestionPointsForTestByTypeConfig` — `PATCH`/`DELETE /question-types/:key`, `PUT`/`DELETE /question-types/tests/:id/overrides/:key`, `PUT /scoring-rules/global`, `PUT /scoring-rules/tests/:id`. Используют два суброутера, поэтому лежит в `shared.ts`.
- `validateScoringRuleTemplateCompatibility` — только `PUT /question-types/tests/:id/overrides/:key`. Лежит в `shared.ts`, как требует must_haves.
- `normalizeQuestionDraftPayload`, `toQuestionDraftResponse` (а также `toQuestionDraftListItem`) — только маршруты черновиков, поэтому перенесены в `question-drafts.ts`.

`codegraph affected app/server/src/routes/tests/index.ts scripts/teacher-zone-guards.test.mjs scripts/storage-no-private-access.test.mjs` выводит 3 файла: `app/server/src/routes/tests/index.ts` (это не тест, codegraph относит его к тестам ошибочно, видимо из-за каталога `tests/`), `scripts/storage-no-private-access.test.mjs` (ожидаемый), `scripts/teacher-zone-guards.test.mjs` (ожидаемый). Новые файлы `admin/*.ts` в индекс основного дерева не попали. Маршрутные тесты codegraph не находит: `startAuthApp` загружает `app.js` динамическим `import()`, а его codegraph не прослеживает (на `app.ts` выдаёт «No test files affected»). Поэтому ожидаемый набор собран через `rg startAuthApp|app.js`: 46 тестовых файлов. Маршрутные (`src/routes`: характеризация регистрации, снимок инвентаря, `access-routes`, `teacher-zone-tests.matrix`, тесты попыток, экспорта, `exam-flow`) — 35 файлов, 925 тестов passed. Тесты `services/question-content`, `access-policy` и `storage` прошли в `yarn verify`. Неожиданных тестов нет.

## Инвентарь маршрутов

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server routes:inventory --check` — `routes:inventory --check: OK`. Проверка прошла после каждой из шести стадий и после чистки импортов.
- `git diff --stat -- app/server/route-inventory.txt` — пусто. Проверка `node -e …` из Task 3 печатает `inventory unchanged`.
- Снимок ни разу не перегенерировался: команда без `--check` не запускалась.

## Подмешанные нарушения

Временно правились реальные файлы: копии в scratchpad, правка, `node --test`, возврат копий, `cmp` подтвердил совпадение. Правки:
- `admin/topics.ts`: `requirePerm('tests', 'write')` в регистрации `PATCH /topics/:id`;
- `admin/question-drafts.ts`: `requirePerm('tests', 'write')` в регистрации `PATCH /:testId/question-drafts/:draftId`;
- `admin/scoring-rules.ts`: `canWriteTest(` → `probeCall(` в `PUT /scoring-rules/tests/:id`;
- `admin/tests-by-slug.ts`: `requirePerm('tests', 'read')` в регистрации `GET /by-slug/:topicSlug/:testSlug`.

Результат: 3 теста упали, 17 прошли.
- teacher-zone «маршруты инвентаря D-14…»: `admin/topics.ts: PATCH /api/tests/topics/:id (объектный маршрут): requirePerm( в регистрации…`, `admin/scoring-rules.ts: PUT /api/tests/scoring-rules/tests/:id (объектный маршрут): обработчик не вызывает canWriteTest(`, `admin/question-drafts.ts: PATCH /api/tests/:testId/question-drafts/:draftId (объектный маршрут): requirePerm( в регистрации…`.
- Встроенная проба teacher-zone увидела те же три лишние строки.
- storage «объектные маршруты routes/tests…»: `GET /by-slug/:topicSlug/:testSlug: requirePerm(`, `PATCH /topics/:id: requirePerm(`.

После возврата файлов: 33/33 pass (`teacher-zone-guards`, `storage-no-private-access`, `attempt-integrity-guards`).

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server routes:inventory --check` — OK.
- `… vitest run src/routes/tests/registration.characterization.test.ts src/routes/route-inventory.snapshot.test.ts` — 2 файла, 47 тестов passed.
- `node --test scripts/teacher-zone-guards.test.mjs scripts/storage-no-private-access.test.mjs scripts/attempt-integrity-guards.test.mjs` — pass 33, fail 0.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes` — 35 файлов, 925 тестов passed.
- `registration.characterization.test.ts` и тесты маршрутов не правились.
- `yarn verify` — `yarn verify: OK`. Тесты: server 1675, web 1430, exam-core 605, rbac 9 passed.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-26` — `08-26 changed only its files`.

## Deviations from Plan

- В `ROUTE_FILES` охранного теста зон добавлен и `admin/tests-by-slug.ts`, хотя в `INVENTORY` теста зон его маршрута нет. Так проверка «в файле есть регистрации» и копирование в пробе охватывают все файлы суброутеров. Набор проверок от этого только шире.
- Других отклонений нет: обработчики, пути и middleware не менялись, `public.ts` не тронут.

## Threat Flags

Нет: новых маршрутов, middleware и путей нет. T-8-60 закрыт инвентарём байт в байт после каждого файла, T-8-61 — обновлёнными охранными тестами и пробами на подмешанных нарушениях.

## Known Stubs

Нет.

## Deferred human verification

Шагов пользователя нет. Коммит файлов плана делает ведущая сессия.

## Передачи следующим планам

- 08-27: `index.ts` начинается с шести строк `router.use(<суброутер>)` подряд, за ними без изменений идут `GET /:id`, `POST /save`, `PATCH /:id/settings`, вопросы, `DELETE /:id`, ассеты, экспорт, `use /:testId/assignments`, дашборд и попытки. `ensureGlobalScoringRules` для `POST /save` и `PATCH /:id/settings` импортируется из `./admin/shared.js`.
- 08-27: в `index.ts` остался неиспользуемый импорт `answerKeys` (был до плана). Его видит проба `attempt-integrity-guards.test.mjs:400` (`copyWith(TESTS_ROUTES, 'const probeKeys = answerKeys')`). При переносе `/admin/attempts/:attemptId` надо перевести `TESTS_ROUTES` и `ADMIN_REVIEW_ROUTE` в `attempt-integrity-guards` на новый файл, а импорт убрать, если D-32 требует `index.ts` без `db`/`drizzle-orm`.
- 08-27: `teacher-zone-guards.test.mjs` — новые файлы суброутеров добавлять константой и строкой `ROUTE_FILES` (`router: 'router'`, `mount: '/api/tests'`), а файл записей `INVENTORY` для `/admin/attempts/:attemptId`, `/admin/dashboard`, `/admin/attempts` поменять на новый. Если в `index.ts` не останется регистраций `router.<метод>(`, убрать `TESTS_ROUTES` из `ROUTE_FILES`, иначе упадёт проверка «нет регистраций».
- 08-27: `storage-no-private-access.test.mjs` читает `index.ts` и все файлы `routes/tests/admin/` (`testsRouterSource()`). Суброутеры части 2, положенные в `admin/`, подхватятся сами. Если они лягут в другой каталог, его надо добавить в `testsRouterSource()`. Для `SCOPE_FUNCTIONS` (`canWriteTopic(`, `canReadTest(` и т.д.) достаточно вызова в любом из склеенных файлов.
- 08-27: способ нарезки — вырезать отрезки по номерам строк исходного `index.ts`, убирать только комментарии `// ` с нулевым отступом, затем сравнить текст суброутера от первой регистрации до `export {` с исходным отрезком; `routes:inventory --check` после каждого файла.

## Файлы к коммиту

- app/server/src/routes/tests/admin/shared.ts (новый)
- app/server/src/routes/tests/admin/topics.ts (новый)
- app/server/src/routes/tests/admin/tests-list.ts (новый)
- app/server/src/routes/tests/admin/question-types.ts (новый)
- app/server/src/routes/tests/admin/scoring-rules.ts (новый)
- app/server/src/routes/tests/admin/tests-by-slug.ts (новый)
- app/server/src/routes/tests/admin/question-drafts.ts (новый)
- app/server/src/routes/tests/index.ts
- scripts/teacher-zone-guards.test.mjs
- scripts/storage-no-private-access.test.mjs

## Self-Check: PASSED

Все 7 новых файлов на месте, 3 изменённых файла в списке плана, сверка `08-plan-files.cjs` прошла. Коммиты не выполнялись (правило пользователя).
