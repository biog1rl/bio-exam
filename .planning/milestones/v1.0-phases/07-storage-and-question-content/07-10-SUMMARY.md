---
phase: 07-storage-and-question-content
plan: 10
subsystem: question-content
tags: [question-content, storage, write, order, search, access-policy, d-08, d-09, d-11, d-13, qcon-04]

requires:
  - phase: 07-storage-and-question-content
    provides: "07-03: характеризация записи вопроса с красными STOR-D6a, STOR-D6b, STOR-save-order-holes"
  - phase: 07-storage-and-question-content
    provides: "07-07: модуль services/question-content (paths.ts, read.ts, index.ts)"
  - phase: 07-storage-and-question-content
    provides: "07-01: storage(), memoryStorage с failOn, StorageUnavailableError"
provides:
  - "services/question-content/write.ts: createTestWithQuestions, createQuestion, updateQuestion, writeContentFiles, syncQuestionDerived, resolveQuestionPoints, CONTENT_CHANGED_MESSAGE"
  - "services/question-content/order.ts: lockTest, resequenceQuestions, insertAt, тип Tx"
  - "paths.ts: newRevision, contentKey (ключ prompt-<rev>.md, explanation-<rev>.md)"
  - "question-documents.ts: upsertQuestionSearchDocument и updateQuestionSearchDocumentLocation с исполнителем (db или tx), без pgPool"
  - "POST /api/tests/save, POST /api/tests/:id/questions, PATCH /api/tests/:id/questions/:questionId делегируют модулю, доступ через canWriteTopic и canWriteTest"
affects: [07-12, 07-13, 07-14, 07-15, phase-05]

actuals:
  tokens: 14500
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Запись содержимого: файлы в новый ключ ревизии → одна транзакция (lockTest, FOR UPDATE строки, указатели, ключ ответа, документ поиска) → удаление прежних объектов после commit; компенсация при сбое транзакции; лог [question-content] orphan objects"
    - "Внутри транзакции только tx: пул в тестах 2 соединения, обращение к db внутри транзакции при параллельных запросах вешает пул"
    - "Перенумерация одним UPDATE … FROM (VALUES …) только для изменившихся строк"

key-files:
  created:
    - app/server/src/services/question-content/order.ts
    - app/server/src/services/question-content/write.ts
    - app/server/src/services/question-content/write.test.ts
  modified:
    - app/server/src/services/question-content/paths.ts
    - app/server/src/services/question-content/index.ts
    - app/server/src/services/search/question-documents.ts
    - app/server/src/routes/tests/index.ts
    - app/server/src/routes/tests/question-content.characterization.test.ts

key-decisions:
  - "lockTest возвращает { id, slug, topicId } заблокированной строки: сверка slug идёт по значению из той же блокировки"
  - "Прежний объект удаляется после commit, только если ни одна строка questions на него больше не ссылается (проверка внутри транзакции)"
  - "createTestWithQuestions перенумеровывает в порядке клиента со стабильной сортировкой (order, индекс в массиве): created_at в одной транзакции одинаковый"
  - "createTestWithQuestions сверяет slug темы внутри транзакции под FOR SHARE строки темы, расхождение → 409 «Содержимое изменилось, повторите»"
  - "Перенос вопроса (старый обработчик, переписывает 07-13) сохраняет имя файла прежнего указателя вместо жёсткого prompt.md"

requirements-completed: [QCON-04]
requirements-partial: [QCON-01, QCON-03, QCON-05]

