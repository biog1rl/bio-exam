---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 08
subsystem: api
status: complete
tags: [background-jobs, advisory-lock, deadline, reconcile-outcomes, express]
requires:
  - phase: 11-04
    provides: finalizeSessionByDeadline без владельца, sessionExpired(limit, marginSeconds), DEADLINE_FINALIZE_MAX_AGE_HOURS
  - phase: 11-06
    provides: ленивая финализация на /submit (409 с видом попытки deadline)
  - phase: 11-07
    provides: GET судьбы сессии
provides:
  - "Модуль app/server/src/services/background-jobs: createJobRunner (замок pg_try_advisory_xact_lock на прогон, расписание setTimeout после прогона с unref, stop с ожиданием) и createBackgroundJobs"
  - "Задача finalize-deadlines: 30 с, батч 50, запас 60 с, нижняя граница D-21, память сбоев 10 мин, предел прогона 20 с"
  - "Задача reconcile-outcomes: только runNow, чинит только попытки none"
  - "findSessionsDueForFinalization, closeStaleOpenSessions, FINALIZE_SETTLE_SECONDS в attempt-sessions"
  - "reconcileOutcomes({ repairOnly })"
affects: [11-09]
tech-stack:
  added: []
  patterns:
    - "Транзакция-замок только держит pg_try_advisory_xact_lock(11011, hashtext(имя)); работа задачи идёт другими соединениями пула модульного db"
    - "Фабрика задачи принимает подменные зависимости (find, finalize, closeStale, now, log) только для тестов"
key-files:
  created:
    - app/server/src/services/background-jobs/registry.ts
    - app/server/src/services/background-jobs/jobs.ts
    - app/server/src/services/background-jobs/index.ts
    - app/server/src/services/background-jobs/background-jobs.test.ts
  modified:
    - app/server/src/services/attempt-sessions/deadline.ts
    - app/server/src/services/attempt-sessions/index.ts
    - app/server/src/services/scored-attempt/outcome.ts
    - app/server/src/services/scored-attempt/outcome.test.ts
    - app/server/src/routes/tests/attempt-deadline.test.ts
decisions:
  - "JOB_LOCK_NAMESPACE = 11011; ключ замка — пара int (11011, hashtext(имя задачи)), не пересекается с одноключевыми замками картинок asset-index"
  - "Первый прогон по расписанию — через intervalMs после start(), не сразу"
  - "Registry пишет log.info с отчётом только когда в отчёте есть ненулевое значение, чтобы пустые прогоны раз в 30 с не засоряли лог"
  - "runNow неизвестного имени возвращает отклонённый промис Error('unknown job <name>'), а не бросает синхронно"
  - "Фабрики задач принимают log (finalizeDeadlinesJob — error, reconcileOutcomesJob — warn); createBackgroundJobs передаёт им log из options, по умолчанию модульный logger"
  - "reconcile-outcomes пишет log.warn со списком attemptId расхождений; отчёт — только числа { checked, mismatched, repaired }"
metrics:
  duration: 25min
  completed: 2026-10-06
actuals:
  tokens: 8600
  tasks: 3
  commits: 0
plan_head_before: ea87e8750da8d0ab5c1d6412e9eecf77580edc67
plan_head_after: ea87e8750da8d0ab5c1d6412e9eecf77580edc67
---

# Phase 11 Plan 08: Модуль фоновых задач и серверная финализация по расписанию Summary

Реестр фоновых задач API с транзакцией-замком `pg_try_advisory_xact_lock(11011, hashtext(имя))` на прогон, задача `finalize-deadlines` (30 с, батч 50, запас 60 с после льготы, нижняя граница 24 ч по D-21 с закрытием давнего хвоста, память сбоев 10 мин, предел прогона 20 с), `reconcile-outcomes` только по запросу и только для попыток `none`; серверный тест гонки GET судьбы, `runNow` и `/submit` даёт одну попытку `deadline` в каждом из пяти раундов. Модуль к `index.ts` не подключён (план 11-09).

## Что сделано

