---
phase: 08-client-requests-runtime-and-decomposition
plan: 02
subsystem: testing
tags: [perf, benchmarks, synthetic-seed, bundle-size, PERF-05]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-01
    provides: чистое дерево на af8410f, сборка web без ошибок
provides:
  - детерминированная синтетика масштаба прода на test_* (31 пользователь, 63 теста, 1834 вопроса, 2700 объектов, 37 МиБ)
  - скрипт замеров поиска, промптов и ZIP с отказом вне изолированного окружения
  - scripts/editor-bundle.mjs --report (JS первой загрузки маршрутов редактора, сырой и gzip, признак emoji-list)
  - 08-BENCHMARKS.md с колонкой «до» и командами повтора для 08-28
affects: [08-08, 08-09, 08-14, 08-24, 08-28]

actuals:
  tokens: 14095
  tasks: 3
  commits: 0
plan_head_before: af8410fc0343aa06335ebf00621f613058817db9
plan_head_after: af8410fc0343aa06335ebf00621f613058817db9

tech-stack:
  added: []
  patterns:
    - "Скрипт замеров: проверка isIsolatedEnv и requireTestDatabaseUrl до любого импорта модулей с базой, затем createScratchDatabase('test_bench'), миграции, env и динамические импорты"
    - "Счётчики: обёртка pgPool.query на экземпляре (вызовы, максимум одновременных) и обёртка read in-memory адаптера (задержка, чтения, байты, максимум одновременных)"
    - "Пиковый буфер: сборка мусора через v8.setFlagsFromString('--expose_gc') с паузами, затем опрос process.memoryUsage().arrayBuffers каждые 5 мс"

key-files:
  created:
    - app/server/src/scripts/bench/probes.ts
    - app/server/src/scripts/bench/seed.ts
    - app/server/src/scripts/bench/run.ts
    - scripts/editor-bundle.mjs
    - scripts/editor-bundle.test.mjs
    - .planning/phases/08-client-requests-runtime-and-decomposition/08-BENCHMARKS.md
  modified: []

key-decisions:
  - "Путь --out отсчитывается от корня репозитория (по import.meta.url): yarn workspace запускает tsx из app/server, а INIT_CWD читать нельзя без нового ключа env"
  - "Прогрев не входит в статистику: 3 вызова поиска на доступ, 1 прогон промптов и ZIP; промпты и ZIP — 5 прогонов, время — медиана"
  - "ZIP снимается с задержкой чтения 0 мс, промпты — 20 мс; значения записаны в JSON и в 08-BENCHMARKS.md"
  - "37 МБ из D-28 взяты как 37 МиБ = 38 797 312 байт; объём хранилища в сиде точный"
  - "Попыток в синтетике нет: D-28 их не называет; категория «Попытки» выполняет запрос и возвращает пусто"
  - "Отчёт бандла — только два маршрута плана; /questions/new в статистике есть (2 039 737 байт первой загрузки) и в отчёт не входит"

duration: ~40min
completed: 2026-10-05
---

# Phase 8 Plan 02: замеры «до» (PERF-05) Summary

Синтетика масштаба прода на одноразовой `test_*`, замеры поиска, промптов и ZIP через счётчики пула и in-memory хранилища, отчёт размера JS первой загрузки редактора и колонка «до» в `08-BENCHMARKS.md`.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве worktree `gsd/phase-08`.

## Что сделано

### Task 1 (tracer): скелет замеров
- `run.ts`: отказ до подключения без `BIO_EXAM_ISOLATED_ENV=1` и `TEST_DATABASE_URL` (проверено три случая: без флага, без URL, URL с чужим хостом — код 1, сообщение, без строк `[db]`); `createScratchDatabase('test_bench')`, `migrateTestDatabase`, `TEST_DATABASE_URL`, `STORAGE_DRIVER=memory`, `PG_POOL_MAX=20`, `LOG_LEVEL=silent`; динамические импорты; в `finally` закрываются сервер, пул и удаляется база; выход через `process.exit` (интервал `rateLimiter.ts` держит процесс).
- `probes.ts`: `instrumentPool`, `instrumentStorage`, `sampleMemory`, `settleMemory`, `percentile`.
- `seed.ts`: `seedBench(ctx, { scale })`; `quick` — одна тема, один тест, три вопроса.
- Прогон `--quick`: JSON с ключом `search`, `queriesPerCall` 5, файл `bench/quick.json`. Tracer-гейт пройден до расширения.

