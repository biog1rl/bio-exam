---
phase: 08-client-requests-runtime-and-decomposition
plan: 17
subsystem: server/routes/tests (экспорт)
tags: [zip, export, streaming, env, PERF-04, PERF-05, D-25, D-26, D-27, D-34]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-12
    provides: streamZip, createCeilingBuffer, AbortSignal → AbortError, ранний close приёмника → ERR_STREAM_PREMATURE_CLOSE
  - phase: 08-14
    provides: prepareTestArchive, prepareTopicArchive, streamArchive, archiveToBuffer, PreparedArchive, ZIP_RESPONSE_LIMIT_BYTES, ARCHIVE_TOO_LARGE_MESSAGE
provides:
  - config/export.ts — parseExportZipLimit, EXPORT_ZIP_LIMIT (ключ EXPORT_ZIP_MAX_BYTES)
  - routes/tests/export-response.ts — sendArchive(req, res, prepared, limit?) с двумя приёмниками
  - export-routes.test.ts — приёмники через app.ts в трёх режимах окружения и отказ старта при неверном значении
  - e2e экспорта теста в authoring.spec.ts (D-34)
affects: [08-26, 08-27, 08-28]

actuals:
  tokens: 6400
  tasks: 3
  commits: 0
plan_head_before: 754b3aedc044679e54264da9ba404f12af8a2683
plan_head_after: 754b3aedc044679e54264da9ba404f12af8a2683

tech-stack:
  added: []
  patterns:
    - "Маршрут экспорта: проверки шва доступа → prepare…Archive (все отказы до первого байта) → sendArchive; заголовки ZIP ставятся только внутри sendArchive"
    - "Режим доставки выбирается окружением при старте модуля; неверное значение роняет загрузку app.ts с именем ключа"
    - "Потоковый ответ: AbortController по close ответа до finish; после заголовков ошибка не уходит в next, а закрывает соединение"

key-files:
  created:
    - app/server/src/config/export.ts
    - app/server/src/config/export.test.ts
    - app/server/src/routes/tests/export-response.ts
    - app/server/src/routes/tests/export-routes.test.ts
  modified:
    - app/server/src/routes/tests/index.ts
    - app/server/.env.example
    - e2e/tests/authoring.spec.ts

key-decisions:
  - "Умолчание 4 400 000 — литерал в config/export.ts, а не импорт ZIP_RESPONSE_LIMIT_BYTES: иначе модуль конфигурации тянет db; совпадение закреплено тестом config/export.test.ts (решение исполнителя, автономно)"
  - "Закрытие соединения клиентом — не ошибка: res.destroy() и запись info с event export_stream_aborted, без error; сбой хранилища после заголовков — error с event export_stream_failed (решение исполнителя, автономно)"
  - "Отказ потока до первого байта (сбой чтения раньше заголовков): Content-Type и Content-Disposition снимаются перед next(e), иначе JSON ошибки ушёл бы с заголовками вложения ZIP"
  - "Значение из цифр вне безопасного целого (например 99999999999999999999) — ошибка старта, как и прочие неверные значения"
  - "e2e разбирает архив импортом app/server/src/test-support/zip.ts (Playwright транспилирует TS вне каталога e2e); e2e/fixtures/zip.ts не создан (необязательный файл плана)"

metrics:
  duration: 40min
  completed: 2026-10-05
---

# Phase 8 Plan 17: Доставка ZIP экспорта — лимит из окружения, буфер с потолком и поток Summary

**Экспорт теста и темы отдаётся через `sendArchive`: без `EXPORT_ZIP_MAX_BYTES` — буфер с потолком 4 400 000 и 413 до заголовков, при `0` — поток в `res` без `Content-Length` с отменой по закрытию соединения и обрывом при сбое хранилища после заголовков; содержимое обоих режимов совпадает по именам, порядку и sha256.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Выполнено

### Task 1 (tracer): поток экспорта теста через app.ts

