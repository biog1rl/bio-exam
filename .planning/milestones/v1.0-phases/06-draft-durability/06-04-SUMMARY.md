---
phase: 06-draft-durability
plan: 04
subsystem: web-drafts
tags: [autosave, question-draft, local-copy, beforeunload, save-queue, life04, life05]
status: complete
deferred_human_gate: false

requires:
  - phase: 06-02
    provides: "createSaveQueue, SaveOutcome, SaveQueueClock, FlushResult (app/web/lib/drafts/save-queue.ts)"
provides:
  - "app/web/lib/drafts/question-draft-autosave.ts: createQuestionDraftAutosave, QuestionDraftAutosave, QuestionDraftAutosaveOptions, QuestionDraftAutosaveApi, QuestionDraftSaveResult, QuestionDraftAutosaveSnapshot, QuestionDraftNotice, QUESTION_DRAFT_DEBOUNCE_MS, QUESTION_DRAFT_MAX_WAIT_MS, LEAVE_FLUSH_TIMEOUT_MS, AUTOSAVE_SAVING_THRESHOLD_MS"
  - "app/web/lib/drafts/question-draft-copy.ts: stableSerialize, questionDraftCopyKey, readQuestionDraftCopy, writeQuestionDraftCopy, removeQuestionDraftCopy, forgetQuestionDraftCopies, resolveInitialDraftPayload, QuestionDraftCopy, QuestionDraftCopyStorage"
  - "app/web/lib/drafts/before-unload.ts: createBeforeUnloadGuard, BeforeUnloadWindow, BeforeUnloadGuard"
  - "app/web/lib/drafts/draft-ui.ts: LeaveFlushResult, UNSAVED_CHANGES_TEXT, leaveDialogDescription, AutosaveStatusView, autosaveStatusView, DRAFT_TOAST, DRAFT_TOAST_ID, RETRY_SAVE_LABEL"
affects: [06-06, 06-08, 06-10]

estimate:
  tokens: 90000
  tasks: 3
actuals:
  tokens: 16800
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Модуль автосохранения: состояние в замыкании, снимок пересобирается на каждое изменение и рассылается подписчикам только при смене полей (стабильный getSnapshot для useSyncExternalStore)"
    - "Исход сервера переводится в SaveOutcome внутри send; учёт lockVersion, подтверждения и копии — в модуле, а не в очереди, поэтому переживает пересоздание очереди"

key-files:
  created:
    - app/web/lib/drafts/question-draft-autosave.ts
    - app/web/lib/drafts/question-draft-autosave.test.ts
    - app/web/lib/drafts/question-draft-copy.ts
    - app/web/lib/drafts/question-draft-copy.test.ts
    - app/web/lib/drafts/before-unload.ts
    - app/web/lib/drafts/before-unload.test.ts
    - app/web/lib/drafts/draft-ui.ts
    - app/web/lib/drafts/draft-ui.test.ts
  modified: []

key-decisions:
  - "Решение исполнителя (автономно): send сравнивает сериализацию payload с последней подтверждённой и при совпадении возвращает ok без запроса (заодно снимает копию, если она равна); обычные отправки одного и того же payload объединяются: повторная отправка ждёт уже идущий запрос. Так start → dispose → start (StrictMode) с восстановленной копией не шлёт второй PATCH со старой lockVersion"
  - "Решение исполнителя (автономно): подтверждение, lockVersion, копия, 403 и 404 обрабатываются модулем независимо от того, какая очередь отправила запрос; исходы запросов, досланных при dispose, тоже обновляют lockVersion и копию. Уведомления (onNotice) после dispose не рассылаются"
  - "Решение исполнителя (автономно): 409 → readLockVersion; null или исключение → исход retry (автоповтор как при сбое сети, ошибка failed); исключение api.save → failed. 409 у досылки с keepalive (без lockVersion) не перечитывается и считается retry"
  - "Решение исполнителя (автономно): 403 и 404 — флаги модуля; после них send возвращает stop без запроса и в новой очереди (повторный start, reopen); retry() при них ничего не делает. change после 404 — no-op (копия не пишется, чтобы не оставлять сироту)"
  - "Решение исполнителя (автономно): change в состоянии closed запоминает последний payload в памяти, но не пишет копию и не шлёт; reopen() создаёт новую очередь (close очереди 06-02 необратим) и ставит последний неподтверждённый payload, включая правки, сделанные во время сохранения вопроса"
  - "Решение исполнителя (автономно): pagehide вызывает drain({ keepalive: true }) очереди; при остановленной очереди (409 подряд, 403) досылки нет, правка остаётся в копии"
  - "Решение исполнителя (автономно): порог 1500 мс отсчитывается от входа в pending/saving; в окне порога display — предыдущее saved или error (hidden после reopen считается saved). «Повторить» для failed и для conflict показывает «Сохранение…» сразу на время запроса; восстановленная копия — «Сохранение…» сразу до первого подтверждения"
  - "Решение исполнителя (автономно): чтение копии, resolveInitialDraftPayload и удаление копии (совпадает с сервером или forbidden) выполняются при создании модуля, до start(); уведомления restored и copy-diverged — в первом start() экземпляра, один раз; восстановленная копия при первом start() уходит сразу (retryNow), без дебаунса"
  - "Решение исполнителя (автономно): после ok копия удаляется, только если её сериализация равна подтверждённой; baseLockVersion переписывается, только если в ключе лежит последний payload этой вкладки; иначе копия не трогается (R-08)"
  - "Решение исполнителя (автономно): flushForLeave при 403 сразу { ok: false, reason: 'forbidden' } без досылки; если start() не вызывался (очереди нет) и есть несохранённая запись — { ok: false, reason: 'failed' }"
  - "requirements-completed пуст: LIFE-04 и LIFE-05 закрывает 06-08, когда страница черновика переходит на модуль и e2e 06-01 перестаёт быть test.fail()"

