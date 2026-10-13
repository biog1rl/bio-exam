---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 20
subsystem: web/attempt-lifecycle, web/TestRunner
tags: [TIME-06, TIME-03, ARCH-B, ADR-0005, ADR-0003, localStorage, refactor]
requires: [11-17, 11-14, 11-13, 11-12]
provides:
  - "outcome-rules.ts: attemptDisplay(input) → AttemptDisplay { outcome, deadlinePanel, banner, dialog, timer }; saveOutcomeOf (ответ PATCH → исход очереди)"
  - "AttemptSnapshot.display и команда AttemptLifecycle.dismissAlreadySubmitted(); признак закрытого диалога «Попытка уже сдана» живёт в модуле, сброс в reset() и init()"
  - "storage-keys.ts: AttemptStorageEvent, StorageEffects, STORAGE_EFFECTS и исполнитель applyStorageEffects(storage, keys, event, { auto, sessionId, unsent })"
  - "TestRunner рисует snapshot.display: плашки, панель дедлайна, панели исхода, диалоги и таймер"
  - "lifecycle-outcomes.test.ts: характеризация ключей хранилища по 16 исходам и сценарий 404 на PATCH после льготы"
affects: [phase-11-verification, phase-12, phase-13, phase-14]
tech-stack:
  added: []
  patterns:
    - "Показ исхода — чистая функция от полей снимка, проверяется таблицей Vitest без DOM"
    - "Стирание ключей попытки — строка таблицы STORAGE_EFFECTS и один исполнитель; ключ удаляется только если getItem его видит"
key-files:
  created:
    - app/web/components/tests/attempt-lifecycle/outcome-rules.ts
    - app/web/components/tests/attempt-lifecycle/outcome-rules.test.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle-outcomes.test.ts
  modified:
    - app/web/components/tests/attempt-lifecycle/lifecycle.ts
    - app/web/components/tests/attempt-lifecycle/storage-keys.ts
    - app/web/components/tests/attempt-submit-flow.ts
    - app/web/components/tests/TestRunner.tsx
key-decisions:
  - "display — новое поле снимка рядом с прежними (blockReason, submitFailed и другие остаются: их читают существующие тесты модуля)"
  - "Порядок диалогов при невозможном совпадении условий: start, затем time-expired, затем already-submitted"
  - "Таблица стирания и исполнитель — в storage-keys.ts; показ и правило PATCH — в outcome-rules.ts"
  - "Стирание test-frozen- при исходах сдачи задано значением 'if-auto', исполнитель получает auto в контексте; blockStart получил параметр auto (из startForSubmit), блок старта при восстановлении test-frozen- не трогает"
  - "carryReplacedText и расчёт unsentTexts остаются в lifecycle.ts; keepUnsent возвращает готовую запись UnsentRecord, а запись test-unsent- и судьбу WAL решает событие accepted"
  - "Стирание test-frozen- в init() без закэшированной сессии (строки в таблице плана не было) идёт событием fresh-start"
  - "Признак закрытого диалога сбрасывается и в init(), как остальные поля исхода"
requirements-completed: [TIME-06, TIME-03]
status: complete
metrics:
  duration: "~30 мин"
  completed: 2026-10-06
actuals:
  tokens: 11700
  tasks: 3
  commits: 0
plan_head_before: e7485f1a05278aa485be6b6114a433f48426bed5
plan_head_after: e7485f1a05278aa485be6b6114a433f48426bed5
---

# Phase 11 Plan 20: исход сдачи в модуле попытки Summary

Выбор плашки, панели, диалога и таймера считает чистая `attemptDisplay` и отдаёт в `snapshot.display`. Что стирать в localStorage при каждом исходе, задаёт таблица `STORAGE_EFFECTS` с одним исполнителем `applyStorageEffects`. Правило «ответ PATCH → исход очереди» (`saveOutcomeOf`) проверено таблицей. `TestRunner` только рисует. Тексты и видимое поведение прежние.

## Что сделано

### Task 1 (tracer): что показать ученику
- `outcome-rules.ts`: типы `AttemptOutcomePanel`, `AttemptDialog`, `AttemptDisplay`, `AttemptDisplayInput` и `attemptDisplay`. Правила перенесены из `TestRunner` дословно.
- `lifecycle.ts`: поле `alreadySubmittedDismissed`, команда `dismissAlreadySubmitted()` (ставит признак и вызывает `emit`), `buildSnapshot` добавляет `display` (`timed` = `secondsLeft` снимка не `null`).
- `TestRunner.tsx`: `useState` закрытого диалога, `acceptedWithoutResult`, `outcomeShown`, вложенный тернарник баннера и импорты `bannerFor`/`answersInvalidBanner`/`AttemptBanner` убраны. Панели исхода, панель дедлайна, баннер, три диалога и таймер берутся из `snapshot.display`. `handleRetake` вызывает только `lifecycle.retake()`. Ключ фокуса заголовка исхода строится из `display.outcome` и `attemptId` результата. Разметка, классы, тексты и прежние комментарии файла не менялись.
- Ворота трассера: e2e `timed-attempt` и `submit-retry` прошли (22 passed), после этого начата Task 2.

