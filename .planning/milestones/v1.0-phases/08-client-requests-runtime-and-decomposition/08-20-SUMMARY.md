---
phase: 08-client-requests-runtime-and-decomposition
plan: 20
subsystem: web/admin-tests (типы вопросов, правила баллов)
tags: [HTTP-02, D-06, D-08, D-09, swr, admin-tests, question-types, scoring]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-04
    provides: request, RequestOutcome, fetcherWith, failureMessage, MalformedBodyError, LoadErrorAlert
  - phase: 08-11
    provides: adminTestsKeys (questionTypes, scoringGlobal, scoringTest)
  - phase: 08-16
    provides: lib/tests/admin-api.ts, topicsListFetcher, adminTestsListFetcher
provides:
  - lib/tests/admin-api.ts — adminTestsKeys.questionType(key); parseQuestionTypes, parseScoringRules, parseQuestionType; questionTypesFetcher, scoringRulesFetcher, questionTypeFetcher; saveQuestionType, deleteQuestionType, saveTestQuestionTypeOverride, deleteTestQuestionTypeOverride, saveGlobalScoringRules, saveTestScoringRules; типы QuestionTypeResponse, QuestionTypePayload, QuestionTypeOverridePayload, ScoringRulesResponse, ScoringRuleEntry, TestScoringRuleEntry
  - QuestionTypesPageClient, QuestionTypeDetailsPageClient, ScoringSettingsPageClient на admin-слое тестов с блоками ошибки загрузки
affects: [08-23, 08-28]

actuals:
  tokens: 12200
  tasks: 3
  commits: 0
plan_head_before: 31dd7c1bf75919f2a9aeb46494a8c0d94f97a709
plan_head_after: 31dd7c1bf75919f2a9aeb46494a8c0d94f97a709

tech-stack:
  added: []
  patterns:
    - "Форма из данных SWR засевается при смене ключа: useSWR с revalidateOnMount: false, эффект на ключ вызывает связанный mutate() и засевает форму из его результата, если ключ всё ещё текущий; «Повторить» вызывает тот же загрузчик; повтор при фокусе выключен, кэш другого экрана форму не засевает"
    - "Пакетная запись по типам — runInOrder: шаги по очереди, первый отказ останавливает запись и возвращается как RequestOutcome с запасным текстом шага"

key-files:
  created: []
  modified:
    - app/web/lib/tests/admin-api.ts
    - app/web/lib/tests/admin-api.test.ts
    - app/web/app/(internal)/(protected)/admin/tests/question-types/QuestionTypesPageClient.tsx
    - app/web/app/(internal)/(protected)/admin/tests/question-types/[key]/QuestionTypeDetailsPageClient.tsx
    - app/web/app/(internal)/(protected)/admin/tests/scoring/ScoringSettingsPageClient.tsx

key-decisions:
  - "saveGlobalScoringRules/saveTestScoringRules пишут по прежним путям экрана (PATCH /api/tests/question-types/<key> с { scoringRule }; PUT/DELETE /api/tests/question-types/tests/<id>/overrides/<key>), а не в /api/tests/scoring-rules/*, как в behavior Task 1: это другая модель данных ({ rules } на уровне теста), экран её не использует; interfaces плана требуют «пути и тела — как сейчас на экранах» (решение исполнителя, автономно)"
  - "Сигнатуры пакетных функций — списки записей (ScoringRuleEntry[], TestScoringRuleEntry[]) вместо body: unknown; первый отказ останавливает запись; запасные тексты — прежние по типу: «Не удалось сохранить тип <key>», «Не удалось сохранить override для <key>»"
  - "Отказ DELETE переопределения в правилах баллов теперь останавливает запись и даёт тост; раньше результат DELETE не проверялся и показывался успех (Rule 1)"
  - "parseQuestionTypes/questionTypesFetcher заведены в admin-api.ts отдельно от копии в test-editor-api.ts (файл вне плана, а test-editor-api.ts сам импортирует admin-api.ts — реэкспорт дал бы цикл); проверка одна и та же (массив questionTypes, тело как есть), кэш общий"
  - "Засев не из первого data, а из результата mutate() при смене ключа (revalidateOnMount: false — один запрос): в SWR 2.3.8 при тёплом кэше первый рендер отдаёт кэш с isValidating false, а ревалидация откладывается через rAF, поэтому засев «по первому data» брал бы устаревший кэш другого экрана, и «Сохранить» правил переписала бы все типы старыми правилами"
  - "Правила баллов засеваются в состоянии seededKey (а не ref): от него зависят «Загрузка правил...» и доступность «Сохранить» в рендере; текущий ключ для отбрасывания запоздавших ответов — в ref"
  - "После успешного сохранения правил баллов — фоновый mutate() ключа области, чтобы общий кэш (типы вопросов, тип с переопределениями) не устарел; форма не пересеивается"
  - "Ошибки загрузки тем и тестов на экране типа вопроса блоком не показываются: UI-SPEC их там не называет, поведение прежнее (пустые Select)"

