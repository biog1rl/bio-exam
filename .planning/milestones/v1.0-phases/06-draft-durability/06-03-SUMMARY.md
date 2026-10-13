---
phase: 06-draft-durability
plan: 03
subsystem: web-attempt-lifecycle
tags: [attempt-lifecycle, wal, save-queue, restore, save-indicator, life01, life02, life05]
status: complete
deferred_human_gate: false

requires:
  - phase: 06-02
    provides: "createSaveQueue, SaveOutcome, SaveQueueState; saveAttemptDraft, AttemptDraftSaveResult; AttemptSession, SaveAttemptDraftRequest"
  - phase: 05
    provides: "ClientAttemptStorage, clientAttemptIdKey, forgetClientAttemptId; storageKeysToClear, classifyStartFailure; AttemptRequestError"
provides:
  - "app/web/components/tests/attempt-lifecycle/lifecycle.ts: createAttemptLifecycle и типы интерфейса модуля, toSaveOutcome, ATTEMPT_SAVE_DEBOUNCE_MS, ATTEMPT_SAVE_MAX_WAIT_MS, TELEMETRY_QUEUE_KEY"
  - "app/web/components/tests/attempt-lifecycle/wal.ts: WalRecord, readWal, writeWal, updateWal, recordAnswer, recordPosition, confirmAnswer, confirmTelemetry, detachWal, parseAnswers, parseTelemetry, emptyWal"
  - "app/web/components/tests/attempt-lifecycle/restore.ts: resolveRestoredDraft, RestoreInput, RestoredDraft"
  - "app/web/components/tests/attempt-lifecycle/storage-keys.ts: attemptStorageKeys, clearAttemptKeys, readCachedSession, writeCachedSession, safeRemove"
  - "app/web/components/tests/attempt-lifecycle/save-indicator.ts: SAVE_INDICATOR_THRESHOLD_MS, saveIndicatorKind, saveIndicatorDueAt, saveIndicatorView"
  - "app/web/components/tests/attempt-lifecycle/testing.ts: помощники тестов модуля"
affects: [06-05, 06-07, 06-09]

actuals:
  tokens: 19200
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Модуль попытки: состояние в замыкании, снимок пересобирается лениво и кэшируется до следующего изменения, счётчик поколения отсекает поздние исходы /start и saveDraft после dispose"
    - "WAL: чтение-слияние-запись через updateWal с запретом записи в WAL другой непустой сессии"
    - "Индикатор: таймер переоценки на oldestPendingSince + 1500 мс через шов часов"

key-files:
  created:
    - app/web/components/tests/attempt-lifecycle/storage-keys.ts
    - app/web/components/tests/attempt-lifecycle/wal.ts
    - app/web/components/tests/attempt-lifecycle/wal.test.ts
    - app/web/components/tests/attempt-lifecycle/restore.ts
    - app/web/components/tests/attempt-lifecycle/restore.test.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle.test.ts
    - app/web/components/tests/attempt-lifecycle/testing.ts
    - app/web/components/tests/attempt-lifecycle/save-indicator.ts
    - app/web/components/tests/attempt-lifecycle/save-indicator.test.ts
    - app/web/components/tests/attempt-lifecycle/index.ts
  modified: []

