---
phase: 06-draft-durability
plan: 06
subsystem: web-leave-guard
tags: [unsaved-changes, leave-dialog, back-button, beforeunload, question-editor, lexical, life04]
status: complete
deferred_human_gate: false

requires:
  - phase: 06-01
    provides: "e2e/tests/question-draft-durability.spec.ts с красными проверками черновика (test.fail)"
  - phase: 06-04
    provides: "LeaveFlushResult, UNSAVED_CHANGES_TEXT, leaveDialogDescription (draft-ui.ts); createBeforeUnloadGuard (before-unload.ts); stableSerialize (question-draft-copy.ts)"
provides:
  - "app/web/store/unsavedChanges.store.ts: LeaveDecision, flushByPath, leavingByPath, registerFlush(path, flush | null), leave(path), clear(path) снимает флаг и досылку"
  - "app/web/components/Buttons/UnsavedChangesDialog.tsx: UnsavedChangesDialog({ open, onOpenChange, description, onLeave })"
  - "app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/question-draft-payload.ts: questionFormKey, toQuestionDraftPayload"
  - "BackButton с ожиданием досылки через store.leave(pathname)"
  - "MdxPlugin не вызывает onMdxChange на обновлениях только выделения"
affects: [06-08, 06-10, 06-11]

estimate:
  tokens: 90000
  tasks: 3
actuals:
  tokens: 7400
  tasks: 3
  commits: 0
plan_head_before: ab290e85036fbc3a1d713cd629088dbecce71e4e
plan_head_after: ab290e85036fbc3a1d713cd629088dbecce71e4e

tech-stack:
  added: []
  patterns:
    - "Связь страница ↔ BackButton в шапке AppLayout только через zustand-стор по pathname: флаг, функция досылки и признак ожидания"
    - "Общий промис ухода на путь в замыкании модуля стора: повторный leave во время досылки получает тот же промис"
    - "Признак несохранённой формы правки — сравнение questionFormKey (stableSerialize нормализованного вопроса без id) с ключом вопроса, с которым открыт редактор"

key-files:
  created:
    - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/question-draft-payload.ts
    - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/question-draft-payload.test.ts
    - app/web/components/Buttons/UnsavedChangesDialog.tsx
    - app/web/store/unsavedChanges.store.test.ts
  modified:
    - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
    - app/web/components/Buttons/BackButton.tsx
    - app/web/store/unsavedChanges.store.ts
    - app/web/components/editor/editor.tsx
    - e2e/tests/question-draft-durability.spec.ts

key-decisions:
  - "Решение исполнителя (автономно): ключ исходной формы — useMemo от currentQuestion, а не ref на момент открытия. Если SWR принесёт другой вопрос, QuestionEditor и так перезапишет форму из пропа, и признак сравнивает форму с тем, что она показывает"
  - "Решение исполнителя (автономно): режим правки на странице — isEditingExistingQuestion && !isDraftMode (isEditMode); onCancel всегда handleCancel, но в режиме черновика он сразу вызывает backToTestEditor, как раньше. UnsavedChangesDialog страницы рендерится только в режиме правки"
  - "Решение исполнителя (автономно): охрана beforeunload — один эффект: createBeforeUnloadGuard(window), setActive(isFormDirty), dispose в очистке; слушатель есть только пока форма изменена и снимается при размонтировании"
  - "Решение исполнителя (автономно): досылка, бросившая исключение, считается неудачей { ok: false, reason: 'failed' }; flush вызывается синхронно внутри leave, leavingByPath[path] после досылки — false (а не удаление ключа)"
  - "Решение исполнителя (автономно): BackButton не делает второй router.back() при повторном нажатии во время досылки: ref хранит промис ухода, который уже обрабатывается, и клик с тем же промисом игнорируется; кнопка при этом не выключается (D-17)"
  - "Решение исполнителя (автономно): clear() без пути сбрасывает dirtyByPath и flushByPath; leavingByPath не трогает: идущая досылка сама вернёт false в finally"
  - "requirements-completed пуст: LIFE-04 закрывает 06-08 (черновик вопроса на модуле, e2e 06-01 без test.fail)"

