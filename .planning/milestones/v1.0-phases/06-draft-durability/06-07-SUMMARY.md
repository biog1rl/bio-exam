---
phase: 06-draft-durability
plan: 07
subsystem: web-attempt-lifecycle
tags: [attempt-lifecycle, telemetry, timer, auto-submit, visibility, life01, life03, life05]
status: complete
deferred_human_gate: false

requires:
  - phase: 06-03
    provides: "createAttemptLifecycle, очередь с TELEMETRY_QUEUE_KEY, WAL v2 (updateWal, confirmTelemetry), resolveRestoredDraft с mergeTelemetryMaps, testing.ts"
  - phase: 06-05
    provides: "submit({ auto }), frozenKey, reset, failSubmit, пауза автосдачи, restoreCandidate"
provides:
  - "lifecycle.ts: отрезок времени текущего вопроса (openSegment/closeSegment по clock.now), визит при входе в вопрос в active, потеря фокуса при скрытии вкладки, запись телеметрии в WAL через updateWal с telemetryPending true"
  - "lifecycle.ts: тик таймера через clock.setTimer до следующей целой секунды, secondsLeft в снимке, уведомление one-minute-left и автосдача submit({ auto: true }) один раз за сессию; константа ONE_MINUTE_LEFT_SECONDS"
  - "answer-edits.ts: toggleOption, setMatchingPair; реэкспорт из index.ts"
  - "testing.ts: seededStorage принимает telemetry и telemetryPending WAL; walTelemetry, walTelemetryPending"
affects: [06-09, 06-11]

actuals:
  tokens: 21000
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Один вход в active (enterActive(visit)) на все пять мест смены фазы: открывает отрезок, добавляет визит и ставит тик; один выход (leaveActive) в beginSubmit закрывает отрезок до сборки тела submit и снимает тик"
    - "Телеметрия пишется в WAL при каждом изменении, а в очередь отправки ставится в точках немедленной отправки: переход, скрытие вкладки, pagehide, dispose, появление сессии (enqueuePending)"
    - "Тик планируется до следующей целой секунды остатка; пропущенный тик не теряет предупреждение и автосдачу, потому что проверка — остаток ≤ порога, а не равенство"

key-files:
  created:
    - app/web/components/tests/attempt-lifecycle/lifecycle-time.test.ts
    - app/web/components/tests/attempt-lifecycle/answer-edits.ts
    - app/web/components/tests/attempt-lifecycle/answer-edits.test.ts
  modified:
    - app/web/components/tests/attempt-lifecycle/lifecycle.ts
    - app/web/components/tests/attempt-lifecycle/index.ts
    - app/web/components/tests/attempt-lifecycle/testing.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle.test.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts

key-decisions:
  - "Решение исполнителя (автономно): изменение телеметрии сразу пишется в WAL (telemetryPending true), но в очередь отправки ставится только в точках немедленной отправки D-11 (переход, скрытие вкладки, pagehide, dispose) и при появлении сессии; визит при старте уходит со следующей такой точкой или в теле submit. Так телеметрия уходит, как в TestRunner сейчас (`goToQuestion`, обработчик видимости), а дебаунс-очередь ответов не получает лишний PATCH на каждый старт"
  - "Решение исполнителя (автономно): при восстановлении сначала в очередь ставится неподтверждённая телеметрия из WAL (enqueuePending), затем добавляется визит входа; визит уходит со следующей точкой отправки"
  - "Решение исполнителя (автономно): возврат в active после неудачной отправки (failSubmit) снова открывает отрезок и тик, но визит не добавляет"
  - "Решение исполнителя (автономно): pagehide закрывает отрезок перед досылкой с keepalive, чтобы досылка несла актуальное время"
  - "Решение исполнителя (автономно): visitCount добавляется при входе в вопрос и при скрытой вкладке; отрезок времени при скрытой вкладке не открывается (в TestRunner при document.hidden визит терялся)"
  - "Решение исполнителя (автономно): navigate на текущий вопрос не добавляет визит и не трогает отрезок"
  - "Решение исполнителя (автономно): если первый тик с остатком ≤ 60 с уже имеет остаток 0, one-minute-left не показывается: сразу автосдача"
  - "Решение исполнителя (автономно): автосдача помечается в beginSubmit(auto); после неудачной автосдачи (сеть, 5xx) тик при остатке 0 второй автосдачи не даёт, повтор — кнопкой «Повторить»"
  - "Решение исполнителя (автономно): secondsLeft вычисляется при сборке снимка от session.startedAt и clock.now; без сессии или лимита — null"

requirements-completed: []

duration: 15min
completed: 2026-10-04
---