key-decisions:
  - "Решение исполнителя (автономно): resolveRestoredDraft принимает server: AttemptSession | null. Без ответа сервера (init до /start, сбой /start с закэшированной сессией) основа — WAL сессии cachedSessionId целиком, неподтверждённые остаются в pending; WAL с sessionId null принимается целиком в pending; WAL другой сессии не показывается"
  - "Решение исполнителя (автономно): подтверждённое значение WAL той же сессии уступает серверу и тогда, когда у сервера нет значения по этому вопросу (правило D-12 буквально)"
  - "Решение исполнителя (автономно): телеметрия идёт отдельным ключом очереди TELEMETRY_QUEUE_KEY = '#telemetry' с телом { telemetry }; тело PATCH ответа — ровно { questionId, value } без telemetry. В этом плане телеметрию ставит в очередь только восстановление (telemetryPending)"
  - "Решение исполнителя (автономно): ответ подтверждается в модуле и в WAL, только если сервер подтвердил то значение, которое сейчас в снимке (сравнение по ссылке), а в WAL лежит то же значение (сравнение стабильной сериализацией); иначе вопрос остаётся в pending"
  - "Решение исполнителя (автономно): исходы saveDraft и /start после dispose игнорируются (счётчик поколения): WAL после dispose остаётся с pending, следующий init досылает повторно; сервер сливает PATCH идемпотентно"
  - "Решение исполнителя (автономно): answer принимается только в фазе active и только для id из questionIds; navigate вне active (awaitingStart, starting, submitted, blocked и др.) меняет только currentQuestionId"
  - "Решение исполнителя (автономно): 403 на /start переводит WAL в sessionId null только если WAL без сессии или принадлежит закэшированной сессии; WAL третьей сессии не трогается. Очередь отбрасывается (discard), in-memory pending = все ответы"
  - "Решение исполнителя (автономно): сбой /start теста без лимита без кэша — фаза active без сессии без уведомления (как в TestRunner сейчас); уведомление start-failed — только для теста с лимитом (возврат в awaitingStart). /start повторно сам не вызывается"
  - "Решение исполнителя (автономно): фаза до init — starting (interactionDisabled true, индикатора нет)"
  - "Решение исполнителя (автономно): hidden, visible, online, pagehide обрабатываются только в фазе active; recordAnswer при прежней форме WAL в хранилище принимает sessionId записывающего модуля"
  - "Решение исполнителя (автономно): readCachedSession отвергает пустой sessionId; readWal v2 отбрасывает из pending id без годного ответа и повторы"
  - "requirements-completed пуст: LIFE-01 закрывается, когда модуль готов целиком (06-05 submit и retake, 06-07 телеметрия и таймер); LIFE-02 и LIFE-05 — в 06-09, когда TestRunner переходит на модуль и e2e 06-01 перестают быть test.fail()"

requirements-completed: []

duration: 14min
completed: 2026-10-04
---

# Phase 6 Plan 03: Ядро модуля жизненного цикла попытки Summary

**Чистый TypeScript-модуль `createAttemptLifecycle` в `components/tests/attempt-lifecycle/`: синхронная запись WAL v2 под прежним ключом с чтением старых форм и проверкой схемами exam-core, отправка через очередь 06-02 (600 мс / 5 с, исходы 2xx/400/403/404/прочее), восстановление по D-12 с записью итога слияния в WAL, sessionKey только `{ sessionId, startedAt }`, индикатор D-23 с порогом 1500 мс; 82 теста на поддельных часах, хранилище, API и видимости**

коммит: не выполнялся (правило пользователя), изменения в рабочем дереве

## Performance

- **Duration:** ~14 min
- **Started:** 2026-10-04T17:04:57Z
- **Completed:** 2026-10-04T17:18:30Z
- **Tasks:** 3
- **Files modified:** 11 (11 новых)

## Accomplishments

- `answer` в одном синхронном вызове меняет снимок, пишет WAL (чтение, слияние вопроса, запись) и ставит вопрос в очередь; без сессии WAL пишется с `sessionId: null`, отправки нет.
- Запись ответа и позиции в WAL другой непустой сессии пропускается (`updateWal`), значение остаётся в снимке и очереди (ревью C-01, R-04).
- `readWal` читает v2, плоскую карту и `{ answers, lastQuestionId, telemetry }`; значения проверяются `AnswerValueSchema`, телеметрия — `QuestionTelemetrySchema` по ключу.
- Восстановление: `/start` → сверка с закэшированной сессией (`session-replaced` с `clearAttemptKeys('session-replaced')` или `session-restored`), удаление WAL чужой непустой сессии независимо от кэша, `resolveRestoredDraft`, запись итога слияния в WAL (ревью P-01), постановка неподтверждённых в очередь.
- 403 на `/start`: `blocked`/`start-not-assigned`, `clearAttemptKeys('start-not-assigned')`, `detachWal`; следующий модуль принимает и досылает ответы в новую сессию (D-26 п. 7).
- Видимость: `hidden` → `flush`, `visible`/`online` → `retryNow`, `pagehide` → `drain({ keepalive: true })`; `navigate` в `active` → позиция в WAL и `flush`; `dispose` → `drain({ keepalive: false })`, `dispose` очереди, отписка, снятие таймера индикатора; повторный `init` создаёт очередь и подписку заново (ревью M-1).
- Индикатор вычисляется модулем в снимке; `saveIndicatorView` отдаёт тексты UI-SPEC дословно.

