---
phase: 07-storage-and-question-content
plan: 14
subsystem: question-content
tags: [question-content, storage, export, zip, assets, access-policy, d-13, d-15, d-17, d-18, stor-05, qcon-05, asset-01]

requires:
  - phase: 07-storage-and-question-content
    provides: "07-06: parseStorageLink (links.ts), uploadImage (services/assets/images.ts)"
  - phase: 07-storage-and-question-content
    provides: "07-08 и 07-10: readFirstMarkdown, questionMarkdownCandidates, имена prompt-<rev>.md"
  - phase: 07-storage-and-question-content
    provides: "07-13: routes/tests/index.ts после переноса и удаления; характеризация 07-04 с KNOWN_DEFECTS STOR-zip-no-images и STOR-export-writes-answer-keys"
provides:
  - "services/question-content/asset-refs.ts: extractAssetRefs(text)"
  - "services/question-content/export.ts: buildTestArchive, buildTopicArchive, assertArchiveFits, ZIP_RESPONSE_LIMIT_BYTES = 4 400 000, ARCHIVE_TOO_LARGE_MESSAGE"
  - "services/storage/zip.ts: buildZip(entries, { missing }), ZipEntry, MISSING_FILES_ENTRY, ZipEntryNameError"
  - "services/question-content/read.ts: findFirstMarkdown(candidates) → { key, text } | null"
affects: [07-15, 07-16, phase-05, phase-08]

actuals:
  tokens: 12800
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "ZIP собирается из списка { name, key | buffer }: settings.json и answer_keys.json — буферы из БД, промпт и пояснение — буферы найденного markdown, картинки — ключи хранилища; отсутствующие ключи уходят в missing-files.txt"
    - "Лимит ответа — параметр limitBytes с умолчанием ZIP_RESPONSE_LIMIT_BYTES; Phase 8 заменяет умолчание ключом env без смены сигнатуры"
    - "Права маршрута с multipart — именованный middleware до multer (requireTestWrite → canWriteTest)"

key-files:
  created:
    - app/server/src/services/question-content/asset-refs.ts
    - app/server/src/services/question-content/asset-refs.test.ts
    - app/server/src/services/question-content/export.ts
    - app/server/src/services/question-content/export.test.ts
    - app/server/src/services/storage/zip.ts
  modified:
    - app/server/src/services/question-content/read.ts
    - app/server/src/services/question-content/index.ts
    - app/server/src/routes/tests/index.ts
    - app/server/src/routes/uploads.test.ts
    - app/server/src/routes/tests/question-relocation.characterization.test.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts
    - app/web/app/(internal)/(protected)/admin/tests/TestsClient.tsx
    - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/TopicTestsClient.tsx

key-decisions:
  - "Глобальные правила в экспорте читаются без записи: строка test_scoring_settings 'global' через parseTestScoringRules (невалидная или отсутствующая → createDefaultTestScoringRules); ensureGlobalScoringRules, который вставляет строку, экспорт не вызывает"
  - "Промпт и пояснение: запись questions/<id>/<kind>.md только если кандидат найден; в missing-files.txt попадает ключ указателя, только когда указатель есть, а файла нет (у вопроса без пояснения explanation_path = null — это не пропуск)"
  - "answer_keys.json: вопросы в порядке order, затем id; только вопросы с активным ключом; при withAnswers=true файл есть всегда, в том числе []"
  - "Относительно префикса теста кладутся только ключи <testPrefix>/assets/…; прочие свои ключи (images/…, чужие тесты, avatars/…) — под полным ключом в корне архива"
  - "multer-константа upload у POST /:id/assets не менялась: фильтр mimetype остаётся первым барьером (ROUTES-тесты uploads.test.ts), подлинность — сигнатура в uploadImage"
  - "buildZip отклоняет повтор имени записи (как и .., пустой сегмент, ведущий /, обратный слеш, управляющие символы) до чтения хранилища"

requirements-completed: [STOR-05, QCON-05, ASSET-01]