### Task 2: синтетика `prod` и метрики
- Сид детерминированный (mulberry32, зерно 20261005; UUID вопросов из генератора, версия 4 и вариант 8–b для `validateUUID`). Вопросы и промпты пишутся через `writeContentFiles` и `syncQuestionDerived`, как в `e2e-seed.ts`. Зона учителя — только `setTopicTeachers` и `setGroupOwner`; роли — через `ROLE_REGISTRY.*.key` и `STUDENT_ROLE_KEY` (охранный тест ролей запрещает литерал роли учителя).
- Картинки ссылаются из промптов в форме `storageUrl(key)` (`/api/docs/assets/proxy?path=…`), поэтому попадают в индекс ассетов и в ZIP.
- Ключи JSON: `mode`, `env`, `seed`, `search`, `prompts`, `zip`. Счётчики проверяются на ноль (ноль = обёртка не сработала → ошибка), ответ прохождения проверяется на 200 и 123 вопроса с непустыми промптами.

### Task 3: размер чанка редактора (TDD)
- RED: `scripts/editor-bundle.test.mjs` написан первым, `node --test` — `ERR_MODULE_NOT_FOUND`, pass 0, fail 1.
- GREEN: `scripts/editor-bundle.mjs` — pass 5, fail 0 (фикстура во временном каталоге: размеры сырой и gzip, признак emoji-list, отказ без файла статистики, без маршрута, без чанка, без режима).
- Сборка `API_ORIGIN=http://127.0.0.1:4000 yarn workspace @bio-exam/web build` — код 0. Маршруты плана совпали со списком `route` в статистике.
- Маркер emoji-list: `grinning face with big eyes` (`rg` находит его только в `app/web/components/editor/utils/emoji-list.ts`; в сборке — только чанк `19imyri2qpxcm.js`).

## codegraph impact (по индексу основного дерева; план символы не меняет)

- `searchDatabase` (`services/search/database-search.ts:398`) — 5 символов: `routes/search.ts` (`GET /api/search`), `routes/index.ts`, `services/search/index.ts`. Для 08-08.
- `buildTopicArchive` (`services/question-content/export.ts:170`) — 5 символов: `routes/tests/index.ts` (`GET /api/tests/topics/:slug/export`), `routes/index.ts`, `services/question-content/index.ts`. Для 08-14.
- `readAdminTest` (`services/question-content/read.ts:114`) — 6 символов: `routes/tests/index.ts` (`GET /api/tests/:id`, `GET /api/tests/by-slug/:topicSlug/:testSlug`), `routes/index.ts`, `services/question-content/index.ts`. Для 08-09.

## codegraph affected

`codegraph affected` по пяти файлам плана: `scripts/editor-bundle.test.mjs` (1 файл). Серверные файлы замеров новые, тестов на них нет, в индексе основного дерева их нет.

## Масштаб сида (`bench/before.json` → `seed`)

users 31, topics 6, tests 63, questions 1834, prompts 1834, explanations 612, images 254, objects 2700, bytes 38 797 312, assignments 478, groups 1. Крупнейший тест `bench-1-01` — 123 вопроса; крупнейшая тема `bench-topic-1` — 16 тестов, 22 874 267 байт. Сид создаётся за ~1 с.

## Таблица «до»

| Метрика | До |
|---|---|
| Поиск, администратор: категорий / запросов на вызов / максимум одновременных | 5 / 5 / 1 |
| Поиск, администратор: p50 / p95, мс | 99,32 / 103,97 |
| Поиск, учитель: категорий / запросов на вызов / максимум одновременных | 5 / 5 / 1 |
| Поиск, учитель: p50 / p95, мс | 19,31 / 21,29 |
| `PG_POOL_MAX` | 20 |
| Промпты, прохождение 123 вопросов при 20 мс: чтений / максимум одновременных / медиана, мс | 123 / 123 / 26,65 |
| Промпты, `readAdminTest` того же теста: чтений / максимум одновременных / медиана, мс | 164 / 5 / 703,82 |
| ZIP крупнейшей темы: запросов к базе / чтений / максимум одновременных | 35 / 2233 / 1 |
| ZIP: счётчик приёмника = размер архива, байт | 22 904 929 |
| ZIP: пик `arrayBuffers` над исходным, медиана, байт | 82 231 432 |
| ZIP: медиана, мс | 397,93 |
| Редактор вопроса и черновика: JS первой загрузки сырой / gzip, байт | 2 851 678 / 759 171 |
| Данные emoji-list в первой загрузке | да, `19imyri2qpxcm.js` (262 605 байт) |

