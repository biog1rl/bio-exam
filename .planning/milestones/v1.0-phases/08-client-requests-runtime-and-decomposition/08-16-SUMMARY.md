---
phase: 08-client-requests-runtime-and-decomposition
plan: 16
subsystem: web
tags: [http, swr, tests-bank, export, HTTP-02, PERF-04, D-06, D-08, D-09, D-26]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-04
    provides: модуль запросов lib/http (request, requestBlob, fetcherWith, failureMessage, exportFailureMessage, saveBlob), LoadErrorAlert
  - phase: 08-11
    provides: adminTestsKeys, adminTestsListFetcher, exportTestArchive, exportTopicArchive в lib/tests/admin-api.ts
provides:
  - функции записи тем и тестов admin-слоя (deleteTopic, deleteTest, saveTopic, setTopicTeachers, fetchTopicTeacherOptions)
  - parseTopicsList и topicsListFetcher для общего ключа '/api/tests/topics'
  - банк заданий, страница темы и форма темы без локальных fetcher и apiFetch
  - экспорт теста и темы из банка и со страницы темы через requestBlob
affects: [08-15, 08-20, 08-23, 08-28]

actuals:
  tokens: 9200
  tasks: 3
  commits: 0
plan_head_before: d5bbc3b5a92871f5049d2aba28e3b4465a639ea9
plan_head_after: d5bbc3b5a92871f5049d2aba28e3b4465a639ea9

tech-stack:
  added: []
  patterns:
    - "Ключи банка и темы — adminTestsKeys.topics() / adminTestsKeys.list(), фетчеры topicsListFetcher / adminTestsListFetcher уровня модуля; parse проверяет только конверт и возвращает тело"
    - "Блок ошибки — при error !== undefined && data === undefined, проверка раньше ветки загрузки; признак загрузки — data === undefined"
    - "Тост действия — failureMessage/exportFailureMessage, пустая строка — без тоста (auth, aborted)"

key-files:
  created: []
  modified:
    - app/web/lib/tests/admin-api.ts
    - app/web/lib/tests/admin-api.test.ts
    - app/web/app/(internal)/(protected)/admin/tests/TestsClient.tsx
    - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/TopicTestsClient.tsx
    - app/web/app/(internal)/(protected)/admin/tests/components/TopicFormDialog.tsx

key-decisions:
  - "Типы admin-слоя тестов берутся type-only импортом из app/(internal)/(protected)/admin/tests/types (Test, Topic, TopicFormData, TopicsResponse); AdminTestListItem = Test, TopicPayload = TopicFormData, TeacherOption = TopicTeacher из bank-view (решение исполнителя, автономно)"
  - "Фокус после успешного повтора блока «Не удалось загрузить тему» — backstop: h1 героя внутри TopicHero.tsx (вне files_modified, без ref), блок и герой не сосуществуют в DOM (решение исполнителя, автономно)"
  - "Запасной текст удаления темы — «Ошибка удаления темы» (был запасным в том же обработчике; 07.1 текста для темы не задаёт) (решение исполнителя, автономно)"
  - "SWR тем на странице темы — revalidateOnFocus: false: TopicFormDialog заполняет форму из topic, полученного из SWR (правило 08-04)"
  - "Ошибка PUT учителей с kind auth/aborted — тост не показывается, диалог закрывается и onSaved вызывается: тема уже сохранена"

requirements-completed: [HTTP-02, PERF-04]

duration: 30min
completed: 2026-10-05
---

# Phase 8 Plan 16: Банк заданий, страница темы и форма темы на admin-слое Summary

**Банк заданий, страница темы и `TopicFormDialog` работают через `lib/tests/admin-api.ts` (ключи `adminTestsKeys`, `topicsListFetcher`, функции записи); экспорт теста и темы — `exportTestArchive`/`exportTopicArchive` на `requestBlob` с проверкой конца ZIP и тостами Поверхности 6; голые `<p role="alert">` заменены `LoadErrorAlert` с «Повторить»; импорт `test-editor-api.ts` из банка и темы убран.**