requirements-completed: []

duration: 11min
completed: 2026-10-04
---

# Phase 6 Plan 06: Стор ухода с досылкой, общий диалог несохранённых изменений и защита правки существующего вопроса Summary

**`unsavedChanges.store` получил `registerFlush`/`leave`/`leavingByPath` с общим промисом досылки на путь; диалог «Есть несохранённые изменения» вынесен в `UnsavedChangesDialog`; `BackButton` ждёт досылку с `Loader2` и `aria-busy`; правка существующего вопроса держит флаг пути по `questionFormKey`, «Отмена» и «Назад» спрашивают, `beforeunload` предупреждает; `MdxPlugin` не шлёт `onMdxChange` на обновлениях только выделения; e2e @life04 зелёная на двух проектах**

коммит: не выполнялся (правило пользователя), изменения в рабочем дереве

## Performance

- **Duration:** ~11 min
- **Started:** 2026-10-04T18:10:09Z
- **Completed:** 2026-10-04T18:21:46Z
- **Tasks:** 3
- **Files modified:** 9 (4 новых, 5 изменённых)

## Accomplishments

- `question-draft-payload.ts`: `questionFormKey(q)` = `stableSerialize({ ...normalizeQuestionForSave(q), id: undefined })` — не зависит от `id` и порядка ключей; `toQuestionDraftPayload(q, order)` строит прежнюю форму PATCH черновика `{ question: { ...normalizeQuestionForSave(q), id: undefined, order } }` (для 06-08).
- `UnsavedChangesDialog.tsx`: разметка прежнего диалога `BackButton` без изменений (заголовок, описание из пропа, «Остаться» `AlertDialogCancel cursor-pointer`, «Выйти» `cursor-pointer bg-red-500 text-white hover:bg-red-500/80`), тексты из `UNSAVED_CHANGES_TEXT`.
- `unsavedChanges.store.ts`: `flushByPath`, `leavingByPath`, `registerFlush`, `leave` → `LeaveDecision`; без досылки dirty → confirm «Уйти без сохранения?», иначе navigate; с досылкой успех → navigate, неудача → confirm с `leaveDialogDescription(result)`; `clear(path)` снимает флаг и досылку.
- `BackButton.tsx`: клик → `leave(pathname)`; navigate → `router.back()`; confirm → `UnsavedChangesDialog` с описанием; «Выйти» → `clear(pathname)` и `router.back()`; во время досылки `Loader2 size-4 animate-spin`, `aria-busy`, `aria-label="Назад"` прежний. Собственная разметка диалога и её комментарий удалены.
- `QuestionEditorPageClient.tsx`: защита правки существующего вопроса (D-15) — см. перечень участков ниже.
- `editor.tsx`: `registerUpdateListener` берёт `dirtyElements` и `dirtyLeaves` и выходит без `onMdxChange`, если оба пусты (ревью C-09, R-09).
- e2e `LIFE-04: правка существующего вопроса защищена от ухода @life04` (обычный тест, без `test.fail`).

## Изменённые участки QuestionEditorPageClient.tsx (для слияния)

Все правки — ветки режима правки (`isEditMode = isEditingExistingQuestion && !isDraftMode`). Режим черновика, гидратация, `persistDraftQuestion`, `handleQuestionDraftChange`, перенос и экраны ошибок не менялись.

