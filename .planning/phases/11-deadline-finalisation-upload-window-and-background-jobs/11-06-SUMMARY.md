---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 06
subsystem: api
status: complete
tags: [attempt-sessions, deadline, finalization, submit, express]
requires:
  - phase: 11-04
    provides: finalizeSessionByDeadline, sessionExpired с запасом, DEADLINE_FINALIZE_MAX_AGE_HOURS
  - phase: 11-03
    provides: readAttemptView с uploadClosesAt и submitSource
provides:
  - Ленивая финализация на /submit, /start и PATCH черновика
  - Тело 409 ATTEMPT_ALREADY_SUBMITTED с видом попытки deadline
  - serverNow в ответе 200 PATCH черновика
  - finalizeExpiredOpenSession, SessionNeedsFinalizationError, databaseNow
affects: [11-12, 11-13, 11-07]
tech-stack:
  added: []
  patterns:
    - "Финализация только из маршрута, вне транзакций startAttemptSession и saveSessionDraft; транзакция старта сигналит ошибкой SessionNeedsFinalizationError"
key-files:
  created: []
  modified:
    - app/server/src/routes/tests/public.ts
    - app/server/src/services/attempt-sessions/sessions.ts
    - app/server/src/services/attempt-sessions/deadline.ts
    - app/server/src/services/attempt-sessions/index.ts
    - app/server/src/routes/tests/attempt-time-limit.test.ts
    - app/server/src/routes/tests/attempt-deadline.test.ts
decisions:
  - "SaveSessionDraftResult стал объединением объектов по kind: saved с serverNow, not_found, invalid"
  - "sendAlreadySubmitted читает вид попытки и по submitSource выбирает тело: deadline — расширенное, client — прежнее { error, attemptId }"
  - "openSessionOf экспортирован из sessions.ts (без реэкспорта в index.ts) для finalizeExpiredOpenSession"
metrics:
  duration: 10min
  completed: 2026-10-06
actuals:
  tokens: 19000
  tasks: 3
  commits: 0
plan_head_before: 1ebc6e4e35747477d94585141371d48568215a52
plan_head_after: 1ebc6e4e35747477d94585141371d48568215a52
---

# Phase 11 Plan 06: Ленивая финализация в маршрутах попытки Summary

`/submit`, `/start` и PATCH черновика, попав на сессию за льготой, финализируют её `finalizeSessionByDeadline` вне чужих транзакций; сдача после серверной финализации получает 409 с видом попытки и `submitSource: 'deadline'`, PATCH 200 несёт `serverNow`.

## Что сделано

- `sessions.ts`: `databaseNow()` (поверх `readServerNow(db)`); `SessionNeedsFinalizationError(sessionId)` — бросается из транзакции `startAttemptSession`, когда открытая сессия просрочена, черновик непуст и сессия не давняя (`stale = sessionExpired(limit, DEADLINE_FINALIZE_MAX_AGE_HOURS * 3600)`); давняя или пустая закрывается `expired`, как раньше. `saveSessionDraft` получил обязательный `timeLimitMinutes` и `NOT sessionExpired(limit)` в выборке под `FOR UPDATE`; результат `{ kind: 'saved', serverNow } | { kind: 'not_found' } | { kind: 'invalid', violation }`.
- `deadline.ts`: `finalizeExpiredOpenSession({ testId, userId, timeLimitMinutes })` — без лимита или без просроченной открытой сессии пары `null`, иначе `finalizeSessionByDeadline(id, { testId, userId })`.
- `public.ts`: помощник `sendAlreadySubmitted(res, attemptId, viewer)` заменил `attemptAlreadySubmitted` во всех трёх местах `/submit`; ветка `expired` вызывает финализацию вместо `closeExpiredSession` (импорт убран); `/start` — `finalizeExpiredOpenSession`, затем `startAfterFinalization` (ловит `SessionNeedsFinalizationError`, финализирует, один повтор); PATCH — `not_found` у теста с лимитом финализирует сессию и отвечает прежним 404, `saved` → `{ ok: true, serverNow }`.
- `index.ts`: реэкспорт `databaseNow`, `SessionNeedsFinalizationError`, `finalizeExpiredOpenSession`.

## Путь → исход → ответ

| Путь | Состояние сессии | Исход | Ответ |
|------|------------------|-------|-------|
| `/submit` | за льготой, черновик непуст | `finalized` | 409 `{ error, attemptId, submitSource: 'deadline', uploadClosesAt, serverNow, attempt }` |
| `/submit` | за льготой, черновик пуст (D-04) | `expired`, сессия закрыта | 422 `{ error: 'TIME_EXPIRED' }` |
| `/submit` | за льготой, давняя (D-21) | `expired`, черновик в строке | 422 `{ error: 'TIME_EXPIRED' }` |
| `/submit` | за льготой, `superseded`/`not_found` после финализации | — | 404 `Session not found` |
| `/submit` | сдана сервером, другой `clientAttemptId` | precheck `submitted` | 409 с телом deadline |
| `/submit` | сдана клиентом (другая вкладка) | precheck `submitted` | 409 `{ error, attemptId }` (прежнее) |
| `/submit` | тот же `clientAttemptId` | `sameClient` | 200 вид попытки, без `serverNow` |
| `/submit` | `submitAttempt` → `conflict` | — | 409 тем же помощником (deadline или прежнее тело) |
| `/start` | за льготой, черновик непуст | `finalizeExpiredOpenSession` → `finalized` | 200 новая сессия, прежняя — попытка deadline |
| `/start` | за льготой, черновик пуст / давняя / ошибка данных (R3) | `expired` | 200 новая сессия, прежняя закрыта `expired`, попыток 0 |
| `/start` | стала просроченной между финализацией и стартом | `SessionNeedsFinalizationError` → финализация → повтор | 200 новая сессия |
| `/start` | без лимита (D-03) | `null` | 200 та же сессия |
| PATCH | в льготе | `saved` | 200 `{ ok: true, serverNow }` |
| PATCH | за льготой | `not_found` → финализация | 404 `Session not found or already submitted`, ответ не записан |
| PATCH | закрыта / сдана | `not_found` → финализация отдаёт текущую судьбу без изменений | 404 прежний текст |
| PATCH | без лимита (D-03) | `saved`, финализации нет | 200 |

