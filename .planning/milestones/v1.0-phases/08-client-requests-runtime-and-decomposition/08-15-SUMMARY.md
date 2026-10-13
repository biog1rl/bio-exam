---
phase: 08-client-requests-runtime-and-decomposition
plan: 15
subsystem: web
tags: [http, swr, test-editor, question-editor, drafts, export, HTTP-02, PERF-04, SEC-05, D-02, D-06, D-08, D-09, D-26]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-04
    provides: модуль запросов lib/http (request, requestJson, RequestError, fetcherWith, swrFetcher, failureMessage, failureOf, exportFailureMessage, saveBlob), LoadErrorAlert
  - phase: 08-11
    provides: adminTestsKeys, exportTestArchive (requestBlob + проверка конца ZIP) в lib/tests/admin-api.ts, usersKeys
  - phase: 08-16
    provides: topicsListFetcher, adminTestsListFetcher; TestsClient и TopicTestsClient без импорта test-editor-api.ts
provides:
  - слой редактора теста test-editor-api.ts на модуле запросов (requestJson + RequestError, actionErrorMessage на failureMessage)
  - парсеры и фетчеры уровня модуля для by-slug (summary и полный), черновиков, черновика, назначений, типов вопросов
  - новые функции слоя moveTestQuestion, saveTestQuestion, fetchTestBySlug; экспорт из редактора exportTestFromEditor + чистая exportToast
  - редактор теста с LoadErrorAlert «Не удалось загрузить настройки теста» / «…вопросы» и «Повторить»
  - SEC-05 фазы 6 закрыт: сохранение вопроса показывает только текст модуля
  - автосохранение черновика вопроса на request с keepalive, исходы фазы 6 без изменений
affects: [08-20, 08-23, 08-28]

actuals:
  tokens: 17800
  tasks: 3
  commits: 0
plan_head_before: 8fc5a88515bfc811ebd52fe6a77842bcfe56ecf1
plan_head_after: 8fc5a88515bfc811ebd52fe6a77842bcfe56ecf1

tech-stack:
  added: []
  patterns:
    - "Функции слоя редактора бросают RequestError (requestJson с fallbackMessage); вызывающий берёт текст через actionErrorMessage(error, запасной) = failureMessage(failureOf(error), запасной) для RequestError, error.message для обычной ошибки проверки; пустая строка — без тоста"
    - "Экспорт из редактора: exportTestFromEditor → exportTestArchive (08-11) → saveBlob при ok; что показать — чистая exportToast(outcome) без sonner, тост вызывает модель"
    - "Ключи редактора и страницы вопроса — строки adminTestsKeys.*() и usersKeys.list(); фетчеры fetcherWith(parse) уровня модуля; parse проверяет конверт и возвращает тело как есть"
    - "Блок ошибки — при error !== undefined && data === undefined, проверка раньше ветки загрузки; в режиме создания теста ключи null, признаки ошибки и загрузки закрыты isEditingExisting"

key-files:
  created:
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.test.ts
  modified:
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts
    - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/TestEditorClient.tsx
    - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
    - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/new/NewQuestionDraftPageClient.tsx
    - app/web/lib/drafts/question-draft-api.ts
    - app/web/lib/drafts/question-draft-api.test.ts

key-decisions:
  - "Слой редактора единообразно бросает RequestError, а не возвращает исход: модель и страница вопроса уже построены на try/catch вместе с ошибками проверки (persistNewTest, «Сначала сохраните тест…»); текст — actionErrorMessage в слое (решение исполнителя, автономно)"
  - "Запасные тексты тостов действий — те, что пользователь видел раньше (запасной текст старого readApiError слоя): «Не удалось сохранить порядок вопросов», «Не удалось удалить черновик вопроса», «Не удалось удалить вопрос»; запасные тексты вызывающих («Ошибка сортировки вопросов», «Ошибка удаления черновика вопроса», «Ошибка удаления вопроса») раньше показывались только для не-Error и на деле не выводились (решение исполнителя, автономно)"
  - "Ошибка создания теста внутри «Добавить вопрос» показывает «Ошибка сохранения» (как раньше), а не запасной текст черновика: persistNewTest переводит RequestError в Error с текстом actionErrorMessage(…, 'Ошибка сохранения')"
  - "Страница вопроса и создание черновика при auth (пустой текст модуля) остаются на спиннере и не уходят назад к тесту: apiFetch уже ведёт на вход (Поверхность 1, auth)"
  - "Удаление черновика после сохранения вопроса через deleteQuestionDraft слоя обёрнуто в try/catch с прежним console.warn: вопрос сохранён, сбой удаления черновика не превращается в ошибку сохранения (T-8-36)"
  - "parse типов вопросов (questionTypesFetcher) живёт в test-editor-api.ts и проверяет только массив questionTypes: ключ общий с QuestionTypesPageClient и ScoringSettingsPageClient"
  - "Пустое тело или не-объект в ответе POST /api/tests/save — data null, как раньше (дальше «Не удалось определить путь нового теста после сохранения»); не-JSON — отказ malformed"

