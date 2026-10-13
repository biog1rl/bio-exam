---
phase: 08-client-requests-runtime-and-decomposition
plan: 14
subsystem: server/question-content
tags: [zip, export, streaming, batch-queries, PERF-04, PERF-05, D-21, D-24, D-26]
status: complete
deferred_human_gate: false

requires:
  - phase: 08-02
    provides: бенчмарк run.ts и instrumentPool; в «до» zip.receiverPeakBytes равен размеру архива
  - phase: 08-09
    provides: readQuestionTexts, PROMPT_READ_CONCURRENCY = 123, mapBounded
  - phase: 08-12
    provides: streamZip, createCeilingBuffer, ZipLimitExceededError, ZIP_READ_AHEAD
provides:
  - prepareTestArchive, prepareTopicArchive → PreparedArchive { entries, missing, filename }
  - streamArchive(prepared, sink, { signal }) и archiveToBuffer(prepared, limitBytes) с ApiError(413) внутри модуля
  - test-support/export-reference.ts — эталон экспорта фазы 7 (buildZip, referenceBuildTestArchive, referenceBuildTopicArchive)
  - export-equivalence.test.ts (D-24) и export-queries.test.ts (D-26)
  - раздел zip бенчмарка на потоковом приёмнике со своим receiverPeakBytes
affects: [08-17, 08-28]

actuals:
  tokens: 12600
  tasks: 3
  commits: 0
plan_head_before: af7560afe77c707c9a03326abe04706f05cb6c8c
plan_head_after: af7560afe77c707c9a03326abe04706f05cb6c8c

tech-stack:
  added: []
  patterns:
    - "Подготовка архива отделена от доставки: prepare* делает все проверки и чтения, которые могут отказать до первого байта ответа; доставка — streamArchive (поток) или archiveToBuffer (буфер с потолком)"
    - "Тексты всех вопросов теста или темы — один вызов readQuestionTexts; пустая строка означает «не найдено» (findFirstMarkdown требует непустой trim), тогда указатель уходит в missing"
    - "Эталон прежнего поведения живёт в test-support и сравнивается с рабочим кодом по именам, порядку и sha256 несжатых записей на одном состоянии базы и хранилища"

key-files:
  created:
    - app/server/src/test-support/export-reference.ts
    - app/server/src/services/question-content/export-equivalence.test.ts
    - app/server/src/services/question-content/export-queries.test.ts
  modified:
    - app/server/src/services/question-content/export.ts
    - app/server/src/services/question-content/index.ts
    - app/server/src/services/question-content/export.test.ts
    - app/server/src/services/storage/zip.ts
    - app/server/src/services/storage/zip-stream.test.ts
    - app/server/src/scripts/bench/run.ts

key-decisions:
  - "Тест с темой — один запрос select { test, topic } с leftJoin: сохраняются оба 404 (TEST_NOT_FOUND и TOPIC_NOT_FOUND)"
  - "streamArchive и archiveToBuffer передают в streamZip копию prepared.missing: один PreparedArchive можно доставить повторно без удвоения missing-files.txt"
  - "assertArchiveFits удалён из export.ts и index.ts (codegraph impact и git grep: вызывающих вне export.ts нет); копия осталась в эталоне"
  - "Раздел zip бенчмарка переведён на prepareTopicArchive + streamArchive в считающий приёмник (решение исполнителя, автономно): условие плана «если сигнатуры изменились» двусмысленно, а передача 08-02 и 08-28 («код не меняется, метрики те же») требуют, чтобы приёмник отдал свой счётчик в этом плане"
  - "Префикс сообщения ZipEntryNameError: buildZip: → streamZip: (рабочий buildZip удалён; проверки ищут /invalid entry name/)"

metrics:
  duration: 45min
  completed: 2026-10-05
---

# Phase 8 Plan 14: Экспорт пачкой на потоковом ядре ZIP Summary

**Экспорт теста и темы читает базу постоянным числом запросов (тест 4, тема 5 при withAnswers), тексты вопросов — одним `readQuestionTexts` с потолком 123, архив собирается `streamZip` в приёмник: `streamArchive` для потока, `archiveToBuffer` с потолком и `ApiError(413)`. Эквивалентность эталону фазы 7 по именам, порядку и sha256 записей доказана на образцах D-24.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Выполнено

### Task 1 (tracer): эталон фазы 7 и экспорт теста