Полная таблица с пустыми колонками «после» и «изменение», окружение и команды повтора — `08-BENCHMARKS.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Пик `arrayBuffers` занижался мусором прошлых прогонов**
- **Found during:** Task 2
- **Issue:** исходный уровень `arrayBuffers` брался сразу после `gc()`, когда освобождение буферов ещё не закончилось; исходный уровень колебался 112–142 МБ, дельта — 2,7–28 МБ при архиве 22,9 МБ.
- **Fix:** `settleMemory()` — три цикла `gc()` с паузой 25 мс перед исходным уровнем. Дельта стала стабильной: 82 231 4xx байт во всех пяти прогонах. В JSON записаны дельты и исходные уровни каждого прогона.
- **Files modified:** `app/server/src/scripts/bench/probes.ts`, `app/server/src/scripts/bench/run.ts`

### Решения исполнителя (автономно)
- См. `key-decisions`. Отдельно: поиск идёт напрямую через `searchDatabase` с доступом из шва `services/access-policy` по образцу `routes/search.ts`, запрос через фиктивный `{ authUser: { id } }`; новых проверок прав вне шва нет.

## Known Stubs

Нет.

## Threat Flags

Нет: новых маршрутов и путей доступа нет. T-8-03 закрыт отказом до подключения (проверка второй командой Task 1 и двумя дополнительными случаями). В JSON — только числа, окружение машины и коммит, без URL базы.

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server tsx src/scripts/bench/run.ts --quick --out …/bench/quick.json` — код 0, ключ `search` есть.
- `yarn workspace @bio-exam/server tsx src/scripts/bench/run.ts --quick` без with-test-db — код 1.
- Полный прогон в `bench/before.json` — код 0; проверка масштаба — `seed scale ok 2700 38797312`.
- `node --test scripts/teacher-zone-guards.test.mjs` — pass 12, fail 0; охранные тесты ролей, хранилища, копий exam-core — pass 21, fail 0.
- `node --test scripts/editor-bundle.test.mjs` — pass 5, fail 0.
- `node scripts/editor-bundle.mjs --report` — код 0, `firstLoadRawBytes` для обоих маршрутов.
- `yarn verify` — все 8 шагов passed, `yarn verify: OK` (script-tests: 202 pass, 0 fail); повторён после переименования параметра `instrumentPool` в `pgPool` (ссылка `key_links` плана) — снова OK.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-02` — `08-02 changed only its files`.

## Файлы к коммиту

- `app/server/src/scripts/bench/probes.ts`
- `app/server/src/scripts/bench/seed.ts`
- `app/server/src/scripts/bench/run.ts`
- `scripts/editor-bundle.mjs`
- `scripts/editor-bundle.test.mjs`

`.planning` в .gitignore: `08-BENCHMARKS.md`, `08-02-SUMMARY.md` и `bench/{before,editor-before,quick}.json` лежат в общем `.planning` и в коммит кода не входят.

## Передачи между планами

- 08-24: добавляет в `scripts/editor-bundle.mjs` режим `--check` и файл бюджета. Экспорты `EDITOR_ROUTES`, `EMOJI_MARKER`, `editorBundleReport` и тест `scripts/editor-bundle.test.mjs` сохраняются. Маршрут `/admin/tests/[topicSlug]/[testSlug]/questions/new` в статистике есть (2 039 737 байт первой загрузки) и в отчёт не входит.
- 08-14: в «до» `zip.receiverPeakBytes` равен размеру архива (приёмник-буфер). Новый приёмник отдаёт свой счётчик, чтобы 08-28 заполнил эту строку.
- 08-08: в «до» у обоих доступов `queriesPerCall` 5 и `maxConcurrentQueries` 1. Инвариант PERF-01: максимум одновременных не больше числа доступных категорий, число запросов прежнее.
- 08-28: повторяет команды из `08-BENCHMARKS.md` с `after.json` и `editor-after.json`. `PG_POOL_MAX=20` задаёт сам скрипт, не окружение.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Цифры прода даёт только preview (D-27, D-35): сводно в 08-28.
- Коммит пяти файлов плана делает ведущая сессия.

## Self-Check: PASSED
