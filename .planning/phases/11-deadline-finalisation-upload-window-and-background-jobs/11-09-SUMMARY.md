---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 09
subsystem: api
status: complete
tags: [shutdown, background-jobs, entry-point, jobs-run, express]
requires:
  - phase: 11-08
    provides: createBackgroundJobs({ log }) с start, stop, runNow, names; замок pg_try_advisory_xact_lock на прогон
provides:
  - "lib/shutdown.ts: createShutdown, SHUTDOWN_DRAIN_MS = 25 000, ShutdownDeps — дренаж запросов и задач до закрытия пула, предел с closeAllConnections, повторный сигнал exit(1)"
  - "index.ts только связывает listen, старт задач в колбэке listen и SIGTERM/SIGINT → shutdown"
  - "Команда yarn workspace @bio-exam/server jobs:run <имя>: отчёт и код 0, неизвестное имя — список и код 1, занятый замок — код 75"
  - "PG_POOL_MAX: '4' у Express в e2e/playwright.config.ts"
affects: [11-15, 11-16, 11-17, 11-18]
tech-stack:
  added: []
  patterns:
    - "Остановка как модуль с внедрёнными server, jobs, pool, log, exit: тестируется на отдельном express-приложении без базы"
key-files:
  created:
    - app/server/src/lib/shutdown.ts
    - app/server/src/lib/shutdown.test.ts
    - app/server/src/scripts/jobs-run.ts
  modified:
    - app/server/src/index.ts
    - app/server/package.json
    - app/server/README.md
    - e2e/playwright.config.ts
decisions:
  - "jobs.start() вызывается в колбэке app.listen: задачи не стартуют, если порт не открылся"
  - "Тип лога остановки — двухаргументный LogFn, как JobLog из 11-08; 'shutdown complete' пишется как log.info({ signal }, 'shutdown complete')"
  - "jobs:run без аргумента или с лишними аргументами — ошибка использования со списком задач и код 1"
metrics:
  duration: ~15 мин
  completed: 2026-10-06
actuals:
  tokens: 6500
  tasks: 3
  commits: 0
plan_head_before: ad6edd6fd0cd12cbab914c09020ad273dab00cd7
plan_head_after: ad6edd6fd0cd12cbab914c09020ad273dab00cd7
---

# Phase 11 Plan 09: Остановка с дренажом, задачи в точке входа и jobs:run Summary

Остановка API по `SIGTERM`/`SIGINT` дожидается запросов в полёте и `jobs.stop()` до 25 с, затем закрывает пул и выходит с 0. `index.ts` стартует фоновые задачи после `listen`. Команда `jobs:run` выполняет задачу один раз и выходит с кодом 0, 1 или 75.

## Что сделано

