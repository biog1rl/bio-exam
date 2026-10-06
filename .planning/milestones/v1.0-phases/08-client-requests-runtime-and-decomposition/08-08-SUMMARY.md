---
phase: 08-client-requests-runtime-and-decomposition
plan: 08
subsystem: server-search
tags: [search, perf-01, promise-all, characterization, vitest]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-client-requests-runtime-and-decomposition
    provides: "08-02: замер «до» поиска — 5 запросов на вызов, максимум 1 одновременный у обоих доступов"
provides:
  - характеризация выдачи GET /api/search по семи профилям мира 07.1 и двум запросам
  - шов исполнителя запроса SearchExecutor (по умолчанию pgPool.query) в searchDatabase
  - параллельные категории поиска через Promise.all с фиксированным порядком
affects: [08-28]

actuals:
  tokens: 4774
  tasks: 3
  commits: 0
plan_head_before: e3165c9f7f8489ddceb7e9c0d0f2f92d68e77948
plan_head_after: e3165c9f7f8489ddceb7e9c0d0f2f92d68e77948

tech-stack:
  added: []
  patterns:
    - "Шов исполнителя SQL: необязательный executor в параметрах сервиса, по умолчанию стрелка с поздним обращением к pgPool.query (инструментирование пула в bench продолжает работать)"
    - "Характеризация выдачи: id ответа переводятся в ключи мира `<type>:<key>` с сохранением порядка выдачи, ожидаемое — литерал, снятый прогоном на исходном коде"

key-files:
  created:
    - app/server/src/routes/search-results.characterization.test.ts
    - app/server/src/services/search/database-search.test.ts
  modified:
    - app/server/src/services/search/database-search.ts

key-decisions:
  - "Запросы характеризации: строка вопроса мира «половая клетка» и фамилия ученика s1 `Фамилия ${prefix} s1` (решение исполнителя (автономно): s1 состоит в группе учителя A и в группе без владельца, поэтому запрос задевает пользователей, группы и попытки всех профилей)"
  - "Характеризация берёт только элементы мира (ключи `<type>:<key>`), limit=25, scope=all; префиксы своей базы `test_search_char` и мира `srchchr`, отличные от матрицы"
  - "Категория в тесте шва определяется по тексту SQL (`from question_search_documents`, `from users u`, `from student_groups sg`, `from test_attempts ta`, иначе tests); задержки — LCG с зерном 20260805, 20 прогонов"
  - "Отдельного ограничителя параллельности нет: потолок — число доступных категорий (≤ 5), как в D-20"

requirements-completed: [PERF-01, PERF-05]

duration: 25min
completed: 2026-10-05
---

# Phase 8 Plan 08: Параллельные категории глобального поиска Summary

**`searchDatabase` запускает доступные категории через `Promise.all` и собирает `categories` по индексу в порядке tests, questions, users, groups, attempts; шов `SearchExecutor` показывает одновременность по числу доступных категорий, характеризация выдачи по семи профилям мира 07.1 совпадает до и после.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-10-05
- **Tasks:** 3/3
- **Files modified:** 3 (1 изменён, 2 созданы)

## Accomplishments

- Характеризация `search-results.characterization.test.ts`: 7 профилей (admin, teacherA, teacherB, s1, readTests, readUsers, adminNoZone) × 2 запроса = 14 тестов; для каждой категории `[scope, available, ключи элементов мира в порядке выдачи]` и `total` = сумма элементов.
- Шов: `export type SearchExecutor = (sqlText: string, values: unknown[]) => Promise<{ rows: RawSearchRow[] }>`, `SearchParams.executor?`, `defaultExecutor = (sqlText, values) => pgPool.query<RawSearchRow>(sqlText, values)`; `queryRows` и пять функций категорий получают исполнитель параметром. Тексты SQL и массивы значений не изменились (сверка строк SQL с копией исходного файла — без различий).
- `searchDatabase`: цикл с `await` заменён на `await Promise.all(scopes.map(async (scope) => …))`; `available` и условие `query.length >= 2` вычисляются внутри каждой категории, недоступные категории не вызывают исполнитель и остаются с `available: false`; ошибка любой категории отклоняет весь вызов (маршрут отдаёт 500 через `next(error)`); `total` считается как раньше.

## Task Commits