## Performance

- **Duration:** около 30 мин
- **Completed:** 2026-10-05
- **Tasks:** 3/3
- **Files modified:** 5

## Accomplishments

- `lib/tests/admin-api.ts`: `parseTopicsList` (конверт `{ topics: [] }`, тот же объект), `topicsListFetcher = fetcherWith(parseTopicsList)`; `deleteTopic(topicId)` → `DELETE /api/tests/topics/<id>`; `deleteTest(testId)` → `DELETE /api/tests/<id>`; `saveTopic({ id?, body })` → `POST /api/tests/topics` / `PATCH /api/tests/topics/<id>` с проверкой `{ topic: { id } }` и запасным текстом `Ошибка сохранения`; `setTopicTeachers(topicId, teacherIds)` → `PUT /api/tests/topics/<id>/teachers` с `{ teacherIds }`; `fetchTopicTeacherOptions()` → `GET /api/tests/topics/teacher-options` с проверкой массива `teachers`. Типы `TopicPayload`, `TeacherOption`; `AdminTestListItem` расширен до `Test`.
- `TestsClient.tsx`: локальный `fetcher` и `apiFetch` удалены; `useSWR(adminTestsKeys.topics(), topicsListFetcher)` и `useSWR(adminTestsKeys.list(), adminTestsListFetcher)`; `LoadErrorAlert` «Не удалось загрузить темы» (фокус — `h2` «Навигация», `tabIndex={-1}`) и «Не удалось загрузить тесты» (фокус — `h2` заголовка списка), каждый повторяет свой ключ; `bankState` и плитки статистики опираются на `data === undefined`, ошибка ревалидации при загруженных данных вид не меняет. Удаление темы — `deleteTopic` + `failureMessage(outcome, 'Ошибка удаления темы')`; удаление теста — `deleteTest` + `deleteTestToast(status, body)` 07.1 (409 — текст сервера), при `auth`/`aborted` тоста нет. Экспорт — `exportTestArchive`/`exportTopicArchive`, `saveBlob`, «Тест экспортирован» / «Тема экспортирована», отказ — `exportFailureMessage(outcome, 'Ошибка экспорта')`, пустая строка — без тоста. Строка `interactiveClass` не тронута.
- `TopicTestsClient.tsx`: то же для темы («Не удалось загрузить тему» вместо страницы, проверка раньше скелетона), статистики и тестов («Не удалось загрузить статистику», «Не удалось загрузить тесты», оба повторяют `mutateTests`); экспорт, удаление теста и темы — как в банке; SWR тем — `revalidateOnFocus: false`.
- `TopicFormDialog.tsx`: сохранение — `saveTopic`, отказ — `failureMessage(saved, 'Ошибка сохранения')` (английский `Topic with this slug already exists` больше не показывается, вместо него «Ошибка сохранения»); учителя — `setTopicTeachers`, исход в `topicSaveOutcome` 07.1 (`TEACHERS_SAVE_FAILED`); кандидаты — `fetchTopicTeacherOptions`, при отказе пустой список, как в 07.1.

## Task Commits

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

1. **Task 1 (tracer): экспорт из банка через admin-слой** — `typecheck` exit 0, проверка `bank export ok`. Tracer-гейт (повтор `<verify>`) пройден, расширение продолжено.
2. **Task 2 (TDD): функции записи, загрузка банка и темы, форма темы** — RED: 15 новых тестов в `admin-api.test.ts` до реализации, `vitest run lib/tests` — 15 failed (`parseTopicsList is not a function` и т. п.), лог `08-16-red.log`. GREEN: `Test Files 4 passed`, `Tests 82 passed`. Проверки `bank screens ok` и `test-editor-api importers only in 08-15 files` зелёные.
3. **Task 3: affected, verify, e2e, сверка** — результаты ниже.