1. Импорты: `usePathname` из `next/navigation`; `UnsavedChangesDialog`; `createBeforeUnloadGuard`; `UNSAVED_CHANGES_TEXT`; `useUnsavedChanges`; `questionFormKey` из `./question-draft-payload`.
2. Начало компонента: `pathname`, `setUnsavedDirty`, `clearUnsaved` из стора; состояния `isFormDirty`, `leaveDialogOpen`; константа `isEditMode`.
3. После `currentQuestion` (перед `breadcrumbLabels`): `savedFormKey` (useMemo), `handleEditFormChange` (пересчёт признака, без запросов), эффекты `setUnsavedDirty(pathname, isFormDirty)`, `clearUnsaved(pathname)` при размонтировании, охрана `beforeunload`.
4. После `backToTestEditor`: `handleCancel` (при изменённой форме открывает диалог) и `leaveWithoutSaving` (`clearUnsaved(pathname)` и `backToTestEditor`).
5. `handleSaveQuestion`: после успешного сохранения в режиме правки `setIsFormDirty(false)` и `clearUnsaved(pathname)` до `backToTestEditor()`; массив зависимостей дополнен `isEditMode`, `clearUnsaved`, `pathname`.
6. Разметка `QuestionEditor`: `onDraftChange={isDraftMode ? handleQuestionDraftChange : isEditMode ? handleEditFormChange : undefined}`, `onCancel={handleCancel}`; после `QuestionEditor` — `UnsavedChangesDialog` только в режиме правки.

## TDD: сначала красный

Коммитов RED/GREEN нет (правило пользователя); порядок соблюдён по сути:

| Задача | Красный прогон до реализации | Зелёный |
|--------|------------------------------|---------|
| Task 1 (`question-draft-payload.test.ts`, 8 случаев) | `Test Files 1 failed (1)`, `Tests no tests` (нет модуля `./question-draft-payload`) | 8 passed, typecheck exit 0 |
| Task 2 (`unsavedChanges.store.test.ts`, 14 случаев) | `Tests 14 failed (14)` (`leave`, `registerFlush` нет) | первая реализация: 6 failed (flush вызывался в микрозадаче, `toHaveBeenCalledTimes(1)` сразу после `leave` получал 0, зависший промис ломал следующие тесты); после синхронного вызова flush — 14 passed |

## Трассер (Task 1)

После Task 1 и до правок Task 2 `yarn e2e --grep "@life04"`: `12 passed (36.8s)`; новый тест зелёный на `chromium-desktop` и `chromium-mobile`, четыре проверки 06-01 с `test.fail` засчитаны как ожидаемые падения (✘ при общем `passed`). Расширение начато после зелёного трассера. Шаг «клик в редактор без ввода → «Отмена» уходит сразу» был зелёным и без правки `MdxPlugin`: формулировка `Правка e2e <projectKey>` уже в канонической форме редактора, поэтому повторная сериализация её не меняет; правка `MdxPlugin` нужна для неканонических формулировок (ревью C-09).

## codegraph impact (D-29)

Индекс основного дерева `/Users/kdvornichenko/bio-exam` (в worktree `.codegraph/` нет).

- `codegraph impact useUnsavedChanges` — 5 символов: `useUnsavedChanges` (`app/web/store/unsavedChanges.store.ts:12`), `BackButton` (`app/web/components/Buttons/BackButton.tsx:25`), `AppLayout` (`app/web/components/AppLayout/AppLayout.tsx:19`).
- `codegraph impact BackButton` — 5 символов: `BackButton`, `AppLayout` (`AppLayout.tsx:19`), `RootLayout` (`app/web/app/layout.tsx:30`). Единственное место монтирования — шапка `AppLayout`.
- `codegraph impact QuestionEditorPageClient` — 5 символов: `QuestionEditorPageClient` (`.../questions/QuestionEditorPageClient.tsx:103`), `EditQuestionPage` (`.../questions/[questionId]/page.tsx:11`, маршрут `/admin/tests/:topicSlug/:testSlug/questions/:questionId`), `QuestionDraftPage` (`.../questions/drafts/[draftId]/page.tsx:11`, маршрут `.../questions/drafts/:draftId`).
- `codegraph impact Editor` — 5 символов: `Editor` (`app/web/components/editor/editor.tsx:75`), `QuestionEditor` (`.../admin/tests/components/QuestionEditor.tsx:40`), `QuestionEditorPageClient`. `rg` подтверждает: `@/components/editor/editor` импортирует только `QuestionEditor.tsx`.

