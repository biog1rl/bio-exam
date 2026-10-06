---
phase: 07-storage-and-question-content
plan: 07
subsystem: question-content
tags: [question-content, storage, read, admin, access-policy, adr-0005, d-03, d-08, d-13]

requires:
  - phase: 07-storage-and-question-content
    provides: "07-01: модуль хранилища storage(), readText, normalizeKey, StorageKeyError, StorageUnavailableError, in-memory адаптер по умолчанию в изоляции"
  - phase: 07-storage-and-question-content
    provides: "07-03: характеризация чтения администратора и прохождения (паритет by-slug и /:id, 503 при сбое чтения)"
provides:
  - "services/question-content: paths.ts (topicPrefix, testPrefix, questionPrefix, questionMarkdownCandidates), read.ts (readFirstMarkdown, readQuestionMarkdown, readAdminTest), index.ts"
  - "GET /api/tests/by-slug/:topicSlug/:testSlug и GET /api/tests/:id — одна функция readAdminTest, доступ через canReadTest и testScope"
  - "Разбор попытки и бэкфилл поиска читают промпт через модуль"
affects: [07-10, 07-12, 07-13, 07-14, phase-05]

actuals:
  tokens: 7400
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Модуль содержимого вопроса в форме services/access-policy: каталог, index.ts с реэкспортом"
    - "Тест модуля импортирует его динамически после startAuthApp, чтобы делить реестр модулей с приложением и memoryStorage"

key-files:
  created:
    - app/server/src/services/question-content/paths.ts
    - app/server/src/services/question-content/read.ts
    - app/server/src/services/question-content/index.ts
    - app/server/src/services/question-content/read.test.ts
  modified:
    - app/server/src/routes/tests/public.ts
    - app/server/src/routes/tests/index.ts
    - app/server/src/scripts/backfill-question-search.ts

key-decisions:
  - "canRead в readAdminTest вызывается сразу после поиска теста, до ветки view=summary"
  - "readAdminTest не пропускает ключи, не прошедшие normalizeKey: паритет с прежним readFilesParallel; пропуск такого ключа — только в readFirstMarkdown"
  - "404 и 403 внутри readAdminTest идут через ApiError: текст error прежний, вне production errorHandler добавляет requestId"
  - "Из импорта drizzle-orm в routes/tests/index.ts убран count: единственный вызов ушёл в модуль"

requirements-completed: []
requirements-partial: [QCON-01, QCON-05]

coverage:
  - id: D1
    description: "Чтение для прохождения (по slug, по id, пояснение при submit) идёт через модуль: тела buildQuestionMarkdownCandidates и readFirstMarkdown в public.ts делегируют"
    requirement: QCON-01
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-content.characterization.test.ts"
        status: pass
      - kind: integration
        ref: "app/server/src/routes/tests/exam-flow.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "readFirstMarkdown: пропуск отсутствующего, пробельного и некорректного ключа; StorageUnavailableError пробрасывается; '' если ничего нет"
    requirement: QCON-01
    verification:
      - kind: unit
        ref: "app/server/src/services/question-content/read.test.ts#readFirstMarkdown"
        status: pass
    human_judgment: false
  - id: D3
    description: "Два блока чтения администратора слиты в readAdminTest; паритет by-slug и /:id, view=summary, 404 с прежними текстами"
    requirement: QCON-05
    verification:
      - kind: unit
        ref: "app/server/src/services/question-content/read.test.ts#readAdminTest"
        status: pass
      - kind: characterization
        ref: "app/server/src/routes/tests/question-content.characterization.test.ts#чтение администратора: by-slug и /:id отдают одинаковый массив questions с отправленными полями"
        status: pass
    human_judgment: false
  - id: D4
    description: "Доступ к чтению администратора через canReadTest и testScope: студент 403 на /:id и на by-slug для существующего и несуществующего теста, администратор 200"
    requirement: QCON-05
    verification:
      - kind: integration
        ref: "app/server/src/services/question-content/read.test.ts#доступ к чтению администратора через маршруты"
        status: pass
    human_judgment: false
  - id: D5
    description: "Страница теста при недоступном Supabase отвечает 503 вместо пустых промптов"
    requirement: QCON-01
    verification:
      - kind: characterization
        ref: "app/server/src/routes/tests/question-content.characterization.test.ts#сбой чтения хранилища: прохождение и администратор получают 503"
        status: pass
    human_judgment: true