coverage:
  - id: D1
    description: "Правка вопроса пишет промпт в новый ключ ревизии до транзакции; сбой записи — 503, прежний промпт, указатель и ключ ответа не тронуты (STOR-D6a, STOR-D6b обычные)"
    requirement: QCON-04
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-content.characterization.test.ts#STOR-D6a"
        status: pass
      - kind: characterization
        ref: "app/server/src/routes/tests/question-content.characterization.test.ts#STOR-D6b"
        status: pass
    human_judgment: false
  - id: D2
    description: "Порядок D-09: компенсация при сбое транзакции (правка и создание), лог сирот при сбое удаления после commit, документ поиска откатывается вместе с транзакцией"
    requirement: QCON-01
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/write.test.ts#правка вопроса"
        status: pass
      - kind: integration
        ref: "app/server/src/services/question-content/write.test.ts#создание вопроса"
        status: pass
    human_judgment: false
  - id: D3
    description: "Гонки R4: переименование теста во время записи файлов → 409 с удалением новых файлов; прежние указатели для удаления читаются внутри транзакции"
    requirement: QCON-01
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/write.test.ts#гонка с переименованием"
        status: pass
      - kind: integration
        ref: "app/server/src/services/question-content/write.test.ts#прежний указатель читается внутри транзакции"
        status: pass
    human_judgment: false
  - id: D4
    description: "Один механизм порядка: lockTest + resequenceQuestions; /save с дырами даёт 0…n-1 (STOR-save-order-holes обычная), 6 параллельных POST без дублей и дыр"
    requirement: QCON-03
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-content.characterization.test.ts#STOR-save-order-holes"
        status: pass
      - kind: integration
        ref: "app/server/src/services/question-content/write.test.ts#параллельные POST дают порядок 0…n-1 без повторов"
        status: pass
    human_judgment: false
  - id: D5
    description: "settings.json больше не пишется: writeTestSettingsFile и оба вызова удалены"
    requirement: QCON-05
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/write.test.ts#POST /api/tests/save не пишет settings.json"
        status: pass
    human_judgment: false
  - id: D6
    description: "Доступ к трём маршрутам записи через canWriteTopic и canWriteTest; студент получает 403 до разбора тела и поиска, в БД и хранилище ничего не меняется"
    requirement: QCON-01
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/write.test.ts#доступ к записи через scope.ts"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-10-04
status: complete
deferred_human_gate: true
plan_head_before: c6f50e5
plan_head_after: c6f50e5
---

# Phase 7 Plan 10: Запись содержимого вопроса Summary

**Создание теста, создание и правка вопроса идут через `services/question-content/write.ts`: промпт и пояснение пишутся в новый ключ `prompt-<12 hex>.md` до транзакции, транзакция под `lockTest` и `FOR UPDATE` строки вопроса меняет строку, ключ ответа, указатели и документ поиска, прежние объекты удаляются после commit; сбой транзакции удаляет новые файлы, гонка с переименованием даёт 409. Порядок вопросов поддерживает одна `resequenceQuestions`, `settings.json` не пишется. D6 закрыт.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- Начало: 2026-10-04T11:56Z
- Конец: 2026-10-04T12:12Z
- Задач: 3
- Файлов: 8 (3 новых, 5 изменённых)

## Accomplishments

- `paths.ts`: `newRevision()` (12 hex из `crypto.randomBytes(6)`), `contentKey({ topicSlug, testSlug, questionId, kind, rev })` → `topics/<t>/<s>/questions/<id>/<kind>-<rev>.md`.
- `question-documents.ts`: обе функции принимают второй аргумент `executor: SqlExecutor = db` (`Pick<typeof db, 'execute'>`), SQL тот же через `executor.execute(sql\`…\`)`, импорт `pgPool` удалён. Вызовы в `e2e-seed.ts`, `backfill-question-search.ts` и в переносе вопроса работают через значение по умолчанию.
- `order.ts`:
  - `lockTest(tx, testId)` — `SELECT id, slug, topic_id FROM tests … FOR UPDATE`, нет строки → `ApiError(404, 'Test not found')`, возврат `{ id, slug, topicId }`;
  - `resequenceQuestions(tx, testId, arrange?)` — id по `(order, created_at, id)`, необязательная перестановка (другой набор id → ошибка), один `UPDATE … FROM (VALUES …)` только для строк с изменившимся `order`, возврат итогового порядка;
  - `insertAt(ids, id, position)` с ограничением позиции границами.
