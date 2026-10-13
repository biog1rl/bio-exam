---
phase: 06-draft-durability
plan: 08
subsystem: web-question-draft
tags: [autosave, question-draft, leave-guard, local-copy, toasts, life04, life05]
status: complete
deferred_human_gate: false

requires:
  - phase: 06-01
    provides: "e2e/tests/question-draft-durability.spec.ts с проверками LIFE-04 под test.fail"
  - phase: 06-04
    provides: "createQuestionDraftAutosave, autosaveStatusView, DRAFT_TOAST, DRAFT_TOAST_ID, RETRY_SAVE_LABEL, forgetQuestionDraftCopies"
  - phase: 06-06
    provides: "useUnsavedChanges (registerFlush, leave, leavingByPath, clear), UnsavedChangesDialog, toQuestionDraftPayload"
provides:
  - "app/web/lib/drafts/question-draft-api.ts: questionDraftAutosaveApi(testId, draftId) — PATCH черновика с исходом и readLockVersion"
  - "app/web/lib/drafts/use-question-draft-autosave.ts: useQuestionDraftAutosave — модуль автосохранения в React, стор ухода, тосты"
  - "QuestionEditor: необязательные пропы autosaveStatus и leaving (строка автосохранения, ожидание «Отмена»)"
  - "deleteQuestionDraft удаляет локальные копии черновика"
affects: [06-10, 06-11]

estimate:
  tokens: 100000
  tasks: 3
actuals:
  tokens: 8500
  tasks: 3
  commits: 0
plan_head_before: 4027ae0001f234e65975daa8dbe653d3547e5746
plan_head_after: 4027ae0001f234e65975daa8dbe653d3547e5746

tech-stack:
  added: []
  patterns:
    - "Модуль автосохранения создаётся в эффекте один раз на ключ testId:draftId:userId; форма страницы заполняется из initialPayload модуля через setState во время рендера, поэтому редактор монтируется уже с данными, а start() идёт после монтирования"
    - "Тост «Черновик изменён в другом месте…» выводится из snapshot.canRestoreCopy эффектом с toast.dismiss в очистке, а не из уведомления copy-diverged"

key-files:
  created:
    - app/web/lib/drafts/question-draft-api.ts
    - app/web/lib/drafts/question-draft-api.test.ts
    - app/web/lib/drafts/use-question-draft-autosave.ts
  modified:
    - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
    - app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx
    - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts
    - e2e/tests/question-draft-durability.spec.ts

key-decisions:
  - "Решение исполнителя (автономно): тост copy-diverged показывается эффектом по snapshot.canRestoreCopy (с id question-draft-diverged, duration Infinity, действием восстановления) и закрывается в очистке эффекта. Уведомление модуля copy-diverged хук не обрабатывает: в StrictMode start → dispose → start закрыл бы тост, показанный по уведомлению, а второй start уведомление не повторяет. Тот же эффект закрывает тост при размонтировании страницы"
  - "Решение исполнителя (автономно): из e2e перезагрузки убрано ожидание тоста «Восстановлены правки…» (Task 2 п. 4). Досылка при pagehide (keepalive, без lockVersion, R-07) не перехватывается ни page.route, ни context.route и доходит до сервера до GET новой страницы: сразу после reload у черновика lockVersion=1 и последняя правка; копия совпадает с сервером и удаляется, тоста нет — это поведение по спецификации. Восстановление копии и тост проверены отдельным разовым прогоном (см. «Проверка восстановления копии»)"
  - "Решение исполнителя (автономно): userId для ключа копии — useAuth().me?.id; пока me нет, модуль не создаётся и страница черновика показывает прежний экран загрузки"
  - "Решение исполнителя (автономно): reopen() вызывается только если POST вопроса не прошёл; если вопрос сохранён, а упало что-то позже (mutate), модуль остаётся закрытым, чтобы не слать PATCH в удалённый черновик. discardCopy() и clear(pathname) выполняются после DELETE черновика независимо от его ответа (вопрос уже сохранён; прежний console.warn о неудачном DELETE оставлен)"
  - "Решение исполнителя (автономно): ряд кнопок шапки получает items-center и tab:justify-end, когда проп autosaveStatus передан (в режиме черновика он null, пока строка скрыта, например в closed), чтобы раскладка не прыгала при «Сохранить вопрос»; без пропа ряд прежний. Кнопка «Отмена» вне ожидания рендерит прежний текст без span"
  - "requirements-completed — только LIFE-04: LIFE-05 закрыт частично (мгновенная «Отмена» и перезагрузка черновика — обычные e2e), остальное по LIFE-05 — в 06-09 и 06-11"
  - "Решение исполнителя (автономно): создание модуля через setState в эффекте даёт одно новое предупреждение oxlint react(set-state-in-effect) (в web их 30 до плана, lint exit 0): эффект синхронизирует с внешней системой (localStorage), а создание во время рендера читало бы и удаляло копию в чистой фазе"

