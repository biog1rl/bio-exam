---
phase: 07-storage-and-question-content
plan: 12
subsystem: question-content
tags: [question-content, storage, relocate, rename, access-policy, d-08, d-10, qcon-01, qcon-02]

requires:
  - phase: 07-storage-and-question-content
    provides: "07-04: характеризация переноса с красными STOR-rename-topic-files, STOR-rename-test-rollback"
  - phase: 07-storage-and-question-content
    provides: "07-10: write.ts (CONTENT_CHANGED_MESSAGE, ключи prompt-<rev>.md), order.ts (lockTest → { id, slug, topicId }), question-documents.ts с исполнителем"
  - phase: 07-storage-and-question-content
    provides: "07-01: storage() с copy и list, memoryStorage с failOn"
provides:
  - "services/question-content/relocate.ts: updateTestSettings, updateTopic, planRelocation, switchPointers, relocateQuestionObjects, COPY_CONCURRENCY, RELOCATION_FAILED_MESSAGE, PUBLISH_WITHOUT_QUESTIONS_MESSAGE"
  - "PATCH /api/tests/topics/:id и PATCH /api/tests/:id/settings делегируют модулю, доступ через canWriteTopic и canWriteTest"
  - "relocateQuestionObjects(pairs, switchInTx, { failureMessage }) для переноса вопроса в 07-13"
affects: [07-13, 07-14, phase-05]

actuals:
  tokens: 12700
  tasks: 4
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Переименование: копирование объектов под новый префикс (пакеты по COPY_CONCURRENCY = 8, Promise.allSettled) → транзакция (lockTest, сверка slug, состава тестов и вопросов, условный UPDATE указателей) → удаление источников после commit, только без ссылок"
    - "Существование кандидатов — одним list(<префикс теста>, { recursive: true }) на каждый различный префикс, без exists на кандидата"
    - "Условное переключение указателей одним UPDATE … FROM (VALUES …) с IS NOT DISTINCT FROM прежних значений, пакетами по 500, сумма rowCount меньше числа записей → 409"

key-files:
  created:
    - app/server/src/services/question-content/relocate.ts
    - app/server/src/services/question-content/relocate.test.ts
  modified:
    - app/server/src/services/question-content/index.ts
    - app/server/src/routes/tests/index.ts
    - app/server/src/routes/tests/question-relocation.characterization.test.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts

key-decisions:
  - "switchPointers — один пакетный UPDATE … FROM (VALUES …) на 500 записей вместо UPDATE на каждый вопрос; условие то же (IS NOT DISTINCT FROM прежних prompt_path и explanation_path)"
  - "В транзакции переименования сверяются slug и topic_id заблокированных тестов и slug тем (тема — FOR UPDATE при переименовании темы, FOR SHARE старой и новой темы при переименовании теста); расхождение → 409"
  - "updateTopic сверяет и состав тестов темы, не только вопросов: тест, созданный между планом и транзакцией, иначе остался бы под старым префиксом"
  - "Источник удаляется после commit, только если ни одна строка questions на него не ссылается (как в 07-10)"
  - "Пары переноса и указатели строятся для всех вопросов затронутых тестов, включая неизменные: условный UPDATE заодно проверяет, что их указатели не правили; updated_at меняется только у строк с новым значением"

requirements-completed: [QCON-02]
requirements-partial: [QCON-01]