duration: 11min
completed: 2026-10-04
status: complete
deferred_human_gate: true
plan_head_before: 8561670
plan_head_after: 8561670
---

# Phase 7 Plan 07: Модуль чтения содержимого вопроса Summary

**`services/question-content` владеет путями и чтением промпта и пояснения: `public.ts` делегирует ему два помощника, два блока чтения администратора стали одной `readAdminTest` с доступом через `canReadTest`/`testScope`, разбор попытки и бэкфилл поиска читают промпт через модуль, сбой хранилища даёт 503 вместо пустого текста.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- Начало: 2026-10-04T11:25Z
- Конец: 2026-10-04T11:36Z
- Задач: 3
- Файлов: 7 (4 новых, 3 изменённых)

## Accomplishments

- `paths.ts`: `topicPrefix`, `testPrefix`, `questionPrefix`, `questionMarkdownCandidates`. Список кандидатов и порядок — из прежнего `buildQuestionMarkdownCandidates` без изменений (5 вариантов, фильтр пустых, `Set`).
- `read.ts`:
  - `readFirstMarkdown(candidates)` проверяет ключ `normalizeKey` до чтения. `StorageKeyError` — пропуск, остальные ошибки пробрасываются. `null` и пробельный текст пропускаются, итог `''`, если ничего не найдено. `storage()` берётся лениво, при первом корректном ключе.
  - `readQuestionMarkdown({ storedPath, topicSlug, testSlug, testId, questionId, kind })` — кандидаты с `prompt.md` или `explanation.md`.
  - `readAdminTest(selector, { view?, canRead? })` — тело двух прежних блоков: по slug тема обязательна, по id необязательна (`topic?.slug`), `view: 'summary'` только для селектора по slug, пакетное чтение по 5 через `storage().readText` (`null` → `''`), `Question type is not configured: <type>`, 404 `Topic not found`/`Test not found` через `ApiError`.
- Tracer `GET /api/tests/public/tests/:id` → `buildQuestionMarkdownCandidates` в `public.ts` → модуль → in-memory адаптер: характеризация 07-03, `exam-flow`, `access-routes` зелёные, ожидания не менялись.
- Параллельность прежняя: администратор — 5 файлов одновременно, прохождение — `Promise.all` по вопросам.

## Изменённые функции (для слияния с фазой 5)

`app/server/src/routes/tests/public.ts`:
- импорт `storageService` из `services/storage/storage.js` заменён импортом `questionMarkdownCandidates` и `readFirstMarkdown as readFirstQuestionMarkdown` из `services/question-content/index.js` (то же место, после импорта `hasPermission`);
- тело `buildQuestionMarkdownCandidates(params)` → `return questionMarkdownCandidates(params)`; сигнатура прежняя;
- тело `readFirstMarkdown(candidates)` → `return readFirstQuestionMarkdown(candidates)`; сигнатура прежняя;
- обработчики `GET /topics/:topicSlug/tests/:testSlug`, `GET /tests/:id`, `POST /tests/:id/submit` и остальной код не тронуты.