## TDD: сначала красный

Коммитов RED/GREEN нет (правило пользователя); порядок соблюдён по сути:

| Задача | Красный прогон до реализации | Зелёный |
|--------|------------------------------|---------|
| Task 1 (`lifecycle.test.ts`, 7 тестов) | `Error: Cannot find module './lifecycle'`, `Test Files 1 failed`, `Tests no tests` | 7 passed, typecheck exit 0 |
| Task 2 (`wal.test.ts`, `restore.test.ts`, +14 случаев `lifecycle.test.ts`) | `Error: Cannot find module './restore'`; `Tests 14 failed \| 26 passed (40)`: `TypeError: detachWal is not a function`, `expected null to deeply equal { v: 2, sessionId: 's1', …}` для прежних форм, `Expected values to be strictly equal` для session-replaced, 403, C-01, сбоя /start, start-failed | 53 passed |
| Task 3 (`save-indicator.test.ts`, +13 случаев `lifecycle.test.ts`) | `Error: Cannot find module './save-indicator'`; `Tests 12 failed \| 55 passed (67)` (повторы, 403/404, 400, online/visible, pagehide, navigate, hidden, индикатор, C-04) | 82 passed |

Случаи Task 2 «P-01», «R-04 другая вкладка», failWrites, StrictMode и случай Task 3 «C-01 navigate в blocked» прошли уже на красном прогоне: их обеспечила реализация Task 1 (запись итога при восстановлении, `updateWal`, try/catch хранилища, `navigate` вне `active`).

Одно ожидание теста исправлено после зелёной реализации: в «online и возврат вкладки» шаг `hidden` при ответе 200 уже досылал всё, и `visible` нечего было повторять. Тест переписан: `hidden` тоже получает сбой сети (индикатор `offline`), 200 приходит на `visible`. Реализация под тест не менялась.

Трассер Task 1: `yarn workspace @bio-exam/web vitest run components/tests/attempt-lifecycle/lifecycle.test.ts && yarn workspace @bio-exam/web typecheck` выполнен повторно целиком и был зелёным до начала Task 2 (7 passed, без `error TS`); проверка чистоты печатала `lifecycle core is pure`.

## codegraph impact (D-29)

Индекс основного дерева `/Users/kdvornichenko/bio-exam` (в worktree `.codegraph/` нет; файлы 06-02 и 06-03 в индекс не попали).

`codegraph impact storageKeysToClear` (8 символов):
- `function storageKeysToClear` — `app/web/components/tests/attempt-submit-flow.ts:92`
- `app/web/components/tests/attempt-submit-flow.test.ts`
- `app/web/components/tests/TestRunner.tsx`: `clearAttemptStorage:178`, `showStartNotAssigned:187`, `doSubmit:506`, `replaceWithNewSession:235`, `restoreSession:266`

`codegraph impact resolveClientAttemptId` (6 символов):
- `function resolveClientAttemptId` — `app/web/components/tests/client-attempt-id.ts:24`
- `app/web/components/tests/client-attempt-id.test.ts`
- `app/web/components/tests/TestRunner.tsx`: `doSubmit:506`, `TestRunner:139`, `handleSubmit:673`

`codegraph impact createSaveQueue`: `ℹ Symbol "createSaveQueue" not found` (символ создан в 06-02 в worktree, индекс основного дерева его не знает).

План эти функции не меняет: модуль вызывает `storageKeysToClear` через `clearAttemptKeys` и `forgetClientAttemptId`, `TestRunner` не тронут.

## codegraph affected

`codegraph affected` по 11 файлам плана (из основного дерева), вывод дословно:

