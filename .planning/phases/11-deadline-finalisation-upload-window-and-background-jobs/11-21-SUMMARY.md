---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 21
subsystem: ui
tags: [web, test-editor, settings-form, refactor, arch-review]
status: complete
requires:
  - phase: 11-10
    provides: поле окна для фото в настройках теста, photo-window.ts, testSaveFailure с photoWindowError
provides:
  - test-settings-form.ts — один модуль без React для формы настроек теста: TestSettings, SavedTest, UpdateTestSettingsBody, CreateTestBody, SettingsSaveError, SettingsSaveContext, initialTestForm, withSavedSettings, settingsChanged, settingsSaveError, photoWindowField, updateSettingsBody, createTestBody
  - таблицы интерфейса модуля в Vitest без DOM (test-settings-form.test.ts)
  - e2e «Добавить вопрос» в новом тесте без названия — тост «Введите название теста», тест не создаётся
affects: [11-18]
actuals:
  tokens: 9157
  tasks: 3
  commits: 0
plan_head_before: e7485f1a05278aa485be6b6114a433f48426bed5
plan_head_after: e7485f1a05278aa485be6b6114a433f48426bed5
tech-stack:
  added: []
  patterns:
    - типизированная таблица полей { [K in keyof TestSettings]: { initial; fromSaved } } — начальная форма, перенос сохранённого, «изменено ли» и тела запросов обходят её ключи
    - тип тела запроса задаётся на границе API редактора, request.ts (json?: unknown) не меняется
key-files:
  created:
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-settings-form.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-settings-form.test.ts
  modified:
    - app/web/app/(internal)/(protected)/admin/tests/types/index.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-view.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-view.test.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-utils.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/TestSettingsPanel.tsx
    - e2e/tests/test-editor.spec.ts
key-decisions:
  - "Тип тела задаётся на границе API редактора (UpdateTestSettingsBody, CreateTestBody); updateTestSettings(testId, form) и createTest(form) сохраняют сигнатуры и строят тело функциями модуля, закрепление тела PATCH в test-editor-api.test.ts не менялось"
  - "TestSettings объявлен в модуле формы; TestFormData в types/index.ts — interface extends TestSettings (import type) с order, scoringRules?, questions"
  - "persistNewTest сам проверяет настройки через settingsSaveError(form, { mode: 'create', questionCount: form.questions.length }), потому что его вызывает и handleSave, и handleAddQuestion в новом тесте"
  - "«Отменить изменения» через withSavedSettings возвращает и order к сохранённому; order в интерфейсе не редактируется, видимой разницы нет"
  - "scoringRules попадает в тела запросов только когда задан (условный spread); на проводе то же, что раньше: undefined и раньше выпадал при JSON"
patterns-established:
  - "Новое поле настроек теста: тип TestSettings, строка FIELDS в test-settings-form.ts, поле на TestSettingsPanel.tsx; забытая строка таблицы или поле в Test ловит typecheck"
requirements-completed: [TIME-02]
coverage:
  - id: D1
    description: "Форма настроек теста — один модуль: перенос сохранённого, «изменено ли», тела PATCH и создания из одной таблицы полей"
    requirement: TIME-02
    verification:
      - kind: unit
        ref: "app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-settings-form.test.ts"
        status: pass
      - kind: unit
        ref: "app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.test.ts#updateTestSettings — PATCH настроек без вопросов и тело ответа"
        status: pass
  - id: D2
    description: "Проверки перед сохранением и поле окна для фото отдаёт модуль; хук показывает тост, открывает панель и ставит фокус"
    requirement: TIME-02
    verification:
      - kind: unit
        ref: "test-settings-form.test.ts#settingsSaveError, photoWindowField"
        status: pass
      - kind: e2e
        ref: "yarn e2e tests/test-editor.spec.ts"
        status: pass
  - id: D3
    description: "«Добавить вопрос» в новом тесте без названия — тост «Введите название теста», запроса создания нет"
    verification:
      - kind: e2e
        ref: "e2e/tests/test-editor.spec.ts#«Добавить вопрос» in a new test without a title explains it and creates nothing @test-editor"
        status: pass