- `write.ts`:
  - `resolveQuestionPoints` перенесена из `routes/tests/index.ts` без изменений;
  - `writeContentFiles` пишет промпт всегда и пояснение только непустое (`text/markdown`, `upsert`), при сбое удаляет записанное в этом вызове и пробрасывает ошибку (сбой хранилища → 503);
  - `syncQuestionDerived(tx, …)` → `upsertQuestionSearchDocument(…, tx)`; сюда 07-15 добавит индекс ссылок;
  - `updateQuestion`: тест, тема, вопрос (404 с прежними текстами), проверка типа (400), файлы, транзакция `lockTest` → сверка slug теста и темы с ключами файлов (409 «Содержимое изменилось, повторите») → `SELECT prompt_path, explanation_path … FOR UPDATE` → строка вопроса, деактивация всех ключей ответа и версия `max + 1` (правило прежнее), `tests.updatedAt/updatedBy`, `syncQuestionDerived` → после commit удаление прежних указателей, прочитанных в транзакции;
  - `createQuestion`: id в модуле до записи файлов, транзакция `lockTest` + сверка slug, `count` внутри транзакции, вставка с явным `id`, ключ ответа версии 1, `resequenceQuestions` с `insertAt` на `min(max(order ?? count, 0), count)`, возврат `{ questionId, order }`;
  - `createTestWithQuestions`: тема (404), уникальность slug (409 `TEST_SLUG_EXISTS`), id и файлы всех вопросов до транзакции (сбой — удаление всего записанного), транзакция: сверка slug темы под `FOR SHARE`, тест, вопросы с явным `id`, ключи ответа, `syncQuestionDerived`, `resequenceQuestions`; возврат `{ test, topicSlug }`.
- Tracer (Task 1): `PATCH` вопроса со сбоем записи файла отвечает 503, в БД и хранилище всё прежнее — STOR-D6a и STOR-D6b зелёные как обычные проверки.

## Изменённые обработчики и функции `routes/tests/index.ts` (для слияния с фазой 5)

- Импорты:
  - `canReadTest, testScope` из `services/access-policy/index.js` → `canReadTest, canWriteTest, canWriteTopic, testScope`;
  - импорт из `services/question-content/index.js` расширен: `createQuestion, createTestWithQuestions, readAdminTest, readQuestionMarkdown, resolveQuestionPoints, updateQuestion`;
  - импорт из `services/search/question-documents.js` сужен до `updateQuestionSearchDocumentLocation` (нужен переносу вопроса).
  - Остальные импорты не менялись: `resolveEffectiveScoringRules`, `crypto`, `and`, `sql`, `answerKeys`, `storageService` используются в других обработчиках.
- Удалены функции `resolveQuestionPoints` (переехала в модуль, `syncQuestionPointsForTestByTypeConfig` вызывает импортированную) и `writeTestSettingsFile`.
- `POST /save`: регистрация `router.post('/save', sessionRequired(), async …)` без `requirePerm`; тело: `canWriteTopic(req, String(req.body?.topicId ?? ''))` → 403 `{ error: 'Forbidden' }`, разбор `SaveTestSchema` (400 с `details`), `await ensureGlobalScoringRules(userId)`, проверка вопросов по глобальной карте типов (прежний 400 с `details.fieldErrors.questions`), `createTestWithQuestions`, ответ 201 `{ test: { ...test, topicSlug } }`.
- `PATCH /:id/settings`: убраны `effectiveScoringRules` и вызов `writeTestSettingsFile`; `await ensureGlobalScoringRules(userId)` остался отдельной строкой. Остальное тело (перенос префикса, `moveDirectory`, `assetsMoved`) не тронуто, его переписывает 07-12.
- `POST /:id/questions`: регистрация `validateUUID('id'), sessionRequired()` без `requirePerm`, в одну строку; тело: `canWriteTest(req, testId)` → 403, разбор `SaveQuestionSchema` (400 с `details`), `createQuestion`, ответ 201 `{ ok: true, questionId, order }`.
- `PATCH /:id/questions/:questionId`: регистрация `validateUUID('id'), validateUUID('questionId'), sessionRequired()` без `requirePerm`; тело: `canWriteTest(req, testId)` → 403, разбор (400 с `details`), `updateQuestion`, ответ `{ ok: true, questionId }`. Запись версий ключа ответа (деактивация всех и вставка `max + 1` в той же транзакции) переехала в `updateQuestion` без изменения правила.
- `POST /:id/questions/:questionId/move` (вне трёх обработчиков плана, см. Deviations): новые указатели строятся как `${newQuestionPath}/${path.posix.basename(<прежний указатель>)}` вместо жёстких `prompt.md` и `explanation.md`. Остальное тело не тронуто, его переписывает 07-13.