- Снимок `08-plan-files.cjs snapshot 08-17` — `fingerprint 08-17 0 paths` (дерево чистое).
- Тесты написаны до кода: `config/export.test.ts` и `routes/tests/export-routes.test.ts` (в том числе строки behavior Task 2 — общий файл). Красный прогон — лог `scratchpad/08-17-red1.log`: `config/export.test.ts` не грузится (`Cannot find module './export.js'`), в `export-routes.test.ts` 7 красных (поток отдаёт `content-length`, 413 не приходит при `2000`, неверное значение не мешает старту), 4 зелёных — режим буфера по умолчанию, который совпадает со старым поведением.
- `config/export.ts`: `parseExportZipLimit` — `undefined`, `''`, строка из пробелов → `{ mode: 'buffer', limitBytes: 4_400_000 }`; `/^\d+$/` по значению как есть (без обрезки) и `Number.isSafeInteger`; `0` → `{ mode: 'stream' }`; иное → `Error('EXPORT_ZIP_MAX_BYTES must be a non-negative integer number of bytes: 0 streams without a limit')`. `EXPORT_ZIP_LIMIT` на уровне модуля. Импортов из `services/storage` нет.
- `routes/tests/export-response.ts`: импорт только `archiveToBuffer`, `streamArchive`, `PreparedArchive` из `services/question-content` и `EXPORT_ZIP_LIMIT` из `config/export.ts`.
- `routes/tests/index.ts`: обработчики `GET /:id/export` и `GET /topics/:slug/export` — проверки как были (`canReadTest`, `canWriteTest`, `testScope`, `canWriteTopic`), затем `prepareTestArchive` / `prepareTopicArchive`, затем `sendArchive(req, res, prepared)`; ошибки до заголовков — `next(e)`. Импорты `buildTestArchive`/`buildTopicArchive` из маршрута убраны (функции остаются в модуле для `export.test.ts` и `export-equivalence.test.ts`).
- Шлюз tracer: оба `<automated>` Task 1 зелёные — 2 файла, 18 тестов; `node --test scripts/storage-no-private-access.test.mjs` — 8 pass, `EXCEPTIONS` пуст. Файл приёмников трижды подряд зелёный (11 из 11).

### Task 2: потолок 413, отмена, обрыв, ключ в env-примере

- Буфер: `archiveToBuffer(prepared, limitBytes)` → `ApiError(413, ARCHIVE_TOO_LARGE_MESSAGE)` уходит в `next` до заголовков; успех — заголовки и `res.send(buffer)` (Express ставит `Content-Length`).
- Поток: `AbortController` срабатывает на `close` ответа, пока `res.writableFinished` ложно; при отмене — `res.destroy()` и `req.log.info({ event: 'export_stream_aborted', testId, topicSlug, filename })`; при ошибке до заголовков — снятие заголовков ZIP и проброс; после заголовков — `req.log.error({ event: 'export_stream_failed', err, testId, topicSlug, filename })` и `res.destroy()`.
- `app/server/.env.example`: раздел «Экспорт» с комментарием по-русски и `# EXPORT_ZIP_MAX_BYTES=4400000`.
- `<automated>` Task 2: `vitest run src/routes/tests src/services/question-content src/config` — 29 файлов, 616 тестов passed; `node scripts/check-env-contract.mjs` — `check-env-contract: OK`.

### Task 3: e2e, codegraph affected, verify

- `authoring.spec.ts`: `describe.serial('D-34: test export')` после D5, два сценария на странице `authoring-<p>`: кнопки «Экспорт» и «С ответами» (`TestEditorHeader`), `page.waitForEvent('download')`, имя `${TOPIC_SLUG}-${slug}.zip`, в архиве `settings.json` и `questions/<id>/prompt.md` для каждого вопроса из `/api/tests/by-slug` на момент экспорта, `answer_keys.json` только в «С ответами». Данные не меняются.
- `yarn e2e tests/authoring.spec.ts` — 26 passed (оба проекта, по 2 новых сценария; лог `scratchpad/08-17-e2e-authoring.log`).

## Поведение приёмников (доказано `export-routes.test.ts` через app.ts)

| Режим | Сценарий | Результат |
|---|---|---|
| `0` | экспорт теста (с ответами и без) | 200, `application/zip`, `attachment; filename="<topic>-<test>.zip"`, нет `content-length`, `transfer-encoding: chunked`; записи = `archiveToBuffer(prepareTestArchive)` на том же состоянии (имена, порядок, sha256) |
| `0` | экспорт темы (с ответами и без) | то же для `prepareTopicArchive`, `filename="<topic>.zip"` |
| `0` | учитель без темы: тест и тема | 403 JSON `{ error: 'Forbidden' }`, нет `content-disposition` |
| `0` | несуществующий тест, несуществующая тема | 404 JSON |
| `0` | клиент читает первый фрагмент и обрывает (48 картинок по 256 КБ) | через 200 мс и ещё 200 мс число чтений картинок не растёт и меньше 48; событие `export_stream_aborted` с id теста; `/healthz` отвечает |
| `0` | сбой `read` последней картинки (10 по 64 КБ) | 200 и заголовки ZIP ушли, чтение тела клиентом отклонено; одно событие `export_stream_failed` с id теста и `err`; сервер отвечает, повторный экспорт без сбоя совпадает с буфером |
| не задан | экспорт теста и темы | 200, `content-length` = длине тела, записи = режиму буфера |
| не задан | 403 / 404 | JSON без заголовков ZIP |
| `2000` | тест с 16 картинками по 4096 байт; тема с 4 | 413 JSON `error` = `ARCHIVE_TOO_LARGE_MESSAGE`; чтений картинок теста меньше 16 |
| `4.4MB` | старт `startAuthApp` | отклонён, сообщение содержит `EXPORT_ZIP_MAX_BYTES` |
| поток, `sendArchive` в отдельном Express | синхронный отказ `streamZip` до первого байта (`ZipEntryNameError` на `../outside.txt`) | ошибка ушла в `next`, ответ JSON 500, `content-disposition` нет; без `clearArchiveHeaders` тест красный (проверено временным удалением вызова) |