# Phase 6 Plan 07: Телеметрия по видимости вкладки, таймер экзамена, предупреждение и автосдача в модуле попытки Summary

**Модуль попытки ведёт время вопроса отрезками по `clock.now` только в `active` при видимой вкладке, считает визиты и потери фокуса через `appendQuestionTime`/`incrementQuestionVisit`/`incrementQuestionFocusLoss`, пишет каждое изменение в WAL и отправляет телеметрию сразу при переходе и скрытии вкладки; таймер тикает через шов часов, `secondsLeft` в снимке, `one-minute-left` и `submit({ auto: true })` срабатывают один раз за сессию при остатке ≤ порога, в том числе при пропущенном тике и скрытой вкладке; сброс и `dispose` снимают тик и отрезок; помощники `toggleOption` и `setMatchingPair` для 06-09**

коммит: не выполнялся (правило пользователя), изменения в рабочем дереве

## Performance

- **Duration:** ~15 min
- **Started:** 2026-10-04T18:25:35Z
- **Completed:** 2026-10-04T18:40:06Z
- **Tasks:** 3
- **Files modified:** 9 (3 новых)

## Accomplishments

- Отрезок времени: открывается при входе в `active` (старт, восстановление, `confirmStart`, сбой `/start` с закэшированной сессией, тест без лимита без сессии), при переходе и при `visible`; закрывается при переходе, `hidden`, `pagehide`, отправке и автосдаче (`beginSubmit`), `dispose`; `reset` и `init` его снимают.
- Скрытие вкладки в `active`: время до скрытия, `focusLossCount + 1`, телеметрия ставится в очередь и уходит `queue.flush()` без дебаунса. Вне `active` видимость телеметрию не трогает. `navigate` в `submitted` и `blocked` WAL и черновик не трогает (ревью C-01).
- Тик: `clock.setTimer` до следующей целой секунды остатка, только в `active` теста с лимитом и сессией, идёт при скрытой вкладке. `setInterval` в модуле нет.
- `one-minute-left` — первый тик с остатком ≤ 60 с; автосдача — первый тик с остатком ≤ 0 через `runSubmit(true)` (пишет `frozenKey`, фаза `autoSubmitting`).
- `answer-edits.ts`: `toggleOption(current, optionId)` и `setMatchingPair(current, leftId, rightId)` над `AnswerValue` пакета, без изменения исходных значений.

## TDD: сначала красный

Коммитов RED/GREEN нет (правило пользователя); порядок соблюдён по сути:

| Задача | Красный прогон до реализации | Зелёный |
|--------|------------------------------|---------|
| Task 1 (`lifecycle-time.test.ts`, 5 тестов; `testing.ts` расширен) | `Tests 4 failed \| 134 passed (138)`; на красном прошёл «скрытие вкладки в awaitingStart» (обеспечен 06-03) | 138 passed (8 файлов вместе с `telemetry.test.ts`), typecheck exit 0 |
| Task 2 (+7 тестов) | `Tests 6 failed \| 136 passed (142)`; на красном прошли «ревью C-01: navigate после сдачи» (06-05) и «тест без лимита: secondsLeft null» | 142 passed |
| Task 3 (+3 теста модуля, `answer-edits.test.ts` 4 теста) | `answer-edits.test.ts`: `Cannot find module './answer-edits'`; 3 теста модуля прошли сразу | 153 passed (9 файлов) |

Три теста Task 3 о модуле (сброс, `dispose`, закрытие отрезка в submit) прошли на первом прогоне: закрытие отрезка в `beginSubmit` и `dispose` и снятие тика в `reset` сделаны раньше, в Task 1 и Task 2, потому что без них не проходили тесты этих задач. Тесты проверены мутациями: без `closeSegment`/`stopTick` в `dispose` краснеет тест `dispose`, без сброса флагов в `reset` — тест D-05, без `leaveActive()` в `beginSubmit` — тест «submit закрывает текущий отрезок».

Трассер Task 1: `yarn workspace @bio-exam/web vitest run components/tests/attempt-lifecycle components/tests/telemetry.test.ts` выполнен целиком и был зелёным (138 passed) до начала Task 2.

## codegraph impact (D-29)

Индекс основного дерева `/Users/kdvornichenko/bio-exam` (в worktree `.codegraph/` нет).