- `attempt-sessions/deadline.ts`: `FINALIZE_SETTLE_SECONDS = 60`; `findSessionsDueForFinalization(limit, excludeIds)` — `test_sessions JOIN tests`, открытая сессия, лимит не NULL, `sessionExpired(limit, FINALIZE_SETTLE_SECONDS)` и `NOT sessionExpired(limit, DEADLINE_FINALIZE_MAX_AGE_HOURS * 3600)`, `notInArray` только при непустом списке, `ORDER BY started_at LIMIT`; `closeStaleOpenSessions()` — один `UPDATE … FROM tests … RETURNING id`, `close_reason = 'expired'`, `draft_answers` не трогается, при числе > 0 `logger.info({ count, maxAgeHours })`. Своей формулы интервала нет: всё через `sessionExpired` (`make_interval` в файле — 0). `sessions.ts` не менялся: запаса `marginSeconds` с 11-04 хватило.
- `background-jobs/registry.ts`: `createJobRunner({ log, setTimer?, clearTimer? })`, типы `Job`, `JobReport`, `JobRunResult`, `JobRunner`, `JobLog`, `JobRunnerOptions`, `JOB_LOCK_NAMESPACE = 11011`. Прогон — `db.transaction` с `SELECT pg_try_advisory_xact_lock(11011::int, hashtext(name)) AS locked`; `false` → `{ skipped: 'locked' }`. Текущие прогоны — `Set` промисов, `stop()` ставит флаг, снимает таймеры, `abort()` общего `AbortController` и ждёт `Promise.allSettled`. Расписание: `setTimer(tick, intervalMs)` только для `intervalMs !== null`; `tick` ловит исключение в `log.error`, в `finally` ставит следующий таймер, если не остановлен. Таймер по умолчанию — `setTimeout` с `unref()`.
- `background-jobs/jobs.ts`: имена и константы (`FINALIZE_DEADLINES_INTERVAL_MS = 30_000`, `FINALIZE_DEADLINES_BATCH = 50`, `FINALIZE_RUN_BUDGET_MS = 20_000`, `FINALIZE_FAILURE_COOLDOWN_MS = 600_000`); `finalizeDeadlinesJob(deps)` с памятью сбоев `Map` в замыкании и отчётом `{ stale, due, finalized, expired, other, failed, timeBounded }`; `reconcileOutcomesJob()` — `reconcileOutcomes({ loadLatestScores: пустая карта, repair: true, repairOnly: 'none' })`, `intervalMs: null`.
- `background-jobs/index.ts`: `createBackgroundJobs(options)` регистрирует обе задачи; реэкспорт имён, констант, фабрик и типов.
- `scored-attempt/outcome.ts`: `reconcileOutcomes({ …, repairOnly?: ReviewStatus })` — расхождение попадает в `mismatched` всегда, чинятся только строки с сохранённым `review_status === repairOnly`; без параметра поведение прежнее (существующие тесты `outcome.test.ts` зелёные без правок).

## Отчёты runNow из тестов

| Случай | Отчёт |
|--------|-------|
| tracer: сессия 20 мин при лимите 10, первый прогон | `{ stale: 0, due: 1, finalized: 1, expired: 0, other: 0, failed: 0, timeBounded: 0 }` |
| tracer: повторный прогон | все поля 0 |
| запас: 12 мин 30 с при лимите 10 (льгота кончилась, запас нет) | все поля 0, сессия открыта, клиентская `submitAttempt` → `created`, `submit_source = 'client'` |
| D-21: 25 ч 12 мин и 23 ч 12 мин | `{ stale: 1, due: 1, finalized: 1, … }`; давняя закрыта `expired`, черновик в строке, попыток нет; свежая — попытка `deadline` |
| батч из трёх с сигналом после первой | `{ due: 3, finalized: 1, … }`, у трёх сессий одна попытка |
| память сбоев (подмены) | `{ due: 2, finalized: 1, failed: 1, … }`; следующий `find` получает `excludeIds = ['A']`; после сдвига часов на 600 000 мс — `[]` |
| предел прогона (подмены) | `{ due: 3, finalized: 1, timeBounded: 1, … }`, `finalize` вызван один раз |
| `runNow('reconcile-outcomes')`: испорченная `none` + `graded` | `{ checked: 2, mismatched: 2, repaired: 1 }`, строка `graded` не изменилась |
| замок двух исполнителей | второй `runNow` → `{ skipped: 'locked' }`, после освобождения → отчёт задачи |

Проверка теста запаса мутацией: при `FINALIZE_SETTLE_SECONDS = 0` случай «запас после льготы» падает, при 60 — зелёный (значение возвращено).

## TDD

- Task 3, `repairOnly`: RED — два новых теста `outcome.test.ts` упали до правки (`repaired 3 !== 1`: без параметра починка возвращала `graded` в `pending`; отчёт задачи `repaired: 0` при `repair: false`). GREEN — после `repairOnly` в `reconcileOutcomes` и `repair: true, repairOnly: 'none'` в задаче: 14/14.
- Task 2: случаи `<behavior>` написаны поверх реализации Task 1 и прошли сразу, кроме одного: `runNow('missing-job')` бросал синхронно вместо отклонённого промиса — `runNow` сделан `async`.
- Коммиты RED/GREEN не делались: правило фазы — коммитит только ведущая сессия.

## CodeGraph

