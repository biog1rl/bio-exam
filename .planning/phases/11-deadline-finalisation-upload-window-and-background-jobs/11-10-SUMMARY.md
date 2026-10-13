---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 10
subsystem: ui
tags: [web, test-editor, settings-panel, upload-window, e2e]
requires:
  - phase: 11-03
    provides: photoUploadWindowMinutes в API создания и настроек теста, чтение поля у автора, 400 с details.fieldErrors
  - phase: 11-01
    provides: PHOTO_UPLOAD_WINDOW_DEFAULT_MINUTES, PHOTO_UPLOAD_WINDOW_MAX_MINUTES
provides:
  - поле «Окно для фото после окончания времени, мин» в панели настроек теста (только при открытом вопросе)
  - photo-window.ts: hasOpenQuestion, photoWindowError, photoWindowSaveError, photoWindowHint, PHOTO_WINDOW_SAVE_TOAST
  - testSaveFailure возвращает photoWindowError
  - сид e2e: тема e2e-deadline, тесты photo-window-desktop и photo-window-mobile
affects: [11-12, 11-18]
actuals:
  tokens: 7257
  tasks: 3
  commits: 0
tech-stack:
  added: []
  patterns:
    - проверка скрытого поля идёт через photoWindowSaveError(value, visible): скрытое поле сохранение не блокирует
key-files:
  created:
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/photo-window.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/photo-window.test.ts
  modified:
    - app/web/app/(internal)/(protected)/admin/tests/types/index.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-utils.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-view.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.test.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/TestSettingsPanel.tsx
    - e2e/fixtures/seed.json
    - e2e/tests/test-editor.spec.ts
key-decisions:
  - "Ошибка 400 сервера по полю окна даёт сообщение под полем и открытую панель без тоста (как ошибка адреса); прочие 400 идут прежним путём с запасным текстом"
  - "Значение окна у скрытого поля уходит в API как пришло с сервера (null скрытого очищенного поля сервер не применяет, 11-03)"
  - "Фокус на поле при ошибке сохранения ставится через setTimeout (0 мс при открытой панели, 150 мс, если панель была закрыта): FocusScope Radix при открытии Sheet фокусирует первый элемент"
  - "id поля и подсказки — литералы в TestSettingsPanel.tsx (приёмка grep) и в модели для фокуса, отдельной константы нет"
  - "Два e2e-сценария: tracer меняет значение засеянного теста и возвращает 15, второй только читает и вводит без сохранения, поэтому параллельные проекты не пересекаются"
requirements-completed: [TIME-02]
status: complete
---

# Phase 11 Plan 10: поле окна для фото в настройках теста Summary

В панели «Настройки теста» под лимитом времени появилось поле «Окно для фото после окончания времени, мин»: оно видно только при открытом вопросе, у нового теста стоит 15, 0 показывается как 0, ввод проверяется до отправки, ошибка сервера по полю показывается под полем.

## Что сделано

- Task 1 (tracer): `photoUploadWindowMinutes: number | null` в `TestFormData`, `SettingsFields`, `SavedTestSettings` (и необязательное поле в `Test`); `savedSettings` берёт значение сервера (`?? 15` для старого ответа), `settingsOf` его переносит (изменение поля делает форму «грязной»), `createInitialTestForm` ставит 15, тело `updateTestSettings` и создания теста содержит поле, модель читает поле при загрузке теста. В `TestSettingsPanel.tsx` поле стоит сразу под лимитом времени (до порогов таймера): `value={... ?? ''}`, пустая строка превращается в `null`, иначе `Number(value)`; `parseInt` не используется. Сид: тема `e2e-deadline`, тесты `photo-window-desktop` и `photo-window-mobile` (вопросы `pw-text` и `pw-open`).
- Task 2: `photo-window.ts` с чистыми функциями; `testSaveFailure` распознаёт `details.fieldErrors.photoUploadWindowMinutes` в 400 и отдаёт `photoWindowError`; модель: серверная ошибка поля, проверка `photoWindowSaveError(...)` перед сохранением (запроса нет, `toast.error`, `setSettingsOpen(true)`, фокус на поле); панель показывает ошибку вместо подсказки с `text-destructive`, `aria-invalid` и рамкой `border-destructive`. Серверная ошибка сбрасывается при вводе.
- Task 3: e2e скрытого поля и неверного значения, контраст, ворота.