coverage:
  - id: D1
    description: "extractAssetRefs: markdown с заголовком, HTML/JSX (\"…\", '…', {\"…\"}), Lexical JSON, устаревшие /uploads/tests/, прокси-URL, публичный URL Supabase; внешние URL, data: и ../ отбрасываются; результат отсортирован и без повторов"
    requirement: STOR-05
    verification:
      - kind: unit
        ref: "app/server/src/services/question-content/asset-refs.test.ts#extractAssetRefs"
        status: pass
    human_judgment: false
  - id: D2
    description: "ZIP теста: порядок settings.json → вопросы → картинки по имени → missing-files.txt; assets/<файл> для устаревшей картинки теста; settings.json из БД с updatedAt = tests.updated_at; answer_keys.json только при withAnswers; хранилище не меняется; сохранённые копии не попадают"
    requirement: QCON-05
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/export.test.ts#ZIP теста"
        status: pass
      - kind: characterization
        ref: "app/server/src/routes/tests/question-relocation.characterization.test.ts#STOR-zip-no-images, STOR-export-writes-answer-keys"
        status: pass
    human_judgment: false
  - id: D3
    description: "ZIP темы: тесты по order, затем slug, записи под <testSlug>/, общая картинка — одна запись images/ в корне, устаревшая — <testSlug>/assets/; тема вне зоны testScope → 403"
    requirement: STOR-05
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/export.test.ts#ZIP темы"
        status: pass
    human_judgment: false
  - id: D4
    description: "Лимит: buildTestArchive и buildTopicArchive с limitBytes 1024 → 413 с текстом; маршрут с картинкой 4 500 000 байт → 413 JSON без Content-Disposition; ZIP_RESPONSE_LIMIT_BYTES = 4 400 000"
    requirement: STOR-05
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/export.test.ts#лимит размера ZIP"
        status: pass
    human_judgment: false
  - id: D5
    description: "buildZip отклоняет .., пустой сегмент, ведущий /, обратный слеш и повтор имени; отсутствующий ключ добавляется к missing и в missing-files.txt"
    requirement: STOR-05
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/export.test.ts#buildZip"
        status: pass
    human_judgment: false
  - id: D6
    description: "POST /api/tests/:id/assets: PNG → 201 { url: images/<32 hex>.webp }, объект WebP; текст с типом image/png → 400; студент → 403 до разбора файла"
    requirement: ASSET-01
    verification:
      - kind: integration
        ref: "app/server/src/routes/uploads.test.ts#POST /api/tests/:id/assets"
        status: pass
    human_judgment: false
  - id: D7
    description: "Web показывает текст ошибки сервера в тосте экспорта (413 и прочие)"
    requirement: STOR-05
    verification:
      - kind: other
        ref: "Task 3 verify: export errors surfaced; yarn workspace @bio-exam/web typecheck"
        status: pass
    human_judgment: true
  - id: D8
    description: "Preview: ZIP теста с картинками и крупной темы (тост 413 вместо обрезанного файла)"
    requirement: STOR-05
    verification: []
    human_judgment: true

duration: 14min
completed: 2026-10-04
status: complete
deferred_human_gate: true
plan_head_before: dcd14ee
plan_head_after: dcd14ee
---

# Phase 7 Plan 14: ZIP теста и темы из модуля содержимого Summary

**ZIP теста и темы собирает `services/question-content/export.ts` из БД и хранилища: `settings.json` генерируется из строки теста, `answer_keys.json` — в памяти только при `withAnswers=true`, промпты и пояснения лежат под `questions/<id>/prompt.md` и `explanation.md` без ревизии, картинки из ссылок (`extractAssetRefs`) попадают в архив, отсутствующие — в `missing-files.txt`; архив больше 4 400 000 байт даёт 413 с текстом, который web показывает в тосте; `POST /api/tests/:id/assets` пишет `images/<hex>.webp` через `uploadImage`.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- Начало: 2026-10-04T13:04Z
- Конец: 2026-10-04T13:18Z
- Задач: 3
- Файлов: 13 (5 новых, 8 изменённых)

## Accomplishments