В worktree `.codegraph/` нет; запросы шли к индексу основного checkout (только чтение).
- `codegraph impact reconcileOutcomes` → 2 символа: `reconcileOutcomes` (`outcome.ts`), `scored-attempt/index.ts`. Других вызывающих нет.
- `codegraph impact sessionExpired` (не менялся, только новые вызовы) → 16 символов: `startAttemptSession`, `saveSessionDraft`, `finalizeOnce`, `finalizeSessionByDeadline`, `finalizeExpiredOpenSession`, `precheckSubmit`, маршруты `/start`, `PATCH …/answers`, `/submit`, `e2e-seed.ts`.
- `codegraph affected deadline.ts index.ts outcome.ts` → «Affected test files (1): app/server/src/routes/tests/public.ts»; индекс не связывает тесты с сервисами, поэтому прогнан полный серверный набор.

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/background-jobs/background-jobs.test.ts` — 10 passed.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/scored-attempt/outcome.test.ts src/routes/tests/attempt-deadline.test.ts src/services/background-jobs/background-jobs.test.ts` — 3 файла, 69 passed.
- Тест гонки отдельно (`-t "гонка"`) прогнан ещё три раза подряд — зелёный каждый раз.
- `yarn workspace @bio-exam/server typecheck`, `lint` — без ошибок (одно прежнее предупреждение `no-control-regex` в `storage/keys.ts`).
- Acceptance-grep: `pg_try_advisory_xact_lock` в `registry.ts` — 1; `FINALIZE_SETTLE_SECONDS` в `deadline.ts` — 2; `DEADLINE_FINALIZE_MAX_AGE_HOURS` — 6; `make_interval` — 0; `FINALIZE_RUN_BUDGET_MS|FINALIZE_FAILURE_COOLDOWN_MS` в `jobs.ts` — 4; `unref` — 1; в `background-jobs.test.ts` есть `skipped`, `stop()`, `aborted`, `setTimer`, `stale`, `excludeIds`, `timeBounded`; `repairOnly` в `outcome.ts` и `jobs.ts`; `runNow` и цикл на 5 раундов в `attempt-deadline.test.ts`; `grep -rn --exclude='*.test.ts' "services/background-jobs" app/server/src/app.ts app/server/src/routes` — пусто.
- `yarn verify` — `yarn verify: OK` с первого прогона (все шаги passed, включая `format-check` и `lint-typecheck-test`); серверный набор в нём — 102 файла, 2023 теста passed. Отдельный `with-test-db … server test` не повторялся: тот же набор прошёл внутри `yarn verify`.
- `11-plan-files.cjs check 11-08` не запускался: в режиме worktree сверку делает ведущая сессия.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] runNow неизвестного имени бросал синхронно**
- **Found during:** Task 2
- **Issue:** `runNow('missing-job')` выбрасывал исключение до создания промиса, `assert.rejects` его не ловил; вызывающий (`jobs:run` в 11-09) получил бы синхронный throw.
- **Fix:** `runNow` объявлен `async`.
- **Files modified:** `app/server/src/services/background-jobs/registry.ts`

**2. [Rule 2 - Missing] Логгер в фабриках задач**
- **Found during:** Task 1
- **Issue:** В `<interfaces>` у `finalizeDeadlinesJob(deps)` нет логгера, а `log.error` с id сессии нужен; модульный `logger` шумел бы в тестах с подменами.
- **Fix:** необязательный `log` в `deps` обеих фабрик; `createBackgroundJobs` передаёт им `options.log`, по умолчанию модульный `logger`. `reconcile-outcomes` пишет `log.warn` со списком `attemptId` расхождений (отчёт — только числа).
- **Files modified:** `app/server/src/services/background-jobs/jobs.ts`, `index.ts`

### Прочее

- Коммиты задач, RED/GREEN и итоговый docs-коммит не делались (правило фазы: коммитит ведущая сессия); `commits: 0` — изменения в рабочем дереве worktree.
- `runNow('finalize-deadlines')` в тесте гонки обрабатывает все просроченные сессии базы файла `attempt-deadline.test.ts`, оставленные ранними случаями; на проверки гонки это не влияет — они смотрят на строки своей сессии.

## Число серверных тестов

До плана — 2010 (по 11-07-SUMMARY; 11-10…11-12 серверных тестов не добавляли). Добавлено 13: 10 в `background-jobs.test.ts`, 2 в `outcome.test.ts`, 1 в `attempt-deadline.test.ts`. После — 2023 (102 файла).

## Файлы к коммиту

```
 M app/server/src/routes/tests/attempt-deadline.test.ts
 M app/server/src/services/attempt-sessions/deadline.ts
 M app/server/src/services/attempt-sessions/index.ts
 M app/server/src/services/scored-attempt/outcome.test.ts
 M app/server/src/services/scored-attempt/outcome.ts
?? app/server/src/services/background-jobs/
?? .planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-08-SUMMARY.md
```

## Known Stubs

Нет.

## Threat Flags

Нет: новых маршрутов и точек входа нет; угрозы T-11-24…T-11-28, T-11-61, T-11-62 закрыты тестами плана.

## Self-Check: PASSED

Файлы `registry.ts`, `jobs.ts`, `index.ts`, `background-jobs.test.ts` на месте; коммитов плана нет по правилу фазы (HEAD = ea87e87 = dev).