requirements-completed: [LIFE-04]

duration: 25min
completed: 2026-10-04
---

# Phase 6 Plan 08: Страница черновика вопроса на модуле автосохранения Summary

**Черновик вопроса сохраняется через `createQuestionDraftAutosave` (хук `useQuestionDraftAutosave` + `questionDraftAutosaveApi`): «Отмена» и «Назад» ждут досылку через стор ухода, при неудаче — диалог с описанием по виду ошибки; в шапке строка «Сохранено / Сохранение… / Не сохранено» с «Повторить сохранение»; тосты UI-SPEC вместо серверной строки 409; локальная копия применяется до монтирования редактора, расхождение с сервером — тост с действием восстановления; «Сохранить вопрос» закрывает автосохранение до POST и DELETE; удаление черновика из списка стирает его копии; обе проверки LIFE-04 из 06-01 обычные и зелёные на двух проектах**

коммит: не выполнялся (правило пользователя), изменения в рабочем дереве

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-04T18:45:13Z
- **Completed:** 2026-10-04T19:10:34Z
- **Tasks:** 3
- **Files modified:** 7 (3 новых, 4 изменённых)

## Accomplishments

- `question-draft-api.ts`: `save(payload, lockVersion, { keepalive })` → PATCH `/api/tests/:testId/question-drafts/:draftId` через `apiFetch`, тело `{ payload, lockVersion }` или `{ payload }` при `lockVersion` null; 200 с числовой `draft.lockVersion` → `ok`, 409 → `conflict`, 403 → `forbidden`, 404 → `gone`, прочее и исключение → `failed`; с keepalive тело больше `KEEPALIVE_BODY_LIMIT_BYTES` → `failed` без запроса. `readLockVersion()` → GET, `draft.lockVersion` или null.
- `use-question-draft-autosave.ts`: модуль создаётся один раз на `testId:draftId:userId`, когда пришёл `serverDraft` (ревалидация SWR не пересоздаёт); швы `localStorage` (с отсоединённым хранилищем, если доступ бросает), `window`, `questionDraftAutosaveApi`; `start()`/`dispose()` в эффекте; снимок через `useSyncExternalStore`; `registerFlush(pathname, () => autosave.flushForLeave())`, `setDirty(pathname, hasUnsavedWrite)`, при размонтировании `registerFlush(pathname, null)` и `clear(pathname)`; тосты Поверхности 5.
- `QuestionEditorPageClient.tsx`: режим черновика на модуле (см. перечень участков).
- `QuestionEditor.tsx`: строка автосохранения по разметке UI-SPEC Поверхность 2 (`role="status"`, `aria-live="polite"`, `Check` / `Loader2 animate-spin` / `CircleAlert`, `text-red-600` для ошибок, «Повторить сохранение» `variant="outline" size="sm" className="h-11 rounded-full tab:h-8"` вне live-области); «Отмена» при `leaving` — `relative`, текст в `span.invisible`, `Loader2` по центру, `aria-label="Отмена"`, `aria-busy`, не выключается; «Сохранить вопрос» `disabled={leaving}`.
- `test-editor-api.ts`: `deleteQuestionDraft` после успешного ответа вызывает `forgetQuestionDraftCopies(window.localStorage, draftId)`, исключение доступа к хранилищу глотается.
- `question-draft-durability.spec.ts`: у проверок «правка и сразу «Отмена»» и «перезагрузка во время задержанного PATCH» сняты `test.fail()`, `@known-defect` и пометка «known defect (чинит 06-08)».

## Изменённые участки (для слияния)

### QuestionEditorPageClient.tsx

Ветки режима правки (06-06), перенос, экраны ошибок загрузки с «Назад к тесту» и `extractQuestionFromDraftPayload` не менялись.