- `test-support/export-reference.ts`: дословная копия `buildZip` (с `assertEntryName`, `assertEntryNames`, `hasControlCharacter`, `packZip`) из `services/storage/zip.ts` и `buildTestArchive`, `buildTopicArchive` со вспомогательными функциями из `export.ts` (HEAD af7560a); поменялись только пути импорта и имена `referenceBuildTestArchive`, `referenceBuildTopicArchive`. `ZipEntryNameError`, `MISSING_FILES_ENTRY`, `ZipEntry` импортируются из `services/storage/zip.ts`.
- `export-equivalence.test.ts` написан до правки `export.ts`. Прогон на старом коде: 2 теста эквивалентности зелёные (эталон совпадает со старым кодом), 2 красные (`qc.prepareTestArchive is not a function`) — лог `scratchpad/08-14-red1.log`.
- `export.test.ts` (`describe('buildZip')`, оба динамических импорта) и `zip-stream.test.ts` (отдельный `import { buildZip }`) берут `buildZip` из `test-support/export-reference.js`; прогон обоих зелёный до правки `zip.ts` (30 тестов).
- `export.ts` переписан: `prepareTestArchive`, `prepareTopicArchive`, `streamArchive`, `archiveToBuffer`; `buildTestArchive`/`buildTopicArchive` = `prepare…` → `archiveToBuffer(prepared, limitBytes ?? ZIP_RESPONSE_LIMIT_BYTES)`. Из `zip.ts` удалены `buildZip`, `BuildZipOptions`, `packZip`. `index.ts` экспортирует `prepareTestArchive`, `prepareTopicArchive`, `streamArchive`, `archiveToBuffer`, `PreparedArchive` вместо `assertArchiveFits`.
- Шлюз tracer: оба `<automated>` Task 1 зелёные (34 теста; «buildZip only in reference»), `yarn workspace @bio-exam/server typecheck` чистый.

### Task 2: тема пачкой, число запросов, 413

- Эквивалентность темы из двух тестов с общей картинкой, собственной устаревшей картинкой, пропущенным указателем и отсутствующим ключом: withAnswers true, false и true при `answersAllowed` false — имена, порядок и sha256 совпадают с эталоном; общая картинка одна; `streamArchive(prepareTopicArchive)` даёт тот же архив.
- `export-queries.test.ts` (счётчик `instrumentPool(ctx.pgPool)` из бенчмарка 08-02). Красный прогон: тот же файл с вызовами эталона вместо `prepare…` — падает на теме (7 против 13 запросов), лог `scratchpad/08-14-t2-red.log`. Зелёный на новом коде.
- Потолок: тест с 16 картинками по 4096 случайных байт, `archiveToBuffer(prepared, 1024)` → 413 с `ARCHIVE_TOO_LARGE_MESSAGE` после 5 чтений хранилища из 16 ключей.
- `bench/run.ts`: раздел `zip` — `prepareTopicArchive` + `streamArchive` в считающий `Writable` (сразу зовёт `callback`, считает всего байт и максимальный фрагмент). Форма JSON прежняя.

### Task 3

`codegraph affected`, `yarn verify`, сверка — ниже.

## Число запросов к базе (pgPool.query)

| Вызов | до (эталон фазы 7) | после |
|---|---|---|
| тест 3 вопроса, withAnswers=true | 5 | 4 |
| тест 30 вопросов, withAnswers=true | 5 | 4 |
| тест 3 / 30 вопросов, withAnswers=false | 4 / 4 | 3 / 3 |
| тема 2 теста, withAnswers=true | 7 | 5 |
| тема 5 тестов, withAnswers=true | 13 | 5 |
| тема 2 / 5 тестов, withAnswers=false | 5 / 8 | 4 / 4 |
| тема вне scope (403) | 1 | 1 |

До: тема = 3 + 2 × число тестов (вопросы и ключи на каждый тест). После: тема — тема, тесты темы ‖ глобальные правила, вопросы всех тестов, ключи всех вопросов; тест — тест с темой, правила ‖ вопросы, ключи.

## Бенчмарк (ориентир для 08-28, файлы в scratchpad, не в `bench/`)

Команда: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server tsx src/scripts/bench/run.ts --out <scratchpad>/08-14-bench-full.json` (24 с). Для сравнения тот же сид с эталоном (временная копия `run-ref.ts`, удалена).

| zip | эталон, тот же сид | после |
|---|---|---|
| queries | 35 | 5 |
| reads | 2233 | 2233 |
| maxConcurrentReads | 1 | 123 (тексты через `readQuestionTexts`; чтения ZIP ≤ `ZIP_READ_AHEAD`) |
| archiveBytes | 22 904 923 | 22 904 938 |
| receiverPeakBytes | 22 904 923 | 16 384 |
| arrayBuffersPeakDeltaBytes.median | 82 231 522 | 10 341 087 |
| medianMs | 392.13 | 387.81 |

`archiveBytes` различается на единицы байт между любыми двумя прогонами, в том числе эталона (`before.json` 08-02: 22 904 929): `settings.json` содержит `updatedAt` из базы, сжатый размер плавает. Состав и содержимое записей доказаны тестом эквивалентности.

## codegraph

`codegraph impact` (до правок, индекс основного дерева):
- `buildTestArchive` — `routes/tests/index.ts` (`GET /api/tests/:id/export`), `routes/index.ts`, `services/question-content/index.ts`.
- `buildTopicArchive` — `routes/tests/index.ts` (`GET /api/tests/topics/:slug/export`), `routes/index.ts`, `services/question-content/index.ts`.
- `buildZip` — `export.test.ts`, `export.ts` (`buildTestArchive`, `buildTopicArchive`), оба маршрута экспорта, `services/question-content/index.ts`.
- `collectTestParts` — `buildTestArchive`, `buildTopicArchive`, оба маршрута экспорта.
- `assertArchiveFits` — только `buildTestArchive`, `buildTopicArchive` (и реэкспорт в `index.ts`) → удалён.

`codegraph affected` по файлам плана: `routes/tests/index.ts`, `export-equivalence.test.ts`, `export-queries.test.ts`, `export.test.ts`, `zip-stream.test.ts`.

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/question-content/export-equivalence.test.ts src/services/question-content/export.test.ts src/services/storage/zip-stream.test.ts` — после Task 1: 3 файла, 34 теста passed.
- Проверка импортов `buildZip` из плана — `buildZip only in reference`.
- `git grep -n --untracked "buildZip" -- app/server/src ':!app/server/src/test-support'` — только `export.test.ts` и `zip-stream.test.ts` (импорт эталона, вызовы и названия тестов).
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/question-content src/services/storage` — 18 файлов, 428 тестов passed.
- `yarn verify` — `yarn verify: OK` (сервер 1651 тест, web 1219, exam-core 605, rbac 9; лог `scratchpad/08-14-verify.log`).
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-14` — `08-14 changed only its files`.
- `yarn oxfmt --check .` — все файлы в формате.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Сообщение `ZipEntryNameError` называло удалённую функцию и мешало проверке п. 6**
- **Found during:** Task 1, п. 6
- **Issue:** после удаления `buildZip` из `zip.ts` ошибка имени записи начиналась с `buildZip:`, и `git grep buildZip` вне `test-support` находил рабочий код.
- **Fix:** префикс `streamZip:`; тесты ищут `/invalid entry name/`.
- **Files modified:** `app/server/src/services/storage/zip.ts`