requirements-completed: []

duration: 10min
completed: 2026-10-04
---

# Phase 6 Plan 04: Автосохранение черновика вопроса, локальная копия, охрана beforeunload и тексты UI Summary

**Чистые модули `app/web/lib/drafts/`: `createQuestionDraftAutosave` поверх очереди 06-02 (700 мс / 5 с, сравнение `stableSerialize`, досылка при уходе с пределом 5 с без дубля, 409 → один перечит и повтор, 403/404 без повторов, `closeForSave`/`reopen`, порог индикатора 1500 мс), локальная копия `question-draft-wal-${draftId}-${userId}` с решением при открытии по R-01, R-08 и R-10, охрана `beforeunload` с одним слушателем и тексты UI-SPEC Поверхностей 2, 3, 5; 88 тестов на поддельных часах, API, хранилище и окне**

коммит: не выполнялся (правило пользователя), изменения в рабочем дереве

## Performance

- **Duration:** ~10 min
- **Started:** 2026-10-04T17:25:00Z
- **Completed:** 2026-10-04T17:35:00Z
- **Tasks:** 3
- **Files modified:** 8 (8 новых)

## Accomplishments

- `draft-ui.ts`: `LeaveFlushResult`, `UNSAVED_CHANGES_TEXT`, `leaveDialogDescription`, `autosaveStatusView`, `DRAFT_TOAST`, `DRAFT_TOAST_ID`, `RETRY_SAVE_LABEL` — тексты UI-SPEC дословно, многоточие одним символом `…`.
- `question-draft-copy.ts`: `stableSerialize` (рекурсивная сортировка ключей через `Object.fromEntries`, ключ `__proto__` не ломает сборку, `undefined` → строка `'undefined'`); безопасные чтение, запись и удаление копии по образцу `client-attempt-id.ts`; `forgetQuestionDraftCopies` обходит ключи от конца к началу по префиксу `question-draft-wal-${draftId}-`; `resolveInitialDraftPayload` по решению пользователя R-01.
- `before-unload.ts`: `createBeforeUnloadGuard(win)` держит ровно один свой слушатель `beforeunload` при `setActive(true)` (слушатель на экземпляр); слушатель вызывает `preventDefault` и ставит `returnValue = ''` (тип `BeforeUnloadEvent`, R-09); после `dispose` ничего не подключает.
- `question-draft-autosave.ts`: фабрика по interfaces плана; копия пишется синхронно в `change` до `queue.set`; `pagehide` → досылка с keepalive и `lockVersion` null (R-07); `dispose` → досылка без keepalive с текущей `lockVersion`, без ожидания, слушатели сняты, копия остаётся; повторный `start()` после `dispose()` создаёт очередь и охрану заново (M-1).

## TDD: сначала красный

Коммитов RED/GREEN нет (правило пользователя); порядок соблюдён по сути:

| Задача | Красный прогон до реализации | Зелёный |
|--------|------------------------------|---------|
| Task 1 (`question-draft-autosave.test.ts` 11 случаев, `draft-ui.test.ts` 9) | `Test Files 2 failed (2)`, `Tests no tests` (`Cannot find module './draft-ui'`, `'./question-draft-autosave'`) | 20 passed, typecheck exit 0 |
| Task 2 (`question-draft-copy.test.ts` 12, `before-unload.test.ts` 3, +13 случаев автосохранения) | `Failed Tests 24` (12 копии + 12 автосохранения), `Cannot find module './before-unload'` | 5 файлов, 74 passed |
| Task 3 (+11 случаев автосохранения) | `Tests 9 failed \| 76 passed (85)` | 85 passed |