## codegraph

- `codegraph impact attemptAlreadySubmitted`: только `public.ts` (маршрут `POST /submit`).
- `codegraph impact precheckSubmit`: `submit.ts`, `public.ts` (`POST /submit`), `attempt-sessions/index.ts`.
- `codegraph impact saveSessionDraft`: `sessions.ts`, `public.ts` (`PATCH …/answers`), `attempt-sessions/index.ts` — единственный вызывающий, поэтому форма результата сменена на объединение по `kind`.
- `codegraph impact startAttemptSession`: `public.ts` (`POST /start`), `scripts/e2e-seed.ts` (вызывает с `timeLimitMinutes: null`, ошибку не получает).
- `codegraph affected` по четырём исходным файлам плана вернул только `public.ts` (индекс без `.codegraph/` в worktree); тесты выбраны по маршрутам: `attempt-deadline`, `attempt-time-limit`, `route-inventory.snapshot`, затем полный серверный набор.

## TDD Task 2

- Красный (после переписи `:82`, `:145`, `:157` и новых случаев, до правок кода): `Tests 4 failed | 38 passed (42)`. Упали: «в пределах льготы /start … за льготой сдаёт её по черновику», оба случая «PATCH за льготой отвечает 404 и не пишет ответ», «PATCH в сессию, сданную сервером на /start за льготой». Новые D-21 и R3 на `/start` проходили уже на старом коде: прежний `/start` закрывал любую просроченную сессию без попытки, и их ожидания (закрыта `expired`, попыток 0) совпадают.
- Зелёный (после правок `sessions.ts`, `deadline.ts`, `public.ts`): `Test Files 2 passed (2)`, `Tests 42 passed (42)`.

## Проверки

- Task 1: `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/attempt-deadline.test.ts src/routes/tests/attempt-time-limit.test.ts` — 35 тестов зелёные; тест `:284` (пустой черновик → 422) без правок.
- Task 3: тот же запуск плюс `src/routes/route-inventory.snapshot.test.ts` — 3 файла, 51 тест зелёные; снимок маршрутов прежний.
- `yarn workspace @bio-exam/server typecheck` — без ошибок.
- Полный серверный набор: до плана 101 файл, 1984 теста; после — 101 файл, 1999 тестов (+15), всё зелёное. `attempt-submit.test.ts` и `attempt-races.test.ts` без правок и зелёные.
- `yarn verify: OK` с первого прогона, все шаги passed.
- Acceptance: `sendAlreadySubmitted` в `public.ts` — 4; `closeExpiredSession` — 0; `finalizeExpiredOpenSession` — 2; `SessionNeedsFinalizationError` — 2; `serverNow` — 2; в `sessions.ts` нет `finalizeSessionByDeadline|finalizeExpiredOpenSession`, `DEADLINE_FINALIZE_MAX_AGE_HOURS` — 2; `attempt-deadline.test.ts` содержит `'mystery'` и `25 hours`.

## Deviations from Plan

1. **[Rule 2 - тест] Сервисная проверка веток `startAttemptSession`.** Путь `SessionNeedsFinalizationError` через маршрут — гонка, которую HTTP-тест не воспроизводит: `finalizeExpiredOpenSession` закрывает сессию раньше. Добавлен `test.each` на сервис: черновик и 13 минут → ошибка с `sessionId`, база не меняется (откат); черновик и 25 ч 12 мин → закрыта `expired`; пустой черновик → закрыта `expired`.
2. **Формулировка `:145` из плана («с ответом — попытка deadline, без — закрыта expired»)** сделана `test.each` на два случая.
3. **`11-plan-files.cjs check 11-06` не запускался**: правила режима worktree это запрещают, сверку делает ведущая сессия.
4. Коммитов нет (правила фазы); `actuals.commits: 0` при изменениях в рабочем дереве — ожидаемо в этом режиме.

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей: тело 409 строится `readAttemptView` с viewer ученика (T-11-17), `attemptId` берётся из сессии пары или по `(user_id, client_attempt_id)`; все ленивые вызовы передают владельца `{ testId, userId }` после `checkAttemptAccess` (T-11-19); запись черновика за льготой закрыта условием в выборке под `FOR UPDATE` (T-11-18); финализация не вызывается из транзакций (T-11-20); R3 на `/start` закреплён тестом (T-11-60).

## Файлы к коммиту

- app/server/src/routes/tests/public.ts
- app/server/src/services/attempt-sessions/sessions.ts
- app/server/src/services/attempt-sessions/deadline.ts
- app/server/src/services/attempt-sessions/index.ts
- app/server/src/routes/tests/attempt-time-limit.test.ts
- app/server/src/routes/tests/attempt-deadline.test.ts
- .planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-06-SUMMARY.md

## Self-Check: PASSED

Все шесть файлов изменены (`git status --short`), SUMMARY записан; коммитов по правилам фазы нет.
