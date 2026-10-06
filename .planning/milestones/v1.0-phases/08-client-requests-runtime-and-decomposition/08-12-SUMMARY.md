---
phase: 08-client-requests-runtime-and-decomposition
plan: 12
subsystem: server/storage
tags: [zip, streaming, storage, PERF-04, PERF-05, D-24, D-25]
status: complete
deferred_human_gate: false

requires:
  - phase: 08-02
    provides: база замеров «до» (zip.receiverPeakBytes равен размеру архива)
provides:
  - streamZip(entries, sink, { missing, signal, readAhead, onRead }) в services/storage/zip.ts
  - createCeilingBuffer(limitBytes) — приёмник «буфер с потолком» (D-25)
  - ZIP_READ_AHEAD = 4, ZipLimitExceededError
  - services/storage/zip-stream.test.ts — эквивалентность с buildZip, окно чтения, backpressure, отмена, отказы чтения, потолок
affects: [08-14, 08-17, 08-28]

actuals:
  tokens: 6200
  tasks: 3
  commits: 0
plan_head_before: 42a36bb8df5b858546cb555cc172762bbed6f771
plan_head_after: 42a36bb8df5b858546cb555cc172762bbed6f771

tech-stack:
  added: []
  patterns:
    - "Окно чтения: начатые чтения минус обработанные записи (событие archiver 'entry' или пропуск отсутствующего ключа) ≤ readAhead; слот освобождается по 'entry', а не по append"
    - "Исход чтения — значение { ok, data } | { ok: false, error } с обработчиком при создании; ошибка бросается, когда упаковка доходит до записи по порядку"
    - "Отказ: unpipe приёмника, archive.abort(), archive.resume() (дочитать текущую запись в никуда), reject; слушатели error и warning archiver и приёмника не снимаются"

key-files:
  created:
    - app/server/src/services/storage/zip-stream.test.ts
  modified:
    - app/server/src/services/storage/zip.ts

key-decisions:
  - "Буферные записи тоже занимают слот окна: окно считается по всем записям, а не только по ключам; ограничение строже, чем в плане, память не больше"
  - "При отказе streamZip отсоединяет архив от приёмника (unpipe) и не завершает и не уничтожает приёмник: решение об обрыве ответа принимает вызывающий (08-17)"
  - "AbortError: signal.reason, если это Error с name 'AbortError', иначе DOMException('streamZip: aborted', { name: 'AbortError', cause: signal.reason })"
  - "createCeilingBuffer при превышении сбрасывает накопленные фрагменты и завершает запись ошибкой ZipLimitExceededError; buffer() после превышения бросает ZipLimitExceededError; peakBytes() считает и фрагмент, на котором сработал потолок"
  - "missing ведёт себя как у buildZip: переданный массив дополняется не найденными ключами по порядку записей и возвращается в результате"

metrics:
  duration: 25min
  completed: 2026-10-05
---

# Phase 8 Plan 12: Ядро потокового ZIP в модуле хранилища Summary

**`streamZip` пишет архив `archiver` (zlib 9) в любой `Writable` с окном опережающего чтения `ZIP_READ_AHEAD = 4`, освобождением окна по событию `entry`, отменой через `AbortSignal` и поглощением отказов чтения; `createCeilingBuffer` прерывает сборку при превышении лимита. На образцах D-24 имена, порядок и sha256 записей совпадают с `buildZip`.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Выполнено

### Task 1 (tracer): streamZip одной записи

- Снимок: `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs snapshot 08-12` → `fingerprint 08-12 0 paths`.
- RED: тест импортировал `streamZip` и `createCeilingBuffer`, которых не было: `TypeError: createCeilingBuffer is not a function`, 2 failed.
- GREEN: последовательный `streamZip` (проверка имён, `archive.pipe(sink)`, `missing-files.txt` в конце, разрешение по `finished(sink)`) и `createCeilingBuffer` без потолка; 2 passed.
- Проверка трассера перед расширением: тот же прогон, 2 passed.