В Task 2 случай «другая вкладка переписала копию: подтверждение этой вкладки её не трогает (R-08)» был зелёным сразу: реализация Task 1 хранилище не трогала, и утверждение «строка в ключе не изменилась» выполнялось тривиально; смысл он получил, когда Task 2 начала удалять и переписывать копию после подтверждения.

В Task 3 два новых случая были зелёными сразу: «досылка дольше 5 с» и «409 со сбоем перечитывания версии». Предел досылки и перевод неизвестного исхода в retry заложены в Task 1, где `flushForLeave` по must_haves уже имел таймаут.

После Task 3 добавлен случай «StrictMode с восстановленной копией: запрос в полёте не дублируется» (проверка решения исполнителя о дедупликации) — 86 passed.

Правки по самопроверке после первого `yarn verify` (с тестами, затем повторный `yarn verify`):
- таймер порога индикатора взводился заново в `refresh()` внутри `dispose()` при несохранённой записи; busy теперь отслеживается только после `start()`. Тест «dispose с несохранённой записью не оставляет таймеров модуля» (`vi.getTimerCount() === 0`) без правки красный (`Tests 1 failed | 36 passed`), с правкой зелёный;
- `before-unload.ts`: слушатель `preventUnload` был общим на модуль, и `dispose` одной охраны снял бы слушатель другой на том же окне; теперь слушатель создаётся на экземпляр. Тест «две охраны на одном окне держат свои слушатели независимо».

Итог: 88 passed.

Тест п. 14 сначала ожидал после `reopen()` отправку P2 (последнего payload до закрытия). При реализации принято решение запоминать правку, сделанную в состоянии closed, в памяти (см. key-decisions); ожидание теста изменено на P3, реализация под тест не подгонялась: это смена поведения, записанная как решение.

## Трассер (Task 1)

`<verify>` Task 1 (`vitest run lib/drafts/question-draft-autosave.test.ts lib/drafts/draft-ui.test.ts && typecheck`) повторён после реализации и до начала Task 2: `Tests 20 passed (20)`, `typecheck exit 0`. Расширение начато после зелёного трассера.

## codegraph impact (D-29)

Индекс основного дерева `/Users/kdvornichenko/bio-exam` (в worktree `.codegraph/` нет).

`codegraph impact QuestionEditorPageClient` — 5 символов:
- `function QuestionEditorPageClient` — `app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx:103`
- `function EditQuestionPage` — `.../questions/[questionId]/page.tsx:11`, маршрут `/web/app/admin/tests/:topicSlug/:testSlug/questions/:questionId`
- `function QuestionDraftPage` — `.../questions/drafts/[draftId]/page.tsx:11`, маршрут `/web/app/admin/tests/:topicSlug/:testSlug/questions/drafts/:draftId`

План страницу не меняет (запрет плана); её переводит на модуль 06-08.

`codegraph impact createSaveQueue`: `Symbol "createSaveQueue" not found` — индекс основного дерева старше 06-02. Пользователи `createSaveQueue` в worktree: `attempt-lifecycle` (06-03) и `question-draft-autosave.ts` (этот план); `save-queue.ts` не менялся.

## codegraph affected

`codegraph affected` по 8 файлам плана, вывод дословно:

```
Affected test files (4):

  app/web/lib/drafts/before-unload.test.ts
  app/web/lib/drafts/draft-ui.test.ts
  app/web/lib/drafts/question-draft-autosave.test.ts
  app/web/lib/drafts/question-draft-copy.test.ts
```

## Verification

| Проверка | Итог |
|----------|------|
| `yarn workspace @bio-exam/web vitest run lib/drafts/question-draft-autosave.test.ts lib/drafts/draft-ui.test.ts && yarn workspace @bio-exam/web typecheck` (Task 1) | 20 passed, exit 0 |
| `yarn workspace @bio-exam/web vitest run lib/drafts` (Task 2, Task 3) | `Test Files 5 passed (5)`, `Tests 88 passed (88)` |
| `yarn workspace @bio-exam/web typecheck` | exit 0 |
| `oxlint -c .oxlintrc.json lib/drafts` | exit 0 |
| `yarn oxfmt --check app/web/lib/drafts` | `All matched files use the correct format.` |
| `draft modules are pure` (acceptance Task 3) | печатает |
| key_links: `createSaveQueue(` и `setActive(` в `question-draft-autosave.ts` | есть (`grep -n`) |
| `yarn verify` (повторный, после правок по самопроверке) | `yarn verify: OK` (все 8 шагов passed; rbac 3, exam-core 605, web 764, server 1119 тестов) |
| Сверка по отпечатку `before-06-04` | `06-04 changed only its files` |

## Покрытие D-26 п. 10-16