Итоговая таблица показа (как в коде):

| Поле | Правило |
|---|---|
| `outcome` | `{ kind: 'result', accepted: acceptedAutomatically }` при результате; `{ kind: 'accepted-without-result' }` при `phase === 'submitted'`, без результата и `acceptedAutomatically`; иначе `null` |
| `deadlinePanel` | при `deadlinePassed`, `outcome === null` и `phase !== 'blocked'`: `failed`, если `submitFailed` и `phase === 'active'`, иначе `sending`; иначе `null` |
| `banner` | `answersInvalidBanner(submitRejection)`; иначе `bannerFor` для `start-not-assigned`, `submit-not-assigned`, `not-found`; для `already-submitted` — только при закрытом диалоге; иначе `retry` при `submitFailed` и не `deadlinePassed` |
| `dialog` | `start` при `awaitingStart`; `time-expired` при этой причине; `already-submitted` при этой причине и открытом диалоге |
| `timer` | `timed` и `outcome === null` |

### Task 2: что стереть
- Характеризация `lifecycle-outcomes.test.ts` (`test.each`, 16 строк, через `setupLifecycle`/`fakeAttemptApi`, проверка `presentKeys`, `sessionId` WAL и записи `test-unsent-`) написана до переноса.
- Прогон на коде до переноса (стирание ещё через `clearAttemptKeys`/`removeFrozen`/`detachWal`/`safeRemove`): `Tests 16 passed (16)`. Вместе со сценарием Task 3, тоже до переноса: `17 passed (17)`.
- `storage-keys.ts`: `AttemptStorageEvent`, `StorageEffects`, `STORAGE_EFFECTS`, `applyStorageEffects`; `clearAttemptKeys` и `safeRemove` удалены. `attempt-submit-flow.ts`: удалены `STORAGE_KEYS_BY_EVENT`, `ALL_ATTEMPT_KEYS`, `AttemptStorageKey`, `AttemptStorageEvent`, `storageKeysToClear`.
- `lifecycle.ts`: каждое стирание идёт через `applyStorageEffects`; `removeFrozen`, `removeStoredUnsent`, прямые `detachWal`, `safeRemove`, `clearAttemptKeys` удалены. Порядок в `applyServerSession` прежний: `started` → `carryReplacedText` → `session-replaced` → повторное чтение WAL → `foreign-wal`. `keepExpiredUnsent` хранилище не трогает. `writeFrozen` и записи WAL не менялись.
- После переноса: характеризация 16/16 и сценарий зелёные, все тесты модуля попытки и `attempt-submit-flow.test.ts` (12 файлов, 300 тестов) зелёные. Закрепление `lifecycle.test.ts` › «ревью C-01, R-04» (`removed === [KEYS.wal]`) зелёное без правок.

Итоговая таблица стирания (`STORAGE_EFFECTS` как в коде):

| Событие | Где вызывается | session | clientAttemptId | unsent | frozen | wal |
|---|---|---|---|---|---|---|
| `submitted` | 200 в `sendSubmit` | удалить | удалить | удалить | удалить | `remove` |
| `retake` | `reset` | удалить | удалить | удалить | удалить | `remove` |
| `accepted` | `applyAccepted` | удалить | удалить | — | удалить | `to-unsent` |
| `already-submitted` | `closeSession` из `applyAlreadySubmitted` | удалить | удалить | — | удалить | `remove` |
| `time-expired` | `closeSession` из `applyTimeExpired` | удалить | удалить | — | удалить | `keep` |
| `not-found` | `applySubmitFailure` | удалить | удалить | — | `if-auto` | `detach` |
| `submit-not-assigned` | `applySubmitFailure` | — | — | — | `if-auto` | `keep` |
| `start-not-assigned` | `blockStart` | удалить | удалить | — | `if-auto` | `detach` |
| `submit-failed` | `applySubmitFailure` (`retry`, `answers-invalid`), `failSubmit` (в том числе сбой `/start` перед сдачей) | — | — | — | `if-auto` | `keep` |
| `session-replaced` | `applyServerSession` (кэш другой сессии) | — | удалить | — | удалить | `remove` |
| `fresh-start` | `awaitFreshStart`, `runStart` с `frozen` и другой сессией, `init()` без кэша при `frozen` | — | — | — | удалить | `keep` |
| `started` | успешный `/start` (`applyServerSession`, `startForSubmit`) | — | — | удалить | — | `keep` |
| `foreign-wal` | `applyServerSession`: WAL чужой сессии | — | — | — | — | `remove` |