metrics:
  duration: 25min
  completed: 2026-10-05
---

# Phase 8 Plan 20: Типы вопросов и правила баллов на admin-слое тестов Summary

Три экрана каталога (типы вопросов, тип вопроса с переопределениями, правила баллов) читают и пишут через `lib/tests/admin-api.ts` со строковыми ключами `adminTestsKeys` и фетчерами `fetcherWith(parse)` уровня модуля. При ошибке загрузки без данных вместо пустой сетки, вечной загрузки или тоста «Ошибка загрузки» появляется `LoadErrorAlert` с кнопкой «Повторить». Формы правил и типа вопроса не затираются повтором при фокусе.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Выполнено

**Task 1 (tracer) — правила баллов.**
- `admin-api.ts`: `parseScoringRules` (= проверка `parseQuestionTypes`), `scoringRulesFetcher`, `saveGlobalScoringRules`, `saveTestScoringRules`, общий `runInOrder`.
- `ScoringSettingsPageClient.tsx`: локальные `fetcher`, `apiFetch` и ручная загрузка в эффекте удалены.
  - Правила грузит `useSWR(rulesKey, scoringRulesFetcher, { revalidateOnFocus: false, revalidateOnReconnect: false })`. `rulesKey` — строка: `adminTestsKeys.scoringGlobal()`, `adminTestsKeys.scoringTest(id)` или `null`, если тест не выбран.
  - Опции `useSWR` правил дополнены `revalidateOnMount: false`. При смене ключа эффект вызывает `loadRules(key)`: связанный `mutate()` делает один свежий запрос, и форма (`types`, `overrideEnabled`) засевается из его результата, если ключ не сменился. Засеянный ключ хранится в `seededKey`. Повторная ревалидация того же ключа форму не трогает.
  - Ошибка без данных: `LoadErrorAlert` «Не удалось загрузить правила» в содержимом карточки. «Повторить» вызывает `loadRules`, фокус после повтора — `CardTitle` «Правила начисления» (`tabIndex={-1}`).
  - «Сохранить» выключена, пока правила текущего ключа не засеяны: и при загрузке, и при ошибке (T-8-47). Тост «Ошибка загрузки» убран.
  - Темы и тесты берутся из `useSWR(adminTestsKeys.topics(), topicsListFetcher)` и `useSWR(adminTestsKeys.list(), adminTestsListFetcher)`. Если хоть один не загрузился, над выбором области стоит блок «Не удалось загрузить темы и тесты». «Повторить» повторяет только упавшие запросы, фокус — backstop.
  - Запись через `saveGlobalScoringRules`/`saveTestScoringRules`: тост с текстом исхода, при `auth` тоста нет. Тексты успеха прежние.

**Task 2 — типы вопросов и тип вопроса.**
- `admin-api.ts`: `adminTestsKeys.questionType(key)`, `parseQuestionTypes`, `parseQuestionType` (`{ questionType }` со строковым `key`), `questionTypesFetcher`, `questionTypeFetcher`, `saveQuestionType` (без key — POST, «Не удалось создать тип»; с key — PATCH, «Не удалось сохранить тип вопроса»), `deleteQuestionType` («Не удалось отключить тип»), `saveTestQuestionTypeOverride` («Не удалось сохранить override»), `deleteTestQuestionTypeOverride` («Не удалось удалить override»).
- `QuestionTypesPageClient.tsx`: данные из `useSWR(adminTestsKeys.questionTypes({ includeInactive: true }), questionTypesFetcher)`. Ошибка без данных — блок «Не удалось загрузить типы вопросов» вместо сетки, фокус — `h1` «Типы вопросов» (`tabIndex={-1}`). Создание через `saveQuestionType`, тост `failureMessage(outcome, 'Не удалось создать тип')`.
- `QuestionTypeDetailsPageClient.tsx`:
  - Тип загружается по ключу `adminTestsKeys.questionType(typeKey)` с `revalidateOnMount: false`, переопределения — по `adminTestsKeys.scoringTest(id)` (кэш общий с правилами баллов). Оба `useSWR` — с `revalidateOnFocus: false` и `revalidateOnReconnect: false`.
  - `globalForm` засевается при смене `typeKey`: `loadType(typeKey)` вызывает `mutateType()` и засевает форму из свежего ответа, если ключ не сменился.
  - Тот же загрузчик вызывают «Повторить», а также успешные «Сохранить глобально» и «Отключить тип». Поэтому переключатель «Активен» не устаревает.
  - Ошибка без данных: блок «Не удалось загрузить тип вопроса» вместо карточки «Загрузка...» под кнопкой «К типам вопросов». Раньше при 404 и сбое загрузка висела бесконечно.
  - Запись и переопределения идут через функции слоя.