Коммиты не выполнялись (правило пользователя). Порядок TDD соблюдён по сути:

1. **Task 1 (tracer): характеризация и шов на последовательном коде.** Литерал снят тремя прогонами исходного кода (выводы совпали побайтно), затем добавлен шов. Тест шва зафиксировал на последовательном коде: 5 вызовов исполнителя, максимум одновременных 1. Проверка плана: 3 файла, 36 тестов passed. Tracer-проверка повторена — зелёная, расширение продолжено.
2. **Task 2: RED → GREEN.** Новый `database-search.test.ts` (6 тестов) на последовательном коде: 3 failed | 3 passed — `maxConcurrent` ожидалось 5/5/3, получено 1/1/1. После `Promise.all`: 3 файла, 41 тест passed.
3. **Task 3:** `codegraph affected`, `yarn verify: OK`, сверка `08-08 changed only its files`.

## Хэш файла характеризации

- После Task 1: `e57ff42f05eaaf1062c813c091a3b4f01f484ea14969aae0c5aa79d0bbfe5604`.
- Первый `yarn verify` упал на `typecheck`: литерал `EXPECTED` был объявлен как `Record<ZoneProfile, …>`, а содержит 7 из 13 профилей. Тип заменён на `Record<Profile, …>` с `Profile = Extract<ZoneProfile, 'admin' | 'teacherA' | 'teacherB' | 's1' | 'readTests' | 'readUsers' | 'adminNoZone'>`; литерал не менялся.
- Итоговый: `5af5298691017c2aadf8f28c68c3498d0fabe2eaf404c6d8e5cea26f1cbd86e4`. С этим файлом инвариант «до/после» проверен заново: исходный последовательный `database-search.ts` (копия до плана) временно подставлен — характеризация и матрица 07.1: 35 passed; параллельная версия возвращена (`cmp` совпал) — 3 файла, 41 passed.

## Числа для 08-28 (D-20)

Запросов на вызов `scope=all` (запрос ≥ 2 символов) = максимум одновременных после правки = число доступных категорий:

| Профиль мира 07.1 | Доступные категории | Запросов на вызов | Одновременно до | Одновременно после |
|---|---|---|---|---|
| admin | tests, questions, users, groups, attempts | 5 | 1 | 5 |
| teacherA, teacherB | все пять | 5 | 1 | 5 |
| adminNoZone | tests, users, groups, attempts | 4 | 1 | 4 |
| readUsers (user + users.read) | tests, users, attempts | 3 | 1 | 3 |
| s1 (user), readTests (user + tests.read) | tests, attempts | 2 | 1 | 2 |

- Тест шва: администратор — 5 вызовов, максимум 5 (и в 20 прогонах со случайными задержками); доступ без `users.read` и `groups.manage_groups` — 3 вызова, максимум 3; `scope=tests` — 1 вызов, максимум 1; запрос короче 2 символов — 0 вызовов.
- `searchTests` содержит два места вызова `queryRows` (ветка с зоной тестов и ветка ученика), но за вызов выполняется ровно одно (`if … return` / `return`), поэтому «один запрос на доступную категорию» верно.
- Пул: `PG_POOL_MAX` 20 в production, 2 в разработке и тестах (`db/index.ts`); `scripts/bench/run.ts` задаёт 20 сам. Исполнитель по умолчанию обращается к `pgPool.query` в момент вызова, поэтому `instrumentPool` из bench видит запросы поиска как раньше.

## codegraph impact (начало плана)

```
Impact of changing "searchDatabase" — 5 affected symbols:
  app/server/src/services/search/database-search.ts  function searchDatabase:398
  app/server/src/routes/search.ts                    file search.ts:1, route GET /api/search:16
  app/server/src/routes/index.ts                     file index.ts:1
  app/server/src/services/search/index.ts            file index.ts:1

Impact of changing "queryRows" — 7 affected symbols:
  app/server/src/services/search/database-search.ts  queryRows:111, searchTests:116, searchDatabase:398,
                                                     searchGroups:294, searchQuestions:216, searchAttempts:331, searchUsers:256
```

Вызывающий код вне модуля — только маршрут `GET /api/search`; его вызов `searchDatabase` не менялся (executor необязателен).

## codegraph affected (конец плана)