```
Affected test files (11):

  app/web/components/tests/attempt-lifecycle/index.ts
  app/web/components/tests/attempt-lifecycle/lifecycle.test.ts
  app/web/components/tests/attempt-lifecycle/lifecycle.ts
  app/web/components/tests/attempt-lifecycle/restore.test.ts
  app/web/components/tests/attempt-lifecycle/restore.ts
  app/web/components/tests/attempt-lifecycle/save-indicator.test.ts
  app/web/components/tests/attempt-lifecycle/save-indicator.ts
  app/web/components/tests/attempt-lifecycle/storage-keys.ts
  app/web/components/tests/attempt-lifecycle/testing.ts
  app/web/components/tests/attempt-lifecycle/wal.test.ts
  app/web/components/tests/attempt-lifecycle/wal.ts
```

Файлов нет в индексе, поэтому команда вернула входной список; вызывающих вне каталога у модуля пока нет.

## Verification

| Проверка | Итог |
|----------|------|
| `yarn workspace @bio-exam/web vitest run components/tests/attempt-lifecycle/lifecycle.test.ts && yarn workspace @bio-exam/web typecheck` (Task 1) | 7 passed, exit 0 |
| `lifecycle core is pure` (acceptance Task 1) | печатает |
| `yarn workspace @bio-exam/web vitest run components/tests/attempt-lifecycle` (Task 2) | 4 файла, 53 passed на конце Task 2 |
| `yarn workspace @bio-exam/web vitest run components/tests/attempt-lifecycle components/tests/attempt-submit-flow.test.ts components/tests/client-attempt-id.test.ts` (Task 3) | 6 файлов, 132 passed |
| `yarn workspace @bio-exam/web lint` | предупреждений в `attempt-lifecycle` нет |
| `yarn verify` | `yarn verify: OK` (все 8 шагов passed; exam-core 605, web 702, server 1119, rbac 3; script-tests pass 166, охранный тест 05-11 зелёный) |
| Сверка по отпечатку `before-06-03` | `06-03 changed only its files` |

## Закреплённые имена интерфейса (для 06-05, 06-07, 06-09)

Интерфейс `lifecycle.ts` из `<interfaces>` плана — без переименований: `AttemptPhase`, `AttemptBlockReason`, `SaveIndicatorKind`, `AttemptNotice`, `AttemptSnapshot`, `AttemptLifecycleApi`, `AttemptVisibilityEvent`, `AttemptVisibility`, `AttemptClock`, `AttemptLifecycleOptions`, `AttemptLifecycle`, `createAttemptLifecycle`. Реэкспорт из `index.ts` вместе с `saveIndicatorView`, `SAVE_INDICATOR_THRESHOLD_MS`, `attemptStorageKeys`, `ATTEMPT_SAVE_DEBOUNCE_MS`, `ATTEMPT_SAVE_MAX_WAIT_MS`.

Добавлено сверх плана (без замен):
- `lifecycle.ts`: `toSaveOutcome(result)`, `TELEMETRY_QUEUE_KEY = '#telemetry'`, константы задержек.
- `restore.ts`: `resolveRestoredDraft({ server: AttemptSession | null, wal, cachedSessionId, questionIds })` → `{ sessionId, answers, pending, position, telemetry, telemetryPending }` (поле `sessionId` — итоговая сессия: `server.sessionId` или `cachedSessionId`).
- `wal.ts`: `updateWal(storage, key, sessionId, mutate)` (общий запрет записи в WAL другой сессии; 06-07 пишет телеметрию через него), `recordPosition`, `confirmAnswer`, `confirmTelemetry`, `detachWal(storage, key, cachedSessionId)` (третий параметр нужен для чтения прежних форм), `parseAnswers`, `parseTelemetry`, `emptyWal`.
- `storage-keys.ts`: `safeRemove`, тип `CachedSession`.
- `save-indicator.ts`: `saveIndicatorDueAt(input)` (момент переоценки), типы `SaveIndicatorInput`, `SaveIndicatorView`, `SaveIndicatorTone`.
- `testing.ts`: `memoryStorage`, `readJson`, `fakeVisibility`, `fakeAttemptApi` (`queueStart`, `queueSave`, `setSaveDefault`, `savedBodies`), `deferred`, `sessionOf`, `requestError`, `response`, `OK`, `NETWORK`, `realClock`, `setupLifecycle`, `settle`, константы `TEST_ID`, `USER_ID`, `Q1`–`Q3`, `QUESTION_IDS`, `KEYS`, `STARTED_AT`, `START`. Id вопросов — UUID: `TelemetryMapSchema` и тело PATCH требуют UUID.