duration: 22min
completed: 2026-10-06
---

# Phase 11 Plan 21: Форма настроек теста одним модулем Summary

**Поля настроек теста описаны один раз — типизированной таблицей в `test-settings-form.ts`; из неё выводятся начальная форма, перенос сохранённого, «изменено ли», тела PATCH и создания; проверки перед сохранением и поле окна для фото тоже в модуле, хук редактора только вызывает его.**

## Performance

- **Duration:** ~22 мин
- **Completed:** 2026-10-06
- **Tasks:** 3/3
- **Files:** 2 созданы, 8 изменены

## Где теперь описано поле настроек

`app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-settings-form.ts`:

- `TestSettings` — тип полей настроек; `TestFormData` расширяет его.
- `FIELDS: { [K in keyof TestSettings]: { initial; fromSaved(saved: SavedTest) } }` — значение новой формы и перенос из ответа сервера (значения по умолчанию прежние: `description || ''`, `showCorrectAnswer ?? true`, пороги `?? null`, окно `?? PHOTO_UPLOAD_WINDOW_DEFAULT_MINUTES`).
- `SavedTest = Pick<Test, keyof TestSettings | 'order'>` — поле настроек, которого нет в `Test`, даёт ошибку typecheck.

Новое поле: тип `TestSettings`, строка `FIELDS`, поле на `TestSettingsPanel.tsx`. Тело PATCH и создания, «изменено ли», начальная форма и синхронизация после загрузки получают поле без отдельной правки. Если поле проверяется до отправки — ветка в `settingsSaveError`.

## Accomplishments

- `test-settings-form.ts`: `initialTestForm`, `withSavedSettings`, `settingsChanged`, `updateSettingsBody`, `createTestBody` обходят ключи таблицы; `settingsSaveError(form, { mode, questionCount })` → `{ message, field } | null` (тема, название, адрес, публикация без вопросов только при `edit`, окно для фото при открытом вопросе → `field: 'photoUploadWindowMinutes'`); `photoWindowField(form, serverError)` → `{ visible, error }` поверх `hasOpenQuestion` и `photoWindowSaveError` из `photo-window.ts`.
- `useTestEditorModel.ts`: эффект синхронизации — `withSavedSettings(prev, testData.test)`; `dirty = isEditingExisting && settingsChanged(form, testData?.test ?? null)`; «Отменить» — `withSavedSettings`; `useState(() => initialTestForm())`; `handleSave` и `persistNewTest` — `settingsSaveError`. Тост, открытие панели и фокус на `test-settings-photo-window` (0 мс при открытой панели, 150 мс иначе) остались в хуке.
- `test-editor-api.ts`: `updateTestSettings` — `json: updateSettingsBody(form)`, `createTest` — `json: createTestBody(form)`; полей настроек в слое API нет.
- `test-editor-view.ts`: удалены `SettingsFields`, `SavedTestSettings`, `savedSettings`, `settingsOf`, `settingsDirty`; `test-editor-utils.ts`: удалены `createInitialTestForm`, `normalizeFormPayload`, `getBaseValidationError`.
- `TestSettingsPanel.tsx`: видимость и ошибка поля окна — `photoWindowField(form, photoWindowServerError)`; разметка поля, подсказка `photoWindowHint`, id и классы прежние.
- e2e: новый случай `«Добавить вопрос» in a new test without a title explains it and creates nothing @test-editor` — `/admin/tests/new?topic=…`, ждёт выбранную тему, Escape, «Добавить вопрос» → тост «Введите название теста», адрес `/admin/tests/new`, POST `/api/tests/save` нет.

## Task Commits

Коммитов нет: по правилам фазы коммитит ведущая сессия (`11-EXEC-RULES.md`, режим worktree). `commits: 0` — изменения в рабочем дереве worktree.

## Решения плана