- `codegraph impact appendQuestionTime` — 8 символов: `telemetry.ts:16`, `telemetry.test.ts`, `TestRunner.tsx` (`flushQuestionTime:473`, `doSubmit:506`, `handler:612`, `goToQuestion:484`, `TestRunner:139`). Функция не менялась.
- `codegraph impact incrementQuestionFocusLoss` — 5 символов: `telemetry.ts:42`, `telemetry.test.ts`, `TestRunner.tsx` (`handler:612`, `TestRunner:139`). Функция не менялась.
- `codegraph impact createAttemptLifecycle`: `ℹ Symbol "createAttemptLifecycle" not found` — модуль создан в 06-03 в worktree, индекс основного дерева его не знает; вызывающих вне каталога `attempt-lifecycle` нет (TestRunner переходит в 06-09).

## codegraph affected

`codegraph affected` по 9 изменённым файлам (из основного дерева), вывод:

```
Affected test files (9):

  app/web/components/tests/attempt-lifecycle/answer-edits.test.ts
  app/web/components/tests/attempt-lifecycle/answer-edits.ts
  app/web/components/tests/attempt-lifecycle/index.ts
  app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts
  app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts
  app/web/components/tests/attempt-lifecycle/lifecycle-time.test.ts
  app/web/components/tests/attempt-lifecycle/lifecycle.test.ts
  app/web/components/tests/attempt-lifecycle/lifecycle.ts
  app/web/components/tests/attempt-lifecycle/testing.ts
```

Файлы модуля не в индексе, команда вернула входной список. `telemetry.ts`, `TestRunner.tsx`, `save-queue.ts` не менялись.

## Verification

| Проверка | Итог |
|----------|------|
| Task 1: `vitest run components/tests/attempt-lifecycle components/tests/telemetry.test.ts` | 138 passed; typecheck web exit 0, `error TS` 0 |
| Task 2: `vitest run components/tests/attempt-lifecycle` | 142 passed |
| Task 3: `vitest run components/tests/attempt-lifecycle` (+ `telemetry.test.ts`) | 9 файлов, 153 passed |
| `setInterval` в `lifecycle.ts` | `ticks via clock seam` |
| `yarn verify` | `yarn verify: OK` (8 шагов passed; exam-core 605, web 857, server 1119, rbac 3; script-tests pass 166) |
| Сверка по отпечатку `before-06-07`, команда плана дословно | exit 1, вне списка: `lifecycle-restore.test.ts`, `lifecycle-submit.test.ts`, `lifecycle.test.ts` (см. Deviations, п. 1) |
| Та же сверка с этими тремя файлами в `opt` | `06-07 changed only its files`, exit 0 |
| Lint web | exit 0, предупреждений в `attempt-lifecycle` нет (предупреждения web — в чужих файлах, были до плана) |
| `oxfmt --check .` | All matched files use the correct format |

## Task Commits

Коммиты не выполнялись (правило пользователя): изменения в рабочем дереве worktree `gsd/phase-06`.

## Файлы к коммиту

- `app/web/components/tests/attempt-lifecycle/lifecycle.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle-time.test.ts`
- `app/web/components/tests/attempt-lifecycle/answer-edits.ts`
- `app/web/components/tests/attempt-lifecycle/answer-edits.test.ts`
- `app/web/components/tests/attempt-lifecycle/index.ts`
- `app/web/components/tests/attempt-lifecycle/testing.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle.test.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts`

## Deviations from Plan

### 1. Ожидания тестов 06-03 и 06-05 обновлены под настоящую телеметрию (файлы вне списка плана)

План требует, чтобы тесты 06-03 и 06-05 оставались зелёными (acceptance Task 1, `<verify>` по всему каталогу), но не перечисляет их файлы. Эти тесты записывали заглушку 06-05 «телеметрия пуста» (Known Stubs 06-05). После D-06 вход в `active` даёт `visitCount: 1` текущему вопросу, поэтому 12 тестов покраснели только на литералах телеметрии. Остальные утверждения и смысл тестов не менялись:

- `lifecycle-submit.test.ts`: тело submit в трассере и в «отправке без сессии» — `telemetry: {}` → `{ [Q1]: { timeSpentMs: 0, focusLossCount: 0, visitCount: 1 } }`; WAL в «403 на отправку» — та же телеметрия и `telemetryPending: true` (визит ещё не отправлен); «404 на отправку»: новый модуль досылает в s3 и неподтверждённую телеметрию из WAL без сессии (`['s3','s3','s3']`, тело `{ telemetry: { [Q1]: 600/0/1 } }`), тела ответов отбираются фильтром `'questionId' in body` перед прежней сортировкой.
- `lifecycle-restore.test.ts`: тело повторного submit в «ручная отправка упала сетью…» — телеметрия с визитом Q1. «ревью P-04»: новая сессия s2 в фикстуре получила `startedAt` = момент `/start` (`WITHIN_GRACE`) вместо `STARTED_AT` двенадцатиминутной давности; со старым `startedAt` у новой сессии дедлайн уже прошёл, и тик правильно её автосдавал. Утверждение «submit не вызван» осталось.
- `lifecycle.test.ts`: D-26 п. 1 — третьим телом досылается неподтверждённая телеметрия из WAL; D-26 п. 2 — `dispose` досылает ответ и телеметрию (2 вызова, второй `{ telemetry: { [Q1]: 100/0/1 } }`); ревью R-04 — переход на Q3 отправляет `{ telemetry }` в s2, чужой WAL s1 не меняется; ревью M-1 — после `dispose` и повторного `init` уходят телеметрия из `dispose`, телеметрия из WAL и ответ; «online и возврат вкладки» — после `visible` уходят ответ и телеметрия скрытия (5 вызовов вместо 4); pagehide — третьим тело телеметрии с `keepalive: true`; «скрытие вкладки…» — вторым тело `{ telemetry: { [Q1]: 0/1/1 } }`.

Не изменены, но проходят теперь другим путём два теста `lifecycle-restore.test.ts` при `WITHIN_GRACE` (дедлайн прошёл, льгота нет): «часы в пределах лимита и льготы: /start при init, s1 → active и session-restored» и «…/start вернул s2 → session-replaced…». Первый тик (задержка 0) срабатывает внутри их `settle()` и вызывает автосдачу; у фальшивого API нет ответа submit (`unexpected submit`), исход `retry`, модуль возвращается в `active` с `submitFailed: true`. Тесты этого не проверяют; проверка временной вставкой `assert.equal(fakeApi.submit.mock.calls.length, 0)` краснеет на обоих. Для s1 это поведение D-07 (строка Task 2 «восстановление после дедлайна…» покрывает его явно); у s2 фикстура, как была у P-04, даёт новой сессии `startedAt` двенадцатиминутной давности. Тесты оставлены как есть: ведущей сессии решать, нужна ли им правка фикстуры.

Решение исполнителя (автономно) по совету проверяющего: команда сверки плана выполнена дословно (exit 1, ровно эти три файла), затем с ними в `opt` — `06-07 changed only its files`.

### 2. Тесты Task 3 о модуле прошли на первом прогоне

Описано в «TDD: сначала красный»; проверены мутациями.

### 3. Форматирование

`yarn oxfmt` в worktree с несколькими путями не работает; файлы отформатированы по одному с префиксом `./`, итог проверен `oxfmt --check .`.

## Issues Encountered

- `codegraph` не инициализирован в worktree: `impact` и `affected` выполнены по индексу основного дерева; `createAttemptLifecycle` в нём нет.

## Known Stubs

- Нет в модуле. `TestRunner` модуль ещё не использует и по-прежнему ведёт телеметрию, `useCountdown` и автосдачу своими эффектами (06-09).

## Threat Flags

Нет: маршруты, тела запросов (`{ telemetry }` и конверт submit прежние), ключи `localStorage`, env-ключи и миграции не менялись. T-6-18 (двойная автосдача) закрыт флагом автосдачи на сессию и тестами D-26 п. 6 и «восстановление после дедлайна…» (`api.submit` вызван ровно один раз). T-6-17 принят: `secondsLeft` и телеметрия — только отображение и справочные данные; правило слияния `mergeTelemetryMaps` не менялось (тест восстановления 4000/9000 → 9000).

## Deferred human verification

Нет. Коммит файлов плана делает ведущая сессия.

## Next Phase Readiness

- 06-09: `TestRunner` берёт `secondsLeft` и `startedAt` из снимка вместо `useCountdown`; тост «Осталась 1 минута — тест будет сдан автоматически» рисует по уведомлению `one-minute-left`; эффекты телеметрии (`flushQuestionTime`, обработчик `visibilitychange`, эффект визита) и автосдачи удаляются, переход — `lifecycle.navigate(id)`; правки ответа — `toggleOption`, `setMatchingPair` и `lifecycle.answer`.

## Self-Check: PASSED

- FOUND: 9 файлов плана (`git status`: 6 `M`, 3 `??`)
- FOUND: .planning/commit-snapshots/before-06-07/fingerprint.json
- Коммиты: не выполнялись по правилу пользователя

## Правка ведущей сессии перед коммитом

Два теста `lifecycle-restore.test.ts` с `WITHIN_GRACE` проходили через неучтённую автосдачу. Исправлены в коммите 4027ae0:
- s1 после `/start` → `session-restored`, тик таймера запускает автосдачу (`autoSubmitting`, submit с s1);
- s2 со `startedAt` = моменту `/start` → `active`, submit не вызван.
