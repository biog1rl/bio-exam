---
phase: 06-draft-durability
plan: 05
subsystem: web-attempt-lifecycle
tags: [attempt-lifecycle, submit, retake, restore, client-attempt-id, life01, life03, life05]
status: complete
deferred_human_gate: false

requires:
  - phase: 06-03
    provides: "createAttemptLifecycle, applyServerSession, blockStart, resolveRestoredDraft, clearAttemptKeys, detachWal, testing.ts"
  - phase: 05
    provides: "classifySubmitFailure, classifyStartFailure, storageKeysToClear, resolveClientAttemptId, ATTEMPT_GRACE_PERIOD_MINUTES, SUBMIT_ERROR_CODES"
provides:
  - "lifecycle.ts: тела submit({ auto }) и retake(), внутренние reset, sendSubmit, applySubmitFailure, resubmit, startForSubmit, isAbandonedExpired; константа TIME_UP_PAUSE_MS = 1500"
  - "lifecycle.ts: дерево восстановления init (1) повтор submit с сохранённым clientAttemptId, (2) брошенная просроченная сессия → awaitingStart, (3) frozenKey → /start → autoSubmitting, (4) /start и сверка sessionId"
  - "client-attempt-id.ts: storedClientAttemptId(storage, key, sessionId) → string | null"
  - "testing.ts: queueSubmit, submitRequests, attemptViewOf, ATTEMPT_ID, sequentialIds, presentKeys, seededStorage, requestError(status, code, attemptId), опция createId у setupLifecycle"
affects: [06-07, 06-09]

actuals:
  tokens: 15400
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Одна отправка sendSubmit на три входа: ручная/автосдача (submit), повтор при восстановлении (resubmit), автосдача после /start с frozenKey; исход 'settled' | 'retry' | 'stale', решение по 'retry' принимает вызывающий"
    - "Пауза автосдачи — промис вокруг clock.setTimer с сохранённым handle; reset и dispose снимают таймер и разрешают промис, счётчик поколения отсекает продолжение"
    - "restoreCandidate: сессия, которую модуль узнаёт на следующем /start без уведомления session-replaced (после сброса и при брошенной просроченной сессии)"

key-files:
  created:
    - app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts
  modified:
    - app/web/components/tests/attempt-lifecycle/lifecycle.ts
    - app/web/components/tests/attempt-lifecycle/testing.ts
    - app/web/components/tests/client-attempt-id.ts
    - app/web/components/tests/client-attempt-id.test.ts

key-decisions:
  - "Решение исполнителя (автономно): interactionDisabled истинен также в submitting, autoSubmitting и submitted (DISABLED_PHASES); retry-плашка (submitFailed) ввод не выключает"
  - "Решение исполнителя (автономно): отправка без сессии после /start пишет sessionKey и переводит WAL на новую сессию (persistAll), черновик сервера ответы экрана не перезаписывает (05-UI-SPEC :176)"
  - "Решение исполнителя (автономно): 403 на /start перед автосдачей и 403/404 на автосдачу удаляют frozenKey (как unfreezeAfterAutoSubmit в TestRunner); 409 и 422 удаляют все четыре ключа"
  - "Решение исполнителя (автономно): 404 на отправку переводит WAL в sessionId null только если WAL без сессии или принадлежит отправляемой сессии; очередь отбрасывается, in-memory pending = все ответы"
  - "Решение исполнителя (автономно): 403 на отправку ключей не трогает и очередь не отбрасывает (строка :178 «ничего не удаляется»)"
  - "Решение исполнителя (автономно): повтор submit при восстановлении, упавший по сети/5xx/400, идёт обычным путём /start без плашки submitFailed (пользователь ещё ничего не нажимал); при frozenKey ключ удаляется до /start, чтобы путь (3) не зациклил автосдачу"
  - "Решение исполнителя (автономно): сбой /start при init с frozenKey и закэшированной сессией оставляет frozenKey (фаза active с закэшированной сессией, как в 06-03); следующий init снова идёт по пути (3)"
  - "Решение исполнителя (автономно): при брошенной просроченной сессии (путь 2) ответы WAL под «Начать тест?» не показываются (answers {}, позиция — первый вопрос), sessionKey и WAL s1 остаются в хранилище до confirmStart; на confirmStart тот же s1 → черновик сервера + pending WAL и session-restored, новый → WAL s1 удаляется правилом 06-03 «WAL другой сессии», уведомлений нет"
  - "Решение исполнителя (автономно): frozenKey без закэшированной сессии при init удаляется (устаревший)"
  - "Решение исполнителя (автономно): reset запоминает сессию (текущую или закрытую последним исходом 200/409/422) как restoreCandidate; если /start после сброса (confirmStart или старт теста без лимита) вернул её id — черновик сервера и session-restored (CR-05), иначе чистый проход без session-replaced. restoreCandidate снимается после успешного /start или 403"
  - "Решение исполнителя (автономно): сбой /start после retake теста без лимита — фаза active без сессии и уведомление retake-start-failed (тост «Не удалось начать новую попытку. Попробуйте ещё раз.» в 06-09); решение 06-03 «без уведомления» относится только к init"
  - "Решение исполнителя (автономно): init сбрасывает result, showTimeUp, submitFailed, alreadySubmittedAttemptId вместе с blockReason (повторный init после dispose начинает с хранилища)"
  - "Решение исполнителя (автономно): retake допускается в любой фазе после init; UI вызывает его только из блока «Результат» и диалога 422"