coverage:
  - id: D1
    description: "Смена slug темы переносит объекты и указатели всех тестов темы (STOR-rename-topic-files обычная)"
    requirement: QCON-02
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-relocation.characterization.test.ts#STOR-rename-topic-files"
        status: pass
      - kind: integration
        ref: "app/server/src/services/question-content/relocate.test.ts#смена slug темы переносит файлы всех тестов темы"
        status: pass
    human_judgment: false
  - id: D2
    description: "Сбой копирования отменяет переименование: 503 «Не удалось перенести файлы, переименование отменено», slug и указатели прежние, под новым префиксом пусто (STOR-rename-test-rollback обычная)"
    requirement: QCON-02
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-relocation.characterization.test.ts#STOR-rename-test-rollback"
        status: pass
      - kind: integration
        ref: "app/server/src/services/question-content/relocate.test.ts#сбой копирования второго вопроса"
        status: pass
    human_judgment: false
  - id: D3
    description: "Сбой транзакции удаляет копии; сбой удаления после commit — 200 и лог [question-content] orphan objects"
    requirement: QCON-02
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/relocate.test.ts#сбой транзакции"
        status: pass
      - kind: integration
        ref: "app/server/src/services/question-content/relocate.test.ts#сбой удаления старого объекта после commit"
        status: pass
    human_judgment: false
  - id: D4
    description: "Гонки R4: правка и создание вопроса между копированием и транзакцией → 409, копии удалены, правка и новый вопрос на месте"
    requirement: QCON-02
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/relocate.test.ts#гонки с переименованием теста"
        status: pass
    human_judgment: false
  - id: D5
    description: "R5: источники ищутся одним list на префикс теста, exists не вызывается"
    requirement: QCON-02
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/relocate.test.ts#поиск источников без exists"
        status: pass
    human_judgment: false
  - id: D6
    description: "Устаревшие указатели и пустой prompt_path при существующем объекте переносятся в канонический ключ; картинки, settings.json и answer_keys.json не переносятся; смена темы обновляет topic_id документов поиска; без смены slug и темы нет assetsMoved и копий"
    requirement: QCON-02
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/relocate.test.ts#переименование теста"
        status: pass
    human_judgment: false
  - id: D7
    description: "Доступ через canWriteTest и canWriteTopic: студент получает 403 на обоих маршрутах, в том числе для несуществующего id; БД и хранилище не меняются"
    requirement: QCON-01
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/relocate.test.ts#доступ к переименованию через scope.ts"
        status: pass
    human_judgment: false
  - id: D8
    description: "Переименование на preview, замер времени крупной темы при maxDuration 30, подтверждение <specifics> п. 7"
    requirement: QCON-02
    verification: []
    human_judgment: true

duration: 9min
completed: 2026-10-04
status: complete
deferred_human_gate: true
plan_head_before: 8d960e1
plan_head_after: 8d960e1
---

# Phase 7 Plan 12: Переименование и перенос теста Summary

**Смена slug теста, смена его темы и смена slug темы идут через `services/question-content/relocate.ts`: объекты промпта и пояснения копируются серверным `copy` под новый префикс (по 8 параллельно), одна транзакция под `lockTest` меняет тест или тему и условным `UPDATE … IS NOT DISTINCT FROM` переключает указатели, источники без ссылок удаляются после commit. Сбой копирования отменяет переименование с 503, гонка с правкой или созданием вопроса даёт 409, копии удаляются. STOR-rename-topic-files и STOR-rename-test-rollback стали обычными проверками.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- Начало: 2026-10-04T12:28Z
- Конец: 2026-10-04T12:37Z
- Задач: 4 (3 исполнены, Task 4 отложена: blocking-human)
- Файлов: 6 (2 новых, 4 изменённых)

## Accomplishments

- `relocate.ts`:
  - `planRelocation(rows, target)` — для каждой строки `{ id, testId, promptPath, explanationPath, topicSlug, testSlug }` кандидаты `questionMarkdownCandidates` (пояснение — только при непустом `explanationPath`); префикс кандидата — первые три сегмента `topics/<t>/<s>`, для ключей вне этой раскладки — каталог ключа; один `storage().list(prefix, { recursive: true })` на каждый различный префикс, `StorageKeyError` префикса → префикс пропускается. Источник — первый кандидат из множества найденных ключей. Приёмник — `questionPrefix(новая тема, новый slug, qid)/<имя>`, имя сохраняется, если совпадает с `^<kind>(-[0-9a-f]+)?\.md$`, иначе `<kind>.md`. Без источника указатель под старым префиксом теста меняется текстом, прочие остаются как есть. `target = { topicSlug, testSlug? }`: без `testSlug` берётся slug теста строки (переименование темы).
  - `switchPointers(tx, pointers)` — пакеты по 500: `UPDATE questions AS q SET prompt_path, explanation_path, updated_at (только у изменившихся) FROM (VALUES …) WHERE q.id = v.id AND q.prompt_path IS NOT DISTINCT FROM v.from_prompt AND q.explanation_path IS NOT DISTINCT FROM v.from_explanation`; сумма `rowCount` меньше числа записей → `ApiError(409, 'Содержимое изменилось, повторите')`.
  - `relocateQuestionObjects(pairs, switchInTx, { failureMessage = 'Не удалось перенести файлы, переименование отменено' })` — копирование пакетами по `COPY_CONCURRENCY = 8` через `Promise.allSettled` (после сбоя в пакете не остаётся копий в полёте), сбой → удаление всех попыток копирования и `ApiError(503, failureMessage)`; транзакция `switchInTx(tx)` и внутри неё отбор источников без ссылок; сбой транзакции (в том числе 409) → удаление копий и проброс; после commit удаление источников, сбой → `console.warn('[question-content] orphan objects', keys)`.
  - `updateTopic({ topicId, data })` — 404 `TOPIC_NOT_FOUND`, 409 `TOPIC_SLUG_EXISTS`; без смены slug прежнее обновление полей; со сменой — план по вопросам всех тестов темы, копирование, транзакция: `lockTest` каждого теста темы в порядке id со сверкой slug и темы, `SELECT … FROM topics … FOR UPDATE` со сверкой slug, сверка состава тестов темы и вопросов, обновление темы, `switchPointers`.
  - `updateTestSettings({ testId, data, userId })` — логика прежнего обработчика (404 теста и темы, 409 `TEST_SLUG_EXISTS`, 400 «Для публикации добавьте хотя бы один вопрос», `scoringRules`, рост `version` при первой публикации); без смены slug и темы — одно обновление, ответ без `assetsMoved`; со сменой — план, копирование, транзакция: `lockTest` со сверкой, `FOR SHARE` старой и новой темы со сверкой slug, сверка состава вопросов, обновление теста, `switchPointers`, при смене темы `updateQuestionSearchDocumentLocation(…, tx)` для каждого вопроса. Возврат `{ test, topicSlug, assetsMoved?: true }`.