## codegraph impact (D-24, до правок)

Индекс основного дерева.

- `upsertQuestionSearchDocument` (question-documents.ts:60): 11 символов — `POST /api/tests/save`, `POST /api/tests/:id/questions`, `PATCH /api/tests/:id/questions/:questionId`; `scripts/e2e-seed.ts` `main`; `scripts/backfill-question-search.ts` `main`; `services/search/index.ts`; `routes/index.ts`.
- `updateQuestionSearchDocumentLocation` (question-documents.ts:88): 5 символов — `POST /api/tests/:id/questions/:questionId/move`, `services/search/index.ts`, `routes/index.ts`.
- `resolveQuestionPoints` (routes/tests/index.ts:152): 13 символов — `syncQuestionPointsForTestByTypeConfig` и через неё `PATCH`/`DELETE /question-types/:key`, `PUT`/`DELETE /question-types/tests/:id/overrides/:key`, `PUT /scoring-rules/global`, `PUT /scoring-rules/tests/:id`; напрямую `POST /save`, `POST /:id/questions`, `PATCH /:id/questions/:questionId`.
- `writeTestSettingsFile` (routes/tests/index.ts:164): 5 символов — `POST /api/tests/save`, `PATCH /api/tests/:id/settings`.

## codegraph affected (Task 3)

Из основного дерева по восьми файлам плана: 42 файла. Сервер: `db/answer-keys-jsonb.test.ts`, `db/timestamps.test.ts`, `lib/logger.test.ts`, тесты `routes/auth/*` (6), `routes/tests/access-routes.test.ts`, `exam-flow.test.ts`, `question-content.characterization.test.ts`, `routes/uploads.test.ts`, `services/access-policy/{policy,scope}.test.ts`, `services/question-content/write.test.ts`, `services/session/cookies.test.ts`, `services/storage/storage-memory-default.test.ts`. Web: клиенты админки тестов, `TestRunner.tsx`, `lib/tests/api.ts`, `lib/session/*.test.ts`, `proxy.test.ts`. e2e: `fixtures/exam.ts`, `tests/{auth,authoring,review,session}.spec.ts`. Серверные и web-тесты прогнаны в `yarn verify`, e2e — отдельным `yarn e2e` (ниже).

## TDD (Task 2)

- Порядок по сути нарушен: `order.ts`, `createQuestion` и `createTestWithQuestions` написаны вместе с Task 1 до `write.test.ts`. Чтобы получить честный RED, новый тест прогнан против HEAD-версии `routes/tests/index.ts` (временная подмена `git show HEAD:… >` файла с восстановлением и `cmp`): `Tests 6 failed | 11 passed (17)`. Красные: вставка на позицию 0 (нет ревизии ключа), `settings.json` пишется, ключи ревизии при правке, лог сирот, гонка с переименованием, чтение указателя в транзакции.
- Параллельный тест в первой версии (два POST с `order: 1`) против HEAD проходил: сдвиг `+1` сериализуется блокировками строк. Тест переделан на 6 параллельных POST без `order` (дописывание в конец, где прежний `count` вне транзакции давал дубли): против HEAD красный, на новом коде зелёный в трёх прогонах подряд.
- Проверки сбоя транзакции против HEAD проходили (прежний код писал файлы после commit). Их сила проверена мутациями модуля: без удаления новых файлов в `withCompensation` — 3 красных (оба сбоя транзакции и гонка с переименованием); без сверки slug — красная гонка с переименованием. Модуль восстановлен, `cmp` подтвердил.
- GREEN: `write.test.ts` 17 из 17.
- Коммиты RED/GREEN не делались (правило пользователя).