- `asset-refs.ts`: `extractAssetRefs(text)`. Текст, который после `trim()` начинается с `{` и разбирается `JSON.parse`, обходится как Lexical (узел, `children`, `root`; узлы `type: 'image'` со строковым `src`). Иначе — markdown `![alt](src "title")` и `![](<src>)`, HTML/JSX `<img src="…" | '…' | {"…"} | {'…'} | {`…`}>`. Каждый `src` идёт через `parseStorageLink`, в результат попадают только `kind: 'key'`; итог — отсортированный список уникальных ключей. Фильтра по `isServableImageKey` нет: 07-15 строит на этой функции инвентаризацию, где нужны и ключи вне `images/` и `topics/*/*/assets/`.
- `storage/zip.ts`: `buildZip(entries, { missing })`. Имена проверяются до чтения хранилища; записи с `key` читаются `storage().read` по одной, отсутствующие дописываются в переданный массив `missing`; непустой `missing` → последняя запись `missing-files.txt` (ключ на строку, завершающий перевод строки). `archiver('zip', { zlib: { level: 9 } })`, результат — буфер.
- `read.ts`: `findFirstMarkdown(candidates)` → `{ key, text } | null`; `readFirstMarkdown` = `(await findFirstMarkdown(c))?.text ?? ''`.
- `export.ts`:
  - `buildTestArchive({ testId, withAnswers, limitBytes = ZIP_RESPONSE_LIMIT_BYTES })` → `{ buffer, filename: '<тема>-<тест>.zip' }`; 404 теста и темы.
  - `buildTopicArchive({ topicSlug, withAnswers, scope, limitBytes = ZIP_RESPONSE_LIMIT_BYTES })` → `{ buffer, filename: '<тема>.zip' }`; 404 темы, затем `!scope.all && !scope.topicIds.includes(topic.id)` → 403 `Forbidden`; тесты по `order`, затем `slug`.
  - `assertArchiveFits(buffer, limitBytes)`: `buffer.length > limitBytes` → `ApiError(413, 'Архив слишком большой для выгрузки, экспортируйте тесты по отдельности')`.
  - `settings.json` — объект прежнего `writeTestSettingsFile` в том же порядке полей, `JSON.stringify(_, null, 2)`, `scoringRules = resolveEffectiveScoringRules({ globalRules, testOverrideRules: tests.scoring_rules })`, `useGlobalScoringRules = tests.scoring_rules == null`, `updatedAt = tests.updated_at.toISOString()`.
- `routes/tests/index.ts` (для слияния с фазой 5):
  - `GET /:id/export` — регистрация `validateUUID('id'), sessionRequired(), async …`; первой `canReadTest(req, id)` (403 `{ error: 'Forbidden' }`, в том числе для несуществующего id), затем `buildTestArchive`; ошибки (404, 413) уходят в общий обработчик до установки заголовков ZIP; затем `Content-Type: application/zip`, `Content-Disposition: attachment; filename="<filename>"`, буфер.
  - `GET /topics/:slug/export` — регистрация `sessionRequired(), async …`; первой `testScope(req)`, при `!scope.all && scope.topicIds.length === 0` → 403; затем `buildTopicArchive({ …, scope })`.
  - `POST /:id/assets` — регистрация `validateUUID('id'), sessionRequired(), requireTestWrite, upload.single('file'), async …`; `requireTestWrite` — именованная функция над маршрутом (`canWriteTest(req, req.params.id)`, отказ 403 `{ error: 'Forbidden' }`, ошибка → `next`). Тело: файл (400 «No file uploaded»), тест и тема (404 как раньше), `uploadImage(file.buffer)`, ответ 201 `{ url: key }`.
  - Импорты: удалены `crypto`, `fs`, `path`, `assertLegacyUploadsAllowed, storageService` из `storage/storage.js`; добавлены `type NextFunction, type Request, type Response` из `express`, `uploadImage` из `services/assets/index.js`, `buildTestArchive`, `buildTopicArchive` из модуля. Константа `upload` (multer) не менялась; устаревший комментарий над ней («сохраняем в папку assets рядом с тестом») удалён вместе со старым телом.