- `index.ts` модуля реэкспортирует новые функции, константы и типы.
- Web: ветка `else if (data.assetsMoved === false) { toast.warning(…) }` удалена; ошибка сервера показывается прежним `toast.error(err.message)`.
- Tracer (Task 1): переименование темы → объекты и указатели под новым slug → чтение `GET /api/tests/by-slug/<новый slug>/…` отдаёт прежние тексты (STOR-rename-topic-files). Гейт tracer (автоматический путь, без `blocking-human`): `<verify>` Task 1 прогнан один раз, зелёный, после этого начата Task 2; отдельного повторного прогона между задачами не было, файл повторно прогнан в составе `<verify>` Task 2.

## Изменённые обработчики `routes/tests/index.ts` (для слияния с фазой 5)

- Импорт из `services/question-content/index.js` расширен: `updateTestSettings`, `updateTopic`. Остальные импорты не менялись (`requirePerm`, `storageService`, `and`, `sql`, `topics`, `questions` используются другими обработчиками).
- `PATCH /topics/:id`: регистрация `router.patch('/topics/:id', validateUUID('id'), sessionRequired(), async …)` без `requirePerm`; тело: `canWriteTopic(req, id)` → 403 `{ error: 'Forbidden' }`, разбор `TopicSchema.partial()` (400 с `details`), `updateTopic`, ответ `{ topic }`.
- `PATCH /:id/settings`: регистрация `router.patch('/:id/settings', validateUUID('id'), sessionRequired(), async …)` без `requirePerm`; тело: `canWriteTest(req, testId)` → 403, разбор `UpdateTestSettingsSchema` (400 с `details`), `canWriteTopic(req, data.topicId)` → 403, `await ensureGlobalScoringRules(userId)` (только побочный эффект), `updateTestSettings`, ответ `{ test: { ...test, topicSlug }, assetsMoved? }`. Прежние перенос префикса в транзакции, `moveDirectory` и `assetsMoved: false` удалены.
- Другие обработчики не тронуты. `moveDirectory` остался только в `POST /:id/questions/:questionId/move` (переписывает 07-13).

## codegraph impact (D-24, до правок)

Индекс построен по основному дереву, поэтому номера строк и символы — до 07-07…07-11.