**2. Порядок Task 1/Task 2.** `prepareTopicArchive` написан в Task 1 вместе с `prepareTestArchive` (общий сборщик частей `collectParts`). Красный прогон Task 2 снят тем же тестом числа запросов на эталоне фазы 7 (временная копия файла, удалена).

**3. Решение исполнителя (автономно): `bench/run.ts` изменён** — см. key-decisions. Метрики и форма JSON прежние, `limitBytes: Number.MAX_SAFE_INTEGER` больше не нужен.

## Threat Flags

Нет новой поверхности: маршруты не менялись, `routes/tests` по-прежнему не импортирует `services/storage`, `EXCEPTIONS` гарда пуст. T-8-32: `withAnswers`/`answersAllowed` прежние, образец `answersAllowed: false` в эквивалентности. T-8-33: запросы пачкой (тест счётчика), потолок прерывает сборку (5 чтений из 16). T-8-34: эталон и sha256.

## Known Stubs

Нет.

## Deferred human verification

Нет шагов пользователя. Коммит файлов плана делает ведущая сессия.

## Передачи следующим планам

- 08-17: из `services/question-content` брать `prepareTestArchive`, `prepareTopicArchive`, `streamArchive(prepared, res, { signal })`, `archiveToBuffer(prepared, limitBytes)`, `PreparedArchive`, `ZIP_RESPONSE_LIMIT_BYTES`, `ARCHIVE_TOO_LARGE_MESSAGE`. `prepare…` бросает 403/404 до первого байта; `archiveToBuffer` превращает `ZipLimitExceededError` в `ApiError(413, ARCHIVE_TOO_LARGE_MESSAGE)`, остальные ошибки пробрасывает. `streamArchive` при отказе приёмник не закрывает (как `streamZip`): маршрут сам уничтожает `res`. `PreparedArchive` можно доставить повторно — `missing` копируется. `buildTestArchive`/`buildTopicArchive` с `limitBytes?` остались (их вызывает текущий маршрут и `export.test.ts`).
- 08-17: `assertArchiveFits` больше нет.
- 08-28: раздел `zip` бенчмарка уже потоковый; `receiverPeakBytes` — максимальный фрагмент, который держит приёмник (16 384 на текущем сиде), в «до» он равен размеру архива. `maxConcurrentReads` раздела `zip` теперь 123: это чтения текстов `readQuestionTexts`, чтения объектов ZIP ограничены `ZIP_READ_AHEAD = 4`. `archiveBytes` между прогонами отличается на единицы байт и в «до».
- Любой план: эталон фазы 7 — только `test-support/export-reference.ts`; рабочего `buildZip` нет.

## Файлы к коммиту

- `app/server/src/test-support/export-reference.ts` (новый)
- `app/server/src/services/question-content/export-equivalence.test.ts` (новый)
- `app/server/src/services/question-content/export-queries.test.ts` (новый)
- `app/server/src/services/question-content/export.ts`
- `app/server/src/services/question-content/index.ts`
- `app/server/src/services/question-content/export.test.ts`
- `app/server/src/services/storage/zip.ts`
- `app/server/src/services/storage/zip-stream.test.ts`
- `app/server/src/scripts/bench/run.ts`

## Self-Check: PASSED

- Созданные файлы на месте: `test-support/export-reference.ts`, `export-equivalence.test.ts`, `export-queries.test.ts`.
- Коммитов нет по правилу пользователя: `commits: 0`, HEAD до и после af7560a, изменения в рабочем дереве (9 файлов).