- `app/server/src/lib/shutdown.ts`: `createShutdown(deps)` — первый вызов ставит флаг, повторный пишет `log.warn` и вызывает `exit(1)` до первого `await`. `server.close(cb)` в промис, `closeIdleConnections()` раз в `reapIntervalMs` (по умолчанию 1000) до срабатывания `close`, параллельно `jobs.stop()` (ошибка — в `log.error`). Гонка «оба завершились» против таймера `drainMs`; оба таймера снимаются при любом исходе. По пределу — `log.warn({ signal, drainMs })` и `closeAllConnections()`. Затем `pool.end()` (ошибка — в лог), `log.info({ signal }, 'shutdown complete')`, `exit(0)`. Модуль не импортирует базу и приложение.
- `app/server/src/lib/shutdown.test.ts`: четыре случая на `http.createServer(express())` без базы: запрос в полёте получает 200, новое соединение отклонено (`fetch` бросает), `pool.end` один раз после «response sent» и «jobs stopped», `exit(0)`; `jobs.stop`, завершившийся позже ответа, задерживает `pool.end` и `exit`; предел 200 мс — `closeAllConnections`, `pool.end`, `exit(0)`, `log.warn` с `drainMs`, запрос в полёте оборван; второй сигнал — `exit(1)` сразу, потом первый завершается `exit(0)`.
- `app/server/src/index.ts` переписан: `createBackgroundJobs({ log: logger })`, `app.listen` со старой строкой лога и `jobs.start()` в колбэке, `createShutdown({ server, jobs, pool: pgPool, drainMs: SHUTDOWN_DRAIN_MS, log: logger, exit: (code) => process.exit(code) })`, `process.on('SIGTERM' | 'SIGINT')`. Прежний `pgPool.end()` сразу после `server.close` и выход через 5 с убраны.
- `e2e/playwright.config.ts`: `PG_POOL_MAX: '4'` в `env` первого `webServer` (Express).
- `app/server/src/scripts/jobs-run.ts` по образцу `storage-reconcile.ts`: `import '../config/env.js'` первым, ровно одно имя, проверка по `names()` до `runNow`, `{ skipped: 'locked' }` → `process.exitCode = 75`, отчёт строками `[jobs-run] <имя> <ключ>=<значение>`, `pgPool.end()` в `finally`, `start()` не вызывается.
- `app/server/package.json`: `"jobs:run": "tsx src/scripts/jobs-run.ts"` после `storage:reconcile`.
- `app/server/README.md`, раздел «Запуск и миграции»: строка `jobs:run finalize-deadlines` в блоке команд, задачи `finalize-deadlines` и `reconcile-outcomes`, замок в базе, коды 1 и 75, команда для собранного образа, порядок остановки с пределом 25 с.

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/lib/shutdown.test.ts` — `Test Files 1 passed (1)`, `Tests 4 passed (4)`. Проверка трассера после Task 1: тот же файл повторно зелёный в составе полного набора.
- `yarn workspace @bio-exam/server typecheck` — код 0, без `error TS`.
- Дымовая проверка точки входа (команда из `<verify>` Task 2, `node --import tsx src/index.ts`, `NODE_ENV=development`, `PORT=4199`, `PG_POOL_MAX=4`, одноразовая база) — код 0; `/healthz` ответил: между «API started» и `SIGTERM` 327 мс, а без ответа цикл ожидания шёл бы около 40 с:

```
{"level":30,...,"port":4199,"msg":"bio-exam API started"}
{"level":30,...,"signal":"SIGTERM","msg":"shutdown started"}
{"level":30,...,"signal":"SIGTERM","msg":"shutdown complete"}
```

- `jobs:run` на одноразовой базе после миграций (команда из `<verify>` Task 3) — код 0:

```
[jobs-run] finalize-deadlines stale=0
[jobs-run] finalize-deadlines due=0
[jobs-run] finalize-deadlines finalized=0
[jobs-run] finalize-deadlines expired=0
[jobs-run] finalize-deadlines other=0
[jobs-run] finalize-deadlines failed=0
[jobs-run] finalize-deadlines timeBounded=0
[jobs-run] unknown job no-such-job; known: finalize-deadlines, reconcile-outcomes
```

  Дополнительно: без аргумента — `[jobs-run] failed Error: usage: jobs:run <name>; known: finalize-deadlines, reconcile-outcomes`, код 1; `reconcile-outcomes` — `checked=0`, `mismatched=0`, `repaired=0`, код 0; при замке, который держит другое соединение (`pg_advisory_lock(11011, hashtext('finalize-deadlines'))`), — `[jobs-run] finalize-deadlines: skipped, another instance holds the lock`, код 75.
- Импортёры модуля задач (`grep -rln "background-jobs" app/server/src --include='*.ts' | grep -v services/background-jobs/`): `app/server/src/index.ts`, `app/server/src/scripts/jobs-run.ts`, тесты фазы 11 `app/server/src/routes/tests/attempt-deadline.test.ts` и `app/server/src/services/scored-attempt/outcome.test.ts` (последний импортирует задачу `reconcile-outcomes` с 11-08). `app.ts` и `scripts/apply-migration.ts` модуль не импортируют.
- `codegraph affected app/server/src/lib/shutdown.ts app/server/src/index.ts app/server/src/scripts/jobs-run.ts` — «No test files affected by the changed files.» В worktree нет своего `.codegraph/`, команда читает индекс основного checkout, где новых файлов нет; поэтому прогнан полный серверный набор.
- Серверный набор: до плана — `Test Files 102 passed (102)`, `Tests 2023 passed (2023)`; после (внутри `yarn verify`) — `Test Files 103 passed (103)`, `Tests 2027 passed (2027)` (+1 файл, +4 теста). Отдельный `with-test-db … server test` не повторялся: тот же набор прошёл в `yarn verify`.
- `yarn verify` — `yarn verify: OK` с первого прогона, все шаги passed (в том числе `docs-commands`, `env-contract`, `format-check`, `lint-typecheck-test`).
- `yarn format:check` — входит в `yarn verify` (шаг `format-check`); файлы плана отформатированы `yarn exec oxfmt` по списку.
- `11-plan-files.cjs check 11-09` не запускался: в режиме worktree сверку делает ведущая сессия.

## Шаг пользователя (в «Шаги пользователя» плана 11-18)

`stop_grace_period` сервиса `api` в Compose — не меньше 30 с (дренаж до 25 с, по умолчанию Compose ждёт 10 с), `stop_signal` не переопределён. Иначе Docker убьёт процесс `SIGKILL` до конца дренажа.

## Deviations from Plan

- `jobs.start()` вызывается в колбэке `app.listen`, а не следующей строкой после него: при ошибке открытия порта задачи не стартуют. Связка `createBackgroundJobs({ log: logger })` → `start()` после `listen` сохранена.
- `log.info('shutdown complete')` из плана записан как `log.info({ signal }, 'shutdown complete')`: тип лога — двухаргументный, как `JobLog` из 11-08; строка в логе та же.
- Повторный сигнал перед `exit(1)` пишет `log.warn`.
- Список импортёров содержит ещё `outcome.test.ts` (тест 11-08 задачи `reconcile-outcomes`) — тест фазы 11, критерий допускает тесты фазы.
- Сверка `11-plan-files.cjs check 11-09` и коммиты не выполнялись по правилам режима worktree.

## Наблюдение (не исправлялось)

Реестр 11-08 пишет `log.info('background job run')` и для результата `{ skipped: 'locked' }` (`isEventful` считает строку `'locked'` ненулевой). На втором экземпляре API это будет строка лога на каждый тик, если задачу держит первый. Поведение реестра вне файлов плана.

## Known Stubs

Нет.

## Файлы к коммиту

- app/server/src/lib/shutdown.ts
- app/server/src/lib/shutdown.test.ts
- app/server/src/index.ts
- e2e/playwright.config.ts
- app/server/src/scripts/jobs-run.ts
- app/server/package.json
- app/server/README.md

Предлагаемое сообщение коммита: `feat: Остановка API с дренажом запросов и фоновых задач до 25 с перед закрытием пула, повторный сигнал — выход 1, старт задач из точки входа после listen, команда jobs:run с кодами 0, 1 и 75, PG_POOL_MAX 4 у Express в e2e, раздел README о задачах и остановке`

## Self-Check: PASSED

Файлы плана на месте (4 изменённых, 3 новых), коммитов нет по правилам режима worktree, HEAD = dev (ad6edd6).