Исполнитель удаляет ключ только если `getItem` его видит, ошибки хранилища глотаются. `clientAttemptId` стирается через `forgetClientAttemptId`. `detach` вызывает `detachWal`, если у WAL нет сессии или его `sessionId` равен `context.sessionId`. `to-unsent` при `context.unsent` пишет запись (`writeUnsent`) и удаляет WAL только после удачной записи; без записи (`unsent: null`) удаляет WAL.

Строки характеризации (ожидаемые ключи после исхода): 200 ручной → нет; 409 client → нет; 409 deadline, текст совпал → нет; 409 deadline, текст не дошёл → `unsent` с записью (`attemptId`, `certain: true`); 422 TIME_EXPIRED → `wal` (s1); 404 сдачи → `wal` (`sessionId: null`); 403 сдачи → `session`, `wal`, `clientAttemptId`; 403 автосдачи → те же, `frozen` нет; 404 автосдачи → `wal` (`null`); сбой сети ручной → `session`, `wal`, `clientAttemptId`; сбой сети автосдачи → те же, `frozen` нет; 403 на старте при кэше и WAL → `wal` (`null`); замена сессии с подтверждёнными ответами → `session`, `wal` (s2), записи `test-unsent-` нет; замена сессии с неподтверждённым текстом → `session`, `wal` (s2), `unsent` (`attemptId: null`, `certain: false`); «Начать заново» после результата теста с лимитом → нет; восстановление с `frozen` и другой сессией → `session`, `wal` (s2), `frozen` нет.

### Task 3: правило ответа PATCH и 404 после льготы
- Красный шаг: таблица `saveOutcomeOf` в `outcome-rules.test.ts` упала (10 failed, функции нет). Сценарий 404 после льготы на коде до переноса зелёный, расхождения с находкой B нет.
- `outcome-rules.ts`: `saveOutcomeOf` (сеть → `retry`; 2xx → `ok`; 400 → `reject`; 403/404 → `stop`; прочее → `retry`). `lifecycle.ts`: `send` вызывает `saveOutcomeOf`, `toSaveOutcome` удалён.
- Сценарий (`lifecycle-outcomes.test.ts`): тест с лимитом, текст в Q1, PATCH без связи, автосдача по дедлайну упала сетью (`display.deadlinePanel === 'failed'`), часы за льготой, `online`: повтор PATCH получает 404 и очередь стоит (за 60 с новых PATCH нет), ответ в WAL с `pending: [Q1]`, повтор автосдачи несёт текст в теле, 409 финализации с видом без текста → `display.outcome` `{ kind: 'result', accepted: true }`, `snapshot.unsent` с текстом, в хранилище только `unsent`.

## Проверки

| Проверка | Итог |
|---|---|
| `yarn workspace @bio-exam/web vitest run components/tests/attempt-lifecycle components/tests/attempt-submit-flow.test.ts` | 12 files, 300 passed |
| `yarn workspace @bio-exam/web test` | 101 files, 1613 passed |
| `yarn workspace @bio-exam/web lint` | exit 0; предупреждения только старые (в `TestRunner.tsx:108` — прежний `setAttempts` в эффекте) |
| `yarn workspace @bio-exam/web typecheck` | exit 0 |
| `node --test scripts/draft-durability-guards.test.mjs` | 7 pass, 0 fail, файл не менялся |
| `yarn e2e tests/timed-attempt.spec.ts tests/submit-retry.spec.ts` (трассер) | 22 passed |
| `yarn e2e tests/timed-attempt.spec.ts tests/submit-retry.spec.ts tests/answer-durability.spec.ts tests/attempt-slow-network.spec.ts` | 30 passed |
| `yarn format:check` | все файлы в формате |
| `yarn verify` | `yarn verify: OK` (со второго прогона, см. ниже) |
| `11-plan-files.cjs check 11-20` | не запускался (режим worktree) |

Неизменность закреплений: `git diff --stat HEAD` содержит только `TestRunner.tsx`, `lifecycle.ts`, `storage-keys.ts`, `attempt-submit-flow.ts`. `lifecycle.test.ts`, `lifecycle-submit.test.ts`, `lifecycle-restore.test.ts`, `lifecycle-time.test.ts`, `wal.ts`, `testing.ts`, `attempt-submit-flow.test.ts` и `scripts/draft-durability-guards.test.mjs` не менялись.

Acceptance-grep: в `TestRunner.tsx` `alreadySubmittedClosed|acceptedWithoutResult|bannerFor|answersInvalidBanner` = 0, `snapshot.display` = 7; `dismissAlreadySubmitted` в `lifecycle.ts` = 2; `removeFrozen|detachWal|clearAttemptKeys|safeRemove|removeItem|removeStoredUnsent` в `lifecycle.ts` = 0; `STORAGE_KEYS_BY_EVENT|storageKeysToClear|AttemptStorageEvent` в `attempt-submit-flow.ts` = 0; `toSaveOutcome` в `lifecycle.ts` = 0; `export function saveOutcomeOf` = 1.