requirements-completed: [HTTP-02, PERF-04]

duration: 40min
completed: 2026-10-05
---

# Phase 8 Plan 15: Редактор теста, страница вопроса и черновик на модуле запросов Summary

**`test-editor-api.ts` переведён на `requestJson`/`RequestError` с текстом через `failureMessage` (`actionErrorMessage`), получил фетчеры уровня модуля для всех ключей редактора и страницы вопроса, функции `moveTestQuestion`/`saveTestQuestion`/`fetchTestBySlug` и экспорт `exportTestFromEditor` поверх `exportTestArchive` 08-11; редактор показывает `LoadErrorAlert` с «Повторить», страница вопроса больше не выводит сырой `error` сервера (SEC-05), автосохранение черновика идёт через `request` с `keepalive` с прежними исходами.**

## Performance

- **Duration:** около 40 мин
- **Completed:** 2026-10-05
- **Tasks:** 3/3
- **Files modified:** 8 (1 новый)

## Accomplishments

- `test-editor-api.ts`: удалены `apiFetch`, собственный `readApiError(response, fallback)` и `exportTestArchive(testId, slug, withAnswers)` с `response.blob()`. Имена экспортов сохранены: `assignStudentToTest`, `removeStudentFromTest`, `createTest`, `reorderTestQuestions`, `createQuestionDraft`, `deleteQuestionDraft` (после успеха чистит локальные копии черновика, как раньше), `deleteTestQuestion`, `updateTestSettings`; пути и методы прежние, при отказе бросают `RequestError`. Новые: `moveTestQuestion(testId, questionId, { targetTestId } | { targetTopicId })` → `{ topicSlug, testSlug }`, `saveTestQuestion(testId, questionId | null, question)` (POST/PATCH, запасной «Ошибка сохранения вопроса»), `fetchTestBySlug(topicSlug, testSlug)` (запасной «Не удалось загрузить тест»), `actionErrorMessage(error, fallback)`. Парсеры `parseTestSummary`, `parseTestDetail`, `parseQuestionDrafts`, `parseQuestionDraftDetail`, `parseTestAssignments`, `parseQuestionTypes` и фетчеры `testSummaryFetcher`, `testDetailFetcher`, `questionDraftsFetcher`, `questionDraftDetailFetcher`, `testAssignmentsFetcher`, `questionTypesFetcher`. Экспорт: `exportTestFromEditor(testId, withAnswers)` вызывает `exportTestArchive` из admin-слоя, при `ok` — `saveBlob` с именем из ответа (запасное `test.zip`), что показать — `exportToast(outcome)`: «Тест экспортирован», иначе `exportFailureMessage(outcome, 'Ошибка экспорта')`, пустая строка → `null`.
- `useTestEditorModel.ts`: локальный `fetcher` и `apiFetch` удалены; ключи — `adminTestsKeys.topics()` (`topicsListFetcher`), `bySlug(…, 'summary')` и `bySlug(…)` (оба `revalidateOnFocus: false`), `questionDrafts(id)`, `assignments(id)`, `usersKeys.list()` (`swrFetcher`, тело как есть), `questionTypes({ includeInactive: true })`. Тосты действий — `actionErrorMessage`, пустая строка — без тоста. Экспорт — `exportTestFromEditor`. Модель отдаёт `testError`/`questionsError` только при `data === undefined` в режиме редактирования и `retryTest`/`retryQuestions` (`mutate` своей загрузки); `isLoading`/`questionsLoading` — `data === undefined` в режиме редактирования.
- `TestEditorClient.tsx`: `<p role="alert">` заменены на `LoadErrorAlert` «Не удалось загрузить настройки теста» (вместо страницы, проверка раньше спиннера) и «Не удалось загрузить вопросы» (вместо списка, раньше скелетона). Фокус после повтора — backstop (Поверхность 1).
- `QuestionEditorPageClient.tsx`: локальный `fetcher` с голым `fetch` и `apiFetch` удалены; ключи `adminTestsKeys.bySlug` (`testDetailFetcher`, `revalidateOnFocus: false`), `questionTypes({ testId, includeInactive: true })`, `topics()`, `list()`, `questionDraft(testId, draftId)`. SEC-05: сохранение — `saveTestQuestion`, отказ — `actionErrorMessage(err, 'Ошибка сохранения вопроса')`, английский текст и 5xx не показываются, `auth` — без тоста; порядок `closeForSave` → сохранение → `reopen` при неудаче сохранён. Перенос — `moveTestQuestion` с запасным «Ошибка переноса вопроса». Экран ошибки загрузки с «Назад к тесту» берёт текст из `failureMessage(failureOf(error), 'Не удалось загрузить тест')`, кнопок не добавлено; показывается только при `data === undefined`; при `auth` — спиннер.
- `NewQuestionDraftPageClient.tsx`: тест по slug — `fetchTestBySlug`, создание черновика — `createQuestionDraft` слоя; тексты «Не удалось загрузить тест», «Не удалось создать черновик вопроса» — запасные тексты модуля; при `auth` тоста и возврата нет.
- `question-draft-api.ts`: `request` с `json`, `keepalive`, `parse` конверта `draft.lockVersion`; `ok` → `{ kind: 'ok', lockVersion }`, `http` 409/403/404 → `conflict`/`forbidden`/`gone`, прочее (5xx, 400, 401, сеть, `AuthExpiredError`, некорректный ответ) → `failed`; тело сверх `KEEPALIVE_BODY_LIMIT_BYTES` при `keepalive` → `failed` без запроса; `readLockVersion` — `cache: 'no-store'`, отказ любого вида → `null`. Импорт `@/lib/api-fetch` убран.