`config/export.test.ts`: `undefined`, `''`, `'   '`, `'\t'` → буфер 4 400 000; `'0'` → поток; `'1000'` → буфер 1000; `'-1'`, `'1.5'`, `'abc'`, `'4.4MB'`, `' 100'`, `'100 '`, `'1e6'`, `'99999999999999999999'` → исключение с именем ключа; без ключа `EXPORT_ZIP_LIMIT` равен `ZIP_RESPONSE_LIMIT_BYTES`; `0` в окружении → поток; `'4.4MB'` в окружении роняет загрузку модуля.

## codegraph

Индекс построен по основному дереву (до 08-14), в worktree индекса нет.

`codegraph impact` (до правок):
- `buildTestArchive` — 5 символов: `services/question-content/export.ts`, маршрут `GET /api/tests/:id/export` (`routes/tests/index.ts:1479`), `routes/index.ts`, `services/question-content/index.ts`.
- `buildTopicArchive` — 5 символов: `export.ts`, маршрут `GET /api/tests/topics/:slug/export` (`routes/tests/index.ts:1496`), `routes/index.ts`, `services/question-content/index.ts`.
- `prepareTestArchive` — `Symbol not found` (функция добавлена в 08-14, индекс старше). По `git grep` в worktree: вызывающие — `buildTestArchive`, `export-equivalence.test.ts`, `export-queries.test.ts`; после плана ещё оба маршрута экспорта; `prepareTopicArchive` — также `scripts/bench/run.ts`.

`codegraph affected app/server/src/routes/tests/index.ts app/server/.env.example e2e/tests/authoring.spec.ts app/server/src/services/question-content/export.ts` → `app/server/src/routes/tests/index.ts`, `e2e/tests/authoring.spec.ts`. Новые файлы не в индексе; их тесты — `config/export.test.ts` и `routes/tests/export-routes.test.ts` (прямой импорт), плюс через маршрут — `question-relocation.characterization.test.ts` и `teacher-zone-tests.matrix.test.ts` (экспорт), обе зелёные в `yarn verify`.

## Инвентарь маршрутов