- Локальные `fetcher`, голый `fetch(` и `@/lib/api-fetch` из трёх экранов удалены.

**Task 3** — `codegraph affected`, `yarn verify`, `yarn e2e`, сверка (ниже).

## codegraph

`codegraph impact` (до правок):
- `ScoringSettingsPageClient` — 3 символа: сам компонент, `ScoringSettingsPage` (`scoring/page.tsx`), маршрут `/web/app/admin/tests/scoring`.
- `QuestionTypesPageClient` — 3 символа: компонент, `QuestionTypesPage`, маршрут `/web/app/admin/tests/question-types`.
- `QuestionTypeDetailsPageClient` — 3 символа: компонент, `QuestionTypeDetailsPage`, маршрут `/web/app/admin/tests/question-types/:key`.

`codegraph affected` по четырём исходным файлам называет только сами эти файлы: `admin-api.ts` и три экрана. Тест `admin-api.test.ts` в индексе основного дерева не связан. Все web-тесты прошли в `yarn verify`.

## Проверки

- RED Task 1: `vitest run lib/tests/admin-api.test.ts` — 8 failed (экспортов нет). GREEN — 38 passed.
- RED Task 2: `vitest run lib/tests` — 11 failed. GREEN — 4 файла, 105 passed.
- `yarn workspace @bio-exam/web typecheck` — exit 0.
- `yarn workspace @bio-exam/web lint` — exit 0. В экранах плана осталось два прежних предупреждения `set-state-in-effect`: `setScope` из адреса в правилах баллов, `overrideForm` в типе вопроса. До плана их было три.
- Проверка трёх экранов на локальный `fetcher`, голый `fetch(` и `lib/api-fetch` — `catalog settings ok`; строки «Ошибка загрузки» в каталогах экранов нет.
- `oxfmt` по каждому файлу с `./`. `format-check` в `yarn verify` — passed.
- `yarn verify` — `yarn verify: OK`.
- `yarn e2e` — 194 passed. Строки `[WebServer] ⨯ … /admin/attempts/not-a-uuid failed: status 400` — штатный лог сценария страницы ошибки.
- Сверка — `08-20 changed only its files`.
- Первая версия засева (по первому `data` с проверкой `!isValidating`) после ревью заменена на загрузку при смене ключа. Причина в SWR 2.3.8 (`use-swr.ts`): при тёплом кэше первый рендер отдаёт `isValidating: false`, а ревалидация идёт через `rAF`. После замены повторены typecheck, lint, `vitest run lib/tests` (105 passed), проверка трёх экранов, `oxfmt`, `yarn verify: OK`, `yarn e2e` (194 passed) и сверка (`08-20 changed only its files`).
- Маршруты и middleware не менялись, `route-inventory.txt` не перегенерировался.

## TDD Gate Compliance

Task 1: RED (8 failed: функций правил нет) → GREEN (38 passed). Task 2: RED (11 failed: функций типов нет) → GREEN (105 passed). В GREEN Task 1 поправлен сам тест: `mockResolvedValue` отдавал один и тот же `Response`, второе чтение тела падало; заменено на `mockImplementation` с новым ответом на каждый вызов. Порядок «сначала красный тест» соблюдён по сути; RED/GREEN-коммиты не делались по правилу пользователя. REFACTOR не понадобился.

## Deviations from Plan

### Auto-fixed Issues

**1. Пути записи правил баллов.** Behavior Task 1 задаёт `PUT /api/tests/scoring-rules/global` и `PUT /api/tests/scoring-rules/tests/<id>`. Эти маршруты хранят другую модель (`{ rules }` целиком, `tests.scoringRules`). Экран же пишет `scoringRule` каждого типа и переопределения по типам. Интерфейс плана требует «пути и тела — как сейчас на экранах», поэтому функции пишут по прежним путям, а тесты закрепляют их. Переход на `/scoring-rules/*` потребовал бы переписать форму, а не перенести её на слой.