### Task 2: окно, backpressure, отмена, потолок, эквивалентность

- RED: 13 новых тестов, 9 failed (`lead 40` у медленного приёмника — последовательное чтение не ждёт упаковки; нет отклонения AbortError; нет `ZipLimitExceededError`; нет `ZIP_READ_AHEAD`).
- GREEN: оконный `streamZip` и потолок `createCeilingBuffer`; 15 passed.
- Мутационная проверка тестов (изменение откатывалось сразу):
  - без `.catch` у промиса чтения падают 3 теста «все чтения отклонены», «позднее раньше раннего», «отмена и отклонения» (необработанные отклонения);
  - без ограничения окна падают 7 тестов (одновременные чтения, медленный приёмник, отмена, сбой на 10-й записи, позднее раньше раннего, отмена и отклонения, потолок).
- Тесты archiver наблюдают через `vi.mock('archiver')`, который оборачивает настоящий `archiver`: считает `append`, события `entry` и вызовы `abort`.

### Task 3: affected, verify, сверка

- `yarn verify: OK`; `08-12 changed only its files`.

## Числа для таблицы 08-28 (из `zip-stream.test.ts`, вывод с `--silent=false` и в логе `yarn verify`)

| Метрика | Значение | Условия |
|---|---|---|
| Максимум одновременных чтений | 4 (= `ZIP_READ_AHEAD`) | 40 ключей по 4 КБ, адаптер с задержкой 10 мс |
| Максимум «начато чтений − упаковано записей» | 4 | 40 ключей по 64 КБ (случайные байты), приёмник `highWaterMark` 1024 и задержка записи 1 мс |
| Пиковый объём прочитанных, но не упакованных данных | 262 144 байт (= 4 × 65 536) | тот же прогон; архив 2 627 450 байт |
| `peakBytes()` потолка | 311 688 байт при лимите 300 000, последний фрагмент 16 384 | 40 ключей по 64 КБ; чтений до остановки 8 из 40 |

В «до» (08-02) `zip.receiverPeakBytes` равен размеру архива; с потолком пик ограничен лимитом плюс один фрагмент archiver.

Память сверх окна: собственный буфер `archiver` (`highWaterMark` 1 МБ в `archiver/lib/core.js:36`) и буферы zlib — D-24 это допускает («+ внутренние буферы archiver»); настройки `archiver` не менялись, чтобы совпадать с `buildZip`.

## codegraph

`codegraph` в worktree не инициализирован; запросы выполнены по индексу основного дерева (тот же код `zip.ts` до плана).

`codegraph impact buildZip` — 9 символов: `zip.ts` `buildZip:56`; `question-content/export.ts` `buildTestArchive:152`, `buildTopicArchive:170`; `question-content/export.test.ts`; `routes/tests/index.ts` (`GET /api/tests/:id/export`, `GET /api/tests/topics/:slug/export`); `question-content/index.ts`.

`codegraph impact ZipEntry` — 15 символов: `zip.ts` (`ZipEntry`, `buildZip`, `assertEntryNames`); `export.ts` (`buildTestArchive`, `buildTopicArchive`, `collectTestParts`, `byName`, `sharedAssetEntries`, `withBase`, `TestParts`); `export.test.ts`; `routes/tests/index.ts` (`GET /api/tests/topics/:slug/export`); `question-content/index.ts`.

`buildZip` и `ZipEntry` не изменены; существующие вызывающие не затронуты.

`codegraph affected app/server/src/services/storage/zip.ts app/server/src/services/storage/zip-stream.test.ts`:

```
app/server/src/routes/tests/index.ts
app/server/src/services/question-content/export.test.ts
app/server/src/services/storage/zip-stream.test.ts
```