## Task Commits

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

1. **Task 1 (tracer, TDD): слой редактора и экспорт** — RED: `test-editor-api.test.ts` (35 тестов) до реализации, `vitest run …/test-editor` — 27 failed, 8 passed (пути старых функций совпадали), лог `08-15-red.log`. GREEN: 35 passed (`08-15-green1.log`). Tracer-гейт: повтор `<verify>` Task 1 зелёный, расширение продолжено.
2. **Task 2: модель, редактор, страница вопроса, черновик** — `yarn workspace @bio-exam/web typecheck` exit 0; проверка `test editor screens ok`.
3. **Task 3 (TDD): черновик на request** — тест переведён на `vi.mock('@/lib/session/client')`, дописаны исходы (401, 409 без тела, строковая версия, не-JSON, `AuthExpiredError`, `cache: 'no-store'`). Красного прогона не было: `@/lib/api-fetch` реэкспортирует тот же `apiFetch` из `@/lib/session/client`, поэтому новый тест зелёный и на старой реализации (103 passed, `08-15-red-drafts.log`) — он закрепляет паритет исходов до и после замены. После замены — 103 passed (`08-15-green-drafts.log`).

## Проверки

- `yarn workspace @bio-exam/web vitest run "app/(internal)/(protected)/admin/tests/components/test-editor"`: 1 файл, 35 тестов, passed.
- `yarn workspace @bio-exam/web vitest run lib/drafts`: 6 файлов, 103 теста, passed.
- `yarn workspace @bio-exam/web typecheck`: exit 0.
- `yarn workspace @bio-exam/web lint`: в файлах плана только три прежних `set-state-in-effect` в `useTestEditorModel.ts` (эффекты заполнения формы, существовали до плана).
- `yarn oxfmt --check .`: все файлы отформатированы.
- `yarn verify`: `yarn verify: OK` (web 1272 теста, server 1651, exam-core 605, rbac 9, script-tests 202).
- `yarn e2e`: 190 passed (1.8m), failed нет; `question-draft-durability.spec.ts`, `authoring.spec.ts`, `editor-toolbar.spec.ts` зелёные без правок. Строки `Server request for /admin/attempts/not-a-uuid failed: status 400` — журнал веб-сервера негативных сценариев.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-15`: `08-15 changed only its files`.
- Предусловие порядка: `git grep -n --untracked test-editor-api -- app/web` до правок — только `useTestEditorModel.ts:35`.
- Логи в scratchpad: `p0815-impact.txt`, `08-15-red.log`, `08-15-green1.log`, `08-15-typecheck.log`, `08-15-red-drafts.log`, `08-15-green-drafts.log`, `08-15-verify.log`, `08-15-e2e.log`, `08-15-affected.log`.

## codegraph impact (до правок)

Запуск из основного дерева (индекс по нему; `TestsClient`/`TopicTestsClient` в индексе ещё старые, в worktree их импорт снят 08-16).

- `exportTestArchive` (test-editor-api) — 4 символа: сама функция, `handleExport` и `useTestEditorModel` в `useTestEditorModel.ts`.
- `readApiError` (test-editor-api) — 30 символов: все функции слоя; в индексе ещё `TestsClient` и `TopicTestsClient` (в worktree не импортируют); в модели — `handleAssignStudent`, `handleRemoveStudent`, `persistNewTest`, `handleDragEnd`, `handleAddQuestion`, `handleDeleteQuestionDraft`, `handleDeleteQuestion`, `handleSave`, `handleExport`.
- `useTestEditorModel` — 7 символов: `TestEditorClient`, `EditTestPage` (`[topicSlug]/[testSlug]/page.tsx`), `NewTestPage` (`admin/tests/new/page.tsx`, режим создания).
- `questionDraftAutosaveApi` — 6 символов: `question-draft-api.test.ts`, `useQuestionDraftAutosave` (`use-question-draft-autosave.ts`), `QuestionEditorPageClient`.
- `handleSaveQuestion` — 4 символа: `QuestionEditorPageClient`, `EditQuestionPage` (`questions/[questionId]/page.tsx`), `QuestionDraftPage` (`questions/drafts/[draftId]/page.tsx`).

## codegraph affected (после правок)

Запуск из основного дерева по шести исходным файлам плана: 6 файлов — `TestEditorClient.tsx`, `QuestionEditorPageClient.tsx`, `NewQuestionDraftPageClient.tsx`, `test-editor-api.ts`, `useTestEditorModel.ts`, `question-draft-api.test.ts`. Покрыты `test-editor-api.test.ts`, `vitest run lib/drafts`, `yarn verify` и `yarn e2e` (`authoring.spec.ts` — редактор теста и вопроса, `question-draft-durability.spec.ts` — черновики фазы 6, `editor-toolbar.spec.ts`).

## Deviations from Plan

### Применение правил фазы

**1. [Правило 08-04] revalidateOnFocus: false на by-slug редактора и страницы вопроса**
- **Найдено в:** Task 2
- **Причина:** форма редактора теста заполняется эффектами из ответов `bySlug(…, 'summary')` и `bySlug(…)`, вопрос на странице вопроса — из `bySlug(…)`; ревалидация по фокусу перезаписывала бы несохранённые правки
- **Файлы:** `useTestEditorModel.ts`, `QuestionEditorPageClient.tsx`

**2. [Правило 08-04] Экран ошибки страницы вопроса — только при data === undefined**
- **Найдено в:** Task 2
- **Было:** ошибка ревалидации при загруженном тесте или черновике заменяла редактор экраном «Назад к тесту»
- **Стало:** экран показывается, только когда данных нет; текст и кнопка прежние

### Отступления от формулировок плана

**3. Task 3 без красного прогона.** План просит красный прогон после перевода подделки на `@/lib/session/client`. `@/lib/api-fetch` — реэкспорт того же `apiFetch`, поэтому тест зелёный и до замены; это ожидаемо для паритета исходов фазы 6 (T-8-36). Убрана проверка `init.credentials === 'include'`: её ставил настоящий `apiFetch`, а подделка теперь стоит на границе `@/lib/session/client`, до которой `request` `credentials` не задаёт (семантика не меняется: `apiFetch` по-прежнему ставит `credentials`).

**4. Проверка экспорта в Task 1 — через `exportTestFromEditor` слоя, а не через модель.** План разрешает: «тост-обёртка вынесена в чистую функцию и проверяется на исходах». `exportToast` — чистая функция, `exportTestFromEditor` вызывает `saveBlob` только при `ok`; модель лишь передаёт результат в `toast.success`/`toast.error`.

## Threat Flags

Нет: новых конечных точек и путей доступа план не добавляет. T-8-35 закрыт: сохранение, перенос и загрузка вопроса выводят текст только через `failureMessage` (английский текст и 5xx скрыты), проверка `data?.error` Task 2 зелёная. T-8-36: исходы `QuestionDraftSaveResult`, `keepalive` и порог тела сохранены, тест черновика и e2e фазы 6 зелёные без правок. T-8-SC: установок пакетов нет.

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. Экспорт из редактора теста на preview (Поверхность 6, сводно в 08-28): в шапке редактора «Экспорт» / «Экспорт с ответами» — файл скачивается с именем из `Content-Disposition`, тост «Тест экспортирован»; при архиве больше лимита — тост «Архив слишком большой для выгрузки, экспортируйте тесты по отдельности»; обрыв скачивания — «Не удалось скачать архив. Попробуйте ещё раз.»; ширина 375px — тост во всю ширину, текст переносится.
2. Блоки ошибки редактора теста на 375px (Поверхность 1, сводно в 08-28): при недоступном `/api/tests/by-slug/<тема>/<тест>?view=summary` — «Не удалось загрузить настройки теста» с причиной и «Повторить»; при недоступном полном `by-slug` — «Не удалось загрузить вопросы» на месте списка; фокус после повтора — поведение браузера.
3. Коммит файлов плана делает ведущая сессия.

## Передачи следующим планам

- 08-20 (правила баллов, типы вопросов): `questionTypesFetcher`/`parseQuestionTypes` (проверка массива `questionTypes`, тело как есть) лежат в `admin/tests/components/test-editor/test-editor-api.ts`. Ключи `adminTestsKeys.questionTypes({ includeInactive: true })` и `({ testId, includeInactive: true })` совпадают со `scoringGlobal()`/`scoringTest(id)` и строками `QuestionTypesPageClient`/`ScoringSettingsPageClient` — кэш общий; при переводе этих экранов взять этот фетчер или перенести его в `lib/tests/admin-api.ts` вместе с импортами редактора и страницы вопроса.
- 08-20, 08-23: фетчеры by-slug (`testSummaryFetcher`, `testDetailFetcher`), черновиков и назначений — в `test-editor-api.ts`; `layout.tsx` теста читает summary через `serverRequest` отдельно. Если 08-23 переносит типы `admin/tests/types` в `lib/tests`, импорты типов в `test-editor-api.ts` меняются вместе с ними.
- 08-23: `lib/api-fetch` больше не импортируют `test-editor-api.ts`, `useTestEditorModel.ts`, `QuestionEditorPageClient.tsx`, `NewQuestionDraftPageClient.tsx`, `lib/drafts/question-draft-api.ts` (минус 5 файлов). Старых `readApiError(response, fallback)` и `exportTestArchive(testId, slug, withAnswers)` в коде больше нет.
- Любой план, вызывающий функции `test-editor-api.ts`: они бросают `RequestError`; текст — `actionErrorMessage(error, запасной)`, пустая строка — без тоста. `deleteQuestionDraft` после успеха сам чистит локальные копии черновика.
- 08-28: пункты «Deferred human verification».

## Файлы к коммиту

- app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts
- app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.test.ts (новый)
- app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts
- app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/TestEditorClient.tsx
- app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
- app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/new/NewQuestionDraftPageClient.tsx
- app/web/lib/drafts/question-draft-api.ts
- app/web/lib/drafts/question-draft-api.test.ts
- .planning/phases/08-client-requests-runtime-and-decomposition/08-15-SUMMARY.md (в общем `.planning`, вне git worktree)

## Self-Check: PASSED

- Файлы плана на месте (`git status`: 7 изменённых, 1 новый); сверка `08-15 changed only its files`.
- Коммиты: не выполнялись по правилу пользователя, `plan_head_before` = `plan_head_after` = `8fc5a88`.