`node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server routes:inventory` — `wrote 121 lines`; `git diff app/server/route-inventory.txt` пуст: цепочки `validateUUID(id) > sessionRequired > <anonymous>` и `sessionRequired > <anonymous>` не изменились.

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/config/export.test.ts src/routes/tests/export-routes.test.ts` — 2 файла, 19 passed (`export-routes.test.ts` трижды подряд 12 из 12).
- `node --test scripts/storage-no-private-access.test.mjs` — 8 pass, 0 fail.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests src/services/question-content src/config` — 29 файлов, 616 passed.
- `node scripts/check-env-contract.mjs` — OK.
- `yarn workspace @bio-exam/server typecheck` — чисто.
- `yarn oxfmt --check .` — все файлы в формате.
- `yarn verify` — `yarn verify: OK` (server 1670, web 1272, exam-core 605, rbac 9; лог `scratchpad/08-17-verify.log`; повторный прогон после последнего серверного теста).
- `yarn e2e` — 194 passed, 0 failed (chromium-desktop и chromium-mobile; лог `scratchpad/08-17-e2e.log`). Последняя правка после него — только серверный vitest-файл, e2e не перезапускался. Строки `[WebServer] ⨯ Error: ... /admin/attempts/not-a-uuid failed: status 400` — штатный вывод сценария страниц сервера.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-17` — `08-17 changed only its files`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Снятие заголовков ZIP при отказе потока до первого байта**
- **Found during:** Task 1
- **Issue:** в потоковом режиме заголовки ставятся до `streamArchive`; при сбое чтения раньше первой записи в `res` обработчик ошибок `app.ts` отдал бы JSON 503 с `Content-Type: application/zip` и `Content-Disposition: attachment` (`res.json` не перезаписывает заданный `Content-Type`).
- **Fix:** `clearArchiveHeaders(res)` перед пробросом ошибки.
- **Files modified:** `app/server/src/routes/tests/export-response.ts`, `app/server/src/routes/tests/export-routes.test.ts`
- **Наблюдение:** сбой чтения хранилища через маршрут даже на единственной картинке теста приходит уже после заголовков (буферные записи `settings.json` и `prompt.md` успевают попасть в `res`), поэтому ветка до первого байта на практике достижима только синхронными отказами `streamZip` (`ZipEntryNameError`, заранее отменённый сигнал). Тест ветки — `sendArchive` в отдельном Express с недопустимым именем записи.

**2. Порядок тестов.** Строки behavior Task 2 (потолок, отмена, обрыв, тема) лежат в том же `export-routes.test.ts` и написаны вместе с Task 1; красный прогон один на оба таска (`08-17-red1.log`).

**3. `e2e/fixtures/zip.ts` не создан** (необязательный файл плана): импорт `app/server/src/test-support/zip.ts` работает в Playwright.

## Threat Flags

Новой поверхности нет. T-8-39: потолок буфера прерывает сборку (чтений меньше числа ключей), поток с отменой по закрытию соединения. T-8-40: заголовки ZIP только в `sendArchive` после шва и `prepare…`, тесты 403/404 в потоке и буфере. T-8-41: пустое и пробельное значение — умолчание, неверное — отказ старта с именем ключа. T-8-70: `routes/tests` не импортирует `services/storage`, `EXCEPTIONS` пуст, гард зелёный. T-8-42: событие `export_stream_failed` с id теста или slug темы.

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. **D-27, preview Vercel (STOP PERF-04).** В окружении **preview** server-проекта Vercel задать `EXPORT_ZIP_MAX_BYTES=0` (production не трогать: там ключ не задаётся). Открыть preview, экспортировать самую крупную тему:
   - DevTools → Network → запрос `.../api/tests/topics/<slug>/export`: время до первого байта заметно меньше общего (ответ идёт частями);
   - архив больше 4 400 000 байт приходит целым и открывается, либо платформа обрывает его с ошибкой — записать, что именно;
   - общее время экспорта крупнейшей темы против `maxDuration: 30` в `app/server/vercel.json`.
   Если больше 30 с или архив больше 4 400 000 байт не пришёл — STOP: на Vercel ключ не задаётся (лимит по умолчанию), в SUMMARY фазы записывается альтернатива (архив в объектном хранилище с подписанной ссылкой или выгрузка через диск на VPS) — только отчёт. Сводно в 08-28. После проверки убрать ключ из preview.
2. **VPS (Milestone 2).** В Compose сервера задать `EXPORT_ZIP_MAX_BYTES=0`; код не меняется.
3. Коммит файлов плана делает ведущая сессия.

## Передачи следующим планам

- 08-26, 08-27 (нарезка `routes/tests/index.ts`): тела обработчиков экспорта — три строки после проверок (`prepare…Archive` → `return await sendArchive(req, res, prepared)`), переносятся дословно; вся логика доставки в `routes/tests/export-response.ts`. Обработчики анонимные — строки инвентаря 87–88 не меняются.
- 08-26, 08-27: `sendArchive` не бросает после отправки заголовков; ошибки до заголовков — `next(e)` из обработчика.
- 08-28: режим задаётся только `EXPORT_ZIP_MAX_BYTES` при старте процесса; бенчмарк `zip` от маршрута не зависит. События лога: `export_stream_failed` (error), `export_stream_aborted` (info).
- Любой план, читающий `EXPORT_ZIP_LIMIT`: значение фиксируется при загрузке модуля; тесты с другим режимом поднимают свой `startAuthApp(prefix, { env: { EXPORT_ZIP_MAX_BYTES } })`.
- `buildTestArchive`/`buildTopicArchive` маршрут больше не вызывает; их используют только `export.test.ts` и `export-equivalence.test.ts`.

## Файлы к коммиту

- `app/server/src/config/export.ts` (новый)
- `app/server/src/config/export.test.ts` (новый)
- `app/server/src/routes/tests/export-response.ts` (новый)
- `app/server/src/routes/tests/export-routes.test.ts` (новый)
- `app/server/src/routes/tests/index.ts`
- `app/server/.env.example`
- `e2e/tests/authoring.spec.ts`

## Self-Check: PASSED

- Созданные файлы на месте: `config/export.ts`, `config/export.test.ts`, `routes/tests/export-response.ts`, `routes/tests/export-routes.test.ts`.
- Коммитов нет по правилу пользователя: `commits: 0`, HEAD до и после 754b3aedc044679e54264da9ba404f12af8a2683, изменения в рабочем дереве (7 файлов).