- `question-content/index.ts` реэкспортирует `extractAssetRefs`, `buildTestArchive`, `buildTopicArchive`, `assertArchiveFits`, `ARCHIVE_TOO_LARGE_MESSAGE`, `ZIP_RESPONSE_LIMIT_BYTES`, `type ArchiveResult`, `findFirstMarkdown`.
- Web: `readApiError` экспортирован из `test-editor-api.ts`; `exportTestArchive`, `TestsClient.handleExport`, `TestsClient.handleExportTopic`, `TopicTestsClient.handleExportTopic`, `TopicTestsClient.handleExportTest` при `!res.ok` бросают `new Error(await readApiError(res, 'Ошибка экспорта'))`; существующий `toast.error(err.message)` показывает текст сервера.
- Tracer (Task 1): вопрос с `![](images/x.webp)` → `GET /api/tests/:id/export` → запись `images/x.webp` в архиве. `<verify>` Task 1 прогнан до начала Task 2: 27 тестов зелёные, `relocation defects closed`. Отдельного `blocking-human` у tracer нет.

## Состав ZIP тестового теста (база для PERF-04)

Тест из `export.test.ts#ZIP теста` (два вопроса; у первого картинка `images/…b…webp` в промпте и `images/…a…webp` в пояснении, у второго устаревшая `/uploads/tests/<тема>/<тест>/assets/c.png` и отсутствующая `images/missing.webp`):

```
settings.json
questions/<q1>/prompt.md
questions/<q1>/explanation.md
questions/<q2>/prompt.md
assets/c.png
images/qcon-export-a-<hex>.webp
images/qcon-export-b-<hex>.webp
missing-files.txt
```

С `withAnswers=true` после `settings.json` идёт `answer_keys.json`. Тема из `export.test.ts#ZIP темы` (тесты b(order 0), a(order 1), c(order 1)):

```
<b>/settings.json
<b>/questions/<q1>/prompt.md
<b>/assets/l.png
<a>/settings.json
<a>/questions/<q2>/prompt.md
<c>/settings.json
<c>/questions/<q3>/prompt.md
images/qcon-export-shared-<hex>.webp
```

Порядок: внутри теста — `settings.json`, `answer_keys.json`, вопросы по `order` (затем `id`), для каждого вопроса `prompt.md`, `explanation.md`; затем картинки по имени; в теме собственные `assets/` теста идут после его вопросов, общие картинки — в конце по имени; `missing-files.txt` всегда последний.

## Изменённые ожидания тестов

- `question-relocation.characterization.test.ts`:
  - `KNOWN_DEFECTS` пуст: `STOR-zip-no-images` и `STOR-export-writes-answer-keys` теперь обычные тесты и зелёные (STOR-05, QCON-05).
  - В тестах экспорта теста и темы имя промпта в ZIP сверяется точно — новый помощник `zipPromptName` даёт `questions/<id>/prompt.md` (D-18: имена без ревизии; раньше регулярка допускала `prompt-<rev>.md`, который давал листинг префикса после 07-10). Регулярка `promptName` осталась для проверок `prompt_path` в БД (там ревизия есть).
- `uploads.test.ts`, раздел `POST /api/tests/:id/assets` (D-15):
  - было: ключ с префиксом `topics/biology/cell/assets/`, байты как у исходного PNG, `image/png`;
  - стало: ключ `^images/[0-9a-f]{32}\.webp$`, `image/webp`, формат WebP по sharp, под `topics/biology/cell` пусто; добавлены «текст с типом image/png → 400 «Поддерживаются только JPEG, PNG и WebP»» и «студент → 403 до разбора файла» (PNG и text/plain; text/plain без проверки прав дал бы 500 от фильтра multer). В `beforeAll` добавлен пользователь `uploads_student` с ролью `user`.
  - Цикл `ROUTES` для `tests/assets` (фильтр multer, 5 МБ, 401) не менялся.

## codegraph (D-24)

Индекс построен по основному дереву; номера строк — до 07-07…07-13.