## Решения исполнителя (автономно)

1. `lockTest` возвращает `{ id, slug, topicId }` заблокированной строки (план: `SELECT id … FOR UPDATE`). Сверка slug и `topic_id` документа поиска берутся из той же блокировки, второй запрос к `tests` не нужен. 07-12 и 07-13 могут игнорировать возврат.
2. Прежний объект после commit удаляется, только если внутри транзакции ни одна строка `questions` (ни `prompt_path`, ни `explanation_path`) на него не ссылается. Защита от общих указателей в старых данных; удаление чужого промпта необратимо.
3. `createTestWithQuestions` перенумеровывает через `arrange` со стабильной сортировкой по `(order клиента, индекс в массиве)`. `created_at` в одной транзакции одинаковый, и без этого дубли клиентского `order` упорядочивались бы по случайному `id`.
4. `createTestWithQuestions` сверяет slug темы внутри транзакции под `FOR SHARE`: строки теста ещё нет, блокировать нечего, а переименование темы (07-12) иначе могло бы пройти между записью файлов и commit. `FOR SHARE` конфликтует только с `UPDATE` темы, цикла ожиданий с `lockTest` нет.
5. В `updateQuestion` и `createQuestion` строка темы не блокируется: переименование темы в 07-12 сначала берёт `lockTest` каждого теста темы, этого достаточно.
6. Вопрос, удалённый или перенесённый между проверкой и транзакцией, даёт внутри транзакции 404 «Вопрос не найден в текущем тесте» с удалением новых файлов.
7. `writeContentFiles` при сбое удаляет все ключи, которые пыталась записать, а не только успешно записанные (запись могла пройти на стороне адаптера и упасть по таймауту). Ключи новые, прежних объектов это не касается.
8. Ошибки 404/400/409 модуля — `ApiError`: текст `error` прежний, вне production `errorHandler` добавляет `requestId` (как в 07-07). Проверка `/save` по глобальной карте с `{ error, details }` осталась в маршруте.
9. `requirements-completed: [QCON-04]`; QCON-01, QCON-03, QCON-05 закрыты частично (перенос, удаление, reorder, ZIP — 07-12 … 07-14).

## Изменения поведения

- Новые и отредактированные промпты лежат в `prompt-<rev>.md` / `explanation-<rev>.md`; существующие `prompt.md` читаются по указателю, пока вопрос не отредактируют.
- Правка удаляет прежний промпт только после commit нового; при сбое записи файла — 503 вместо потери промпта (D6).
- Сбой транзакции после записи файлов — ответ 500 (ошибка БД) или 409 (гонка), новые файлы удалены.
- `/save` выравнивает порядок вопросов в 0…n-1, клиентский `order` задаёт только относительный порядок.
- Документ поиска пишется в транзакции записи; при сбое транзакции он прежний.
- `settings.json` при `/save` и `PATCH /:id/settings` больше не пишется.
- Студент получает 403 на трёх маршрутах до разбора тела и поиска, как раньше от `requirePerm`.
- До 07-14 ZIP-экспорт собирается листингом префикса теста, поэтому в архивах тестов, созданных или отредактированных после этого плана, лежат `prompt-<rev>.md` / `explanation-<rev>.md`, а не `prompt.md`. Имена без ревизии в ZIP (D-18) делает 07-14; проверок имён файлов архива сейчас нет.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Перенос вопроса терял промпт с ключом ревизии**
- **Found during:** Task 2, прогон `src/routes/tests`.
- **Issue:** старый обработчик `POST /:id/questions/:questionId/move` переносит каталог вопроса `moveDirectory` и ставит указатель `<новый каталог>/prompt.md`. Промпт из `/save` этого плана лежит в `prompt-<rev>.md`, поэтому после переноса указатель вёл на несуществующий объект. Две проверки `question-relocation.characterization.test.ts` упали: «перенос в существующий тест», «перенос в тему без теста с таким slug» (`null !== 'Уезжает'`).
- **Fix:** новые указатели сохраняют имя файла прежнего указателя: `${newQuestionPath}/${path.posix.basename(question.promptPath)}`, так же для пояснения. Для старых указателей `prompt.md` результат прежний. Обработчик целиком переписывает 07-13.
- **Files modified:** `app/server/src/routes/tests/index.ts` (входит в allow-list плана, правка вне трёх обработчиков плана).
- **Commit:** не выполнялся (правило пользователя).