`app/server/src/routes/tests/index.ts`:
- импорт `drizzle-orm`: убран `count` (больше не используется в файле);
- два новых импорта после `../../schemas/tests.js`: `canReadTest, testScope` из `services/access-policy/index.js` и `readAdminTest, readQuestionMarkdown` из `services/question-content/index.js`;
- `GET /by-slug/:topicSlug/:testSlug`: регистрация без `requirePerm('tests', 'read')`; тело: `testScope(req)` → 403 `{ error: 'Forbidden' }` при `!scope.all && topicIds.length === 0`, затем `res.json(await readAdminTest({ topicSlug, testSlug }, { view, canRead: (testId) => canReadTest(req, testId) }))`;
- `GET /:id`: регистрация `validateUUID('id'), sessionRequired()` без `requirePerm`; тело: `canReadTest(req, id)` → 403, затем `res.json(await readAdminTest({ testId: id }))`;
- `GET /admin/attempts/:attemptId`: внутри `questionRows.map` блок перебора кандидатов (`let promptText` + цикл со `storageService.readFile`) заменён на `const promptText = testRow ? await readQuestionMarkdown({ …, kind: 'prompt' }) : ''`. `requirePerm('tests', 'read')` у разбора попытки и остальной код разбора не тронуты (зона фазы 5). Если фаза 5 перенесла разбор в свой модуль оценённой попытки, при слиянии промпт там читается тем же вызовом `readQuestionMarkdown`.
- импорт `storageService` в `index.ts` остаётся: им пользуются запись, перенос и экспорт.

`app/server/src/scripts/backfill-question-search.ts`: импорт `storageService` заменён импортом `readFirstMarkdown` из модуля, `storageService.readFile(row.promptPath)` → `readFirstMarkdown([row.promptPath])`.

## codegraph impact (D-24, до правок)

Индекс основного дерева (в worktree индекса нет).

- `buildQuestionMarkdownCandidates` (public.ts:55): 6 символов — маршруты `GET /api/tests/public/topics/:topicSlug/tests/:testSlug`, `GET /api/tests/public/tests/:id`, `POST /api/tests/public/tests/:id/submit`; `routes/index.ts`.
- `readFirstMarkdown` (public.ts:82): 6 символов, те же три маршрута и `routes/index.ts`.
- `readAdminTest` после правки: в индексе основного дерева символа ещё нет (`Symbol "readAdminTest" not found`). Прямой поиск в worktree: вызовы только в `routes/tests/index.ts:982` (by-slug) и `:1218` (`/:id`), определение `services/question-content/read.ts:110`.

## codegraph affected (Task 3)

Из основного дерева по семи файлам плана: `Affected test files (3): app/server/src/routes/tests/index.ts, app/server/src/routes/tests/public.ts, app/server/src/services/question-content/read.test.ts`. Индекс не знает новых файлов и тестов worktree, поэтому дополнительно прогнан весь каталог `src/routes/tests` и `src/services/question-content` (ниже).

## TDD (Task 2)

- RED: `read.test.ts` написан до `readAdminTest`. Прогон: `Tests 5 failed | 10 passed (15)`, все 5 падений — `TypeError: qc.readAdminTest is not a function`. Тесты маршрутов «студент 403» проходили и до правки (закрепляют прежний отказ `requirePerm`, после замены на `canReadTest`/`testScope` отказ сохранился).
- GREEN: `readAdminTest` + правки маршрутов → `read.test.ts` 15 из 15.
- Коммиты RED/GREEN не делались (правило пользователя).

## Решения исполнителя (автономно)

1. `canRead` вызывается сразу после поиска теста, до ветки `view=summary`: summary тоже отдаёт данные теста. План говорит «после поиска теста, до чтения вопросов», выбран самый ранний вариант.
2. `readAdminTest` не пропускает ключи, не прошедшие `normalizeKey`: как прежний `readFilesParallel`, такой ключ даёт 400. Пропуск (T-7-16) сделан в `readFirstMarkdown`, как требует must_haves.
3. 404 и 403 из `readAdminTest` — `ApiError`, как предписывает план. Текст `error` прежний; вне production `errorHandler` добавляет поле `requestId`. Тесты сравнивают только статус и `error`.
4. `requirements-completed` пуст: план закрывает только чтение в QCON-01 и слияние блоков администратора в QCON-05. Запись, перенос и удаление (QCON-01), `settings.json` и `answer_keys.json` (QCON-05) остаются за 07-10 … 07-14; отметку требований делают они.
5. Тест модуля импортирует `./index.js` динамически после `startAuthApp` (иначе `db` и `memoryStorage` оказались бы в другом реестре модулей после `vi.resetModules()`). Для `StorageUnavailableError` проверяются `name` и `statusCode`, а не `instanceof`.