- Тип тела задаётся на границе API редактора (`UpdateTestSettingsBody`, `CreateTestBody`); `json?: unknown` в `app/web/lib/http/request.ts` не менялся. `updateTestSettings(testId, form)` и `createTest(form)` сохранили сигнатуры; `test-editor-api.test.ts` не менялся и зелёный.
- `TestSettings` объявлен в модуле; `TestFormData` в `types/index.ts` — `interface TestFormData extends TestSettings` (`import type`) с `scoringRules?`, `order`, `questions`.
- `savedSettings`, `settingsDirty`, `settingsOf`, `SettingsFields`, `SavedTestSettings` ушли из `test-editor-view.ts`; describe «несохранённые настройки» удалён из `test-editor-view.test.ts`, его случаи — в таблицах `withSavedSettings`/`settingsChanged` модуля. `createInitialTestForm`, `normalizeFormPayload`, `getBaseValidationError` ушли из `test-editor-utils.ts`.
- `photo-window.ts` и его тест не менялись.
- Фокус, `setTimeout` и открытие панели — в хуке; модуль отдаёт `{ message, field }`.
- `persistNewTest` проверяет настройки сам (`mode: 'create'`, `questionCount: form.questions.length`), ошибка → `Error(message)` с прежним текстом; путь `handleAddQuestion` в новом тесте закреплён e2e.
- «Отменить изменения» возвращает и `order` к сохранённому — в интерфейсе `order` не редактируется, видимой разницы нет.
- `scripts/editor-bundle-budget.json` не менялся.

## Красные и зелёные прогоны

- Task 1 красный: `yarn workspace @bio-exam/web vitest run test-settings-form.test.ts test-editor-view.test.ts` — `Test Files 1 failed | 1 passed (2)`, импорт `./test-settings-form` не разрешается (модуля нет), `test-editor-view.test.ts` 15 passed.
- Task 1 зелёный: `vitest run test-settings-form.test.ts test-editor-view.test.ts test-editor-api.test.ts photo-window.test.ts` — `Test Files 4 passed (4)`, `Tests 79 passed (79)`; `yarn workspace @bio-exam/web typecheck` — 0; `lint` — 0 ошибок; tracer-ворота `yarn e2e tests/test-editor.spec.ts` — `24 passed`.
- Task 2 красный: `vitest run test-settings-form.test.ts` — `Tests 16 failed | 22 passed (38)`: `TypeError: settingsSaveError is not a function`, `TypeError: photoWindowField is not a function`; таблицы Task 1 зелёные.
- Task 2 зелёный: те же четыре файла — `Tests 95 passed (95)`; typecheck 0; `yarn e2e tests/test-editor.spec.ts` — `26 passed` (новый случай на desktop и mobile).

## codegraph

Индекс CodeGraph — в основном checkout (ветка `dev`, те же исходники до плана); запросы шли оттуда, только чтение.

- `codegraph impact savedSettings` — 7 символов: `test-editor-view.ts` (`savedSettings`), `test-editor-view.test.ts` (`SAVED`), `useTestEditorModel` → `TestEditorClient`.
- `codegraph impact settingsDirty` — две сущности: проп `TestEditorHeaderProps::settingsDirty` (не трогали) и функция в `test-editor-view.ts` → `test-editor-view.test.ts`, `useTestEditorModel`, `TestEditorClient`.
- `codegraph impact useTestEditorModel` — `TestEditorClient` → `EditTestPage` (`[topicSlug]/[testSlug]/page.tsx`), `NewTestPage` (`new/page.tsx`).
- `codegraph impact getBaseValidationError` — `persistNewTest`, `handleAddQuestion`, `handleSave` в `useTestEditorModel`.
- `codegraph impact createInitialTestForm` — `useTestEditorModel` → `TestEditorClient`.
- `codegraph impact normalizeFormPayload` — `persistNewTest`, `handleAddQuestion`, `handleSave`.
- `codegraph affected` по семи исходным файлам плана — вернул сами файлы (7), отдельных тестов не назвал; тесты выбраны по импортам: `test-settings-form.test.ts`, `test-editor-view.test.ts`, `test-editor-api.test.ts`, `photo-window.test.ts`, `question-validation.test.ts` (импортирует `test-editor-utils`), плюс полный набор web и четыре e2e-спека.