requirements-completed: []

duration: 25min
completed: 2026-10-04
---

# Phase 6 Plan 05: Отправка, исходы фазы 5, восстановление «сначала submit» и пересдача в модуле попытки Summary

**`submit({ auto })` и `retake()` модуля попытки с исходами 200/403/404/409/422/400/5xx/сеть через `classifySubmitFailure`, паузой автосдачи 1500 мс через шов часов после очистки ключей, одним `reset` с поколением и восстановлением по решениям пользователя 2026-10-04: повтор submit с сохранённым `clientAttemptId` до `/start`, «Начать тест?» при брошенной просроченной сессии без локального 422, автосдача после перезагрузки и «полное время» только при новой сессии; `storedClientAttemptId`; 47 новых тестов последовательностей событий (26 в `lifecycle-submit.test.ts`, 21 в `lifecycle-restore.test.ts`) и 4 теста `storedClientAttemptId`**

коммит: не выполнялся (правило пользователя), изменения в рабочем дереве

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-04T17:29:00Z
- **Completed:** 2026-10-04T17:55:00Z
- **Tasks:** 3
- **Files modified:** 6 (2 новых)

## Accomplishments

- `submit({ auto })`: фаза `submitting`/`autoSubmitting`, `submitFailed` сбрасывается; при `auto` пишется `frozenKey`; без сессии сначала `/start` (403 → `blocked`/`start-not-assigned` с `detachWal`; иной сбой → `active` + `submitFailed`); `clientAttemptId` через `resolveClientAttemptId`; тело `{ sessionId, clientAttemptId, answers, telemetry }`.
- 200: очередь отбрасывается, `clearAttemptKeys('success')` до паузы автосдачи (CR-01(а)), `showTimeUp` 1500 мс через `clock.setTimer`, затем `submitted` с `result` и уведомлением `submitted`. Поздний PATCH старой сессии ничего не подтверждает (сессия снята), `answer` после сдачи игнорируется, `navigate` после сдачи не пишет WAL (C-01).
- Исходы фазы 5 — `applySubmitFailure` по `classifySubmitFailure`; `forgetClientAttemptId` вызывается только через `clearAttemptKeys`/`storageKeysToClear`, не на `answer()`.
- `reset()` (вызывает `retake`): поколение +1, `queue.discard()`, снятие паузы и таймера индикатора, удаление четырёх ключей, начальное состояние снимка, затем `awaitingStart` (лимит) или `/start` (без лимита).
- Восстановление при `init` с закэшированной сессией в порядке (1)–(4) из must_haves; проверка часов — прямое сравнение `clock.now()` с `Date.parse(startedAt) + (лимит + ATTEMPT_GRACE_PERIOD_MINUTES) * 60_000` в `isAbandonedExpired`, функция фазы 5 не импортируется.
- `storedClientAttemptId` читает пару через `readStoredClientAttempt`, хранилище не меняет.

## TDD: сначала красный

Коммитов RED/GREEN нет (правило пользователя); порядок соблюдён по сути:

| Задача | Красный прогон до реализации | Зелёный |
|--------|------------------------------|---------|
| Task 1 (`lifecycle-submit.test.ts`, 6 тестов; `testing.ts` расширен) | `Tests 5 failed \| 83 passed (88)`: `expected 'active' to equal 'submitting'`, `Received: "active"` для `autoSubmitting`, `1 !== 2` вызовов `/start` | 88 passed, typecheck exit 0, `error TS` 0 |
| Task 2 (+20 тестов строк таблицы и сброса) | `Tests 12 failed \| 96 passed (108)`: 403/409/422/404 на отправку, 403 на `/start`, автосдача 403, все 4 теста `retake` | 108 passed; `behavior rows covered` |
| Task 3 (+4 теста `storedClientAttemptId`, `lifecycle-restore.test.ts` 21 тест) | `Tests 21 failed \| 162 passed (183)`: `TypeError: storedClientAttemptId is not a function`, `/start` вызывался до submit, `awaitingStart` не наступал, `autoSubmitting` не наступал | 183 passed (8 файлов) |

