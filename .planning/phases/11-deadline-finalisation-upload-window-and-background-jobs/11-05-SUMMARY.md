---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 05
subsystem: api
tags: [upload-window, attempt-sessions, clock_timestamp, exam-core]
requires:
  - phase: 11-03
    provides: tests.photo_upload_window_minutes, test_attempts.upload_closes_at, помощники test-support shiftStartedAt и insertOpenQuestion
  - phase: 11-01
    provides: UPLOAD_WINDOW_ERROR_CODES, UPLOAD_WINDOW_REFUSAL_STATUS, UploadWindowRefusalSchema
provides:
  - uploadWindowState (чистое ядро правила окна дозагрузки фото)
  - photoUploadWindow (чтение сессии, теста и попытки с clock_timestamp() одним запросом)
  - uploadWindowRefusal (422 с UPLOAD_WINDOW_CLOSED или UPLOAD_WINDOW_NONE)
affects: [11-04, фаза 12, фаза 13]
actuals:
  tokens: 3800
  tasks: 2
  commits: 0
tech-stack:
  added: []
  patterns:
    - момент решения берётся из базы через clock_timestamp() в том же запросе, что строки сессии, теста и попытки
key-files:
  created:
    - app/server/src/services/attempt-sessions/upload-window.ts
    - app/server/src/services/attempt-sessions/upload-window.test.ts
  modified:
    - app/server/src/services/attempt-sessions/index.ts
key-decisions:
  - "photoUploadWindow строку не блокирует: маршрут фазы 12 вызывает её внутри своей транзакции после FOR UPDATE сессии, поэтому момент берётся clock_timestamp(), а не now() начала транзакции"
  - "Граница строгая: момент, равный границе, считается закрытым (now < граница — открыто)"
  - "Сданная сессия, у которой попытка исчезла (attempt_id стал NULL), даёт no_window"
requirements-completed: [TIME-04]
status: complete
---

# Phase 11 Plan 05: правило окна дозагрузки фото Summary

Одна серверная функция `photoUploadWindow` решает по времени базы (`clock_timestamp()` в том же запросе, что строки `test_sessions`, `tests`, `test_attempts`), принимается ли фото сейчас, а `uploadWindowRefusal` даёт 422-тело с кодом из exam-core; маршрутов фото в фазе нет.

## Что сделано

- Task 1 (tracer): `upload-window.ts` с `uploadWindowState`, `photoUploadWindow`, `uploadWindowRefusal` и типами `UploadWindowInput`, `UploadWindowState`, `UploadWindowExecutor` (`DB` или транзакция); реэкспорт в `index.ts`; интеграционный тест открытой сессии с лимитом 10 минут: `closesAt` = `started_at + 25 минут` с точностью до секунды.
- Task 2: табличные тесты ядра (11 случаев) и отказа (4 случая) без базы; интеграционные случаи на одноразовой базе: граница открытой сессии за секунду до и после, граница `upload_closes_at` сданной попытки до и после, тест без открытого вопроса (`no_window`), сессии `expired` и `superseded` (`session_closed`), несуществующий id (`null`), вызов внутри транзакции после `pg_sleep(2)` (момент по `clock_timestamp()`, а не по началу транзакции). Тело отказа в базовых случаях проходит `UploadWindowRefusalSchema`.

## Правило (вход -> решение)

| Вход | Решение | Отказ |
| --- | --- | --- |
| `closedAt` без `submittedAt` (`expired`, `superseded`) | закрыто, `session_closed` | 422 `UPLOAD_WINDOW_NONE`, `uploadClosesAt: null` |
| сдана, `uploadClosesAt` NULL | закрыто, `no_window` | 422 `UPLOAD_WINDOW_NONE`, `uploadClosesAt: null` |
| сдана, `now < uploadClosesAt` | открыто до `uploadClosesAt` | нет |
| сдана, `now >= uploadClosesAt` | закрыто, `window_closed` | 422 `UPLOAD_WINDOW_CLOSED`, `uploadClosesAt` в ISO |
| открыта, без лимита | открыто, `closesAt: null` | нет |
| открыта, с лимитом, `now < startedAt + лимит + окно` | открыто до границы | нет |
| открыта, с лимитом, `now >= границы` (окно 0 — граница в конце таймера) | закрыто, `window_closed` | 422 `UPLOAD_WINDOW_CLOSED`, `uploadClosesAt` в ISO |

## Решение о блокировке

Функция строку не блокирует. Маршрут фазы 12 вызывает её внутри своей транзакции после `FOR UPDATE` сессии; поэтому момент берётся `clock_timestamp()`, а не `now()` (время начала транзакции устаревает после ожидания блокировки, RESEARCH Pattern 5). Тест с `pg_sleep(2)` внутри транзакции подтверждает, что граница считается по текущему моменту.

## codegraph affected

```
Affected test files (1):

  app/server/src/services/attempt-sessions/upload-window.test.ts
```

Новые файлы пока никто не вызывает, кроме реэкспорта в `index.ts`.

## Проверки

- `upload-window.test.ts`: 26 тестов зелёные.
- Серверный набор: до плана 1944 теста (1970 минус 26 новых), после — 1970 тестов в 101 файле, всё зелёное.
- `yarn verify: OK` (lockfile, env-contract, docs-commands, ci-workflow, format-check, lint-typecheck-test, migrations, script-tests).
- `11-plan-files.cjs check` в режиме worktree не запускался по правилам фазы; ведущая сессия делает сверку.

## Deviations from Plan

Task 1 и Task 2 выполнены одним проходом: тесты обеих задач лежат в одном файле, tracer-тест входит в интеграционный набор. Отклонений от смысла плана нет.

## Known Stubs

Нет.

## Threat Flags

Нет: новых сетевых точек, путей авторизации и схем нет; маршрутов фото фаза не добавляет.

## Файлы к коммиту

- `app/server/src/services/attempt-sessions/upload-window.ts`
- `app/server/src/services/attempt-sessions/upload-window.test.ts`
- `app/server/src/services/attempt-sessions/index.ts`
- `.planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-05-SUMMARY.md`

## Self-Check: PASSED

Файлы созданы, `yarn verify: OK` на финальном состоянии файлов; коммитов нет по правилам фазы (`commits: 0`).