**2. Замечание по тесту (не дефект кода):** параллельный тест в первой версии не ловил прежнюю гонку, переделан (раздел TDD).

Остальное выполнено по плану. Task 1 и Task 2 по факту сделаны одним проходом по коду (`lockTest` в `updateQuestion` стоит с самого начала). Поэтому после Task 1 `STOR-save-order-holes` уже проходил и был помечен vitest как «Expect test to fail». Id убран из `KNOWN_DEFECTS` в Task 2, как в плане.

## Verification

- Task 1: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/question-content.characterization.test.ts src/routes/tests/exam-flow.test.ts` → STOR-D6a и STOR-D6b зелёные как обычные проверки, `exam-flow` зелёный. Единственное падение — `STOR-save-order-holes: Expect test to fail` (порядок уже работал, см. Deviations), снято в Task 2. Проверка → `D6 closed`.
- Task 2: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/question-content src/routes/tests` → `Test Files 6 passed (6)`, `Tests 167 passed | 4 expected fail (171)`. Ожидаемые падения — id 07-12/07-13 в `question-relocation.characterization.test.ts`. Проверка → `writes through module`. `yarn workspace @bio-exam/server typecheck` → выход 0. Lint сервера: новых замечаний нет, прежние предупреждения (`keys.ts`, `app.ts`, `backfill-question-search.ts`, `public.ts`) к плану не относятся.
- Task 3: `yarn verify` → `yarn verify: OK`, все 8 шагов `passed`. Server: 36 файлов, `779 passed | 6 expected fail`; web 22 файла, 474; exam-core 11 файлов, 498; rbac 2.
- Дополнительно `yarn e2e` → `132 passed`. Единственный `✘` — известный дефект D1 фазы 5 (`@known-defect`, ожидаемое падение).
- Сверка с отпечатком `.planning/commit-snapshots/before-07-10/fingerprint.json` (0 путей до плана) → `07-10 changed only its files`.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. `<specifics>` п. 7 (часть): новые и отредактированные промпты пишутся в `prompt-<rev>.md` и `explanation-<rev>.md`. Read-only запрос на проде **до выкатки** (после неё он теряет смысл):
   `SELECT count(*) FILTER (WHERE prompt_path IS NULL) AS no_prompt, count(*) FILTER (WHERE prompt_path !~ '^topics/[^/]+/[^/]+/questions/[0-9a-f-]{36}/prompt\.md$') AS noncanonical FROM questions;`
2. `<specifics>` п. 8: тесты с дырами или дублями порядка выравниваются при следующей записи в тест (`/save` или создание вопроса). Read-only:
   `SELECT count(*) FROM (SELECT test_id FROM questions GROUP BY test_id HAVING count(*) <> count(DISTINCT "order") OR max("order") <> count(*) - 1 OR min("order") <> 0) t;`
3. Коммит файлов плана делает пользователь или оркестратор (список ниже).

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности вне `<threat_model>`: маршруты те же, права сужены до `canWriteTopic`/`canWriteTest` (сейчас равны `tests.write`).

## Файлы к коммиту

- app/server/src/services/question-content/order.ts (новый)
- app/server/src/services/question-content/write.ts (новый)
- app/server/src/services/question-content/write.test.ts (новый)
- app/server/src/services/question-content/paths.ts
- app/server/src/services/question-content/index.ts
- app/server/src/services/search/question-documents.ts
- app/server/src/routes/tests/index.ts
- app/server/src/routes/tests/question-content.characterization.test.ts

## Self-Check: PASSED

- Все 8 файлов существуют, `git status` показывает ровно их.
- Коммитов нет по правилу пользователя: `plan_head_before` = `plan_head_after` = `c6f50e5`.