- `codegraph impact createZip` (до правок): 6 символов — `StorageService::createZip` (storage.ts:139), `routes/tests/index.ts`, `GET /api/tests/:id/export`, `GET /api/tests/topics/:slug/export`, `routes/index.ts`, `storage.local.test.ts`. После плана `createZip` в продуктовом коде не вызывается (остался в `storage/storage.ts`, который вне allow-list плана).
- `codegraph impact extractImagePaths`: 4 символа — `extractImagePaths` и `TestRunner` (`app/web/components/tests/TestRunner.tsx`), `TestPageClient` и файл `tests/[topicSlug]/[testSlug]/start/TestPageClient.tsx`. Web-функция не менялась; серверная `extractAssetRefs` повторяет её обход узлов `image`.
- `codegraph impact buildTopicArchive`: `Symbol "buildTopicArchive" not found` — символ новый, индекса по worktree нет. По `rg` единственный вызов — `GET /api/tests/topics/:slug/export` в `routes/tests/index.ts`, плюс `export.test.ts`.
- `codegraph affected` по `read.ts`, `question-content/index.ts`, `routes/tests/index.ts`, `test-editor-api.ts`, `TestsClient.tsx`, `TopicTestsClient.tsx`: «Affected test files (4)» — `routes/tests/index.ts`, `TestsClient.tsx`, `[topicSlug]/TopicTestsClient.tsx`, `test-editor-api.ts` (индекс не видит новых тестов worktree). Фактический прогон: `vitest run src/services/question-content src/routes/tests src/routes/uploads.test.ts` — 11 файлов, 249 тестов; `yarn verify` — все пакеты.

## Verification

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/question-content/asset-refs.test.ts src/services/question-content/export.test.ts src/routes/tests/question-relocation.characterization.test.ts` — 3 файла, 27 тестов passed (Task 1).
- `relocation defects closed`.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/question-content src/routes/tests src/routes/uploads.test.ts` — 11 файлов, 249 тестов passed.
- `export and assets through modules`.
- `export errors surfaced`; `yarn workspace @bio-exam/web typecheck` — exit 0.
- `yarn verify` — `yarn verify: OK` (server: 863 passed, 1 expected fail — `STOR-delete-used-asset` в `docs/assets.characterization.test.ts`, закрывается в 07-15).
- Сверка с отпечатком — `07-14 changed only its files`.

## TDD

- Task 1 (tracer): `asset-refs.test.ts` написан вместе с `asset-refs.ts` и прогнан сразу; `export.test.ts` написан после `export.ts` и маршрута. Красными до правок были переключённые тесты характеризации (`STOR-zip-no-images`, `STOR-export-writes-answer-keys` шли как `test.fails`) и точное имя `questions/<id>/prompt.md` в ZIP теста (листинг давал `prompt-<rev>.md`).
- Task 2 (`tdd="true"`): реализация темы и `POST /:id/assets` сделана до тестов, затем добавлены тесты темы в `export.test.ts`, новые ожидания `uploads.test.ts` и точное имя промпта в ZIP темы в характеризации. На прежнем коде эти ожидания красные: листинг темы давал `prompt-<rev>.md` и не включал `images/`, загрузка писала `topics/…/assets/<hex>.png`. Отдельного красного прогона не было — отклонение от порядка RED → GREEN, записано здесь.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Предупреждение линтера no-control-regex в zip.ts**
- **Found during:** Task 3 (`yarn verify`, server lint 5 предупреждений вместо 4)
- **Issue:** регулярка `/[\u0000-\u001f\u007f]/` для управляющих символов в имени записи давала новое предупреждение.
- **Fix:** проверка через `charCodeAt` (`hasControlCharacter`).
- **Files modified:** app/server/src/services/storage/zip.ts
- **Commit:** не выполнялся (правило пользователя)

**2. [Rule 2 - Missing critical] Тесты buildZip (T-7-37)**
- **Found during:** Task 3
- **Issue:** отказ по `..`, ведущему `/` и пустому сегменту (митигация T-7-37) не проверялся тестом.
- **Fix:** раздел `buildZip` в `export.test.ts`: отказ для `../evil.txt`, `a/../../evil.txt`, `/etc/passwd`, `a//b.txt`, `a/./b.txt`, `a\b.txt`, пустого имени и повтора имени; порядок записей и дописывание `missing`.
- **Files modified:** app/server/src/services/question-content/export.test.ts