## Ворота (Task 3)

- `yarn workspace @bio-exam/web test` — `Test Files 100 passed (100)`, `Tests 1598 passed (1598)`.
- `yarn workspace @bio-exam/web lint` — 0 ошибок; предупреждения `set-state-in-effect` и `preserve-manual-memoization` в `useTestEditorModel.ts` прежние (эффекты синхронизации и `applySaveFailure` были и до плана).
- `yarn e2e tests/test-editor.spec.ts tests/authoring.spec.ts tests/bank.spec.ts tests/teacher-zone.spec.ts` — `68 passed`.
- `yarn workspace @bio-exam/web build && yarn editor:budget` — `editor bundle OK`. До плана (сборка `dev` в этом worktree): raw 2609586, gzip 730268. После: raw 2611371, gzip 730850 (оба маршрута редактора вопроса). Бюджет: raw 2732396, gzip 769896.
- `yarn verify` — первый прогон `FAILED at lint-typecheck-test`: в `@bio-exam/server#test` 5 наборов упали на `Hook timed out in 10000ms` (`settings-charts`, `sidebar-write-validation`, `profile-update`, `attempt-stored-results`, `role-traits`) при load average 43 от параллельных worktree; серверный код план не трогал. Повтор по правилу фазы — `yarn verify: OK` (все восемь шагов passed).
- `yarn format:check` — все файлы в формате.
- `11-plan-files.cjs check 11-21` — не запускался (режим worktree).
- Без изменений: `test-editor-api.test.ts`, `photo-window.ts`, `photo-window.test.ts`, `scripts/editor-bundle-budget.json`, `app/web/lib/http/request.ts`, `app/server/src/schemas/tests.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Двойная нормализация вопросов при создании в промежутке между задачами**
- **Found during:** Task 1
- **Issue:** после переноса нормализации в `createTestBody` хук ещё оборачивал форму в `normalizeFormPayload` (по плану это убиралось в Task 2), вопросы нормализовались бы дважды.
- **Fix:** вызов `createTest({ ...form, isPublished })` без `normalizeFormPayload` сделан уже в Task 1; итог совпадает с планом Task 2.
- **Files modified:** `useTestEditorModel.ts`

### Замечание о бюджете

Обзор (`11-ARCH-REVIEW.md`, C) ожидал, что бюджет первой загрузки не растёт; план требует «не превышен». Маршрут редактора вопроса (`QuestionEditorPageClient.tsx`) импортирует из `test-editor-api.ts`, а тот теперь — из `test-settings-form.ts`, поэтому модуль формы попал в бандл редактора вопроса: +1785 байт raw, +582 gzip. Проба с ленивым списком ключей (без вызова `Object.keys` на уровне модуля) размер не уменьшила (raw 2611393), откатил. Бюджет не превышен, запас ~121 КБ raw и ~39 КБ gzip. Убрать прирост можно, разделив `test-editor-api.ts` на запросы редактора теста и запросы редактора вопроса, — это вне плана.

## Issues Encountered

- Первый `yarn verify` упал на таймаутах хуков серверных тестов под нагрузкой (см. «Ворота»); повтор зелёный.

## Known Stubs

Нет.

## Файлы к коммиту

```
 M app/web/app/(internal)/(protected)/admin/tests/components/test-editor/TestSettingsPanel.tsx
 M app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts
 M app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-utils.ts
 M app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-view.test.ts
 M app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-view.ts
 M app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts
 M app/web/app/(internal)/(protected)/admin/tests/types/index.ts
 M e2e/tests/test-editor.spec.ts
?? app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-settings-form.test.ts
?? app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-settings-form.ts
?? .planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-21-SUMMARY.md
```

## Self-Check: PASSED

- `test-settings-form.ts`, `test-settings-form.test.ts`, `11-21-SUMMARY.md` существуют.
- Критерии приёмки Task 1–3 (grep и `git diff --quiet`) выполнены.