Прошли уже на красном прогоне (обеспечены предыдущей реализацией): Task 1 «submit вне фазы active»; Task 2 строки 400/500/сеть, `/start` не по 403, автосдача 500 (общая ветка retry из Task 1), `confirmStart` start-failed/403 и PATCH 403/404 (06-03); Task 3 «часы в пределах: s1 → session-restored», «s2 → session-replaced», P-04 (frozenKey снимает `clearAttemptKeys('session-replaced')` 06-03), CR-05 «новая s2 → чистый проход».

Ожидания, исправленные после зелёной реализации (реализация под тест не менялась):
- Task 2, строка 404: порядок досылки двух PATCH в s3 зависит от порядка ключей WAL (черновик сервера раньше ответа экрана); тест сравнивает тела, отсортированные по `questionId`.
- Task 3, повтор 503/сеть/400: в фикстуре WAL ответ лежал как подтверждённый, а черновик сервера `/start` был пустым; по D-12 (решение 06-03) подтверждённое значение уступает серверу. Фикстура приведена к реальности: подтверждённый ответ есть в черновике сервера.

Трассер Task 1: `yarn workspace @bio-exam/web vitest run components/tests/attempt-lifecycle && yarn workspace @bio-exam/web typecheck` выполнен целиком и был зелёным до начала Task 2 (88 passed, exit 0).

## Строка таблицы «Поведение» 05-UI-SPEC → тест

| Строка 05-UI-SPEC | Тест |
|---|---|
| :176 отправка без сессии | `lifecycle-submit` «отправка без сессии: сначала /start s2…» |
| :177 200 | «трассер: answer → submit → 200…», «CR-01(а): автосдача 200…», «PATCH, начатый до отправки…», «ревью C-01: после 200 navigate…» |
| :178 403 на отправку | «403 на отправку…», «автосдача упала с 403…» |
| :179 403 на `/start` | «403 на /start перед отправкой…», ««Начать» не удалось… 403» |
| :180 409 `ATTEMPT_ALREADY_SUBMITTED` | «409 … с attemptId…», «409 … без attemptId…» |
| :181 422 `TIME_EXPIRED` | «422 TIME_EXPIRED на ручную отправку…», «422 TIME_EXPIRED на автосдачу…» |
| :182 404 на отправку | «404 на отправку… новый модуль досылает ответы в s3» |
| :183 400, 5xx, сеть, неудачный `/start` | цикл «400 / 500 / сбой сети на отправку…», «неудачный /start перед отправкой не по 403…» |
| :184 автосдача упала не на 409/422 | «автосдача упала с 500…» |
| :185 часы клиента (в редакции решения 2026-10-04) | `lifecycle-restore` «брошенная просроченная s1…» (2 теста), «frozenKey, часы за лимитом…» |
| :186 тот же `sessionId` | `lifecycle-restore` «часы в пределах…: s1 → session-restored» |
| :187 другой `sessionId` (в редакции решения 2026-10-04) | «часы в пределах…: s2 → session-replaced», P-04, CR-05 (3 теста) |
| :188 «Начать» не удалось не по 403 | ««Начать» не удалось не по 403: start-failed…» |
| :189 PATCH 403/404 | цикл «PATCH черновика получил 403/404…» |
| :191 «Пройти ещё раз» = «Начать заново» | `describe('retake: один сброс')` (4 теста), D-26 п. 4 |
| Решение пользователя 1 (C-03/R-02) | `lifecycle-restore` «200 / 422 / 409 / 403 / 404 / 503 / сеть / 400 …», «ручная отправка упала сетью…», «frozenKey и сохранённый clientAttemptId…» (2 теста) |

## codegraph impact (D-29)

Индекс основного дерева `/Users/kdvornichenko/bio-exam` (в worktree `.codegraph/` нет).

- `codegraph impact createAttemptLifecycle`: `ℹ Symbol "createAttemptLifecycle" not found` — модуль создан в 06-03 в worktree, индекс основного дерева его не знает; вызывающих вне каталога `attempt-lifecycle` нет (TestRunner переходит в 06-09).
- `codegraph impact classifySubmitFailure` (6 символов): `attempt-submit-flow.ts:72`, `attempt-submit-flow.test.ts`, `TestRunner.tsx` (`doSubmit:506`, `TestRunner:139`, `handleSubmit:673`). Функция не менялась.
- `codegraph impact resolveClientAttemptId` (6 символов): `client-attempt-id.ts:24`, `client-attempt-id.test.ts`, `TestRunner.tsx` (`doSubmit:506`, `TestRunner:139`, `handleSubmit:673`). Функция не менялась, `storedClientAttemptId` добавлен рядом.

## codegraph affected

`codegraph affected` по 6 файлам плана (из основного дерева), вывод дословно:

```
Affected test files (6):

  app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts
  app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts
  app/web/components/tests/attempt-lifecycle/lifecycle.ts
  app/web/components/tests/attempt-lifecycle/testing.ts
  app/web/components/tests/client-attempt-id.test.ts
  app/web/components/tests/client-attempt-id.ts
```

Файлы модуля не в индексе, команда вернула входной список. `TestRunner.tsx` и `attempt-submit-flow.ts` не менялись.

## Verification

| Проверка | Итог |
|----------|------|
| Task 1: `vitest run components/tests/attempt-lifecycle && typecheck` | 88 passed, exit 0, `error TS` 0 |
| Task 2: `vitest run components/tests/attempt-lifecycle` | 108 passed |
| Task 2 acceptance (литералы кодов в тесте) | `behavior rows covered` |
| Task 3: `vitest run components/tests/attempt-lifecycle components/tests/client-attempt-id.test.ts components/tests/attempt-submit-flow.test.ts` | 8 файлов, 183 passed |
| `yarn verify` | `yarn verify: OK` (8 шагов passed; exam-core 605, web 815, server 1119, rbac 3; script-tests pass 166) |
| Сверка по отпечатку `before-06-05` | `06-05 changed only its files` |
| Lint web в файлах плана | предупреждений нет (64 предупреждения web — в чужих файлах, были до плана) |
| `oxfmt --check .` | All matched files use the correct format |

## Task Commits

Коммиты не выполнялись (правило пользователя): изменения в рабочем дереве worktree `gsd/phase-06`.

## Файлы к коммиту

- `app/web/components/tests/attempt-lifecycle/lifecycle.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts`
- `app/web/components/tests/attempt-lifecycle/testing.ts`
- `app/web/components/tests/client-attempt-id.ts`
- `app/web/components/tests/client-attempt-id.test.ts`

## Deviations from Plan

- `restoreCandidate` один на два случая: сессия, оставленная сбросом (CR-05), и брошенная просроченная сессия пути (2). `confirmStart` вызывает `/start` с ней вместо `runStart(null)`.
- `TIME_UP_PAUSE_MS` экспортируется из `lifecycle.ts`, но не реэкспортируется из `index.ts` (файл вне списка плана).
- `oxfmt` с несколькими путями через `yarn oxfmt` в worktree отвечает «All matched files may have been excluded by ignore rules»; файлы отформатированы по одному с префиксом `./`, итог проверен `oxfmt --check .`.

## Issues Encountered

- `codegraph` не инициализирован в worktree: `impact` и `affected` выполнены по индексу основного дерева; `createAttemptLifecycle` в нём нет.

## Known Stubs

- `secondsLeft` в снимке всегда `null`, тик таймера, предупреждение и вызов `submit({ auto: true })` по дедлайну — 06-07. Телеметрия в теле submit — текущая карта модуля; закрытие отрезка времени перед сборкой тела — 06-07.
- `TestRunner` модуль ещё не использует и по-прежнему вызывает `isClientExpired` (06-09).

## Threat Flags

Нет: маршруты, тела запросов, ключи `localStorage`, env-ключи и миграции не менялись. T-6-12 (повтор с сохранённым `clientAttemptId`, исход решает сервер), T-6-13 (часы клиента только открывают «Начать тест?»; тест «брошенная просроченная s1» — `awaitingStart`, `blockReason` null, `/start` и submit не вызваны), T-6-14 (reset отбрасывает очередь и удаляет WAL; тест «retake после 422: очередь s1 отброшена…») закрыты тестами.

## Deferred human verification

Нет. Подтверждение редакции строк 05-UI-SPEC :185 и :187 не требуется (решение пользователя 2026-10-04); визуальная проверка — 06-11. Коммит файлов плана делает ведущая сессия.

## Next Phase Readiness

- 06-07: автосдача по таймеру вызывает `submit({ auto: true })` (пишет `frozenKey`, фаза `autoSubmitting`); `reset` и `dispose` уже снимают паузу автосдачи — туда же добавляется снятие тика; флаги предупреждения и автосдачи обнулять в `reset`.
- 06-09: `TestRunner` берёт `phase`, `blockReason`, `alreadySubmittedAttemptId`, `submitFailed`, `result`, `showTimeUp`, `interactionDisabled` из снимка; уведомления `submitted`, `session-restored`, `session-replaced`, `start-failed`, `retake-start-failed`; «Повторить» → `submit()`, «Пройти ещё раз» и «Начать заново» → `retake()`.

## Self-Check: PASSED

- FOUND: 6 файлов плана (`git status`: 4 `M`, 2 `??`)
- FOUND: .planning/commit-snapshots/before-06-05/fingerprint.json
- Коммиты: не выполнялись по правилу пользователя