**2. [Rule 1 - Bug] Молчаливый отказ DELETE переопределения.** В правилах баллов теста результат `DELETE` не проверялся, и при отказе показывался тост успеха. Теперь отказ останавливает запись и даёт тост «Не удалось сохранить override для <key>» или текст сервера.

**3. Сигнатуры пакетной записи.** Вместо `body: unknown` функции принимают списки записей: так тело каждого запроса остаётся прежним.

**4. Новый ключ `adminTestsKeys.questionType(key)`.** Странице типа нужен ключ, которого в `adminTestsKeys` не было. Строка совпадает с прежней: `/api/tests/question-types/<key>`, без кодирования, как раньше.

Различия поведения (не ошибки):
- Ответ 2xx неверной формы и отказ HTTP при загрузке больше не разбираются как данные: экраны показывают блок.
- Тип вопроса с неизвестным ключом (404) раньше висел в «Загрузка...». Теперь блок без «Повторить» с причиной «Запрос отклонён (код 404).»: английский текст сервера в интерфейс не попадает.
- Если свежая загрузка правил или типа не удалась, а в кэше SWR есть прежние данные, форма засевается из кэша без блока: ошибка поверх данных, правило R8.
- Если область уже падала раньше, при возврате к ней блок ошибки виден, пока идёт новая загрузка: ошибка лежит в кэше SWR до ответа.

## Threat Flags

Новой поверхности нет. T-8-47: «Сохранить» в правилах баллов выключена, пока правила текущей области не засеяны, в том числе при ошибке загрузки. Пустой список типов при сбое записан быть не может. T-8-SC: установок пакетов нет.

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

- Блоки ошибки трёх экранов на 375px (Поверхность 1, backstop): «Не удалось загрузить типы вопросов», «Не удалось загрузить тип вопроса», «Не удалось загрузить правила», «Не удалось загрузить темы и тесты». Проверить отсутствие горизонтального скролла и «Повторить» во всю ширину высотой 44px. Сводно в 08-28 (preview).
- Правила баллов в браузере. Изменить формулу, уйти из вкладки и вернуться — правка остаётся. Переключить «Глобально» ↔ тест — форма засевается заново свежими данными области. Сохранить тип на странице типа, затем открыть правила баллов — правило новое.
- Коммит файлов плана делает ведущая сессия.

## Передачи следующим планам

- 08-23: `parseQuestionTypes`/`questionTypesFetcher` теперь есть в двух местах: `lib/tests/admin-api.ts` и `components/test-editor/test-editor-api.ts`, с одинаковой проверкой. `test-editor-api.ts` может брать их из `admin-api.ts` (он уже импортирует этот модуль) и удалить свою копию вместе с её тестом в `test-editor-api.test.ts`.
- 08-23: `@/lib/api-fetch` больше не импортируют `QuestionTypesPageClient`, `QuestionTypeDetailsPageClient`, `ScoringSettingsPageClient` — минус три импортёра.
- Любой план с типами вопросов:
  - ключ одного типа — `adminTestsKeys.questionType(key)` с `questionTypeFetcher` (`{ questionType }`);
  - список — `adminTestsKeys.questionTypes({ includeInactive: true })`, совпадает с `scoringGlobal()`;
  - правила и переопределения теста — `scoringTest(id)`;
  - все фетчеры отдают тело как есть, кэш общий.
- Запись правил баллов: `saveGlobalScoringRules([{ key, scoringRule }])`, `saveTestScoringRules(testId, [{ key, scoringRule, override }])`. Маршруты `/api/tests/scoring-rules/*` веб не вызывает.
- 08-28: в «после» экраны каталога без локальных fetcher; ручной проверки на 375px — по пункту выше.

## Файлы к коммиту

- app/web/lib/tests/admin-api.ts
- app/web/lib/tests/admin-api.test.ts
- app/web/app/(internal)/(protected)/admin/tests/question-types/QuestionTypesPageClient.tsx
- app/web/app/(internal)/(protected)/admin/tests/question-types/[key]/QuestionTypeDetailsPageClient.tsx
- app/web/app/(internal)/(protected)/admin/tests/scoring/ScoringSettingsPageClient.tsx

## Self-Check: PASSED

Все пять файлов изменены и на месте (`git status`), `yarn verify: OK`, e2e 194 passed, сверка `08-20 changed only its files`; коммитов нет по правилу пользователя (`commits: 0`, HEAD прежний 31dd7c1).