```
Affected test files (4):
  app/server/src/routes/search-results.characterization.test.ts
  app/server/src/routes/tests/index.ts
  app/server/src/routes/tests/public.ts
  app/server/src/services/search/database-search.test.ts
```

`routes/tests/*.ts` попали в список из-за имени каталога `tests`, это не тестовые файлы. Матрица `teacher-zone-search.matrix.test.ts` в список не попала (ходит через HTTP), прогнана отдельно в каждой проверке плана — зелёная без правок.

## Files Created/Modified

- `app/server/src/services/search/database-search.ts` — `SearchExecutor`, `executor?` в `SearchParams`, `defaultExecutor`, исполнитель параметром в `queryRows` и функциях категорий, `Promise.all` в `searchDatabase`.
- `app/server/src/services/search/database-search.test.ts` — тест шва: одновременность, порядок при случайных задержках, недоступные категории, отказ категории users, одна категория, короткий запрос.
- `app/server/src/routes/search-results.characterization.test.ts` — характеризация выдачи через `startAuthApp` и `seedTeacherZoneWorld`.

Маршруты и middleware не менялись — перегенерация `route-inventory.txt` не нужна.

## Decisions Made

См. `key-decisions` во frontmatter. Решения исполнителя (автономно): выбор ученика s1 для запроса по фамилии; фильтр характеризации по элементам мира; определение категории по тексту SQL в тесте шва.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Тип литерала характеризации не проходил typecheck**
- **Found during:** Task 3 (`yarn verify`, шаг lint-typecheck-test)
- **Issue:** `EXPECTED: Record<ZoneProfile, …>` требует все 13 профилей мира, литерал содержит 7.
- **Fix:** тип `Profile = Extract<ZoneProfile, …7 профилей…>` для `PROFILES` и `EXPECTED`; литерал без изменений. Хэш файла характеризации поменялся, инвариант «до/после» перепроверен подстановкой исходного `database-search.ts` (см. «Хэш файла характеризации»).
- **Files modified:** `app/server/src/routes/search-results.characterization.test.ts`

---

**Total deviations:** 1 auto-fixed (Rule 1). **Impact:** только типизация теста, выдача и ожидания не менялись.

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/search-results.characterization.test.ts src/services/search/database-search.test.ts src/routes/teacher-zone-search.matrix.test.ts` — Test Files 3 passed, Tests 41 passed.
- `yarn verify` — все шаги passed, `yarn verify: OK`; сервер: Test Files 68 passed, Tests 1608 passed.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-08` — `08-08 changed only its files`.

## Threat Model

- T-8-18 (mitigate): характеризация по семи профилям совпадает на исходном и на параллельном коде; матрица 07.1 зелёная без правок; `canRunScope` и фильтры зоны не трогались.
- T-8-19 (accept): потолок 5 запросов на вызов; пул 20 в production; записано для 08-28.
- T-8-SC: установок пакетов нет.

## Deferred human verification

- Время поиска на preview (D-35) — сводно в 08-28. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Коммит трёх файлов плана делает ведущая сессия. Не выполнено, ждёт пользователя; исполнитель не одобрял.

## Передачи следующим планам

- 08-28: в «после» ожидать `maxConcurrentQueries` = числу доступных категорий доступа бенча (у администратора 5), `queriesPerCall` прежние (5 у обоих доступов «до»). `instrumentPool` работает без изменений: исполнитель по умолчанию вызывает `pgPool.query` в момент запроса.
- Любой план, который меняет SQL поиска или `canRunScope`: характеризация `search-results.characterization.test.ts` закрепляет выдачу по профилям; литерал снят на мире с префиксом `srchchr` (оценки триграмм зависят от префикса).
- Тесты сервиса поиска без БД подставляют `executor` в `searchDatabase`; модуль импортирует `db`, поэтому файл запускается под `with-test-db` (в `yarn verify` так и есть).

## Self-Check: PASSED

- FOUND: app/server/src/services/search/database-search.ts (изменён, `Promise.all`, `pgPool.query` в `defaultExecutor`)
- FOUND: app/server/src/services/search/database-search.test.ts
- FOUND: app/server/src/routes/search-results.characterization.test.ts (`seedTeacherZoneWorld`)
- Коммиты: не выполнялись по правилу пользователя; `git status` показывает ровно три файла плана.