| Пункт | Тест |
|-------|------|
| 10 | «change и сразу flushForLeave → один save, { ok: true }, затем 10 с без вызовов»; «досылка при записи последнего payload в полёте ждёт её» |
| 11 | «повторная установка формы содержимым сервера и тот же p1 после подтверждения не шлют save»; «другой порядок ключей (как после jsonb)» |
| 12 | «сбой → error failed, автоповторы с паузами, уход возвращает отказ, «Повторить» → saved»; «досылка дольше 5 с» |
| 13 | «beforeunload только пока есть несохранённая запись»; `before-unload.test.ts` |
| 14 | «closeForSave ждёт запрос в полёте…; reopen возвращает работу»; «closeForSave без записи в полёте…; discardCopy» |
| 15 | «409 → перечитана версия, один повтор»; «второй 409 подряд → error conflict…» |
| 16 | «копия новее сервера восстанавливается…»; «копия старше сервера…» (R-01); копия после подтверждения (R-08); 403 (R-10); `forgetQuestionDraftCopies` |

## Семантика для 06-06 и 06-08

- `initialPayload` и `restored` известны сразу после создания модуля, до `start()`; форма заполняется из `initialPayload` до монтирования редактора.
- Снимок до `start()`: при восстановленной копии `status: 'pending'`, `display: 'saving'`, `hasUnsavedWrite: true`; при расхождении `canRestoreCopy: true`.
- `start()` рассылает `restored` или `copy-diverged` один раз за жизнь экземпляра; повторный `start()` после `dispose()` уведомлений не повторяет.
- `flushForLeave()`: `gone` → сразу `{ ok: false, reason: 'gone' }`; без несохранённой записи → `{ ok: true }`; 403 → `forbidden`; иначе досылка с пределом 5 с; повторный вызов во время досылки возвращает тот же промис; `snapshot.leaving` true на время досылки.
- `retry()`: failed → немедленная отправка (`retryNow`), conflict → `resume`; при 403 и 404 ничего не делает.
- `closeForSave()` разрешается после исхода записи в полёте; `discardCopy()` вызывать после успешного DELETE черновика; `reopen()` — при неудаче POST вопроса.
- Модуль не знает о `keepalive`-лимите тела: `api.save` с `keepalive: true` должен сам вернуть `failed`, если тело не помещается (06-08, `question-draft-api.ts`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `createSaveQueue<unknown>(` не совпадал с шаблоном key_links `createSaveQueue\(`**
- **Found during:** Task 3 (проверка key_links)
- **Fix:** явный аргумент типа убран, тип выводится из `send`; typecheck exit 0
- **Files modified:** app/web/lib/drafts/question-draft-autosave.ts

Других отклонений нет. Дополнительно экспортирована `QUESTION_DRAFT_MAX_WAIT_MS = 5000` и тип `BeforeUnloadGuard`; функции копии названы `readQuestionDraftCopy`, `writeQuestionDraftCopy`, `removeQuestionDraftCopy` (в плане — «read/write/remove» без имён).

## Issues Encountered

- `codegraph` не инициализирован в worktree: `impact` и `affected` выполнены по индексу основного дерева; `createSaveQueue` в нём нет.

## Known Stubs

Нет.

## Threat Flags

Нет: маршруты, тела запросов, env-ключи и миграции не менялись. Новый ключ `localStorage` `question-draft-wal-${draftId}-${userId}` предусмотрен планом (T-6-09 accept). T-6-10 (один перечит и один повтор при 409), T-6-11 (403 и 404 без повторов, пометка `forbidden`) закрыты тестами.

## Deferred human verification

Нет. Коммит файлов плана делает ведущая сессия.

## Файлы к коммиту

- `app/web/lib/drafts/question-draft-autosave.ts`
- `app/web/lib/drafts/question-draft-autosave.test.ts`
- `app/web/lib/drafts/question-draft-copy.ts`
- `app/web/lib/drafts/question-draft-copy.test.ts`
- `app/web/lib/drafts/before-unload.ts`
- `app/web/lib/drafts/before-unload.test.ts`
- `app/web/lib/drafts/draft-ui.ts`
- `app/web/lib/drafts/draft-ui.test.ts`

## Next Phase Readiness

- 06-06 импортирует `LeaveFlushResult`, `UNSAVED_CHANGES_TEXT`, `leaveDialogDescription` из `draft-ui.ts` и `createBeforeUnloadGuard` из `before-unload.ts`.
- 06-08 создаёт модуль в `use-question-draft-autosave.ts` со швами `localStorage`, `window` и `questionDraftAutosaveApi`, вызывает `forgetQuestionDraftCopies` при удалении черновика из списка.

## Self-Check: PASSED

- FOUND: все 8 файлов плана (`git status`: 8 `??`)
- FOUND: .planning/commit-snapshots/before-06-04/fingerprint.json
- Коммиты: не выполнялись по правилу пользователя