1. Импорты: `useAuth`; `type AutosaveStatusView`, `autosaveStatusView` из `draft-ui`; `type QuestionDraftAutosave`; `useQuestionDraftAutosave`; `type LeaveDecision`; `toQuestionDraftPayload`. Удалена константа `QUESTION_DRAFT_SAVE_DEBOUNCE_MS`.
2. После `extractQuestionFromDraftPayload`: функции `questionFromDraftPayload`, `statusFor`, тип `DraftForm`.
3. Начало компонента: `me` из `useAuth`, `leaveUnsaved`, `isLeaving` из стора, состояние `leaveDescription`, `handledLeaveRef`; вместо `draftQuestion`, `draftLockVersion`, `draftAutosaveTimerRef`, `isDraftHydratedRef`, `latestDraftQuestionRef`, `lockVersionRef` — состояние `draftForm`.
4. `useSWR` черновика: только `data` и `error` (без `isLoading` и `mutate`).
5. Вместо эффектов `lockVersionRef`, гидратации и снятия таймера: `draftOrder`, `serverDraft` (нормализованный `toQuestionDraftPayload(questionFromDraftPayload(draft.payload, order), order)` и `lockVersion`), `restoreDraftCopy`, вызов `useQuestionDraftAutosave`, заполнение `draftForm` из `autosave.initialPayload` во время рендера.
6. `currentQuestion`: в режиме черновика `draftForm?.question ?? null`.
7. После `backToTestEditor`: `leaveDraft` (уход через `leave(pathname)` с защитой от двойного перехода); `handleCancel` в режиме черновика вызывает `leaveDraft`, в режиме правки ставит описание `UNSAVED_CHANGES_TEXT.description`.
8. Удалён `persistDraftQuestion`; `handleQuestionDraftChange` → `autosave?.change(toQuestionDraftPayload(nextQuestion, draftOrder))`.
9. `handleSaveQuestion`: `await autosave?.closeForSave()` в режиме черновика после проверки формы; флаг `questionStored` после успешного POST; после DELETE черновика `autosave?.discardCopy()` и `clearUnsaved(pathname)`; в `catch` `autosave?.reopen()`, если POST не прошёл; `autosave` в зависимостях.
10. Условие экрана загрузки: `isLoading || (isDraftMode && !draftForm && !questionDraftError && !error)`.
11. Разметка: `key` у `QuestionEditor` в режиме черновика (`draft-${version}`), пропы `autosaveStatus` и `leaving`; `UnsavedChangesDialog` рендерится в режимах правки и черновика с `description={leaveDescription}`.

### QuestionEditor.tsx

Только ряд кнопок шапки и новые пропы: импорт `Check`, `CircleAlert`, `AutosaveStatusView`, `RETRY_SAVE_LABEL`, `cn`; пропы `autosaveStatus`, `leaving`; константа `AUTOSAVE_ICON`; ряд кнопок с `cn(...)`; строка состояния первым элементом; «Отмена» с видом ожидания; `disabled={leaving}` у «Сохранить вопрос»; компонент `AutosaveStatusLine` в конце файла.

### test-editor-api.ts

Импорт `forgetQuestionDraftCopies` (строка 2) и хвост тела `deleteQuestionDraft`. `readApiError` и `exportTestArchive` не тронуты.

## TDD: сначала красный

Коммитов RED/GREEN нет (правило пользователя); порядок соблюдён по сути:

| Задача | Красный прогон до реализации | Зелёный |
|--------|------------------------------|---------|
| Task 1 (`question-draft-api.test.ts`, 10 случаев) | `Test Files 1 failed (1)`, `Tests no tests` (нет модуля `./question-draft-api`) | `Tests 10 passed (10)`; `vitest run lib/drafts` — 6 файлов, 98 passed |

## Трассер (Task 1)

Страница, хук и вёрстка `QuestionEditor` (пропы Task 2 нужны для typecheck) подключены до первого e2e. Затем с `test.fail()` снят только тест «Отмена», и `yarn e2e --grep "@life04"` прошёл: «Отмена» зелёная на `chromium-desktop` и `chromium-mobile`; тест перезагрузки под `test.fail()` дал «Expected to fail, but passed» на обоих проектах (2 failed, 10 passed) — дефект перезагрузки тоже починен. После этого снят `test.fail()` с теста перезагрузки, остальные правки e2e делались после зелёного трассера.

## Проверка открытия без PATCH и восстановления копии (разовый прогон)

Временный `e2e/tests/zz-scratch-0608.spec.ts` (удалён до сверки по отпечатку), оба проекта, все случаи зелёные:

- Открытие черновика с сохранённой формулировкой без правок: 0 PATCH за 2,5 с, ключей `question-draft-wal-` в `localStorage` нет, строка «Сохранено» (D-20).
- Перезагрузка во время PATCH, задержанного маршрутом: сразу после reload GET черновика даёт `lockVersion=1` и последнюю правку; маршрут видел только первый PATCH (досылка keepalive при pagehide маршрут обходит, `page.route` и `context.route` одинаково).
- Копия с `baseLockVersion`, равной версии сервера, и другой формулировкой: тост «Восстановлены правки, которые не успели сохраниться на сервере.», в редакторе текст копии, строка доходит до «Сохранено», ключ копии удалён, на сервере `lockVersion` 2 и текст копии.
- Копия с `baseLockVersion` на 1 меньше версии сервера: тост «Черновик изменён в другом месте. Открыта версия с сервера, правки с этого устройства не применены.», в редакторе версия сервера; «Восстановить правки с этого устройства» → в редакторе текст копии, тост закрыт, PATCH с текстом копии 200, ключ копии удалён, на сервере `lockVersion` 3 и текст копии.

## codegraph impact (D-29)

Индекс основного дерева `/Users/kdvornichenko/bio-exam` (в worktree `.codegraph/` нет; номера строк — по индексу, в worktree они сдвинуты после 06-06).

- `codegraph impact QuestionEditorPageClient` — 5 символов: `QuestionEditorPageClient` (`.../questions/QuestionEditorPageClient.tsx:103`), `EditQuestionPage` (`.../questions/[questionId]/page.tsx:11`, маршрут `/admin/tests/:topicSlug/:testSlug/questions/:questionId`), `QuestionDraftPage` (`.../questions/drafts/[draftId]/page.tsx:11`, маршрут `.../questions/drafts/:draftId`).
- `codegraph impact QuestionEditor` — 4 символа: `QuestionEditor` (`.../admin/tests/components/QuestionEditor.tsx:40`), `QuestionEditorPageClient:103`, `EditQuestionPage:11`, `QuestionDraftPage:11`.
- `codegraph impact deleteQuestionDraft` — 4 символа: `deleteQuestionDraft` (`.../test-editor/test-editor-api.ts:51`), `handleDeleteQuestionDraft:307` и `useTestEditorModel:63` (`.../test-editor/useTestEditorModel.ts`, файл не менялся).
- `codegraph impact persistDraftQuestion` — 5 символов: `persistDraftQuestion:235`, `handleQuestionDraftChange:276`, `QuestionEditorPageClient:103`, `EditQuestionPage:11`, `QuestionDraftPage:11`. `persistDraftQuestion` удалён, `handleQuestionDraftChange` переведён на модуль.

## codegraph affected

`codegraph affected` по 7 файлам плана, вывод дословно:

```
Affected test files (5):

  app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
  app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx
  app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts
  app/web/lib/drafts/question-draft-api.test.ts
  e2e/tests/question-draft-durability.spec.ts
```

## Verification

| Проверка | Итог |
|----------|------|
| `yarn workspace @bio-exam/web vitest run lib/drafts` | `Test Files 6 passed (6)`, `Tests 98 passed (98)` |
| `yarn workspace @bio-exam/web typecheck` | exit 0 |
| `yarn workspace @bio-exam/web lint` | exit 0; в файлах плана одно новое предупреждение `set-state-in-effect` (`use-question-draft-autosave.ts:74`, см. key-decisions), `QuestionEditor.tsx:70` — прежнее |
| `yarn e2e --grep "@life04"` (трассер, только «Отмена» без `test.fail`) | «Отмена» зелёная на двух проектах; перезагрузка — «Expected to fail, but passed» |
| `yarn e2e --grep "@life04\|@flow4"` (итог) | `22 passed (26.9s)`: 4 setup, на каждом проекте 5 @flow4 и 4 @life04; `failed`, `flaky`, `skipped` нет |
| node-проверка Task 2 | `draft page wired` |
| `yarn verify` | `yarn verify: OK` (8 шагов passed; rbac 3, exam-core 605, web 867, server 1119, scripts 166) |
| `oxfmt --check .` | `All matched files use the correct format.` |
| Сверка по отпечатку `before-06-08` | `06-08 changed only its files` |
| Комментарии в новых и изменённых строках | нет |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Тост copy-diverged по уведомлению закрывался бы в StrictMode**
- **Found during:** Task 2 (п. 3)
- **Issue:** закрытие тоста при размонтировании в очистке эффекта `start`/`dispose` сработало бы на имитации размонтирования StrictMode, а повторный `start()` уведомление `copy-diverged` не повторяет.
- **Fix:** тост показывается эффектом по `snapshot.canRestoreCopy` и закрывается в его очистке; действие то же (`restoreDivergedCopy()` → `onRestoreCopy` через ref → форма и смена `key` редактора).
- **Files modified:** app/web/lib/drafts/use-question-draft-autosave.ts