- `moveDirectory` (storage.ts:124): 6 символов — `PATCH /api/tests/:id/settings`, `POST /api/tests/:id/questions/:questionId/move`, `routes/tests/index.ts`, `routes/index.ts`, `storage.local.test.ts`.
- `questionMarkdownCandidates`: в индексе не найден (в основном дереве функция ещё называется `buildQuestionMarkdownCandidates` в `routes/tests/public.ts:55`; её impact — `GET /api/tests/public/topics/:topicSlug/tests/:testSlug`, `GET /api/tests/public/tests/:id`, `POST /api/tests/public/tests/:id/submit`). По worktree (`grep`): `paths.ts` (определение), `read.ts:76`, `routes/tests/public.ts:66`, реэкспорт в `index.ts`; теперь и `relocate.ts`.
- `updateTestSettings` (Task 2): символа нет в индексе основного дерева (новый). Вызывающий — только `PATCH /api/tests/:id/settings`; одноимённая web-функция `test-editor-api.ts` — клиент этого маршрута, контракт ответа прежний, кроме отсутствия `assetsMoved: false`.

## codegraph affected (Task 3)

`codegraph affected` по изменённым файлам (индекс основного дерева, `relocate.ts` и `relocate.test.ts` в нём нет) вернул 3 файла: `routes/tests/index.ts`, `question-relocation.characterization.test.ts`, `useTestEditorModel.ts`. Серверные, web-, exam-core- и rbac-тесты прогнаны целиком в `yarn verify`.

## TDD (Task 2)

- RED: `relocate.test.ts` написан до переключения `PATCH /:id/settings` (обработчик ещё старый, `updateTopic` уже из Task 1) → `Tests 8 failed | 7 passed (15)`. Красные: устаревший указатель, пустой `prompt_path`, картинки и `settings.json`, документы поиска при смене темы, сбой копирования (503), лог сирот, обе гонки. Против старого кода проходили: простое переименование (старый `moveDirectory` на memory), «без смены slug», «без exists», сбой транзакции (старый код менял БД до переноса файлов), два теста темы (уже Task 1), студент (`requirePerm`).
- GREEN: обработчик переключён → `relocate.test.ts` 15 из 15.
- Сила проверок гонок проверена мутацией модуля (копия файла и восстановление `cp` с `cmp`): без проверки `rowCount` в `switchPointers` и без сверки состава вопросов → 2 красных (обе гонки).
- Коммиты RED/GREEN не делались (правило пользователя).

## Решения исполнителя (автономно)

1. `switchPointers` — один пакетный `UPDATE … FROM (VALUES …)` на 500 записей вместо `UPDATE` на каждый вопрос: условие и 409 те же, число запросов при переименовании крупной темы на порядок меньше (T-7-31, `maxDuration: 30`).
2. В транзакции сверяются slug и тема заблокированного теста (`lockTest` возвращает их с 07-10) и slug тем: при переименовании темы строка темы `FOR UPDATE` после блокировок тестов, при переименовании теста — `FOR SHARE` старой и новой темы. Без этого параллельное переименование темы или теста сделало бы копии из устаревшего места. Расхождение → 409. Порядок блокировок (тесты по id, затем тема) не образует цикла с `updateQuestion`, `createQuestion` (тест без темы) и `createTestWithQuestions` (тема `FOR SHARE` без теста).
3. `updateTopic` сверяет состав тестов темы после блокировки темы: тест, созданный `/save` между планом и транзакцией, иначе остался бы под старым префиксом темы.
4. Тест, удалённый между планом и транзакцией, даёт 409 «Содержимое изменилось, повторите», а не 404 «Test not found».
5. Источник удаляется после commit, только если ни одна строка `questions` на него не ссылается (решение 07-10: защита от общих устаревших указателей). Функция отбора продублирована в `relocate.ts`: `write.ts` вне allow-list плана.
6. В план указателей входят все вопросы затронутых тестов, включая те, у которых путь не меняется: условный `UPDATE` проверяет и их. `updated_at` меняется только у строк с новым указателем.
7. Сбой `list` при поиске источников (не `StorageKeyError`) пробрасывается как есть (503 «Хранилище недоступно»): копирование ещё не начиналось, отменять нечего.
8. `updateTestSettings` возвращает и `topicSlug`, чтобы маршрут не искал тему повторно. Публикация без вопросов — `ApiError(400)`, текст прежний; вне production `errorHandler` добавляет `requestId`, как у 07-07 и 07-10.
9. `requirements-completed: [QCON-02]`; QCON-01 частично (перенос вопроса, удаление, ZIP — 07-13, 07-14).

## Изменения поведения

