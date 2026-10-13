---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 07
subsystem: api
status: complete
tags: [attempt-sessions, deadline, session-fate, express]
requires:
  - phase: 11-06
    provides: ленивая финализация на /submit, /start, PATCH; databaseNow; sendAlreadySubmitted
  - phase: 11-04
    provides: finalizeSessionByDeadline с владельцем, D-21 и R3 → expired
  - phase: 11-01
    provides: SessionFateSchema в exam-core
provides:
  - "GET /api/tests/public/tests/:id/sessions/:sessionId — судьба сессии open | submitted | expired по SessionFateSchema"
  - "readSessionFate и тип SessionFateRead в services/attempt-sessions"
affects: [11-13, 11-14]
tech-stack:
  added: []
  patterns:
    - "Чтение судьбы сессии всегда идёт через finalizeSessionByDeadline с владельцем запроса: чтение просроченной сессии финализирует её лениво"
key-files:
  created: []
  modified:
    - app/server/src/services/attempt-sessions/deadline.ts
    - app/server/src/services/attempt-sessions/index.ts
    - app/server/src/routes/tests/public.ts
    - app/server/route-inventory.txt
    - app/server/src/routes/tests/attempt-deadline.test.ts
decisions:
  - "readSessionFate для open перечитывает started_at тем же фильтром sessionWhere(sessionId, owner); строки нет — missing"
  - "submitted без attemptId (попытка удалена) отдаётся как missing → 404"
metrics:
  duration: 8min
  completed: 2026-10-06
actuals:
  tokens: 9000
  tasks: 3
  commits: 0
plan_head_before: ea725549331f723aa96db6e32124874e51323226
plan_head_after: ea725549331f723aa96db6e32124874e51323226
---

# Phase 11 Plan 07: Судьба сессии Summary

Новый `GET /api/tests/public/tests/:id/sessions/:sessionId` отдаёт странице судьбу её сессии (`open`, `submitted` с видом попытки и окном для фото, `expired`) и по пути лениво финализирует просроченную через `finalizeSessionByDeadline` с владельцем запроса.

## Что сделано

- `deadline.ts`: `readSessionFate({ sessionId, testId, userId })` и тип `SessionFateRead`; реэкспорт в `index.ts`.
- `public.ts`: маршрут перед PATCH черновика: `validateUUID('id')` → `validateUUID('sessionId')` → `sessionRequired()` → `checkAttemptAccess` → `readSessionFate`; `missing` → `sessionNotFound(res)`; `submitted` дополняется `submitSource`, `uploadClosesAt` и `attempt` из `readAttemptView` с viewer ученика; `serverNow` из `databaseNow()` во всех трёх состояниях.
- `route-inventory.txt` перегенерирован.
- `attempt-deadline.test.ts`: блок «судьба сессии GET /sessions/:sessionId», 11 тестов.

## Состояние сессии → ответ

| Состояние сессии | Ответ |
|---|---|
| Открыта, в пределах лимита + льготы | 200 `{ state: 'open', sessionId, startedAt, serverNow }`, база не меняется |
| Тест без лимита, любой давности (D-03) | 200 `open` |
| Просрочена, черновик непустой | финализация → 200 `{ state: 'submitted', attemptId, submitSource: 'deadline', uploadClosesAt, serverNow, attempt }` |
| Просрочена, черновик пустой (D-04) | закрыта `expired` → 200 `{ state: 'expired', serverNow }` |
| Дедлайн + льгота больше 24 ч назад (D-21) | закрыта `expired`, черновик в строке → 200 `expired` |
| Ошибка данных финализации (R3) | закрыта `expired` → 200 `expired`, не 500 |
| Сдана вручную | 200 `submitted`, `submitSource: 'client'` |
| Уже финализирована сервером, повторное чтение | 200 `submitted` с тем же `attemptId` |
| Три параллельных чтения просроченной | один `attemptId`, одна попытка |
| Закрыта `superseded` / чужая / несуществующая | 404 `{ error: 'Session not found' }`, тела одинаковы, чужая не финализируется |
| Тест не назначен | 403 `{ error: 'Тест не назначен' }` до финализации |
| `sessionId` не UUID | 400 |

## Diff снимка маршрутов

`git diff --numstat HEAD -- app/server/route-inventory.txt` → `1	0`

```diff
 POST /api/tests/public/tests/:id/start  validateUUID(id) > sessionRequired > <anonymous>
+GET /api/tests/public/tests/:id/sessions/:sessionId  validateUUID(id) > validateUUID(sessionId) > sessionRequired > <anonymous>
 PATCH /api/tests/public/tests/:id/sessions/:sessionId/answers  validateUUID(id) > validateUUID(sessionId) > sessionRequired > <anonymous>
```

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/attempt-deadline.test.ts src/routes/route-inventory.snapshot.test.ts` — 2 файла, 46 тестов passed.
- `node --test scripts/attempt-integrity-guards.test.mjs scripts/teacher-zone-guards.test.mjs` — 27 pass, 0 fail.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server test` — 101 файл, 2010 тестов passed (до плана 1999: добавлено 11).
- `yarn verify` — `yarn verify: OK` (все шаги passed, включая `format-check`).
- `codegraph affected app/server/src/services/attempt-sessions/deadline.ts app/server/src/services/attempt-sessions/index.ts app/server/src/routes/tests/public.ts` (индекс основного checkout, в worktree `.codegraph/` нет) → «Affected test files (1): app/server/src/routes/tests/public.ts»; индекс не связывает HTTP-тесты с маршрутами, поэтому прогнан полный серверный набор.
- `11-plan-files.cjs check 11-07` не запускался: в режиме worktree проверку файлов плана делает ведущая сессия (11-EXEC-RULES.md).

## Deviations from Plan

None - plan executed exactly as written. Помощник GET взят из `test-support/auth-app.ts` (`call`) прямо в тесте, `attempt-world.ts` не менялся, чтобы не выходить за `files_modified`.

## Threat Flags

Нет: новый маршрут покрыт угрозами T-11-21…T-11-23 плана; тесты держат одинаковый 404 для чужой и несуществующей сессии и неизменность чужой сессии.

## Файлы к коммиту

- app/server/route-inventory.txt
- app/server/src/routes/tests/attempt-deadline.test.ts
- app/server/src/routes/tests/public.ts
- app/server/src/services/attempt-sessions/deadline.ts
- app/server/src/services/attempt-sessions/index.ts

Коммитов нет по правилу фазы: коммит делает ведущая сессия.

## Self-Check: PASSED