## Изменения поведения

- Сбой чтения хранилища — ошибка запроса (503), а не пустой промпт (D-03). Прежний `storageService.readFile` после 07-01 уже пробрасывал сбой, характеризация 07-03 это закрепила; модуль сохраняет поведение во всех местах чтения.
- Разбор попытки перебирает те же 5 кандидатов, что и прохождение, вместо прежних 3. Порядок общий: прежний третий кандидат (`topics/<тема>/<testId>/questions/<qid>/prompt.md`) теперь четвёртый, перед ним `topics/<тема>/<тест>/questions/<testId>/prompt.md`.
- Некорректный указатель промпта (не проходит `normalizeKey`) в прохождении, разборе попытки и бэкфилле пропускается как отсутствующий. Раньше он давал 400 (прохождение, разбор) или `failed` (бэкфилл); теперь — пустой текст и `skipped` в бэкфилле.
- Студент на `GET /api/tests/by-slug/...` получает 403 до поиска и для несуществующего теста, как раньше от `requirePerm`.

## Deviations from Plan

None - plan executed exactly as written. Удаление `count` из импорта `drizzle-orm` в `index.ts` следует из слияния блоков: вызов ушёл в модуль, импорт стал мёртвым.

## Verification

- Task 1: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/question-content.characterization.test.ts src/routes/tests/exam-flow.test.ts src/routes/tests/access-routes.test.ts` → `Test Files 3 passed (3)`, `Tests 122 passed | 3 expected fail (125)`. `KNOWN_DEFECTS` 07-03 прежние. Проверка → `public reads through module`.
- Task 2: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/question-content/read.test.ts src/routes/tests` → `Test Files 5 passed (5)`, `Tests 147 passed | 7 expected fail (154)` (характеризации 07-03 и 07-04 без изменения ожиданий). Проверка → `admin reads merged`. `yarn workspace @bio-exam/server typecheck` → выход 0.
- Lint сервера: новых замечаний нет. В изменённых файлах остались прежние предупреждения `appSettings` (public.ts:19) и `inArray` (backfill-question-search.ts:2), они были до плана и к нему не относятся.
- Task 3: `yarn verify` → `yarn verify: OK`, все 8 шагов `passed`; server 34 файла, exam-core 11, web 20, rbac 1.
- Сверка с отпечатком `.planning/commit-snapshots/before-07-07/fingerprint.json` (0 путей до плана) → `07-07 changed only its files`.
- `<verification>` плана покрыта прогоном Task 2: в `src/services/question-content` единственный тестовый файл `read.test.ts`.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. `<specifics>` п. 12: при недоступном Supabase страница теста отвечает ошибкой 503 вместо пустых промптов. Проверка на preview с отключённым или недоступным Supabase: открыть страницу прохождения теста, ожидать ошибку загрузки, а не пустые вопросы. Фазу не блокирует.
2. Коммит файлов плана делает пользователь или оркестратор (список ниже).

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности. Доступ к чтению администратора перенесён с `requirePerm` на `canReadTest`/`testScope` (правило из must_haves, отказ прежний 403 `{ error: 'Forbidden' }`). T-7-15: `StorageUnavailableError` → 503, текст ошибки без ключа объекта, тест `failOn read`. T-7-16: ключ, не прошедший `normalizeKey`, в `readFirstMarkdown` пропускается, тест `main/x.md`. T-7-SC: установок пакетов нет.

## Файлы к коммиту

```
app/server/src/services/question-content/paths.ts
app/server/src/services/question-content/read.ts
app/server/src/services/question-content/index.ts
app/server/src/services/question-content/read.test.ts
app/server/src/routes/tests/public.ts
app/server/src/routes/tests/index.ts
app/server/src/scripts/backfill-question-search.ts
```

## Self-Check: PASSED

- Все 7 файлов на месте (`git status`: 3 `M`, 4 `??`).
- Отпечаток `.planning/commit-snapshots/before-07-07/fingerprint.json` существует.
- Коммитов нет по правилу пользователя, HEAD = 8561670 до и после.