`export.test.ts` и тесты маршрутов прошли в `yarn verify` без правок.

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/storage/zip-stream.test.ts` — 15 passed.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/storage` — 6 файлов, 272 passed (тесты хранилища фазы 7 без правок).
- Проверка «Unhandled» из плана — `no unhandled rejections`, код 0.
- `yarn verify` — `yarn verify: OK` (server 1639 passed, web 1198, exam-core 605, rbac 9); слово «Unhandled» в логе не встречается.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-12` — `08-12 changed only its files`.
- `yarn oxfmt` по каждому файлу; комментариев в коде нет.

## Deviations from Plan

### Решения исполнителя (автономно)

1. **`streamZip` — не `async`-функция:** ошибки проверки имён и уже отменённый сигнал возвращаются как `Promise.reject`, без чтений и без создания архива. Сигнатура из `<interfaces>` сохранена.
2. **Добавлен экспорт типов `StreamZipResult` и `CeilingBuffer`** — для 08-14 и 08-17; в `<interfaces>` их не было, форма та же.
3. **Тест «отмена до старта»** (уже отменённый сигнал → AbortError без чтений) добавлен сверх behavior.
4. **`readAhead` не конечное число (`NaN`, `Infinity`) → `ZIP_READ_AHEAD`**, дробное округляется вниз, минимум 1: иначе при `NaN` окно не открывалось бы и вызов не завершался.
5. **Ветка `AbortError` с собственным `signal.reason`** тестами не покрыта; на Node 24 `new DOMException('streamZip: aborted', { name: 'AbortError', cause })` проверен вручную (`node -e`: `name` = `AbortError`, `cause` сохраняется, `instanceof Error`).
6. **Три строки `console.info('zip-stream metrics: …')` в тесте оставлены:** числа для таблицы 08-28 видны в логе `yarn verify` без отдельного прогона.

Иначе план выполнен как написан.

## Threat Flags

Нет новой поверхности: модуль не открывает маршрутов и не меняет порт хранилища. T-8-27, T-8-28, T-8-29, T-8-68 закрыты тестами из Task 1–2.

## Known Stubs

Нет.

## Deferred human verification

Нет шагов пользователя. Коммит файлов плана делает ведущая сессия.

## Передачи следующим планам

- **08-14 (экспорт):** `streamZip(entries, sink, { missing, signal })` принимает те же записи, что `buildZip`; `missing` дополняется на месте (как у `buildZip`), в каждый сборщик передавать свой массив. Промис разрешается по `finish` приёмника, поэтому приёмник подключается только через `streamZip` (он сам делает `archive.pipe(sink)` с завершением).
- **08-17 (маршруты, ключ env):** `ZipLimitExceededError` (`limitBytes` в поле) — признак 413 с текстом фазы 7 для приёмника `createCeilingBuffer(limit)`; при успехе тело — `ceiling.buffer()`, после превышения `buffer()` бросает. При любом отказе `streamZip` отсоединяет архив от приёмника и не завершает его: для потокового ответа (`0`) маршрут сам уничтожает `res` при отклонении; `AbortSignal` маршрута отклоняет вызов `AbortError`, закрытие приёмника до `finish` даёт `ERR_STREAM_PREMATURE_CLOSE`.
- **08-28 (замеры):** `onRead(key, bytes)` вызывается после каждого найденного объекта (не после отсутствующего и не после отмены); числа «после» для таблицы — выше.

## Файлы к коммиту

- `app/server/src/services/storage/zip.ts` (изменён)
- `app/server/src/services/storage/zip-stream.test.ts` (новый)

## Self-Check: PASSED

- FOUND: app/server/src/services/storage/zip.ts (`ZIP_READ_AHEAD`, `streamZip`, `createCeilingBuffer`, `ZipLimitExceededError`, `.read(`)
- FOUND: app/server/src/services/storage/zip-stream.test.ts (`sha256`)
- Коммитов нет по правилу пользователя; `git status` — только два файла плана.