### yarn verify
- Прогон 1: `yarn verify: FAILED at lint-typecheck-test`. Упал `@bio-exam/server#test`: тайм-ауты хуков в `src/routes/auth/refresh-rotation.test.ts` и `src/routes/groups/teacher-zone-groups.matrix.test.ts` при load average около 42 (параллельно работали другие исполнители). Web test/lint/typecheck в том же шаге прошли, серверный код план не трогал.
- Прогон 2 (повтор по правилам фазы): все шаги прошли, последняя строка `yarn verify: OK`.

## Codegraph

В worktree нет каталога `.codegraph/`, поэтому `codegraph impact` и `affected` не запускались, связи искал через `rg`/`grep`. Импортёры изменённых модулей: `TestRunner.tsx`, `attempt-lifecycle/index.ts`, `use-attempt-lifecycle.ts`, `save-indicator.ts` (тип `AttemptPhase`), `testing.ts`, `user-storage.test.ts`, `attempt-submit-flow.test.ts`. Символы `clearAttemptKeys`, `safeRemove`, `storageKeysToClear`, `STORAGE_KEYS_BY_EVENT`, `toSaveOutcome` вне `lifecycle.ts`/`storage-keys.ts`/`attempt-submit-flow.ts` не использовались (в `scripts/draft-durability-guards.test.mjs` `storageKeysToClear` упомянут только как запрещённая строка для `TestRunner`). Прогон всего набора web-тестов покрывает всех потребителей.

## Deviations from Plan

### Расхождения с таблицей `<interfaces>`
- Расхождений в наборах ключей нет: характеризация по таблице плана прошла на коде до переноса без правок ожиданий.
- **Пропущенная строка:** `init()` без закэшированной сессии стирал `test-frozen-` прямым `removeFrozen()`, в таблице плана этого места нет. Теперь это событие `fresh-start` (стирает только `frozen`), поведение то же.
- **`blockStart(cached, auto = false)`:** раньше `startForSubmit` сам удалял `test-frozen-` перед `blockStart(null)`. Теперь `auto` передаётся в `blockStart`, а в `start-not-assigned` стоит `frozen: 'if-auto'`. Набор ключей тот же.

### Auto-fixed Issues
- **[Rule 1 - Bug] Тип deferred в сценарии Task 3:** `deferred<Error>` не подходил под `SubmitStep` фейка. Заменён на `deferred<AttemptView | Error>` (`ReturnType<typeof attemptViewOf> | Error`), typecheck зелёный.

### Прочее
- Признак закрытого диалога сбрасывается не только в `reset()`, но и в `init()`, вместе с остальными полями исхода. В TestRunner `useState` жил, пока жил компонент. Повторный `init()` после `dispose()` (React Strict Mode) и так обнулял `blockReason`, так что на экране разницы нет.
- `dismissAlreadySubmitted()` при уже поставленном признаке ничего не делает (лишний `emit` не нужен).
- `index.ts` и `testing.ts` (оба `# optional`) не менялись: `TestRunner` не импортирует новые типы, помощники для тестов не понадобились.

## Known Stubs

Нет.

## Threat Flags

Нет: новой сетевой поверхности, путей авторизации или схем нет. T-11-75 закрыт характеризацией до и после переноса и `to-unsent` (WAL удаляется только после удачной записи); T-11-77 — таблицей `attemptDisplay` и e2e.

## Файлы к коммиту

- app/web/components/tests/attempt-lifecycle/outcome-rules.ts (новый)
- app/web/components/tests/attempt-lifecycle/outcome-rules.test.ts (новый)
- app/web/components/tests/attempt-lifecycle/lifecycle-outcomes.test.ts (новый)
- app/web/components/tests/attempt-lifecycle/lifecycle.ts
- app/web/components/tests/attempt-lifecycle/storage-keys.ts
- app/web/components/tests/attempt-submit-flow.ts
- app/web/components/tests/TestRunner.tsx
- .planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-20-SUMMARY.md

## Issues Encountered

Первый `yarn verify` упал на серверных тайм-аутах под нагрузкой машины. Повтор прошёл.

## Next Phase Readiness

Новый исход фазы 12–14 (фото) добавляется строкой в `attemptDisplay` и строкой в `STORAGE_EFFECTS`, обе проверяются в Vitest без DOM.

## Self-Check: PASSED

- FOUND: outcome-rules.ts, outcome-rules.test.ts, lifecycle-outcomes.test.ts, 11-20-SUMMARY.md
- Коммитов нет по правилу фазы (commits: 0, HEAD = plan_head_before)