Для 06-05: `submit` и `retake` — ранний возврат; `interactionDisabled` истинен в `awaitingStart`, `starting`, `blocked` (`DISABLED_PHASES` в `lifecycle.ts`). Для 06-07: внутренний `onVisibility` уже обрабатывает `hidden`/`visible`/`online`/`pagehide` для очереди; телеметрию ставить в очередь ключом `TELEMETRY_QUEUE_KEY`, подтверждение снимает `telemetryPending` только при совпадении ссылки на карту телеметрии.

## Task Commits

Коммиты не выполнялись (правило пользователя): изменения в рабочем дереве worktree `gsd/phase-06`.

## Файлы к коммиту

- `app/web/components/tests/attempt-lifecycle/storage-keys.ts`
- `app/web/components/tests/attempt-lifecycle/wal.ts`
- `app/web/components/tests/attempt-lifecycle/wal.test.ts`
- `app/web/components/tests/attempt-lifecycle/restore.ts`
- `app/web/components/tests/attempt-lifecycle/restore.test.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle.test.ts`
- `app/web/components/tests/attempt-lifecycle/testing.ts`
- `app/web/components/tests/attempt-lifecycle/save-indicator.ts`
- `app/web/components/tests/attempt-lifecycle/save-indicator.test.ts`
- `app/web/components/tests/attempt-lifecycle/index.ts`

## Deviations from Plan

- `resolveRestoredDraft` принимает `server: null` и возвращает дополнительно `sessionId` (см. key-decisions): один путь для показа WAL до `/start` и для сбоя `/start` с закэшированной сессией.
- `detachWal` получил третий параметр `cachedSessionId` для чтения прежних форм WAL.
- `restore.ts` создан в Task 2, как в плане; в Task 1 модуль восстанавливал ответы встроенной функцией, в Task 2 она заменена на `resolveRestoredDraft`.

## Issues Encountered

- `codegraph` не инициализирован в worktree: `impact` и `affected` выполнены по индексу основного дерева; `createSaveQueue` в нём нет.
- В выводе `yarn verify` есть предупреждения lint в чужих файлах (`set-state-in-effect` и др.) — существовали до плана, шаг passed.

## Known Stubs

- `lifecycle.ts`: `submit` и `retake` — ранний возврат без побочных эффектов; тела делает 06-05 (так требует план). Поля снимка `secondsLeft`, `result`, `showTimeUp`, `submitFailed`, `alreadySubmittedAttemptId` имеют начальные значения; их заполняют 06-05 и 06-07. `TestRunner` модуль ещё не использует (06-09).

## Threat Flags

Нет: маршруты, тела запросов, ключи `localStorage`, env-ключи и миграции не менялись. T-6-06, T-6-07, T-6-08 закрыты тестами (`wal.test.ts` — схемы по ключу; D-26 п. 9; C-01, R-04, п. 7).

## Deferred human verification

Нет. Коммит файлов плана делает ведущая сессия.

## Next Phase Readiness

- 06-05 добавляет тела `submit`/`retake` и восстановление «сначала submit» поверх `applyServerSession`, `clearAttemptKeys`, `resolveClientAttemptId`.
- 06-07 добавляет телеметрию, видимость и таймер через `updateWal` и `TELEMETRY_QUEUE_KEY`.
- 06-09 подключает модуль к `TestRunner` через `useSyncExternalStore` (`subscribe`/`getSnapshot` стабильны) и `saveIndicatorView`.

## Self-Check: PASSED

- FOUND: все 11 файлов плана (`git status`: 11 `??`)
- FOUND: .planning/commit-snapshots/before-06-03/fingerprint.json
- Коммиты: не выполнялись по правилу пользователя