- Смена slug темы теперь переносит промпты и пояснения всех тестов темы и меняет указатели (раньше — только slug в БД).
- Сбой переноса при переименовании теста или темы отменяет переименование: 503 с текстом «Не удалось перенести файлы, переименование отменено» (раньше — новые указатели при старых файлах и `assetsMoved: false`). Web показывает этот текст тостом.
- `assetsMoved` в ответе `PATCH /:id/settings` — только `true` при смене slug или темы, `false` не возвращается.
- Переносятся только объекты, на которые указывает БД или которые найдены среди кандидатов чтения. Картинки (`images/…`, `topics/*/*/assets/…`), `settings.json` и `answer_keys.json` остаются под старым префиксом; ссылки в тексте промптов на них по-прежнему ведут на старые ключи.
- Устаревшие указатели (`topics/<t>/<testId>/questions/<qid>/prompt.md` и т. п.) и пустой `prompt_path` при существующем объекте-кандидате при переименовании становятся каноническими ключами под новым префиксом.
- Студент получает 403 на обоих маршрутах до разбора тела и поиска.

## Deviations from Plan

Отклонений от плана нет; отличия реализации — в «Решениях исполнителя» выше.

Замечание: промежуточная ошибка исполнителя (скрипт удаления id из `KNOWN_DEFECTS` задел и первый аргумент `defectTest('STOR-rename-test-rollback', …)`, `TS2554`) поймана typecheck и исправлена до итоговых прогонов. `oxfmt` переписал литерал `KNOWN_DEFECTS` в одну строку (остались два id); проверка плана по `KNOWN_DEFECTS` проходит.

## Verification

- Task 1: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/question-relocation.characterization.test.ts` → `Tests 11 passed | 3 expected fail (14)`, STOR-rename-topic-files обычная и зелёная.
- Task 2: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/question-content src/routes/tests` → `Test Files 7 passed (7)`, `Tests 184 passed | 2 expected fail (186)`; ожидаемые падения — `STOR-zip-no-images`, `STOR-export-writes-answer-keys` (07-14). Проверка плана → `rename copy-switch-delete`. `yarn workspace @bio-exam/server typecheck` → выход 0.
- Task 3: проверка → `dead warning removed`; `yarn workspace @bio-exam/web typecheck` → выход 0; `yarn verify` → `yarn verify: OK`, все 8 шагов `passed` (server 38 файлов, `818 passed | 3 expected fail`; web 22 файла, 474; exam-core 498; rbac 3). Сверка с отпечатком `.planning/commit-snapshots/before-07-12/fingerprint.json` (0 путей до плана) → `07-12 changed only its files`.
- `yarn e2e` не запускался: план его не требует.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. Preview Vercel: переименовать тестовую тему с тестами и вопросами; промпты открываются по новому slug; в бакете под старым префиксом темы остались только `assets/`, `settings.json`, `answer_keys.json`.
2. Замер времени переименования самой крупной темы при `maxDuration: 30` (`app/server/vercel.json`). Число вопросов темы — read-only на проде:
   `SELECT t.slug, count(q.id) FROM topics t JOIN tests s ON s.topic_id = t.id JOIN questions q ON q.test_id = s.id GROUP BY 1 ORDER BY 2 DESC LIMIT 5;`
   При превышении — решение пользователя: повтор безопасен (копии перезаписываются, неудача ничего не меняет в БД), параллельность — константа `COPY_CONCURRENCY` в `relocate.ts`.
3. Подтвердить `<specifics>` п. 7: неудачный перенос теперь отменяет переименование (тост «Не удалось перенести файлы, переименование отменено») вместо предупреждения «Изображения не были перемещены».
4. Коммит файлов плана делает пользователь или оркестратор (список ниже).

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности вне `<threat_model>`: маршруты те же, права сужены до `canWriteTest`/`canWriteTopic` (сейчас равны `tests.write`). Ключи строятся из slug, прошедших `TopicSchema`/`UpdateTestSettingsSchema`, и проходят `normalizeKey` модуля хранилища (T-7-30).

## Файлы к коммиту

- app/server/src/services/question-content/relocate.ts (новый)
- app/server/src/services/question-content/relocate.test.ts (новый)
- app/server/src/services/question-content/index.ts
- app/server/src/routes/tests/index.ts
- app/server/src/routes/tests/question-relocation.characterization.test.ts
- app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts

## Self-Check: PASSED

- Все 6 файлов существуют, `git status --porcelain --untracked-files=all` показывает ровно их.
- Коммитов нет по правилу пользователя: `plan_head_before` = `plan_head_after` = `8d960e1`.