## Проверки

- `yarn workspace @bio-exam/web vitest run lib/tests`: 4 файла, 82 теста, passed.
- `yarn workspace @bio-exam/web typecheck`: exit 0.
- `yarn workspace @bio-exam/web lint`: exit 0; в файлах плана одно замечание `set-state-in-effect` на `TopicFormDialog.tsx:97` — эффект сброса формы, существовал до плана.
- `yarn oxfmt --check .`: все файлы отформатированы.
- `yarn verify`: `yarn verify: OK` (все шаги passed; web 1234 теста, server 1651, exam-core 605, rbac 9, script-tests 202 pass).
- `yarn e2e`: 190 passed (1.7m), failed нет. Строки `Server request for /admin/attempts/not-a-uuid failed: status 400` — журнал веб-сервера негативных сценариев, не падения.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-16`: `08-16 changed only its files`.
- `git grep test-editor-api -- app/web`: импортирует только `useTestEditorModel.ts` (файл 08-15).
- Логи: scratchpad `08-16-impact.log`, `08-16-red.log`, `08-16-green.log`, `08-16-lint.log`, `08-16-verify.log`, `08-16-e2e.log`, `08-16-affected.log`.

## codegraph impact (до правок)

Запуск из основного дерева (worktree не проиндексирован).

- `TestsClient` — 3 символа: `TestsClient`, `TestsPage` (`admin/tests/page.tsx`), маршрут `/web/app/admin/tests`.
- `TopicTestsClient` — 3 символа: `TopicTestsClient`, `TopicTestsPage` (`[topicSlug]/page.tsx`), маршрут `/web/app/admin/tests/:topicSlug`.
- `TopicFormDialog` — 15 символов: `TopicFormDialog`, `TestEditorClient` и `EditTestPage` (`[topicSlug]/[testSlug]`), `NewTestPage` (`new/page.tsx`), `TopicTestsClient`/`TopicTestsPage`, `TestsClient`/`TestsPage` и их файлы. `TestEditorClient` передаёт `onSaved` из `useTestEditorModel`; контракт `onSaved(topic)` сохранён.

## codegraph affected (после правок)

Запуск из основного дерева: 5 файлов — сами файлы плана (`TestsClient.tsx`, `TopicTestsClient.tsx`, `TopicFormDialog.tsx`, `admin-api.ts`, `admin-api.test.ts`). Покрыты `vitest run lib/tests`, `yarn verify` и `yarn e2e` (`authoring.spec.ts`, `teacher-zone.spec.ts` — банк и темы).

## Deviations from Plan

### Применение правил фазы

**1. [Правило 08-04] revalidateOnFocus: false на SWR тем страницы темы**
- **Найдено в:** Task 2
- **Причина:** `TopicFormDialog` получает `editingTopic={topic}` из SWR и сбрасывает форму по смене `editingTopic`; ревалидация по фокусу стирала бы правку в открытом диалоге
- **Файл:** `[topicSlug]/TopicTestsClient.tsx`

**2. [Rule 3 - Blocking] Тип строки списка тестов**
- **Найдено в:** Task 2
- **Проблема:** `AdminTestListItem` из 08-11 (`{ id, title, topicTitle: string | null }`) не подходит банку и `TopicTestCard`, которые читают `Test`
- **Решение:** `AdminTestListItem = Test` (type-only импорт из `admin/tests/types`); `UserProfileAssignmentsPage` компилируется без правок
- **Файл:** `app/web/lib/tests/admin-api.ts`

### Отступление от UI-SPEC (backstop)

**3. Фокус после повтора «Не удалось загрузить тему»** — UI-SPEC просит `h1` героя темы. `h1` находится в `TopicHero.tsx` (не в `files_modified`, ref не принимает), а блок ошибки и герой в DOM вместе не бывают: `LoadErrorAlert` берёт цель фокуса при монтировании, когда героя ещё нет. Оставлено поведение браузера (backstop); у блоков статистики и тестов в UI-SPEC и так «—». Довести можно планом, который правит `TopicHero` (ref на `h1` с `tabIndex={-1}` и перенос фокуса после появления героя).

## Threat Flags

Нет: новых конечных точек и путей доступа план не добавляет. T-8-37 закрыт `failureMessage`/`exportFailureMessage` (английский текст и 5xx скрыты, в том числе `Topic with this slug already exists` в форме темы); T-8-38 — усечённый архив и обрыв тела дают тост «Не удалось скачать архив. Попробуйте ещё раз.» без сохранения файла (проверка в `downloadArchive` 08-11); T-8-SC — установок пакетов нет.

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. Экспорт ZIP обычный и около лимита (413) на preview (D-35): в банке и на странице темы «Экспорт» / «Экспорт с ответами» у теста и темы — файл скачивается с именем из `Content-Disposition` (тема — `<slug>.zip`), тост «Тест экспортирован» / «Тема экспортирована»; при архиве больше лимита — тост «Архив слишком большой для выгрузки, экспортируйте тесты по отдельности». Сводно в 08-28.
2. Блоки ошибки банка и темы на 375px (Поверхность 1): при недоступном `/api/tests/topics` или `/api/tests` — «Не удалось загрузить темы» / «…тесты» / «…тему» / «…статистику» с причиной и «Повторить»; после успешного повтора в банке фокус на «Навигация» / заголовке списка. Сводно в 08-28.
3. Коммит файлов плана делает ведущая сессия.

## Передачи следующим планам

- 08-15: `TestsClient.tsx` и `TopicTestsClient.tsx` больше не импортируют `test-editor-api.ts`; единственный импортёр — `useTestEditorModel.ts`. Старые `readApiError(response, fallback)` и `exportTestArchive(testId, slug, withAnswers)` в `test-editor-api.ts` можно удалять. `useTestEditorModel` читает `'/api/tests/topics'` своим fetcher — для перевода есть `adminTestsKeys.topics()` + `topicsListFetcher` (тело без преобразования, кэш общий с банком).
- 08-15, 08-20: `saveTopic`, `setTopicTeachers`, `fetchTopicTeacherOptions`, `deleteTopic`, `deleteTest` — в `lib/tests/admin-api.ts`; `saveTopic` отдаёт `{ topic }` и запасной текст «Ошибка сохранения». `AdminTestListItem` теперь `Test` из `admin/tests/types` (type-only импорт `lib` → `app`); если 08-23 переносит типы в `lib/tests`, импорт в `admin-api.ts` меняется вместе с ними.
- 08-23: `lib/api-fetch` импортируют на 3 файла меньше (`TestsClient`, `TopicTestsClient`, `TopicFormDialog`).
- 08-28: пункты «Deferred human verification».
- `deferred-items.md`: две записи 08-16 — английский `TOPIC_SLUG_EXISTS` на сервере (форма темы показывает «Ошибка сохранения») и фокус на `h1` героя темы (нужна правка `TopicHero.tsx`).

## Файлы к коммиту

- app/web/lib/tests/admin-api.ts
- app/web/lib/tests/admin-api.test.ts
- app/web/app/(internal)/(protected)/admin/tests/TestsClient.tsx
- app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/TopicTestsClient.tsx
- app/web/app/(internal)/(protected)/admin/tests/components/TopicFormDialog.tsx

## Состояние планирования

- STATE.md, ROADMAP.md и REQUIREMENTS.md не менялись: их обновляет оркестратор после коммита плана.

## Self-Check: PASSED

Все пять файлов изменены и видны в `git status`; новых файлов нет; `commits: 0` — по правилу пользователя изменения в рабочем дереве, `plan_head_before` равен `plan_head_after`.