## codegraph affected

`codegraph affected` по 9 файлам плана, вывод дословно:

```
Affected test files (6):

  app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
  app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/question-draft-payload.test.ts
  app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/question-draft-payload.ts
  app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx
  app/web/store/unsavedChanges.store.test.ts
  e2e/tests/question-draft-durability.spec.ts
```

## Verification

| Проверка | Итог |
|----------|------|
| `yarn workspace @bio-exam/web vitest run question-draft-payload.test.ts && yarn workspace @bio-exam/web typecheck` | `Tests 8 passed (8)`, exit 0 |
| `yarn e2e --grep "@life04"` (трассер Task 1) | `12 passed (36.8s)` |
| `yarn workspace @bio-exam/web vitest run store/unsavedChanges.store.test.ts && typecheck && lint` | `Tests 14 passed (14)`, typecheck exit 0, lint exit 0 (только прежние предупреждения; в новых строках предупреждений нет) |
| acceptance Task 2: `back button uses shared dialog` | печатает |
| acceptance Task 2: `mdx plugin skips selection updates` | печатает |
| `yarn e2e --grep "@life04\|@flow4"` | `22 passed (47.5s)`: 5 сценариев @flow4 и 2 зелёных @life04 на каждом проекте, 4 проверки `@known-defect` засчитаны как ожидаемые падения; `failed` и `flaky` нет |
| `yarn verify` | `yarn verify: OK` (все шаги passed; web 40 файлов, 837 тестов; server 1119) |
| `oxfmt --check .` | `All matched files use the correct format.` |
| Сверка по отпечатку `before-06-06` | `06-06 changed only its files` |
| Комментарии в новых и изменённых строках | нет |

## Deviations from Plan

None - plan executed exactly as written. Порядок задач не менялся: правка `MdxPlugin` (Task 2) для трассера не понадобилась.

## Issues Encountered

- `timeout` нет в macOS-окружении; e2e запускались без обёртки.
- `codegraph` не инициализирован в worktree: `impact` и `affected` выполнены по индексу основного дерева.

## Known Stubs

Нет.

## Threat Flags

Нет: маршруты сервера, тела запросов, env-ключи и миграции не менялись. T-6-15: кнопка «Назад» не выключается, повторный клик ждёт ту же досылку, неудача досылки (включая исключение) открывает диалог; предел 5 с — в модуле 06-04. T-6-16: флаг стора и `beforeunload` при изменённой форме, e2e D-15.

## Deferred human verification

Проверок с участием человека в этом плане нет; заметки плана:

- UI-SPEC backstop: диалог ухода на 375px — ручная проверка в 06-11 (открыть правку вопроса на ширине 375px, изменить формулировку, нажать «Отмена»: кнопки подвала столбцом, «Выйти» сверху, без горизонтального скролла).
- UI-SPEC unresolved: хлебные крошки и «назад» браузера не перехватываются (D-17); правка существующего вопроса при таком уходе теряется без предупреждения.
- Коммит файлов плана делает ведущая сессия.

## Файлы к коммиту

- app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/question-draft-payload.ts
- app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/question-draft-payload.test.ts
- app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx
- app/web/components/Buttons/UnsavedChangesDialog.tsx
- app/web/components/Buttons/BackButton.tsx
- app/web/store/unsavedChanges.store.ts
- app/web/store/unsavedChanges.store.test.ts
- app/web/components/editor/editor.tsx
- e2e/tests/question-draft-durability.spec.ts

## Self-Check: PASSED

Все 9 файлов на месте (`git status`: 5 M, 4 ??); коммитов плана нет по правилу пользователя (HEAD ab290e8 не изменился).