### Решения исполнителя (автономно)

- Глобальные правила читаются без вставки строки (см. key-decisions): экспорт — GET и не должен писать ни в хранилище, ни в БД.
- Пропуск в `missing-files.txt` — только ключ указателя, который есть в строке, но файл по кандидатам не найден.
- В `buildZip` повтор имени — ошибка; экспорт строит имена из разных ключей, повтор возможен только при теме с тестом slug `images` и картинкой `images/<имя совпадает с файлом теста>`.
- `answer_keys.json` при `withAnswers=true` есть всегда, в том числе `[]` для теста без вопросов (раньше файл не записывался, и архив был без него).
- `requireTestWrite` объявлен как `async function` над `router.post('/:id/assets')`, после константы `upload`.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности: маршруты те же, права стали строже (`canReadTest`, `testScope`, `canWriteTest` до multer), экспорт больше не пишет в хранилище.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. `<specifics>` п. 6, preview (07-16, D-27): скачать ZIP теста с картинками — в архиве есть `images/…`, при пропусках `missing-files.txt`; `settings.json` сгенерирован заново (`updatedAt` = время изменения теста); `answer_keys.json` только при выгрузке с ответами; сохранённые ранее `settings.json` и `answer_keys.json` из бакета в архив не попадают.
2. Лимит ответа Vercel (DA ревью; локально не проверяется): на preview скачать ZIP самой крупной темы с картинками. Архив больше 4 400 000 байт — тост «Архив слишком большой для выгрузки, экспортируйте тесты по отдельности», а не обрезанный файл или ошибка платформы (07-16 Task 4 п. 5).
3. `<specifics>` п. 11: `POST /api/tests/:id/assets` переведён на общий сервис (ключи `images/…`); удалить маршрут — решение пользователя.
4. Коммит файлов плана делает пользователь (или оркестратор по правилу коммитов в dev).

## Для следующих планов

- STOR-05 здесь закрыт частично (ZIP с картинками, `success_criteria` плана); отказ удаления используемой картинки (`STOR-delete-used-asset`) — 07-15, проверка на preview — 07-16.
- 07-15: `extractAssetRefs` не фильтрует по `isServableImageKey`, возвращает все ключи своего хранилища; `extractAssetLinks` из 07-15 выражается под ней без смены результата.
- Phase 8 (PERF-04, ключ env лимита): `buildTestArchive` и `buildTopicArchive` принимают `limitBytes`; заменить умолчание `ZIP_RESPONSE_LIMIT_BYTES` чтением env в одном месте `export.ts` или передавать значение из маршрута. Потоковый `buildZip` должен дать тот же список имён в том же порядке (см. раздел «Состав ZIP»).
- `StorageService.createZip` и `writeJson` в `storage/storage.ts` больше не вызываются продуктовым кодом; удаление — вне allow-list этого плана.

## Файлы к коммиту

- app/server/src/services/question-content/asset-refs.ts
- app/server/src/services/question-content/asset-refs.test.ts
- app/server/src/services/question-content/export.ts
- app/server/src/services/question-content/export.test.ts
- app/server/src/services/question-content/read.ts
- app/server/src/services/question-content/index.ts
- app/server/src/services/storage/zip.ts
- app/server/src/routes/tests/index.ts
- app/server/src/routes/uploads.test.ts
- app/server/src/routes/tests/question-relocation.characterization.test.ts
- app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts
- app/web/app/(internal)/(protected)/admin/tests/TestsClient.tsx
- app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/TopicTestsClient.tsx

## Self-Check: PASSED

- Все 13 файлов существуют и изменены относительно отпечатка `before-07-14` (`07-14 changed only its files`).
- Коммитов нет по правилу пользователя; `plan_head_before` = `plan_head_after` = `dcd14ee`.