**2. [Rule 1 - Bug] reopen() после сохранённого вопроса слал бы PATCH в удалённый черновик**
- **Found during:** Task 2 (п. 2)
- **Fix:** `reopen()` только при неудаче POST (флаг `questionStored`).
- **Files modified:** QuestionEditorPageClient.tsx

### Отступление от плана

**3. Ожидание тоста восстановления в e2e перезагрузки не добавлено (Task 2 п. 4)**
- Добавленное ожидание падало на обоих проектах (`getByText('Восстановлены правки…')` не найден, строка «Сохранено», текст правки на месте). Причина установлена: досылка при pagehide с keepalive (решение пользователя R-07) обходит перехват Playwright и записывает правку до GET новой страницы (`lockVersion=1` сразу после reload), копия совпадает с сервером и удаляется — тост по спецификации не положен. Тест остался проверкой «правка не потеряна» (must_haves п. 11 и acceptance Task 2 выполнены); тост восстановления и тост расхождения проверены разовым прогоном с заранее записанной копией (раздел выше). Сценарии, в которых keepalive не доходит (тело больше лимита, закрытие вкладки без pagehide), — в «UI-SPEC unresolved» плана, в e2e не закреплялись.

## Issues Encountered

- `codegraph` не инициализирован в worktree: `impact` и `affected` выполнены по индексу основного дерева.
- Подсказка автодополнения редактора попадает в `promptText` (`trace textbooks (TAB)`); к плану не относится, записано в `.planning/phases/06-draft-durability/deferred-items.md`.

## Known Stubs

Нет.

## Threat Flags

Нет: маршруты сервера, тела запросов (`{ payload, lockVersion }` / `{ payload }`), env-ключи и миграции не менялись. T-6-19: копия старше сервера не применяется молча (тост с действием, проверено прогоном); T-6-20: тосты только из `DRAFT_TOAST`, вывод `data?.error` автосохранения и строка «загружаю актуальную версию» удалены; T-6-21: `closeForSave` до POST и DELETE, `reopen` только при неудаче POST.

## Deferred human verification

Проверок с участием человека в этом плане нет; заметки плана:

- UI-SPEC backstop: строка автосохранения и диалог ухода на 375px — ручная проверка в 06-11.
- UI-SPEC unresolved: тело больше лимита keepalive при закрытии вкладки не отправляется (досылается при следующем открытии с тостом восстановления); 401 во время pagehide; копия после 403 при следующем открытии не восстанавливается.
- UI-SPEC **[авто]**: тексты описаний диалога, тостов 403/404/второго 409/восстановления и «Черновик изменён в другом месте…» с действием, порог 1500 мс, предел досылки 5 с — к подтверждению пользователем в 06-11.
- Пробел спецификации к 06-11: «Отмена» и «Назад» в шапке не выключаются во время досылки и каждая защищена от двойного перехода только для своих нажатий; стор отдаёт обоим один промис ухода, поэтому «Отмена», а затем «Назад» в течение одной досылки приведут к двум переходам (`router.push` на страницу теста и `router.back()`). UI-SPEC этот случай не описывает; не исправлялось.
- Коммит файлов плана делает ведущая сессия.

## Файлы к коммиту

- app/web/lib/drafts/question-draft-api.ts
- app/web/lib/drafts/question-draft-api.test.ts
- app/web/lib/drafts/use-question-draft-autosave.ts
- app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
- app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx
- app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts
- e2e/tests/question-draft-durability.spec.ts

## Self-Check: PASSED

- FOUND: все 7 файлов плана (`git status`: 4 M, 3 ??), посторонних изменений нет (сверка по отпечатку)
- FOUND: .planning/commit-snapshots/before-06-08/fingerprint.json
- Временный `e2e/tests/zz-scratch-0608.spec.ts` удалён
- Коммиты: не выполнялись по правилу пользователя (HEAD 4027ae0 не изменился)