## Проверки

- `yarn workspace @bio-exam/web typecheck`: зелёный.
- Web-тесты: после 95 файлов и 1445 тестов; «до» (94 файла, 1425 тестов) выведено как «после» минус новые тесты, отдельным прогоном до правок не мерилось (`photo-window.test.ts` 18 тестов, `test-editor-api.test.ts` +2 строки `test.each` про 400 по полю окна и по другому полю).
- `yarn e2e tests/test-editor.spec.ts`: 24 passed (два новых сценария на desktop и mobile). `yarn e2e tests/test-editor.spec.ts tests/bank.spec.ts tests/scoring.spec.ts`: 30 passed (новая тема сида списки банка и подсчёты не ломает). После форматирования спека `test-editor.spec.ts` прогнан ещё раз: 24 passed.
- `yarn workspace @bio-exam/web build` и `yarn editor:budget`: `editor bundle OK`, `/admin/tests/[topicSlug]/[testSlug]/questions/[questionId]` raw 2604994 / gzip 729071 (маршрут редактора вопроса, панель настроек в него не входит; `scripts/editor-bundle-budget.json` не менялся).
- `yarn format:check`: зелёный. `yarn verify`: `yarn verify: OK`.
- Замеры контраста по вычисленным стилям в браузере (`lowContrastTexts` для всей страницы с панелью, пусто и в состоянии подсказки, и в состоянии ошибки; числа — разовый замер canvas-функцией спека, из спека убран): подсказка `muted-foreground` на фоне панели 5,60:1, ошибка `destructive` на фоне панели 5,08:1 (порог AA 4,5:1; таблица UI-SPEC: 5,61 и 5,11).
- `codegraph impact savedSettings`: `test-editor-view.ts`, `test-editor-view.test.ts` (константа `SAVED`), `useTestEditorModel`, `TestEditorClient`; `createInitialTestForm`: `test-editor-utils.ts`, `useTestEditorModel`, `TestEditorClient`. `codegraph affected` по `test-editor-api.ts`, `test-editor-view.ts`, `types/index.ts`: затронутых тестов не нашёл (индекс `.codegraph` в worktree отсутствует, поэтому зависимости сверены `impact` и прогоном всего web-набора).
- Сверка файлов плана `11-plan-files.cjs check 11-10` не запускалась (режим worktree: её делает ведущая сессия).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ожидания `testSaveFailure` в `test-editor-api.test.ts` расширены полем `photoWindowError: null`**
- **Found during:** Task 2
- **Issue:** `deepEqual` на результате `testSaveFailure` падал бы после добавления поля в возвращаемый объект.
- **Fix:** в существующие строки `test.each` добавлено `photoWindowError: null`, смысл ожиданий не менялся; в `FORM` и в тело PATCH добавлено `photoUploadWindowMinutes: 15`.
- **Files modified:** `test-editor-api.test.ts`

## Не проверено в браузере

- Путь «панель настроек закрыта, ошибка поля, «Сохранить» из панели сохранения»: тост, открытие панели и фокус на поле через 150 мс e2e не покрыты. Покрыт путь с открытой панелью (фокус на поле, запроса нет). Возможна гонка `setTimeout` с автофокусом Radix FocusScope при открытии Sheet.
- Ответ 400 сервера по полю окна в живом интерфейсе: проверен только табличным тестом `testSaveFailure`.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности: поле уходит в уже существующие PATCH/POST, границу держат zod и CHECK сервера (11-03).

## Файлы к коммиту

- `app/web/app/(internal)/(protected)/admin/tests/types/index.ts`
- `app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-utils.ts`, `test-editor-view.ts`, `test-editor-api.ts`, `test-editor-api.test.ts`, `useTestEditorModel.ts`, `TestSettingsPanel.tsx`
- `app/web/app/(internal)/(protected)/admin/tests/components/test-editor/photo-window.ts`, `photo-window.test.ts` (новые)
- `e2e/fixtures/seed.json`, `e2e/tests/test-editor.spec.ts`

## Self-Check: PASSED
